import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Stripe from 'stripe';
import { Payment, Refund } from './schemas/payment.schema';
import { StripeService } from './stripe.service';
import { BookingRegistry } from '../../common/booking/booking-registry';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  BookingStatus, BookingType, NotificationType, PaymentStatus, PLATFORM_CURRENCY, RefundStatus, Role,
} from '../../common/enums';
import { notFound } from '../../common/utils/errors';
import { money, toCents } from '../../common/utils/refund';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePaymentDto } from './dto/payment.dto';

const ACTIVE_PAYMENT = [PaymentStatus.REQUIRES_PAYMENT, PaymentStatus.PROCESSING];

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Payment.name) private payments: Model<Payment>,
    @InjectModel(Refund.name) private refunds: Model<Refund>,
    private stripe: StripeService,
    private registry: BookingRegistry,
    private notifications: NotificationsService,
    private config: ConfigService,
  ) {}

  private serialize(p: any, clientSecret?: string | null, holdExpiresAt?: Date) {
    return {
      id: String(p._id),
      bookingType: p.bookingType,
      bookingId: String(p.booking),
      stripePaymentIntentId: p.stripePaymentIntentId,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      // PAY-01: on failure an error is shown and the user may retry until the hold expires.
      // (Derived from the status: nothing but id, amount, currency and status is stored.)
      ...(p.status === PaymentStatus.FAILED ? { message: 'Payment failed. You can retry until the booking hold expires.' } : {}),
      createdAt: p.createdAt,
      ...(clientSecret !== undefined ? { clientSecret } : {}),
      ...(clientSecret !== undefined ? { publishableKey: this.config.get('stripe.publishableKey') || null } : {}),
      ...(holdExpiresAt ? { holdExpiresAt } : {}),
    };
  }

  private mapIntentStatus(s: Stripe.PaymentIntent.Status): PaymentStatus {
    switch (s) {
      case 'succeeded':
        return PaymentStatus.SUCCEEDED;
      case 'processing':
        return PaymentStatus.PROCESSING;
      case 'canceled':
        return PaymentStatus.CANCELED;
      default:
        return PaymentStatus.REQUIRES_PAYMENT;
    }
  }

  private async assertPayable(type: BookingType, bookingId: string, user: AuthUser) {
    const handler = this.registry.get(type);
    const b = await handler.getPayable(bookingId);
    if (b.userId !== user.id) throw notFound('Booking');
    if (b.status !== BookingStatus.PENDING_PAYMENT) {
      throw new ConflictException({ message: `Booking is ${b.status}; only Pending Payment bookings can be paid` });
    }
    if (!b.holdExpiresAt || b.holdExpiresAt <= new Date()) {
      throw new ConflictException({ message: 'The hold for this booking has expired', code: 'HOLD_EXPIRED' });
    }
    if (!b.policyAccepted) {
      throw new BadRequestException({
        message: "You must accept the provider's policies before payment (PAY-02)",
        code: 'POLICIES_NOT_ACCEPTED',
      });
    }
    return { handler, booking: b };
  }

  private async createIntent(type: BookingType, booking: { id: string; amount: number; currency: string; userId: string }) {
    const intent = await this.stripe.client.paymentIntents.create({
      amount: toCents(booking.amount),
      currency: booking.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: { bookingType: type, bookingId: booking.id, userId: booking.userId },
      description: `${type === BookingType.FLIGHT ? 'Flight booking' : 'Hotel reservation'} ${booking.id}`,
    });
    const payment = await this.payments.create({
      user: booking.userId,
      bookingType: type,
      booking: booking.id,
      stripePaymentIntentId: intent.id,
      amount: booking.amount,
      currency: booking.currency,
      status: this.mapIntentStatus(intent.status),
    });
    return { payment, intent };
  }

  /** PAY-01: start (or resume) payment of a Pending Payment booking; returns the client secret for Stripe Elements. */
  async create(dto: CreatePaymentDto, user: AuthUser) {
    const { handler, booking } = await this.assertPayable(dto.bookingType, dto.bookingId, user);
    const existing = await this.payments
      .findOne({ bookingType: dto.bookingType, booking: dto.bookingId, status: { $in: ACTIVE_PAYMENT } })
      .sort({ createdAt: -1 });
    if (existing) {
      const intent = await this.stripe.client.paymentIntents.retrieve(existing.stripePaymentIntentId);
      if (intent.status !== 'canceled' && intent.status !== 'succeeded') {
        return this.serialize(existing, intent.client_secret, booking.holdExpiresAt);
      }
      existing.status = this.mapIntentStatus(intent.status);
      await existing.save();
    }
    const { payment, intent } = await this.createIntent(dto.bookingType, booking);
    await handler.attachPayment(booking.id, String(payment._id));
    return this.serialize(payment, intent.client_secret, booking.holdExpiresAt);
  }

  private async getOwned(id: string, user: AuthUser) {
    const p = await this.payments.findById(id);
    if (!p) throw notFound('Payment');
    if (String(p.user) !== user.id && user.role !== Role.ADMIN) throw notFound('Payment');
    return p;
  }

  /** PAY-01: after a failure the user may retry until the hold expires. */
  async retry(id: string, user: AuthUser) {
    const p = await this.getOwned(id, user);
    if (String(p.user) !== user.id) throw new ForbiddenException({ message: 'Only the booking owner can pay' });
    const { handler, booking } = await this.assertPayable(p.bookingType, String(p.booking), user);
    const intent = await this.stripe.client.paymentIntents.retrieve(p.stripePaymentIntentId);
    if (intent.status === 'succeeded') throw new ConflictException({ message: 'This payment has already succeeded' });
    if (intent.status !== 'canceled') {
      p.status = PaymentStatus.REQUIRES_PAYMENT;
      await p.save();
      return this.serialize(p, intent.client_secret, booking.holdExpiresAt);
    }
    p.status = PaymentStatus.CANCELED;
    await p.save();
    const created = await this.createIntent(p.bookingType, booking);
    await handler.attachPayment(booking.id, String(created.payment._id));
    return this.serialize(created.payment, created.intent.client_secret, booking.holdExpiresAt);
  }

  async get(id: string, user: AuthUser) {
    return this.serialize(await this.getOwned(id, user));
  }

  /**
   * Development / evaluation helper (approved assumption #4): confirms the PaymentIntent
   * server-side with one of Stripe's built-in test payment methods so the flow can be
   * demonstrated from Swagger. The booking is still confirmed ONLY by the webhook.
   */
  async testConfirm(id: string, user: AuthUser, paymentMethod = 'pm_card_visa') {
    const p = await this.getOwned(id, user);
    await this.assertPayable(p.bookingType, String(p.booking), user);
    try {
      const intent = await this.stripe.client.paymentIntents.confirm(p.stripePaymentIntentId, { payment_method: paymentMethod });
      p.status = this.mapIntentStatus(intent.status);
      await p.save();
      return {
        payment: this.serialize(p),
        stripeStatus: intent.status,
        note: 'Booking confirmation happens when the payment_intent.succeeded webhook is received.',
      };
    } catch (e: any) {
      p.status = PaymentStatus.FAILED;
      await p.save();
      throw new BadRequestException({ message: `Payment failed: ${e?.message ?? 'card declined'}`, code: 'PAYMENT_FAILED' });
    }
  }

  // ------------------------------------------------------------------ webhook (PAY-01, PAY-03)

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!rawBody || !signature) throw new BadRequestException({ message: 'Missing Stripe signature or body' });
    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(rawBody, signature);
    } catch (e: any) {
      throw new BadRequestException({ message: `Webhook signature verification failed: ${e.message}` });
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.onIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.payment_failed':
        await this.payments.updateOne(
          { stripePaymentIntentId: (event.data.object as Stripe.PaymentIntent).id, status: { $ne: PaymentStatus.SUCCEEDED } },
          { $set: { status: PaymentStatus.FAILED } },
        );
        break;
      case 'payment_intent.processing':
        await this.payments.updateOne(
          { stripePaymentIntentId: (event.data.object as Stripe.PaymentIntent).id },
          { $set: { status: PaymentStatus.PROCESSING } },
        );
        break;
      case 'payment_intent.canceled':
        await this.payments.updateOne(
          { stripePaymentIntentId: (event.data.object as Stripe.PaymentIntent).id },
          { $set: { status: PaymentStatus.CANCELED } },
        );
        break;
      case 'refund.created':
      case 'refund.updated':
      case 'refund.failed' as any:
        await this.onRefundUpdated(event.data.object as Stripe.Refund);
        break;
      case 'charge.refund.updated':
        await this.onRefundUpdated(event.data.object as Stripe.Refund);
        break;
      default:
        break;
    }
    return { received: true };
  }

  private async onIntentSucceeded(intent: Stripe.PaymentIntent) {
    const p = await this.payments.findOne({ stripePaymentIntentId: intent.id });
    if (!p) {
      this.logger.warn(`Webhook for unknown PaymentIntent ${intent.id}`);
      return;
    }
    p.status = PaymentStatus.SUCCEEDED;
    await p.save();
    const handler = this.registry.get(p.bookingType);
    const result = await handler.onPaymentSucceeded(String(p.booking), String(p._id));
    if (result === 'not_pending') {
      // Paid after the hold expired (or booking no longer pending): the booking stays
      // unconfirmed, so the money is returned in full (PDF 6.4).
      await this.issueRefund({
        bookingType: p.bookingType,
        bookingId: String(p.booking),
        userId: String(p.user),
        amount: p.amount,
        percent: 100,
        reason: 'Payment received after the booking hold expired',
        paymentId: String(p._id),
      });
    }
  }

  private async onRefundUpdated(r: Stripe.Refund) {
    const refund = await this.refunds.findOne({ stripeRefundId: r.id });
    if (!refund) return;
    const status =
      r.status === 'succeeded' ? RefundStatus.REFUNDED : r.status === 'failed' || r.status === 'canceled' ? RefundStatus.FAILED : RefundStatus.PENDING;
    if (status === refund.status) return;
    refund.status = status;
    await refund.save();
    if (status !== RefundStatus.PENDING) {
      await this.notifications.notify(
        refund.user,
        NotificationType.REFUND,
        status === RefundStatus.REFUNDED ? 'Refund completed' : 'Refund failed',
        `Your refund of ${refund.amount.toFixed(2)} ${refund.currency} is now ${status}.`,
        { refundId: String(refund._id), bookingType: refund.bookingType, bookingId: String(refund.booking) },
      );
    }
  }

  // ------------------------------------------------------------------ used by booking modules

  /** PAY-01: when a hold expires the PaymentIntent is cancelled. */
  async cancelIntentsForBooking(type: BookingType, bookingId: string | Types.ObjectId) {
    const open = await this.payments.find({ bookingType: type, booking: bookingId, status: { $in: ACTIVE_PAYMENT } });
    for (const p of open) {
      try {
        if (this.stripe.configured) await this.stripe.client.paymentIntents.cancel(p.stripePaymentIntentId);
      } catch (e: any) {
        this.logger.warn(`Could not cancel PaymentIntent ${p.stripePaymentIntentId}: ${e.message}`);
      }
      p.status = PaymentStatus.CANCELED;
      await p.save();
    }
  }

  /**
   * PAY-03: issue a refund through the Stripe Refunds API, record it and notify the user.
   * Returns null when there is nothing to refund (amount <= 0 or no successful payment).
   */
  async issueRefund(args: {
    bookingType: BookingType;
    bookingId: string;
    userId: string;
    amount: number;
    percent: number;
    reason: string;
    paymentId?: string;
  }) {
    const amount = money(args.amount);
    if (amount <= 0) return null;
    const payment = args.paymentId
      ? await this.payments.findById(args.paymentId)
      : await this.payments.findOne({ bookingType: args.bookingType, booking: args.bookingId, status: PaymentStatus.SUCCEEDED });
    if (!payment) {
      this.logger.warn(`No successful payment found for ${args.bookingType} booking ${args.bookingId}; refund skipped`);
      return null;
    }
    const refund = await this.refunds.create({
      payment: payment._id,
      user: args.userId,
      bookingType: args.bookingType,
      booking: args.bookingId,
      amount,
      percent: args.percent,
      currency: payment.currency ?? PLATFORM_CURRENCY,
      status: RefundStatus.PENDING,
      reason: args.reason,
    });
    try {
      const r = await this.stripe.client.refunds.create(
        {
          payment_intent: payment.stripePaymentIntentId,
          amount: toCents(amount),
          metadata: { refundId: String(refund._id), bookingType: args.bookingType, bookingId: args.bookingId },
        },
        { idempotencyKey: `refund-${refund._id}` },
      );
      refund.stripeRefundId = r.id;
      refund.status = r.status === 'succeeded' ? RefundStatus.REFUNDED : r.status === 'failed' ? RefundStatus.FAILED : RefundStatus.PENDING;
    } catch (e: any) {
      this.logger.error(`Stripe refund failed: ${e.message}`);
      refund.status = RefundStatus.FAILED;
    }
    await refund.save();
    await this.notifications.notify(
      args.userId,
      NotificationType.REFUND,
      'Refund issued',
      `A refund of ${amount.toFixed(2)} ${refund.currency} (${args.percent}%) was issued: ${args.reason}. Status: ${refund.status}.`,
      { refundId: String(refund._id), bookingType: args.bookingType, bookingId: args.bookingId },
    );
    return refund;
  }

  serializeRefund(r: any) {
    return r
      ? {
          id: String(r._id),
          bookingType: r.bookingType,
          bookingId: String(r.booking),
          paymentId: String(r.payment),
          amount: r.amount,
          percent: r.percent,
          currency: r.currency,
          status: r.status,
          reason: r.reason,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }
      : null;
  }

  /** PAY-03 */
  async getRefund(id: string, user: AuthUser) {
    const r = await this.refunds.findById(id).lean();
    if (!r || (String(r.user) !== user.id && user.role !== Role.ADMIN)) throw notFound('Refund');
    return this.serializeRefund(r);
  }

  async refundForBooking(refundId?: Types.ObjectId | string | null) {
    if (!refundId) return null;
    return this.serializeRefund(await this.refunds.findById(refundId).lean());
  }

  async paymentForBooking(paymentId?: Types.ObjectId | string | null) {
    if (!paymentId) return null;
    const p = await this.payments.findById(paymentId).lean();
    return p ? this.serialize(p) : null;
  }
}
