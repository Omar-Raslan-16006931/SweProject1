import { BadRequestException, ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { FlightBooking, FlightBookingDocument } from './schemas/flight-booking.schema';
import { Flight } from '../flights/schemas/flight.schema';
import { Airline } from '../flights/schemas/airline.schema';
import { FlightsService } from '../flights/flights.service';
import { AirlinesService } from '../flights/airlines.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReferenceService } from '../reference/reference.service';
import { BookingHandler, BookingRegistry, PayableBooking } from '../../common/booking/booking-registry';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  BookingStatus, BookingType, CabinClass, FlightStatus, HOLD_MINUTES, NotificationType, PassengerType,
  PLATFORM_CURRENCY, Role,
} from '../../common/enums';
import { FlightBookingRequestDto, PassengerDto } from './dto/flight-booking.dto';
import { ageOn, parseDateOnly, utcToLocalIso } from '../../common/utils/dates';
import { money, selectRefundPercent, wholeDaysUntil } from '../../common/utils/refund';
import { generateBookingReference } from '../../common/utils/reference-code';
import { forbidden, isDuplicateKeyError, notFound } from '../../common/utils/errors';
import { paginateQuery } from '../../common/utils/pagination';

/** FLT-19: sanity limit for dates of birth. */
const MAX_PASSENGER_AGE = 120;

interface PricedSegment {
  flight: any;
  airline: any;
  direction: 'outbound' | 'return';
  cabin: any;
  cabinClass: CabinClass;
  seats: number;
  fare: number;
  baggageFee: number;
}

@Injectable()
export class FlightBookingsService implements OnModuleInit, BookingHandler {
  private readonly logger = new Logger(FlightBookingsService.name);

  constructor(
    @InjectModel(FlightBooking.name) private bookings: Model<FlightBooking>,
    @InjectModel(Flight.name) private flights: Model<Flight>,
    @InjectModel(Airline.name) private airlines: Model<Airline>,
    private flightsService: FlightsService,
    private airlinesService: AirlinesService,
    private payments: PaymentsService,
    private notifications: NotificationsService,
    private ref: ReferenceService,
    private registry: BookingRegistry,
  ) {}

  onModuleInit() {
    this.registry.register(BookingType.FLIGHT, this);
  }

  // ------------------------------------------------------------------ validation & pricing (FLT-12, FLT-19, FLT-21)

  private validatePassengers(passengers: PassengerDto[], travelDate: Date) {
    const counts = { adult: 0, child: 0, infant: 0 };
    const passports = new Set<string>();
    passengers.forEach((p, i) => {
      const dob = parseDateOnly(p.dateOfBirth, `passengers.${i}.dateOfBirth`);
      if (dob > new Date()) {
        throw new BadRequestException({ message: 'Date of birth cannot be in the future', field: `passengers.${i}.dateOfBirth` });
      }
      if (ageOn(dob, new Date()) > MAX_PASSENGER_AGE) {
        throw new BadRequestException({ message: `Date of birth is not realistic (older than ${MAX_PASSENGER_AGE} years)`, field: `passengers.${i}.dateOfBirth` });
      }
      const passport = p.passportNumber.trim().toUpperCase();
      if (passports.has(passport)) {
        throw new BadRequestException({ message: 'Each passenger must have a different passport/ID number', field: `passengers.${i}.passportNumber` });
      }
      passports.add(passport);
      const age = ageOn(dob, travelDate);
      const expected = age >= 12 ? PassengerType.ADULT : age >= 2 ? PassengerType.CHILD : PassengerType.INFANT;
      if (expected !== p.type) {
        throw new BadRequestException({
          message: `Passenger ${i + 1} (${p.fullName}) is ${age} on the travel date and must be booked as ${expected} (adult 12+, child 2-11, infant <2)`,
          field: `passengers.${i}.type`,
        });
      }
      counts[p.type]++;
    });
    if (counts.adult < 1) throw new BadRequestException({ message: 'Each booking needs at least one adult', field: 'passengers' });
    if (counts.infant > counts.adult) {
      throw new BadRequestException({ message: 'There cannot be more infants than adults', field: 'passengers' });
    }
    return counts;
  }

