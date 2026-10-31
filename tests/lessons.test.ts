import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Checkin, ColdCall, HomeworkCheck, Lesson, Observation, SchoolClass, Student } from '../src/types';
import { PulseDB, useDatabase, db, addHistoricalLessons } from '../src/db';
import * as svc from '../src/services';
import { CLOSE_PROMPT_MIN, homeworkHistory, homeworkToCheck, lessonsToClose, openLessonFor } from '../src/logic/lessons';
import { coldCallSummary, pickColdCall } from '../src/logic/coldcall';
import { lessonsSinceSeen, lessonOrder, rankByNeed } from '../src/logic/need';
import { buildAllGood } from '../src/logic/checkin';
import { reflectionInsights, MIN_CLOSED_LESSONS } from '../src/logic/reflection';
import { studentTimeline } from '../src/logic/timeline';
import { addDays, formatShort, nowMs, today } from '../src/lib/dates';

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const H = 3_600_000;
const student = (i: number): Student => ({ id: `s${String(i).padStart(2, '0')}`, classId: 'c1', firstName: `Student${i}`, lastName: 'Test', archived: false, priorityAdjust: 0, createdAt: 0 });
const lesson = (id: string, date: string, extra: Partial<Lesson> = {}): Lesson => ({ id, classId: 'c1', date, openedAt: new Date(`${date}T09:00:00`).getTime(), status: 'closed', createdAt: 0, ...extra });

let n = 0;
beforeEach(async () => {
  const instance = new PulseDB(`lessons-${++n}`);
  useDatabase(instance);
  await instance.open();
});

describe('opening and closing a lesson', () => {
  it('opens one Lesson record per class, closes only with both teacher answers, and can be finished later', async () => {
    const c = await svc.createClass({ name: '8B Geography' });
    const l = await svc.openLesson(c.id, 'Explain how rivers form meanders');
    expect(l).toMatchObject({ classId: c.id, status: 'open', intention: 'Explain how rivers form meanders', date: today() });
    expect((await svc.openLesson(c.id)).id).toBe(l.id); // tapping the class again continues the same lesson
    await expect(svc.closeLesson(l.id, { happy: 'yes' })).rejects.toThrow(/two teacher questions/);

    const remindAt = await svc.finishLessonLater(l.id, { attentionPct: 72, homeworkSet: true, homeworkText: 'Finish the river worksheet' });
    expect(await db.lessons.get(l.id)).toMatchObject({ status: 'finishing', attentionPct: 72, homeworkText: 'Finish the river worksheet' });
    expect(remindAt - nowMs()).toBeGreaterThan(29 * 60_000);

    await svc.closeLesson(l.id, { attentionPct: 72, homeworkSet: true, homeworkText: 'Finish the river worksheet', happy: 'mostly', planDone: 'partly', note: 'Ran short of time' });
    expect(await db.lessons.get(l.id)).toMatchObject({ status: 'closed', happy: 'mostly', planDone: 'partly', homeworkSet: true });
    expect(openLessonFor(await db.lessons.toArray(), c.id)).toBeUndefined();
    expect((await svc.openLesson(c.id)).id).not.toBe(l.id); // next time: a new lesson
  });

  it('lets a relief teacher close a lesson without the teacher check', async () => {
    const c = await svc.createClass({ name: '9C Science' });
    const l = await svc.openLesson(c.id);
    await svc.closeLesson(l.id, { attentionPct: 60, homeworkSet: false }, true);
    expect(await db.lessons.get(l.id)).toMatchObject({ status: 'closed', attentionPct: 60 });
    expect((await db.lessons.get(l.id))?.happy).toBeUndefined();
  });

  it('asks "Close your lesson?" after 60 minutes, offers an unclosed lesson later, and honours "remind me in 30 minutes"', () => {
    const opened = new Date('2026-10-26T09:00:00').getTime();
    const open = lesson('L1', '2026-10-26', { status: 'open', openedAt: opened });
    expect(lessonsToClose([open], opened + (CLOSE_PROMPT_MIN - 1) * 60_000)).toEqual([]);
    expect(lessonsToClose([open], opened + CLOSE_PROMPT_MIN * 60_000)).toEqual([open]);
    // Left open and the app opened the next day: still offered.
    expect(lessonsToClose([open], opened + 24 * H)).toEqual([open]);
    const later = { ...open, status: 'finishing' as const, remindAt: opened + 90 * 60_000 };
    expect(lessonsToClose([later], opened + 80 * 60_000)).toEqual([]);
    expect(lessonsToClose([later], opened + 90 * 60_000)).toEqual([later]);
    expect(lessonsToClose([{ ...open, status: 'closed' }], opened + 5 * H)).toEqual([]);
  });
});

