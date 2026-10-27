// Assessment check: long tasks (research assignments, fieldwork reports) checked like homework,
// On track / Behind. A task is active until its due date (or until the teacher ends it); after
// that it is a past assessment and its button disappears, unless the due date is extended.

import type { Assessment, AssessmentCheck, Student } from '../types';
import { ASSESSMENT_REASONS } from '../config/checkin';
import { daysBetween, formatShort } from '../lib/dates';

export const isActiveAssessment = (a: Assessment, today: string) => !a.closed && (!a.dueDate || today <= a.dueDate);

export function activeAssessments(list: Assessment[], classId: string, today: string): Assessment[] {
  return list.filter((a) => a.classId === classId && isActiveAssessment(a, today)).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.createdAt - b.createdAt);
}

export function pastAssessments(list: Assessment[], classId: string, today: string): Assessment[] {
  return list.filter((a) => a.classId === classId && !isActiveAssessment(a, today)).sort((a, b) => (b.dueDate ?? '').localeCompare(a.dueDate ?? ''));
}

/** "Due in 3 days", "Due tomorrow", "Due today", "Was due 12 Oct", or "" with no due date. */
export function dueText(a: Pick<Assessment, 'dueDate'>, today: string): string {
  if (!a.dueDate) return '';
  const d = daysBetween(today, a.dueDate);
  if (d < 0) return `Was due ${formatShort(a.dueDate)}`;
  return d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `Due in ${d} days`;
}

/** Each student's most recent result for one task. */
export function latestResults(checks: AssessmentCheck[], assessmentId: string): Map<string, AssessmentCheck> {
  const out = new Map<string, AssessmentCheck>();
  for (const c of checks.filter((x) => x.assessmentId === assessmentId).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)) out.set(c.studentId, c);
  return out;
}

/** Class page bar: "Fieldwork report: 18 on track · 5 behind · 2 not checked". */
export function assessmentSummary(a: Assessment, students: Student[], checks: AssessmentCheck[]) {
  const latest = latestResults(checks, a.id);
  const live = students.filter((s) => !s.archived);
  const onTrack = live.filter((s) => latest.get(s.id)?.result === 'on_track').length;
  const behind = live.filter((s) => latest.get(s.id)?.result === 'behind').length;
  const notChecked = live.length - onTrack - behind;
  return { onTrack, behind, notChecked, text: `${a.name}: ${onTrack} on track · ${behind} behind · ${notChecked} not checked` };
}

export function assessmentResultText(c: Pick<AssessmentCheck, 'result' | 'reasons' | 'checkpoint'>): string {
  const reasons = (c.reasons ?? []).map((r) => (ASSESSMENT_REASONS.find((x) => x.id === r)?.label ?? r).toLowerCase());
  const base = c.result === 'on_track' ? 'On track' : `Behind${reasons.length ? `, ${reasons.join(', ')}` : ''}`;
  return c.checkpoint ? `${c.checkpoint}: ${base}` : base;
}

/** A student's history for each task, newest result first. */
export function studentAssessmentHistory(assessments: Assessment[], checks: AssessmentCheck[], studentId: string) {
  return assessments
    .map((a) => ({ a, rows: checks.filter((c) => c.assessmentId === a.id && c.studentId === studentId).sort((x, y) => y.date.localeCompare(x.date) || y.createdAt - x.createdAt) }))
    .filter((x) => x.rows.length)
    .sort((x, y) => y.rows[0].date.localeCompare(x.rows[0].date));
}
