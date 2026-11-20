import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review } from './schemas/review.schema';
import { Hotel } from '../hotels/schemas/hotel.schema';
import { HotelReservation } from '../hotel-bookings/schemas/hotel-reservation.schema';
import { displayName } from '../users/schemas/user.schema';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { BookingStatus, Role } from '../../common/enums';
import { notFound } from '../../common/utils/errors';
import { paginateQuery } from '../../common/utils/pagination';
import { CreateReviewDto, UpdateReviewDto } from './reviews.dto';
import { HotelsService } from '../hotels/hotels.service';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private reviews: Model<Review>,
    @InjectModel(Hotel.name) private hotels: Model<Hotel>,
    @InjectModel(HotelReservation.name) private reservations: Model<HotelReservation>,
    private hotelsService: HotelsService,
  ) {}

  /** HTL-23: average rating recalculated from visible reviews. */
  async recalc(hotelId: Types.ObjectId | string) {
    const [agg] = await this.reviews.aggregate([
      { $match: { hotel: new Types.ObjectId(String(hotelId)), hidden: false } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    await this.hotels.updateOne(
      { _id: hotelId },
      { $set: { avgRating: agg ? Math.round(agg.avg * 10) / 10 : null, ratingsCount: agg?.count ?? 0 } },
    );
  }

  private serialize(r: any) {
    return {
      id: String(r._id),
      hotelId: String(r.hotel),
      reservationId: String(r.reservation),
      author: r.user && typeof r.user === 'object' && 'name' in r.user
        ? { id: String(r.user._id), name: displayName(r.user) }
        : { id: String(r.user), name: null },
      rating: r.rating,
      text: r.text,
      hidden: r.hidden,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  /** HTL-23 */
  async create(reservationId: string, dto: CreateReviewDto, user: AuthUser) {
    // HTL-23: Confirmed becomes Completed once the check-out date has passed on the hotel's calendar (do not wait for the scheduler).
    const pending = await this.reservations.findById(reservationId).select('hotel status').lean();
    if (pending?.status === BookingStatus.CONFIRMED) {
      const h = await this.hotels.findById(pending.hotel).select('cityId').lean();
      await this.reservations.updateOne(
        { _id: reservationId, status: BookingStatus.CONFIRMED, checkOut: { $lt: await this.hotelsService.todayForCity(h?.cityId ?? '') } },
        { $set: { status: BookingStatus.COMPLETED, completedAt: new Date() } },
      );
    }
    const res = await this.reservations.findById(reservationId).lean();
    if (!res || String(res.user) !== user.id) throw notFound('Hotel reservation');
    if (res.status !== BookingStatus.COMPLETED) {
      throw new ConflictException({ message: 'Only Completed reservations (after check-out) can be reviewed (HTL-23)' });
    }
    if (await this.reviews.exists({ reservation: res._id })) {
      throw new ConflictException({ message: 'You have already reviewed this reservation; edit your existing review instead' });
    }
    const r = await this.reviews.create({ hotel: res.hotel, reservation: res._id, user: user.id, rating: dto.rating, text: dto.text ?? '' });
    await this.recalc(res.hotel);
    return this.serialize(await r.populate('user', 'name status'));
  }

  private async getOwn(id: string, user: AuthUser) {
    const r = await this.reviews.findById(id);
    if (!r || String(r.user) !== user.id) throw notFound('Review');
    return r;
  }

  async update(id: string, dto: UpdateReviewDto, user: AuthUser) {
    const r = await this.getOwn(id, user);
    if (dto.rating !== undefined) r.rating = dto.rating;
    if (dto.text !== undefined) r.text = dto.text;
    await r.save();
    await this.recalc(r.hotel);
    return this.serialize(await r.populate('user', 'name status'));
  }

  async remove(id: string, user: AuthUser) {
    const r = await this.getOwn(id, user);
    await r.deleteOne();
    await this.recalc(r.hotel);
    return { deleted: true, id };
  }

  /** HTL-24: average, count and reviews (newest first, paginated). */
  async forHotel(hotelId: string, page = 1, viewer?: AuthUser) {
    const hotel = await this.hotels.findById(hotelId).lean();
    if (!hotel) throw notFound('Hotel');
    const filter: any = { hotel: hotel._id };
    if (viewer?.role !== Role.ADMIN) {
      filter.$or = [{ hidden: false }, ...(viewer ? [{ user: new Types.ObjectId(viewer.id) }] : [])];
    }
    const res = await paginateQuery(this.reviews, filter, page, { createdAt: -1 }, { path: 'user', select: 'name status' });
    return {
      hotelId,
      averageRating: hotel.avgRating,
      ratingsCount: hotel.ratingsCount,
      ...res,
      items: res.items.map((r: any) => this.serialize(r)),
    };
  }
}
