import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PulseDB, useDatabase, db, getSettings, saveSettings } from '../src/db';
import * as svc from '../src/services';
import { loadDemoData } from '../src/demo';
import { today } from '../src/lib/dates';
import { parseRoster } from '../src/logic/importers';

let name = 0;
beforeEach(async () => {
  const instance = new PulseDB(`test-${++name}`);
  useDatabase(instance);
  await instance.open();
});

async function classWithStudents(className: string, n: number) {
  const c = await svc.createClass({ name: className });
  for (let i = 0; i < n; i++) await svc.addStudent(c.id, { firstName: `${className}-S${i}`, lastName: 'Test' });
  return c;
}

describe('stage 1 milestone', () => {
  it('two classes of ten, five check-ins, no mixing, data survives reopening (scenarios 1, 15)', async () => {
    const a = await classWithStudents('Alpha', 10);
    const b = await classWithStudents('Beta', 10);
    const d = today();

    const planA = await svc.ensurePlan(a.id, d);
    const planB = await svc.ensurePlan(b.id, d);
    expect(planA.entries).toHaveLength(5);
    expect(planB.entries).toHaveLength(5);
    const studentsA = new Set((await db.students.where('classId').equals(a.id).toArray()).map((s) => s.id));
    expect(planA.entries.every((e) => studentsA.has(e.studentId))).toBe(true);
    expect(planB.entries.some((e) => studentsA.has(e.studentId))).toBe(false);

    const [focus, homework, behaviour, coping] = await db.questions.bulkGet(['q-focus', 'q-homework', 'q-behaviour', 'q-coping']);
    for (const e of planA.entries) {
      const chk = await svc.getOrCreateCheckin(e.studentId, a.id, d, 'daily');
      await svc.answerQuestion({ checkin: chk, question: focus!, option: focus!.options[0] });
      await svc.answerQuestion({ checkin: chk, question: homework!, option: homework!.options[1] });
      await svc.answerQuestion({ checkin: chk, question: behaviour!, option: behaviour!.options[0] });
      await svc.answerQuestion({ checkin: chk, question: coping!, option: coping!.options[0] });
    }
    // Plan is stable when re-requested.
    expect((await svc.ensurePlan(a.id, d)).entries).toEqual(planA.entries);

    // Close and reopen the database.
    const dbName = db.name;
    db.close();
    const reopened = new PulseDB(dbName);
    useDatabase(reopened);
    await reopened.open();
    expect(await reopened.classes.count()).toBe(2);
    expect(await reopened.students.count()).toBe(20);
    const chks = await reopened.checkins.where('[classId+date]').equals([a.id, d]).toArray();
    expect(chks).toHaveLength(5);
    expect(chks.every((c) => c.status === 'complete')).toBe(true);
    expect(await reopened.observations.where('classId').equals(a.id).count()).toBe(20);
    expect(await reopened.observations.where('classId').equals(b.id).count()).toBe(0);
  });

  it('correcting an answer updates the same record instead of duplicating', async () => {
    const a = await classWithStudents('Alpha', 3);
    const plan = await svc.ensurePlan(a.id);
    const q = (await db.questions.get('q-focus'))!;
    const chk = await svc.getOrCreateCheckin(plan.entries[0].studentId, a.id, today(), 'daily');
    await svc.answerQuestion({ checkin: chk, question: q, option: q.options[1] });
    await svc.answerQuestion({ checkin: chk, question: q, option: q.options[0] });
    const obs = await db.observations.where('checkinId').equals(chk.id).toArray();
    expect(obs).toHaveLength(1);
    expect(obs[0].level).toBe(0);
    expect(obs[0].updatedAt).toBeDefined();
    expect((await db.checkins.get(chk.id))!.status).toBe('partial');
  });
});

