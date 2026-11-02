import { Model, FilterQuery, PipelineStage } from 'mongoose';
import { PAGE_SIZE } from '../enums';

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function buildPage<T>(items: T[], total: number, page: number): Paginated<T> {
  return {
    items,
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Paginate an in-memory array (used where results are computed in application code). */
export function paginateArray<T>(all: T[], page = 1): Paginated<T> {
  const p = Math.max(1, page);
  return buildPage(all.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE), all.length, p);
}

export async function paginateQuery<T>(
  model: Model<T>,
  filter: FilterQuery<T>,
  page = 1,
  sort: Record<string, 1 | -1> = { createdAt: -1 },
  populate?: any,
  projection?: any,
): Promise<Paginated<any>> {
  const p = Math.max(1, page);
  let q = model.find(filter, projection).sort(sort).skip((p - 1) * PAGE_SIZE).limit(PAGE_SIZE);
  if (populate) q = q.populate(populate);
  const [items, total] = await Promise.all([q.lean().exec(), model.countDocuments(filter).exec()]);
  return buildPage(items as any[], total, p);
}

export async function paginateAggregate(
  model: Model<any>,
  pipeline: PipelineStage[],
  page = 1,
): Promise<Paginated<any>> {
  const p = Math.max(1, page);
  const [res] = await model
    .aggregate([
      ...pipeline,
      {
        $facet: {
          items: [{ $skip: (p - 1) * PAGE_SIZE }, { $limit: PAGE_SIZE }],
          total: [{ $count: 'count' }],
        },
      },
    ])
    .exec();
  return buildPage(res.items, res.total[0]?.count ?? 0, p);
}
