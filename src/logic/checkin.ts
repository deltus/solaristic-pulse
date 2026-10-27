// The swipe check-in: what gets saved for All good and Issue, and how a student's recent
// check-ins are summarised on their card (last 3 results, open follow-up, positive streak).
// Pure functions: no database access, so they are easy to test.

import type { Checkin, IssueTag, Observation, Student } from '../types';
import { CHECKIN_AREAS, ISSUE_AREAS, STREAK, WELLBEING, WELLBEING_RECENT_DAYS, areaById, isMinor, subLabel } from '../config/checkin';
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
  /** Tapped areas → ticked sub-option ids (may be empty). Untapped areas are left out. Includes 'wellbeing' when its tick box is on. */
  areas: Record<string, string[]>;
  /** Minor items ticked (e.g. behaviour → ['gum']). They never make their area an issue. */
  minor?: Record<string, string[]>;
  note?: string;
  /** Notes held onto single sub-options, keyed `${areaId}|${subId}`. */
  subNotes?: Record<string, string>;
  followUp?: boolean;
}

/**
 * Issue: tapped areas "needs support" (observed), untapped "meets" (implied), one row per ticked
 * sub-option. Wellbeing only gets a row when ticked. Minor items alone save as tags on an otherwise
 * All good check-in, so they don't change the area's average or the ranking.
 */
export function buildIssue(t: CheckinTarget, input: IssueInput): SavedRecords {
  const now = t.now ?? Date.now();
  const id = checkinIdFor(t.lessonId, t.studentId);
  const note = input.note?.trim() || undefined;
  const issueAreas = ISSUE_AREAS.filter((a) => input.areas[a.id] !== undefined);
  const minorPicked = ISSUE_AREAS.flatMap((a) => [...new Set(input.minor?.[a.id] ?? [])].filter((m) => isMinor(a.id, m)).map((m) => [a.id, m] as const));
  const minorOnly = !issueAreas.length && minorPicked.length > 0;
  if (!issueAreas.length && !minorOnly) throw new Error('Choose at least one area');
  const isIssue = (areaId: string) => issueAreas.some((a) => a.id === areaId);
  const noteArea = issueAreas[0]?.id;
  const tag = (areaId: string, sub: string, minor: boolean): IssueTag => {
    const subNote = input.subNotes?.[`${areaId}|${sub}`]?.trim();
    return {
      id: `${id}|${areaId}|${sub}`, checkinId: id, studentId: t.studentId, classId: t.classId, date: t.date, areaId, tagId: sub,
      source: 'observed', createdAt: now, ...(minor ? { minor: true } : {}), ...(subNote ? { note: subNote } : {})
    };
  };
  return {
    checkin: {
      id, studentId: t.studentId, classId: t.classId, date: t.date, lessonId: t.lessonId, createdAt: now, status: 'complete', source: 'daily',
      result: minorOnly ? 'good' : 'issue', ...(minorOnly ? {} : { followUp: input.followUp ?? true }), ...(note ? { note } : {})
    },
    // The note also goes on the first issue area so older screens and reports show it.
    observations: [
      ...CHECKIN_AREAS.map((a) => areaRow(t, id, a.id, isIssue(a.id), now, a.id === noteArea ? note : undefined)),
      ...(isIssue(WELLBEING.id) ? [areaRow(t, id, WELLBEING.id, true, now, noteArea === WELLBEING.id ? note : undefined)] : [])
    ],
    tags: [
      ...issueAreas.flatMap((a) => [...new Set(input.areas[a.id])].filter((sub) => a.subs.some((s) => s.id === sub)).map((sub) => tag(a.id, sub, false))),
      ...minorPicked.map(([areaId, m]) => tag(areaId, m, true))
    ]
  };
}

export interface CheckinSummary {
  checkin: Checkin;
  kind: 'good' | 'issue' | 'absent' | 'skipped';
  /** Areas with an issue, with their ticked sub-options. */
  issues: { areaId: string; name: string; subs: string[] }[];
  /** Notes held onto single sub-options ("Disruptive: threw a pen"). */
  subNotes: string[];
  /** Minor items ticked (e.g. "Gum"). */
  minor: string[];
}

const tagIsMinor = (t: IssueTag) => !!t.minor || isMinor(t.areaId, t.tagId);