describe('absence and skipping (scenario 5)', () => {
  it('records absence separately, back-fills the daily slot and can be undone', async () => {
    const a = await classWithStudents('Alpha', 8);
    const plan = await svc.ensurePlan(a.id);
    const absentee = plan.entries[0].studentId;
    await svc.markStatus(absentee, a.id, today(), 'absent');
    const after = await svc.ensurePlan(a.id);
    expect(after.entries).toHaveLength(6);
    expect(after.entries[5].reasons[0]).toContain('absent');
    expect(after.entries[5].studentId).not.toBe(absentee);
    expect(await db.observations.where('studentId').equals(absentee).count()).toBe(0);
    const chk = (await db.checkins.get(svc.checkinIdFor(today(), a.id, absentee)))!;
    expect(chk.status).toBe('absent');
    await svc.undoCheckin(chk.id);
    expect(await db.checkins.get(chk.id)).toBeUndefined();
  });

  it('Check More Students adds new students and stops when everyone is covered', async () => {
    const a = await classWithStudents('Alpha', 7);
    await svc.ensurePlan(a.id);
    expect(await svc.extendPlan(a.id, today(), 5)).toBe(2);
    expect(await svc.extendPlan(a.id, today(), 5)).toBe(0);
  });

  it('manual choice moves a student to the front of the queue', async () => {
    const a = await classWithStudents('Alpha', 9);
    const plan = await svc.ensurePlan(a.id);
    const outside = (await db.students.toArray()).find((s) => !plan.entries.some((e) => e.studentId === s.id))!;
    await svc.addToPlan(a.id, today(), outside.id);
    const next = await svc.ensurePlan(a.id);
    expect(next.entries[0]).toMatchObject({ studentId: outside.id, source: 'manual' });
  });
});

describe('roster import (scenario 2)', () => {
  it('creates classes by name and skips duplicates', async () => {
    const parsed = parseRoster([['First name', 'Surname', 'Class'], ['Ava', 'Smith', '8D History'], ['Ben', 'Jones', '8D History'], ['Ava', 'Smith', '8D History']]);
    const r = await svc.importRoster(parsed.rows);
    expect(r).toEqual({ added: 2, duplicates: 1, createdClasses: ['8D History'] });
    const again = await svc.importRoster(parsed.rows);
    expect(again.added).toBe(0);
  });
});

describe('backup, restore, deletion (scenario 18)', () => {
  it('round-trips all data and can wipe it', async () => {
    await loadDemoData();
    await saveSettings({ profile: { name: 'Demo Teacher', email: 'demo@example.edu.au' }, onboarded: true });
    const counts = async () => ({
      students: await db.students.count(), observations: await db.observations.count(),
      icp: await db.icpChecks.count(), timetable: await db.timetable.count()
    });
    const before = await counts();
    expect(before.students).toBe(36);
    expect(before.observations).toBeGreaterThan(100);
    const backup = JSON.parse(JSON.stringify(await svc.createBackup()));

    await svc.deleteAllData();
    expect(await db.students.count()).toBe(0);
    expect(await db.questions.count()).toBe(5); // core questions restored (including Wellbeing)
    expect((await getSettings()).onboarded).toBe(false);

    await svc.restoreBackup(backup);
    expect(await counts()).toEqual(before);
    expect((await getSettings()).profile.name).toBe('Demo Teacher');
    await expect(svc.restoreBackup({ hello: 1 })).rejects.toThrow('not a Solaristic Radar backup');
  });
});

describe('demo data', () => {
  it('produces follow-ups, flags, ICP history and a custom question', async () => {
    await loadDemoData();
    expect(await db.classes.count()).toBe(3);
    expect((await db.students.toArray()).some((s) => s.flag)).toBe(true);
    expect(await db.observations.filter((o) => !!o.followUp).count()).toBeGreaterThan(5);
    expect(await db.icpAdjustments.count()).toBe(4);
    expect(await db.questions.filter((q) => !q.builtIn).count()).toBe(1);
    expect(await db.checkins.filter((c) => c.status === 'absent').count()).toBeGreaterThan(0);
  });
});

