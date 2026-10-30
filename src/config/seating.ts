// Seating plan assistant: everything you might want to change lives here: the seating needs,
// which ICP adjustments suggest a seat, support levels, the planner's weights and the
// signal and review rules. Edit the lists; the app picks the changes up everywhere.

export interface SeatingNeed { id: string; label: string; /** Short reason shown to the teacher, e.g. "Front". */ short: string }

/** Seating needs a teacher can set on a student. "custom" is a free-text need with no seat rule. */
export const SEATING_NEEDS: SeatingNeed[] = [
  { id: 'front', label: 'Front', short: 'Front' },
  { id: 'near_board', label: 'Near the board (vision)', short: 'Near the board' },
  { id: 'near_teacher', label: 'Near the teacher', short: 'Near teacher' },
  { id: 'near_door', label: 'Near the door / easy exit', short: 'Near the door' },
  { id: 'aisle', label: 'Aisle or end seat', short: 'Aisle seat' },
  { id: 'away_windows', label: 'Away from windows / distractions', short: 'Away from windows' },
  { id: 'quiet', label: 'Quiet area', short: 'Quiet area' },
  { id: 'left_handed', label: 'Left-handed (left end of a pair)', short: 'Left end' }
];
export const needLabel = (id: string) => SEATING_NEEDS.find((n) => n.id === id)?.label ?? id;
export const needShort = (id: string) => SEATING_NEEDS.find((n) => n.id === id)?.short ?? id;

/**
 * ICP adjustments that suggest a seating need ("This ICP suggests: front. Add?").
 * Matched against the adjustment title, ignoring case. Add more pairs here.
 */
export const ICP_SEATING: { match: RegExp; need: string }[] = [
  { match: /front|preferential seating/i, need: 'front' },
  { match: /near (the )?teacher|individual teacher time/i, need: 'near_teacher' },
  { match: /movement break|exit|door/i, need: 'near_door' },
  { match: /reduced distraction|away from (the )?window|distraction/i, need: 'away_windows' },
  { match: /vision|near (the )?board|visual impair/i, need: 'near_board' },
  { match: /quiet|noise|low.?stimulus/i, need: 'quiet' }
];

/** "Support right now" (never called ability in the app). Off by default (Settings → Seating). */
export const SUPPORT_LEVELS = [
  { id: 'more', label: 'Needs more support' },
  { id: 'on_track', label: 'On track' },
  { id: 'extension', label: 'Ready for extension' }
] as const;
export type SupportLevelId = (typeof SUPPORT_LEVELS)[number]['id'];
export const supportLabel = (id: string) => SUPPORT_LEVELS.find((l) => l.id === id)?.label ?? id;
/** A support level counts until this many weeks after it was set (we don't store term dates yet). */
export const SUPPORT_REVIEW_WEEKS = 10;

/** "Needs more support" is suggested when, in the last 4 weeks, either of these is true. */
export const SUPPORT_SUGGEST = { days: 28, contentConcerns: 3, coldCallWellBelow: 0.4, minColdCalls: 3 };

/** Keep-apart / works-well suggestions: this many unconfirmed signals for a pair in this many days. */
export const SIGNALS = { needed: 2, days: 42, notNowDays: 14 };
/** Wellbeing → friendship issues in this many days suggests seating them with someone they work well with. */
export const LEFT_OUT_DAYS = 42;

/** Seat watch after a new plan: ranking boost for this many lessons; ends after two "Settled" in a row. */
export const SEAT_WATCH = { lessons: 3, boost: 2, settledToEnd: 2, notSettledToRaise: 2 };

/** Planner weights (soft goals). Hard rules (seating needs, keep apart strength 2, locked seats) are never broken. */
export const PLANNER = {
  hard: 1000,
  keepApart: 12,
  worksWell: 5,
  /** Per recent Attention concern, per cell further from the teacher (or the front). */
  attention: 0.6,
  /** Spreading the highest-need students: per unit of squared concern above the average at a table. */
  spread: 1.5,
  /** A table with no "on track" or "extension" student (Mixed tables), or a support student away from the support table. */
  mixed: 6,
  supportTable: 6,
  /** Nobody sits alone (strong preference). */
  alone: 30,
  /** Each student moved from their seat in the current plan (Minimise changes). */
  move: 2,
  /** Improvement swaps per search, independent searches (the best wins), and how freely early swaps may make things worse. */
  iterations: 5000,
  restarts: 6,
  startTemp: 30
};

/** Room templates offered in Step 1. */
export const ROOM_TEMPLATES = [
  { id: 'pairs', label: 'Rows of pairs' },
  { id: 'fours', label: 'Groups of 4' },
  { id: 'sixes', label: 'Groups of 6' },
  { id: 'ushape', label: 'U-shape' },
  { id: 'singles', label: 'Rows of singles' }
] as const;
export type RoomTemplateId = (typeof ROOM_TEMPLATES)[number]['id'];

/** One line shown in Settings → Seating and in docs/PRODUCT_SPEC.md. */
export const SEATING_PURPOSE = 'Seating data is used only to balance tables and meet seating needs. It is teacher-only, reviewed each term, and never shared with students.';
