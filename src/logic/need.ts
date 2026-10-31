// Ranking for the daily check-in queue (replaces the old draw weight).
//
//   need = concernWeight × recentConcern + seenWeight × lessonsSinceSeen
//
// recentConcern: issues in recent check-ins, Blitz "No"s and homework not done, each halving
//   in value every couple of weeks, plus an open follow-up and a teacher flag. Starts at 0.
// lessonsSinceSeen: Lesson records of this class since the student was last logged. Never seen scores
//   very high, so a new class works through everyone before anyone comes up twice.
// The weights live in src/config/checkin.ts (RANKING).

import type { AssessmentCheck, Checkin, HomeworkCheck, IssueTag, Lesson, Observation, Student } from '../types';
import { RANKING } from '../config/checkin';
import { SEAT_WATCH } from '../config/seating';
import { daysBetween } from '../lib/dates';
import { lessonOf, openFollow } from './checkin';
import { openLessonFor } from './lessons';

export interface NeedRow {
  studentId: string;
  need: number;
  concern: number;
  /** null = never logged in this class. */
  lessonsSince: number | null;
  reasons: string[];
  /** Has an urgent follow-up (top of the queue). */
  urgent?: boolean;
}

const age = (date: string, today: string) => {
  const d = daysBetween(date, today);
  return d < 0 || d > RANKING.lookbackDays ? 0 : Math.pow(0.5, d / RANKING.halfLifeDays);
};
const round1 = (n: number) => Math.round(n * 10) / 10;

export function recentConcern(
  student: Pick<Student, 'flag'>, obs: Observation[], homework: HomeworkCheck[], checkins: Checkin[], tags: IssueTag[], today: string,
  /** "Behind" in Assessment check counts like homework not done (Coping with work → assessment progress). */
  assessment: AssessmentCheck[] = []
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
  const behind = assessment.filter((a) => a.result === 'behind' && age(a.date, today) > 0);
  for (const a of behind) v += age(a.date, today) * RANKING.homeworkNotDone;
  const reasons: string[] = [];
  if (issues) reasons.push(`${issues} recent issue${issues === 1 ? '' : 's'}`);
  if (hw.length) reasons.push(`Homework not done ${hw.length}×`);
  if (behind.length) reasons.push(`Behind on an assessment ${behind.length}×`);
  if (openFollow(checkins, obs, tags)) { v += RANKING.openFollowUp; reasons.push('Follow-up due'); }
  if (student.flag) { v += RANKING.flag; reasons.push('Flagged by you'); }
  return { value: round1(v), reasons };
}

/**
 * This class's lessons in order (oldest first): its Lesson records by opening time, plus any
 * older lesson ids found on records (by date), plus the current lesson (last if not yet a record).
 */
export function lessonOrder(checkins: Checkin[], homework: HomeworkCheck[], current?: string, lessons: Lesson[] = []): string[] {
  const time = new Map<string, number>(lessons.map((l) => [l.id, l.openedAt]));
  const fromDate = (id: string) => { const t = new Date(`${id.slice(0, 10)}T00:00:00`).getTime(); return Number.isNaN(t) ? 0 : t; };
  for (const id of [...checkins.map(lessonOf), ...homework.map((h) => h.lessonId)]) if (!time.has(id)) time.set(id, fromDate(id));
  if (current && !time.has(current)) time.set(current, Number.MAX_SAFE_INTEGER);
  return [...time].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([id]) => id);
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
  /** This class's Lesson records (optional: older data and tests can do without). */
  lessons?: Lesson[];
  /** This class's Assessment check results (optional). */
  assessmentChecks?: AssessmentCheck[];
  lessonId: string;
  today: string;
  excludeIds?: Set<string>;
  /** Students on the seat watch (new seat with an "alone" warning, or left out): boosted for a few lessons. */
  seatWatch?: Set<string>;
  /** "Follow up urgently" from an earlier day, not seen since: always at the top. */
  urgent?: Set<string>;
}

/** Stable "random" tie-breaker: the same within a lesson, different between lessons. */
export function tieHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function rankByNeed(input: NeedInput): NeedRow[] {
  const { students, checkins, observations, tags, homework, lessonId, today, excludeIds } = input;
  const order = lessonOrder(checkins, homework, lessonId, input.lessons);
  return students
    .filter((s) => !s.archived && !excludeIds?.has(s.id))
    .map((s) => {
      const sChk = checkins.filter((c) => c.studentId === s.id);
      const c = recentConcern(s, observations.filter((o) => o.studentId === s.id), homework.filter((h) => h.studentId === s.id), sChk, tags.filter((t) => t.studentId === s.id), today, (input.assessmentChecks ?? []).filter((a) => a.studentId === s.id));
      const since = lessonsSinceSeen(s.id, checkins, order, lessonId);
      const watch = input.seatWatch?.has(s.id) ? SEAT_WATCH.boost : 0;
      const need = RANKING.concernWeight * Math.min(c.value, RANKING.concernCap) + RANKING.seenWeight * (since ?? RANKING.neverSeenLessons) + watch;
      const urgent = !!input.urgent?.has(s.id);
      const reasons = [...(urgent ? ['Urgent follow-up'] : []), ...c.reasons, ...(watch ? ['New seat: check how they are going'] : [])];
      return { studentId: s.id, need: round1(need), concern: c.value, lessonsSince: since, reasons, ...(urgent ? { urgent } : {}) };
    })
    .sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent) || b.need - a.need || tieHash(lessonId + a.studentId) - tieHash(lessonId + b.studentId));
}

/**
 * Need rows for students across several classes (each ranked within its own class). The current
 * lesson is the class's open lesson, or the next one if none is open.
 */
export function needByStudent(
  students: Student[], checkins: Checkin[], observations: Observation[], tags: IssueTag[], homework: HomeworkCheck[], today: string, lessons: Lesson[],
  assessmentChecks: AssessmentCheck[] = []
): Map<string, NeedRow> {
  const out = new Map<string, NeedRow>();
  for (const classId of new Set(students.map((s) => s.classId))) {
    const rows = rankByNeed({
      students: students.filter((s) => s.classId === classId), checkins: checkins.filter((c) => c.classId === classId),
      observations: observations.filter((o) => o.classId === classId), tags: tags.filter((t) => t.classId === classId),
      homework: homework.filter((h) => h.classId === classId), lessons: lessons.filter((l) => l.classId === classId), assessmentChecks: assessmentChecks.filter((a) => a.classId === classId),
      lessonId: openLessonFor(lessons, classId)?.id ?? `next|${classId}`, today
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
