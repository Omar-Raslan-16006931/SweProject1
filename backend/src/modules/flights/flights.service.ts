import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Flight, FlightDocument } from './schemas/flight.schema';
import { Airline } from './schemas/airline.schema';
import { FlightBooking } from '../flight-bookings/schemas/flight-booking.schema';
import { CabinDto, CreateFlightDto, FlightSearchDto, UpdateCabinDto, UpdateFlightDto } from './dto/flight.dto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { BookingStatus, CabinClass, FlightStatus, NotificationType } from '../../common/enums';
import { conflict, forbidden, isDuplicateKeyError, notFound } from '../../common/utils/errors';
import { localDateOf, localToUtc, utcToLocalIso } from '../../common/utils/dates';
import { paginateArray, paginateQuery } from '../../common/utils/pagination';
import { ReferenceService } from '../reference/reference.service';
import { AirlinesService } from './airlines.service';
import { NotificationsService } from '../notifications/notifications.service';
import { money } from '../../common/utils/refund';

@Injectable()
export class FlightsService {
  private readonly logger = new Logger(FlightsService.name);

  constructor(
    @InjectModel(Flight.name) private flights: Model<Flight>,
    @InjectModel(Airline.name) private airlines: Model<Airline>,
    @InjectModel(FlightBooking.name) private bookings: Model<FlightBooking>,
    private ref: ReferenceService,
    private airlinesService: AirlinesService,
    private notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- helpers

  async getFlight(id: string): Promise<FlightDocument> {
    const f = await this.flights.findById(id);
    if (!f) throw notFound('Flight');
    return f;
  }

  private async getOwnFlight(id: string, user: AuthUser) {
    const f = await this.getFlight(id);
    this.airlinesService.assertModerator(user, String(f.airline));
    return f;
  }

  private assertScheduled(f: Flight) {
    if (f.status !== FlightStatus.SCHEDULED || f.departureTime <= new Date()) {
      throw new BadRequestException({ message: 'Only Scheduled flights can be modified (FLT-30)' });
    }
  }

  /** Serialises a flight with local times in each airport's zone (GEN-06). */
  async serialize(f: any, opts: { airline?: any; airportsMap?: Map<string, any> } = {}) {
    const dep = opts.airportsMap?.get(f.departureAirport) ?? (await this.ref.getAirport(f.departureAirport));
    const arr = opts.airportsMap?.get(f.arrivalAirport) ?? (await this.ref.getAirport(f.arrivalAirport));
    const airline = opts.airline ?? (await this.airlines.findById(f.airline).lean());
    return {
      id: String(f._id),
      flightNumber: f.flightNumber,
      // FLT-30: Departed as soon as the departure time has passed (the scheduler persists it within a minute).
      status: f.status === FlightStatus.SCHEDULED && new Date(f.departureTime) <= new Date() ? FlightStatus.DEPARTED : f.status,
      airline: airline
        ? { id: String(airline._id), name: airline.name, code: airline.code, logoUrl: airline.logo?.url ?? null }
        : null,
      departure: {
        airport: dep._id, name: dep.name, cityId: dep.cityId, countryCode: dep.countryCode, timeZone: dep.timeZone,
        localTime: utcToLocalIso(f.departureTime, dep.timeZone), utc: f.departureTime,
      },
      arrival: {
        airport: arr._id, name: arr.name, cityId: arr.cityId, countryCode: arr.countryCode, timeZone: arr.timeZone,
        localTime: utcToLocalIso(f.arrivalTime, arr.timeZone), utc: f.arrivalTime,
      },
      durationMinutes: Math.round((new Date(f.arrivalTime).getTime() - new Date(f.departureTime).getTime()) / 60000),
      cabins: (f.cabins ?? []).map((c: any) => ({
        id: String(c._id),
        class: c.class,
        price: c.price,
        seats: c.seats,
        seatsRemaining: c.available,
        freeBags: c.freeBags,
        maxBagWeightKg: c.maxBagWeightKg,
      })),
    };
  }

  private validateTimes(departureUtc: Date, arrivalUtc: Date) {
    if (arrivalUtc.getTime() <= departureUtc.getTime()) {
      throw new BadRequestException({ message: 'Arrival must be after departure (compared in UTC)', field: 'arrivalLocal' });
    }
    if (departureUtc.getTime() <= Date.now()) {
      throw new BadRequestException({ message: 'Departure cannot be in the past', field: 'departureLocal' });
    }
  }

  private buildCabin(c: CabinDto) {
    return {
      class: c.class, seats: c.seats, price: c.price, freeBags: c.freeBags,
      maxBagWeightKg: c.maxBagWeightKg, booked: 0, held: 0, available: c.seats,
    };
  }

  // ---------------------------------------------------------------- moderator: flights (FLT-03..06)

  /** FLT-03 (+ optional FLT-04 cabins) */
  async create(dto: CreateFlightDto, user: AuthUser) {
    if (!user.airlineId) throw forbidden('Only airline moderators can create flights');
    if (dto.departureAirport === dto.arrivalAirport) {
      throw new BadRequestException({ message: 'Departure and arrival airports must be different', field: 'arrivalAirport' });
    }
    const dep = await this.ref.getAirport(dto.departureAirport, 'departureAirport');
    const arr = await this.ref.getAirport(dto.arrivalAirport, 'arrivalAirport');
    const departureTime = localToUtc(dto.departureLocal, dep.timeZone, 'departureLocal');
    const arrivalTime = localToUtc(dto.arrivalLocal, arr.timeZone, 'arrivalLocal');
    this.validateTimes(departureTime, arrivalTime);

    const cabins = dto.cabins ?? [];
    const classes = cabins.map((c) => c.class);
    if (new Set(classes).size !== classes.length) {
      throw new BadRequestException({ message: 'Each cabin category may be used at most once per flight', field: 'cabins' });
    }
    try {
      const f = await this.flights.create({
        airline: user.airlineId,
        flightNumber: dto.flightNumber,
        departureAirport: dep._id,
        arrivalAirport: arr._id,
        departureTime,
        arrivalTime,
        departureLocalDate: localDateOf(departureTime, dep.timeZone),
        cabins: cabins.map((c) => this.buildCabin(c)),
      });
      return this.serialize(f);
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        throw conflict(`Flight ${dto.flightNumber} already exists for this airline on that departure date`);
      }
      throw e;
    }
  }

