export enum Role {
  USER = 'user',
  ADMIN = 'admin',
  AIRLINE_MODERATOR = 'airline_moderator',
  HOTEL_MODERATOR = 'hotel_moderator',
}

export enum AccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DEACTIVATED = 'deactivated',
}

/** GEN-11 booking lifecycle (shared by flight bookings and hotel reservations). */
export enum BookingStatus {
  PENDING_PAYMENT = 'Pending Payment',
  CONFIRMED = 'Confirmed',
  COMPLETED = 'Completed',
  EXPIRED = 'Expired',
  CANCELLED = 'Cancelled',
}

/** FLT-30 */
export enum FlightStatus {
  SCHEDULED = 'Scheduled',
  CANCELLED = 'Cancelled',
  DEPARTED = 'Departed',
}

/** FLT-04 fixed set */
export enum CabinClass {
  ECONOMY = 'Economy',
  PREMIUM_ECONOMY = 'Premium Economy',
  BUSINESS = 'Business',
  FIRST = 'First',
}

/** FLT-12 (b) */
export enum PassengerType {
  ADULT = 'adult',
  CHILD = 'child',
  INFANT = 'infant',
}

export enum BookingType {
  FLIGHT = 'flight',
  HOTEL = 'hotel',
}

export enum PaymentStatus {
  REQUIRES_PAYMENT = 'requires_payment',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

/** PAY-03 */
export enum RefundStatus {
  PENDING = 'Pending',
  REFUNDED = 'Refunded',
  FAILED = 'Failed',
}

export enum Visibility {
  PUBLIC = 'Public',
  PRIVATE = 'Private',
}

export enum PostStatus {
  DRAFT = 'Draft',
  PUBLISHED = 'Published',
}

/** GEN-09 */
export enum ReportTargetType {
  POST = 'post',
  COMMENT = 'comment',
  REVIEW = 'review',
  ITINERARY = 'itinerary',
}

export enum ReportStatus {
  OPEN = 'open',
  DISMISSED = 'dismissed',
  HIDDEN = 'hidden',
  DELETED = 'deleted',
}

/** ITN-14 categories */
export enum BudgetCategory {
  FOOD = 'food',
  ACCOMMODATION = 'accommodation',
  IN_CITY_TRANSPORT = 'in_city_transport',
  ACTIVITIES = 'activities',
}

export enum NotificationType {
  BOOKING_CONFIRMED = 'booking_confirmed',
  BOOKING_CANCELLED = 'booking_cancelled',
  REFUND = 'refund',
  FLIGHT_SCHEDULE_CHANGE = 'flight_schedule_change',
  ACCOUNT_SUSPENDED = 'account_suspended',
  ACCOUNT_REACTIVATED = 'account_reactivated',
  PROVIDER_DEACTIVATED = 'provider_deactivated',
  PROVIDER_REACTIVATED = 'provider_reactivated',
}

/** PAY-04: single platform currency (decided by the team: USD). */
export const PLATFORM_CURRENCY = 'USD';

/** GEN-08 */
export const MAX_IMAGES_PER_ENTITY = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** GEN-05 */
export const PAGE_SIZE = 10;

/** FLT-22 / HTL-18 */
export const HOLD_MINUTES = 10;

/** Sanity limits that reject absurd values (typos, test junk) with a clear 400. */
export const LIMITS = {
  MAX_PRICE: 100000, // any single price (seat, night, extra bag), platform currency
  MAX_AMOUNT: 1000000000, // itinerary budget / cost / transport amount, any currency
  MAX_CABIN_SEATS: 1000,
  MAX_BAGS: 10,
  MAX_BAG_WEIGHT_KG: 100,
  MAX_ROOM_OCCUPANCY: 20,
  MAX_ROOM_BEDS: 20,
  MAX_FLIGHT_HOURS: 24,
  MAX_SCHEDULE_YEARS_AHEAD: 3,
};
