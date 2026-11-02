export interface CancellationTier {
  daysBefore: number;
  refundPercent: number;
}

/**
 * FLT-09 / HTL-10 selection rule: use the tier with the highest threshold
 * not exceeding the days remaining; if no tier applies the refund is 0%.
 */
export function selectRefundPercent(tiers: CancellationTier[], daysRemaining: number): number {
  const applicable = (tiers ?? [])
    .filter((t) => t.daysBefore <= daysRemaining)
    .sort((a, b) => b.daysBefore - a.daysBefore);
  return applicable.length ? applicable[0].refundPercent : 0;
}

/** Whole days (rounded down) between now and a future instant (approved assumption #3). */
export function wholeDaysUntil(target: Date, now = new Date()): number {
  const ms = target.getTime() - now.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/** Round a money amount to 2 decimals. */
export function money(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toCents(n: number): number {
  return Math.round(n * 100);
}