  async listForModerator(user: AuthUser, page = 1, status?: string) {
    if (!user.airlineId) throw forbidden();
    await this.markDeparted();
    const filter: any = { airline: user.airlineId };
    if (status) filter.status = status;
    const res = await paginateQuery(this.flights, filter, page, { departureTime: 1 });
    const airline = await this.airlines.findById(user.airlineId).lean();
    const airportsMap = new Map((await this.ref.listAirports()).map((a: any) => [a._id, a]));
    const items = [];
    for (const f of res.items) items.push(await this.serialize(f, { airline, airportsMap }));
    return { ...res, items };
  }

  /** FLT-05 */
  async update(id: string, dto: UpdateFlightDto, user: AuthUser) {
    const f = await this.getOwnFlight(id, user);
    this.assertScheduled(f);
    const airportsChanging =
      (dto.departureAirport && dto.departureAirport !== f.departureAirport) ||
      (dto.arrivalAirport && dto.arrivalAirport !== f.arrivalAirport);
    if (airportsChanging && f.hasBookings) {
      throw new BadRequestException({ message: 'Airports cannot be changed once the flight has any booking (FLT-05)' });
    }
    const depCode = dto.departureAirport ?? f.departureAirport;
    const arrCode = dto.arrivalAirport ?? f.arrivalAirport;
    if (depCode === arrCode) throw new BadRequestException({ message: 'Departure and arrival airports must be different' });
    const dep = await this.ref.getAirport(depCode, 'departureAirport');
    const arr = await this.ref.getAirport(arrCode, 'arrivalAirport');

    const departureTime = dto.departureLocal ? localToUtc(dto.departureLocal, dep.timeZone, 'departureLocal') : f.departureTime;
    const arrivalTime = dto.arrivalLocal ? localToUtc(dto.arrivalLocal, arr.timeZone, 'arrivalLocal') : f.arrivalTime;
    if (dto.departureLocal || dto.arrivalLocal || airportsChanging) this.validateTimes(departureTime, arrivalTime);

    const timeChanged =
      departureTime.getTime() !== f.departureTime.getTime() || arrivalTime.getTime() !== f.arrivalTime.getTime();

    f.departureAirport = dep._id;
    f.arrivalAirport = arr._id;
    f.departureTime = departureTime;
    f.arrivalTime = arrivalTime;
    f.departureLocalDate = localDateOf(departureTime, dep.timeZone);
    try {
      await f.save();
    } catch (e) {
      if (isDuplicateKeyError(e)) throw conflict('Another flight with this number already departs on that date');
      throw e;
    }

    if (timeChanged) {
      // Keep booking snapshots in sync and notify passengers with Confirmed bookings (FLT-05, GEN-01).
      await this.bookings.updateMany(
        { 'segments.flight': f._id, status: { $in: [BookingStatus.CONFIRMED, BookingStatus.PENDING_PAYMENT] } },
        { $set: { 'segments.$[s].departureTime': departureTime, 'segments.$[s].arrivalTime': arrivalTime } },
        { arrayFilters: [{ 's.flight': f._id }] },
      );
      await this.resyncBookingDates(f._id);
      const confirmed = await this.bookings.find({ 'segments.flight': f._id, status: BookingStatus.CONFIRMED }).select('user reference').lean();
      await this.notifications.notifyMany(
        confirmed.map((b) => b.user),
        NotificationType.FLIGHT_SCHEDULE_CHANGE,
        `Schedule change for flight ${f.flightNumber}`,
        `Flight ${f.flightNumber} now departs ${depCode} at ${utcToLocalIso(departureTime, dep.timeZone)} (local) and arrives ${arrCode} at ${utcToLocalIso(arrivalTime, arr.timeZone)} (local).`,
        { flightId: String(f._id) },
      );
    }
    return this.serialize(f);
  }

