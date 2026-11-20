import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { Itinerary, ItineraryDocument } from './schemas/itinerary.schema';
import { User, displayName } from '../users/schemas/user.schema';
import {
  CreateActivityDto, CreateBudgetDto, CreateDayDto, CreateItineraryDto, CreateTransportCostDto, ItineraryFlightSearchDto,
  ItineraryHotelSearchDto, PublicItinerarySearchDto, ReorderDayDto, UpdateActivityDto, UpdateBudgetDto, UpdateDayDto,
  UpdateItineraryDto, UpdateTransportCostDto,
} from './dto/itinerary.dto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { BudgetCategory, PLATFORM_CURRENCY, Role, Visibility } from '../../common/enums';
import { notFound } from '../../common/utils/errors';
import { addDays, formatDateOnly, parseDateOnly } from '../../common/utils/dates';
import { paginateQuery } from '../../common/utils/pagination';
import { containsInsensitive } from '../../common/utils/regex';
import { ReferenceService } from '../reference/reference.service';
import { ExchangeRatesService, RateTable } from '../exchange-rates/exchange-rates.service';
import { UploadsService } from '../uploads/uploads.service';
import { HotelsService } from '../hotels/hotels.service';
import { FlightsService } from '../flights/flights.service';
import { money } from '../../common/utils/refund';

const MAX_DAYS = 60; // ITN-05

@Injectable()
export class ItinerariesService {
  constructor(
    @InjectModel(Itinerary.name) private itineraries: Model<Itinerary>,
    @InjectModel(User.name) private users: Model<User>,
    private ref: ReferenceService,
    private fx: ExchangeRatesService,
    private uploads: UploadsService,
    private hotels: HotelsService,
    private flights: FlightsService,
  ) {}

  // ------------------------------------------------------------------ access helpers (ACC-11)

  private async getOwned(id: string, user: AuthUser): Promise<ItineraryDocument> {
    const it = await this.itineraries.findById(id);
    if (!it || String(it.owner) !== user.id) throw notFound('Itinerary');
    return it;
  }

  private async findOwnedBy(path: string, subId: string, user: AuthUser) {
    if (!Types.ObjectId.isValid(subId)) throw notFound('Item');
    const it = await this.itineraries.findOne({ [path]: new Types.ObjectId(subId) });
    if (!it || String(it.owner) !== user.id) throw notFound('Item');
    return it;
  }

  private findDay(it: ItineraryDocument, dayId: string) {
    const d = it.days.find((x) => String(x._id) === dayId);
    if (!d) throw notFound('Itinerary day');
    return d;
  }

  private async preferredCurrency(user?: AuthUser) {
    if (!user) return PLATFORM_CURRENCY;
    const u = await this.users.findById(user.id).select('preferredCurrency').lean();
    return u?.preferredCurrency ?? PLATFORM_CURRENCY;
  }

  // ------------------------------------------------------------------ derived views (ITN-05, ITN-09)

  private cityGroups(it: any, cityNames: Map<string, string>) {
    const groups: any[] = [];
    it.days.forEach((d: any, i: number) => {
      const last = groups[groups.length - 1];
      if (last && last.cityId === d.cityId) {
        last.endDayNumber = i + 1;
        last.dayIds.push(String(d._id));
      } else {
        groups.push({ cityId: d.cityId, cityName: cityNames.get(d.cityId) ?? d.cityId, startDayNumber: i + 1, endDayNumber: i + 1, dayIds: [String(d._id)] });
      }
    });
    return groups.map((g) => ({
      ...g,
      startDayId: g.dayIds[0],
      dayCount: g.endDayNumber - g.startDayNumber + 1,
      startDate: formatDateOnly(addDays(it.startDate, g.startDayNumber - 1)),
      endDate: formatDateOnly(addDays(it.startDate, g.endDayNumber - 1)),
    }));
  }