describe('draw weight history', () => {
  it('stores the weight on each check-in and in the plan, and honours a starting priority', async () => {
    const c = await svc.createClass({ name: 'Gamma' });
    const s = await svc.addStudent(c.id, { firstName: 'Ava', lastName: 'Test', priorityAdjust: 0.5 });
    expect(s.priorityAdjust).toBe(0.5);
    const plan = await svc.ensurePlan(c.id);
    expect(plan.entries[0].weight).toBe(1.5);
    const chk = await svc.getOrCreateCheckin(s.id, c.id, today(), 'daily');
    expect(chk.weight).toBe(1.5);
    const r = await svc.importRoster([{ firstName: 'Ben', lastName: 'Test', priorityAdjust: 9 }], c.id);
    expect(r.added).toBe(1);
    expect((await db.students.filter((x) => x.firstName === 'Ben').first())!.priorityAdjust).toBe(1);
  });
});

import { recentStatus } from '../src/logic/summary';
import { computePriority } from '../src/logic/priority';
import { CORE_CATEGORIES, CORE_QUESTIONS } from '../src/db';

describe('Blitz', () => {
  it('saves whole-class marks separately from check-ins, feeds the area, and can be corrected', async () => {
    const c = await classWithStudents('Blitzers', 3);
    const [a, b, x] = await db.students.where('classId').equals(c.id).toArray();
    const d = today();
    await svc.saveBlitz(c.id, d, 'homework', { [a.id]: 'no', [b.id]: 'yes', [x.id]: 'absent' });
    expect(await svc.loadBlitz(c.id, d, 'homework')).toEqual({ [a.id]: 'no', [b.id]: 'yes', [x.id]: 'absent' });
    expect(await db.checkins.count()).toBe(0); // not a check-in
    const obsA = await db.observations.where('studentId').equals(a.id).toArray();
    expect(obsA[0]).toMatchObject({ categoryId: 'homework', blitz: 'homework', level: 1 });
    expect(recentStatus(obsA, 'homework')).toMatchObject({ count: 1, support: 1 });
    // A second "No" (another blitz topic in the same area) nudges the draw weight.
    await svc.saveBlitz(c.id, d, 'uniform', { [a.id]: 'no' });
    const all = await db.observations.where('studentId').equals(a.id).toArray();
    expect(computePriority(a, all, [], CORE_QUESTIONS, CORE_CATEGORIES, d).weight).toBeGreaterThan(1);
    // Correcting replaces that day's marks for the topic.
    await svc.saveBlitz(c.id, d, 'homework', { [a.id]: 'yes' });
    expect(await svc.loadBlitz(c.id, d, 'homework')).toEqual({ [a.id]: 'yes' });
  });
});

describe('check-outs and evidence', () => {
  it('saves one check-out per lesson, keeps notes, and is part of backups', async () => {
    const c = await classWithStudents('Delta', 2);
    const d = today();
    await svc.saveCheckout({ classId: c.id, date: d, timetableId: 't1', lessonMin: 50, pctWorking: 76 });
    const again = await svc.saveCheckout({ classId: c.id, date: d, timetableId: 't1', lessonMin: 50, pctWorking: 140, note: 'Fire drill' });
    expect(await db.checkouts.count()).toBe(1);
    expect(again).toMatchObject({ pctWorking: 100, note: 'Fire drill' });
    expect(again.updatedAt).toBeDefined();
    const backup = await svc.createBackup();
    expect(backup.tables.checkouts).toHaveLength(1);
    await svc.deleteClassPermanently(c.id);
    expect(await db.checkouts.count()).toBe(0);
  });

  it('keeps evidence on the device only, and removes it with the adjustment', async () => {
    const c = await classWithStudents('Echo', 1);
    const [s] = await db.students.where('classId').equals(c.id).toArray();
    const a = await svc.saveAdjustment({ studentId: s.id, title: 'Scaffolded worksheet', evidence: { prompt: 'Photo of the worksheet' } });
    expect((await db.icpAdjustments.get(a.id))!.evidence?.prompt).toBe('Photo of the worksheet');
    await svc.addEvidence(a, { kind: 'note', text: 'Completed with prompts' });
    await svc.addEvidence(a, { kind: 'photo', blob: new Blob(['x'], { type: 'image/jpeg' }), name: 'work.jpg' });
    expect(await db.evidence.count()).toBe(2);
    expect(Object.keys((await svc.createBackup()).tables)).not.toContain('evidence');
    await svc.snoozeEvidence(a, '2026-10-19');
    expect((await db.icpAdjustments.get(a.id))!.evidence?.snoozedUntil).toBe('2026-10-20');
    await svc.deleteAdjustment(a.id);
    expect(await db.evidence.count()).toBe(0);
  });
});

