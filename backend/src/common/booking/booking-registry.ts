import { Global, Injectable, Module } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { BookingStatus, BookingType } from '../enums';
import { AuthUser } from '../decorators/current-user.decorator';

export interface PayableBooking {
  id: string;
  userId: string;
  status: BookingStatus;
  amount: number; // platform currency, major units
  currency: string;
  holdExpiresAt?: Date;
  policyAccepted: boolean;
  reference?: string;
  /** Payment linked to the booking (the one that confirmed it, once Confirmed). */
  paymentId?: string;
}

/**
 * Contract each booking module (flights, hotels) registers so that Payments (PAY-01..03)
 * can work with any booking type without a circular module dependency.
 */
export interface BookingHandler {
  getPayable(bookingId: string): Promise<PayableBooking>;
  getPolicies(bookingId: string, user: AuthUser): Promise<any>;
  acceptPolicies(bookingId: string, user: AuthUser): Promise<any>;
  /** Called after Stripe confirms the PaymentIntent succeeded (via webhook). */
  onPaymentSucceeded(bookingId: string, paymentId: string): Promise<'confirmed' | 'already' | 'not_pending'>;
  attachPayment(bookingId: string, paymentId: string): Promise<void>;
}

@Injectable()
export class BookingRegistry {
  private handlers = new Map<BookingType, BookingHandler>();

  register(type: BookingType, handler: BookingHandler) {
    this.handlers.set(type, handler);
  }

  get(type: string): BookingHandler {
    const h = this.handlers.get(type as BookingType);
    if (!h) throw new BadRequestException({ message: `Unknown booking type "${type}" (use "flight" or "hotel")`, field: 'type' });
    return h;
  }
}

@Global()
@Module({ providers: [BookingRegistry], exports: [BookingRegistry] })
export class BookingRegistryModule {}
