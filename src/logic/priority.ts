// Transparent, bounded, deterministic student selection.
//
// weight  = clamp(1.0 + adjustments, 0.5, 3.0)
// score   = weight × (days since last check-in + 1)
// overdue = days since last check-in ≥ maxGapDays → always selected first
//
// Because checking a student resets their "days since" to 0, everyone rotates.
// In steady state a student with weight 2 is checked about twice as often as one
// with weight 1, and nobody can wait longer than maxGapDays (while capacity allows).

import type { Category, Checkin, Observation, Question, Student } from '../types';
import { daysBetween } from '../lib/dates';
import { openFollowUp } from './followups';

export const BASE_WEIGHT = 1;
export const WEIGHT_MIN = 0.5;
export const WEIGHT_MAX = 3;
export const ADJUST_MIN = -0.5;
export const ADJUST_MAX = 1;
export const FLAG_BOOST = 0.75;
export const FOLLOW_UP_BOOST = 0.25;
export const RECURRING_STEP = 0.2;
export const RECURRING_CAP = 0.6;
export const IMPROVEMENT_STEP = 0.15;
export const IMPROVEMENT_CAP = 0.3;
export const ATTENTION_STEP = 0.2;
export const ATTENTION_CAP = 0.6;
export const LOOKBACK_DAYS = 28;

export interface PriorityPart {
  label: string;
  delta: number;
}

export interface Priority {
  weight: number;
  raw: number;
  parts: PriorityPart[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computePriority(
  student: Student,
  obs: Observation[],
  checkins: Checkin[],
  questions: Question[],
  categories: Category[],
  today: string
): Priority {
  const parts: PriorityPart[] = [];
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;
  const recent = (date: string) => {
    const d = daysBetween(date, today);
    return d >= 0 && d <= LOOKBACK_DAYS;
  };

  if (student.flag) parts.push({ label: `Flagged by teacher${student.flag.reason ? `: ${student.flag.reason}` : ''}`, delta: FLAG_BOOST });
  if (student.priorityAdjust) {
    const a = Math.max(ADJUST_MIN, Math.min(ADJUST_MAX, student.priorityAdjust));
    parts.push({ label: 'Teacher priority adjustment', delta: a });
  }

  // Open follow-ups (difficulty last time it was rated).
  const open = questions.map((q) => openFollowUp(obs, q.id)).filter(Boolean);
  if (open.length) {
    const names = [...new Set(open.map((f) => catName(f!.categoryId)))].join(', ');
    parts.push({ label: `Follow-up due: ${names}`, delta: Math.min(2, open.length) * FOLLOW_UP_BOOST });
  }

  // Recurring difficulty: 2+ difficulties in the same category within the lookback window.
  // A single difficulty never counts as a pattern. Significant difficulty counts double.
  const byCat = new Map<string, { n: number; points: number }>();
  for (const o of obs) {
    if (o.level && o.level >= 1 && recent(o.date)) {
      const c = byCat.get(o.categoryId) ?? { n: 0, points: 0 };
      byCat.set(o.categoryId, { n: c.n + 1, points: c.points + o.level });
    }
  }
  for (const [cat, { n, points }] of byCat) {
    if (n >= 2) {
      parts.push({
        label: `Recurring difficulty: ${catName(cat)} (${n} in ${LOOKBACK_DAYS / 7} weeks)`,
        delta: Math.min(RECURRING_CAP, RECURRING_STEP * (points - 1))
      });
    }
  }

  // Recent improvement reported in follow-ups lowers priority gradually.
  const improvedCats = obs.filter((o) => o.followUp?.outcome === 'improved' && recent(o.date));
  if (improvedCats.length) {
    const names = [...new Set(improvedCats.map((o) => catName(o.categoryId)))].join(', ');
    parts.push({ label: `Recent improvement: ${names}`, delta: -Math.min(IMPROVEMENT_CAP, IMPROVEMENT_STEP * improvedCats.length) });
  }

  // Attention already received this week (prevents a small group monopolising check-ins).
  const lastWeek = checkins.filter((c) => (c.status === 'complete' || c.status === 'partial') && daysBetween(c.date, today) >= 0 && daysBetween(c.date, today) < 7);
  if (lastWeek.length > 1) {
    parts.push({ label: `Checked ${lastWeek.length} times in the last 7 days`, delta: -Math.min(ATTENTION_CAP, ATTENTION_STEP * (lastWeek.length - 1)) });
  }

  const raw = BASE_WEIGHT + parts.reduce((s, p) => s + p.delta, 0);
  return { weight: round2(Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, raw))), raw: round2(raw), parts };
}

export interface Candidate {
  studentId: string;
  weight: number;
  daysSince: number | null;
  effectiveDays: number;
  score: number;
  overdue: boolean;
  reasons: string[];
  priority: Priority;
}

export interface RankInput {
  students: Student[];
  observations: Observation[];
  checkins: Checkin[];
  questions: Question[];
  categories: Category[];
  today: string;
  maxGapDays: number;
  excludeIds?: Set<string>;
}

/** Stable per-day tie-breaker so equal scores don't always favour the same student. */
export function dayHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function lastCheckedDate(checkins: Checkin[]): string | undefined {
  return checkins
    .filter((c) => c.status === 'complete' || c.status === 'partial')
    .map((c) => c.date)
    .sort()
    .pop();
}

export function rankStudents(input: RankInput): Candidate[] {
  const { students, observations, checkins, questions, categories, today, maxGapDays, excludeIds } = input;
  const obsBy = groupBy(observations, (o) => o.studentId);
  const chkBy = groupBy(checkins, (c) => c.studentId);

  const list: Candidate[] = students
    .filter((s) => !s.archived && !excludeIds?.has(s.id))
    .map((s) => {
      const sObs = obsBy.get(s.id) ?? [];
      const sChk = (chkBy.get(s.id) ?? []).filter((c) => c.date <= today);
      const priority = computePriority(s, sObs, sChk, questions, categories, today);
      const last = lastCheckedDate(sChk);
      const daysSince = last ? daysBetween(last, today) : null;
      const effectiveDays = daysSince ?? maxGapDays;
      const overdue = effectiveDays >= maxGapDays;
      const reasons: string[] = [];
      if (daysSince === null) reasons.push('Not yet checked in');
      else if (overdue) reasons.push(`Overdue: ${daysSince} days since last check-in`);
      else reasons.push(`${daysSince} day${daysSince === 1 ? '' : 's'} since last check-in`);
      for (const p of priority.parts) if (p.delta > 0) reasons.push(p.label);
      return {
        studentId: s.id, weight: priority.weight, daysSince, effectiveDays,
        score: round2(priority.weight * (effectiveDays + 1)), overdue, reasons, priority
      };
    });

  return list.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.overdue && b.overdue && a.effectiveDays !== b.effectiveDays) return b.effectiveDays - a.effectiveDays;
    if (b.score !== a.score) return b.score - a.score;
    return dayHash(a.studentId + today) - dayHash(b.studentId + today);
  });
}

export function selectForDay(input: RankInput, target: number): Candidate[] {
  return rankStudents(input).slice(0, Math.max(0, target));
}

export function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}
