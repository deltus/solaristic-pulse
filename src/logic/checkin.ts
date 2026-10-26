// The swipe check-in: what gets saved for All good and Issue, and how a student's recent
// check-ins are summarised on their card (last 3 results, open follow-up, positive streak).
// Pure functions: no database access, so they are easy to test.

import type { Checkin, IssueTag, Observation, Student } from '../types';
import { CHECKIN_AREAS, STREAK, areaById, subLabel } from '../config/checkin';
import { daysBetween, formatShort } from '../lib/dates';

/** Until lessons are their own records, a lesson is one class on one day. */
export const lessonIdFor = (date: string, classId: string) => `${date}|${classId}`;
export const checkinIdFor = (lessonId: string, studentId: string) => `${lessonId}|${studentId}`;
/** Older check-ins have no lessonId; they belonged to that day's lesson. */
export const lessonOf = (c: Pick<Checkin, 'lessonId' | 'date' | 'classId'>) => c.lessonId ?? lessonIdFor(c.date, c.classId);

export interface CheckinTarget { studentId: string; classId: string; date: string; lessonId: string; now?: number }
export interface SavedRecords { checkin: Checkin; observations: Observation[]; tags: IssueTag[] }

const MEETS = 'Meeting expectations';
const SUPPORT = 'Needs support';

function areaRow(t: CheckinTarget, checkinId: string, areaId: string, support: boolean, now: number, note?: string): Observation {
  const area = areaById(areaId)!;
  return {
    id: `${checkinId}|${area.questionId}`, checkinId, studentId: t.studentId, classId: t.classId, date: t.date, createdAt: now,
    questionId: area.questionId, categoryId: area.id, response: support ? SUPPORT : MEETS, level: support ? 1 : 0,
    source: support ? 'observed' : 'implied', ...(note ? { note } : {})
  };
}

/** All good: one check-in, every area "meets" (implied). No sub-option rows. */
export function buildAllGood(t: CheckinTarget): SavedRecords {
  const now = t.now ?? Date.now();
  const id = checkinIdFor(t.lessonId, t.studentId);
  return {
    checkin: { id, studentId: t.studentId, classId: t.classId, date: t.date, lessonId: t.lessonId, createdAt: now, status: 'complete', source: 'daily', result: 'good' },
    observations: CHECKIN_AREAS.map((a) => areaRow(t, id, a.id, false, now)),
    tags: []
  };
}

export interface IssueInput {
  /** Tapped areas → ticked sub-option ids (may be empty). Untapped areas are left out. */
  areas: Record<string, string[]>;
  note?: string;
  followUp?: boolean;
}

/** Issue: tapped areas "needs support" (observed), untapped "meets" (implied), one row per ticked sub-option. */
export function buildIssue(t: CheckinTarget, input: IssueInput): SavedRecords {
  const now = t.now ?? Date.now();
  const id = checkinIdFor(t.lessonId, t.studentId);
  const note = input.note?.trim() || undefined;
  const tapped = CHECKIN_AREAS.filter((a) => input.areas[a.id] !== undefined);
  if (!tapped.length) throw new Error('Choose at least one area');
  return {
    checkin: {
      id, studentId: t.studentId, classId: t.classId, date: t.date, lessonId: t.lessonId, createdAt: now, status: 'complete', source: 'daily',
      result: 'issue', followUp: input.followUp ?? true, ...(note ? { note } : {})
    },
    // The note also goes on the first tapped area so older screens and reports show it.
    observations: CHECKIN_AREAS.map((a) => areaRow(t, id, a.id, input.areas[a.id] !== undefined, now, a.id === tapped[0].id ? note : undefined)),
    tags: tapped.flatMap((a) => [...new Set(input.areas[a.id])]
      .filter((sub) => a.subs.some((s) => s.id === sub))
      .map((sub) => ({ id: `${id}|${a.id}|${sub}`, checkinId: id, studentId: t.studentId, classId: t.classId, date: t.date, areaId: a.id, tagId: sub, source: 'observed' as const, createdAt: now })))
  };
}

export interface CheckinSummary {
  checkin: Checkin;
  kind: 'good' | 'issue' | 'absent' | 'skipped';
  /** Areas with an issue, with their ticked sub-options. */
  issues: { areaId: string; name: string; subs: string[] }[];
}

/** Works for swipe check-ins and older question-by-question ones (any "needs support" answer = issue). */
export function summarise(c: Checkin, obs: Observation[], tags: IssueTag[]): CheckinSummary {
  if (c.status === 'absent' || c.status === 'skipped') return { checkin: c, kind: c.status, issues: [] };
  const mine = obs.filter((o) => o.checkinId === c.id && !o.exceeding);
  const bad = mine.filter((o) => (o.level ?? 0) >= 1);
  const issues = [...new Set(bad.map((o) => o.categoryId))].map((areaId) => ({
    areaId,
    name: areaById(areaId)?.name ?? areaId,
    subs: tags.filter((t) => t.checkinId === c.id && t.areaId === areaId).map((t) => subLabel(areaId, t.tagId))
  }));
  const kind = c.result ?? (issues.length ? 'issue' : 'good');
  return { checkin: c, kind, issues };
}

const newestFirst = (a: Checkin, b: Checkin) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt;

/** Most recent check-ins (excluding skipped), newest first. */
export function recentSummaries(checkins: Checkin[], obs: Observation[], tags: IssueTag[], n = 3): CheckinSummary[] {
  return checkins.filter((c) => c.status !== 'skipped').sort(newestFirst).slice(0, n).map((c) => summarise(c, obs, tags));
}

export function summaryText(s: CheckinSummary): string {
  if (s.kind === 'absent') return 'Not here';
  if (s.kind === 'skipped') return 'Skipped';
  if (s.kind === 'good') return 'All good';
  return s.issues.map((i) => (i.subs.length ? `${i.name}: ${i.subs.join(', ').toLowerCase()}` : i.name)).join(' · ') || 'Issue';
}

export interface OpenFollow { date: string; text: string; summary: CheckinSummary }

/**
 * Open follow-up: the student's last completed check-in was an Issue with "follow up next time" on
 * (older check-ins: any "needs support" answer). The next check-in closes it either way.
 */
export function openFollow(checkins: Checkin[], obs: Observation[], tags: IssueTag[], excludeLessonId?: string): OpenFollow | null {
  const last = checkins.filter((c) => c.status === 'complete' || c.status === 'partial').filter((c) => !excludeLessonId || lessonOf(c) !== excludeLessonId).sort(newestFirst)[0];
  if (!last || last.followUp === false) return null;
  const s = summarise(last, obs, tags);
  if (s.kind !== 'issue' || !s.issues.length) return null;
  return { date: last.date, text: `${summaryText(s)}${last.note ? ` ("${last.note}")` : ''}`, summary: s };
}

export function followLead(f: OpenFollow, today: string): string {
  const n = daysBetween(f.date, today);
  return n <= 7 ? `Last lesson (${formatShort(f.date)})` : `Last time (${formatShort(f.date)})`;
}

/** Ask "Consistently good lately?" once a student's last STREAK.length check-ins were all All good. */
export function streakDue(student: Pick<Student, 'streakAskedAt'>, checkins: Checkin[], obs: Observation[], tags: IssueTag[], today: string): boolean {
  if (student.streakAskedAt && daysBetween(student.streakAskedAt, today) < STREAK.quietDays) return false;
  const done = checkins.filter((c) => c.status === 'complete' || c.status === 'partial').sort(newestFirst).slice(0, STREAK.length);
  return done.length === STREAK.length && done.every((c) => summarise(c, obs, tags).kind === 'good');
}