  async serialize(it: any, opts: { includeOwnerFields?: boolean } = {}) {
    const cities = new Map((await this.ref.listCities()).map((c: any) => [c._id, c.name]));
    const owner = it.owner && typeof it.owner === 'object' && 'name' in it.owner ? it.owner : await this.users.findById(it.owner).select('name status').lean();
    const groups = this.cityGroups(it, cities);
    return {
      id: String(it._id),
      title: it.title,
      countries: it.countries,
      startDate: formatDateOnly(it.startDate),
      endDate: it.days.length ? formatDateOnly(addDays(it.startDate, it.days.length - 1)) : null,
      dayCount: it.days.length,
      visibility: it.visibility,
      author: { id: String(owner?._id ?? it.owner), name: displayName(owner) },
      clonedFrom: it.clonedFrom?.itinerary
        ? { itineraryId: String(it.clonedFrom.itinerary), authorId: String(it.clonedFrom.author), authorName: it.clonedFrom.authorName, title: it.clonedFrom.title }
        : null,
      ...(opts.includeOwnerFields ? { hidden: it.hidden } : {}),
      days: it.days.map((d: any, i: number) => ({
        id: String(d._id),
        dayNumber: i + 1,
        date: formatDateOnly(addDays(it.startDate, i)),
        cityId: d.cityId,
        cityName: cities.get(d.cityId) ?? d.cityId,
        notes: d.notes,
        activities: d.activities.map((a: any) => ({
          id: String(a._id), name: a.name, description: a.description, time: a.time ?? null, cost: a.cost ?? null,
          currency: a.currency ?? null, images: a.images.map((im: any) => ({ id: String(im._id), url: im.url })),
        })),
        budgets: d.budgets.map((b: any) => ({ id: String(b._id), category: b.category, amount: b.amount, currency: b.currency, description: b.description })),
      })),
      transportCosts: it.transportCosts.map((t: any) => ({
        id: String(t._id), mode: t.mode, fromCityId: t.fromCityId, toCityId: t.toCityId, amount: t.amount,
        currency: t.currency, dayId: String(t.dayId),
        dayNumber: it.days.findIndex((d: any) => String(d._id) === String(t.dayId)) + 1 || null,
      })),
      cityGroups: groups,
      createdAt: it.createdAt,
      updatedAt: it.updatedAt,
    };
  }

  // ------------------------------------------------------------------ CRUD (ITN-01, ITN-03, ITN-20)

  async create(dto: CreateItineraryDto, user: AuthUser) {
    const countries = await this.ref.assertCountries(dto.countries);
    const it = await this.itineraries.create({
      owner: user.id,
      title: dto.title,
      countries,
      startDate: parseDateOnly(dto.startDate, 'startDate'),
      visibility: Visibility.PRIVATE,
    });
    return this.serialize(it, { includeOwnerFields: true });
  }

  async listMine(user: AuthUser, page = 1) {
    const res = await paginateQuery(this.itineraries, { owner: user.id }, page, { updatedAt: -1 });
    return {
      ...res,
      items: res.items.map((it: any) => ({
        id: String(it._id), title: it.title, countries: it.countries, startDate: formatDateOnly(it.startDate),
        days: it.days.length, visibility: it.visibility, hidden: it.hidden, updatedAt: it.updatedAt,
      })),
    };
  }

  async getMine(id: string, user: AuthUser) {
    return this.serialize(await this.getOwned(id, user), { includeOwnerFields: true });
  }

  async update(id: string, dto: UpdateItineraryDto, user: AuthUser) {
    const it = await this.getOwned(id, user);
    if (dto.title !== undefined) it.title = dto.title;
    if (dto.countries) it.countries = await this.ref.assertCountries(dto.countries);
    if (dto.startDate) it.startDate = parseDateOnly(dto.startDate, 'startDate');
    if (dto.visibility) it.visibility = dto.visibility;
    await it.save();
    return this.serialize(it, { includeOwnerFields: true });
  }

  /** ITN-01: clones made by other users are independent documents and remain unaffected. */
  async remove(id: string, user: AuthUser) {
    const it = await this.getOwned(id, user);
    const files = it.days.flatMap((d) => d.activities.flatMap((a) => a.images.map((im) => im.filename)));
    await it.deleteOne();
    for (const f of files) await this.uploads.remove(f);
    return { deleted: true, id };
  }

