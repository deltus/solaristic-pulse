import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Checkin, IssueTag, Observation } from '../src/types';
import { PulseDB, useDatabase, db, moveSubOptions } from '../src/db';
import * as svc from '../src/services';
import { areaAverage, buildAllGood, buildIssue, minorCounts, stripWellbeing, summarise, summaryText, wellbeingRecent } from '../src/logic/checkin';
import { recentConcern } from '../src/logic/need';
import { flyPlan, issueSwipe } from '../src/logic/swipe';
import { milestoneAfter } from '../src/logic/target';
import { planRoll, rollResult } from '../src/logic/coldcall';
import { buildSqlScript } from '../src/sqlExport';
import { today } from '../src/lib/dates';

let n = 0;
beforeEach(async () => {
  const instance = new PulseDB(`round3b-${++n}`);
  useDatabase(instance);
  await instance.open();
});
const T = { studentId: 's', classId: 'c', date: '2026-10-20', lessonId: 'L' };

describe('moving older sub-options (database v10)', () => {
  const chk = (id: string): Checkin => ({ id, studentId: 's', classId: 'c', date: '2026-10-01', createdAt: 1, status: 'complete', source: 'daily', result: 'issue' });
  const obs = (checkinId: string, area: string, level: 0 | 1, note?: string): Observation => ({
    id: `${checkinId}|q-${area}`, checkinId, studentId: 's', classId: 'c', date: '2026-10-01', createdAt: 1, questionId: `q-${area}`, categoryId: area,
    response: level ? 'Needs support' : 'Meeting expectations', level, source: level ? 'observed' : 'implied', ...(note ? { note } : {})
  });
  const tag = (checkinId: string, area: string, sub: string): IssueTag => ({ id: `${checkinId}|${area}|${sub}`, checkinId, studentId: 's', classId: 'c', date: '2026-10-01', areaId: area, tagId: sub, source: 'observed', createdAt: 1 });
  const run = () => moveSubOptions({ table: (t: string) => db.table(t) });

  it('maps every old option to the new lists', async () => {
    const pairs: [string, string, string, string][] = [
      ['focus', 'distracted', 'focus', 'off_task'], ['focus', 'low_productivity', 'focus', 'low_effort'], ['coping', 'overwhelmed', 'coping', 'workload'],
      ['coping', 'dysregulated', 'wellbeing', 'dysregulated'], ['coping', 'withdrawn', 'wellbeing', 'withdrawn'], ['coping', 'upset', 'wellbeing', 'upset'],
      ['coping', 'tired', 'wellbeing', 'tired'], ['coping', 'unwell', 'wellbeing', 'unwell'], ['coping', 'outside', 'wellbeing', 'outside'], ['coping', 'peers', 'wellbeing', 'friendship']
    ];
    for (const [i, [area, sub]] of pairs.entries()) {
      await db.checkins.put(chk(`k${i}`));
      await db.observations.put(obs(`k${i}`, area, 1));
      await db.issueTags.put(tag(`k${i}`, area, sub));
    }
    const counts = await run();
    expect(counts.tagsMoved).toBe(10);
    expect(counts.toWellbeing).toBe(7);
    for (const [i, [, , toArea, toSub]] of pairs.entries()) {
      expect((await db.issueTags.where('checkinId').equals(`k${i}`).toArray()).map((t) => `${t.areaId}|${t.tagId}`)).toEqual([`${toArea}|${toSub}`]);
    }
    // Moved to Wellbeing: a Wellbeing row, and Coping goes back to "meets".
    expect(await db.observations.get('k3|q-wellbeing')).toMatchObject({ categoryId: 'wellbeing', level: 1 });
    expect(await db.observations.get('k3|q-coping')).toMatchObject({ level: 0, source: 'implied' });
  });

  it('keeps Coping when it has no sub-option, or still has a coping one, and moves the note with Wellbeing', async () => {
    await db.checkins.bulkPut([chk('a'), chk('b'), chk('c')]);
    await db.observations.bulkPut([obs('a', 'coping', 1), obs('b', 'coping', 1), obs('c', 'coping', 1, 'Upset after lunch')]);
    await db.issueTags.bulkPut([tag('b', 'coping', 'pace'), tag('b', 'coping', 'tired'), tag('c', 'coping', 'upset')]);
    await run();
    expect(await db.observations.get('a|q-coping')).toMatchObject({ level: 1 });
    expect(await db.observations.get('a|q-wellbeing')).toBeUndefined();
    expect(await db.observations.get('b|q-coping')).toMatchObject({ level: 1 });
    expect(await db.observations.get('b|q-wellbeing')).toMatchObject({ level: 1 });
    expect(await db.observations.get('c|q-wellbeing')).toMatchObject({ level: 1, note: 'Upset after lunch' });
    expect((await db.observations.get('c|q-coping'))?.note).toBeUndefined();
  });

  it('runs safely twice', async () => {
    await db.checkins.put(chk('a'));
    await db.observations.put(obs('a', 'focus', 1));
    await db.issueTags.bulkPut([tag('a', 'focus', 'distracted'), tag('a', 'focus', 'off_task')]);
    await run();
    expect((await run()).tagsMoved).toBe(0);
    expect((await db.issueTags.toArray()).map((t) => t.tagId)).toEqual(['off_task']);
  });
});

