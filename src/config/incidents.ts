// Serious incidents, follow-ups, Close day and Brain dump: wording and settings a school may want
// to change. The email templates are in src/config/emails.ts.

/** Always shown at the top of the incident screen. */
export const SAFETY_BANNER =
  "If a child is at risk of harm, or has disclosed abuse, follow your school's child safety and mandatory reporting procedures now. Don't wait to finish this form.";

export const WHAT_HINT = 'Stick to what you saw and heard: who, what, when, where. Avoid opinions.';
export const WELLBEING_WARNING = "Sensitive. Only include if relevant and your school's process allows.";
export const DEFAULT_WHERE = 'Classroom';

/** `home` is how the action reads in the email to home ("At school, we …"). */
export const ACTION_CHIPS: { id: string; label: string; home: string }[] = [
  { id: 'removed', label: 'Removed from class', home: 'removed {student} from the class for a short time' },
  { id: 'coordinator', label: 'Sent to coordinator', home: 'asked the year level coordinator to help' },
  { id: 'firstAid', label: 'First aid', home: 'gave first aid' },
  { id: 'separated', label: 'Separated students', home: 'separated the students involved' },
  { id: 'leadership', label: 'Called leadership', home: 'involved the school leadership team' }
];

export const STAFF_ROLES = ['Year level coordinator', 'Wellbeing', 'Leadership'];

/** How far back the incident context goes. */
export const CONTEXT_WEEKS = 4;

/** "End of day" for due times and the urgent follow-up. */
export const END_OF_DAY = '17:00';
/** "Tomorrow morning" and "In 2 days". */
export const MORNING = '08:00';

export type DueChip = 'hour' | 'eod' | 'morning' | 'twoDays';
export const DUE_CHIPS: { id: DueChip; label: string }[] = [
  { id: 'hour', label: 'In 1 hour' },
  { id: 'eod', label: 'End of day' },
  { id: 'morning', label: 'Tomorrow morning' },
  { id: 'twoDays', label: 'In 2 days' }
];

/** The follow-ups offered when an incident is saved (all ticked by default). */
export const INCIDENT_TASKS: { kind: 'lodge' | 'home' | 'staff'; title: string; due: DueChip }[] = [
  { kind: 'lodge', title: 'Lodge school incident report', due: 'eod' },
  { kind: 'home', title: 'Contact home', due: 'eod' },
  { kind: 'staff', title: 'Inform school staff', due: 'hour' }
];

/** What reminders say (the lock screen shows these, so no student names). */
export const TASK_LABEL: Record<string, string> = {
  urgent: 'Urgent follow-up', lodge: 'Lodge incident report', home: 'Contact home', staff: 'Inform school staff', custom: 'Follow-up'
};

/** Close day appears as a prompt from this time (or once the last lesson is closed). */
export const CLOSE_DAY_FROM = '15:00';

/** Brain dump: the original text is deleted after this many days. */
export const BRAIN_DUMP_KEEP_DAYS = 30;
