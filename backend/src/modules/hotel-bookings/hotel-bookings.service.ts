import { BadRequestException, ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { HotelReservation, HotelReservationDocument } from './schemas/hotel-reservation.schema';
import { Hotel } from '../hotels/schemas/hotel.schema';
import { User, displayName } from '../users/schemas/user.schema';
import { HotelsService } from '../hotels/hotels.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BookingHandler, BookingRegistry, PayableBooking } from '../../common/booking/booking-registry';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { BookingStatus, BookingType, HOLD_MINUTES, NotificationType, PLATFORM_CURRENCY, Role } from '../../common/enums';
import { HotelBookingRequestDto, HotelReservationsQueryDto } from './dto/hotel-booking.dto';
import { formatDateOnly, parseDateOnly, todayUtc } from '../../common/utils/dates';
import { money, selectRefundPercent, wholeDaysUntil } from '../../common/utils/refund';
import { generateBookingReference } from '../../common/utils/reference-code';
import { isDuplicateKeyError, notFound } from '../../common/utils/errors';
import { paginateQuery } from '../../common/utils/pagination';

@Injectable()
export class HotelBookingsService implements OnModuleInit, BookingHandler {
  constructor(
    @InjectModel(HotelReservation.name) private reservations: Model<HotelReservation>,
    @InjectModel(Hotel.name) private hotels: Model<Hotel>,
    @InjectModel(User.name) private users: Model<User>,
    private hotelsService: HotelsService,
    private payments: PaymentsService,
    private notifications: NotificationsService,
    private registry: BookingRegistry,
  ) {}

  onModuleInit() {
    this.registry.register(BookingType.HOTEL, this);
  }

  // ------------------------------------------------------------------ create + hold (HTL-16, HTL-18)

  async create(dto: HotelBookingRequestDto, user: AuthUser) {
    await this.expireHolds();
    const hotel = await this.hotelsService.getHotel(dto.hotelId);
    if (!hotel.active) throw new BadRequestException({ message: 'This hotel is not accepting bookings (ACC-15)' });
    const stay = this.hotelsService.parseStay(dto.checkIn, dto.checkOut);

    const ids = dto.rooms.map((r) => r.roomId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException({ message: 'Each room can be selected only once', field: 'rooms' });
    }
    const rooms = await this.hotelsService.roomsByIds(dto.hotelId, ids);
    if (rooms.length !== ids.length) {
      throw new BadRequestException({ message: 'All rooms must belong to the selected hotel', field: 'rooms' });
    }
    const roomMap = new Map(rooms.map((r) => [String(r._id), r]));
    let totalAdults = 0;
    dto.rooms.forEach((rq, i) => {
      const r = roomMap.get(rq.roomId)!;
      const kids = rq.childrenAges?.length ?? 0;
      if (!r.active) throw new BadRequestException({ message: `Room ${r.number} is not available`, field: `rooms.${i}.roomId` });
      if (rq.adults + kids < 1) throw new BadRequestException({ message: `Assign at least one guest to room ${r.number}`, field: `rooms.${i}.adults` });
      if (rq.adults + kids > r.maxOccupancy) {
        throw new BadRequestException({
          message: `Room ${r.number} allows at most ${r.maxOccupancy} guest(s)`,
          field: `rooms.${i}`,
        });
      }
      const covered = stay.dates.every((d) => r.availability.some((a) => d >= a.from && d <= a.to));
      if (!covered) {
        throw new ConflictException({ message: `Room ${r.number} is not bookable for the whole stay`, field: `rooms.${i}.roomId` });
      }
      totalAdults += rq.adults;
    });
    if (totalAdults < 1) throw new BadRequestException({ message: 'Each reservation needs at least one adult', field: 'rooms' });

    const reservedRooms = dto.rooms.map((rq) => {
      const r = roomMap.get(rq.roomId)!;
      return {
        room: r._id,
        number: r.number,
        type: r.type,
        beds: r.beds,
        maxOccupancy: r.maxOccupancy,
        pricePerNight: r.pricePerNight,
        adults: rq.adults,
        childrenAges: rq.childrenAges ?? [],
        subtotal: money(stay.nights * r.pricePerNight),
      };
    });
    const total = money(reservedRooms.reduce((s, r) => s + r.subtotal, 0));
    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60000);
    const reservationId = new Types.ObjectId();

    const locked = await this.hotelsService.lockRooms(
      reservationId,
      hotel._id,
      rooms.map((r) => r._id),
      stay.dates,
      holdExpiresAt,
    );
    if (!locked) {
      throw new ConflictException({
        message: 'One or more selected rooms are no longer free for these dates; nothing was held (HTL-18)',
        code: 'ROOMS_UNAVAILABLE',
      });
    }
    try {
      const res = await this.reservations.create({
        _id: reservationId,
        user: user.id,
        hotel: hotel._id,
        status: BookingStatus.PENDING_PAYMENT,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        nights: stay.nights,
        rooms: reservedRooms,
        total,
        currency: PLATFORM_CURRENCY,
        holdExpiresAt,
      });
      return this.serialize(res, user);
    } catch (e) {
      await this.hotelsService.releaseLocks(reservationId);
      throw e;
    }
  }

  // ------------------------------------------------------------------ read (HTL-20, HTL-22, ACC-11)

  async serialize(r: any, viewer?: AuthUser) {
    const hotel = await this.hotels.findById(r.hotel).lean();
    return {
      id: String(r._id),
      type: BookingType.HOTEL,
      reference: r.reference ?? null,
      status: r.status,
      hotel: hotel
        ? {
            id: String(hotel._id), name: hotel.name, address: hotel.address, cityId: hotel.cityId,
            countryCode: hotel.countryCode, checkInTime: hotel.checkInTime, checkOutTime: hotel.checkOutTime,
          }
        : null,
      checkIn: formatDateOnly(r.checkIn),
      checkOut: formatDateOnly(r.checkOut),
      nights: r.nights,
      rooms: r.rooms.map((x: any) => ({
        roomId: String(x.room), number: x.number, type: x.type, beds: x.beds, maxOccupancy: x.maxOccupancy,
        pricePerNight: x.pricePerNight, adults: x.adults, childrenAges: x.childrenAges, subtotal: x.subtotal,
      })),
      guests: {
        adults: r.rooms.reduce((s: number, x: any) => s + x.adults, 0),
        children: r.rooms.reduce((s: number, x: any) => s + (x.childrenAges?.length ?? 0), 0),
      },
      total: r.total,
      currency: r.currency,
      holdExpiresAt: r.status === BookingStatus.PENDING_PAYMENT ? r.holdExpiresAt : null,
      policyAcceptance: r.policyAcceptance ?? null,
      payment: viewer?.role === Role.HOTEL_MODERATOR ? undefined : await this.payments.paymentForBooking(r.payment),
      refund: viewer?.role === Role.HOTEL_MODERATOR ? undefined : await this.payments.refundForBooking(r.refund),
      userId: String(r.user?._id ?? r.user),
      confirmedAt: r.confirmedAt ?? null,
      cancelledAt: r.cancelledAt ?? null,
      createdAt: r.createdAt,
    };
  }

  groupFilter(group: 'upcoming' | 'past' | 'cancelled') {
    const today = todayUtc();
    if (group === 'cancelled') return { status: { $in: [BookingStatus.CANCELLED, BookingStatus.EXPIRED] } };
    if (group === 'past') {
      return { $or: [{ status: BookingStatus.COMPLETED }, { status: BookingStatus.CONFIRMED, checkOut: { $lt: today } }] };
    }
    return { status: { $in: [BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED] }, checkOut: { $gte: today } };
  }

  /** HTL-20 */
  async listMine(user: AuthUser, group: 'upcoming' | 'past' | 'cancelled' = 'upcoming', page = 1) {
    await this.completePastStays();
    const res = await paginateQuery(this.reservations, { user: user.id, ...this.groupFilter(group) }, page, {
      checkIn: group === 'upcoming' ? 1 : -1,
    });
    const counts = {
      upcoming: await this.reservations.countDocuments({ user: user.id, ...this.groupFilter('upcoming') }),
      past: await this.reservations.countDocuments({ user: user.id, ...this.groupFilter('past') }),
      cancelled: await this.reservations.countDocuments({ user: user.id, ...this.groupFilter('cancelled') }),
    };
    return {
      group,
      counts,
      ...res,
      items: await Promise.all(
        res.items.map(async (r: any) => {
          const v = await this.serialize(r, user);
          return {
            id: v.id, reference: v.reference, status: v.status, hotel: v.hotel?.name, rooms: v.rooms.map((x: any) => x.number),
            checkIn: v.checkIn, checkOut: v.checkOut, guests: v.guests, total: v.total, currency: v.currency,
            holdExpiresAt: v.holdExpiresAt,
          };
        }),
      ),
    };
  }

  private async getAccessible(id: string, user: AuthUser): Promise<HotelReservationDocument> {
    await this.completePastStays();
    const r = await this.reservations.findById(id);
    if (!r) throw notFound('Hotel reservation');
    const ok =
      String(r.user) === user.id ||
      user.role === Role.ADMIN ||
      (user.role === Role.HOTEL_MODERATOR && user.hotelId === String(r.hotel));
    if (!ok) throw notFound('Hotel reservation');
    return r;
  }

  async details(id: string, user: AuthUser) {
    return this.serialize(await this.getAccessible(id, user), user);
  }

  /** HTL-22 */
  async hotelReservations(hotelId: string, q: HotelReservationsQueryDto, user: AuthUser) {
    this.hotelsService.assertModerator(user, hotelId);
    const filter: any = { hotel: hotelId };
    if (q.status) filter.status = q.status;
    if (q.from) filter.checkOut = { $gt: parseDateOnly(q.from, 'from') };
    if (q.to) filter.checkIn = { $lte: parseDateOnly(q.to, 'to') };
    const res = await paginateQuery(this.reservations, filter, q.page, { checkIn: 1 }, { path: 'user', select: 'name email status' });
    return {
      ...res,
      items: res.items.map((r: any) => ({
        id: String(r._id),
        reference: r.reference ?? null,
        guest: displayName(r.user),
        guestEmail: r.user?.status === 'deactivated' ? null : r.user?.email,
        checkIn: formatDateOnly(r.checkIn),
        checkOut: formatDateOnly(r.checkOut),
        rooms: r.rooms.map((x: any) => x.number),
        guests: {
          adults: r.rooms.reduce((s: number, x: any) => s + x.adults, 0),
          children: r.rooms.reduce((s: number, x: any) => s + (x.childrenAges?.length ?? 0), 0),
        },
        status: r.status,
        total: r.total,
      })),
    };
  }

  // ------------------------------------------------------------------ BookingHandler (PAY-01, PAY-02)

  async getPayable(bookingId: string): Promise<PayableBooking> {
    const r = await this.reservations.findById(bookingId).lean();
    if (!r) throw notFound('Hotel reservation');
    return {
      id: String(r._id), userId: String(r.user), status: r.status, amount: r.total, currency: r.currency,
      holdExpiresAt: r.holdExpiresAt, policyAccepted: !!r.policyAcceptance?.acceptedAt, reference: r.reference,
    };
  }

  private async policiesFor(r: HotelReservationDocument) {
    const h = await this.hotels.findById(r.hotel).lean();
    return {
      bookingType: BookingType.HOTEL,
      bookingId: String(r._id),
      hotel: h ? { id: String(h._id), name: h.name } : null,
      checkInTime: h?.checkInTime,
      checkOutTime: h?.checkOutTime,
      cancellationPolicy: [...(h?.cancellationTiers ?? [])].sort((a, b) => b.daysBefore - a.daysBefore),
      total: r.total,
      currency: r.currency,
    };
  }

  async getPolicies(bookingId: string, user: AuthUser) {
    const r = await this.reservations.findById(bookingId);
    if (!r || String(r.user) !== user.id) throw notFound('Hotel reservation');
    return { ...(await this.policiesFor(r)), acceptedAt: r.policyAcceptance?.acceptedAt ?? null };
  }

  async acceptPolicies(bookingId: string, user: AuthUser) {
    const r = await this.reservations.findById(bookingId);
    if (!r || String(r.user) !== user.id) throw notFound('Hotel reservation');
    if (r.status !== BookingStatus.PENDING_PAYMENT) {
      throw new ConflictException({ message: 'Policies can only be accepted for Pending Payment reservations' });
    }
    r.policyAcceptance = { acceptedAt: new Date(), policies: await this.policiesFor(r) };
    await r.save();
    return { bookingId: String(r._id), acceptedAt: r.policyAcceptance.acceptedAt };
  }

  async attachPayment(bookingId: string, paymentId: string) {
    await this.reservations.updateOne({ _id: bookingId }, { $set: { payment: paymentId } });
  }

  /** HTL-17 */
  async onPaymentSucceeded(bookingId: string, paymentId: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const r = await this.reservations.findOneAndUpdate(
          { _id: bookingId, status: BookingStatus.PENDING_PAYMENT, holdExpiresAt: { $gt: new Date() } },
          {
            $set: {
              status: BookingStatus.CONFIRMED,
              reference: generateBookingReference('HT'),
              confirmedAt: new Date(),
              payment: new Types.ObjectId(paymentId),
            },
          },
          { new: true },
        );
        if (!r) {
          const cur = await this.reservations.findById(bookingId).lean();
          return cur?.status === BookingStatus.CONFIRMED ? 'already' : 'not_pending';
        }
        await this.hotelsService.confirmLocks(r._id);
        const hotel = await this.hotels.findById(r.hotel).lean();
        await this.notifications.notify(
          r.user,
          NotificationType.BOOKING_CONFIRMED,
          `Hotel reservation ${r.reference} confirmed`,
          `Your reservation ${r.reference} at ${hotel?.name ?? 'the hotel'} (${r.rooms.length} room(s), ${formatDateOnly(r.checkIn)} to ${formatDateOnly(r.checkOut)}) is confirmed. Total paid: ${r.total.toFixed(2)} ${r.currency}.`,
          { bookingType: BookingType.HOTEL, bookingId: String(r._id), reference: r.reference },
        );
        return 'confirmed';
      } catch (e) {
        if (isDuplicateKeyError(e)) continue;
        throw e;
      }
    }
    throw new ConflictException({ message: 'Could not generate a unique booking reference' });
  }

  // ------------------------------------------------------------------ expiry & completion (HTL-18, HTL-23, GEN-11)

  @Cron(CronExpression.EVERY_30_SECONDS)
  async expireHolds() {
    const due = await this.reservations
      .find({ status: BookingStatus.PENDING_PAYMENT, holdExpiresAt: { $lte: new Date() } })
      .select('_id')
      .lean();
    for (const { _id } of due) {
      const r = await this.reservations.findOneAndUpdate(
        { _id, status: BookingStatus.PENDING_PAYMENT },
        { $set: { status: BookingStatus.EXPIRED, expiredAt: new Date() } },
      );
      if (!r) continue;
      await this.hotelsService.releaseLocks(_id);
      await this.payments.cancelIntentsForBooking(BookingType.HOTEL, _id);
    }
  }

  /** HTL-23: a Confirmed reservation becomes Completed once its check-out date has passed. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async completePastStays() {
    await this.reservations.updateMany(
      { status: BookingStatus.CONFIRMED, checkOut: { $lt: todayUtc() } },
      { $set: { status: BookingStatus.COMPLETED, completedAt: new Date() } },
    );
  }

  // ------------------------------------------------------------------ cancellation (HTL-21)

  private async assertCancellable(id: string, user: AuthUser) {
    const r = await this.reservations.findById(id);
    if (!r || String(r.user) !== user.id) throw notFound('Hotel reservation');
    if (r.status !== BookingStatus.CONFIRMED) {
      throw new ConflictException({ message: `Only Confirmed reservations can be cancelled (current status: ${r.status})` });
    }
    if (todayUtc() >= r.checkIn) throw new ConflictException({ message: 'Cancellation is only possible before the check-in date (HTL-21)' });
    const hotel = await this.hotels.findById(r.hotel).lean();
    const days = wholeDaysUntil(r.checkIn);
    const percent = selectRefundPercent(hotel?.cancellationTiers ?? [], days);
    return { r, hotel, quote: { daysBeforeCheckIn: days, refundPercent: percent, refundAmount: money((r.total * percent) / 100) } };
  }

  async cancellationPreview(id: string, user: AuthUser) {
    const { r, hotel, quote } = await this.assertCancellable(id, user);
    return {
      bookingId: String(r._id), reference: r.reference, total: r.total, currency: r.currency, ...quote,
      cancellationPolicy: [...(hotel?.cancellationTiers ?? [])].sort((a, b) => b.daysBefore - a.daysBefore),
    };
  }

  async cancel(id: string, user: AuthUser) {
    const { r, quote } = await this.assertCancellable(id, user);
    const updated = await this.reservations.findOneAndUpdate(
      { _id: r._id, status: BookingStatus.CONFIRMED },
      { $set: { status: BookingStatus.CANCELLED, cancelledAt: new Date(), cancelledBy: 'user' } },
      { new: true },
    );
    if (!updated) throw new ConflictException({ message: 'Reservation status changed; please refresh' });
    await this.hotelsService.releaseLocks(updated._id);
    const refund = await this.payments.issueRefund({
      bookingType: BookingType.HOTEL,
      bookingId: String(updated._id),
      userId: String(updated.user),
      amount: quote.refundAmount,
      percent: quote.refundPercent,
      reason: `Cancellation of hotel reservation ${updated.reference} ${quote.daysBeforeCheckIn} day(s) before check-in`,
    });
    if (refund) {
      updated.refund = refund._id as Types.ObjectId;
      await updated.save();
    }
    await this.notifications.notify(
      updated.user,
      NotificationType.BOOKING_CANCELLED,
      `Hotel reservation ${updated.reference} cancelled`,
      `Your reservation ${updated.reference} was cancelled. Refund: ${quote.refundAmount.toFixed(2)} ${updated.currency} (${quote.refundPercent}%).`,
      { bookingType: BookingType.HOTEL, bookingId: String(updated._id), reference: updated.reference },
    );
    return { booking: await this.serialize(updated, user), ...quote };
  }
}