describe('homework check depends on the previous lesson', () => {
  it('shows only when the previous lesson of the class was closed with homework set (not "yesterday")', () => {
    const mon = lesson('mon', '2026-10-19', { homeworkSet: true, homeworkText: 'Finish the river worksheet', intention: 'Rivers and meanders' });
    const thu = lesson('thu', '2026-10-22', { homeworkSet: false });
    const now = lesson('now', '2026-10-26', { status: 'open' });
    expect(homeworkToCheck([mon, now], 'c1', now)?.id).toBe('mon'); // a week apart is fine
    expect(homeworkToCheck([mon, thu, now], 'c1', now)).toBeUndefined(); // the previous lesson set none
    expect(homeworkToCheck([mon, { ...thu, homeworkSet: true, status: 'open' }, now], 'c1', now)).toBeUndefined(); // not closed
    expect(homeworkToCheck([{ ...mon, classId: 'other' }, now], 'c1', now)).toBeUndefined(); // other class
  });

  it('lists recent homework against lesson names with Done / Not done / Not checked', () => {
    const lessons = [
      lesson('a', '2026-10-20', { homeworkSet: true, intention: 'Mapping skills' }),
      lesson('b', '2026-10-22', { homeworkSet: true, intention: 'Erosion types' }),
      lesson('c', '2026-10-26', { homeworkSet: true, intention: 'Rivers and meanders' }),
      lesson('d', '2026-10-27', { homeworkSet: true })
    ];
    const checks: HomeworkCheck[] = [
      { id: 'h1', lessonId: 'b', forLessonId: 'a', classId: 'c1', studentId: 's1', date: '2026-10-22', done: true, createdAt: 0 },
      { id: 'h2', lessonId: 'c', forLessonId: 'b', classId: 'c1', studentId: 's1', date: '2026-10-26', done: true, createdAt: 0 },
      { id: 'h3', lessonId: 'd', forLessonId: 'c', classId: 'c1', studentId: 's1', date: '2026-10-27', done: false, reason: 'forgot', createdAt: 0 }
    ];
    const d = formatShort;
    expect(homeworkHistory(lessons, checks, 'c1', 's1').map((h) => `${h.label}: ${h.result}`)).toEqual([
      `${d('2026-10-27')}: Not checked`, `Rivers and meanders (${d('2026-10-26')}): Not done, forgot`,
      `Erosion types (${d('2026-10-22')}): Done`, `Mapping skills (${d('2026-10-20')}): Done`
    ]);
  });
});

