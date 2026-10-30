// Seating data around the planner: relationship suggestions from check-in signals, "left out"
// students, ICP → seating need suggestions, support levels (with review dates) and the seat watch
// after a new plan. Pure functions; the services save the results.

import type { AssessmentCheck, ColdCall, IcpAdjustment, IssueTag, Lesson, Relationship, RelationshipType, RoomLayout, SeatWatch, SeatingPlan, Student } from '../types';
import { ICP_SEATING, LEFT_OUT_DAYS, SEAT_WATCH, SIGNALS, SUPPORT_REVIEW_WEEKS, SUPPORT_SUGGEST } from '../config/seating';
import { subLabel } from '../config/checkin';
import { addDays, daysBetween } from '../lib/dates';
import type { PlannerRelationship, PlannerStudent } from './seating';
import { tableName } from './rooms';

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const within = (date: string, today: string, days: number) => { const d = daysBetween(date, today); return d >= 0 && d <= days; };
const isMuted = (r: Relationship, today: string) => r.muted === 'never' || (!!r.muted && r.muted >= today);

export interface PairSuggestion { type: RelationshipType; a: string; b: string; count: number }

/**
 * Pairs with 2 or more unconfirmed signals of the same kind in the last 6 weeks, unless the pair is
 * already confirmed that way, or the teacher said "Not now" (for 2 weeks) or "Never suggest".
 */
export function pairSuggestions(rels: Relationship[], today: string): PairSuggestion[] {
  const counts = new Map<string, PairSuggestion>();
  const settled = new Set<string>();
  for (const r of rels) {
    if (r.studentA === r.studentB) continue;
    const k = `${r.type}|${pairKey(r.studentA, r.studentB)}`;
    if (r.confirmed || isMuted(r, today)) { settled.add(k); continue; }
    if (r.source !== 'checkin' || !within(r.date, today, SIGNALS.days)) continue;
    const cur = counts.get(k) ?? { type: r.type, a: r.studentA, b: r.studentB, count: 0 };
    cur.count++;
    counts.set(k, cur);
  }
  return [...counts].filter(([k, s]) => s.count >= SIGNALS.needed && !settled.has(k)).map(([, s]) => s).sort((x, y) => y.count - x.count);
}

/** Relationships the planner uses: confirmed ones, plus unconfirmed ones ticked "use anyway". */
export function plannerRelationships(rels: Relationship[]): PlannerRelationship[] {
  const best = new Map<string, PlannerRelationship>();
  for (const r of rels) {
    if (r.studentA === r.studentB || !(r.confirmed || r.useAnyway) || r.muted) continue;
    const k = `${r.type}|${pairKey(r.studentA, r.studentB)}`;
    const cur = best.get(k);
    if (!cur || r.strength > cur.strength) best.set(k, { a: r.studentA, b: r.studentB, type: r.type, strength: r.type === 'keepApart' ? r.strength : 1 });
  }
  return [...best.values()];
}