  private async resyncBookingDates(flightId: Types.ObjectId) {
    const list = await this.bookings.find({ 'segments.flight': flightId }).select('segments');
    for (const b of list) {
      const times = b.segments.map((s) => s.departureTime.getTime());
      b.set('travelDate', new Date(Math.min(...times)));
      b.set('lastDepartureTime', new Date(Math.max(...times)));
      await b.save();
    }
  }

  /** FLT-04 */
  async addCabin(id: string, dto: CabinDto, user: AuthUser) {
    const f = await this.getOwnFlight(id, user);
    this.assertScheduled(f);
    const updated = await this.flights.findOneAndUpdate(
      { _id: f._id, 'cabins.class': { $ne: dto.class } },
      { $push: { cabins: this.buildCabin(dto) } },
      { new: true },
    );
    if (!updated) throw conflict(`Cabin category ${dto.class} is already defined for this flight`);
    return this.serialize(updated);
  }

  /** FLT-04, FLT-05: seat counts cannot drop below booked + held; price changes do not affect existing bookings. */
  async updateCabin(id: string, cabinId: string, dto: UpdateCabinDto, user: AuthUser) {
    const f = await this.getOwnFlight(id, user);
    this.assertScheduled(f);
    const cabin = f.cabins.find((c) => String(c._id) === cabinId);
    if (!cabin) throw notFound('Cabin');

    const set: Record<string, any> = {};
    if (dto.price !== undefined) set['cabins.$.price'] = dto.price;
    if (dto.freeBags !== undefined) set['cabins.$.freeBags'] = dto.freeBags;
    if (dto.maxBagWeightKg !== undefined) set['cabins.$.maxBagWeightKg'] = dto.maxBagWeightKg;

    const filter: any = { _id: f._id, cabins: { $elemMatch: { _id: cabin._id } } };
    const update: any = {};
    if (dto.seats !== undefined && dto.seats !== cabin.seats) {
      const delta = dto.seats - cabin.seats;
      // Atomic guard: the new seat count must keep available >= 0 (i.e. seats >= booked + held).
      filter.cabins.$elemMatch.seats = cabin.seats;
      filter.cabins.$elemMatch.available = { $gte: -delta };
      set['cabins.$.seats'] = dto.seats;
      update.$inc = { 'cabins.$.available': delta };
    }
    if (Object.keys(set).length) update.$set = set;
    if (!Object.keys(update).length) return this.serialize(f);

    const updated = await this.flights.findOneAndUpdate(filter, update, { new: true });
    if (!updated) {
      const fresh = await this.getFlight(id);
      const c = fresh.cabins.find((x) => String(x._id) === cabinId)!;
      throw new BadRequestException({
        message: `Seat count cannot be reduced below seats already booked or held (${c.booked + c.held})`,
        field: 'seats',
      });
    }
    return this.serialize(updated);
  }