  private async loadSegment(flightId: string, cabinClass: CabinClass, direction: 'outbound' | 'return') {
    const flight = await this.flights.findById(flightId).lean();
    if (!flight) throw notFound(`${direction === 'outbound' ? 'Outbound' : 'Return'} flight`);
    if (flight.status !== FlightStatus.SCHEDULED || flight.departureTime <= new Date()) {
      throw new BadRequestException({ message: `Flight ${flight.flightNumber} is not bookable (only Scheduled flights, FLT-30)` });
    }
    const airline = await this.airlines.findById(flight.airline).lean();
    if (!airline || !airline.active) {
      throw new BadRequestException({ message: `Flight ${flight.flightNumber} cannot be booked: its airline is not active (ACC-15)` });
    }
    const cabin = flight.cabins.find((c) => c.class === cabinClass);
    if (!cabin) throw new BadRequestException({ message: `Flight ${flight.flightNumber} has no ${cabinClass} cabin` });
    return { flight, airline, cabin };
  }

  /** Validates the request and prices it without touching inventory. */
  private async price(dto: FlightBookingRequestDto) {
    const out = await this.loadSegment(dto.outboundFlightId, dto.outboundCabinClass, 'outbound');
    const legs: Array<typeof out & { direction: 'outbound' | 'return'; cabinClass: CabinClass }> = [
      { ...out, direction: 'outbound', cabinClass: dto.outboundCabinClass },
    ];
    if (dto.returnFlightId || dto.returnCabinClass) {
      if (!dto.returnFlightId || !dto.returnCabinClass) {
        throw new BadRequestException({ message: 'Round trips need both returnFlightId and returnCabinClass', field: 'returnFlightId' });
      }
      const ret = await this.loadSegment(dto.returnFlightId, dto.returnCabinClass, 'return');
      if (ret.flight.departureAirport !== out.flight.arrivalAirport || ret.flight.arrivalAirport !== out.flight.departureAirport) {
        throw new BadRequestException({ message: 'The return flight must fly the reverse route of the outbound flight', field: 'returnFlightId' });
      }
      if (ret.flight.departureTime <= out.flight.arrivalTime) {
        throw new BadRequestException({ message: 'The return flight must depart after the outbound flight arrives', field: 'returnFlightId' });
      }
      legs.push({ ...ret, direction: 'return', cabinClass: dto.returnCabinClass });
    }

    const counts = this.validatePassengers(dto.passengers, out.flight.departureTime);
    const seats = counts.adult + counts.child; // infants occupy no seat

    const segments: PricedSegment[] = legs.map((leg) => {
      const bp = leg.airline.baggagePolicy ?? { extraBagPrice: null, maxExtraBags: 0 };
      let bags = 0;
      dto.passengers.forEach((p, i) => {
        const n = p.extraBags?.length ?? 0;
        if (n === 0) return;
        if (!bp.extraBagPrice || bp.maxExtraBags === 0) {
          throw new BadRequestException({
            message: `${leg.airline.name} does not offer extra baggage`,
            field: `passengers.${i}.extraBags`,
          });
        }
        if (n > bp.maxExtraBags) {
          throw new BadRequestException({
            message: `At most ${bp.maxExtraBags} extra bag(s) per passenger on ${leg.airline.name}`,
            field: `passengers.${i}.extraBags`,
          });
        }
        p.extraBags!.forEach((b, j) => {
          if (b.weightKg > leg.cabin.maxBagWeightKg) {
            throw new BadRequestException({
              message: `Extra bags may weigh at most ${leg.cabin.maxBagWeightKg} kg (same as the cabin allowance, FLT-08)`,
              field: `passengers.${i}.extraBags.${j}.weightKg`,
            });
          }
        });
        bags += n;
      });
      const fare = money(seats * leg.cabin.price + counts.infant * leg.cabin.price * 0.1);
      // Approved assumption #2: extra-baggage fee charged per segment at that segment airline's price.
      const baggageFee = money(bags * (bp.extraBagPrice ?? 0));
      return {
        flight: leg.flight, airline: leg.airline, direction: leg.direction, cabin: leg.cabin,
        cabinClass: leg.cabinClass, seats, fare, baggageFee,
      };
    });

    const fareTotal = money(segments.reduce((s, x) => s + x.fare, 0));
    const baggageTotal = money(segments.reduce((s, x) => s + x.baggageFee, 0));
    return { segments, counts, seats, fareTotal, baggageTotal, total: money(fareTotal + baggageTotal) };
  }

