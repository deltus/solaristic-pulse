// Class-level insights: weekly "needs support" share per area, rolling student lines,
// and a few plain-language suggestions. Pure functions so they can be tested.

import type { Category, Checkin, IcpAdjustment, IcpCheck, Observation, Student } from '../types';
import { addDays, daysBetween, parseISODate, toISODate } from '../lib/dates';
import { icpDueStatus, implementationSummary } from './icp';
import { lastCheckedDate } from './priority';

export const weekStart = (d: string) => { const x = parseISODate(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return toISODate(x); };

export interface WeekPoint { week: string; share: number | null; n: number }

/** Share of rated answers that were "needs support", per week (oldest first). */
export function weeklyShare(obs: Observation[], categoryId: string, today: string, weeks = 8): WeekPoint[] {
  const first = addDays(weekStart(today), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, i) => {
    const w = addDays(first, 7 * i);
    const inWeek = obs.filter((o) => o.categoryId === categoryId && o.level !== null && o.date >= w && o.date < addDays(w, 7));
    return { week: w, n: inWeek.length, share: inWeek.length ? inWeek.filter((o) => (o.level ?? 0) > 0).length / inWeek.length : null };
  });
}

/** For one student: after each answer, the share of the last 5 that were "needs support". */
export function rollingShare(obs: Observation[], categoryId: string, today: string, windowDays = 56, n = 5) {
  const rated = obs.filter((o) => o.categoryId === categoryId && o.level !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  return rated
    .map((o, i) => {
      const last = rated.slice(Math.max(0, i - n + 1), i + 1);
      return { date: o.date, level: o.level as number, share: last.filter((x) => (x.level ?? 0) > 0).length / last.length };
    })
    .filter((p) => daysBetween(p.date, today) <= windowDays);
}

/** Recent two weeks vs the two before: positive = more support needed. */
export function recentChange(points: WeekPoint[]): { recent: number | null; before: number | null } {
  const avg = (ps: WeekPoint[]) => {
    const n = ps.reduce((s, p) => s + p.n, 0);
    return n ? ps.reduce((s, p) => s + (p.share ?? 0) * p.n, 0) / n : null;
  };
  return { recent: avg(points.slice(-2)), before: avg(points.slice(-4, -2)) };
}

const BLITZ_FOR: Record<string, string> = { homework: 'Homework', focus: 'Productivity', behaviour: 'Behaviour', coping: 'Coping' };

export function classSuggestions(input: {
  students: Student[]; checkins: Checkin[]; observations: Observation[]; categories: Category[];
  adjustments: IcpAdjustment[]; icpChecks: IcpCheck[]; today: string; maxGapDays: number;
}): string[] {
  const { students, checkins, observations, categories, adjustments, icpChecks, today } = input;
  const out: string[] = [];
  const active = students.filter((s) => !s.archived);
  const unseen = active.filter((s) => {
    const last = lastCheckedDate(checkins.filter((c) => c.studentId === s.id));
    return !last || daysBetween(last, today) >= 10;
  });
  if (unseen.length) {
    const names = unseen.slice(0, 3).map((s) => s.preferredName || s.firstName).join(', ');
    out.push(`${unseen.length} student${unseen.length === 1 ? ' hasn’t' : 's haven’t'} been checked in 10+ days${unseen.length <= 3 ? `: ${names}` : ` (incl. ${names})`}.`);
  }
  for (const c of categories.filter((x) => x.builtIn)) {
    const ch = recentChange(weeklyShare(observations, c.id, today, 4));
    if (ch.recent !== null && ch.before !== null && ch.recent - ch.before >= 0.15) {
      out.push(`${c.name} is slipping (${Math.round(ch.before * 100)}% → ${Math.round(ch.recent * 100)}% needing support).${BLITZ_FOR[c.id] ? ` Try a ${BLITZ_FOR[c.id]} blitz.` : ''}`);
    } else if (ch.recent !== null && ch.before !== null && ch.before - ch.recent >= 0.15) {
      out.push(`${c.name} is improving (${Math.round(ch.before * 100)}% → ${Math.round(ch.recent * 100)}% needing support).`);
    }
  }
  const ids = new Set(active.map((s) => s.id));
  const overdue = adjustments.filter((a) => ids.has(a.studentId) && icpDueStatus(a, icpChecks, today, true).overdue).length;
  if (overdue) out.push(`${overdue} ICP adjustment${overdue === 1 ? ' is' : 's are'} overdue for a check.`);
  const rate = implementationSummary(icpChecks.filter((c) => ids.has(c.studentId) && daysBetween(c.date, today) <= 14)).rate;
  if (rate !== null && rate < 70) out.push(`ICP adjustments were implemented ${rate}% of the time in the last 2 weeks.`);
  if (!out.length) out.push('The class is on track. Keep the daily check-ins going.');
  return out;
}
