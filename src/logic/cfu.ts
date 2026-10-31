// Check for understanding (round 9): Whole class marks, ticket questions, the
// per-lesson understanding score, content signals and "absent for the rest of the day".
// Pure functions so they can be tested.

import type { AbsentToday, CfuCheck, CfuResult, CfuResultValue, ColdCall, Lesson } from '../types';
import { CONTENT_SIGNAL, FALLBACK_ENTRY_QUESTION, FALLBACK_QUESTION, INTENTION_LEAD_INS, MAX_TICKET_QUESTIONS, SUGGESTED_QUESTION } from '../config/cfu';
import { daysBetween } from '../lib/dates';

/* ---------------- Absent for the rest of the day ---------------- */

export const absentId = (date: string, classId: string, studentId: string) => `${date}|${classId}|${studentId}`;

/** Students marked absent in this class today. Other classes and other days don't count. */
export function absentIds(absences: AbsentToday[], classId: string, date: string): Set<string> {
  return new Set(absences.filter((a) => a.classId === classId && a.date === date).map((a) => a.studentId));
}

/* ---------------- Whole class ---------------- */

/** Whole class mark: Yes ('got'), Sort of ('partly'), Not yet, or Absent. */
export type GridMark = Extract<CfuResultValue, 'got' | 'partly' | 'notyet' | 'absent'>;

/** Everyone starts as Yes; students absent today start as Absent. */
export function wholeClassStart(studentIds: string[], absent: Set<string>): Record<string, GridMark> {
  return Object.fromEntries(studentIds.map((id) => [id, absent.has(id) ? 'absent' : 'got']));
}

/** A tap: Yes ↔ Not yet (Sort of goes back to Yes). */
export const tapMark = (m: GridMark): GridMark => (m === 'got' ? 'notyet' : 'got');
/** Press and hold: Sort of (holding again goes back to Yes). */
export const holdMark = (m: GridMark): GridMark => (m === 'partly' ? 'got' : 'partly');

/** Blitz: absent-today students start as Absent. */
export function prefillAbsent<T extends string>(marks: Record<string, T>, absent: Set<string>, studentIds: string[]): Record<string, T | 'absent'> {
  const out: Record<string, T | 'absent'> = { ...marks };
  for (const id of studentIds) if (absent.has(id) && out[id] === undefined) out[id] = 'absent';
  return out;
}

/** "All others: Yes": every unchecked student becomes Yes. Absent students are skipped. */
export function allOthersYes<T extends string>(marks: Record<string, T>, studentIds: string[], absent: Set<string>, yes: T): Record<string, T> {
  const out = { ...marks };
  for (const id of studentIds) if (out[id] === undefined && !absent.has(id)) out[id] = yes;
  return out;
}

/* ---------------- Tickets ---------------- */

/** "Explain how rivers form meanders." → "how rivers form meanders" (leading instruction words dropped). */
export function intentionTopic(intention: string): string {
  let t = intention.trim().replace(/[.!?]+$/, '');
  for (let again = true; again;) {
    again = false;
    for (const w of INTENTION_LEAD_INS) {
      const m = t.match(new RegExp(`^${w}\\b[,:]?\\s+`, 'i'));
      if (m && t.length > m[0].length) { t = t.slice(m[0].length); again = true; }
    }
  }
  return t.replace(/^./, (x) => x.toLowerCase());
}

const fill = (intention: string) => SUGGESTED_QUESTION.replace('{intention}', intentionTopic(intention));

/** Suggested question. Exit tickets use this lesson's intention; entry tickets the previous lesson's. */
export function suggestedQuestion(kind: 'exit' | 'entry', lesson: Pick<Lesson, 'intention'>, previous?: Pick<Lesson, 'intention'>): string {
  const intention = (kind === 'exit' ? lesson.intention : previous?.intention)?.trim();
  if (intention) return fill(intention);
  return kind === 'exit' ? FALLBACK_QUESTION : FALLBACK_ENTRY_QUESTION;
}

/** A ticket's questions (older tickets saved one `question`). */
export const ticketQuestions = (c: Pick<CfuCheck, 'questions' | 'question'>): string[] => c.questions ?? (c.question ? [c.question] : []);

/** Up to 3 questions, tidied, blanks dropped. */
export const tidyQuestions = (qs: string[]) => qs.map((q) => q.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, MAX_TICKET_QUESTIONS);

