// Lesson-by-lesson timeline for one student: the check-in, homework and cold calls of each
// lesson, named by its learning intention.
// "Mon 26 Oct · Rivers and meanders · All good · Homework: not done · Cold call: answered well"

import type { Checkin, ColdCall, HomeworkCheck, IssueTag, Lesson, Observation } from '../types';
import { lessonOf, summarise, summaryText } from './checkin';
import { coldCallText } from './coldcall';
import { formatShort } from '../lib/dates';
import { HOMEWORK_REASONS } from '../config/checkin';

export interface TimelineRow { lesson: Lesson; date: string; name: string; checkin?: string; homework?: string; coldCall?: string; text: string }

export function studentTimeline(input: {
  lessons: Lesson[]; checkins: Checkin[]; observations: Observation[]; tags: IssueTag[]; homework: HomeworkCheck[]; coldCalls: ColdCall[]; studentId: string;
}, n = 10): TimelineRow[] {
  const { lessons, studentId } = input;
  const chk = input.checkins.filter((c) => c.studentId === studentId);
  const hw = input.homework.filter((h) => h.studentId === studentId);
  const cc = input.coldCalls.filter((c) => c.studentId === studentId);
  return [...lessons].sort((a, b) => b.openedAt - a.openedAt).map((l): TimelineRow | null => {
    const c = chk.find((x) => lessonOf(x) === l.id);
    const h = hw.find((x) => x.lessonId === l.id);
    const calls = cc.filter((x) => x.lessonId === l.id);
    if (!c && !h && !calls.length) return null;
    const checkin = c ? summaryText(summarise(c, input.observations, input.tags)) : undefined;
    const homework = h ? (h.done ? 'done' : `not done${h.reason ? `, ${(HOMEWORK_REASONS.find((r) => r.id === h.reason)?.label ?? h.reason).toLowerCase()}` : ''}`) : undefined;
    const coldCall = calls.length ? calls.map(coldCallText).join('; ') : undefined;
    const name = l.intention?.trim() ?? '';
    const text = [formatShort(l.date), name, checkin, homework && `Homework: ${homework}`, coldCall && `Cold call: ${coldCall}`].filter(Boolean).join(' · ');
    return { lesson: l, date: l.date, name, checkin, homework, coldCall, text };
  }).filter((r): r is TimelineRow => !!r).slice(0, n);
}