  // ------------------------------------------------------------------ days (ITN-05, ITN-07, ITN-08)

  async addDay(id: string, dto: CreateDayDto, user: AuthUser) {
    const it = await this.getOwned(id, user);
    if (it.days.length >= MAX_DAYS) throw new BadRequestException({ message: `An itinerary can have at most ${MAX_DAYS} days` });
    await this.ref.getCity(dto.cityId, 'cityId');
    const day = { _id: new Types.ObjectId(), cityId: dto.cityId, notes: dto.notes ?? '', activities: [], budgets: [] } as any;
    const pos = dto.position ? Math.min(dto.position, it.days.length + 1) - 1 : it.days.length;
    it.days.splice(pos, 0, day);
    await it.save();
    return this.serialize(it, { includeOwnerFields: true });
  }

  async updateDay(id: string, dayId: string, dto: UpdateDayDto, user: AuthUser) {
    const it = await this.getOwned(id, user);
    const d = this.findDay(it, dayId);
    if (dto.cityId) {
      await this.ref.getCity(dto.cityId, 'cityId');
      d.cityId = dto.cityId;
    }
    if (dto.notes !== undefined) d.notes = dto.notes;
    await it.save();
    return this.serialize(it, { includeOwnerFields: true });
  }

  async deleteDay(id: string, dayId: string, user: AuthUser) {
    const it = await this.getOwned(id, user);
    const d = this.findDay(it, dayId);
    const files = d.activities.flatMap((a) => a.images.map((im) => im.filename));
    it.days = it.days.filter((x) => String(x._id) !== dayId);
    it.transportCosts = it.transportCosts.filter((t) => String(t.dayId) !== dayId);
    await it.save();
    for (const f of files) await this.uploads.remove(f);
    return this.serialize(it, { includeOwnerFields: true });
  }

  async reorderDay(id: string, dto: ReorderDayDto, user: AuthUser) {
    const it = await this.getOwned(id, user);
    const idx = it.days.findIndex((x) => String(x._id) === dto.dayId);
    if (idx < 0) throw notFound('Itinerary day');
    if (dto.position > it.days.length) {
      throw new BadRequestException({ message: `position must be between 1 and ${it.days.length}`, field: 'position' });
    }
    const days = [...it.days];
    const [moved] = days.splice(idx, 1);
    days.splice(dto.position - 1, 0, moved);
    it.days = days as any;
    await it.save();
    return this.serialize(it, { includeOwnerFields: true });
  }

  // ------------------------------------------------------------------ activities (ITN-10, ITN-12)

  async addActivity(id: string, dayId: string, dto: CreateActivityDto, user: AuthUser) {
    const it = await this.getOwned(id, user);
    const d = this.findDay(it, dayId);
    let currency: string | null = null;
    if (dto.cost !== undefined && dto.cost !== null) {
      currency = await this.ref.assertCurrency(dto.currency ?? (await this.preferredCurrency(user)), 'currency');
    }
    d.activities.push({
      name: dto.name, description: dto.description ?? '', time: dto.time ?? null, cost: dto.cost ?? null, currency, images: [],
    } as any);
    await it.save();
    return this.serialize(it, { includeOwnerFields: true });
  }

  private locateActivity(it: ItineraryDocument, activityId: string) {
    for (const d of it.days) {
      const a = d.activities.find((x) => String(x._id) === activityId);
      if (a) return { day: d, activity: a };
    }
    throw notFound('Activity');
  }

  async updateActivity(activityId: string, dto: UpdateActivityDto, user: AuthUser) {
    const it = await this.findOwnedBy('days.activities._id', activityId, user);
    const { activity } = this.locateActivity(it, activityId);
    if (dto.name !== undefined) activity.name = dto.name;
    if (dto.description !== undefined) activity.description = dto.description;
    if (dto.time !== undefined) activity.time = dto.time;
    if (dto.cost !== undefined) activity.cost = dto.cost;
    if (dto.currency !== undefined) activity.currency = await this.ref.assertCurrency(dto.currency, 'currency');
    if (activity.cost !== null && activity.cost !== undefined && !activity.currency) {
      activity.currency = await this.preferredCurrency(user);
    }
    await it.save();
    return this.serialize(it, { includeOwnerFields: true });
  }