  // ---------------------------------------------------------------- public (FLT-11, FLT-12, FLT-15, FLT-17)

  async details(id: string) {
    const f = await this.getFlight(id);
    const airline = await this.airlines.findById(f.airline).lean();
    const out: any = await this.serialize(f, { airline });
    out.baggagePolicy = airline?.baggagePolicy ?? null;
    out.cancellationPolicy = [...(airline?.cancellationTiers ?? [])].sort((a, b) => b.daysBefore - a.daysBefore);
    out.bookable = f.status === FlightStatus.SCHEDULED && f.departureTime > new Date() && !!airline?.active;
    return out;
  }

  private async searchLeg(
    from: string, to: string, date: string, seatsNeeded: number, infants: number, q: FlightSearchDto,
  ) {
    const activeAirlines = await this.airlines.find({ active: true }).lean();
    const airlineMap = new Map(activeAirlines.map((a) => [String(a._id), a]));
    const flights = await this.flights
      .find({
        departureAirport: from,
        arrivalAirport: to,
        departureLocalDate: date,
        status: FlightStatus.SCHEDULED,
        departureTime: { $gt: new Date() },
        airline: { $in: activeAirlines.map((a) => a._id) },
      })
      .lean();
    const airportsMap = new Map((await this.ref.listAirports()).map((a: any) => [a._id, a]));

    const results: any[] = [];
    for (const f of flights) {
      const cabins = f.cabins.filter(
        (c) =>
          c.available >= seatsNeeded &&
          (!q.cabinClass || c.class === q.cabinClass) &&
          (q.minPrice === undefined || c.price >= q.minPrice) &&
          (q.maxPrice === undefined || c.price <= q.maxPrice),
      );
      if (!cabins.length) continue;
      const s: any = await this.serialize({ ...f, cabins }, { airline: airlineMap.get(String(f.airline)), airportsMap });
      for (const c of s.cabins) {
        // Fare for the requested passengers: adults & children pay the fare, infants 10% (FLT-12 b).
        c.totalFareForPassengers = money(seatsNeeded * c.price + infants * c.price * 0.1);
      }
      s.lowestPrice = Math.min(...cabins.map((c) => c.price));
      results.push(s);
    }
    const dir = q.sortOrder === 'desc' ? -1 : 1;
    const key = q.sortBy ?? 'departureTime';
    results.sort((a, b) => {
      const va = key === 'price' ? a.lowestPrice : key === 'duration' ? a.durationMinutes : new Date(a.departure.utc).getTime();
      const vb = key === 'price' ? b.lowestPrice : key === 'duration' ? b.durationMinutes : new Date(b.departure.utc).getTime();
      return (va - vb) * dir;
    });
    const page = paginateArray(results, q.page);
    return { ...page, message: results.length ? undefined : 'No flights found' };
  }

