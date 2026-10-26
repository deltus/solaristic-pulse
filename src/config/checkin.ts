// Everything about the daily check-in that you might want to change lives here:
// the areas and their sub-options, the swipe direction, homework reasons, streaks and
// the ranking weights. Edit the lists; the app picks the changes up everywhere.

/** Which way is "All good". The other side is "Issue"; swipe up is always Skip. */
export const SWIPE: { goodDirection: 'right' | 'left' } = { goodDirection: 'right' };

export interface SubOption { id: string; label: string }
export interface CheckinArea {
  /** Category id the area saves under (kept from the old questions so history lines up). */
  id: string;
  /** Question id its saved answers use. */
  questionId: string;
  name: string;
  subs: SubOption[];
  /** Ask for a short note on the details screen when this area is tapped. */
  asksNote?: boolean;
  /** Small line shown when this area is tapped. */
  safetyLine?: string;
}

/** The three areas in the daily check-in. Homework and preparedness come from Homework check and Blitz. */
export const CHECKIN_AREAS: CheckinArea[] = [
  {
    id: 'behaviour', questionId: 'q-behaviour', name: 'Behaviour',
    subs: [
      { id: 'disruptive', label: 'Disruptive' },
      { id: 'disrespectful', label: 'Disrespectful' },
      { id: 'tech_misuse', label: 'Technology misuse' },
      { id: 'not_following', label: 'Not following instructions' },
      { id: 'peer_interactions', label: 'Peer interactions' }
    ]
  },
  {
    // Was "Effort"; the id stays 'focus' so older records join up.
    id: 'focus', questionId: 'q-focus', name: 'Attention',
    subs: [
      { id: 'off_task', label: 'Off task' },
      { id: 'distracted', label: 'Distracted' },
      { id: 'low_effort', label: 'Low effort' },
      { id: 'not_listening', label: 'Not listening' },
      { id: 'low_productivity', label: 'Low productivity' }
    ]
  },
  {
    id: 'coping', questionId: 'q-coping', name: 'Coping with work', asksNote: true,
    safetyLine: "If you're worried about this student's safety or wellbeing, follow your school's wellbeing process.",
    subs: [
      { id: 'workload', label: 'Workload' },
      { id: 'pace', label: 'Pace' },
      { id: 'content', label: 'Content' },
      { id: 'dysregulated', label: 'Dysregulated' },
      { id: 'withdrawn', label: 'Withdrawn' }
    ]
  }
];

export const areaById = (id: string) => CHECKIN_AREAS.find((a) => a.id === id);

/** Sub-options no longer offered, kept so older records still read correctly in history and reports. */
export const LEGACY_SUBS: Record<string, SubOption[]> = {
  coping: [
    { id: 'upset', label: 'Upset or distressed' },
    { id: 'overwhelmed', label: 'Overwhelmed by the work' },
    { id: 'tired', label: 'Tired or low energy' },
    { id: 'peers', label: 'Peer or friendship issues' },
    { id: 'unwell', label: 'Seemed unwell' },
    { id: 'outside', label: 'Mentioned something outside school' }
  ]
};

export const subLabel = (areaId: string, subId: string) =>
  [...(areaById(areaId)?.subs ?? []), ...(LEGACY_SUBS[areaId] ?? [])].find((s) => s.id === subId)?.label ?? subId.replace(/_/g, ' ');

export const HOMEWORK_REASONS: SubOption[] = [
  { id: 'forgot', label: 'Forgot' },
  { id: 'didnt_understand', label: "Didn't understand" },
  { id: 'absent_last', label: 'Absent last lesson' },
  { id: 'other', label: 'Other' }
];

/** "Consistently good lately": asked after this many All good check-ins in a row, then not again for quietDays. */
export const STREAK = { length: 3, quietDays: 14 };

/** Seconds the Undo bar stays up after a save. */
export const UNDO_SECONDS = 5;

/**
 * Ranking: need = concernWeight × recentConcern + seenWeight × lessonsSinceSeen.
 * Each concern halves in value every halfLifeDays. Concern is capped so one student can't
 * take every turn. Never-seen students score neverSeenLessons, so a new class cycles through everyone.
 */
export const RANKING = {
  concernWeight: 0.65,
  seenWeight: 1,
  halfLifeDays: 14,
  /** Concerns older than this are ignored entirely. */
  lookbackDays: 56,
  concernCap: 3,
  /** Values for each kind of concern before ageing. */
  issue: 1,
  blitzNo: 0.5,
  homeworkNotDone: 0.5,
  openFollowUp: 1,
  flag: 1,
  neverSeenLessons: 1000
};