  async deleteActivity(activityId: string, user: AuthUser) {
    const it = await this.findOwnedBy('days.activities._id', activityId, user);
    const { day, activity } = this.locateActivity(it, activityId);
    const files = activity.images.map((im) => im.filename);
    day.activities = day.activities.filter((x) => String(x._id) !== activityId);
    await it.save();
    for (const f of files) await this.uploads.remove(f);
    return this.serialize(it, { includeOwnerFields: true });
  }

  async addActivityImages(activityId: string, files: Express.Multer.File[], user: AuthUser) {
    const it = await this.findOwnedBy('days.activities._id', activityId, user);
    const { activity } = this.locateActivity(it, activityId);
    this.uploads.validate(files, activity.images.length);
    const saved = await this.uploads.save(files, 'activities');
    activity.images.push(...(saved as any));
    await it.save();
    return this.serialize(it, { includeOwnerFields: true });
  }

  async removeActivityImage(activityId: string, imageId: string, user: AuthUser) {
    const it = await this.findOwnedBy('days.activities._id', activityId, user);
    const { activity } = this.locateActivity(it, activityId);
    const img = activity.images.find((x) => String(x._id) === imageId);
    if (!img) throw notFound('Image');
    activity.images = activity.images.filter((x) => String(x._id) !== imageId);
    await it.save();
    await this.uploads.remove(img.filename);
    return this.serialize(it, { includeOwnerFields: true });
  }

  // ------------------------------------------------------------------ budgets & transport (ITN-14, ITN-16)

  async addBudget(id: string, dayId: string, dto: CreateBudgetDto, user: AuthUser) {
    const it = await this.getOwned(id, user);
    const d = this.findDay(it, dayId);
    const currency = await this.ref.assertCurrency(dto.currency, 'currency');
    d.budgets.push({ category: dto.category, amount: dto.amount, currency, description: dto.description ?? '' } as any);
    await it.save();
    return this.serialize(it, { includeOwnerFields: true });
  }

  private locateBudget(it: ItineraryDocument, budgetId: string) {
    for (const d of it.days) {
      const b = d.budgets.find((x) => String(x._id) === budgetId);
      if (b) return { day: d, budget: b };
    }
    throw notFound('Budget entry');
  }

  async updateBudget(budgetId: string, dto: UpdateBudgetDto, user: AuthUser) {
    const it = await this.findOwnedBy('days.budgets._id', budgetId, user);
    const { budget } = this.locateBudget(it, budgetId);
    if (dto.category) budget.category = dto.category;
    if (dto.amount !== undefined) budget.amount = dto.amount;
    if (dto.currency) budget.currency = await this.ref.assertCurrency(dto.currency, 'currency');
    if (dto.description !== undefined) budget.description = dto.description;
    await it.save();
    return this.serialize(it, { includeOwnerFields: true });
  }

  async deleteBudget(budgetId: string, user: AuthUser) {
    const it = await this.findOwnedBy('days.budgets._id', budgetId, user);
    const { day } = this.locateBudget(it, budgetId);
    day.budgets = day.budgets.filter((x) => String(x._id) !== budgetId);
    await it.save();
    return this.serialize(it, { includeOwnerFields: true });
  }

  async addTransport(id: string, dto: CreateTransportCostDto, user: AuthUser) {
    const it = await this.getOwned(id, user);
    this.findDay(it, dto.dayId);
    await this.ref.getCity(dto.fromCityId, 'fromCityId');
    await this.ref.getCity(dto.toCityId, 'toCityId');
    const currency = await this.ref.assertCurrency(dto.currency, 'currency');
    it.transportCosts.push({ ...dto, currency, dayId: new Types.ObjectId(dto.dayId) } as any);
    await it.save();
    return this.serialize(it, { includeOwnerFields: true });
  }

