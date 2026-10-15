import type { Category, Observation } from '../types';
import { daysBetween } from '../lib/dates';

export type TrendStatus = 'insufficient' | 'improving' | 'declining' | 'stable';

export interface Trend {
  categoryId: string;
  status: TrendStatus;
  n: number;
  earlierAvg?: number;
  recentAvg?: number;
  /** Interpretation (clearly labelled as such in the UI). */
  summary: string;
  /** Observed facts: counts only. */
  facts: string[];
  points: { date: string; level: 0 | 1 | 2 }[];
}

export const TREND_WINDOW_DAYS = 42;
export const TREND_MIN_OBS = 4;
const SHIFT = 0.4;

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function categoryTrend(
  obs: Observation[], category: Category, today: string, windowDays = TREND_WINDOW_DAYS
): Trend {
  const rated = obs
    .filter((o) => o.categoryId === category.id && o.level !== null)
    .filter((o) => { const d = daysBetween(o.date, today); return d >= 0 && d <= windowDays; })
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const points = rated.map((o) => ({ date: o.date, level: o.level as 0 | 1 | 2 }));
  const n = rated.length;
  const weeks = Math.round(windowDays / 7);

  const facts: string[] = [];
  if (n) {
    const c = [0, 1, 2].map((l) => rated.filter((o) => o.level === l).length);
    facts.push(`${n} rated observation${n === 1 ? '' : 's'} in the last ${weeks} weeks: ${c[0]} as expected, ${c[1]} some difficulty, ${c[2]} significant difficulty.`);
    const ctx = new Map<string, number>();
    for (const o of rated) if (o.level && o.context) ctx.set(o.context, (ctx.get(o.context) ?? 0) + 1);
    for (const [k, v] of ctx) if (v >= 2) facts.push(`Difficulty recorded ${v} times during ${k.toLowerCase()}.`);
  }

  const base = { categoryId: category.id, n, facts, points };
  if (n < TREND_MIN_OBS) {
    return {
      ...base, status: 'insufficient',
      summary: `Not enough observations to establish a trend (${n} of ${TREND_MIN_OBS} needed).`
    };
  }
  const half = Math.floor(n / 2);
  const earlierAvg = r1(avg(rated.slice(0, half).map((o) => o.level as number)));
  const recentAvg = r1(avg(rated.slice(half).map((o) => o.level as number)));
  const spanWeeks = Math.max(1, Math.round(daysBetween(rated[0].date, rated[n - 1].date) / 7));
  const period = `over the last ${spanWeeks} week${spanWeeks === 1 ? '' : 's'}`;
  const diff = earlierAvg - recentAvg;

  let status: TrendStatus;
  let summary: string;
  if (diff >= SHIFT) {
    status = 'improving';
    summary = `${category.name} has improved ${period}: fewer difficulties in recent observations.`;
  } else if (diff <= -SHIFT) {
    status = 'declining';
    summary = `${category.name} difficulties have increased ${period}.`;
  } else {
    status = 'stable';
    const level = recentAvg < 0.5 ? 'mostly as expected' : recentAvg < 1.25 ? 'with some ongoing difficulty' : 'with ongoing significant difficulty';
    summary = `${category.name} has remained stable ${period}, ${level}.`;
  }
  return { ...base, status, earlierAvg, recentAvg, summary };
}
