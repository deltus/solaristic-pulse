import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ColdCall, IcpAdjustment, IcpCheck, IssueTag, Lesson, Observation, Student } from '../src/types';
import { PulseDB, useDatabase, db } from '../src/db';
import * as svc from '../src/services';
import { CHECKIN_AREAS, subLabel } from '../src/config/checkin';
import { areaAverage, buildIssue, summarise, summaryText } from '../src/logic/checkin';
import { decideSwipe, issueSwipe } from '../src/logic/swipe';
import { DIAL_TICKS, dialToPct, pctToDial, zoneFor } from '../src/logic/checkout';
import { coldCallsLastLessons, planShuffle, skipShuffle } from '../src/logic/coldcall';
import { homeworkButton, homeworkHistory } from '../src/logic/lessons';
import { icpDueForClass } from '../src/logic/icp';
import { today } from '../src/lib/dates';

let n = 0;
beforeEach(async () => {
  const instance = new PulseDB(`round3-${++n}`);
  useDatabase(instance);
  await instance.open();
});
const lesson = (id: string, date: string, extra: Partial<Lesson> = {}): Lesson => ({ id, classId: 'c1', date, openedAt: new Date(`${date}T09:00:00`).getTime(), status: 'closed', createdAt: 0, ...extra });

describe('issue screen swipes', () => {
  it('right with ticks saves straight away (no extra screen); right with nothing goes back; left cancels', () => {
    expect(issueSwipe('good', { behaviour: ['disruptive'] })).toBe('save');
    expect(issueSwipe('good', { focus: [] })).toBe('save');
    expect(issueSwipe('good', { coping: ['workload'] })).toBe('save');
    expect(issueSwipe('good', { wellbeing: ['withdrawn'] })).toBe('save');
    expect(issueSwipe('good', {}, ['gum'])).toBe('save');
    expect(issueSwipe('good', {})).toBe('back');
    expect(issueSwipe('issue', { behaviour: ['disruptive'] })).toBe('cancel');
  });

  it('saving from the swipe uses "follow up next time"; cancelling saves nothing', async () => {
    const c = await svc.createClass({ name: '8B' });
    const s = await svc.addStudent(c.id, { firstName: 'Ava', lastName: 'Test' });
    const l = await svc.openLesson(c.id);
    const t = { studentId: s.id, classId: c.id, date: today(), lessonId: l.id };
    if (issueSwipe('issue', { behaviour: ['disruptive'] }) === 'save') await svc.logIssue(t, { areas: { behaviour: ['disruptive'] } });
    expect(await db.checkins.count()).toBe(0);
    if (issueSwipe('good', { behaviour: ['peer_interactions'] }) === 'save') await svc.logIssue(t, { areas: { behaviour: ['peer_interactions'] }, followUp: true });
    expect(await db.checkins.toArray()).toMatchObject([{ result: 'issue', followUp: true }]);
    expect((await db.issueTags.toArray()).map((x) => x.tagId)).toEqual(['peer_interactions']);
  });

  it('counts a short quick flick as a swipe, but not a slow nudge', () => {
    expect(decideSwipe(40, 4, 60)).toBe('right');
    expect(decideSwipe(-40, 2, 70)).toBe('left');
    expect(decideSwipe(40, 4, 500)).toBeNull();
    expect(decideSwipe(95, 10, 900)).toBe('right');
    expect(decideSwipe(5, -50, 80)).toBe('up');
    expect(decideSwipe(10, 10, 50)).toBeNull();
  });
});

describe('sub-options', () => {
  it('offers the final lists, and still labels older options in history', () => {
    const subs = (id: string) => CHECKIN_AREAS.find((a) => a.id === id)!.subs.map((s) => s.id);
    expect(subs('behaviour')).toContain('peer_interactions');
    expect(subs('focus')).toEqual(['off_task', 'not_listening', 'low_effort']);
    expect(subs('coping')).toEqual(['pace', 'content', 'workload', 'assessment_progress']);
    expect(subs('coping')).not.toContain('upset');
    expect(subLabel('coping', 'upset')).toBe('Upset or distressed');
    expect(subLabel('focus', 'distracted')).toBe('Distracted');
    expect(subLabel('wellbeing', 'friendship')).toBe('Friendship issues');
    // An older check-in with a legacy coping tag still reads properly.
    const r = buildIssue({ studentId: 's', classId: 'c', date: '2026-10-01', lessonId: 'L' }, { areas: { coping: [] } });
    const legacy: IssueTag = { id: 'x', checkinId: r.checkin.id, studentId: 's', classId: 'c', date: '2026-10-01', areaId: 'coping', tagId: 'tired', source: 'observed', createdAt: 0 };
    expect(summaryText(summarise(r.checkin, r.observations, [legacy]))).toBe('Coping with work: tired or low energy');
    // Legacy options can't be picked any more.
    expect(buildIssue({ studentId: 's', classId: 'c', date: '2026-10-02', lessonId: 'L2' }, { areas: { coping: ['upset'] } }).tags).toEqual([]);
  });
});

