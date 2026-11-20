import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Airline } from './schemas/airline.schema';
import { BaggagePolicyDto, CancellationPolicyDto, CreateAirlineDto, UpdateAirlineDto, assertUniqueThresholds } from './dto/airline.dto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { conflict, forbidden, notFound } from '../../common/utils/errors';
import { UploadsService } from '../uploads/uploads.service';
import { AuditAction, AuditService } from '../audit/audit.service';

@Injectable()
export class AirlinesService {
  constructor(
    @InjectModel(Airline.name) private airlines: Model<Airline>,
    private uploads: UploadsService,
    private audit: AuditService,
  ) {}

  serialize(a: any) {
    return {
      id: String(a._id),
      name: a.name,
      code: a.code,
      logoUrl: a.logo?.url ?? null,
      active: a.active,
      baggagePolicy: a.baggagePolicy,
      cancellationTiers: [...(a.cancellationTiers ?? [])].sort((x: any, y: any) => y.daysBefore - x.daysBefore),
      createdAt: a.createdAt,
    };
  }

  /** Airline moderators may manage only their assigned airline (PDF 6.1, ACC-13). */
  assertModerator(user: AuthUser, airlineId: string) {
    if (user.role !== Role.AIRLINE_MODERATOR || user.airlineId !== String(airlineId)) {
      throw forbidden('Airline moderators may manage only their assigned airline');
    }
  }

  async get(id: string) {
    const a = await this.airlines.findById(id);
    if (!a) throw notFound('Airline');
    return a;
  }

  /** FLT-01 (admin) */
  async create(dto: CreateAirlineDto, actor: AuthUser) {
    if (await this.airlines.exists({ code: dto.code })) throw conflict(`Airline code ${dto.code} already exists`);
    const a = await this.airlines.create(dto);
    await this.audit.log(actor.id, AuditAction.AIRLINE_CREATED, 'airline', String(a._id), { name: a.name, code: a.code });
    return this.serialize(a);
  }

  async findPublic(id: string) {
    return this.serialize(await this.get(id));
  }

  /** FLT-01 (moderator) */
  async update(id: string, dto: UpdateAirlineDto, user: AuthUser) {
    this.assertModerator(user, id);
    const a = await this.get(id);
    if (dto.code && dto.code !== a.code && (await this.airlines.exists({ code: dto.code }))) {
      throw conflict(`Airline code ${dto.code} already exists`);
    }
    Object.assign(a, dto);
    await a.save();
    return this.serialize(a);
  }

  /** FLT-01 logo, GEN-08 (1 logo per airline: a new upload replaces the old one). */
  async uploadLogo(id: string, file: Express.Multer.File | undefined, user: AuthUser) {
    this.assertModerator(user, id);
    const a = await this.get(id);
    this.uploads.validate(file ? [file] : undefined, 0, 1);
    const [img] = await this.uploads.save([file as Express.Multer.File], 'airlines');
    const old = a.logo?.filename;
    a.logo = img;
    await a.save();
    await this.uploads.remove(old);
    return this.serialize(a);
  }

  async removeLogo(id: string, user: AuthUser) {
    this.assertModerator(user, id);
    const a = await this.get(id);
    const old = a.logo?.filename;
    a.logo = null;
    await a.save();
    await this.uploads.remove(old);
    return this.serialize(a);
  }

  /** FLT-04, FLT-08 */
  async setBaggagePolicy(id: string, dto: BaggagePolicyDto, user: AuthUser) {
    this.assertModerator(user, id);
    const a = await this.get(id);
    a.baggagePolicy = { extraBagPrice: dto.extraBagPrice, maxExtraBags: dto.maxExtraBags };
    await a.save();
    return this.serialize(a);
  }

  /** FLT-09 */
  async setCancellationPolicy(id: string, dto: CancellationPolicyDto, user: AuthUser) {
    this.assertModerator(user, id);
    if (!assertUniqueThresholds(dto.tiers)) {
      throw new BadRequestException({ message: 'Each cancellation tier must have a unique days-before threshold', field: 'tiers' });
    }
    const a = await this.get(id);
    a.cancellationTiers = dto.tiers.map((t) => ({ daysBefore: t.daysBefore, refundPercent: t.refundPercent }));
    await a.save();
    return this.serialize(a);
  }

  async activeAirlineIds() {
    return this.airlines.find({ active: true }).distinct('_id');
  }
}
