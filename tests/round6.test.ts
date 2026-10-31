import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReliefPass } from '../src/types';
import { PulseDB, useDatabase, db } from '../src/db';
import * as svc from '../src/services';
import { canUsePass, makeReliefPass, openBundle, passEnds, passProblem, passStatus, recordUse, reliefEntries, reliefToReview, schoolDays, sealBundle, shouldClearReliefData } from '../src/logic/relief';
import { summarise, summaryText } from '../src/logic/checkin';
import { studentTimeline } from '../src/logic/timeline';
import { addDays, parseISODate, today } from '../src/lib/dates';

let n = 0;
beforeEach(async () => {
  const instance = new PulseDB(`round6-${++n}`);
  useDatabase(instance);
  await instance.open();
});

const at = (date: string, h = 12) => { const d = parseISODate(date); d.setHours(h); return d.getTime(); };

describe('pass rules', () => {
  it('covers today by default and up to 5 school days', () => {
    expect(schoolDays('2026-10-26', '2026-10-30')).toBe(5);
    expect(schoolDays('2026-10-30', '2026-11-02')).toBe(2); // Fri to Mon
    expect(passProblem({ classId: 'c', from: '2026-10-26', to: '2026-10-30' }, '2026-10-26')).toBeNull();
    expect(passProblem({ classId: 'c', from: '2026-10-26', to: '2026-11-02' }, '2026-10-26')).toMatch(/up to 5 school days/);
    expect(passProblem({ classId: 'c', from: '2026-10-20' }, '2026-10-26')).toMatch(/past/);
    expect(passProblem({ classId: 'c', from: '2026-10-26', reliefEmail: 'not-an-email' }, '2026-10-26')).toMatch(/email/);
    expect(makeReliefPass({ classId: 'c', from: '2026-10-26' }, 'p', 0)).toMatchObject({ from: '2026-10-26', to: '2026-10-26', shareIcp: false });
  });

  it('only works within its dates (to the end of the last day), for the right email, and on one device', () => {
    const pass = makeReliefPass({ classId: 'c', from: '2026-10-27', to: '2026-10-28', reliefEmail: 'Sam@School.example' }, 'p', 0);
    const sam = { email: 'sam@school.example', deviceId: 'dev-1' };
    expect(canUsePass(pass, sam, at('2026-10-26'))).toEqual({ ok: false, reason: 'not-yet' });
    expect(canUsePass(pass, sam, at('2026-10-27', 8))).toEqual({ ok: true });
    expect(canUsePass(pass, sam, passEnds(pass))).toEqual({ ok: true });
    expect(canUsePass(pass, sam, passEnds(pass) + 1)).toEqual({ ok: false, reason: 'expired' });
    expect(canUsePass(pass, { email: 'other@school.example', deviceId: 'dev-1' }, at('2026-10-27'))).toEqual({ ok: false, reason: 'wrong-email' });
    const used = recordUse(pass, sam, at('2026-10-27'));
    expect(used.claimedDevice).toBe('dev-1');
    expect(canUsePass(used, { ...sam, deviceId: 'dev-2' }, at('2026-10-27'))).toEqual({ ok: false, reason: 'other-device' });
    expect(recordUse(used, sam, at('2026-10-28')).uses).toHaveLength(2);
  });

  it('a cancelled pass stops working straight away', async () => {
    const c = await svc.createClass({ name: '8B' });
    const p = await svc.createReliefPass({ classId: c.id, from: today() });
    expect(passStatus(p, Date.now())).toBe('active');
    await svc.cancelReliefPass(p.id);
    const after = (await db.reliefPasses.get(p.id))!;
    expect(passStatus(after, Date.now())).toBe('cancelled');
    expect(canUsePass(after, { deviceId: 'd' }, Date.now())).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('an ended pass clears the downloaded class only after unsent entries have synced', () => {
    const pass = makeReliefPass({ classId: 'c', from: '2026-10-27' }, 'p', 0);
    expect(shouldClearReliefData(pass, at('2026-10-27'), 0)).toBe(false);
    expect(shouldClearReliefData(pass, at('2026-10-28'), 2)).toBe(false);
    expect(shouldClearReliefData(pass, at('2026-10-28'), 0)).toBe(true);
  });
});

describe('what the relief teacher\'s device receives', () => {
  async function setup(shareIcp: boolean) {
    const c = await svc.createClass({ name: '8B', subject: 'History' });
    const other = await svc.createClass({ name: '9C' });
    const ava = await svc.addStudent(c.id, { firstName: 'Ava', lastName: 'Example' });
    const ben = await svc.addStudent(c.id, { firstName: 'Ben', lastName: 'Sample' });
    await svc.addStudent(other.id, { firstName: 'Zed', lastName: 'Elsewhere' });
    await svc.setFlag(ava.id, 'Private flag reason');
    await svc.saveAdjustment({ studentId: ben.id, title: 'Extra time', details: 'Up to 25% on tests' });
    await svc.addNote(ava.id, 'Private teacher note');
    const l = await svc.openLesson(c.id);
    await svc.logIssue({ studentId: ava.id, classId: c.id, date: today(), lessonId: l.id }, { areas: { wellbeing: ['upset'] }, note: 'Private check-in note' });
    await svc.saveJournalEntry({ classId: c.id, text: 'Private journal' });
    const p = await svc.createReliefPass({ classId: c.id, from: today(), shareIcp, plan: 'Chapter 4' });
    return { c, ava, ben, bundle: await svc.reliefBundleFor(p.id) };
  }

  it('with ICP unticked, adjustments are not in the data at all; no history, notes, reasons or other classes', async () => {
    const { bundle, ben } = await setup(false);
    const json = JSON.stringify(bundle);
    for (const secret of ['Extra time', 'Up to 25%', 'Private flag reason', 'Private teacher note', 'Private check-in note', 'Private journal', 'Zed', 'Elsewhere', 'upset', 'wellbeing', 'reasons', 'concern', 'lessonsSince']) {
      expect(json).not.toContain(secret);
    }
    expect(Object.keys(bundle).sort()).toEqual(['cls', 'pass', 'queue', 'students']);
    expect(Object.keys(bundle.students[0]).sort()).toEqual(['firstName', 'flagged', 'icp', 'id', 'lastName']);
    expect(bundle.students.find((s) => s.id === ben.id)).toMatchObject({ icp: true });
    expect(bundle.students.find((s) => s.id === ben.id)!.adjustments).toBeUndefined();
    expect(bundle.students.map((s) => s.firstName).sort()).toEqual(['Ava', 'Ben']);
    expect(bundle.queue).toHaveLength(2);
    expect(bundle.pass.plan).toBe('Chapter 4');
  });

  it('with ICP ticked, only titles and short instructions are added', async () => {
    const { bundle, ben, ava } = await setup(true);
    expect(bundle.students.find((s) => s.id === ben.id)!.adjustments).toEqual([{ title: 'Extra time', details: 'Up to 25% on tests' }]);
    expect(bundle.students.find((s) => s.id === ava.id)).toMatchObject({ flagged: true, icp: false });
    expect(JSON.stringify(bundle)).not.toContain('Private flag reason');
  });

  it('is sealed with a key made for the pass', async () => {
    const { bundle } = await setup(true);
    const { key, sealed } = await sealBundle(bundle);
    expect(sealed).not.toContain('Ava');
    expect(await openBundle(key, sealed)).toEqual(bundle);
    const wrong = await sealBundle(bundle);
    await expect(openBundle(wrong.key, sealed)).rejects.toThrow();
  });
});

describe('relief entries', () => {
  it('are tagged, shown for review, accepted (or after 7 days automatically) or removed', async () => {
    const c = await svc.createClass({ name: '8B' });
    const s = await svc.addStudent(c.id, { firstName: 'Ava', lastName: 'Test' });
    const t = await svc.addStudent(c.id, { firstName: 'Ben', lastName: 'Test' });
    const l = await svc.openLesson(c.id);
    const tag = { passId: 'p1', name: 'Sam Relief' };
    const a = await svc.logAllGood({ studentId: s.id, classId: c.id, date: today(), lessonId: l.id });
    const b = await svc.logAllGood({ studentId: t.id, classId: c.id, date: today(), lessonId: l.id });
    await db.checkins.update(a.checkin.id, { relief: tag });
    await db.checkins.update(b.checkin.id, { relief: tag });
    const gather = async () => {
      const obs = await db.observations.toArray(), tags = await db.issueTags.toArray();
      return reliefEntries({ checkins: await db.checkins.toArray(), homework: [], coldCalls: [], brainBreaks: [], assessmentChecks: [] }, { checkin: (x) => summaryText(summarise(x, obs, tags)) });
    };
    let entries = await gather();
    expect(reliefToReview(entries, Date.now())).toHaveLength(2);
    expect(reliefToReview(entries, Date.now() + 8 * 86_400_000)).toHaveLength(0);
    // Timeline: "Relief: Sam Relief".
    const row = studentTimeline({ lessons: await db.lessons.toArray(), checkins: await db.checkins.toArray(), observations: await db.observations.toArray(), tags: [], homework: [], coldCalls: [], studentId: s.id })[0];
    expect(row.text).toContain('All good (Relief: Sam Relief)');
    await svc.removeReliefEntry(entries.find((e) => e.id === b.checkin.id)!);
    expect(await db.checkins.get(b.checkin.id)).toBeUndefined();
    expect(await db.observations.where('checkinId').equals(b.checkin.id).count()).toBe(0);
    entries = await gather();
    await svc.acceptReliefEntries(reliefToReview(entries, Date.now()));
    expect(reliefToReview(await gather(), Date.now())).toHaveLength(0);
    expect((await db.checkins.get(a.checkin.id))!.relief).toEqual({ ...tag, reviewed: true });
  });

  it('keeps the relief teacher\'s name and the pass details encrypted when synced', async () => {
    const { ENCRYPTED } = await import('../src/sync/fields');
    expect(ENCRYPTED.checkins).toContain('relief');
    expect(ENCRYPTED.reliefPasses).toEqual(expect.arrayContaining(['reliefName', 'reliefEmail', 'plan', 'uses']));
  });
});

describe('demo', () => {
  it('a pass starting tomorrow is upcoming, not active', () => {
    const p: ReliefPass = makeReliefPass({ classId: 'c', from: addDays(today(), 1) }, 'p', 0);
    expect(passStatus(p, Date.now())).toBe('upcoming');
  });
});