describe('cold calls', () => {
  it('is fair: over 50 picks in a class of 25, nobody is picked twice before everyone has been picked once', () => {
    const students = Array.from({ length: 25 }, (_, i) => student(i));
    const random = rng(7);
    const calls: ColdCall[] = [];
    const picks: string[] = [];
    for (let k = 0; k < 50; k++) {
      const s = pickColdCall(students, calls, new Set(), random)!;
      picks.push(s.id);
      calls.push({ id: `cc${k}`, lessonId: `L${Math.floor(k / 5)}`, classId: 'c1', studentId: s.id, date: '2026-10-26', result: 'good', createdAt: k + 1 });
    }
    expect(new Set(picks.slice(0, 25)).size).toBe(25);
    // Second round: still nobody three times, and everyone again eventually.
    expect(Math.max(...[...new Set(picks)].map((id) => picks.filter((x) => x === id).length))).toBeLessThanOrEqual(3);
  });

  it('leaves out students marked Not here, and summarises recent results', () => {
    const students = [student(1), student(2)];
    for (let i = 0; i < 20; i++) expect(pickColdCall(students, [], new Set(['s01']), Math.random)!.id).toBe('s02');
    expect(pickColdCall(students, [], new Set(['s01', 's02']), Math.random)).toBeUndefined();
    const calls: ColdCall[] = ['good', 'good', 'struggled', 'good', 'struggled', 'good'].map((r, i) => ({ id: `${i}`, lessonId: 'L', classId: 'c1', studentId: 's01', date: `2026-10-${10 + i}`, result: r as 'good' | 'struggled', createdAt: i }));
    expect(coldCallSummary(calls, 's01')).toBe('Answered well 3 of last 5');
  });

  it('saves its own record; "wasn\'t listening" also counts toward Attention; undo removes both', async () => {
    const c = await svc.createClass({ name: '8B' });
    const s = await svc.addStudent(c.id, { firstName: 'Ava', lastName: 'Test' });
    const l = await svc.openLesson(c.id);
    const cc = await svc.logColdCall(l, s.id, 'struggled', ['didnt_know', 'not_listening']);
    expect(await db.coldCalls.get(cc.id)).toMatchObject({ lessonId: l.id, result: 'struggled', tags: ['didnt_know', 'not_listening'] });
    expect(await db.observations.toArray()).toMatchObject([{ categoryId: 'focus', level: 1, lessonId: l.id, coldCallId: cc.id }]);
    await svc.undoColdCall(cc.id);
    expect(await db.coldCalls.count()).toBe(0);
    expect(await db.observations.count()).toBe(0);
    await svc.logColdCall(l, s.id, 'good');
    expect(await db.observations.count()).toBe(0); // answered well adds nothing to Attention
  });
});

describe('ranking counts Lesson records', () => {
  it('counts lessons since last seen from Lesson records, including two lessons on the same day', () => {
    const lessons = [
      lesson('L1', '2026-10-20'),
      lesson('L2', '2026-10-26', { openedAt: new Date('2026-10-26T09:00:00').getTime() }),
      lesson('L3', '2026-10-26', { openedAt: new Date('2026-10-26T13:00:00').getTime(), status: 'open' })
    ];
    const checkins: Checkin[] = [
      buildAllGood({ studentId: 's00', classId: 'c1', date: '2026-10-20', lessonId: 'L1' }).checkin,
      buildAllGood({ studentId: 's01', classId: 'c1', date: '2026-10-26', lessonId: 'L2' }).checkin
    ];
    const order = lessonOrder(checkins, [], 'L3', lessons);
    expect(order).toEqual(['L1', 'L2', 'L3']);
    expect(lessonsSinceSeen('s00', checkins, order, 'L3')).toBe(2);
    expect(lessonsSinceSeen('s01', checkins, order, 'L3')).toBe(1);
    const ranked = rankByNeed({ students: [student(0), student(1), student(2)], checkins, observations: [], tags: [], homework: [], lessons, lessonId: 'L3', today: '2026-10-26' });
    expect(ranked.map((r) => r.studentId)).toEqual(['s02', 's00', 's01']); // never seen, then 2 lessons ago, then 1
  });

  it('turns older check-in days into historical lessons with matching ids (v8 upgrade)', async () => {
    const c = await svc.createClass({ name: 'Old' });
    const s = await svc.addStudent(c.id, { firstName: 'Ben', lastName: 'Test' });
    await db.checkins.bulkAdd([
      { id: `2026-10-01|${c.id}|${s.id}`, studentId: s.id, classId: c.id, date: '2026-10-01', createdAt: 1, status: 'complete', source: 'daily' },
      { id: `2026-10-02|${c.id}|${s.id}`, studentId: s.id, classId: c.id, date: '2026-10-02', createdAt: 2, status: 'absent', source: 'daily', lessonId: `2026-10-02|${c.id}` }
    ]);
    await db.transaction('rw', db.checkins, db.homework, db.lessons, (tx) => addHistoricalLessons(tx));
    const lessons = await db.lessons.toArray();
    expect(lessons.map((l) => l.id).sort()).toEqual([`2026-10-01|${c.id}`, `2026-10-02|${c.id}`]);
    expect(lessons.every((l) => l.historical && l.status === 'closed')).toBe(true);
  });
});

