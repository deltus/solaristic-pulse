import type { Category, FollowUpOutcome, Level, Observation, Question } from '../types';
import { relativeDay, today as todayISO } from '../lib/dates';

export const FOLLOW_UP_OPTIONS: { outcome: FollowUpOutcome; label: string }[] = [
  { outcome: 'improved', label: 'No, all good' },
  { outcome: 'same', label: 'Yes, about the same' },
  { outcome: 'worsened', label: 'Yes, and worse' },
  { outcome: 'unknown', label: 'Not sure' }
];

export function byNewest(a: Observation, b: Observation): number {
  return b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
}

/** Latest observation for a question that carries a rating (ignores unsure / not enough info). */
export function latestRated(obs: Observation[], questionId: string, beforeCheckinId?: string): Observation | undefined {
  return obs
    .filter((o) => o.questionId === questionId && o.level !== null && o.checkinId !== beforeCheckinId)
    .sort(byNewest)[0];
}

export interface OpenFollowUp {
  questionId: string;
  categoryId: string;
  previous: Observation;
  /** First difficulty in this chain of follow-ups (for context). */
  origin: Observation;
  level: 1 | 2;
}

/**
 * A follow-up is open when the most recent rated observation for a question showed difficulty.
 * Absent, skipped and "unsure" responses never open or close a follow-up.
 * `excludeCheckinId` lets the current check-in look at history before itself.
 */
export function openFollowUp(obs: Observation[], questionId: string, excludeCheckinId?: string): OpenFollowUp | null {
  const previous = latestRated(obs, questionId, excludeCheckinId);
  if (!previous || !previous.level) return null;
  const byId = new Map(obs.map((o) => [o.id, o]));
  let origin = previous;
  const seen = new Set<string>();
  while (origin.followUp && byId.has(origin.followUp.previousId) && !seen.has(origin.id)) {
    seen.add(origin.id);
    origin = byId.get(origin.followUp.previousId)!;
  }
  return { questionId, categoryId: previous.categoryId, previous, origin, level: previous.level };
}

export function allOpenFollowUps(obs: Observation[], questions: Question[]): OpenFollowUp[] {
  return questions
    .map((q) => openFollowUp(obs, q.id))
    .filter((f): f is OpenFollowUp => f !== null);
}

/**
 * Effective difficulty level recorded by a follow-up answer to "Did this happen again?".
 * "No, all good" closes the follow-up; history and the gradual draw-weight easing are unaffected.
 */
export function followUpLevel(prev: 1 | 2, outcome: FollowUpOutcome): Level {
  switch (outcome) {
    case 'improved': return 0;
    case 'same': return prev;
    case 'worsened': return 2;
    default: return null;
  }
}

export function followUpPrompt(
  name: string, category: Category, f: OpenFollowUp, ref: string = todayISO()
): string {
  const p = f.previous;
  const when = relativeDay(p.date, ref);
  const context = p.context ? ` during ${p.context.toLowerCase()}` : '';
  let lead: string;
  if (p.followUp) {
    const state = p.followUp.outcome === 'worsened' ? 'had worsened' : 'was about the same';
    lead = `At the last follow-up (${when}), ${name}'s difficulty with ${category.phrase} ${state}${context}.`;
  } else {
    lead = `Last time (${when}), ${name} had ${f.level === 2 ? 'significant' : 'some'} difficulty with ${category.phrase}${context}.`;
  }
  return `${lead}${p.note ? ` Note: "${p.note}"` : ''} Did this happen again?`;
}
