import type { Observation, Question, Student, TimetableEntry } from '../types';
import { daysBetween, timeToMinutes, weekday } from '../lib/dates';
import { openFollowUp } from './followups';

export function lessonsOn(timetable: TimetableEntry[], date: string): TimetableEntry[] {
  const d = weekday(date);
  return timetable.filter((t) => t.day === d).sort((a, b) => a.start.localeCompare(b.start));
}

/** The lesson in progress (or starting within `leadMin` minutes). */
export function currentLesson(timetable: TimetableEntry[], date: string, minutes: number, leadMin = 5): TimetableEntry | undefined {
  return lessonsOn(timetable, date).find(
    (t) => minutes >= timeToMinutes(t.start) - leadMin && minutes < timeToMinutes(t.end)
  );
}

export function nextLesson(timetable: TimetableEntry[], date: string, minutes: number): TimetableEntry | undefined {
  return lessonsOn(timetable, date).find((t) => timeToMinutes(t.start) > minutes);
}

/** Questions to ask about a student in a check-in (custom questions respect scope and frequency). */
export function dueQuestions(
  questions: Question[], student: Student, classId: string, obs: Observation[], date: string, checkinId?: string
): Question[] {
  return questions
    .filter((q) => q.enabled)
    .filter((q) => !q.classIds.length || q.classIds.includes(classId))
    .filter((q) => !q.studentIds.length || q.studentIds.includes(student.id))
    .filter((q) => {
      if (q.frequencyDays <= 0) return true;
      const prior = obs.filter((o) => o.questionId === q.id);
      if (checkinId && prior.some((o) => o.checkinId === checkinId)) return true; // already answered: keep visible
      if (openFollowUp(obs, q.id)) return true; // follow-ups always come back
      const last = prior.map((o) => o.date).sort().pop();
      return !last || daysBetween(last, date) >= q.frequencyDays;
    })
    .sort((a, b) => a.order - b.order);
}