describe('My teaching insights', () => {
  const classes: SchoolClass[] = [{ id: 'c1', name: '8B', archived: false, createdAt: 0 }];
  const todayIso = '2026-10-26';
  const closed = (i: number, extra: Partial<Lesson>) => lesson(`L${i}`, addDays(todayIso, -i), { happy: 'yes', planDone: 'yes', ...extra });
  const attentive: Observation[] = Array.from({ length: 10 }, (_, i) => ({ id: `o${i}`, checkinId: `k${i}`, studentId: `s${i}`, classId: 'c1', date: todayIso, createdAt: 0, questionId: 'q-focus', categoryId: 'focus', response: 'Meeting expectations', level: 0, lessonId: `L${(i % 5) + 1}` }));
  const insights = (lessons: Lesson[]) => reflectionInsights({ lessons, classes, observations: attentive, homework: [], checkinLesson: new Map(), today: todayIso });

  it('shows nothing with fewer than 5 closed lessons', () => {
    expect(MIN_CLOSED_LESSONS).toBe(5);
    expect(insights([1, 2, 3, 4].map((i) => closed(i, {})))).toEqual([]);
    // Historical lessons and lessons without the teacher's answers don't count.
    expect(insights([1, 2, 3, 4].map((i) => closed(i, {})).concat(closed(5, { historical: true }), closed(6, { happy: undefined })))).toEqual([]);
  });

  it('finds gentle patterns, phrased as observations or questions, with a positive one first', () => {
    const lessons = [1, 2, 3, 4, 5].map((i) => closed(i, { happy: i <= 4 ? 'no' : 'yes', attentionPct: 80 }));
    const out = insights(lessons);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].tone).toBe('positive');
    expect(out.map((i) => i.text)).toContain("You've said you were unhappy with 4 of your last 5 lessons with 8B, but students were mostly logged as attentive. What's making these lessons feel off?");
    expect(out.some((i) => /got through your plan in most lessons where the class attention was above 70%/.test(i.text))).toBe(true);
    for (const i of out) {
      expect(i.text).not.toMatch(/\b(should|must|need to|failed|bad|poor)\b/i);
      expect(i.tone === 'question' ? /\?$/.test(i.text) : /\.$/.test(i.text)).toBe(true);
    }
  });
});

describe('lesson-by-lesson timeline', () => {
  it('joins check-in, homework and cold calls under the learning intention', () => {
    const l = lesson('L1', '2026-10-26', { intention: 'Rivers and meanders' });
    const r = buildAllGood({ studentId: 's1', classId: 'c1', date: '2026-10-26', lessonId: 'L1' });
    const rows = studentTimeline({
      lessons: [l], checkins: [r.checkin], observations: r.observations, tags: [],
      homework: [{ id: 'h', lessonId: 'L1', classId: 'c1', studentId: 's1', date: '2026-10-26', done: false, createdAt: 0 }],
      coldCalls: [{ id: 'c', lessonId: 'L1', classId: 'c1', studentId: 's1', date: '2026-10-26', result: 'good', createdAt: 0 }], studentId: 's1'
    });
    expect(rows[0].text).toBe(`${formatShort('2026-10-26')} · Rivers and meanders · All good · Homework: not done · Cold call: answered well`);
  });
});
