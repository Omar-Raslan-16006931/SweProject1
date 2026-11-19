import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Report } from './schemas/report.schema';
import { ModerationService } from './moderation.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { ReportStatus, ReportTargetType } from '../../common/enums';
import { isDuplicateKeyError, notFound } from '../../common/utils/errors';
import { paginateQuery } from '../../common/utils/pagination';
import { AuditAction, AuditService } from '../audit/audit.service';
import { CreateReportDto } from './reports.dto';

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Report.name) private reports: Model<Report>,
    private moderation: ModerationService,
    private audit: AuditService,
  ) {}

  /** GEN-09: report a post, comment, review or itinerary with a reason, at most once per item. */
  async create(dto: CreateReportDto, user: AuthUser) {
    const doc = await this.moderation.get(dto.targetType, dto.targetId);
    if (!this.moderation.isReportable(dto.targetType, doc)) throw notFound('Content');
    if (this.moderation.ownerOf(dto.targetType, doc) === user.id) {
      throw new BadRequestException({ message: 'You cannot report your own content' });
    }
    try {
      const r = await this.reports.create({ reporter: user.id, targetType: dto.targetType, targetId: dto.targetId, reason: dto.reason });
      return { id: String(r._id), targetType: r.targetType, targetId: String(r.targetId), status: r.status };
    } catch (e) {
      if (isDuplicateKeyError(e)) throw new ConflictException({ message: 'You have already reported this item' });
      throw e;
    }
  }

  /** GEN-10: open reports list (filterable by status / type). */
  async list(page = 1, status: string = ReportStatus.OPEN, targetType?: string) {
    const filter: any = {};
    if (status && status !== 'all') filter.status = status;
    if (targetType) filter.targetType = targetType;
    const res = await paginateQuery(this.reports, filter, page, { createdAt: -1 }, { path: 'reporter', select: 'name email' });
    const items = [];
    for (const r of res.items as any[]) {
      let target = null;
      try {
        target = this.moderation.summary(r.targetType, await this.moderation.get(r.targetType, r.targetId));
      } catch {
        target = null;
      }
      items.push({
        id: String(r._id),
        targetType: r.targetType,
        targetId: String(r.targetId),
        target,
        reason: r.reason,
        status: r.status,
        reporter: r.reporter ? { id: String(r.reporter._id), name: r.reporter.name, email: r.reporter.email } : null,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt ?? null,
      });
    }
    return { ...res, items };
  }

  /** GEN-10: resolve by dismissing, hiding or deleting the content. Auditable (GEN-07). */
  async resolve(id: string, action: 'dismiss' | 'hide' | 'delete', admin: AuthUser) {
    const r = await this.reports.findById(id);
    if (!r) throw notFound('Report');
    if (r.status !== ReportStatus.OPEN) throw new ConflictException({ message: `Report already resolved (${r.status})` });
    const now = new Date();
    if (action === 'dismiss') {
      r.status = ReportStatus.DISMISSED;
      r.resolvedBy = admin.id as any;
      r.resolvedAt = now;
      await r.save();
      await this.audit.log(admin.id, AuditAction.REPORT_DISMISSED, 'report', String(r._id), { targetType: r.targetType, targetId: String(r.targetId) });
      return { id: String(r._id), status: r.status };
    }
    if (action === 'hide') {
      await this.moderation.setHidden(r.targetType, r.targetId, true);
      await this.audit.log(admin.id, AuditAction.CONTENT_HIDDEN, r.targetType, String(r.targetId), { reportId: String(r._id) });
    } else {
      await this.moderation.delete(r.targetType, r.targetId);
      await this.audit.log(admin.id, AuditAction.CONTENT_DELETED, r.targetType, String(r.targetId), { reportId: String(r._id) });
    }
    const status = action === 'hide' ? ReportStatus.HIDDEN : ReportStatus.DELETED;
    // All open reports on the same item are resolved by the same action.
    await this.reports.updateMany(
      { targetType: r.targetType, targetId: r.targetId, status: ReportStatus.OPEN },
      { $set: { status, resolvedBy: admin.id, resolvedAt: now } },
    );
    return { id: String(r._id), status };
  }

  /** GEN-10: direct moderation without a report. */
  async setHidden(type: ReportTargetType, id: string, hidden: boolean, admin: AuthUser) {
    await this.moderation.setHidden(type, id, hidden);
    await this.audit.log(admin.id, hidden ? AuditAction.CONTENT_HIDDEN : AuditAction.CONTENT_UNHIDDEN, type, id);
    if (hidden) {
      await this.reports.updateMany(
        { targetType: type, targetId: id, status: ReportStatus.OPEN },
        { $set: { status: ReportStatus.HIDDEN, resolvedBy: admin.id, resolvedAt: new Date() } },
      );
    }
    return { targetType: type, targetId: id, hidden };
  }

  async deleteContent(type: ReportTargetType, id: string, admin: AuthUser) {
    await this.moderation.delete(type, id);
    await this.audit.log(admin.id, AuditAction.CONTENT_DELETED, type, id);
    await this.reports.updateMany(
      { targetType: type, targetId: id, status: ReportStatus.OPEN },
      { $set: { status: ReportStatus.DELETED, resolvedBy: admin.id, resolvedAt: new Date() } },
    );
    return { targetType: type, targetId: id, deleted: true };
  }
}