  private async summaryView(dto: FlightBookingRequestDto, priced: Awaited<ReturnType<FlightBookingsService['price']>>) {
    const airports = new Map((await this.ref.listAirports()).map((a: any) => [a._id, a]));
    return {
      tripType: priced.segments.length === 2 ? 'round-trip' : 'one-way',
      segments: priced.segments.map((s) => ({
        direction: s.direction,
        flightId: String(s.flight._id),
        flightNumber: s.flight.flightNumber,
        airline: { id: String(s.airline._id), name: s.airline.name, code: s.airline.code },
        departureAirport: s.flight.departureAirport,
        arrivalAirport: s.flight.arrivalAirport,
        departureLocalTime: utcToLocalIso(s.flight.departureTime, airports.get(s.flight.departureAirport).timeZone),
        arrivalLocalTime: utcToLocalIso(s.flight.arrivalTime, airports.get(s.flight.arrivalAirport).timeZone),
        cabinClass: s.cabinClass,
        seatPrice: s.cabin.price,
        seats: s.seats,
        seatsRemaining: s.cabin.available,
        freeBags: s.cabin.freeBags,
        maxBagWeightKg: s.cabin.maxBagWeightKg,
        extraBagPrice: s.airline.baggagePolicy?.extraBagPrice ?? null,
        fare: s.fare,
        baggageFee: s.baggageFee,
      })),
      passengers: dto.passengers.map((p) => ({
        fullName: p.fullName, dateOfBirth: p.dateOfBirth, type: p.type, extraBags: p.extraBags ?? [],
      })),
      passengerCounts: priced.counts,
      fareTotal: priced.fareTotal,
      baggageTotal: priced.baggageTotal,
      total: priced.total,
      currency: PLATFORM_CURRENCY,
    };
  }

  /** FLT-19 / FLT-21: validate passengers & baggage and return the booking summary (no seats are held yet). */
  async summary(dto: FlightBookingRequestDto) {
    const priced = await this.price(dto);
    return this.summaryView(dto, priced);
  }

  // ------------------------------------------------------------------ hold (FLT-22)

  /** FLT-22: atomically hold seats and create a Pending Payment booking held for 10 minutes. */
  async hold(dto: FlightBookingRequestDto, user: AuthUser) {
    await this.expireHolds();
    const priced = await this.price(dto);
    const held: PricedSegment[] = [];
    try {
      for (const s of priced.segments) {
        const ok = await this.flightsService.holdSeats(s.flight._id, s.cabinClass, s.seats);
        if (!ok) {
          throw new ConflictException({
            message: `Not enough ${s.cabinClass} seats left on flight ${s.flight.flightNumber}`,
            code: 'INSUFFICIENT_SEATS',
          });
        }
        held.push(s);
      }
      const departures = priced.segments.map((s) => new Date(s.flight.departureTime).getTime());
      const booking = await this.bookings.create({
        user: user.id,
        status: BookingStatus.PENDING_PAYMENT,
        tripType: priced.segments.length === 2 ? 'round-trip' : 'one-way',
        segments: priced.segments.map((s) => ({
          flight: s.flight._id,
          airline: s.airline._id,
          direction: s.direction,
          flightNumber: s.flight.flightNumber,
          departureAirport: s.flight.departureAirport,
          arrivalAirport: s.flight.arrivalAirport,
          departureTime: s.flight.departureTime,
          arrivalTime: s.flight.arrivalTime,
          cabinClass: s.cabinClass,
          seatPrice: s.cabin.price,
          seats: s.seats,
          freeBags: s.cabin.freeBags,
          maxBagWeightKg: s.cabin.maxBagWeightKg,
          extraBagPrice: s.airline.baggagePolicy?.extraBagPrice ?? 0,
          fare: s.fare,
          baggageFee: s.baggageFee,
        })),
        passengers: dto.passengers.map((p) => ({
          fullName: p.fullName,
          dateOfBirth: parseDateOnly(p.dateOfBirth),
          passportNumber: p.passportNumber.toUpperCase(),
          type: p.type,
          extraBags: p.extraBags ?? [],
        })),
        fareTotal: priced.fareTotal,
        baggageTotal: priced.baggageTotal,
        total: priced.total,
        currency: PLATFORM_CURRENCY,
        // FLT-22 / FLT-30: a hold never outlives the first departure (a departed flight cannot be bought).
        holdExpiresAt: new Date(Math.min(Date.now() + HOLD_MINUTES * 60000, Math.min(...departures))),
        travelDate: new Date(Math.min(...departures)),
        lastDepartureTime: new Date(Math.max(...departures)),
      });
      return this.serialize(booking, user);
    } catch (e) {
      for (const s of held) await this.flightsService.releaseHeld(s.flight._id, s.cabinClass, s.seats);
      throw e;
    }
  }

  // ------------------------------------------------------------------ read (FLT-25, ACC-11)