describe('minor items', () => {
  it('gum or uniform alone saves a record but is not a Behaviour issue', () => {
    const r = buildIssue(T, { areas: {}, minor: { behaviour: ['gum'] } });
    expect(r.checkin.result).toBe('good');
    expect(r.observations.find((o) => o.categoryId === 'behaviour')).toMatchObject({ level: 0 });
    expect(r.tags).toMatchObject([{ areaId: 'behaviour', tagId: 'gum', minor: true }]);
    expect(summaryText(summarise(r.checkin, r.observations, r.tags))).toBe('All good · Minor: gum');
    // Same average and ranking as All good.
    const good = buildAllGood({ ...T, lessonId: 'L0', date: '2026-10-19' });
    expect(areaAverage([...good.observations, ...r.observations], 'behaviour')).toMatchObject({ meets: 2, total: 2 });
    expect(recentConcern({}, r.observations, [], [r.checkin], r.tags, '2026-10-20').value).toBe(0);
  });

  it('with a real Behaviour option it is a normal Behaviour issue', () => {
    const r = buildIssue(T, { areas: { behaviour: ['disruptive'] }, minor: { behaviour: ['uniform'] } });
    expect(r.checkin.result).toBe('issue');
    expect(r.observations.find((o) => o.categoryId === 'behaviour')).toMatchObject({ level: 1 });
    expect(summaryText(summarise(r.checkin, r.observations, r.tags))).toBe('Behaviour: disruptive · Minor: uniform');
  });

  it('counts minor items for the student page', () => {
    const tags = ['2026-10-01', '2026-10-08', '2026-10-15'].map((date, i) => buildIssue({ ...T, date, lessonId: `L${i}` }, { areas: {}, minor: { behaviour: ['uniform'] } }).tags[0]);
    expect(minorCounts(tags, '2026-10-20')).toEqual([{ label: 'Uniform', count: 3 }]);
    expect(minorCounts(tags, '2027-03-01')).toEqual([]);
  });
});

describe('Wellbeing', () => {
  it('All good never records it', () => {
    expect(buildAllGood(T).observations.some((o) => o.categoryId === 'wellbeing')).toBe(false);
    expect(buildIssue(T, { areas: { focus: [] } }).observations.some((o) => o.categoryId === 'wellbeing')).toBe(false);
  });

  it('ticking it saves a flag that counts in the ranking and shows on the card', () => {
    const r = buildIssue(T, { areas: { wellbeing: ['withdrawn'] }, note: 'Quiet today' });
    expect(r.checkin.result).toBe('issue');
    expect(r.observations.find((o) => o.categoryId === 'wellbeing')).toMatchObject({ level: 1, note: 'Quiet today' });
    expect(r.observations.filter((o) => o.categoryId !== 'wellbeing').every((o) => o.level === 0)).toBe(true);
    expect(recentConcern({}, r.observations, [], [r.checkin], r.tags, '2026-10-20').value).toBeGreaterThan(0);
    expect(wellbeingRecent(r.observations, '2026-10-21')).toBe(1);
    expect(wellbeingRecent(r.observations, '2026-12-01')).toBe(0);
  });

  it('is left out of de-identified exports', async () => {
    const c = await svc.createClass({ name: '8B' });
    const s = await svc.addStudent(c.id, { firstName: 'Ava', lastName: 'Test' });
    const l = await svc.openLesson(c.id);
    await svc.logIssue({ studentId: s.id, classId: c.id, date: today(), lessonId: l.id }, { areas: { wellbeing: ['upset'], focus: [] }, note: 'Private wellbeing note' });
    const plain = await buildSqlScript({ deidentify: false });
    expect(plain).toContain('q-wellbeing');
    expect(plain).toContain('Private wellbeing note');
    const de = await buildSqlScript({ deidentify: true });
    expect(de).not.toContain('|q-wellbeing');
    expect(de).not.toContain('|wellbeing|');
    expect(de).not.toContain('Private wellbeing note');
    const stripped = stripWellbeing(await db.observations.toArray(), await db.issueTags.toArray(), await db.checkins.toArray());
    expect(stripped.observations.some((o) => o.categoryId === 'wellbeing' || o.note)).toBe(false);
    expect(stripped.checkins[0].note).toBeUndefined();
  });
});

