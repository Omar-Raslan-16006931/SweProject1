import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Hotel, HotelDocument, Room, RoomDocument, RoomNightLock } from './schemas/hotel.schema';
import { HotelReservation } from '../hotel-bookings/schemas/hotel-reservation.schema';
import { Review } from '../reviews/schemas/review.schema';
import { displayName } from '../users/schemas/user.schema';
import {
  AvailabilityQueryDto, CreateHotelDto, CreateRoomDto, DateRangeDto, HotelPoliciesDto, HotelSearchDto,
  PatchAvailabilityDto, UpdateHotelDto, UpdateRoomDto,
} from './dto/hotel.dto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { conflict, forbidden, isDuplicateKeyError, notFound } from '../../common/utils/errors';
import { addDays, eachNight, formatDateOnly, nightsBetween, parseDateOnly, todayInZone, todayUtc } from '../../common/utils/dates';
import { paginateArray, paginateQuery } from '../../common/utils/pagination';
import { money } from '../../common/utils/refund';
import { ReferenceService } from '../reference/reference.service';
import { UploadsService } from '../uploads/uploads.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { assertUniqueThresholds } from '../flights/dto/airline.dto';

/** Lock filter: blocks always count; reservation locks count while confirmed (expiresAt null) or unexpired. */
const activeLockFilter = () => ({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });

@Injectable()
export class HotelsService {
  constructor(
    @InjectModel(Hotel.name) private hotels: Model<Hotel>,
    @InjectModel(Room.name) private rooms: Model<Room>,
    @InjectModel(RoomNightLock.name) private locks: Model<RoomNightLock>,
    @InjectModel(HotelReservation.name) private reservations: Model<HotelReservation>,
    @InjectModel(Review.name) private reviews: Model<Review>,
    private ref: ReferenceService,
    private uploads: UploadsService,
    private audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ helpers

  assertModerator(user: AuthUser, hotelId: string) {
    if (user.role !== Role.HOTEL_MODERATOR || user.hotelId !== String(hotelId)) {
      throw forbidden('Hotel moderators may manage only their assigned hotel');
    }
  }

  async getHotel(id: string): Promise<HotelDocument> {
    const h = await this.hotels.findById(id);
    if (!h) throw notFound('Hotel');
    return h;
  }

  private async getRoom(hotelId: string, roomId: string): Promise<RoomDocument> {
    const r = await this.rooms.findOne({ _id: roomId, hotel: hotelId });
    if (!r) throw notFound('Room');
    return r;
  }

  serializeHotel(h: any) {
    return {
      id: String(h._id),
      name: h.name,
      address: h.address,
      cityId: h.cityId,
      countryCode: h.countryCode,
      description: h.description,
      photos: (h.photos ?? []).map((p: any) => ({ id: String(p._id), url: p.url })),
      starClass: h.starClass,
      amenities: h.amenities,
      checkInTime: h.checkInTime,
      checkOutTime: h.checkOutTime,
      cancellationPolicy: [...(h.cancellationTiers ?? [])].sort((a: any, b: any) => b.daysBefore - a.daysBefore),
      active: h.active,
      averageRating: h.avgRating,
      ratingsCount: h.ratingsCount,
      createdAt: h.createdAt,
    };
  }

  serializeRoom(r: any, nights?: number) {
    return {
      id: String(r._id),
      hotelId: String(r.hotel),
      number: r.number,
      type: r.type,
      beds: r.beds,
      maxOccupancy: r.maxOccupancy,
      pricePerNight: r.pricePerNight,
      active: r.active,
      availability: (r.availability ?? []).map((a: any) => ({ id: String(a._id), from: formatDateOnly(a.from), to: formatDateOnly(a.to) })),
      blocks: (r.blocks ?? []).map((b: any) => ({ id: String(b._id), from: formatDateOnly(b.from), to: formatDateOnly(b.to), reason: b.reason ?? null })),
      ...(nights ? { nights, totalStayPrice: money(nights * r.pricePerNight) } : {}),
    };
  }

  private parseRange(from: string, to: string) {
    const f = parseDateOnly(from, 'from');
    const t = parseDateOnly(to, 'to');
    if (t < f) throw new BadRequestException({ message: '"to" cannot be before "from"', field: 'to' });
    return { from: f, to: t };
  }

  /** "Today" on the hotel's own calendar (time zone of its city), used for every stay-date rule. */
  async todayForCity(cityId: string) {
    return todayInZone(await this.ref.cityTimeZone(cityId));
  }

  /**
   * Validates stay dates (HTL-11 / HTL-18): check-out after check-in, check-in not in the past.
   * `today` is the hotel's local date (a guest cannot check in on a day that has already ended there).
   */
  parseStay(checkIn: string, checkOut: string, today: Date = todayUtc()) {
    const ci = parseDateOnly(checkIn, 'checkIn');
    const co = parseDateOnly(checkOut, 'checkOut');
    if (co <= ci) throw new BadRequestException({ message: 'Check-out must be after check-in', field: 'checkOut' });
    if (ci < today) throw new BadRequestException({ message: 'Check-in cannot be in the past (hotel local date)', field: 'checkIn' });
    return { checkIn: ci, checkOut: co, nights: nightsBetween(ci, co), dates: eachNight(ci, co) };
  }

  private async assertCityCountry(cityId: string, countryCode: string) {
    const city = await this.ref.getCity(cityId, 'cityId');
    await this.ref.getCountry(countryCode, 'countryCode');
    if (city.countryCode !== countryCode) {
      throw new BadRequestException({ message: `City ${city.name} is not in country ${countryCode}`, field: 'countryCode' });
    }
  }

  // ------------------------------------------------------------------ hotel profile (HTL-01, HTL-02, HTL-09, HTL-10)

  async create(dto: CreateHotelDto, actor: AuthUser) {
    await this.assertCityCountry(dto.cityId, dto.countryCode);
    const h = await this.hotels.create({ ...dto, amenities: dto.amenities ?? [] });
    await this.audit.log(actor.id, AuditAction.HOTEL_CREATED, 'hotel', String(h._id), { name: h.name });
    return this.serializeHotel(h);
  }

  async update(id: string, dto: UpdateHotelDto, user: AuthUser) {
    this.assertModerator(user, id);
    const h = await this.getHotel(id);
    if (dto.cityId || dto.countryCode) await this.assertCityCountry(dto.cityId ?? h.cityId, dto.countryCode ?? h.countryCode);
    Object.assign(h, dto);
    await h.save();
    return this.serializeHotel(h);
  }

  async addPhotos(id: string, files: Express.Multer.File[], user: AuthUser) {
    this.assertModerator(user, id);
    const h = await this.getHotel(id);
    this.uploads.validate(files, h.photos.length);
    const saved = await this.uploads.save(files, 'hotels');
    let updated: any = null;
    try {
      updated = await this.hotels.findOneAndUpdate(
        { _id: h._id, ...this.uploads.roomFor('photos', saved.length) },
        { $push: { photos: { $each: saved } } },
        { new: true },
      );
    } finally {
      if (!updated) await this.uploads.removeAll(saved);
    }
    if (!updated) throw this.uploads.limitError();
    return this.serializeHotel(updated);
  }

  async removePhoto(id: string, photoId: string, user: AuthUser) {
    this.assertModerator(user, id);
    const h = await this.getHotel(id);
    const p = h.photos.find((x) => String(x._id) === photoId);
    if (!p) throw notFound('Photo');
    h.photos = h.photos.filter((x) => String(x._id) !== photoId);
    await h.save();
    await this.uploads.remove(p.filename);
    return this.serializeHotel(h);
  }

  /** HTL-09, HTL-10 */
  async setPolicies(id: string, dto: HotelPoliciesDto, user: AuthUser) {
    this.assertModerator(user, id);
    const h = await this.getHotel(id);
    if (dto.cancellationTiers) {
      if (!assertUniqueThresholds(dto.cancellationTiers)) {
        throw new BadRequestException({ message: 'Each cancellation tier must have a unique days-before threshold', field: 'cancellationTiers' });
      }
      h.cancellationTiers = dto.cancellationTiers.map((t) => ({ daysBefore: t.daysBefore, refundPercent: t.refundPercent }));
    }
    if (dto.checkInTime) h.checkInTime = dto.checkInTime;
    if (dto.checkOutTime) h.checkOutTime = dto.checkOutTime;
    await h.save();
    return this.serializeHotel(h);
  }

  /** HTL-02: details page with the latest reviews, and the available rooms when dates are provided. */
  async details(id: string, checkIn?: string, checkOut?: string) {
    const h = await this.getHotel(id);
    const out: any = this.serializeHotel(h);
    // Reviews shown on the hotel page: newest first, first page (full list: GET /hotels/:id/reviews, HTL-24).
    const reviews = await paginateQuery(this.reviews, { hotel: h._id, hidden: false }, 1, { createdAt: -1 }, { path: 'user', select: 'name status' });
    out.reviews = {
      ...reviews,
      items: reviews.items.map((r: any) => ({
        id: String(r._id), author: { id: String(r.user?._id ?? r.user), name: displayName(r.user) },
        rating: r.rating, text: r.text, createdAt: r.createdAt,
      })),
    };
    if (checkIn && checkOut) {
      const free = await this.availableRooms(id, checkIn, checkOut);
      out.availableRooms = free.rooms;
      out.availableRoomsTotal = free.total;
    }
    return out;
  }

  // ------------------------------------------------------------------ rooms (HTL-03..HTL-06)

  listRooms(hotelId: string, user: AuthUser, page = 1) {
    this.assertModerator(user, hotelId);
    return paginateQuery(this.rooms, { hotel: hotelId }, page, { number: 1 }).then((p) => ({
      ...p,
      items: p.items.map((r: any) => this.serializeRoom(r)),
    }));
  }

  async addRoom(hotelId: string, dto: CreateRoomDto, user: AuthUser) {
    this.assertModerator(user, hotelId);
    await this.getHotel(hotelId);
    try {
      const r = await this.rooms.create({ ...dto, hotel: hotelId });
      return this.serializeRoom(r);
    } catch (e) {
      if (isDuplicateKeyError(e)) throw conflict(`Room "${dto.number}" already exists in this hotel`);
      throw e;
    }
  }

  /** True if the room has an upcoming Confirmed or Pending Payment reservation (HTL-06). */
  private async hasActiveReservation(roomId: Types.ObjectId, from?: Date, to?: Date) {
    const date: any = {};
    if (from) date.$gte = from;
    else date.$gte = todayUtc();
    if (to) date.$lte = to;
    return !!(await this.locks.exists({ room: roomId, kind: 'reservation', date, ...activeLockFilter() }));
  }

  async updateRoom(hotelId: string, roomId: string, dto: UpdateRoomDto, user: AuthUser) {
    this.assertModerator(user, hotelId);
    const r = await this.getRoom(hotelId, roomId);
    if (dto.active === false && r.active && (await this.hasActiveReservation(r._id))) {
      throw new ConflictException({ message: 'Room cannot be deactivated while it has Confirmed or Pending Payment reservations (HTL-06)' });
    }
    if (dto.maxOccupancy !== undefined && dto.maxOccupancy < r.maxOccupancy) {
      const upcoming = await this.reservations
        .find({
          'rooms.room': r._id,
          checkOut: { $gt: todayUtc() },
          $or: [{ status: 'Confirmed' }, { status: 'Pending Payment', holdExpiresAt: { $gt: new Date() } }],
        })
        .select('rooms reference')
        .lean();
      const most = Math.max(0, ...upcoming.flatMap((x: any) => x.rooms.filter((y: any) => String(y.room) === String(r._id)).map((y: any) => y.adults + (y.childrenAges?.length ?? 0))));
      if (dto.maxOccupancy < most) {
        throw new ConflictException({ message: `Maximum occupancy cannot be lower than the ${most} guest(s) already booked in this room`, field: 'maxOccupancy' });
      }
    }
    Object.assign(r, dto);
    await r.save();
    return this.serializeRoom(r);
  }

  async deleteRoom(hotelId: string, roomId: string, user: AuthUser) {
    this.assertModerator(user, hotelId);
    const r = await this.getRoom(hotelId, roomId);
    if (r.everReserved || (await this.reservations.exists({ 'rooms.room': r._id }))) {
      throw new ConflictException({ message: 'Only rooms that have never been reserved can be deleted; deactivate it instead (HTL-06)' });
    }
    await this.locks.deleteMany({ room: r._id });
    await r.deleteOne();
    return { deleted: true, id: roomId };
  }

  private overlaps(a: { from: Date; to: Date }, b: { from: Date; to: Date }) {
    return a.from <= b.to && b.from <= a.to;
  }

  /** HTL-04: add a bookable date range (must not overlap existing ranges). */
  async addAvailability(hotelId: string, roomId: string, dto: DateRangeDto, user: AuthUser) {
    this.assertModerator(user, hotelId);
    const r = await this.getRoom(hotelId, roomId);
    const range = this.parseRange(dto.from, dto.to);
    if (r.availability.some((a) => this.overlaps(a, range))) {
      throw new ConflictException({ message: 'Availability ranges for a room must not overlap (HTL-04)' });
    }
    r.availability.push(range as any);
    r.availability.sort((a, b) => a.from.getTime() - b.from.getTime());
    await r.save();
    return this.serializeRoom(r);
  }

  /** Dates in `old` that are not covered by `next` (for HTL-05 "cannot remove availability with reservations"). */
  private removedDates(old: { from: Date; to: Date }, next?: { from: Date; to: Date }) {
    return eachNight(old.from, addDays(old.to, 1)).filter((d) => !next || d < next.from || d > next.to);
  }

  /** HTL-05 / HTL-06: update/remove an availability range, or add/remove a blocked range. */
  async patchAvailability(hotelId: string, roomId: string, dto: PatchAvailabilityDto, user: AuthUser) {
    this.assertModerator(user, hotelId);
    const r = await this.getRoom(hotelId, roomId);

    if (dto.action === 'update' || dto.action === 'remove') {
      if (!dto.rangeId) throw new BadRequestException({ message: 'rangeId is required', field: 'rangeId' });
      const cur = r.availability.find((a) => String(a._id) === dto.rangeId);
      if (!cur) throw notFound('Availability range');
      let next: { from: Date; to: Date } | undefined;
      if (dto.action === 'update') {
        if (!dto.from || !dto.to) throw new BadRequestException({ message: 'from and to are required for update', field: 'from' });
        next = this.parseRange(dto.from, dto.to);
        if (r.availability.some((a) => String(a._id) !== dto.rangeId && this.overlaps(a, next!))) {
          throw new ConflictException({ message: 'Availability ranges for a room must not overlap (HTL-04)' });
        }
      }
      const removed = this.removedDates(cur, next);
      if (removed.length) {
        const clash = await this.locks.exists({ room: r._id, kind: 'reservation', date: { $in: removed }, ...activeLockFilter() });
        if (clash) {
          throw new ConflictException({ message: 'Availability cannot be removed for dates with reservations (HTL-05)' });
        }
      }
      if (next) {
        cur.from = next.from;
        cur.to = next.to;
      } else {
        r.availability = r.availability.filter((a) => String(a._id) !== dto.rangeId);
      }
      await r.save();
      return this.serializeRoom(r);
    }

    if (dto.action === 'block') {
      if (!dto.from || !dto.to) throw new BadRequestException({ message: 'from and to are required for block', field: 'from' });
      const range = this.parseRange(dto.from, dto.to);
      const blockId = new Types.ObjectId();
      const dates = eachNight(range.from, addDays(range.to, 1));
      // Free nights held by expired, unpaid holds so they do not count as reservations.
      await this.locks.deleteMany({ room: r._id, date: { $in: dates }, kind: 'reservation', expiresAt: { $ne: null, $lte: new Date() } });
      try {
        await this.locks.insertMany(
          dates.map((date) => ({ room: r._id, hotel: r.hotel, date, kind: 'block', block: blockId, expiresAt: null })),
          { ordered: true },
        );
      } catch (e) {
        await this.locks.deleteMany({ block: blockId });
        if (isDuplicateKeyError(e)) {
          throw new ConflictException({
            message: 'Blocking rejected: the range overlaps a Confirmed or Pending Payment reservation or an existing block (HTL-06)',
          });
        }
        throw e;
      }
      r.blocks.push({ _id: blockId, from: range.from, to: range.to, reason: dto.reason } as any);
      await r.save();
      return this.serializeRoom(r);
    }

    // unblock
    if (!dto.rangeId) throw new BadRequestException({ message: 'rangeId (block id) is required', field: 'rangeId' });
    const b = r.blocks.find((x) => String(x._id) === dto.rangeId);
    if (!b) throw notFound('Blocked range');
    await this.locks.deleteMany({ room: r._id, block: b._id });
    r.blocks = r.blocks.filter((x) => String(x._id) !== dto.rangeId);
    await r.save();
    return this.serializeRoom(r);
  }

  /** HTL-08: per-room status for a date range. */
  async availabilityGrid(hotelId: string, q: AvailabilityQueryDto, user: AuthUser) {
    this.assertModerator(user, hotelId);
    const range = this.parseRange(q.from, q.to);
    const dates = eachNight(range.from, addDays(range.to, 1));
    if (dates.length > 92) throw new BadRequestException({ message: 'Please request at most 92 days at a time', field: 'to' });
    // Rooms are paginated like every other list (GEN-05).
    const { items: rooms, ...pageInfo } = await paginateQuery(this.rooms, { hotel: hotelId }, q.page, { number: 1 });
    const locks = await this.locks
      .find({ room: { $in: rooms.map((r: any) => r._id) }, date: { $gte: range.from, $lte: range.to }, ...activeLockFilter() })
      .lean();
    const resIds = [...new Set(locks.filter((l) => l.reservation).map((l) => String(l.reservation)))];
    const resMap = new Map(
      (await this.reservations.find({ _id: { $in: resIds } }).select('reference status').lean()).map((x) => [String(x._id), x]),
    );
    const lockMap = new Map(locks.map((l) => [`${l.room}|${l.date.toISOString()}`, l]));
    return {
      hotelId,
      from: q.from,
      to: q.to,
      ...pageInfo,
      rooms: rooms.map((r: any) => ({
        roomId: String(r._id),
        number: r.number,
        type: r.type,
        active: r.active,
        days: dates.map((d) => {
          const l = lockMap.get(`${r._id}|${d.toISOString()}`);
          if (l?.kind === 'block') return { date: formatDateOnly(d), status: 'Blocked' };
          if (l?.kind === 'reservation') {
            const res = resMap.get(String(l.reservation));
            return { date: formatDateOnly(d), status: 'Booked', reservationReference: res?.reference ?? null, reservationStatus: res?.status };
          }
          const bookable = r.active && r.availability.some((a: any) => d >= a.from && d <= a.to);
          return { date: formatDateOnly(d), status: bookable ? 'Available' : 'Unavailable' };
        }),
      })),
    };
  }

  // ------------------------------------------------------------------ availability engine (HTL-11, HTL-15, HTL-18)

  /** Rooms of the given hotels that are free for every night of the stay. */
  async freeRoomsFor(hotelIds: Types.ObjectId[], dates: Date[]) {
    const rooms = await this.rooms.find({ hotel: { $in: hotelIds }, active: true }).lean();
    const covered = rooms.filter((r) => dates.every((d) => r.availability.some((a) => d >= a.from && d <= a.to)));
    if (!covered.length) return [];
    const busy = await this.locks
      .find({ room: { $in: covered.map((r) => r._id) }, date: { $in: dates }, ...activeLockFilter() })
      .distinct('room');
    const busySet = new Set(busy.map(String));
    return covered.filter((r) => !busySet.has(String(r._id)));
  }

  /** HTL-15 (paginated, GEN-05). */
  async availableRooms(hotelId: string, checkIn: string, checkOut: string, page = 1) {
    const h = await this.getHotel(hotelId);
    const stay = this.parseStay(checkIn, checkOut, await this.todayForCity(h.cityId));
    if (!h.active) {
      return { hotelId, checkIn, checkOut, nights: stay.nights, rooms: [], page: 1, pageSize: 10, total: 0, totalPages: 1, message: 'This hotel is not accepting bookings' };
    }
    const free = await this.freeRoomsFor([h._id], stay.dates);
    free.sort((a, b) => a.pricePerNight - b.pricePerNight || String(a.number).localeCompare(String(b.number)));
    const { items, ...pageInfo } = paginateArray(free, page);
    return {
      hotelId,
      checkIn,
      checkOut,
      nights: stay.nights,
      rooms: items.map((r) => {
        const s = this.serializeRoom(r, stay.nights);
        return { id: s.id, number: s.number, type: s.type, beds: s.beds, maxOccupancy: s.maxOccupancy, pricePerNight: s.pricePerNight, nights: s.nights, totalStayPrice: s.totalStayPrice };
      }),
      ...pageInfo,
      message: free.length ? undefined : 'No rooms are free for these dates',
    };
  }

  /** HTL-11 / HTL-12 (also reused by ITN-25). */
  async search(q: HotelSearchDto) {
    if (!q.cityId && !q.countryCode) {
      throw new BadRequestException({ message: 'Provide a city or a country to search', field: 'cityId' });
    }
    if (q.minPrice !== undefined && q.maxPrice !== undefined && q.minPrice > q.maxPrice) {
      throw new BadRequestException({ message: 'Minimum price cannot be greater than maximum price', field: 'minPrice' });
    }
    const zone = q.cityId ? await this.ref.cityTimeZone(q.cityId) : await this.ref.countryTimeZone(q.countryCode as string);
    const stay = this.parseStay(q.checkIn, q.checkOut, todayInZone(zone));
    const filter: any = { active: true };
    if (q.cityId) {
      await this.ref.getCity(q.cityId, 'cityId');
      filter.cityId = q.cityId;
    }
    if (q.countryCode) {
      await this.ref.getCountry(q.countryCode, 'countryCode');
      filter.countryCode = q.countryCode;
    }
    if (q.minRating !== undefined) filter.avgRating = { $ne: null, $gte: q.minRating };

    const hotels = await this.hotels.find(filter).lean();
    const free = await this.freeRoomsFor(hotels.map((h) => h._id), stay.dates);
    const byHotel = new Map<string, any[]>();
    for (const r of free) {
      const k = String(r.hotel);
      if (!byHotel.has(k)) byHotel.set(k, []);
      byHotel.get(k)!.push(r);
    }
    const roomsNeeded = q.rooms ?? 1;
    const results: any[] = [];
    for (const h of hotels) {
      const list = byHotel.get(String(h._id)) ?? [];
      if (list.length < roomsNeeded) continue;
      const topCapacity = [...list].sort((a, b) => b.maxOccupancy - a.maxOccupancy).slice(0, roomsNeeded).reduce((s, r) => s + r.maxOccupancy, 0);
      if (topCapacity < q.guests) continue;
      const cheapest = Math.min(...list.map((r) => r.pricePerNight));
      if (q.minPrice !== undefined && cheapest < q.minPrice) continue;
      if (q.maxPrice !== undefined && cheapest > q.maxPrice) continue;
      results.push({
        id: String(h._id),
        name: h.name,
        address: h.address,
        cityId: h.cityId,
        countryCode: h.countryCode,
        starClass: h.starClass,
        amenities: h.amenities,
        photo: h.photos?.[0]?.url ?? null,
        averageRating: h.avgRating,
        ratingsCount: h.ratingsCount,
        pricePerNight: cheapest,
        freeRooms: list.length,
        nights: stay.nights,
      });
    }
    const dir = q.sortOrder === 'desc' ? -1 : 1;
    results.sort((a, b) =>
      (q.sortBy === 'rating' ? ((a.averageRating ?? 0) - (b.averageRating ?? 0)) * dir : (a.pricePerNight - b.pricePerNight) * dir) ||
      String(a.id).localeCompare(String(b.id)), // stable order across pages
    );
    const page = paginateArray(results, q.page);
    return {
      criteria: {
        cityId: q.cityId ?? null, countryCode: q.countryCode ?? null, checkIn: q.checkIn, checkOut: q.checkOut,
        guests: q.guests, rooms: roomsNeeded, minPrice: q.minPrice ?? null, maxPrice: q.maxPrice ?? null,
        minRating: q.minRating ?? null, sortBy: q.sortBy, sortOrder: q.sortOrder,
      },
      ...page,
      message: results.length ? undefined : 'No hotels found',
    };
  }

  // ------------------------------------------------------------------ lock primitives (used by HotelBookingsService)

  /** HTL-18: lock every night of every room atomically; all-or-nothing. */
  async lockRooms(reservationId: Types.ObjectId, hotelId: Types.ObjectId, roomIds: Types.ObjectId[], dates: Date[], expiresAt: Date) {
    // Expired unpaid holds no longer occupy inventory.
    await this.locks.deleteMany({ room: { $in: roomIds }, date: { $in: dates }, kind: 'reservation', expiresAt: { $ne: null, $lte: new Date() } });
    const docs = roomIds.flatMap((room) =>
      dates.map((date) => ({ room, hotel: hotelId, date, kind: 'reservation', reservation: reservationId, expiresAt })),
    );
    try {
      await this.locks.insertMany(docs, { ordered: true });
      await this.rooms.updateMany({ _id: { $in: roomIds } }, { $set: { everReserved: true } });
      return true;
    } catch (e) {
      await this.locks.deleteMany({ reservation: reservationId });
      if (isDuplicateKeyError(e)) return false;
      throw e;
    }
  }

  confirmLocks(reservationId: Types.ObjectId | string) {
    return this.locks.updateMany({ reservation: reservationId }, { $set: { expiresAt: null } });
  }

  releaseLocks(reservationId: Types.ObjectId | string) {
    return this.locks.deleteMany({ reservation: reservationId });
  }

  roomsByIds(hotelId: string, ids: string[]) {
    return this.rooms.find({ hotel: hotelId, _id: { $in: ids } }).lean();
  }
}