  async serialize(b: any, viewer?: AuthUser) {
    const airports = new Map((await this.ref.listAirports()).map((a: any) => [a._id, a]));
    const showPassport = !viewer || viewer.role === Role.USER || viewer.role === Role.ADMIN;
    return {
      id: String(b._id),
      type: BookingType.FLIGHT,
      reference: b.reference ?? null,
      status: b.status,
      tripType: b.tripType,
      segments: b.segments.map((s: any) => ({
        id: String(s._id),
        direction: s.direction,
        flightId: String(s.flight),
        airlineId: String(s.airline),
        flightNumber: s.flightNumber,
        departureAirport: s.departureAirport,
        arrivalAirport: s.arrivalAirport,
        departureLocalTime: utcToLocalIso(s.departureTime, airports.get(s.departureAirport)?.timeZone ?? 'UTC'),
        arrivalLocalTime: utcToLocalIso(s.arrivalTime, airports.get(s.arrivalAirport)?.timeZone ?? 'UTC'),
        departureTimeUtc: s.departureTime,
        arrivalTimeUtc: s.arrivalTime,
        cabinClass: s.cabinClass,
        seatPrice: s.seatPrice,
        seats: s.seats,
        freeBags: s.freeBags,
        maxBagWeightKg: s.maxBagWeightKg,
        extraBagPrice: s.extraBagPrice,
        fare: s.fare,
        baggageFee: s.baggageFee,
      })),
      passengers: b.passengers.map((p: any) => ({
        id: String(p._id),
        fullName: p.fullName,
        dateOfBirth: p.dateOfBirth,
        type: p.type,
        ...(showPassport ? { passportNumber: p.passportNumber } : {}),
        extraBags: p.extraBags,
      })),
      fareTotal: b.fareTotal,
      baggageTotal: b.baggageTotal,
      total: b.total,
      currency: b.currency,
      holdExpiresAt: b.status === BookingStatus.PENDING_PAYMENT ? b.holdExpiresAt : null,
      policyAcceptance: b.policyAcceptance ?? null,
      payment: await this.payments.paymentForBooking(b.payment),
      refund: await this.payments.refundForBooking(b.refund),
      userId: String(b.user?._id ?? b.user),
      confirmedAt: b.confirmedAt ?? null,
      cancelledAt: b.cancelledAt ?? null,
      cancelledBy: b.cancelledBy ?? null,
      createdAt: b.createdAt,
    };
  }

  /** FLT-25 grouping filter. */
  groupFilter(group: 'upcoming' | 'past' | 'cancelled') {
    const now = new Date();
    if (group === 'cancelled') return { status: { $in: [BookingStatus.CANCELLED, BookingStatus.EXPIRED] } };
    if (group === 'past') {
      return {
        $or: [
          { status: BookingStatus.COMPLETED },
          { status: BookingStatus.CONFIRMED, travelDate: { $lte: now } },
        ],
      };
    }
    return { status: { $in: [BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED] }, travelDate: { $gt: now } };
  }

  /** FLT-25 */
  async listMine(user: AuthUser, group: 'upcoming' | 'past' | 'cancelled' = 'upcoming', page = 1) {
    await this.completePastBookings();
    const filter = { user: user.id, ...this.groupFilter(group) };
    const res = await paginateQuery(this.bookings, filter, page, { travelDate: group === 'upcoming' ? 1 : -1 });
    const counts = {
      upcoming: await this.bookings.countDocuments({ user: user.id, ...this.groupFilter('upcoming') }),
      past: await this.bookings.countDocuments({ user: user.id, ...this.groupFilter('past') }),
      cancelled: await this.bookings.countDocuments({ user: user.id, ...this.groupFilter('cancelled') }),
    };
    return {
      group,
      counts,
      ...res,
      items: await Promise.all(
        res.items.map(async (b: any) => {
          const full = await this.serialize(b, user);
          return {
            id: full.id, reference: full.reference, status: full.status, tripType: full.tripType,
            flight: full.segments.map((s: any) => `${s.flightNumber} ${s.departureAirport}-${s.arrivalAirport}`).join(' / '),
            date: full.segments[0].departureLocalTime,
            passengers: full.passengers.length,
            cabin: full.segments.map((s: any) => s.cabinClass).join(' / '),
            total: full.total,
            currency: full.currency,
            holdExpiresAt: full.holdExpiresAt,
          };
        }),
      ),
    };
  }