/** Works for swipe check-ins and older question-by-question ones (any "needs support" answer = issue). */
export function summarise(c: Checkin, obs: Observation[], tags: IssueTag[]): CheckinSummary {
  if (c.status === 'absent' || c.status === 'skipped') return { checkin: c, kind: c.status, issues: [], subNotes: [], minor: [] };
  const mine = obs.filter((o) => o.checkinId === c.id && !o.exceeding);
  const bad = mine.filter((o) => (o.level ?? 0) >= 1);
  const myTags = tags.filter((t) => t.checkinId === c.id);
  const issues = [...new Set(bad.map((o) => o.categoryId))].map((areaId) => ({
    areaId,
    name: areaById(areaId)?.name ?? areaId,
    subs: myTags.filter((t) => t.areaId === areaId && !tagIsMinor(t)).map((t) => subLabel(areaId, t.tagId))
  }));
  const minor = myTags.filter(tagIsMinor).map((t) => subLabel(t.areaId, t.tagId));
  const kind = c.result ?? (issues.length ? 'issue' : 'good');
  const subNotes = myTags.filter((t) => t.note).map((t) => `${subLabel(t.areaId, t.tagId)}: ${t.note}`);
  return { checkin: c, kind, issues, subNotes, minor };
}

const newestFirst = (a: Checkin, b: Checkin) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt;

/** Most recent check-ins (excluding skipped), newest first. */
export function recentSummaries(checkins: Checkin[], obs: Observation[], tags: IssueTag[], n = 3): CheckinSummary[] {
  return checkins.filter((c) => c.status !== 'skipped').sort(newestFirst).slice(0, n).map((c) => summarise(c, obs, tags));
}

export function summaryText(s: CheckinSummary): string {
  if (s.kind === 'absent') return 'Not here';
  if (s.kind === 'skipped') return 'Skipped';
  const minor = s.minor?.length ? `Minor: ${s.minor.join(', ').toLowerCase()}` : '';
  if (s.kind === 'good') return minor ? `All good · ${minor}` : 'All good';
  const main = s.issues.map((i) => (i.subs.length ? `${i.name}: ${i.subs.join(', ').toLowerCase()}` : i.name)).join(' · ') || 'Issue';
  return minor ? `${main} · ${minor}` : main;
}

/** Times Wellbeing was flagged in the last few weeks ("Wellbeing flagged 2× recently" on the card). */
export function wellbeingRecent(obs: Observation[], today: string, days = WELLBEING_RECENT_DAYS): number {
  return new Set(obs.filter((o) => o.categoryId === WELLBEING.id && (o.level ?? 0) >= 1 && daysBetween(o.date, today) >= 0 && daysBetween(o.date, today) < days).map((o) => o.checkinId)).size;
}

/** Minor items over a period ("Uniform 3× this term"), most frequent first. */
export function minorCounts(tags: IssueTag[], today: string, days = 70): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of tags) {
    if (!tagIsMinor(t)) continue;
    const d = daysBetween(t.date, today);
    if (d < 0 || d >= days) continue;
    const label = subLabel(t.areaId, t.tagId);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
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
  const notes = [...(last.note ? [last.note] : []), ...s.subNotes];
  return { date: last.date, text: `${summaryText(s)}${notes.length ? ` ("${notes.join("; ")}")` : ""}`, summary: s };
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

export type Trend = 'up' | 'flat' | 'down';

export interface AreaAverage { meets: number; total: number; prevMeets: number; prevTotal: number; trend: Trend | null }

/**
 * Running average for one area on the card: "Meets 8 of last 10", and whether that is up, flat
 * or down on the 10 before. All good counts as meeting. Blitz and "exceeding" rows are left out.
 */
export function areaAverage(obs: Observation[], areaId: string, n = 10): AreaAverage {
  const rows = obs
    .filter((o) => o.categoryId === areaId && o.level !== null && !o.blitz && !o.exceeding)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const last = rows.slice(0, n), prev = rows.slice(n, n * 2);
  const meets = last.filter((o) => o.level === 0).length, prevMeets = prev.filter((o) => o.level === 0).length;
  let trend: Trend | null = null;
  if (last.length >= 3 && prev.length >= 3) {
    const diff = meets / last.length - prevMeets / prev.length;
    trend = diff > 0.1 ? 'up' : diff < -0.1 ? 'down' : 'flat';
  }
  return { meets, total: last.length, prevMeets, prevTotal: prev.length, trend };
}

/**
 * De-identified exports leave Wellbeing out entirely: its rows and details, and the notes on any
 * check-in that flagged it (a shared note could describe it).
 */
export function stripWellbeing<O extends Observation, T extends IssueTag, C extends Checkin>(observations: O[], tags: T[], checkins: C[]) {
  const flagged = new Set(observations.filter((o) => o.categoryId === WELLBEING.id).map((o) => o.checkinId));
  return {
    observations: observations.filter((o) => o.categoryId !== WELLBEING.id).map((o) => (flagged.has(o.checkinId) && o.note ? { ...o, note: undefined } : o)),
    tags: tags.filter((t) => t.areaId !== WELLBEING.id),
    checkins: checkins.map((c) => (flagged.has(c.id) && c.note ? { ...c, note: undefined } : c))
  };
}
