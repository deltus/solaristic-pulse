// Swipe decisions, kept apart from the screen so they can be tested.

import { CHECKIN_AREAS } from '../config/checkin';

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

export type IssueOutcome = 'save' | 'details' | 'back' | 'cancel' | 'none';

/**
 * Issue screen. Towards "good" (right) = done: nothing ticked goes back to the card; Coping or
 * "Add note / evidence" goes to "Anything else?"; otherwise save straight away. Towards "issue"
 * (left) = cancel, nothing saved.
 */
export function issueSwipe(action: 'good' | 'issue' | 'up', picked: Record<string, string[]>, wantsDetails: boolean): IssueOutcome {
  if (action === 'issue') return 'cancel';
  if (action === 'up') return 'none';
  if (!Object.keys(picked).length) return 'back';
  const asks = CHECKIN_AREAS.some((a) => a.asksNote && picked[a.id] !== undefined);
  return asks || wantsDetails ? 'details' : 'save';
}
