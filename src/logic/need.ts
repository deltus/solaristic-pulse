// Ranking for the daily check-in queue (replaces the old draw weight).
//
//   need = concernWeight × recentConcern + seenWeight × lessonsSinceSeen
//
// recentConcern: issues in recent check-ins, Blitz "No"s and homework not done, each halving
//   in value every couple of weeks, plus an open follow-up and a teacher flag. Starts at 0.
// lessonsSinceSeen: lessons of this class since the student was last logged. Never seen scores
//   very high, so a new class works through everyone before anyone comes up twice.
// The weights live in src/config/checkin.ts (RANKING).

import type { Checkin, HomeworkCheck, IssueTag, Observation, Student } from '../types';
import { RANKING } from '../config/checkin';
import { daysBetween } from '../lib/dates';
import { lessonOf, openFollow } from './checkin';

export interface NeedRow {
  studentId: string;
  need: number;
  concern: number;
  /** null = never logged in this class. */
  lessonsSince: number | null;
  reasons: string[];
}

const age = (date: string, today: string) => {
  const d = daysBetween(date, today);
  return d < 0 || d > RANKING.lookbackDays ? 0 : Math.pow(0.5, d / RANKING.halfLifeDays);
};
const round1 = (n: number) => Math.round(n * 10) / 10;

export function recentConcern(
  student: Pick<Student, 'flag'>, obs: Observation[], homework: HomeworkCheck[], checkins: Checkin[], tags: IssueTag[], today: string
): { value: number; reasons: string[] } {
  let v = 0;
  let issues = 0;
  for (const o of obs) {
    if ((o.level ?? 0) < 1 || o.exceeding) continue;
    const w = age(o.date, today);
    if (!w) continue;
    v += w * (o.blitz ? RANKING.blitzNo : RANKING.issue);
    issues++;
  }
  const hw = homework.filter((h) => !h.done && age(h.date, today) > 0);
  for (const h of hw) v += age(h.date, today) * RANKING.homeworkNotDone;
  const reasons: string[] = [];
  if (issues) reasons.push(`${issues} recent issue${issues === 1 ? '' : 's'}`);
  if (hw.length) reasons.push(`Homework not done ${hw.length}×`);
  if (openFollow(checkins, obs, tags)) { v += RANKING.openFollowUp; reasons.push('Follow-up due'); }
  if (student.flag) { v += RANKING.flag; reasons.push('Flagged by you'); }
  return { value: round1(v), reasons };
}

/** This class's lessons in order (oldest first), from anything logged in them, plus the current one. */
export function lessonOrder(checkins: Checkin[], homework: HomeworkCheck[], current?: string): string[] {
  const ids = new Set<string>([...checkins.map(lessonOf), ...homework.map((h) => h.lessonId)]);
  if (current) ids.add(current);
  // Lesson ids start with the date, so sorting them sorts by time.
  return [...ids].sort();
}

/** Lessons since the student was last logged (0 = seen in the current lesson). */
export function lessonsSinceSeen(studentId: string, checkins: Checkin[], order: string[], current: string): number | null {
  const seen = checkins.filter((c) => c.studentId === studentId && (c.status === 'complete' || c.status === 'partial')).map(lessonOf);
  if (!seen.length) return null;
  const last = Math.max(...seen.map((l) => order.indexOf(l)));
  return Math.max(0, order.indexOf(current) - last);
}

export interface NeedInput {
  students: Student[];
  /** Everything for this class. */
  checkins: Checkin[];
  observations: Observation[];
  tags: IssueTag[];
  homework: HomeworkCheck[];
  lessonId: string;
  today: string;
  excludeIds?: Set<string>;
}

/** Stable "random" tie-breaker: the same within a lesson, different between lessons. */
export function tieHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function rankByNeed(input: NeedInput): NeedRow[] {
  const { students, checkins, observations, tags, homework, lessonId, today, excludeIds } = input;
  const order = lessonOrder(checkins, homework, lessonId);
  return students
    .filter((s) => !s.archived && !excludeIds?.has(s.id))
    .map((s) => {
      const sChk = checkins.filter((c) => c.studentId === s.id);
      const c = recentConcern(s, observations.filter((o) => o.studentId === s.id), homework.filter((h) => h.studentId === s.id), sChk, tags.filter((t) => t.studentId === s.id), today);
      const since = lessonsSinceSeen(s.id, checkins, order, lessonId);
      const need = RANKING.concernWeight * Math.min(c.value, RANKING.concernCap) + RANKING.seenWeight * (since ?? RANKING.neverSeenLessons);
      return { studentId: s.id, need: round1(need), concern: c.value, lessonsSince: since, reasons: c.reasons };
    })
    .sort((a, b) => b.need - a.need || tieHash(lessonId + a.studentId) - tieHash(lessonId + b.studentId));
}

/** Need rows for students across several classes (each ranked within its own class, at today's lesson). */
export function needByStudent(
  students: Student[], checkins: Checkin[], observations: Observation[], tags: IssueTag[], homework: HomeworkCheck[], today: string, lessonIdFor: (date: string, classId: string) => string
): Map<string, NeedRow> {
  const out = new Map<string, NeedRow>();
  for (const classId of new Set(students.map((s) => s.classId))) {
    const rows = rankByNeed({
      students: students.filter((s) => s.classId === classId), checkins: checkins.filter((c) => c.classId === classId),
      observations: observations.filter((o) => o.classId === classId), tags: tags.filter((t) => t.classId === classId),
      homework: homework.filter((h) => h.classId === classId), lessonId: lessonIdFor(today, classId), today
    });
    for (const r of rows) out.set(r.studentId, r);
  }
  return out;
}

/** "Recent concerns: 2 · Last seen: 4 lessons ago" */
export function needWords(r: Pick<NeedRow, 'concern' | 'lessonsSince'>): string {
  const seen = r.lessonsSince === null ? 'Not seen yet' : r.lessonsSince === 0 ? 'Last seen: this lesson' : `Last seen: ${r.lessonsSince} lesson${r.lessonsSince === 1 ? '' : 's'} ago`;
  return `Recent concerns: ${r.concern} · ${seen}`;
}
