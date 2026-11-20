import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { Airline } from '../flights/schemas/airline.schema';
import { Hotel } from '../hotels/schemas/hotel.schema';
import { FlightBooking } from '../flight-bookings/schemas/flight-booking.schema';
import { HotelReservation } from '../hotel-bookings/schemas/hotel-reservation.schema';
import { AuthService } from '../auth/auth.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccountStatus, BookingStatus, BookingType, NotificationType, Role } from '../../common/enums';
import { notFound } from '../../common/utils/errors';
import { addDays, formatDateOnly, parseDateOnly } from '../../common/utils/dates';
import { paginateAggregate, paginateQuery } from '../../common/utils/pagination';
import { containsInsensitive } from '../../common/utils/regex';
import { AccountsQueryDto, AdminBookingsQueryDto, CreateModeratorDto } from './dto/admin.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private users: Model<User>,
    @InjectModel(Airline.name) private airlines: Model<Airline>,
    @InjectModel(Hotel.name) private hotels: Model<Hotel>,
    @InjectModel(FlightBooking.name) private flightBookings: Model<FlightBooking>,
    @InjectModel(HotelReservation.name) private hotelReservations: Model<HotelReservation>,
    private auth: AuthService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  private account(u: any) {
    return {
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      registeredAt: u.createdAt,
      airlineId: u.airline ? String(u.airline) : null,
      hotelId: u.hotel ? String(u.hotel) : null,
      mustChangePassword: !!u.mustChangePassword,
    };
  }

  /** ACC-13 */
  async createModerator(dto: CreateModeratorDto, admin: AuthUser) {
    if (await this.users.exists({ email: dto.email })) {
      throw new ConflictException({ message: 'This email is already registered', errors: [{ field: 'email', messages: ['This email is already registered'] }] });
    }
    const isAirline = dto.role === Role.AIRLINE_MODERATOR;
    const provider = isAirline ? await this.airlines.findById(dto.providerId).lean() : await this.hotels.findById(dto.providerId).lean();
    if (!provider) throw new BadRequestException({ message: `${isAirline ? 'Airline' : 'Hotel'} not found`, field: 'providerId' });
    const u = await this.users.create({
      name: dto.name,
      email: dto.email,
      passwordHash: await AuthService.hashPassword(dto.temporaryPassword),
      role: dto.role,
      mustChangePassword: true,
      ...(isAirline ? { airline: provider._id } : { hotel: provider._id }),
    });
    await this.audit.log(admin.id, AuditAction.MODERATOR_CREATED, 'user', String(u._id), {
      role: dto.role, providerId: dto.providerId, providerName: provider.name,
    });
    return this.account(u);
  }

  /** ACC-14 */
  async accounts(q: AccountsQueryDto) {
    const filter: any = {};
    if (q.role) filter.role = q.role;
    if (q.status) filter.status = q.status;
    if (q.q?.trim()) {
      const rx = containsInsensitive(q.q);
      filter.$or = [{ name: rx }, { email: rx }];
    }
    const res = await paginateQuery(this.users, filter, q.page, { createdAt: -1 });
    return { ...res, items: res.items.map((u) => this.account(u)) };
  }

  private async getAccount(id: string) {
    const u = await this.users.findById(id);
    if (!u) throw notFound('Account');
    return u;
  }

  /** ACC-15 (moderators) / ACC-16 (registered users) */
  async suspend(id: string, admin: AuthUser) {
    this.auth.assertNotSelf(admin.id, id);
    const u = await this.getAccount(id);
    if (u.role === Role.ADMIN) throw new BadRequestException({ message: 'Admin accounts cannot be suspended' });
    if (u.status !== AccountStatus.ACTIVE) throw new ConflictException({ message: `Account is ${u.status}; only active accounts can be suspended` });
    u.status = AccountStatus.SUSPENDED;
    u.suspendedAt = new Date();
    await u.save();
    await this.auth.revokeAllSessions(u._id);
    await this.audit.log(admin.id, AuditAction.ACCOUNT_SUSPENDED, 'user', id, { role: u.role, email: u.email });
    await this.notifications.notify(u._id, NotificationType.ACCOUNT_SUSPENDED, 'Account suspended', 'Your account has been suspended by an administrator.');
    return this.account(u);
  }

  async reactivate(id: string, admin: AuthUser) {
    const u = await this.getAccount(id);
    if (u.status !== AccountStatus.SUSPENDED) throw new ConflictException({ message: `Account is ${u.status}; only suspended accounts can be reactivated` });
    u.status = AccountStatus.ACTIVE;
    u.suspendedAt = undefined;
    await u.save();
    await this.audit.log(admin.id, AuditAction.ACCOUNT_REACTIVATED, 'user', id, { role: u.role, email: u.email });
    await this.notifications.notify(u._id, NotificationType.ACCOUNT_REACTIVATED, 'Account reactivated', 'Your account has been reactivated by an administrator.');
    return this.account(u);
  }

  /** ACC-07a */
  async resetPassword(id: string, temporaryPassword: string, admin: AuthUser) {
    this.auth.assertNotSelf(admin.id, id);
    const u = await this.getAccount(id);
    if (u.role === Role.ADMIN) throw new BadRequestException({ message: "Admin passwords cannot be reset through this endpoint" });
    u.passwordHash = await AuthService.hashPassword(temporaryPassword);
    u.mustChangePassword = true;
    u.failedLoginAttempts = 0;
    u.lockUntil = undefined;
    await u.save();
    await this.auth.revokeAllSessions(u._id);
    await this.audit.log(admin.id, AuditAction.PASSWORD_RESET, 'user', id, { email: u.email });
    return { id, mustChangePassword: true, message: 'Temporary password set. The account must choose a new password at next login.' };
  }

  /** ACC-15: deactivate / reactivate a hotel or airline. */
  async setProviderActive(type: 'airline' | 'hotel', id: string, active: boolean, admin: AuthUser) {
    const model: Model<any> = type === 'airline' ? this.airlines : this.hotels;
    const p = await model.findById(id);
    if (!p) throw notFound(type === 'airline' ? 'Airline' : 'Hotel');
    if (p.active === active) throw new ConflictException({ message: `${p.name} is already ${active ? 'active' : 'deactivated'}` });
    p.active = active;
    await p.save();
    await this.audit.log(admin.id, active ? AuditAction.PROVIDER_REACTIVATED : AuditAction.PROVIDER_DEACTIVATED, type, id, { name: p.name });
    // Affected parties (ACC-15): the provider's moderators and every user holding a Confirmed booking with it.
    const moderators = await this.users.find(type === 'airline' ? { airline: p._id } : { hotel: p._id }).select('_id').lean();
    const bookingModel: Model<any> = type === 'airline' ? this.flightBookings : this.hotelReservations;
    const bookingFilter = type === 'airline'
      ? { 'segments.airline': p._id, status: BookingStatus.CONFIRMED }
      : { hotel: p._id, status: BookingStatus.CONFIRMED };
    const customerIds: Types.ObjectId[] = await bookingModel.distinct('user', bookingFilter);
    const recipients = [...new Map([...moderators.map((m) => m._id), ...customerIds].map((x) => [String(x), x])).values()];
    await this.notifications.notifyMany(
      recipients,
      active ? NotificationType.PROVIDER_REACTIVATED : NotificationType.PROVIDER_DEACTIVATED,
      `${p.name} ${active ? 'reactivated' : 'deactivated'}`,
      active
        ? `${p.name} has been reactivated; its listings are visible and bookable again.`
        : `${p.name} has been deactivated by an administrator; its listings are hidden from search and cannot be booked. Existing Confirmed bookings remain valid.`,
      { providerType: type, providerId: id },
    );
    return { id, type, name: p.name, active: p.active };
  }

  async providers(type: 'airline' | 'hotel', page = 1, q?: string) {
    const model: Model<any> = type === 'airline' ? this.airlines : this.hotels;
    const filter: any = q?.trim() ? { name: containsInsensitive(q) } : {};
    const res = await paginateQuery(model, filter, page, { name: 1 });
    return {
      ...res,
      items: res.items.map((p: any) => ({
        id: String(p._id), name: p.name, active: p.active,
        ...(type === 'airline' ? { code: p.code } : { cityId: p.cityId, countryCode: p.countryCode, starClass: p.starClass }),
      })),
    };
  }

  /** ACC-17: read-only list of all flight and hotel bookings. */
  async bookings(q: AdminBookingsQueryDto) {
    const dateFilter: any = {};
    if (q.from && q.to && parseDateOnly(q.from, 'from') > parseDateOnly(q.to, 'to')) {
      throw new BadRequestException({ message: '"from" cannot be after "to"', field: 'from' });
    }
    if (q.from) dateFilter.$gte = parseDateOnly(q.from, 'from');
    if (q.to) dateFilter.$lt = addDays(parseDateOnly(q.to, 'to'), 1);
    const statusMatch = q.status ? { status: q.status } : {};

    const flightPipe: PipelineStage[] = [
      { $match: { ...statusMatch, ...(Object.keys(dateFilter).length ? { travelDate: dateFilter } : {}) } },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'u' } },
      { $lookup: { from: 'airlines', localField: 'segments.0.airline', foreignField: '_id', as: 'p' } },
      {
        $project: {
          type: { $literal: BookingType.FLIGHT }, reference: 1, status: 1, amount: '$total', currency: 1,
          date: '$travelDate', endDate: '$lastDepartureTime', createdAt: 1,
          user: { $let: { vars: { x: { $first: '$u' } }, in: { id: '$$x._id', name: '$$x.name', email: '$$x.email' } } },
          provider: { $let: { vars: { x: { $first: '$p' } }, in: { id: '$$x._id', name: '$$x.name' } } },
          detail: { $reduce: { input: '$segments', initialValue: '', in: { $concat: ['$$value', { $cond: [{ $eq: ['$$value', ''] }, '', ' / '] }, '$$this.flightNumber'] } } },
        },
      },
    ];
    const hotelPipe: PipelineStage[] = [
      { $match: { ...statusMatch, ...(Object.keys(dateFilter).length ? { checkIn: dateFilter } : {}) } },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'u' } },
      { $lookup: { from: 'hotels', localField: 'hotel', foreignField: '_id', as: 'p' } },
      {
        $project: {
          type: { $literal: BookingType.HOTEL }, reference: 1, status: 1, amount: '$total', currency: 1,
          date: '$checkIn', endDate: '$checkOut', createdAt: 1,
          user: { $let: { vars: { x: { $first: '$u' } }, in: { id: '$$x._id', name: '$$x.name', email: '$$x.email' } } },
          provider: { $let: { vars: { x: { $first: '$p' } }, in: { id: '$$x._id', name: '$$x.name' } } },
          detail: { $concat: [{ $toString: { $size: '$rooms' } }, ' room(s)'] },
        },
      },
    ];

    let base: Model<any>;
    let pipeline: PipelineStage[];
    if (q.type === BookingType.FLIGHT) {
      base = this.flightBookings;
      pipeline = [...flightPipe];
    } else if (q.type === BookingType.HOTEL) {
      base = this.hotelReservations;
      pipeline = [...hotelPipe];
    } else {
      base = this.flightBookings;
      pipeline = [...flightPipe, { $unionWith: { coll: 'hotel_reservations', pipeline: hotelPipe as any } }];
    }
    pipeline.push({ $sort: { date: -1, createdAt: -1, _id: 1 } }); // _id: stable order across pages (GEN-05)
    const res = await paginateAggregate(base, pipeline, q.page);
    return {
      ...res,
      items: res.items.map((b: any) => ({
        id: String(b._id), type: b.type, reference: b.reference ?? null, status: b.status,
        user: b.user?.id ? { id: String(b.user.id), name: b.user.name, email: b.user.email } : null,
        provider: b.provider?.id ? { id: String(b.provider.id), name: b.provider.name } : null,
        detail: b.detail,
        dates: { start: b.type === BookingType.HOTEL ? formatDateOnly(b.date) : b.date, end: b.type === BookingType.HOTEL ? formatDateOnly(b.endDate) : b.endDate },
        amount: b.amount, currency: b.currency, createdAt: b.createdAt,
      })),
    };
  }

  isValidId(id: string) {
    return Types.ObjectId.isValid(id);
  }
}
