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
  /** Teacher-made balance tags for seating (e.g. "Group A", "EAL"). Sensitive: encrypted when synced, never exported or shown to relief teachers. */
  balanceTags?: BalanceTag[];
}

export interface BalanceTag {
  id: string;
  name: string;
  /** "Don't leave anyone alone from this tag" at a table. */
  noAlone: boolean;
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
  /** Last date the "Consistently good lately" question was asked or dismissed. */
  streakAskedAt?: string;
  /** Seating needs (ids from src/config/seating.ts) and an optional custom one. Sensitive. */
  seatingNeeds?: string[];
  seatingNeedNote?: string;
  /** ICP seating suggestions the teacher dismissed (need ids). */
  seatingIcpDismissed?: string[];
  /** "Support right now" for seating (students belong to one class). Sensitive; cleared when archived. */
  support?: SupportLevel;
  /** Balance tag ids from the class. Sensitive. */
  balanceTags?: string[];
  /** Watch after a new seat ("How are they going at Table 3?"). */
  seatWatch?: SeatWatch;
}

export interface SupportLevel {
  level: 'more' | 'on_track' | 'extension';
  setAt: string;
  /** After this date the level counts as unset until reviewed. */
  reviewBy: string;
}

export interface SeatWatch {
  planId: string;
  table: string;
  since: string;
  reason: 'alone' | 'left_out';
  /** Answers to "How are they going there?", oldest first. */
  answers: { date: string; lessonId: string; settled: boolean }[];
  /** Two "Not settled" in a row (or one, then reviewed): "Review seat". */
  review?: boolean;
  ended?: boolean;
}

