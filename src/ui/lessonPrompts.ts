// Phone notifications for lessons (Android). In the web version the in-app prompt does the job
// while the app is open; browsers can't schedule notifications for later.

import type { Lesson } from '../types';
import { isNative } from '../platform';
import { dayOffset } from '../lib/dates';
import { CLOSE_PROMPT_MIN } from '../logic/lessons';

/** Lesson times include the "+1 day" test offset; the phone's clock doesn't. */
const realTime = (ms: number) => new Date(ms - dayOffset() * 86_400_000);

export function promptToClose(lesson: Lesson, className: string, at = lesson.openedAt + CLOSE_PROMPT_MIN * 60_000) {
  if (!isNative()) return;
  import('../native').then((n) => n.scheduleLessonPrompt(lesson.id, realTime(at), `${className}: tap to close the lesson.`, lesson.classId)).catch((e) => console.warn('Lesson prompt failed', e));
}

export function cancelClosePrompt(lessonId: string) {
  if (!isNative()) return;
  import('../native').then((n) => n.cancelLessonPrompt(lessonId)).catch(() => undefined);
}
