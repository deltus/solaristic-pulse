import type { Category, IcpAdjustment, IcpCheck, IcpFrequency, IcpOutcome, Observation, Student, TimetableEntry } from '../types';
import { addDays, daysBetween, weekday } from '../lib/dates';

export const ICP_FREQUENCIES: { value: IcpFrequency; label: string; days: number; overdueAfter: number }[] = [
  { value: 'lesson', label: 'Every lesson', days: 0, overdueAfter: 3 },
  { value: 'daily', label: 'Daily', days: 1, overdueAfter: 3 },
  { value: 'weekly', label: 'Weekly', days: 7, overdueAfter: 10 },
  { value: 'fortnightly', label: 'Fortnightly', days: 14, overdueAfter: 18 }
];

export const ICP_OUTCOMES: { value: IcpOutcome; label: string }[] = [
  { value: 'implemented', label: 'Implemented' },
  { value: 'partial', label: 'Partly implemented' },
  { value: 'not', label: 'Not implemented' },
  { value: 'na', label: 'Not applicable today' }
];

export interface IcpDue {
  due: boolean;
  overdue: boolean;
  doneToday: boolean;
  lastDate?: string;
  daysSince?: number;
  label: string;
}

export function icpDueStatus(adj: IcpAdjustment, checks: IcpCheck[], today: string, hasLessonToday: boolean): IcpDue {
  const freq = ICP_FREQUENCIES.find((f) => f.value === adj.frequency) ?? ICP_FREQUENCIES[1];
  const lastDate = checks.filter((c) => c.adjustmentId === adj.id && c.date <= today).map((c) => c.date).sort().pop();
  const doneToday = lastDate === today;
  const inactive = !adj.active || today < adj.startDate || (adj.endDate !== undefined && adj.endDate !== '' && today > adj.endDate);
  if (inactive) return { due: false, overdue: false, doneToday, lastDate, label: 'Not active' };
  if (doneToday) return { due: false, overdue: false, doneToday, lastDate, daysSince: 0, label: 'Checked today' };

  const since = lastDate ? daysBetween(lastDate, today) : daysBetween(adj.startDate, today) + 1;
  let due: boolean;
  if (freq.value === 'lesson') due = hasLessonToday;
  else if (freq.value === 'daily') due = true;
  else due = since >= freq.days;
  const overdue = since > freq.overdueAfter && (freq.value !== 'lesson' || hasLessonToday);
  const label = lastDate
    ? `${overdue ? 'Overdue: ' : ''}last checked ${since} day${since === 1 ? '' : 's'} ago`
    : overdue ? 'Overdue: never checked' : 'Not yet checked';
  return { due: due || overdue, overdue, doneToday, lastDate, daysSince: lastDate ? since : undefined, label };
}

/** Does the class meet on this date? Classes with no timetable count as meeting every day. */
export function hasLessonOn(timetable: TimetableEntry[], classId: string, date: string): boolean {
  const forClass = timetable.filter((t) => t.classId === classId);
  return !forClass.length || forClass.some((t) => t.day === weekday(date));
}

/** ICP checks still due today for one class (the ICP button's badge on the class page). */
export function icpDueForClass(adjustments: IcpAdjustment[], students: Student[], checks: IcpCheck[], timetable: TimetableEntry[], classId: string, date: string): IcpAdjustment[] {
  const inClass = new Set(students.filter((s) => s.classId === classId && !s.archived).map((s) => s.id));
  const lesson = hasLessonOn(timetable, classId, date);
  return adjustments.filter((a) => inClass.has(a.studentId) && a.active && icpDueStatus(a, checks, date, lesson).due);
}

export function implementationSummary(checks: IcpCheck[]) {
  const count = (o: IcpOutcome) => checks.filter((c) => c.outcome === o).length;
  const implemented = count('implemented');
  const partial = count('partial');
  const not = count('not');
  const na = count('na');
  const applicable = implemented + partial + not;
  return {
    total: checks.length, implemented, partial, not, na,
    rate: applicable ? Math.round(((implemented + partial * 0.5) / applicable) * 100) : null
  };
}

export interface BeforeAfterRow {
  categoryId: string;
  categoryName: string;
  before: { n: number; avg: number | null };
  after: { n: number; avg: number | null };
  statement: string;
}

const avgLevel = (xs: Observation[]) =>
  xs.length ? Math.round((xs.reduce((s, o) => s + (o.level as number), 0) / xs.length) * 10) / 10 : null;

/**
 * Compares rated observations in the window before an adjustment started with those after.
 * Language is deliberately associative, never causal.
 */
export function compareBeforeAfter(
  adj: IcpAdjustment, obs: Observation[], categories: Category[], today: string, windowDays = 42
): BeforeAfterRow[] {
  const end = adj.endDate && adj.endDate < today ? adj.endDate : today;
  const from = addDays(adj.startDate, -windowDays);
  return categories.map((cat) => {
    const rated = obs.filter((o) => o.categoryId === cat.id && o.level !== null);
    const before = rated.filter((o) => o.date >= from && o.date < adj.startDate);
    const after = rated.filter((o) => o.date >= adj.startDate && o.date <= end);
    const b = avgLevel(before);
    const a = avgLevel(after);
    let statement: string;
    if (before.length < 2 || after.length < 2) {
      statement = `Not enough ${cat.name} observations before (${before.length}) and after (${after.length}) the adjustment to compare.`;
    } else if (b! - a! >= 0.3) {
      statement = `Improvement observed after the adjustment began (average difficulty ${b} → ${a}). This shows an association only; other factors may have contributed.`;
    } else if (a! - b! >= 0.3) {
      statement = `More difficulty observed after the adjustment began (average difficulty ${b} → ${a}). This shows an association only.`;
    } else {
      statement = `Observations were similar before and after the adjustment began (average difficulty ${b} → ${a}).`;
    }
    return {
      categoryId: cat.id, categoryName: cat.name,
      before: { n: before.length, avg: b }, after: { n: after.length, avg: a }, statement
    };
  });
}