  /** ACC-11: owner; admin (ACC-17); airline moderator of one of the booking's airlines (FLT-29). */
  private async getAccessible(id: string, user: AuthUser): Promise<FlightBookingDocument> {
    await this.completePastBookings();
    const b = await this.bookings.findById(id);
    if (!b) throw notFound('Flight booking');
    const isOwner = String(b.user) === user.id;
    const isAdmin = user.role === Role.ADMIN;
    const isModerator = user.role === Role.AIRLINE_MODERATOR && b.segments.some((s) => String(s.airline) === user.airlineId);
    if (!isOwner && !isAdmin && !isModerator) throw notFound('Flight booking');
    return b;
  }

  async details(id: string, user: AuthUser) {
    return this.serialize(await this.getAccessible(id, user), user);
  }

  // ------------------------------------------------------------------ BookingHandler (PAY-01, PAY-02)

  async getPayable(bookingId: string): Promise<PayableBooking> {
    const b = await this.bookings.findById(bookingId).lean();
    if (!b) throw notFound('Flight booking');
    if (b.status === BookingStatus.PENDING_PAYMENT && !(await this.bookable(b))) {
      throw new ConflictException({
        message: 'This booking can no longer be paid: a flight is no longer Scheduled or its airline has been deactivated',
        code: 'NOT_BOOKABLE',
      });
    }
    return {
      id: String(b._id),
      userId: String(b.user),
      status: b.status,
      amount: b.total,
      currency: b.currency,
      // A hold is unusable once the first flight departs (FLT-30), even inside the 10 minutes.
      holdExpiresAt: b.holdExpiresAt && b.travelDate && b.travelDate < b.holdExpiresAt ? b.travelDate : b.holdExpiresAt,
      policyAccepted: !!b.policyAcceptance?.acceptedAt,
      reference: b.reference,
      paymentId: b.payment ? String(b.payment) : undefined,
    };
  }

  private async policiesFor(b: FlightBookingDocument) {
    const out = [];
    for (const s of b.segments) {
      const a = await this.airlines.findById(s.airline).lean();
      out.push({
        direction: s.direction,
        flightNumber: s.flightNumber,
        airline: a ? { id: String(a._id), name: a.name, code: a.code } : null,
        cancellationPolicy: [...(a?.cancellationTiers ?? [])].sort((x, y) => y.daysBefore - x.daysBefore),
        baggagePolicy: {
          freeBags: s.freeBags,
          maxBagWeightKg: s.maxBagWeightKg,
          extraBagPrice: a?.baggagePolicy?.extraBagPrice ?? null,
          maxExtraBags: a?.baggagePolicy?.maxExtraBags ?? 0,
        },
      });
    }
    return {
      bookingType: BookingType.FLIGHT,
      bookingId: String(b._id),
      note: 'Round trips are cancelled as a whole using the outbound segment airline tiers (FLT-12 a).',
      segments: out,
    };
  }

  /** PAY-02 */
  async getPolicies(bookingId: string, user: AuthUser) {
    const b = await this.bookings.findById(bookingId);
    if (!b || String(b.user) !== user.id) throw notFound('Flight booking');
    return { ...(await this.policiesFor(b)), acceptedAt: b.policyAcceptance?.acceptedAt ?? null };
  }

  /** PAY-02: acceptance stored with a timestamp (and a snapshot of what was accepted). */
  async acceptPolicies(bookingId: string, user: AuthUser) {
    const b = await this.bookings.findById(bookingId);
    if (!b || String(b.user) !== user.id) throw notFound('Flight booking');
    if (b.status !== BookingStatus.PENDING_PAYMENT) {
      throw new ConflictException({ message: 'Policies can only be accepted for Pending Payment bookings' });
    }
    const policies = await this.policiesFor(b);
    b.policyAcceptance = { acceptedAt: new Date(), policies };
    await b.save();
    return { bookingId: String(b._id), acceptedAt: b.policyAcceptance.acceptedAt };
  }

  /** FLT-30 / ACC-15: every segment still Scheduled and not departed, and every airline still active. */
  private async bookable(b: { segments: { flight: any; airline: any }[] }) {
    const now = new Date();
    const flights = await this.flights.find({ _id: { $in: b.segments.map((s) => s.flight) } }).select('status departureTime').lean();
    if (flights.length !== new Set(b.segments.map((s) => String(s.flight))).size) return false;
    if (flights.some((f) => f.status !== FlightStatus.SCHEDULED || f.departureTime <= now)) return false;
    const activeAirlines = await this.airlines.countDocuments({ _id: { $in: b.segments.map((s) => s.airline) }, active: true });
    return activeAirlines === new Set(b.segments.map((s) => String(s.airline))).size;
  }