export type RelationshipType = 'keepApart' | 'worksWell';
/** Two students who work well together or should be kept apart. A pair's id order doesn't matter. */
export interface Relationship {
  id: string;
  classId: string;
  studentA: string;
  studentB: string;
  type: RelationshipType;
  /** 1 = not at the same table; 2 = never together (not at the same table or next to each other). Keep apart only. */
  strength: 1 | 2;
  source: 'manual' | 'checkin' | 'suggested';
  confirmed: boolean;
  /** Unconfirmed, but the teacher ticked "use anyway". */
  useAnyway?: boolean;
  /** A "Not now" (until a date) or "Never suggest" decision about suggesting this pair. */
  muted?: 'never' | string;
  /** The check-in that recorded this signal (undo removes it). */
  checkinId?: string;
  date: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export type RoomCellKind = 'desk' | 'empty' | 'teacher' | 'door' | 'window' | 'board';
export interface RoomCell { k: RoomCellKind; /** Table number for desks (desks with the same number are one table). */ t?: number }
/** A classroom as a grid. The front of the room is wherever the board is. */
export interface RoomLayout {
  rows: number;
  cols: number;
  /** rows × cols, row by row. A seat id is the cell's index. */
  cells: RoomCell[];
}
export interface Room extends RoomLayout {
  id: string;
  name: string;
  createdAt: number;
}

export interface SeatingPlan {
  id: string;
  classId: string;
  roomId?: string;
  name: string;
  /** A copy of the room, so later room edits don't break the plan. */
  room: RoomLayout;
  /** Seat id (cell index) → student, and whether the teacher locked it. */
  seats: Record<string, { studentId: string; locked?: boolean }>;
  active: boolean;
  activeFrom?: string;
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
  /** Entered by a relief teacher (see ReliefPass). */
  relief?: ReliefTag;
  id: string;
  studentId: string;
  classId: string;
  date: string;
  createdAt: number;
  status: CheckinStatus;
  source: CheckinSource;
  /** Priority (draw) weight at the time of the check-in (older check-ins only). */
  weight?: number;
  /** Lesson this check-in belongs to. Until lessons are records, `${date}|${classId}`. */
  lessonId?: string;
  /** Swipe check-ins: All good or Issue. Older check-ins have no result (see their observations). */
  result?: 'good' | 'issue';
  /** Optional note from the Issue details screen. */
  note?: string;
  /** "Follow up next time" (Issue only; default on). */
  followUp?: boolean;
}

/** observed = the teacher tapped it; implied = from All good or an untapped area; migrated = converted from older data. */
export type RecordedAs = 'observed' | 'implied' | 'migrated';

/** One ticked sub-option on an Issue, e.g. Behaviour → disruptive. Unticked ones are never saved. */
export interface IssueTag {
  id: string; // `${checkinId}|${areaId}|${tagId}`
  checkinId: string;
  studentId: string;
  classId: string;
  date: string;
  areaId: string;
  tagId: string;
  source: RecordedAs;
  createdAt: number;
  /** A minor item (e.g. gum): saved, but not an issue. */
  minor?: boolean;
  /** Note held onto this one sub-option (encrypted when synced). */
  note?: string;
}

export type LessonStatus = 'open' | 'finishing' | 'closed';
export type Happy = 'yes' | 'mostly' | 'no';
export type PlanDone = 'yes' | 'partly' | 'no';

/** One lesson of one class, from Open lesson to Close lesson. */
export interface Lesson {
  /** Opened by a relief teacher (see ReliefPass). */
  relief?: ReliefTag;
  id: string;
  classId: string;
  /** Date the lesson was opened (YYYY-MM-DD). */
  date: string;
  /** Opened at (ms, includes the "+1 day" test offset). */
  openedAt: number;
  closedAt?: number;
  status: LessonStatus;
  /** Learning intention, e.g. "Explain how rivers form meanders". */
  intention?: string;
  /** Close screen: share of the lesson the class was on task, 0–100. */
  attentionPct?: number;
  homeworkSet?: boolean;
  homeworkText?: string;
  happy?: Happy;
  planDone?: PlanDone;
  note?: string;
  /** "Remind me in 30 minutes": when to ask again. */
  remindAt?: number;
  /** Made from older check-ins when lessons became records (no close answers). */
  historical?: boolean;
  createdAt: number;
}

export type ColdCallResult = 'good' | 'struggled';
export interface ColdCall {
  /** Entered by a relief teacher (see ReliefPass). */
  relief?: ReliefTag;
  id: string;
  lessonId: string;
  classId: string;
  studentId: string;
  date: string;
  result: ColdCallResult;
  tags?: string[];
  createdAt: number;
}

/** Homework check: Done / Not done for one student in one lesson. Not a daily check-in. */
export interface HomeworkCheck {
  /** Entered by a relief teacher (see ReliefPass). */
  relief?: ReliefTag;
  id: string; // `${lessonId}|${studentId}`
  lessonId: string;
  /** The lesson the homework was set in (the previous lesson of this class). */
  forLessonId?: string;
  classId: string;
  studentId: string;
  date: string;
  done: boolean;
  reason?: string;
  createdAt: number;
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
  /** How the value was recorded (missing on older records = observed). */
  source?: RecordedAs;
  /** "Exceeding" recorded from a positive streak. */
  exceeding?: boolean;
  /** Lesson it was recorded in (Blitz, cold call). Check-in rows use their check-in's lesson. */
  lessonId?: string;
  /** Recorded from a cold call ("wasn't listening" counts toward Attention). */
  coldCallId?: string;
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
  /** e.g. ['positive'] (from Brain dump). */
  tags?: string[];
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
  /** Evidence prompts for this adjustment (on by default). */
  evidence?: EvidencePlan;
}

export type EvidenceKind = 'photo' | 'file' | 'note' | 'voice';

/** Asked the first time the adjustment is recorded, then monthly. */
export interface EvidencePlan {
  /** false = don't ask for this adjustment. */
  enabled?: boolean;
  /** What to collect, e.g. "Photo of the scaffolded worksheet". */
  prompt?: string;
  /** "Not today": no prompt until this date. */
  snoozedUntil?: string;
}

/** A piece of evidence. Stays on this device (not synced, not in JSON backups). */
export interface EvidenceItem {
  id: string;
  studentId: string;
  /** ICP adjustment it is evidence for (ICP evidence). */
  adjustmentId?: string;
  /** Daily check-in it was added to ("Include evidence?" on an Issue). */
  checkinId?: string;
  date: string;
  kind: EvidenceKind;
  blob?: Blob;
  name?: string;
  mime?: string;
  size?: number;
  text?: string;
  createdAt: number;
}

/** Class focus check-out at the end of a lesson. */
export interface Checkout {
  id: string; // `${date}|${classId}|${timetableId or 'manual'}`
  classId: string;
  date: string;
  timetableId?: string;
  start?: string;
  lessonMin: number;
  /** Share of the lesson the class was working, 0–100. */
  pctWorking: number;
  note?: string;
  createdAt: number;
  updatedAt?: number;
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
  /** Check-out prompts dismissed on Your classes ("Not now"), for one day. */
  checkoutSkipped?: { date: string; ids: string[] };
  /** Cold call name shuffle before showing the student. Default on. */
  coldCallAnimation?: boolean;
  /** Card fly-off and colour flash after a swipe. Default on; off (or reduced motion) = a quick cross-fade. */
  swipeAnimations?: boolean;
  /** Small messages every few students past the daily check-in target. Default on. */
  extraEncouragement?: boolean;
  /** One-time tips already shown (e.g. 'hold-note'), and how many issue screens have shown sub-option hints. */
  tipsSeen?: string[];
  subHintsShown?: number;
  /** Brain breaks hidden from the roll (Settings → Brain breaks). */
  hiddenBreaks?: string[];
  /** Show the "+1 day" test-clock button (developer tool). Default on during testing. */
  devTools?: boolean;
  /** Seating: "Use support levels in seating plans" (off by default). */
  seatingSupport?: boolean;
  /** Check for understanding: the mode used last (listed first in the menu). */
  lastCfuMode?: 'coldcall' | 'thumbs' | 'yesno' | 'ticket';
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

/** Teacher journal entry for one class. Private: never in reports, de-identified exports or sharing. */
export interface JournalEntry {
  id: string;
  classId: string;
  date: string;
  /** The lesson it reflects on (defaults to the current or most recent lesson). */
  lessonId?: string;
  text: string;
  tags: string[];
  /** AITSL Australian Professional Standard for Teachers (1–7). */
  aitsl?: number;
  createdAt: number;
  updatedAt?: number;
}

/** A long task (research assignment, fieldwork report) checked with Assessment check. */
export interface Assessment {
  id: string;
  classId: string;
  name: string;
  dueDate?: string;
  /** e.g. "Research done", "Draft", "Final". */
  checkpoints: string[];
  /** Ended early by the teacher (otherwise it ends after the due date). */
  closed?: boolean;
  createdAt: number;
}

export type AssessmentResult = 'on_track' | 'behind';

/** One student's result in one Assessment check (one per lesson per task). */
export interface AssessmentCheck {
  /** Entered by a relief teacher (see ReliefPass). */
  relief?: ReliefTag;
  id: string; // `${assessmentId}|${lessonId}|${studentId}`
  assessmentId: string;
  classId: string;
  studentId: string;
  lessonId: string;
  date: string;
  result: AssessmentResult;
  reasons?: string[];
  checkpoint?: string;
  createdAt: number;
}

/** One brain break used in a lesson. No student data. */
export interface BrainBreakLog {
  /** Entered by a relief teacher (see ReliefPass). */
  relief?: ReliefTag;
  id: string;
  classId: string;
  lessonId: string;
  date: string;
  breakId: string;
  /** Kept so history still reads if the break is later hidden or deleted. */
  name: string;
  type: 'calm' | 'perk';
  group: string;
  at: number;
  /** "Did it help?" (optional). */
  helped?: 'yes' | 'no';
}

/** A relief (CRT) teacher's access to one class for up to 5 school days. */
export interface ReliefPass {
  id: string;
  classId: string;
  /** First and last day (local dates). It stops working at the end of `to`. */
  from: string;
  to: string;
  reliefName?: string;
  /** If set, only this email can use the pass. */
  reliefEmail?: string;
  /** Off by default: the relief teacher only sees an ICP marker. */
  shareIcp: boolean;
  plan?: string;
  createdAt: number;
  createdBy?: string;
  cancelledAt?: number;
  /** The one device the pass is locked to once it's opened (set by the server). */
  claimedDevice?: string;
  /** The pass key (only in the pass link and in the class teacher's own encrypted sync). */
  key?: string;
  /** When the sealed class data was last sent to the server. */
  sentAt?: number;
  /** Every time the pass was used (set by the server). */
  uses?: { at: number; device: string; email?: string }[];
}

/** Marks a record entered by a relief teacher, for the class teacher to review. */
export interface ReliefTag {
  passId: string;
  name: string;
  /** Set when the class teacher accepts it (otherwise accepted automatically after 7 days). */
  reviewed?: boolean;
}

/* ---------- Round 8: serious incidents, follow-up tasks, Close day, Brain dump ---------- */

/** One line of context compiled for an incident report; the teacher ticks which go in. */
export interface IncidentContextItem {
  id: string;
  kind: 'issue' | 'wellbeing' | 'note' | 'followup' | 'icp' | 'icpTitles' | 'homework' | 'assessment' | 'seat';
  date?: string;
  text: string;
  include: boolean;
}

/** A serious incident: the teacher's working copy (the school's own system is the official record). */
export interface Incident {
  /** Lodged by a relief teacher (see ReliefPass). */
  relief?: ReliefTag;
  id: string;
  studentId: string;
  classId: string;
  lessonId?: string;
  /** The lesson's learning intention at the time. */
  intention?: string;
  date: string;
  /** "HH:MM", local time. */
  time: string;
  /** Issue areas → ticked sub-options, as on the issue screen. */
  areas: Record<string, string[]>;
  what: string;
  where: string;
  /** Other students involved (ids). */
  others: string[];
  witnesses?: string;
  /** Action chip ids (see src/config/incidents.ts). */
  actions: string[];
  actionNote?: string;
  /** Snapshot of the context at the time, with the teacher's ticks. */
  context: IncidentContextItem[];
  /** Marked "lodged" in the school's own system. */
  lodgedAt?: number;
  createdAt: number;
  updatedAt?: number;
}

export type FollowUpKind = 'urgent' | 'lodge' | 'home' | 'staff' | 'custom';
export type FollowUpStatus = 'todo' | 'done' | 'notNeeded';

/** A follow-up task with a due time and a reminder. */
export interface FollowUp {
  id: string;
  kind: FollowUpKind;
  title: string;
  studentId?: string;
  classId?: string;
  incidentId?: string;
  /** What it's about (Brain dump text, for drafts without an incident). */
  about?: string;
  /** "Inform school staff": which role. */
  role?: string;
  /** Has an email draft (home or staff). */
  draft?: 'home' | 'staff';
  dueAt: number;
  status: FollowUpStatus;
  doneAt?: number;
  note?: string;
  createdAt: number;
}

/** "Close day": one per date. */
export interface DayClose {
  id: string; // the date
  date: string;
  reflection?: 'good' | 'ok' | 'tough';
  note?: string;
  counts: Record<string, number>;
  closedAt: number;
}

/** A Brain dump's original text, kept for a while then deleted (BRAIN_DUMP_KEEP_DAYS). */
export interface BrainDump {
  id: string;
  date: string;
  classId?: string;
  text: string;
  createdAt: number;
  sortedAt?: number;
  deleteAfter: number;
}

/* ---------------- Check for understanding (round 9) ---------------- */

export type CfuKind = 'thumbs' | 'yesno' | 'exit' | 'entry';

/** One check for understanding run in a lesson. Thumbs checks hold counts only (no student records). */
export interface CfuCheck {
  id: string;
  lessonId: string;
  classId: string;
  date: string;
  kind: CfuKind;
  /** Exit or entry ticket question. */
  question?: string;
  /** Entry tickets: the previous lesson the question is about. */
  aboutLessonId?: string;
  /** Thumbs check: 👍 got it, 👊 sort of, 👎 not yet. */
  counts?: { up: number; mid: number; down: number };
  createdAt: number;
}

/** got = Yes / Got it; notyet = Not yet; partly = Partly (tickets only); absent = not in class. */
export type CfuResultValue = 'got' | 'partly' | 'notyet' | 'absent';

/** One student's answer in a yes/no grid or an exit/entry ticket. */
export interface CfuResult {
  id: string; // `${checkId}|${studentId}`
  checkId: string;
  lessonId: string;
  classId: string;
  studentId: string;
  date: string;
  kind: Exclude<CfuKind, 'thumbs'>;
  result: CfuResultValue;
  /** Ticket "Not yet" chips: misconception, incomplete. */
  tags?: string[];
  createdAt: number;
}

/** "Absent for the rest of the day": a daily attendance note for one class (not a rating). */
export type AbsentSource = 'blitz' | 'cfu' | 'coldcall' | 'checkin' | 'homework';
export interface AbsentToday {
  id: string; // `${date}|${classId}|${studentId}`
  classId: string;
  studentId: string;
  date: string;
  source: AbsentSource;
  createdAt: number;
}
