import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { PulseDB, useDatabase, db, saveSettings } from '../src/db';
import * as svc from '../src/services';
import { loadDemoData } from '../src/demo';
import { buildExport, toBlob } from '../src/exporting';
import { splitRow } from '../src/sync/fields';
import { today } from '../src/lib/dates';
import { roomTemplate } from '../src/logic/rooms';
import { rankByNeed } from '../src/logic/need';
import { watchBoosted, watchRaise, watchReview } from '../src/logic/seatingData';
import { printableHtml, shortNames } from '../src/logic/seatingPrint';

let n = 0;
beforeEach(async () => {
  useDatabase(new PulseDB(`round7-${n++}`));
  await db.open();
});

async function lessonClass(names = ['Ali Khan', 'Sam Reid', 'Mia Ford', 'Leo Park']) {
  const c = await svc.createClass({ name: '8B Humanities' });
  const students = [];
  for (const full of names) { const [firstName, lastName] = full.split(' '); students.push(await svc.addStudent(c.id, { firstName, lastName })); }
  const lesson = await svc.openLesson(c.id);
  const t = (id: string) => ({ studentId: id, classId: c.id, date: today(), lessonId: lesson.id });
  return { c, students, lesson, t };
}

describe('Round 7: relationships from check-ins', () => {
  it('"With who?" saves unconfirmed keep-apart signals; undo removes them', async () => {
    const { students: [ali, sam], t } = await lessonClass();
    const r = await svc.logIssue(t(ali.id), { areas: { behaviour: ['peer_interactions'] } });
    await svc.logRelationshipSignals(t(ali.id), [sam.id], 'keepApart');
    const rows = await db.relationships.toArray();
    expect(rows).toMatchObject([{ studentA: ali.id, studentB: sam.id, type: 'keepApart', source: 'checkin', confirmed: false }]);
    await svc.undoCheckin(r.checkin.id);
    expect(await db.relationships.count()).toBe(0);
  });

  it('Wellbeing → friendship issues never creates a keep-apart', async () => {
    const { students: [, , mia], t } = await lessonClass();
    await svc.logIssue(t(mia.id), { areas: { wellbeing: ['friendship'] }, note: 'Left out at lunch' });
    expect(await db.relationships.count()).toBe(0);
  });

  it('"Never suggest" is stored and stays', async () => {
    const { c, students: [ali, sam] } = await lessonClass();
    await svc.muteSuggestion(c.id, { a: ali.id, b: sam.id, type: 'keepApart' }, 'never');
    expect((await db.relationships.toArray())[0]).toMatchObject({ muted: 'never', confirmed: false });
  });
});

describe('Round 7: seat watch', () => {
  it('accepting an "alone" warning adds the student to the watch; "Not settled" creates Review seat', async () => {
    const { c, students: [ali, sam, mia], t } = await lessonClass();
    const room = roomTemplate('pairs', 4);
    const seats = Object.fromEntries(Object.keys(room.cells).filter((i) => room.cells[Number(i)].k === 'desk').slice(0, 3).map((seat, i) => [seat, { studentId: [ali, sam, mia][i].id }]));
    await svc.saveSeatingPlan({ classId: c.id, room, seats }, [{ studentId: mia.id, reason: 'alone' }]);
    let m = (await db.students.get(mia.id))!;
    expect(m.seatWatch).toMatchObject({ reason: 'alone', table: expect.stringMatching(/^Table \d/) });
    // Boosted in the ranking for the next lessons: the card asks "How are they going there?".
    const lessons = await db.lessons.toArray();
    expect(watchBoosted(m.seatWatch, lessons)).toBe(true);
    const ctx = (await svc.loadLessonContext(c.id))!;
    const rows = rankByNeed({ ...ctx, lessonId: ctx.lesson!.id, today: today(), seatWatch: new Set([mia.id]) });
    expect(rows.find((r) => r.studentId === mia.id)!.reasons).toContain('New seat: check how they are going');
    await svc.answerSeatWatch(mia.id, false, t(mia.id));
    m = (await db.students.get(mia.id))!;
    expect(watchReview(m.seatWatch)).toBe(true);
    expect(watchRaise(m.seatWatch)).toBe(false);
    // A new plan ends the old watch.
    await svc.saveSeatingPlan({ classId: c.id, room, seats });
    expect((await db.students.get(mia.id))!.seatWatch?.ended).toBe(true);
    expect((await db.seatingPlans.toArray()).filter((p) => p.active)).toHaveLength(1);
    expect(await db.seatingPlans.count()).toBe(2);
  });
});

describe('Round 7: privacy', () => {
  it('support levels are deleted when a student is archived', async () => {
    const { students: [ali] } = await lessonClass();
    await svc.setSupport(ali.id, 'more');
    expect((await db.students.get(ali.id))!.support?.level).toBe('more');
    await svc.updateStudent(ali.id, { archived: true });
    expect((await db.students.get(ali.id))!.support).toBeUndefined();
  });

  it('seating needs, support, balance tags and relationship details are encrypted when synced', () => {
    const s = splitRow('students', { id: 'x', classId: 'c', firstName: 'Ali', seatingNeeds: ['front'], support: { level: 'more' }, balanceTags: ['t1'], seatWatch: { reason: 'left_out' } });
    expect(s.data).not.toHaveProperty('seatingNeeds');
    expect(Object.keys(s.secret!)).toEqual(expect.arrayContaining(['seatingNeeds', 'support', 'balanceTags', 'seatWatch']));
    const c = splitRow('classes', { id: 'c', name: '8B', balanceTags: [{ id: 't1', name: 'EAL' }] });
    expect(c.secret).toHaveProperty('balanceTags');
    const r = splitRow('relationships', { id: 'r', classId: 'c', studentA: 'a', studentB: 'b', type: 'keepApart', strength: 2, note: 'Conflict' });
    expect(Object.keys(r.secret!)).toEqual(expect.arrayContaining(['type', 'strength', 'note']));
  });

  it('exports (including de-identified) never contain seating needs, levels, tags or relationships', async () => {
    await loadDemoData();
    await saveSettings({ seatingSupport: true });
    const classIds = (await db.classes.toArray()).map((c) => c.id);
    const categoryIds = (await db.categories.toArray()).map((c) => c.id);
    for (const deidentify of [false, true]) {
      const r = await buildExport({ kind: 'class', classIds, categoryIds, includeNotes: true, includeIcp: false, deidentify, hideClassNames: false });
      const blob = await toBlob(r.sheets, 'xlsx');
      const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' });
      const text = wb.SheetNames.map((s) => XLSX.utils.sheet_to_csv(wb.Sheets[s])).join('\n');
      expect(text).not.toMatch(/EAL|New this term|left.handed|near_door|Needs more support|Ready for extension|keepApart|worksWell|Ongoing conflict since Term 2/);
    }
  });

  it('the printable plan has names only', async () => {
    await loadDemoData();
    const plan = (await db.seatingPlans.toArray()).find((p) => p.active)!;
    const students = await db.students.where('classId').equals(plan.classId).toArray();
    // The same page Export saves (saving a file needs a browser).
    const html = printableHtml(plan, shortNames(students), '8B Humanities', 'From 3 November 2026');
    expect(html).toContain('Priya');
    expect(html).not.toMatch(/Front|seating need|EAL|support|Ongoing conflict|keep apart/i);
  });
});
