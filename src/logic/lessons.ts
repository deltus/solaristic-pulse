// Lessons as records: which lesson is open, when to ask "Close your lesson?", the previous
// lesson of a class (for homework), lesson names, and each student's homework history.
// Pure functions, so they're easy to test.

import type { HomeworkCheck, Lesson } from '../types';
import { formatShort } from '../lib/dates';
import { HOMEWORK_REASONS } from '../config/checkin';

/** "Close your lesson?" this long after opening. */
export const CLOSE_PROMPT_MIN = 60;
/** "Remind me in 30 minutes". */
export const REMIND_LATER_MIN = 30;

const byOpened = (a: Lesson, b: Lesson) => a.openedAt - b.openedAt || a.id.localeCompare(b.id);

/** The class's lesson that hasn't been closed yet (open, or waiting to be finished), if any. */
export function openLessonFor(lessons: Lesson[], classId: string): Lesson | undefined {
  // A relief teacher's lesson (brought in from a relief pass) is never the class teacher's open lesson.
  return lessons.filter((l) => l.classId === classId && l.status !== 'closed' && !l.relief).sort(byOpened).pop();
}

/** Lessons to offer for closing: open for an hour or more, or a "remind me" that has come due. */
export function lessonsToClose(lessons: Lesson[], now: number): Lesson[] {
  return lessons.filter((l) => {
    if (l.status === 'closed' || l.relief) return false;
    if (l.status === 'finishing') return !l.remindAt || l.remindAt <= now;
    return now - l.openedAt >= CLOSE_PROMPT_MIN * 60_000;
  }).sort(byOpened);
}

/** Closed lessons of this class before `current` (newest first). */
export function earlierLessons(lessons: Lesson[], classId: string, current?: Lesson): Lesson[] {
  return lessons
    .filter((l) => l.classId === classId && l.id !== current?.id && (!current || l.openedAt <= current.openedAt))
    .sort(byOpened)
    .reverse();
}

/** The previous lesson of this class, if it was closed with homework set. Not "yesterday": classes don't meet every day. */
export function homeworkToCheck(lessons: Lesson[], classId: string, current?: Lesson): Lesson | undefined {
  const prev = earlierLessons(lessons, classId, current)[0];
  return prev && prev.status === 'closed' && prev.homeworkSet ? prev : undefined;
}

/**
 * The Homework check button: "set" when the previous lesson closed with homework set, otherwise
 * "none" (shown greyed, "No homework set last lesson"; tapping it offers "Check anyway?").
 * `previous` is the previous lesson either way, so a "check anyway" can still be linked to it.
 */
export function homeworkButton(lessons: Lesson[], classId: string, current?: Lesson): { mode: 'set' | 'none'; previous?: Lesson } {
  const previous = earlierLessons(lessons, classId, current)[0];
  return { mode: homeworkToCheck(lessons, classId, current) ? 'set' : 'none', previous };
}

/** A lesson's name: its learning intention, or the date if none was entered. */
export function lessonName(l: Pick<Lesson, 'intention' | 'date'>): string {
  return l.intention?.trim() || formatShort(l.date);
}

/** "Rivers and meanders (Mon 26 Oct)" (or just the date). */
export function lessonLabel(l: Pick<Lesson, 'intention' | 'date'>): string {
  return l.intention?.trim() ? `${l.intention.trim()} (${formatShort(l.date)})` : formatShort(l.date);
}

export interface HomeworkItem { key: string; date: string; label: string; result: string; done: boolean | null; what?: string }

const resultText = (h?: Pick<HomeworkCheck, 'done' | 'reason'>) =>
  !h ? 'Not checked' : h.done ? 'Done' : `Not done${h.reason ? `, ${(HOMEWORK_REASONS.find((r) => r.id === h.reason)?.label ?? h.reason).toLowerCase()}` : ''}`;

/**
 * A student's recent homework: the last `n` lessons of their class with homework set, each with
 * Done / Not done / Not checked. Older checks made before lessons had homework markers are listed by date.
 */
export function homeworkHistory(lessons: Lesson[], checks: HomeworkCheck[], classId: string, studentId: string, n = 5): HomeworkItem[] {
  const mine = checks.filter((h) => h.studentId === studentId);
  // Lessons that set homework, plus any lesson checked with "Check anyway".
  const set = lessons.filter((l) => l.classId === classId && l.status === 'closed' && (l.homeworkSet || mine.some((h) => h.forLessonId === l.id))).map((l): HomeworkItem => {
    const h = mine.find((x) => x.forLessonId === l.id);
    return { key: l.id, date: l.date, label: lessonLabel(l), result: resultText(h), done: h ? h.done : null, what: l.homeworkText };
  });
  const legacy = mine.filter((h) => !h.forLessonId || !lessons.some((l) => l.id === h.forLessonId)).map((h): HomeworkItem => ({ key: h.id, date: h.date, label: formatShort(h.date), result: resultText(h), done: h.done }));
  return [...set, ...legacy].sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
}

/** Minutes a lesson has been open, for "Open 23 min". */
export const minutesOpen = (l: Lesson, now: number) => Math.max(0, Math.round((now - l.openedAt) / 60_000));
