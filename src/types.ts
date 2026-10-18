// Core data model for Solaristic Radar. All records live in IndexedDB on the device.

/** 0 = as expected, 1 = some difficulty, 2 = significant difficulty, null = no rating (unsure). */
export type Level = 0 | 1 | 2 | null;
export type FollowUpOutcome = 'improved' | 'same' | 'worsened' | 'unknown';

export interface SchoolClass {
  id: string;
  name: string;
  subject?: string;
  yearLevel?: string;
  archived: boolean;
  createdAt: number;
  /** Overrides the global daily check-in target for this class. */
  dailyTarget?: number;
}

export interface StudentFlag {
  reason: string;
  since: string; // ISO date
}

export interface Student {
  id: string;
  classId: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  /** School-issued identifier, optional. Never exported when de-identifying. */
  externalId?: string;
  archived: boolean;
  flag?: StudentFlag;
  /** Teacher's manual priority adjustment, bounded to [-0.5, +1]. */
  priorityAdjust: number;
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
  /** Short phrase used in follow-up prompts, e.g. "staying focused". */
  phrase: string;
  builtIn: boolean;
  /** Note box prompt after a hold, e.g. "What was missing?". */
  notePrompt?: string;
  /** Quick context tags offered in the note box. */
  tags?: string[];
}

export interface ResponseOption {
  label: string;
  level: Level;
  /** Open the note box automatically after this answer (e.g. Coping: No). */
  askNote?: boolean;
}

export interface Question {
  id: string;
  text: string;
  categoryId: string;
  options: ResponseOption[];
  allowDetail: boolean;
  /** Empty = all classes. */
  classIds: string[];
  /** Empty = every student in the applicable classes. */
  studentIds: string[];
  /** Minimum days between asking this question about the same student. 0 = every check-in. */
  frequencyDays: number;
  enabled: boolean;
  builtIn: boolean;
  order: number;
  /** Short prompt shown on the check-in card, e.g. "Focused today?". */
  shortText?: string;
}

export type CheckinStatus = 'complete' | 'partial' | 'absent' | 'skipped';
export type CheckinSource = 'daily' | 'extra' | 'manual';

export interface Checkin {
  id: string;
  studentId: string;
  classId: string;
  date: string;
  createdAt: number;
  status: CheckinStatus;
  source: CheckinSource;
  /** Priority (draw) weight at the time of the check-in, kept for analysis. */
  weight?: number;
}

export interface Observation {
  id: string;
  checkinId: string;
  studentId: string;
  classId: string;
  date: string;
  createdAt: number;
  updatedAt?: number;
  questionId: string;
  categoryId: string;
  /** Option label chosen (or follow-up outcome label). */
  response: string;
  level: Level;
  followUp?: { previousId: string; outcome: FollowUpOutcome };
  context?: string;
  note?: string;
  /** Set for Blitz marks (whole-class, one topic). Not part of a check-in. */
  blitz?: string;
}

export interface PlanEntry {
  studentId: string;
  source: CheckinSource;
  reasons: string[];
  /** Priority weight when the student was selected. */
  weight?: number;
}

export interface DayPlan {
  id: string; // `${date}|${classId}`
  date: string;
  classId: string;
  entries: PlanEntry[];
}

export interface StudentNote {
  id: string;
  studentId: string;
  date: string;
  text: string;
  createdAt: number;
}

export type IcpFrequency = 'lesson' | 'daily' | 'weekly' | 'fortnightly';
export type IcpOutcome = 'implemented' | 'partial' | 'not' | 'na';

export interface IcpAdjustment {
  id: string;
  studentId: string;
  title: string;
  details?: string;
  frequency: IcpFrequency;
  startDate: string;
  endDate?: string;
  active: boolean;
  createdAt: number;
}

export interface IcpCheck {
  id: string;
  adjustmentId: string;
  studentId: string;
  date: string;
  outcome: IcpOutcome;
  note?: string;
  createdAt: number;
}

export interface TimetableEntry {
  id: string;
  classId: string;
  day: number; // 1 = Monday … 7 = Sunday
  start: string; // HH:MM
  end: string;
  room?: string;
  notes?: string;
}

export interface ReminderPrefs {
  enabled: boolean;
  beforeLessonMin: number | null;
  afterLesson: boolean;
  dailyTime: string | null;
  icp: boolean;
  quietStart: string;
  quietEnd: string;
}

export interface PinConfig {
  salt: string;
  hash: string;
  iterations: number;
  /** Number of digits, so the keypad can submit automatically. */
  length?: number;
}

export interface Settings {
  profile: { name: string; email: string; school?: string };
  onboarded: boolean;
  privacyAcceptedAt?: number;
  dailyTarget: number;
  maxGapDays: number;
  autoAdvance: boolean;
  contextTags: string[];
  reminders: ReminderPrefs;
  pin?: PinConfig;
  lockAfterMin: number;
  lastBackupAt?: number;
  currentClassId?: string;
  tutorialDone?: boolean;
  reminderCardDismissed?: boolean;
  /** Show the "+1 day" test-clock button (developer tool). Default on during testing. */
  devTools?: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  profile: { name: '', email: '', school: '' },
  onboarded: false,
  dailyTarget: 5,
  maxGapDays: 14,
  autoAdvance: true,
  contextTags: ['Whole class', 'Independent work', 'Group work', 'Practical', 'Assessment'],
  reminders: {
    enabled: false,
    beforeLessonMin: 5,
    afterLesson: true,
    dailyTime: '15:30',
    icp: true,
    quietStart: '20:00',
    quietEnd: '07:00'
  },
  lockAfterMin: 5
};