  async updateTransport(tid: string, dto: UpdateTransportCostDto, user: AuthUser) {
    const it = await this.findOwnedBy('transportCosts._id', tid, user);
    const t = it.transportCosts.find((x) => String(x._id) === tid);
    if (!t) throw notFound('Transport cost');
    if (dto.dayId) {
      this.findDay(it, dto.dayId);
      t.dayId = new Types.ObjectId(dto.dayId);
    }
    if (dto.fromCityId) t.fromCityId = (await this.ref.getCity(dto.fromCityId, 'fromCityId'))._id;
    if (dto.toCityId) t.toCityId = (await this.ref.getCity(dto.toCityId, 'toCityId'))._id;
    if (dto.mode !== undefined) t.mode = dto.mode;
    if (dto.amount !== undefined) t.amount = dto.amount;
    if (dto.currency) t.currency = await this.ref.assertCurrency(dto.currency, 'currency');
    await it.save();
    return this.serialize(it, { includeOwnerFields: true });
  }

  async deleteTransport(tid: string, user: AuthUser) {
    const it = await this.findOwnedBy('transportCosts._id', tid, user);
    it.transportCosts = it.transportCosts.filter((x) => String(x._id) !== tid);
    await it.save();
    return this.serialize(it, { includeOwnerFields: true });
  }

  // ------------------------------------------------------------------ budget summary (ITN-14, ITN-18, ITN-09)

  private computeSummary(it: any, target: string, table: RateTable, cityNames: Map<string, string>) {
    const conv = (amt: number, cur: string) => this.fx.convert(amt, cur, target, table);
    const cats = Object.values(BudgetCategory);
    const zero = () => Object.fromEntries(cats.map((c) => [c, 0])) as Record<BudgetCategory, number>;
    const totals = zero();
    let intercity = 0;
    const byDay = it.days.map((d: any, i: number) => {
      const c = zero();
      for (const b of d.budgets) c[b.category as BudgetCategory] += conv(b.amount, b.currency);
      for (const a of d.activities) if (a.cost !== null && a.cost !== undefined) c[BudgetCategory.ACTIVITIES] += conv(a.cost, a.currency ?? target);
      const transport = it.transportCosts.filter((t: any) => String(t.dayId) === String(d._id)).reduce((s: number, t: any) => s + conv(t.amount, t.currency), 0);
      cats.forEach((k) => (totals[k] += c[k]));
      intercity += transport;
      const dayTotal = cats.reduce((s, k) => s + c[k], 0) + transport;
      return {
        dayId: String(d._id), dayNumber: i + 1, date: formatDateOnly(addDays(it.startDate, i)), cityId: d.cityId,
        categories: Object.fromEntries(cats.map((k) => [k, money(c[k])])), intercityTransport: money(transport), total: money(dayTotal),
      };
    });
    const groups = this.cityGroups(it, cityNames).map((g) => ({
      ...g,
      budgetSubtotal: money(byDay.slice(g.startDayNumber - 1, g.endDayNumber).reduce((s: number, d: any) => s + d.total, 0)),
    }));
    const grand = cats.reduce((s, k) => s + totals[k], 0) + intercity;
    return {
      currency: target,
      rateDate: table.date,
      ratesStale: table.stale,
      byCategory: { ...Object.fromEntries(cats.map((k) => [k, money(totals[k])])), intercity_transport: money(intercity) },
      byDay,
      cityGroups: groups,
      total: money(grand),
      note: 'Activity costs are counted under activities; intercity transport is listed separately (ITN-14). Booking prices are not converted (PAY-04).',
    };
  }

  async budgetSummary(id: string, user: AuthUser, currency?: string) {
    const it = await this.getOwned(id, user);
    const target = await this.ref.assertCurrency(currency ?? (await this.preferredCurrency(user)), 'currency');
    const table = await this.fx.getRates();
    const cities = new Map((await this.ref.listCities()).map((c: any) => [c._id, c.name]));
    return this.computeSummary(it, target, table, cities);
  }

