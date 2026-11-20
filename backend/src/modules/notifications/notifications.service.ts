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

  private serialize(n: any) {
    return {
      id: String(n._id), type: n.type, title: n.title, message: n.message, data: n.data ?? {},
      read: !!n.readAt, readAt: n.readAt ?? null, createdAt: n.createdAt,
    };
  }

  /** GEN-01: notification list, newest first, with the unread count. */
  async list(userId: string, page = 1, unreadOnly = false) {
    const filter: any = { user: userId };
    if (unreadOnly) filter.readAt = null;
    const res = await paginateQuery(this.model, filter, page, { createdAt: -1 });
    return { ...res, items: res.items.map((n: any) => this.serialize(n)), unread: await this.model.countDocuments({ user: userId, readAt: null }) };
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
    return this.serialize(n);
  }

  async markAllRead(userId: string) {
    const r = await this.model.updateMany({ user: userId, readAt: null }, { $set: { readAt: new Date() } });
    return { updated: r.modifiedCount };
  }
}