describe('issue screen', () => {
  it('saves straight from the swipe, with a note held onto one sub-option; swipe left saves nothing', async () => {
    expect(issueSwipe('issue', { behaviour: ['disruptive'] })).toBe('cancel');
    const r = buildIssue(T, { areas: { behaviour: ['disruptive', 'not_following'] }, subNotes: { 'behaviour|disruptive': 'Threw a pen' }, followUp: true });
    expect(r.tags.find((t) => t.tagId === 'disruptive')?.note).toBe('Threw a pen');
    expect(r.tags.find((t) => t.tagId === 'not_following')?.note).toBeUndefined();
    expect(r.checkin.followUp).toBe(true);
  });
});

describe('daily target', () => {
  it('shows the target card at the target, then a small message every 5 more if switched on', () => {
    const at = (count: number, extra = true, everyoneSeen = false) => milestoneAfter(count, 5, { extra, everyoneSeen });
    expect(at(4)).toBeNull();
    expect(at(5)).toEqual({ kind: 'target' });
    expect(at(6)).toBeNull();
    expect(at(10)).toEqual({ kind: 'extra', count: 10 });
    expect(at(15)).toEqual({ kind: 'extra', count: 15 });
    expect(at(10, false)).toBeNull();
    // Everyone present seen: "That's the whole class" instead.
    expect(at(5, true, true)).toBeNull();
  });
});

describe('swipe animation', () => {
  it('flies off with a tilt, or cross-fades for reduced motion or with the setting off', () => {
    expect(flyPlan('good', 'right', { animate: true, reduceMotion: false })).toMatchObject({ style: 'fly', ms: 250, rotate: 8, dx: 1, wash: 'good' });
    expect(flyPlan('issue', 'left', { animate: true, reduceMotion: false })).toMatchObject({ style: 'fly', rotate: -8, dx: -1, wash: 'issue' });
    expect(flyPlan('good', 'right', { animate: true, reduceMotion: true })).toMatchObject({ style: 'fade', ms: 100, wash: 'good' });
    expect(flyPlan('up', null, { animate: false, reduceMotion: false })).toMatchObject({ style: 'fade', wash: 'up' });
  });

  it('two quick swipes save both (saves never wait for the animation)', async () => {
    const c = await svc.createClass({ name: '8B' });
    const a = await svc.addStudent(c.id, { firstName: 'Ava', lastName: 'Test' });
    const b = await svc.addStudent(c.id, { firstName: 'Ben', lastName: 'Test' });
    const l = await svc.openLesson(c.id);
    const t = (id: string) => ({ studentId: id, classId: c.id, date: today(), lessonId: l.id });
    await Promise.all([svc.logAllGood(t(a.id)), svc.logIssue(t(b.id), { areas: { focus: ['off_task'] } })]);
    expect((await db.checkins.toArray()).map((x) => x.result).sort()).toEqual(['good', 'issue']);
  });
});

describe('cold call roll', () => {
  const names = ['Ava', 'Ben', 'Chloe', 'Dev', 'Eli'];
  it('always lands on the student chosen before it starts', () => {
    for (let seed = 0; seed < 20; seed++) {
      let x = seed / 20;
      const plan = planRoll(names, 'Chloe', { animate: true }, () => (x = (x * 9301 + 0.49297) % 1));
      expect(plan.reel[plan.landIndex]).toBe('Chloe');
      expect(rollResult(plan)).toBe('Chloe');
      expect(plan.total).toBe(2000);
      expect(plan.reel.length).toBeGreaterThan(plan.landIndex + 1);
    }
  });

  it('shows the student at once with no animation or reduced motion', () => {
    expect(planRoll(names, 'Dev', { animate: false }, Math.random)).toEqual({ reel: ['Dev'], landIndex: 0, total: 0 });
    expect(rollResult(planRoll(names, 'Dev', { animate: true, reduceMotion: true }, Math.random))).toBe('Dev');
  });
});