  async attachPayment(bookingId: string, paymentId: string) {
    await this.bookings.updateOne({ _id: bookingId }, { $set: { payment: paymentId } });
  }

  /** FLT-23: confirm after verified payment (called from the Stripe webhook). */
  async onPaymentSucceeded(bookingId: string, paymentId: string) {
    const pending = await this.bookings.findById(bookingId).lean();
    if (pending?.status === BookingStatus.PENDING_PAYMENT && !(await this.bookable(pending))) {
      // Paid too late (flight departed/cancelled or airline deactivated): never confirm; the payment is refunded.
      await this.expireOne(pending._id);
      return 'not_pending';
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const b = await this.bookings.findOneAndUpdate(
          { _id: bookingId, status: BookingStatus.PENDING_PAYMENT, holdExpiresAt: { $gt: new Date() }, travelDate: { $gt: new Date() } },
          {
            $set: {
              status: BookingStatus.CONFIRMED,
              reference: generateBookingReference('FL'),
              confirmedAt: new Date(),
              payment: new Types.ObjectId(paymentId),
            },
          },
          { new: true },
        );
        if (!b) {
          const cur = await this.bookings.findById(bookingId).lean();
          return cur?.status === BookingStatus.CONFIRMED ? 'already' : 'not_pending';
        }
        for (const s of b.segments) await this.flightsService.convertHeldToBooked(s.flight, s.cabinClass, s.seats);
        await this.notifications.notify(
          b.user,
          NotificationType.BOOKING_CONFIRMED,
          `Flight booking ${b.reference} confirmed`,
          `Your booking ${b.reference} (${b.segments.map((s) => `${s.flightNumber} ${s.departureAirport}->${s.arrivalAirport}`).join(', ')}) for ${b.passengers.length} passenger(s) is confirmed. Total paid: ${b.total.toFixed(2)} ${b.currency}. Your e-ticket is available to download.`,
          { bookingType: BookingType.FLIGHT, bookingId: String(b._id), reference: b.reference },
        );
        return 'confirmed';
      } catch (e) {
        if (isDuplicateKeyError(e)) continue; // reference collision: retry with a new one
        throw e;
      }
    }
    throw new ConflictException({ message: 'Could not generate a unique booking reference' });
  }

  // ------------------------------------------------------------------ hold expiry & completion (FLT-22, GEN-11)

  @Cron(CronExpression.EVERY_30_SECONDS)
  async expireHolds() {
    const due = await this.bookings
      .find({ status: BookingStatus.PENDING_PAYMENT, $or: [{ holdExpiresAt: { $lte: new Date() } }, { travelDate: { $lte: new Date() } }] })
      .select('_id')
      .lean();
    for (const { _id } of due) await this.expireOne(_id);
  }

  private async expireOne(id: Types.ObjectId) {
    const b = await this.bookings.findOneAndUpdate(
      { _id: id, status: BookingStatus.PENDING_PAYMENT },
      { $set: { status: BookingStatus.EXPIRED, expiredAt: new Date() } },
      { new: true },
    );
    if (!b) return;
    for (const s of b.segments) await this.flightsService.releaseHeld(s.flight, s.cabinClass, s.seats);
    await this.payments.cancelIntentsForBooking(BookingType.FLIGHT, b._id);
  }

  /** GEN-11: Confirmed -> Completed once the last segment has departed (approved assumption #1). */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async completePastBookings() {
    await this.bookings.updateMany(
      { status: BookingStatus.CONFIRMED, lastDepartureTime: { $lte: new Date() } },
      { $set: { status: BookingStatus.COMPLETED, completedAt: new Date() } },
    );
  }

  // ------------------------------------------------------------------ cancellation (FLT-26, FLT-06)

  /**
   * PDF 6.4 / PAY-02: the policy applicable to a booking is the one the user accepted before paying
   * (snapshot stored with the acceptance), not whatever the airline configures later.
   */
  private applicableTiers(b: FlightBookingDocument | any, airline: any): { daysBefore: number; refundPercent: number }[] {
    const snap = b.policyAcceptance?.policies?.segments;
    const outSnap = Array.isArray(snap) ? snap.find((s: any) => s.direction === 'outbound') ?? snap[0] : null;
    if (outSnap && Array.isArray(outSnap.cancellationPolicy)) return outSnap.cancellationPolicy;
    return airline?.cancellationTiers ?? [];
  }

  private refundQuote(b: FlightBookingDocument | any, airline: any) {
    const outbound = b.segments.find((s: any) => s.direction === 'outbound') ?? b.segments[0];
    const days = wholeDaysUntil(outbound.departureTime);
    const percent = selectRefundPercent(this.applicableTiers(b, airline), days);
    return { daysBeforeDeparture: days, refundPercent: percent, refundAmount: money((b.total * percent) / 100) };
  }

  private async assertCancellable(id: string, user: AuthUser) {
    const b = await this.bookings.findById(id);
    if (!b || String(b.user) !== user.id) throw notFound('Flight booking');
    if (b.status !== BookingStatus.CONFIRMED) {
      throw new ConflictException({ message: `Only Confirmed bookings can be cancelled (current status: ${b.status})` });
    }
    const first = Math.min(...b.segments.map((s) => s.departureTime.getTime()));
    if (first <= Date.now()) throw new ConflictException({ message: 'Cancellation after departure is not allowed (FLT-26)' });
    const outbound = b.segments.find((s) => s.direction === 'outbound') ?? b.segments[0];
    const airline = await this.airlines.findById(outbound.airline).lean();
    return { b, airline };
  }

  /** FLT-26: refund amount the user sees before confirming. */
  async cancellationPreview(id: string, user: AuthUser) {
    const { b, airline } = await this.assertCancellable(id, user);
    return {
      bookingId: String(b._id),
      reference: b.reference,
      total: b.total,
      currency: b.currency,
      ...this.refundQuote(b, airline),
      cancellationPolicy: [...this.applicableTiers(b, airline)].sort((x, y) => y.daysBefore - x.daysBefore),
    };
  }

  /** FLT-26 */
  async cancel(id: string, user: AuthUser) {
    const { b, airline } = await this.assertCancellable(id, user);
    const quote = this.refundQuote(b, airline);
    const updated = await this.bookings.findOneAndUpdate(
      { _id: b._id, status: BookingStatus.CONFIRMED },
      { $set: { status: BookingStatus.CANCELLED, cancelledAt: new Date(), cancelledBy: 'user' } },
      { new: true },
    );
    if (!updated) throw new ConflictException({ message: 'Booking status changed; please refresh' });
    for (const s of updated.segments) await this.flightsService.releaseBooked(s.flight, s.cabinClass, s.seats);
    const refund = await this.payments.issueRefund({
      bookingType: BookingType.FLIGHT,
      bookingId: String(updated._id),
      userId: String(updated.user),
      amount: quote.refundAmount,
      percent: quote.refundPercent,
      reason: `Cancellation of flight booking ${updated.reference} ${quote.daysBeforeDeparture} day(s) before departure`,
    });
    if (refund) {
      updated.refund = refund._id as Types.ObjectId;
      await updated.save();
    }
    await this.notifications.notify(
      updated.user,
      NotificationType.BOOKING_CANCELLED,
      `Flight booking ${updated.reference} cancelled`,
      `Your booking ${updated.reference} was cancelled. Refund: ${quote.refundAmount.toFixed(2)} ${updated.currency} (${quote.refundPercent}%).`,
      { bookingType: BookingType.FLIGHT, bookingId: String(updated._id), reference: updated.reference },
    );
    return { booking: await this.serialize(updated, user), ...quote };
  }

  /** FLT-06: airline cancels a Scheduled flight. */
  async cancelFlight(flightId: string, user: AuthUser) {
    const flight = await this.flights.findById(flightId);
    if (!flight) throw notFound('Flight');
    this.airlinesService.assertModerator(user, String(flight.airline));
    if (flight.status === FlightStatus.SCHEDULED && flight.departureTime <= new Date()) {
      throw new ConflictException({ message: 'Only Scheduled flights can be cancelled (current status: Departed)' });
    }
    if (flight.status !== FlightStatus.SCHEDULED) {
      throw new ConflictException({ message: `Only Scheduled flights can be cancelled (current status: ${flight.status})` });
    }
    flight.status = FlightStatus.CANCELLED;
    flight.cancelledAt = new Date();
    await flight.save();

    // Pending seat holds are released (bookings become Expired, the only allowed transition from Pending Payment).
    const pending = await this.bookings.find({ 'segments.flight': flight._id, status: BookingStatus.PENDING_PAYMENT }).select('_id').lean();
    for (const p of pending) await this.expireOne(p._id);

    // Confirmed bookings: Cancelled with a 100% refund + notification.
    const confirmed = await this.bookings.find({ 'segments.flight': flight._id, status: BookingStatus.CONFIRMED });
    let cancelled = 0;
    for (const b of confirmed) {
      const upd = await this.bookings.findOneAndUpdate(
        { _id: b._id, status: BookingStatus.CONFIRMED },
        { $set: { status: BookingStatus.CANCELLED, cancelledAt: new Date(), cancelledBy: 'airline' } },
        { new: true },
      );
      if (!upd) continue;
      cancelled++;
      for (const s of upd.segments) await this.flightsService.releaseBooked(s.flight, s.cabinClass, s.seats);
      const refund = await this.payments.issueRefund({
        bookingType: BookingType.FLIGHT,
        bookingId: String(upd._id),
        userId: String(upd.user),
        amount: upd.total,
        percent: 100,
        reason: `Flight ${flight.flightNumber} was cancelled by the airline`,
      });
      if (refund) {
        upd.refund = refund._id as Types.ObjectId;
        await upd.save();
      }
      await this.notifications.notify(
        upd.user,
        NotificationType.BOOKING_CANCELLED,
        `Flight ${flight.flightNumber} cancelled`,
        `The airline cancelled flight ${flight.flightNumber}. Your booking ${upd.reference} is cancelled with a 100% refund of ${upd.total.toFixed(2)} ${upd.currency}.`,
        { bookingType: BookingType.FLIGHT, bookingId: String(upd._id), reference: upd.reference, flightId: String(flight._id) },
      );
    }
    return { flightId: String(flight._id), status: flight.status, cancelledBookings: cancelled, releasedHolds: pending.length };
  }

  // ------------------------------------------------------------------ moderator views (FLT-29)

  private async ownFlight(flightId: string, user: AuthUser) {
    const flight = await this.flights.findById(flightId).lean();
    if (!flight) throw notFound('Flight');
    this.airlinesService.assertModerator(user, String(flight.airline));
    return flight;
  }

  private moderatorRows(list: any[], flightId: string) {
    return list.map((b) => {
      const seg = b.segments.find((s: any) => String(s.flight) === flightId);
      return {
        bookingId: String(b._id),
        reference: b.reference,
        status: b.status === BookingStatus.COMPLETED ? BookingStatus.CONFIRMED : b.status,
        cabin: seg?.cabinClass,
        seats: seg?.seats,
        passengers: b.passengers.map((p: any) => ({ fullName: p.fullName, type: p.type })),
      };
    });
  }

  /** FLT-29 */
  async flightBookings(flightId: string, user: AuthUser, page = 1) {
    const flight = await this.ownFlight(flightId, user);
    const filter = {
      'segments.flight': flight._id,
      status: { $in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.CANCELLED] },
    };
    const res = await paginateQuery(this.bookings, filter, page, { createdAt: -1 });
    return {
      flight: { id: String(flight._id), flightNumber: flight.flightNumber, status: flight.status },
      seatsRemaining: flight.cabins.map((c) => ({ class: c.class, seats: c.seats, booked: c.booked, held: c.held, remaining: c.available })),
      ...res,
      items: this.moderatorRows(res.items, String(flight._id)),
    };
  }

  /** FLT-29: passenger list as CSV. */
  async passengersCsv(flightId: string, user: AuthUser) {
    const flight = await this.ownFlight(flightId, user);
    const list = await this.bookings
      .find({ 'segments.flight': flight._id, status: { $in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.CANCELLED] } })
      .sort({ createdAt: 1 })
      .lean();
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Reference', 'Passenger', 'Type', 'Cabin', 'Booking seats', 'Status'].map(esc).join(',')];
    for (const r of this.moderatorRows(list, String(flight._id))) {
      for (const p of r.passengers) lines.push([r.reference, p.fullName, p.type, r.cabin, r.seats, r.status].map(esc).join(','));
    }
    return { filename: `passengers-${flight.flightNumber}-${flight.departureLocalDate}.csv`, csv: lines.join('\n') + '\n' };
  }

  // ------------------------------------------------------------------ e-ticket (FLT-23)

  async eTicketData(id: string, user: AuthUser) {
    const b = await this.getAccessible(id, user);
    if (![BookingStatus.CONFIRMED, BookingStatus.COMPLETED].includes(b.status)) {
      throw new ConflictException({ message: 'An e-ticket is available only for Confirmed bookings' });
    }
    const view = await this.serialize(b, user);
    const airlines = await this.airlines.find({ _id: { $in: b.segments.map((s) => s.airline) } }).lean();
    return { view, airlines: new Map(airlines.map((a) => [String(a._id), a])) };
  }

  forbidden() {
    return forbidden();
  }
}
