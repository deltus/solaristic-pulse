// Turns the timetable and reminder preferences into a list of concrete reminder times.
// Used to schedule Android notifications ahead of time and for in-browser timers.

import type { ReminderPrefs, SchoolClass, TimetableEntry } from '../types';
import { timeToMinutes, toISODate, weekday } from '../lib/dates';

export interface PlannedReminder {
  key: string;
  at: Date;
  title: string;
  body: string;
  /** Lesson reminders open this class when tapped. */
  classId?: string;
}

export function inQuietHours(minutes: number, start: string, end: string): boolean {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === e) return false;
  return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
}

export function planReminders(
  timetable: TimetableEntry[], classes: SchoolClass[], prefs: ReminderPrefs, now: Date,
  days = 14, summary: (classId: string) => string = () => ''
): PlannedReminder[] {
  if (!prefs.enabled) return [];
  const out: PlannedReminder[] = [];
  const active = timetable.filter((t) => !classes.find((c) => c.id === t.classId)?.archived);
  const name = (id: string) => classes.find((c) => c.id === id)?.name ?? 'Class';

  for (let i = 0; i < days; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const iso = toISODate(day);
    const wd = weekday(iso);
    const lessons = active.filter((t) => t.day === wd).sort((a, b) => a.start.localeCompare(b.start));
    const add = (minutes: number, key: string, title: string, body: string, classId?: string) => {
      if (minutes < 0 || minutes >= 1440 || inQuietHours(minutes, prefs.quietStart, prefs.quietEnd)) return;
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
      if (at.getTime() <= now.getTime()) return;
      out.push({ key: `${iso}-${key}`, at, title, body, classId });
    };
    for (const l of lessons) {
      const extra = [l.notes, summary(l.classId)].filter(Boolean).join(' · ');
      if (prefs.beforeLessonMin !== null) {
        const when = prefs.beforeLessonMin > 0 ? `in ${prefs.beforeLessonMin} min` : 'starts now';
        add(timeToMinutes(l.start) - prefs.beforeLessonMin, `before-${l.id}`,
          `${name(l.classId)} ${when}${l.room ? ` · ${l.room}` : ''}`,
          extra || 'Tap to open today\'s check-ins.', l.classId);
      }
      if (prefs.afterLesson) {
        add(timeToMinutes(l.end), `after-${l.id}`, `${name(l.classId)} has finished`, 'Record any remaining check-ins while they are fresh.', l.classId);
      }
    }
    const schoolDay = active.length ? lessons.length > 0 : wd <= 5;
    if (prefs.dailyTime && schoolDay) {
      add(timeToMinutes(prefs.dailyTime), 'daily', 'Daily check-in',
        `Review today's check-ins${prefs.icp ? ' and record any ICP adjustments' : ''}.`);
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
