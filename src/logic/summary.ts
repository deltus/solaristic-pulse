import type { Observation } from '../types';

export type RecentStatus = 'meeting' | 'support' | 'none';

export interface RecentSummary {
  status: RecentStatus;
  /** Rated answers considered (up to `n`). */
  count: number;
  /** How many of those were "needs support" (any difficulty). */
  support: number;
}

/**
 * Status from a student's last `n` rated answers in a category, including Blitz marks.
 * "Needs support" when at least 40% of them (2 of 5) were difficulties.
 */
export function recentStatus(obs: Observation[], categoryId: string, n = 5): RecentSummary {
  const rated = obs
    .filter((o) => o.categoryId === categoryId && o.level !== null)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .slice(0, n);
  const support = rated.filter((o) => (o.level ?? 0) > 0).length;
  if (!rated.length) return { status: 'none', count: 0, support: 0 };
  return { status: support / rated.length >= 0.4 ? 'support' : 'meeting', count: rated.length, support };
}

export const STATUS_LABEL: Record<RecentStatus, string> = {
  meeting: 'Meeting expectations',
  support: 'Needs support',
  none: 'No answers yet'
};
