// Round 7 × round 6: a relief teacher gets the active seating plan with names only.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PulseDB, useDatabase, db } from '../src/db';
import * as svc from '../src/services';
import { loadDemoData } from '../src/demo';
import { seatLabel } from '../src/logic/seatingData';
import { seedReliefDatabase, reliefDbName } from '../src/relief/device';
import { today } from '../src/lib/dates';

let n = 0;
beforeEach(async () => {
  const instance = new PulseDB(`round7-relief-${++n}`);
  useDatabase(instance);
  await instance.open();
  await loadDemoData();
});

async function demo8B() {
  const cls = (await db.classes.toArray()).find((c) => c.name === '8B Humanities')!;
  const students = await db.students.where('classId').equals(cls.id).toArray();
  const plan = (await db.seatingPlans.where('classId').equals(cls.id).toArray()).find((p) => p.active)!;
  return { cls, students, plan };
}

describe('relief pass with a seating plan', () => {
  it('carries the room and who sits where, and nothing about needs, support, tags or relationships', async () => {
    const { cls, students, plan } = await demo8B();
    expect(plan).toBeDefined();
    // Make sure the class has every kind of private seating data to leave out.
    await svc.setSeatingNeeds(students[0].id, ['near-board'], 'Short-sighted, glasses at home');
    await svc.setSupport(students[1].id, 'more');
    await svc.saveBalanceTags(cls.id, [{ id: 'tg1', name: 'Quiet achiever', noAlone: false }]);
    await svc.setStudentBalanceTags(students[2].id, ['tg1']);
    await svc.addRelationship(cls.id, students[3].id, students[4].id, 'keepApart', { note: 'Argued at lunch' });
    await svc.addRelationship(cls.id, students[5].id, students[6].id, 'worksWell');
    const seat = Object.keys(plan.seats)[0];
    await svc.updateSeatingPlan(plan.id, { seats: { ...plan.seats, [seat]: { ...plan.seats[seat], locked: true } } });

    const pass = await svc.createReliefPass({ classId: cls.id, from: today(), reliefName: 'Sam Relief' });
    const b = await svc.reliefBundleFor(pass.id);
    expect(b.seating).toBeDefined();
    expect(Object.keys(b.seating!).sort()).toEqual(['room', 'seats']);
    expect(Object.values(b.seating!.seats).every((id) => students.some((s) => s.id === id))).toBe(true);
    expect(Object.keys(b.seating!.seats)).toEqual(Object.keys(plan.seats).filter((k) => students.some((s) => s.id === plan.seats[k].studentId && !s.archived)));
    expect(b.students.map((s) => s.firstName)).toContain(students[0].firstName);

    const json = JSON.stringify(b);
    for (const word of ['near-board', 'Short-sighted', 'seatingNeeds', 'support', '"more"', 'Quiet achiever', 'balanceTags', 'tg1', 'Argued at lunch', 'keepApart', 'worksWell', 'keep apart', 'works well', 'locked', 'seatWatch', plan.name]) {
      expect(json, word).not.toContain(word);
    }
  });

  it('the relief phone stores the plan, so the check-in card shows the seat', async () => {
    const { cls, students, plan } = await demo8B();
    const pass = await svc.createReliefPass({ classId: cls.id, from: today() });
    const b = await svc.reliefBundleFor(pass.id);
    const relief = new PulseDB(reliefDbName(pass.id));
    useDatabase(relief);
    await relief.open();
    await seedReliefDatabase(b);
    const stored = await db.seatingPlans.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ classId: cls.id, active: true, name: '' });
    expect(await db.relationships.count()).toBe(0);
    const someone = plan.seats[Object.keys(plan.seats)[0]].studentId;
    expect(seatLabel(stored[0], someone)).toBe(seatLabel(plan, someone));
    expect(seatLabel(stored[0], someone)).toMatch(/Table|Desk|Seat/);
    const ctx = await svc.loadLessonContext(cls.id);
    expect(ctx!.seatingPlan?.id).toBe(`relief-${pass.id}`);
    expect(students.length).toBeGreaterThan(0);
  });

  it('a class without a plan sends no seating', async () => {
    const other = (await db.classes.toArray()).find((c) => c.name !== '8B Humanities')!;
    await db.seatingPlans.where('classId').equals(other.id).delete();
    const pass = await svc.createReliefPass({ classId: other.id, from: today() });
    expect((await svc.reliefBundleFor(pass.id)).seating).toBeUndefined();
  });
});