  // ------------------------------------------------------------------ public itineraries (ITN-20, ITN-21)

  private publicFilter() {
    return { visibility: Visibility.PUBLIC, hidden: false, authorDeactivated: false };
  }

  async searchPublic(q: PublicItinerarySearchDto) {
    const filter: any = { ...this.publicFilter() };
    const and: any[] = [];
    if (q.keyword?.trim()) {
      const rx = containsInsensitive(q.keyword);
      const countries = (await this.ref.listCountries()).filter((c: any) => rx.test(c.name) || rx.test(c._id)).map((c: any) => c._id);
      const cities = (await this.ref.listCities()).filter((c: any) => rx.test(c.name) || rx.test(c._id)).map((c: any) => c._id);
      and.push({ $or: [{ title: rx }, { countries: { $in: countries } }, { 'days.cityId': { $in: cities } }] });
    }
    if (q.minDays !== undefined || q.maxDays !== undefined) {
      if (q.minDays !== undefined && q.maxDays !== undefined && q.minDays > q.maxDays) {
        throw new BadRequestException({ message: 'minDays cannot be greater than maxDays', field: 'minDays' });
      }
      filter.dayCount = {};
      if (q.minDays !== undefined) filter.dayCount.$gte = q.minDays;
      if (q.maxDays !== undefined) filter.dayCount.$lte = q.maxDays;
    }
    if (q.countryCode) filter.countries = q.countryCode;
    if (q.cityId) filter['days.cityId'] = q.cityId;
    if (and.length) filter.$and = and;
    const res = await paginateQuery(this.itineraries, filter, q.page, { updatedAt: -1 }, { path: 'owner', select: 'name status' });
    return {
      ...res,
      items: res.items.map((it: any) => ({
        id: String(it._id), title: it.title, countries: it.countries, startDate: formatDateOnly(it.startDate),
        days: it.days.length, author: { id: String(it.owner?._id), name: displayName(it.owner) },
        cities: [...new Set(it.days.map((d: any) => d.cityId))], updatedAt: it.updatedAt,
      })),
      message: res.total ? undefined : 'No itineraries found',
    };
  }

  private async getPublic(id: string) {
    const it = await this.itineraries.findOne({ _id: id, ...this.publicFilter() });
    if (!it) throw notFound('Itinerary');
    return it;
  }

  async viewPublic(id: string, viewer?: AuthUser, currency?: string) {
    const it = await this.getPublic(id);
    const view: any = await this.serialize(it);
    const target = await this.ref.assertCurrency(currency ?? (await this.preferredCurrency(viewer)), 'currency');
    try {
      const table = await this.fx.getRates();
      const cities = new Map((await this.ref.listCities()).map((c: any) => [c._id, c.name]));
      view.budgetSummary = this.computeSummary(it, target, table, cities);
    } catch (e: any) {
      view.budgetSummary = null;
      view.budgetSummaryError = e?.response?.message ?? 'Exchange rates unavailable';
    }
    return view;
  }

  /** ITN-21: independent private copy crediting the original author. */
  async clone(id: string, user: AuthUser) {
    const src = await this.getPublic(id);
    if (String(src.owner) === user.id) {
      throw new BadRequestException({ message: 'You already own this itinerary' });
    }
    const author = await this.users.findById(src.owner).select('name status').lean();
    const dayIdMap = new Map<string, Types.ObjectId>();
    const days = [];
    for (const d of src.days) {
      const newDayId = new Types.ObjectId();
      dayIdMap.set(String(d._id), newDayId);
      const activities = [];
      for (const a of d.activities) {
        activities.push({
          name: a.name, description: a.description, time: a.time, cost: a.cost, currency: a.currency,
          images: await this.copyImages(a.images),
        });
      }
      days.push({
        _id: newDayId, cityId: d.cityId, notes: d.notes, activities,
        budgets: d.budgets.map((b) => ({ category: b.category, amount: b.amount, currency: b.currency, description: b.description })),
      });
    }
    const copy = await this.itineraries.create({
      owner: user.id,
      title: src.title,
      countries: [...src.countries],
      startDate: src.startDate,
      visibility: Visibility.PRIVATE,
      days,
      transportCosts: src.transportCosts.map((t) => ({
        mode: t.mode, fromCityId: t.fromCityId, toCityId: t.toCityId, amount: t.amount, currency: t.currency,
        dayId: dayIdMap.get(String(t.dayId)),
      })),
      clonedFrom: { itinerary: src._id, author: src.owner, authorName: displayName(author), title: src.title },
    });
    return this.serialize(copy, { includeOwnerFields: true });
  }

