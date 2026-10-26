// Class overview graphs: % meeting expectations per lesson (or per week once there are many
// lessons) for Attention, Behaviour, Coping with work and Preparedness (Blitz), and the class's
// cold-call success rate.

import type { Checkin, ColdCall, Lesson, Observation } from '../types';
import { daysBetween, formatShort } from '../lib/dates';
import { lessonOf } from './checkin';

export const SUCCESS_AREAS = [
  { id: 'focus', label: 'Attention', colour: 'var(--blue)' },
  { id: 'behaviour', label: 'Behaviour', colour: 'var(--burgundy)' },
  { id: 'coping', label: 'Coping with work', colour: 'var(--ok)' },
  { id: 'homework', label: 'Preparedness (Blitz)', colour: 'var(--some)' }
];

export interface Series { id: string; label: string; colour: string; values: (number | null)[] }
export interface SuccessChart { unit: 'lesson' | 'week'; labels: [string, string] | undefined; series: Series[] }

const share = (rows: Observation[]) => (rows.length ? rows.filter((o) => o.level === 0).length / rows.length : null);

export function successSeries(input: { observations: Observation[]; checkins: Checkin[]; lessons: Lesson[]; today: string }, maxPoints = 12): SuccessChart {
  const { observations, checkins, lessons, today } = input;
  const checkinLesson = new Map(checkins.map((c) => [c.id, lessonOf(c)]));
  const byDate = new Map<string, string>();
  for (const l of [...lessons].sort((a, b) => a.openedAt - b.openedAt)) if (!byDate.has(l.date)) byDate.set(l.date, l.id);
  // Preparedness only comes from Blitz now; the other areas from the daily check-in and cold calls.
  const rows = observations.filter((o) => o.level !== null && !o.exceeding && SUCCESS_AREAS.some((a) => a.id === o.categoryId) && (o.categoryId === 'homework' ? !!o.blitz : !o.blitz));
  const lessonFor = (o: Observation) => o.lessonId ?? checkinLesson.get(o.checkinId) ?? byDate.get(o.date);
  const used = [...lessons].sort((a, b) => a.openedAt - b.openedAt).filter((l) => rows.some((o) => lessonFor(o) === l.id)).slice(-40);

  if (used.length <= maxPoints) {
    const ids = used.map((l) => l.id);
    return {
      unit: 'lesson',
      labels: used.length ? [formatShort(used[0].date), formatShort(used[used.length - 1].date)] : undefined,
      series: SUCCESS_AREAS.map((a) => ({ ...a, values: ids.map((id) => share(rows.filter((o) => o.categoryId === a.id && lessonFor(o) === id))) }))
    };
  }
  // Many lessons: one point per week, over as many weeks as there is data (2 to 8).
  const weeks = weeksSpan(rows.map((o) => o.date), today);
  const weekOf = (date: string) => weeks - 1 - Math.floor(daysBetween(date, today) / 7);
  return {
    unit: 'week',
    labels: [weeksAgo(weeks - 1), 'this week'],
    series: SUCCESS_AREAS.map((a) => ({ ...a, values: Array.from({ length: weeks }, (_, w) => share(rows.filter((o) => o.categoryId === a.id && weekOf(o.date) === w))) }))
  };
}

export const weeksAgo = (n: number) => (n === 1 ? 'last week' : `${n} weeks ago`);

/** Weeks to chart: from the oldest record to this week, at least 2 and at most 8. */
export function weeksSpan(dates: string[], today: string, max = 8): number {
  const oldest = dates.reduce((m, d) => (d < m ? d : m), today);
  return Math.max(2, Math.min(max, Math.floor(daysBetween(oldest, today) / 7) + 1));
}

/** % answered well: last 7 days, overall, and weekly (up to the last 8 weeks). */
export function classColdCallRate(calls: ColdCall[], today: string) {
  const pct = (xs: ColdCall[]) => (xs.length ? Math.round((xs.filter((c) => c.result === 'good').length / xs.length) * 100) : null);
  const age = (c: ColdCall) => daysBetween(c.date, today);
  const weeks = weeksSpan(calls.map((c) => c.date), today);
  return {
    last7: pct(calls.filter((c) => age(c) >= 0 && age(c) < 7)),
    overall: pct(calls),
    total: calls.length,
    weeks,
    weekly: Array.from({ length: weeks }, (_, i) => {
      const xs = calls.filter((c) => age(c) >= (weeks - 1 - i) * 7 && age(c) < (weeks - i) * 7);
      return xs.length ? xs.filter((c) => c.result === 'good').length / xs.length : null;
    })
  };
}
