import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Response } from 'express';
import { User } from './schemas/user.schema';
import { FlightBooking } from '../flight-bookings/schemas/flight-booking.schema';
import { HotelReservation } from '../hotel-bookings/schemas/hotel-reservation.schema';
import { Post } from '../blog/schemas/blog.schemas';
import { Itinerary } from '../itineraries/schemas/itinerary.schema';
import { AuthService } from '../auth/auth.service';
import { ReferenceService } from '../reference/reference.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccountStatus, BookingStatus, Role } from '../../common/enums';
import { forbidden, notFound } from '../../common/utils/errors';
import { todayUtc } from '../../common/utils/dates';
import { UpdateProfileDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private users: Model<User>,
    @InjectModel(FlightBooking.name) private flightBookings: Model<FlightBooking>,
    @InjectModel(HotelReservation.name) private hotelReservations: Model<HotelReservation>,
    @InjectModel(Post.name) private posts: Model<Post>,
    @InjectModel(Itinerary.name) private itineraries: Model<Itinerary>,
    private auth: AuthService,
    private ref: ReferenceService,
  ) {}

  /** ACC-11 */
  async me(user: AuthUser) {
    return this.auth.me(user.id);
  }

  /** ACC-09: save only if all fields pass validation. */
  async update(user: AuthUser, dto: UpdateProfileDto) {
    const u = await this.users.findById(user.id);
    if (!u) throw notFound('Account');
    if (dto.preferredCurrency) await this.ref.assertCurrency(dto.preferredCurrency, 'preferredCurrency');
    if (dto.name !== undefined) u.name = dto.name;
    if (dto.phone !== undefined) u.phone = dto.phone;
    if (dto.preferredCurrency !== undefined) u.preferredCurrency = dto.preferredCurrency;
    await u.save();
    return this.auth.publicUser(u);
  }

  /** ACC-12 */
  async deactivate(user: AuthUser, res: Response) {
    if (user.role !== Role.USER) throw forbidden('Only registered users can deactivate their own account');
    const now = new Date();
    const upcomingFlight = await this.flightBookings.exists({ user: user.id, status: BookingStatus.CONFIRMED, travelDate: { $gt: now } });
    const upcomingHotel = await this.hotelReservations.exists({ user: user.id, status: BookingStatus.CONFIRMED, checkOut: { $gte: todayUtc() } });
    if (upcomingFlight || upcomingHotel) {
      throw new ConflictException({
        message: 'Your account cannot be deactivated while you have upcoming Confirmed bookings. Cancel them first or wait until they are completed.',
        code: 'UPCOMING_BOOKINGS',
      });
    }
    await this.users.updateOne({ _id: user.id }, { $set: { status: AccountStatus.DEACTIVATED, deactivatedAt: now } });
    // Posts and public itineraries are hidden; comments/reviews render as "Deleted user".
    await this.posts.updateMany({ author: user.id }, { $set: { authorDeactivated: true } });
    await this.itineraries.updateMany({ owner: user.id }, { $set: { authorDeactivated: true } });
    await this.auth.revokeAllSessions(user.id);
    this.auth.clearCookies(res);
    return { message: 'Your account has been deactivated' };
  }
}
