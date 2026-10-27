// Swipe decisions, kept apart from the screen so they can be tested.


/** A long enough drag, or a short quick flick, counts as a swipe. */
export const SWIPE_DISTANCE = 80;
export const FLICK_DISTANCE = 30;
/** px per millisecond. */
export const FLICK_SPEED = 0.45;

/** Which way a drag went, if it counts as a swipe. `ms` is how long the finger was down. */
export function decideSwipe(dx: number, dy: number, ms: number): 'left' | 'right' | 'up' | null {
  const fast = (d: number) => Math.abs(d) >= FLICK_DISTANCE && Math.abs(d) / Math.max(ms, 1) >= FLICK_SPEED;
  if (dy < 0 && -dy > Math.abs(dx) && (-dy >= SWIPE_DISTANCE || fast(dy))) return 'up';
  if (Math.abs(dx) >= Math.abs(dy) && (Math.abs(dx) >= SWIPE_DISTANCE || fast(dx))) return dx > 0 ? 'right' : 'left';
  return null;
}

export type IssueOutcome = 'save' | 'back' | 'cancel' | 'none';

/**
 * Issue screen. Towards "good" (right) = done: nothing ticked goes back to the card, otherwise it
 * saves straight away (notes, evidence and follow-up are all on the issue screen itself).
 * Towards "issue" (left) = cancel, nothing saved.
 */
export function issueSwipe(action: 'good' | 'issue' | 'up', picked: Record<string, string[]>, minor: string[] = []): IssueOutcome {
  if (action === 'issue') return 'cancel';
  if (action === 'up') return 'none';
  return Object.keys(picked).length || minor.length ? 'save' : 'back';
}

export type FlyStyle = 'fly' | 'fade';
export interface FlyPlan { style: FlyStyle; ms: number; dx: number; dy: number; rotate: number; wash: 'good' | 'issue' | 'up' }

/** Fly-off length and the quicker cross-fade used for reduced motion or "Swipe animations" off. */
export const FLY_MS = 250;
export const FADE_MS = 100;
export const ENTER_MS = 150;

/**
 * How a swiped card leaves: flies off in the swipe direction with about an 8° tilt, or (reduced
 * motion / setting off) a 100 ms cross-fade. The colour wash and icon show either way.
 */
export function flyPlan(action: 'good' | 'issue' | 'up', side: 'left' | 'right' | null, opts: { animate: boolean; reduceMotion: boolean }): FlyPlan {
  if (!opts.animate || opts.reduceMotion) return { style: 'fade', ms: FADE_MS, dx: 0, dy: 0, rotate: 0, wash: action };
  if (action === 'up') return { style: 'fly', ms: FLY_MS, dx: 0, dy: -1, rotate: 0, wash: action };
  const dir = side === 'left' ? -1 : 1;
  return { style: 'fly', ms: FLY_MS, dx: dir, dy: 0, rotate: 8 * dir, wash: action };
}
