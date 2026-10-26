// Cold-call assistant: pick a student fairly (least recently cold-called first, never-called
// before anyone repeats, then a little randomness), plus history and stats for cards and reports.

import type { ColdCall, Lesson, Student } from '../types';
import { daysBetween } from '../lib/dates';
import { lessonName } from './lessons';

export const STRUGGLE_TAGS = [
  { id: 'didnt_know', label: "Didn't know" },
  { id: 'partly_right', label: 'Partly right' },
  { id: 'not_listening', label: "Wasn't listening" },
  { id: 'didnt_want', label: "Didn't want to answer" }
];
export const struggleLabel = (id: string) => STRUGGLE_TAGS.find((t) => t.id === id)?.label ?? id;

/**
 * Fair pick. Students never cold-called in this class come first (randomly among them), so
 * nobody is picked twice before everyone has been picked once. After that, a random pick among
 * the least recently called fifth of the class.
 */
export function pickColdCall(students: Student[], calls: ColdCall[], exclude: Set<string>, random: () => number): Student | undefined {
  const pool = students.filter((s) => !s.archived && !exclude.has(s.id));
  if (!pool.length) return undefined;
  const last = new Map<string, number>();
  for (const c of calls) last.set(c.studentId, Math.max(last.get(c.studentId) ?? 0, c.createdAt));
  const never = pool.filter((s) => !last.has(s.id));
  const candidates = never.length
    ? never
    : [...pool].sort((a, b) => last.get(a.id)! - last.get(b.id)!).slice(0, Math.max(1, Math.round(pool.length / 5)));
  return candidates[Math.floor(random() * candidates.length)];
}

const newest = (a: ColdCall, b: ColdCall) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt;

export const coldCallText = (c: Pick<ColdCall, 'result' | 'tags'>) =>
  c.result === 'good' ? 'answered well' : `struggled${c.tags?.length ? `, ${c.tags.map(struggleLabel).join(', ').toLowerCase()}` : ''}`;

/** "Rivers and meanders: answered well" for the student's last n cold calls, newest first. */
export function coldCallHistory(calls: ColdCall[], lessons: Lesson[], studentId: string, n = 5) {
  return calls.filter((c) => c.studentId === studentId).sort(newest).slice(0, n).map((c) => {
    const l = lessons.find((x) => x.id === c.lessonId);
    return { call: c, text: `${l ? lessonName(l) : c.date}: ${coldCallText(c)}` };
  });
}

/** "Answered well 3 of last 5" */
export function coldCallSummary(calls: ColdCall[], studentId: string, n = 5): string {
  const last = calls.filter((c) => c.studentId === studentId).sort(newest).slice(0, n);
  if (!last.length) return 'Not cold-called yet';
  return `Answered well ${last.filter((c) => c.result === 'good').length} of last ${last.length}`;
}

export interface ColdCallStats { total: number; goodPct: number | null; topStruggle: string | null; weekly: { week: string; share: number | null }[] }

/** Totals for the student page: % answered well, most common struggle, weekly share over the last 8 weeks. */
export function coldCallStats(calls: ColdCall[], today: string, weeks = 8): ColdCallStats {
  const total = calls.length;
  const good = calls.filter((c) => c.result === 'good').length;
  const counts = new Map<string, number>();
  for (const c of calls) for (const t of c.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  const weekly = Array.from({ length: weeks }, (_, i) => {
    const from = weeks - i - 1;
    const inWeek = calls.filter((c) => { const d = daysBetween(c.date, today); return d >= from * 7 && d < (from + 1) * 7; });
    return { week: String(i), share: inWeek.length ? inWeek.filter((c) => c.result === 'good').length / inWeek.length : null };
  });
  return { total, goodPct: total ? Math.round((good / total) * 100) : null, topStruggle: top ? struggleLabel(top[0]) : null, weekly };
}

/** Class page: students not cold-called for the longest (never first), and % answered well this week. */
export function classColdCallSummary(students: Student[], calls: ColdCall[], today: string) {
  const last = new Map<string, string>();
  for (const c of calls) if ((last.get(c.studentId) ?? '') < c.date) last.set(c.studentId, c.date);
  const waiting = students.filter((s) => !s.archived)
    .map((s) => ({ s, last: last.get(s.id) ?? null }))
    .sort((a, b) => (a.last ?? '').localeCompare(b.last ?? ''))
    .slice(0, 3);
  const week = calls.filter((c) => { const d = daysBetween(c.date, today); return d >= 0 && d < 7; });
  return { waiting, weekGoodPct: week.length ? Math.round((week.filter((c) => c.result === 'good').length / week.length) * 100) : null, weekCount: week.length };
}
