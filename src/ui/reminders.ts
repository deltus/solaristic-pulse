// Reminders: in-app (always), Android notifications scheduled ahead on the device,
// and best-effort browser notifications while the web app is open.

import { useEffect } from 'preact/hooks';
import { db } from '../db';
import type { Settings, TimetableEntry } from '../types';
import { currentLesson, lessonsOn, nextLesson } from '../logic/schedule';
import { planReminders } from '../logic/reminderPlan';
import { followUpReminders } from '../logic/incidents';
import { nowMinutes, today } from '../lib/dates';
import { isNative, showNotification } from '../platform';
import { useLive, useTick } from './hooks';

export interface ReminderState {
  current?: TimetableEntry;
  next?: TimetableEntry;
  todays: TimetableEntry[];
}

export function useReminders(settings: Settings | undefined): ReminderState {
  useTick(30_000);
  const data = useLive(async () => {
    const [timetable, classes, students, adjustments, followUps] = await Promise.all([
      db.timetable.toArray(), db.classes.toArray(), db.students.toArray(), db.icpAdjustments.toArray(), db.followUps.where('status').equals('todo').toArray()
    ]);
    return { timetable, classes, students, adjustments, followUps };
  }, []);
  const date = today();
  const timetable = (data?.timetable ?? []).filter((t) => !data?.classes.find((c) => c.id === t.classId)?.archived);

  useEffect(() => {
    if (!settings || !data) return;
    const icpCount = (classId: string) => {
      const ids = new Set(data.students.filter((s) => s.classId === classId && !s.archived).map((s) => s.id));
      return data.adjustments.filter((a) => a.active && ids.has(a.studentId)).length;
    };
    const summary = (classId: string) => {
      const n = icpCount(classId);
      return settings.reminders.icp && n ? `${n} ICP adjustment${n === 1 ? '' : 's'} to check` : '';
    };

    if (isNative()) {
      // Schedule two weeks ahead; refreshed whenever the app opens or the timetable/settings change.
      const plan = [...planReminders(data.timetable, data.classes, settings.reminders, new Date(), 14, summary), ...followUpReminders(data.followUps, Date.now())]
        .sort((a, b) => a.at.getTime() - b.at.getTime());
      import('../native').then((n) => n.scheduleNativeReminders(plan)).catch((e) => console.warn('Reminder scheduling failed', e));
      return;
    }

    // Browser: timers only fire while the page is open.
    const timers = [...planReminders(data.timetable, data.classes, settings.reminders, new Date(), 1, summary), ...followUpReminders(data.followUps, Date.now(), 1)]
      .filter((p) => p.at.getTime() - Date.now() < 18 * 3600_000)
      .map((p) => setTimeout(() => {
        const k = `pulse-notified-${p.key}`;
        try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch { /* ignore */ }
        showNotification(p.title, p.body);
      }, p.at.getTime() - Date.now()));
    return () => timers.forEach(clearTimeout);
  }, [settings, data]);

  return {
    current: currentLesson(timetable, date, nowMinutes(), settings?.reminders.beforeLessonMin ?? 5),
    next: nextLesson(timetable, date, nowMinutes()),
    todays: lessonsOn(timetable, date)
  };
}