/** Confirmed (or "use anyway") relationships, one row per pair and kind, for the Relationships list. */
export function relationshipList(rels: Relationship[]): Relationship[] {
  const seen = new Set<string>();
  return [...rels].sort((a, b) => b.updatedAt - a.updatedAt).filter((r) => {
    if (r.studentA === r.studentB || !(r.confirmed || r.useAnyway) || r.muted) return false;
    const k = `${r.type}|${pairKey(r.studentA, r.studentB)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Students flagged with Wellbeing → friendship issues recently. Being left out never separates
 * students; it means making sure they sit with someone they work well with.
 */
export function leftOutStudents(tags: IssueTag[], today: string): Set<string> {
  return new Set(tags.filter((t) => t.areaId === 'wellbeing' && t.tagId === 'friendship' && within(t.date, today, LEFT_OUT_DAYS)).map((t) => t.studentId));
}

/** Left-out students with no confirmed works-well partner yet (and no "Not now" on the suggestion). */
export function leftOutSuggestions(leftOut: Set<string>, rels: Relationship[], today: string): string[] {
  const usable = plannerRelationships(rels);
  return [...leftOut].filter((id) =>
    !usable.some((r) => r.type === 'worksWell' && (r.a === id || r.b === id)) &&
    !rels.some((r) => r.id === leftOutMuteId(id) && isMuted(r, today)));
}
export const leftOutMuteId = (studentId: string) => `leftout|${studentId}`;

/** Seating needs an active ICP adjustment suggests that the student doesn't have (and wasn't dismissed). */
export function icpNeedSuggestions(s: Pick<Student, 'id' | 'seatingNeeds' | 'seatingIcpDismissed'>, adjustments: IcpAdjustment[]): { need: string; adjustment: IcpAdjustment }[] {
  const out: { need: string; adjustment: IcpAdjustment }[] = [];
  for (const a of adjustments) {
    if (a.studentId !== s.id || !a.active) continue;
    for (const m of ICP_SEATING) {
      if (!m.match.test(`${a.title} ${a.details ?? ''}`)) continue;
      if (s.seatingNeeds?.includes(m.need) || s.seatingIcpDismissed?.includes(m.need) || out.some((o) => o.need === m.need)) continue;
      out.push({ need: m.need, adjustment: a });
    }
  }
  return out;
}

/** Needs on the student that an active ICP adjustment also suggests (reason: "ICP seating need"). */
export const icpBackedNeeds = (s: Pick<Student, 'id' | 'seatingNeeds'>, adjustments: IcpAdjustment[]) =>
  (s.seatingNeeds ?? []).filter((n) => adjustments.some((a) => a.studentId === s.id && a.active && ICP_SEATING.some((m) => m.need === n && m.match.test(`${a.title} ${a.details ?? ''}`))));

/* ---------------- Support right now ---------------- */

/** A new support level, reviewed 10 weeks from today. */
export const newSupport = (level: 'more' | 'on_track' | 'extension', today: string) => ({ level, setAt: today, reviewBy: addDays(today, SUPPORT_REVIEW_WEEKS * 7) });

/** The level the planner may use: only when switched on and not past its review date. */
export function supportFor(s: Pick<Student, 'support'>, useSupport: boolean, today: string) {
  if (!useSupport || !s.support || s.support.reviewBy < today) return undefined;
  return s.support.level;
}
export const supportNeedsReview = (s: Pick<Student, 'support'>, today: string) => !!s.support && s.support.reviewBy < today;

/**
 * Suggest "needs more support" (the teacher decides): 3 or more Coping → content or assessment
 * progress concerns, or under 40% of cold calls answered well, in the last 4 weeks.
 */
export function supportSuggestion(studentId: string, tags: IssueTag[], coldCalls: ColdCall[], today: string, assessment: AssessmentCheck[] = []): string | null {
  const recent = (d: string) => within(d, today, SUPPORT_SUGGEST.days);
  const content = tags.filter((t) => t.studentId === studentId && t.areaId === 'coping' && (t.tagId === 'content' || t.tagId === 'assessment_progress') && recent(t.date)).length
    + assessment.filter((a) => a.studentId === studentId && a.result === 'behind' && recent(a.date)).length;
  const calls = coldCalls.filter((c) => c.studentId === studentId && recent(c.date));
  const good = calls.filter((c) => c.result === 'good').length;
  const parts: string[] = [];
  if (content >= SUPPORT_SUGGEST.contentConcerns) parts.push(`${content} content or assessment concerns`);
  if (calls.length >= SUPPORT_SUGGEST.minColdCalls && good / calls.length < SUPPORT_SUGGEST.coldCallWellBelow) parts.push(`${Math.round((good / calls.length) * 100)}% of ${calls.length} cold calls answered well`);
  return parts.length ? `${parts.join(' and ')} in the last 4 weeks` : null;
}

/* ---------------- Planner input ---------------- */

/** Recent Attention concerns for the planner ("off task 4× recently"). */
export function attentionOf(studentId: string, tags: IssueTag[], today: string): { count: number; text?: string } {
  const recent = tags.filter((t) => t.studentId === studentId && t.areaId === 'focus' && !t.minor && within(t.date, today, 28));
  if (!recent.length) return { count: 0 };
  const by = new Map<string, number>();
  for (const t of recent) by.set(t.tagId, (by.get(t.tagId) ?? 0) + 1);
  const [top, n] = [...by].sort((a, b) => b[1] - a[1])[0];
  return { count: recent.length, text: `${subLabel('focus', top).toLowerCase()} ${n}× recently` };
}

export function plannerStudents(input: {
  students: Student[]; tags: IssueTag[]; adjustments: IcpAdjustment[]; concern: Map<string, number>; useSupport: boolean; today: string; noAloneTagIds?: string[];
}): PlannerStudent[] {
  const leftOut = leftOutStudents(input.tags, input.today);
  return input.students.filter((s) => !s.archived).map((s) => {
    const att = attentionOf(s.id, input.tags, input.today);
    return {
      id: s.id, name: `${s.preferredName || s.firstName} ${s.lastName}`.trim(),
      needs: s.seatingNeeds ?? [], icpNeeds: icpBackedNeeds(s, input.adjustments),
      support: supportFor(s, input.useSupport, input.today),
      tags: s.balanceTags ?? [], attention: att.count, attentionText: att.text,
      concern: input.concern.get(s.id) ?? 0, leftOut: leftOut.has(s.id)
    };
  });
}

/* ---------------- Seat watch ---------------- */

/** "Table 3" for a student in a plan, or null. */
export function seatLabel(plan: Pick<SeatingPlan, 'room' | 'seats'> | null | undefined, studentId: string): string | null {
  if (!plan) return null;
  const seat = Object.entries(plan.seats).find(([, v]) => v.studentId === studentId)?.[0];
  return seat === undefined ? null : tableName(plan.room as RoomLayout, seat);
}

export const newWatch = (planId: string, table: string, reason: SeatWatch['reason'], today: string): SeatWatch => ({ planId, table, since: today, reason, answers: [] });

export const watchActive = (w?: SeatWatch) => !!w && !w.ended;

/** Ranking boost for the first 3 lessons after the new seat. */
export function watchBoosted(w: SeatWatch | undefined, lessons: Pick<Lesson, 'date'>[]): boolean {
  if (!watchActive(w)) return false;
  return lessons.filter((l) => l.date >= w!.since).length <= SEAT_WATCH.lessons;
}

/** Record "Settled" / "Not settled" for a lesson. Two Settled in a row end the watch. */
export function answerWatch(w: SeatWatch, settled: boolean, date: string, lessonId: string): SeatWatch {
  const answers = [...w.answers.filter((a) => a.lessonId !== lessonId), { date, lessonId, settled }];
  const last = answers.slice(-SEAT_WATCH.settledToEnd);
  const ended = last.length === SEAT_WATCH.settledToEnd && last.every((a) => a.settled);
  return { ...w, answers, review: !settled, ended };
}

/** "Review seat" item: the last answer was Not settled. */
export const watchReview = (w?: SeatWatch) => watchActive(w) && !!w!.review;
/** Two Not settled in a row: a suggestion on Home. */
export function watchRaise(w?: SeatWatch): boolean {
  if (!watchActive(w)) return false;
  const last = w!.answers.slice(-SEAT_WATCH.notSettledToRaise);
  return last.length === SEAT_WATCH.notSettledToRaise && last.every((a) => !a.settled);
}