import { lessonIdFor } from '../src/logic/checkin';
import { migrateToSwipe } from '../src/db';
import { sideOf } from '../src/ui/Swipe';
import { SWIPE } from '../src/config/checkin';

describe('swipe check-in (saving, back-out, undo)', () => {
  async function setup() {
    const c = await classWithStudents('Swipe', 3);
    const [a, b, x] = await db.students.where('classId').equals(c.id).toArray();
    const date = today();
    const t = (id: string) => ({ studentId: id, classId: c.id, date, lessonId: lessonIdFor(date, c.id) });
    return { c, a, b, x, t };
  }

  it('All good saves one check-in with every area implied as meeting expectations, and Undo removes it', async () => {
    const { a, t } = await setup();
    const r = await svc.logAllGood(t(a.id));
    expect(await db.checkins.get(r.checkin.id)).toMatchObject({ result: 'good', status: 'complete' });
    const obs = await db.observations.where('checkinId').equals(r.checkin.id).toArray();
    expect(obs.map((o) => [o.categoryId, o.level, o.source]).sort()).toEqual([['behaviour', 0, 'implied'], ['coping', 0, 'implied'], ['focus', 0, 'implied']]);
    expect(await db.issueTags.count()).toBe(0);
    await svc.undoCheckin(r.checkin.id);
    expect(await db.checkins.count()).toBe(0);
    expect(await db.observations.count()).toBe(0);
  });

  it('Issue saves tapped areas as observed, untapped as implied, ticked sub-options only; Undo removes the details too', async () => {
    const { b, t } = await setup();
    const r = await svc.logIssue(t(b.id), { areas: { focus: ['off_task', 'not_listening'] }, note: 'Phone out', followUp: false });
    const obs = await db.observations.where('checkinId').equals(r.checkin.id).toArray();
    expect(obs.find((o) => o.categoryId === 'focus')).toMatchObject({ level: 1, source: 'observed', note: 'Phone out' });
    expect(obs.filter((o) => o.categoryId !== 'focus').every((o) => o.level === 0 && o.source === 'implied')).toBe(true);
    const tags = await db.issueTags.toArray();
    expect(tags.map((x) => x.tagId).sort()).toEqual(['not_listening', 'off_task']);
    expect(tags.some((x) => x.tagId === 'distracted' || x.tagId === 'low_effort')).toBe(false); // unticked = not flagged
    expect((await db.checkins.get(r.checkin.id))!.followUp).toBe(false);
    await svc.undoCheckin(r.checkin.id);
    expect(await db.issueTags.count()).toBe(0);
  });

  it('backing out of the issue screen saves nothing; swiping All good afterwards saves All good', async () => {
    const { x, t } = await setup();
    // Opening the issue screen and going back makes no service call, so nothing exists yet.
    expect(await db.checkins.count()).toBe(0);
    const r = await svc.logAllGood(t(x.id));
    expect(await db.checkins.count()).toBe(1);
    expect(r.checkin.result).toBe('good');
    // Logging again in the same lesson replaces rather than duplicates.
    await svc.logIssue(t(x.id), { areas: { behaviour: [] } });
    expect(await db.checkins.count()).toBe(1);
    expect(await db.observations.count()).toBe(3);
  });

  it('Not here marks absent without ratings; homework checks and the streak answer save separately', async () => {
    const { a, b, t } = await setup();
    await svc.markNotHere(t(a.id));
    expect(await db.checkins.toArray()).toMatchObject([{ status: 'absent', studentId: a.id }]);
    expect(await db.observations.count()).toBe(0);
    const hw = await svc.saveHomeworkCheck(t(b.id), false, 'forgot');
    expect(await db.homework.get(hw.id)).toMatchObject({ done: false, reason: 'forgot' });
    expect(await db.checkins.where('studentId').equals(b.id).count()).toBe(0); // not a daily check-in
    await svc.answerStreak(t(b.id), 'behaviour');
    expect(await db.observations.filter((o) => !!o.exceeding).toArray()).toMatchObject([{ categoryId: 'behaviour', response: 'Exceeding', level: 0, source: 'observed' }]);
    expect((await db.students.get(b.id))!.streakAskedAt).toBe(today());
  });

  it('swipe direction comes from one setting', () => {
    expect(SWIPE.goodDirection).toBe('right');
    expect(sideOf('good')).toBe('right');
    expect(sideOf('issue')).toBe('left');
  });
});

