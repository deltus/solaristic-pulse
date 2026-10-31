// Check for understanding (round 9): the menu, thumbs labels, ticket chips and the suggested question.
// Edit the wording here; the ids are saved with results, so keep them as they are.

export type CfuMode = 'coldcall' | 'thumbs' | 'yesno' | 'ticket';

export const CFU_MODES: { id: CfuMode; label: string; hint: string; icon: string }[] = [
  { id: 'coldcall', label: 'Cold call', hint: 'Pick a student fairly', icon: 'user' },
  { id: 'thumbs', label: 'Thumbs check', hint: 'Whole-class count, no names', icon: 'check' },
  { id: 'yesno', label: 'Whole class yes/no', hint: 'Tap each name: Yes or Not yet', icon: 'students' },
  { id: 'ticket', label: 'Exit or entry ticket', hint: 'One question, answered on paper', icon: 'reports' }
];

export const THUMBS = [
  { id: 'up', emoji: '👍', label: 'Got it' },
  { id: 'mid', emoji: '👊', label: 'Sort of' },
  { id: 'down', emoji: '👎', label: 'Not yet' }
] as const;

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
  'list', 'define', 'apply', 'calculate', 'investigate', 'explore', 'outline', 'discuss', 'solve', 'write', 'create', 'interpret'
];
export const FALLBACK_QUESTION = 'In one sentence, what did we learn today?';
export const FALLBACK_ENTRY_QUESTION = 'In one sentence, what did we learn last lesson?';

/** Content signals ("Not yet" answers and struggled cold calls) that suggest Coping → Content. */
export const CONTENT_SIGNAL = { days: 14, suggestAt: 2 };

/** Long-press on a thumbs counter to take one off. */
export const THUMBS_HOLD_MS = 450;