/** Saved questions for a class: newest first, no repeats (ignoring case). */
export function addSavedQuestion(saved: string[] = [], q: string): string[] {
  const t = tidyQuestions([q])[0];
  if (!t) return saved;
  return [t, ...saved.filter((x) => x.toLowerCase() !== t.toLowerCase())];
}

/** Close lesson: offer "Run an exit ticket?" when none was done in this lesson. */
export const exitTicketDone = (checks: CfuCheck[], lessonId: string) => checks.some((c) => c.lessonId === lessonId && c.kind === 'exit');

/* ---------------- Scores ---------------- */

const pctOf = (a: number, b: number) => Math.round((a / b) * 100);

/** % got it from per-student results (absent left out). */
function resultScore(rs: CfuResult[]): number | null {
  const answered = rs.filter((r) => r.result !== 'absent');
  return answered.length ? pctOf(answered.filter((r) => r.result === 'got').length, answered.length) : null;
}

/** The lesson's understanding score (% got it) from Whole class and ticket results. */
export function lessonScore(lessonId: string, _checks: CfuCheck[], results: CfuResult[]): number | null {
  return resultScore(results.filter((r) => r.lessonId === lessonId));
}

/** Exit-ticket score for one lesson (% got it), or null. */
export const exitScore = (lessonId: string, results: CfuResult[]) => resultScore(results.filter((r) => r.lessonId === lessonId && r.kind === 'exit'));

/** Class graph: understanding score for each of the last lessons that had a check (oldest first). */
export function scoreSeries(lessons: Lesson[], checks: CfuCheck[], results: CfuResult[], max = 12) {
  const rows = [...lessons].sort((a, b) => a.openedAt - b.openedAt)
    .map((l) => ({ lesson: l, score: lessonScore(l.id, checks, results) }))
    .filter((x) => x.score !== null).slice(-max);
  return { lessons: rows.map((x) => x.lesson), values: rows.map((x) => x.score! / 100) };
}

/* ---------------- What the results feed ---------------- */

const RESULT_TEXT: Record<CfuResultValue, string> = { got: 'got it', partly: 'partly', notyet: 'not yet', absent: 'absent' };
const KIND_TEXT = { yesno: 'Whole class', exit: 'Exit ticket', entry: 'Entry ticket' } as const;

/** Student timeline: "Exit ticket: not yet (misconception)". */
export function resultText(r: Pick<CfuResult, 'kind' | 'result' | 'tags'>): string {
  return `${KIND_TEXT[r.kind]}: ${RESULT_TEXT[r.result]}${r.tags?.length ? ` (${r.tags.join(', ')})` : ''}`;
}

/** Content signals for one student: "Not yet" on yes/no or tickets, and struggled cold calls, in the last `days`. */
export function contentSignals(studentId: string, results: CfuResult[], coldCalls: ColdCall[], today: string, days = CONTENT_SIGNAL.days) {
  const recent = (d: string) => { const n = daysBetween(d, today); return n >= 0 && n < days; };
  const notYet = results.filter((r) => r.studentId === studentId && r.result === 'notyet' && recent(r.date)).length;
  const struggled = coldCalls.filter((c) => c.studentId === studentId && c.result === 'struggled' && recent(c.date)).length;
  return { notYet, struggled, total: notYet + struggled };
}

/** Issue screen → Coping: why "Content" is suggested, or null. */
export function contentHint(sig: { notYet: number; struggled: number; total: number }, at = CONTENT_SIGNAL.suggestAt): string | null {
  if (sig.total < at) return null;
  const parts = [sig.notYet && `${sig.notYet} "not yet"`, sig.struggled && `${sig.struggled} struggled cold call${sig.struggled === 1 ? '' : 's'}`].filter(Boolean);
  return `Suggested: ${parts.join(' and ')} recently`;
}

/** My teaching: exit-ticket scores in lessons where the plan was finished vs not. Needs 2 lessons on each side. */
export function planTicketInsight(lessons: Lesson[], results: CfuResult[]): string | null {
  const scored = lessons.filter((l) => l.planDone).map((l) => ({ l, s: exitScore(l.id, results) })).filter((x) => x.s !== null);
  const yes = scored.filter((x) => x.l.planDone === 'yes'), no = scored.filter((x) => x.l.planDone !== 'yes');
  if (yes.length < 2 || no.length < 2) return null;
  const avg = (xs: typeof scored) => Math.round(xs.reduce((t, x) => t + x.s!, 0) / xs.length);
  return `Lessons where you got through the plan averaged ${avg(yes)}% on exit tickets, vs ${avg(no)}% when you didn't.`;
}