describe('migration to the swipe check-in', () => {
  it('renames areas, keeps Prepared for class as history, and adds a "low effort" detail to old Effort difficulties', async () => {
    const c = await classWithStudents('Old', 1);
    const [s] = await db.students.toArray();
    // An older install: old names, Prepared for class switched on, question-by-question answers.
    await db.categories.update('focus', { name: 'Effort' });
    await db.categories.update('homework', { name: 'Prepared for class' });
    await db.questions.update('q-homework', { enabled: true });
    const chk = svc.checkinIdFor('2026-09-01', c.id, s.id);
    await db.checkins.add({ id: chk, studentId: s.id, classId: c.id, date: '2026-09-01', createdAt: 1, status: 'complete', source: 'daily', weight: 1.4 });
    const base = { checkinId: chk, studentId: s.id, classId: c.id, date: '2026-09-01', createdAt: 1 };
    await db.observations.bulkAdd([
      { ...base, id: `${chk}|q-focus`, questionId: 'q-focus', categoryId: 'focus', response: 'Some difficulty', level: 2 },
      { ...base, id: `${chk}|q-homework`, questionId: 'q-homework', categoryId: 'homework', response: 'Meeting expectations', level: 0 },
      { ...base, id: `${chk}|q-behaviour`, questionId: 'q-behaviour', categoryId: 'behaviour', response: 'Meeting expectations', level: 0 }
    ]);
    await db.transaction('rw', db.categories, db.questions, db.observations, db.issueTags, (tx) => migrateToSwipe(tx));

    expect((await db.categories.get('focus'))!.name).toBe('Attention');
    expect((await db.categories.get('homework'))!.name).toBe('Preparedness');
    expect((await db.questions.get('q-homework'))!.enabled).toBe(false);
    // Old records are untouched (append-only) and still readable.
    expect(await db.observations.count()).toBe(3);
    expect((await db.observations.get(`${chk}|q-homework`))!.response).toBe('Meeting expectations');
    expect((await db.checkins.get(chk))!.weight).toBe(1.4);
    expect(await db.issueTags.toArray()).toMatchObject([{ checkinId: chk, areaId: 'focus', tagId: 'low_effort', source: 'migrated' }]);
    // Running it twice changes nothing more.
    await db.transaction('rw', db.categories, db.questions, db.observations, db.issueTags, (tx) => migrateToSwipe(tx));
    expect(await db.issueTags.count()).toBe(1);
  });
});
