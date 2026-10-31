// Close day: when to offer it, and spotting a day that wasn't closed.

import type { DayClose, Lesson, TimetableEntry } from '../types';
import { CLOSE_DAY_FROM } from '../config/incidents';
import { addDays, timeToMinutes, weekday } from '../lib/dates';

/**
 * Offer Close day once the day's last timetabled lesson has been closed, or from CLOSE_DAY_FROM
 * if anything happened today. Not once the day is closed.
 */
export function closeDayDue(d: { date: string; nowMin: number; timetable: TimetableEntry[]; lessons: Lesson[]; close?: DayClose | null }): boolean {
  if (d.close) return false;
  const todays = d.lessons.filter((l) => l.date === d.date && !l.historical);
  if (!todays.length) return false;
  if (d.nowMin >= timeToMinutes(CLOSE_DAY_FROM)) return true;
  const wd = weekday(d.date);
  const timetabled = new Set(d.timetable.filter((t) => t.day === wd).map((t) => t.classId));
  if (!timetabled.size) return false;
  return [...timetabled].every((c) => todays.some((l) => l.classId === c && l.status === 'closed'));
}

/** The most recent earlier day (in the last 4) with lessons and no Close day: "Day not closed". */
export function dayNotClosed(today: string, lessons: Lesson[], closes: DayClose[]): string | null {
  for (let i = 1; i <= 4; i++) {
    const d = addDays(today, -i);
    if (lessons.some((l) => l.date === d && !l.historical)) return closes.some((c) => c.date === d) ? null : d;
  }
  return null;
}
