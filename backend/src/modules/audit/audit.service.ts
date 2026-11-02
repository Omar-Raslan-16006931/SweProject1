import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog } from './schemas/audit-log.schema';
import { paginateQuery } from '../../common/utils/pagination';

export enum AuditAction {
  MODERATOR_CREATED = 'moderator.created',
  ACCOUNT_SUSPENDED = 'account.suspended',
  ACCOUNT_REACTIVATED = 'account.reactivated',
  PASSWORD_RESET = 'account.password_reset',
  PROVIDER_DEACTIVATED = 'provider.deactivated',
  PROVIDER_REACTIVATED = 'provider.reactivated',
  AIRLINE_CREATED = 'airline.created',
  HOTEL_CREATED = 'hotel.created',
  REPORT_DISMISSED = 'report.dismissed',
  CONTENT_HIDDEN = 'content.hidden',
  CONTENT_UNHIDDEN = 'content.unhidden',
  CONTENT_DELETED = 'content.deleted',
}

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLog.name) private model: Model<AuditLog>) {}

  log(actorId: string, action: AuditAction, targetType: string, targetId: string, details?: Record<string, any>) {
    return this.model.create({ actor: actorId, action, targetType, targetId, details });
  }

  list(q: { page?: number; action?: string; actorId?: string; from?: Date; to?: Date }) {
    const filter: any = {};
    if (q.action) filter.action = q.action;
    if (q.actorId) filter.actor = q.actorId;
    if (q.from || q.to) {
      filter.createdAt = {};
      if (q.from) filter.createdAt.$gte = q.from;
      if (q.to) filter.createdAt.$lte = q.to;
    }
    return paginateQuery(this.model, filter, q.page, { createdAt: -1 }, { path: 'actor', select: 'name email role' });
  }
}
