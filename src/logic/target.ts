// Daily check-in target: "3 of 5 today", a full card at the target, and smaller encouragement
// every few students after it. Messages only appear between cards, never mid-swipe.

import { ENCOURAGE_EVERY } from '../config/checkin';

export type Milestone = { kind: 'target' } | { kind: 'extra'; count: number };

/**
 * What to show after a save brings this lesson's count to `count`: the target card exactly at the
 * target, then (if extra encouragement is on) a smaller message every ENCOURAGE_EVERY more.
 * Nothing when everyone present has been seen: "That's the whole class" takes over.
 */
export function milestoneAfter(count: number, target: number, opts: { extra: boolean; everyoneSeen: boolean; every?: number }): Milestone | null {
  if (opts.everyoneSeen || target < 1) return null;
  if (count === target) return { kind: 'target' };
  const every = opts.every ?? ENCOURAGE_EVERY;
  if (opts.extra && count > target && (count - target) % every === 0) return { kind: 'extra', count };
  return null;
}

/** Positive wording only. */
export function extraMessage(count: number): string {
  return `${count} check-ins this lesson. Great momentum!`;
}