  /** FLT-11 / FLT-12 / FLT-15 */
  async search(q: FlightSearchDto) {
    if (q.from === q.to) throw new BadRequestException({ message: 'Departure and arrival airports must be different', field: 'to' });
    await this.ref.getAirport(q.from, 'from');
    await this.ref.getAirport(q.to, 'to');
    if (q.minPrice !== undefined && q.maxPrice !== undefined && q.minPrice > q.maxPrice) {
      throw new BadRequestException({ message: 'Minimum price cannot be greater than maximum price', field: 'minPrice' });
    }
    const adults = q.adults ?? 1;
    const children = q.children ?? 0;
    const infants = q.infants ?? 0;
    if (infants > adults) throw new BadRequestException({ message: 'There cannot be more infants than adults', field: 'infants' });
    const seatsNeeded = adults + children;

    const outbound = await this.searchLeg(q.from, q.to, q.date, seatsNeeded, infants, q);
    const criteria = {
      from: q.from, to: q.to, date: q.date, tripType: q.tripType, returnDate: q.returnDate ?? null,
      adults, children, infants, cabinClass: q.cabinClass ?? null, minPrice: q.minPrice ?? null,
      maxPrice: q.maxPrice ?? null, sortBy: q.sortBy, sortOrder: q.sortOrder,
    };
    if (q.tripType !== 'round-trip') return { criteria, outbound };
    if (!q.returnDate) throw new BadRequestException({ message: 'returnDate is required for round-trip searches', field: 'returnDate' });
    if (q.returnDate < q.date) {
      throw new BadRequestException({ message: 'returnDate cannot be before the departure date', field: 'returnDate' });
    }
    const ret = await this.searchLeg(q.to, q.from, q.returnDate, seatsNeeded, infants, q);
    return { criteria, outbound, return: ret };
  }

  // ---------------------------------------------------------------- inventory primitives (used by FlightBookingsService)

  /** FLT-22: atomically hold seats only if enough remain. Returns the cabin snapshot or null. */
  async holdSeats(flightId: Types.ObjectId | string, cabinClass: CabinClass, seats: number) {
    const f = await this.flights.findOneAndUpdate(
      {
        _id: flightId,
        status: FlightStatus.SCHEDULED,
        departureTime: { $gt: new Date() },
        cabins: { $elemMatch: { class: cabinClass, available: { $gte: seats } } },
      },
      { $inc: { 'cabins.$.available': -seats, 'cabins.$.held': seats }, $set: { hasBookings: true } },
      { new: true },
    );
    return f;
  }

  releaseHeld(flightId: Types.ObjectId | string, cabinClass: CabinClass, seats: number) {
    return this.flights.updateOne(
      { _id: flightId, cabins: { $elemMatch: { class: cabinClass, held: { $gte: seats } } } },
      { $inc: { 'cabins.$.available': seats, 'cabins.$.held': -seats } },
    );
  }

  /** FLT-23: convert held seats into booked seats. */
  convertHeldToBooked(flightId: Types.ObjectId | string, cabinClass: CabinClass, seats: number) {
    return this.flights.updateOne(
      { _id: flightId, cabins: { $elemMatch: { class: cabinClass, held: { $gte: seats } } } },
      { $inc: { 'cabins.$.held': -seats, 'cabins.$.booked': seats } },
    );
  }

  /** FLT-26: seats return to inventory. */
  releaseBooked(flightId: Types.ObjectId | string, cabinClass: CabinClass, seats: number) {
    return this.flights.updateOne(
      { _id: flightId, cabins: { $elemMatch: { class: cabinClass, booked: { $gte: seats } } } },
      { $inc: { 'cabins.$.booked': -seats, 'cabins.$.available': seats } },
    );
  }

  /** FLT-30: a flight becomes Departed once its departure time has passed. */
  @Cron(CronExpression.EVERY_MINUTE)
  async markDeparted() {
    const r = await this.flights.updateMany(
      { status: FlightStatus.SCHEDULED, departureTime: { $lte: new Date() } },
      { $set: { status: FlightStatus.DEPARTED } },
    );
    if (r.modifiedCount) this.logger.log(`Marked ${r.modifiedCount} flight(s) as Departed`);
  }
}
