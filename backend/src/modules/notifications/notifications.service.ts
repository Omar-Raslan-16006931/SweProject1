import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification } from './schemas/notification.schema';
import { NotificationType } from '../../common/enums';
import { paginateQuery } from '../../common/utils/pagination';
import { notFound } from '../../common/utils/errors';

@Injectable()
export class NotificationsService {
  constructor(@InjectModel(Notification.name) private model: Model<Notification>) {}

  notify(user: string | Types.ObjectId, type: NotificationType, title: string, message: string, data?: Record<string, any>) {
    return this.model.create({ user, type, title, message, data });
  }

  async notifyMany(users: (string | Types.ObjectId)[], type: NotificationType, title: string, message: string, data?: Record<string, any>) {
    const unique = [...new Set(users.map(String))];
    if (!unique.length) return;
    await this.model.insertMany(unique.map((u) => ({ user: u, type, title, message, data })));
  }

  list(userId: string, page = 1, unreadOnly = false) {
    const filter: any = { user: userId };
    if (unreadOnly) filter.readAt = null;
    return paginateQuery(this.model, filter, page, { createdAt: -1 });
  }

  async unreadCount(userId: string) {
    return { unread: await this.model.countDocuments({ user: userId, readAt: null }) };
  }

  async markRead(userId: string, id: string) {
    const n = await this.model.findOneAndUpdate(
      { _id: id, user: userId },
      { $set: { readAt: new Date() } },
      { new: true },
    ).lean();
    if (!n) throw notFound('Notification');
    return n;
  }

  async markAllRead(userId: string) {
    const r = await this.model.updateMany({ user: userId, readAt: null }, { $set: { readAt: new Date() } });
    return { updated: r.modifiedCount };
  }
}