describe('running average on the card', () => {
  const obs = (levels: number[], area = 'behaviour'): Observation[] => levels.map((level, i) => ({
    id: `o${i}`, checkinId: `k${i}`, studentId: 's', classId: 'c', date: `2026-09-${String(30 - i).padStart(2, '0')}`, createdAt: i,
    questionId: 'q', categoryId: area, response: '', level: level as 0 | 1
  }));
  it('shows meets out of the last 10 and an arrow against the 10 before', () => {
    // Newest first: the last 10 have 8 meets, the 10 before have 5.
    expect(areaAverage(obs([0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0]), 'behaviour')).toMatchObject({ meets: 8, total: 10, prevMeets: 5, prevTotal: 10, trend: 'up' });
    expect(areaAverage(obs([1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'behaviour').trend).toBe('down');
    expect(areaAverage(obs([0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0]), 'behaviour').trend).toBe('flat');
    expect(areaAverage(obs([0, 0]), 'behaviour')).toMatchObject({ meets: 2, total: 2, trend: null });
    // Blitz marks are left out.
    expect(areaAverage(obs([1, 1]).map((o) => ({ ...o, blitz: 'behaviour' })), 'behaviour').total).toBe(0);
  });
});

describe('focus dial scale', () => {
  it('puts 50 a quarter of the way round, 75 in the middle and 90 at three quarters', () => {
    expect(DIAL_TICKS).toEqual([0, 50, 75, 90, 100]);
    expect(pctToDial(0)).toBe(0);
    expect(pctToDial(50)).toBe(0.25);
    expect(pctToDial(75)).toBe(0.5);
    expect(pctToDial(90)).toBe(0.75);
    expect(pctToDial(100)).toBe(1);
    expect(pctToDial(82.5)).toBeCloseTo(0.625);
    for (let p = 0; p <= 100; p++) expect(dialToPct(pctToDial(p))).toBe(p);
    expect([49, 50, 74, 75].map((p) => zoneFor(p).zone)).toEqual(['low', 'mixed', 'mixed', 'focused']);
  });
});

describe('cold call shuffle', () => {
  it('ends on the student already chosen; a tap shows them straight away; with the animation off they show instantly', () => {
    const names = ['Ava', 'Ben', 'Chloe', 'Dev'];
    const plan = planShuffle(names, 'Chloe', { animate: true }, () => 0.1);
    expect(plan.frames.length).toBeGreaterThan(5);
    expect(plan.frames[plan.frames.length - 1]).toEqual({ at: plan.total, name: 'Chloe' });
    expect(plan.total).toBeLessThan(1500);
    expect(skipShuffle(plan)).toBe('Chloe');
    expect(planShuffle(names, 'Chloe', { animate: false }, Math.random)).toEqual({ frames: [{ at: 0, name: 'Chloe' }], total: 0 });
    expect(planShuffle(names, 'Chloe', { animate: true, reduceMotion: true }, Math.random).total).toBe(0);
  });

  it('student page numbers: cold calls and % answered well over the last 5 lessons, against the 5 before', () => {
    const lessons = Array.from({ length: 10 }, (_, i) => lesson(`L${i}`, `2026-10-${String(10 + i).padStart(2, '0')}`));
    const call = (i: number, good: boolean): ColdCall => ({ id: `c${i}`, lessonId: `L${i}`, classId: 'c1', studentId: 's1', date: lessons[i].date, result: good ? 'good' : 'struggled', createdAt: i });
    const calls = [call(0, true), call(1, true), call(3, true), call(5, false), call(7, true), call(9, false), { ...call(8, true), studentId: 'other' }];
    expect(coldCallsLastLessons(calls, lessons, 'c1', 's1')).toEqual({ count: 3, goodPct: 33, prevCount: 3, prevGoodPct: 100, trend: 'down' });
    expect(coldCallsLastLessons([], lessons, 'c1', 's1')).toMatchObject({ count: 0, goodPct: null, trend: null });
  });
});

describe('homework check when no homework was set', () => {
  it('shows greyed, and "Check anyway" saves a check linked to the previous lesson without homework text', async () => {
    const prev = lesson('prev', '2026-10-22', { intention: 'Erosion types', homeworkSet: false });
    const now = lesson('now', '2026-10-26', { status: 'open' });
    expect(homeworkButton([prev, now], 'c1', now)).toEqual({ mode: 'none', previous: prev });
    expect(homeworkButton([{ ...prev, homeworkSet: true }, now], 'c1', now).mode).toBe('set');
    expect(homeworkButton([now], 'c1', now)).toEqual({ mode: 'none', previous: undefined });

    await db.lessons.bulkAdd([prev, now]);
    const h = await svc.saveHomeworkCheck({ studentId: 's1', classId: 'c1', date: '2026-10-26', lessonId: 'now' }, false, 'forgot', prev.id);
    expect(h).toMatchObject({ forLessonId: 'prev', done: false });
    // It still shows in the student's homework history.
    expect(homeworkHistory([prev, now], [h], 'c1', 's1')[0]).toMatchObject({ result: 'Not done, forgot' });
  });
});

describe('ICP button on the class page', () => {
  it('counts ICP checks due today for this class only', () => {
    const st = (id: string, classId: string): Student => ({ id, classId, firstName: id, lastName: 'T', archived: false, priorityAdjust: 0, createdAt: 0 });
    const students = [st('a', 'c1'), st('b', 'c1'), st('z', 'c2')];
    const adj = (id: string, studentId: string, extra: Partial<IcpAdjustment> = {}): IcpAdjustment => ({ id, studentId, title: id, frequency: 'lesson', startDate: '2026-10-01', active: true, createdAt: 0, ...extra });
    const adjustments = [adj('a1', 'a'), adj('a2', 'a'), adj('b1', 'b'), adj('z1', 'z'), adj('old', 'b', { active: false })];
    const checks: IcpCheck[] = [{ id: 'x', adjustmentId: 'a2', studentId: 'a', date: '2026-10-27', outcome: 'implemented', createdAt: 0 }];
    expect(icpDueForClass(adjustments, students, checks, [], 'c1', '2026-10-27').map((a) => a.id)).toEqual(['a1', 'b1']);
    expect(icpDueForClass(adjustments, students, checks, [], 'c2', '2026-10-27').map((a) => a.id)).toEqual(['z1']);
  });
});

import { searchClassesAndStudents } from '../src/ui/screens/Classes';

describe('Classes page search', () => {
  it('finds classes by name, subject or year level, and students by name', () => {
    const classes = [
      { id: 'c1', name: '8B', subject: 'Geography', yearLevel: 'Year 8', archived: false, createdAt: 0 },
      { id: 'c2', name: '10A', subject: 'Mathematics', yearLevel: 'Year 10', archived: false, createdAt: 0 }
    ];
    const students = [
      { id: 's1', classId: 'c1', firstName: 'Chloe', lastName: 'Walker', archived: false, priorityAdjust: 0, createdAt: 0 },
      { id: 's2', classId: 'c2', firstName: 'William', lastName: 'Harris', preferredName: 'Bill', archived: false, priorityAdjust: 0, createdAt: 0 }
    ];
    expect(searchClassesAndStudents(classes, students, 'geog').classes.map((c) => c.id)).toEqual(['c1']);
    expect(searchClassesAndStudents(classes, students, 'year 10').classes.map((c) => c.id)).toEqual(['c2']);
    expect(searchClassesAndStudents(classes, students, 'bill').students.map((s) => s.id)).toEqual(['s2']);
    expect(searchClassesAndStudents(classes, students, 'walker chloe').students.map((s) => s.id)).toEqual(['s1']);
    expect(searchClassesAndStudents(classes, students, '  ').students).toEqual([]);
  });
});