  /** Clones get their own image files so the copy is fully independent of the original. */
  private async copyImages(images: { url: string; filename: string }[]) {
    const out = [];
    const base = this.uploads.dir;
    for (const im of images) {
      const ext = im.filename.split('.').pop();
      const filename = `activities/${randomUUID()}.${ext}`;
      try {
        await fs.mkdir(join(base, 'activities'), { recursive: true });
        await fs.copyFile(join(base, im.filename), join(base, filename));
        out.push({ url: im.url.replace(im.filename, filename), filename });
      } catch {
        // original file missing: skip silently
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ booking search from itinerary (ITN-25, ITN-26)

  async searchHotels(id: string, q: ItineraryHotelSearchDto, user: AuthUser) {
    const it = await this.getOwned(id, user);
    const cities = new Map((await this.ref.listCities()).map((c: any) => [c._id, c.name]));
    const group = this.cityGroups(it, cities).find((g) => g.startDayId === q.groupStartDayId);
    if (!group) throw notFound('City group (groupStartDayId must be the first day of a city group)');
    const checkIn = group.startDate;
    const checkOut = formatDateOnly(addDays(parseDateOnly(group.endDate), 1));
    const result = await this.hotels.search({
      cityId: group.cityId, checkIn, checkOut, guests: q.guests, rooms: q.rooms, minPrice: q.minPrice,
      maxPrice: q.maxPrice, minRating: q.minRating, sortBy: q.sortBy, sortOrder: q.sortOrder, page: q.page,
    } as any);
    return { group: { cityId: group.cityId, cityName: group.cityName, checkIn, checkOut, dayCount: group.dayCount }, ...result };
  }

  async searchFlights(id: string, q: ItineraryFlightSearchDto, user: AuthUser) {
    const it = await this.getOwned(id, user);
    if (!it.days.length) throw new BadRequestException({ message: 'Add at least one day before searching flights' });
    const cityId = it.days[0].cityId;
    const airports = await this.ref.airportsInCity(cityId);
    if (!airports.length) throw new BadRequestException({ message: `No airports are listed for the first day's city (${cityId})` });
    const date = q.date ?? formatDateOnly(it.startDate);
    const returnDate = q.returnDate ?? formatDateOnly(addDays(it.startDate, it.days.length - 1));
    const results = [];
    for (const a of airports) {
      if (a._id === q.origin) continue;
      results.push({
        destinationAirport: a._id,
        ...(await this.flights.search({
          from: q.origin, to: a._id, date, tripType: q.tripType, returnDate: q.tripType === 'round-trip' ? returnDate : undefined,
          adults: q.adults, children: q.children, infants: q.infants, cabinClass: q.cabinClass, minPrice: q.minPrice,
          maxPrice: q.maxPrice, sortBy: q.sortBy, sortOrder: q.sortOrder, page: q.page,
        } as any)),
      });
    }
    return { destinationCityId: cityId, date, returnDate: q.tripType === 'round-trip' ? returnDate : null, results };
  }

  // ------------------------------------------------------------------ used by admin/blog

  async publicByAuthor(authorId: string) {
    const list = await this.itineraries.find({ owner: authorId, ...this.publicFilter() }).sort({ updatedAt: -1 }).lean();
    return list.map((it) => ({ id: String(it._id), title: it.title, countries: it.countries, days: it.days.length, startDate: formatDateOnly(it.startDate) }));
  }

  isAdmin(user?: AuthUser) {
    return user?.role === Role.ADMIN;
  }
}
