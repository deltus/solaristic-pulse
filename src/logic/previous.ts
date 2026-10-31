// "Previous": the students answered on a swipe screen this visit, newest last, each with a way to
// take its answer back. Going back undoes the newest answer and shows that student again.

export interface PrevStep { studentId: string; undo: () => Promise<unknown> }

/** Adds an answer. A student answered again (after going back) only appears once, at the end. */
export const pushStep = (stack: PrevStep[], step: PrevStep): PrevStep[] => [...stack.filter((x) => x.studentId !== step.studentId), step];

/** Removes a student's answer (e.g. after the toast's Undo already took it back). */
export const dropStep = (stack: PrevStep[], studentId: string): PrevStep[] => stack.filter((x) => x.studentId !== studentId);

export const lastStep = (stack: PrevStep[]): PrevStep | undefined => stack[stack.length - 1];
