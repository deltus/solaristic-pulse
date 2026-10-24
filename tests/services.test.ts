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
    expect(await db.questions.count()).toBe(4); // core questions restored
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
    const a = await svc.saveAdjustment({ studentId: s.id, title: 'Scaffolded worksheet', evidence: { enabled: true, kinds: ['photo', 'note'], interval: 'weekly' } });
    expect((await db.icpAdjustments.get(a.id))!.evidence?.interval).toBe('weekly');
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
