// Class focus check-out: one reading per lesson of how much of it the class spent working.

import type { Checkout, TimetableEntry } from '../types';
import { timeToMinutes } from '../lib/dates';
import { lessonsOn } from './schedule';

/** Every check-out starts here, and never at the last reading (avoids anchoring). */
export const CHECKOUT_START = 50;
export const DEFAULT_LESSON_MIN = 50;

export type FocusZone = 'low' | 'mixed' | 'focused';
export const ZONES: { zone: FocusZone; label: string; from: number; to: number }[] = [
  { zone: 'low', label: 'Low focus', from: 0, to: 49 },
  { zone: 'mixed', label: 'Mixed', from: 50, to: 74 },
  { zone: 'focused', label: 'Focused', from: 75, to: 100 }
];

export const clampPct = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
export const zoneFor = (pct: number) => ZONES.find((z) => clampPct(pct) <= z.to)!;

export const checkoutId = (date: string, classId: string, timetableId?: string) => `${date}|${classId}|${timetableId ?? 'manual'}`;

export function lessonLength(t?: Pick<TimetableEntry, 'start' | 'end'>): number {
  if (!t) return DEFAULT_LESSON_MIN;
  const n = timeToMinutes(t.end) - timeToMinutes(t.start);
  return n > 0 ? n : DEFAULT_LESSON_MIN;
}

/** Working and distracted minutes for a lesson; they always add up to the lesson length. */
export function splitMinutes(lessonMin: number, pct: number) {
  const working = Math.round((lessonMin * clampPct(pct)) / 100);
  return { working, distracted: Math.max(0, lessonMin - working) };
}

/** The lesson a check-out from the check-in screen belongs to: the one on now, else the latest that has started today. */
export function lessonForCheckout(timetable: TimetableEntry[], classId: string, date: string, minutes: number): TimetableEntry | undefined {
  return lessonsOn(timetable, date)
    .filter((t) => t.classId === classId && timeToMinutes(t.start) <= minutes)
    .pop();
}

/** Lesson to suggest a check-out for on Your classes: ended today, within the last 3 hours, not done or dismissed. */
export function pendingCheckout(
  timetable: TimetableEntry[], date: string, minutes: number, done: Pick<Checkout, 'id'>[], skipped: string[], classIds: Set<string>
): TimetableEntry | undefined {
  const doneIds = new Set(done.map((c) => c.id));
  return lessonsOn(timetable, date)
    .filter((t) => classIds.has(t.classId))
    .filter((t) => { const end = timeToMinutes(t.end); return end <= minutes && minutes - end <= 180; })
    .filter((t) => { const id = checkoutId(date, t.classId, t.id); return !doneIds.has(id) && !skipped.includes(id); })
    .pop();
}
