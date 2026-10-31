// Check for understanding (round 9): the menu, ticket chips and the suggested question.
// Edit the wording here; the ids are saved with results, so keep them as they are.

export type CfuMode = 'whole' | 'coldcall' | 'select' | 'ticket';

/**
 * The menu, in the order agreed with Thomas (31/10/2026). `color` is a CSS class (cfu-c-…) that
 * gives each mode its own colour on the menu and on its screen.
 */
export const CFU_MODES: { id: CfuMode; label: string; hint: string; icon: string; color: string }[] = [
  { id: 'whole', label: 'Whole class', hint: "Thumbs up: everyone starts as Yes, tap the few who aren't", icon: 'students', color: 'cfu-c-whole' },
  { id: 'coldcall', label: 'Cold call assistant', hint: 'Pick a student fairly', icon: 'bolt', color: 'cfu-c-coldcall' },
  { id: 'select', label: 'Select a student', hint: 'You choose who answers', icon: 'search', color: 'cfu-c-select' },
  { id: 'ticket', label: 'Entry or exit ticket', hint: 'Up to 3 questions, answered on paper', icon: 'file', color: 'cfu-c-ticket' }
];

/** Older ids (thumbs check and yes/no were replaced by Whole class on 1/11/2026). */
export const cfuModeOf = (id: string | undefined): CfuMode | undefined => (id === 'thumbs' || id === 'yesno' ? 'whole' : (id as CfuMode | undefined));

/** Whole class: press and hold a name for Sort of. */
export const WHOLE_HOLD_MS = 450;

/** Tickets: questions per ticket, and countdown choices (minutes) for the Present page. */
export const MAX_TICKET_QUESTIONS = 3;
export const TICKET_TIMERS = [0, 1, 2, 3, 5];

/** Optional chips after swiping "Not yet" on a ticket. "Absent" also marks them absent for the rest of the day. */
export const TICKET_NOT_YET_TAGS = [
  { id: 'misconception', label: 'Misconception' },
  { id: 'incomplete', label: 'Incomplete' }
];

/** Suggested ticket question; {intention} is the learning intention. */
export const SUGGESTED_QUESTION = 'In one sentence, what did we learn about {intention}?';
/** Words dropped from the start of an intention in the suggested question ("Explain how…" → "how…"). */
export const INTENTION_LEAD_INS = [
  'we are learning to', 'we are learning about', 'we are learning', 'students will be able to', 'students will', 'i can', 'to',
  'explain', 'describe', 'identify', 'understand', 'know', 'compare', 'analyse', 'analyze', 'evaluate', 'use', 'learn', 'recognise', 'recognize',
  'list', 'label', 'name', 'define', 'apply', 'calculate', 'investigate', 'explore', 'outline', 'discuss', 'solve', 'write', 'create', 'interpret'
];
export const FALLBACK_QUESTION = 'In one sentence, what did we learn today?';
export const FALLBACK_ENTRY_QUESTION = 'In one sentence, what did we learn last lesson?';

/** Content signals ("Not yet" answers and struggled cold calls) that suggest Coping → Content. */
export const CONTENT_SIGNAL = { days: 14, suggestAt: 2 };
