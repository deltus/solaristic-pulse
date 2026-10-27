// Everything about the daily check-in that you might want to change lives here:
// the areas and their sub-options, the swipe direction, homework reasons, streaks and
// the ranking weights. Edit the lists; the app picks the changes up everywhere.

/** Which way is "All good". The other side is "Issue"; swipe up is always Skip. */
export const SWIPE: { goodDirection: 'right' | 'left' } = { goodDirection: 'right' };

export interface SubOption { id: string; label: string; /** One-line explanation shown under the option the first few times. */ hint?: string }
export interface CheckinArea {
  /** Category id the area saves under (kept from the old questions so history lines up). */
  id: string;
  /** Question id its saved answers use. */
  questionId: string;
  name: string;
  /** The question behind the area, shown as a one-line hint under its name on the issue screen. */
  question: string;
  subs: SubOption[];
  /** Small chips under the area that are saved as a record but don't count as an issue (e.g. gum). */
  minor?: SubOption[];
  /** Small line shown when this area is tapped. */
  safetyLine?: string;
}

/** The three areas in the daily check-in. Homework and preparedness come from Homework check and Blitz. */
export const CHECKIN_AREAS: CheckinArea[] = [
  {
    id: 'behaviour', questionId: 'q-behaviour', name: 'Behaviour', question: 'How are they acting towards others and the class?',
    subs: [
      { id: 'disruptive', label: 'Disruptive' },
      { id: 'disrespectful', label: 'Disrespectful' },
      { id: 'tech_misuse', label: 'Technology misuse' },
      { id: 'not_following', label: 'Not following instructions' },
      { id: 'peer_interactions', label: 'Peer interactions', hint: "conflict they're involved in" }
    ],
    // Minor items alone don't mark Behaviour as "needs support" or count in the ranking. Add more here.
    minor: [
      { id: 'gum', label: 'Gum' },
      { id: 'uniform', label: 'Uniform' }
    ]
  },
  {
    // Was "Effort"; the id stays 'focus' so older records join up.
    id: 'focus', questionId: 'q-focus', name: 'Attention', question: 'Are they engaged in the learning?',
    subs: [
      { id: 'off_task', label: 'Off task' },
      { id: 'not_listening', label: 'Not listening' },
      { id: 'low_effort', label: 'Low effort or output' }
    ]
  },
  {
    id: 'coping', questionId: 'q-coping', name: 'Coping with work', question: 'Can they manage the demands of the work?',
    subs: [
      { id: 'pace', label: 'Pace', hint: "can't keep up with the lesson" },
      { id: 'content', label: 'Content', hint: "doesn't understand the material" },
      { id: 'workload', label: 'Workload', hint: 'too much on overall' },
      { id: 'assessment_progress', label: 'Assessment progress', hint: 'falling behind on the current task' }
    ]
  }
];

/**
 * Wellbeing: a separate tick box under the three areas, recorded only when ticked ("All good" never
 * records it as fine). Counts as a concern in the ranking. Sensitive: its notes are encrypted when
 * synced and it is left out of de-identified exports.
 */
export const WELLBEING: CheckinArea = {
  id: 'wellbeing', questionId: 'q-wellbeing', name: 'Wellbeing', question: 'Are they OK in themselves?',
  safetyLine: "If you're worried about this student's safety or wellbeing, follow your school's wellbeing process.",
  subs: [
    { id: 'dysregulated', label: 'Dysregulated' },
    { id: 'withdrawn', label: 'Withdrawn' },
    { id: 'upset', label: 'Upset or distressed' },
    { id: 'tired', label: 'Tired or low energy' },
    { id: 'friendship', label: 'Friendship issues', hint: 'left out or struggling socially' },
    { id: 'unwell', label: 'Seemed unwell' },
    { id: 'outside', label: 'Mentioned something outside school' }
  ]
};

/** Every area an issue can be saved under: the three check-in areas plus Wellbeing. */
export const ISSUE_AREAS: CheckinArea[] = [...CHECKIN_AREAS, WELLBEING];

/** Sub-option hints show for the first few issue screens only. */
export const SUB_HINT_TIMES = 5;
/** "Wellbeing flagged 2× recently" looks back this many days. */
export const WELLBEING_RECENT_DAYS = 28;

export const areaById = (id: string) => ISSUE_AREAS.find((a) => a.id === id);
export const isMinor = (areaId: string, subId: string) => !!areaById(areaId)?.minor?.some((m) => m.id === subId);

/** Sub-options no longer offered, kept so older records still read correctly in history and reports. */
export const LEGACY_SUBS: Record<string, SubOption[]> = {
  focus: [
    { id: 'distracted', label: 'Distracted' },
    { id: 'low_productivity', label: 'Low productivity' }
  ],
  coping: [
    { id: 'dysregulated', label: 'Dysregulated' },
    { id: 'withdrawn', label: 'Withdrawn' },
    { id: 'upset', label: 'Upset or distressed' },
    { id: 'overwhelmed', label: 'Overwhelmed by the work' },
    { id: 'tired', label: 'Tired or low energy' },
    { id: 'peers', label: 'Peer or friendship issues' },
    { id: 'unwell', label: 'Seemed unwell' },
    { id: 'outside', label: 'Mentioned something outside school' }
  ]
};

/**
 * Round 3b moves older sub-options: [area, sub] → [new area, new sub]. Used by the database upgrade.
 * Coping "needs support" records with no sub-option stay as Coping.
 */
export const SUB_MOVES: Record<string, [string, string]> = {
  'focus|distracted': ['focus', 'off_task'],
  'focus|low_productivity': ['focus', 'low_effort'],
  'coping|overwhelmed': ['coping', 'workload'],
  'coping|dysregulated': ['wellbeing', 'dysregulated'],
  'coping|withdrawn': ['wellbeing', 'withdrawn'],
  'coping|upset': ['wellbeing', 'upset'],
  'coping|tired': ['wellbeing', 'tired'],
  'coping|unwell': ['wellbeing', 'unwell'],
  'coping|outside': ['wellbeing', 'outside'],
  'coping|peers': ['wellbeing', 'friendship']
};

export const subLabel = (areaId: string, subId: string) => {
  const a = areaById(areaId);
  return [...(a?.subs ?? []), ...(a?.minor ?? []), ...(LEGACY_SUBS[areaId] ?? [])].find((s) => s.id === subId)?.label ?? subId.replace(/_/g, ' ');
};

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

/** Daily check-in target: extra encouragement every this many students past the target. */
export const ENCOURAGE_EVERY = 5;
