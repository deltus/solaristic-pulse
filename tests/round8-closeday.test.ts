// Round 8, parts B and C: Close day and Brain dump.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PulseDB, useDatabase, db } from '../src/db';
import * as svc from '../src/services';
import { addDays, setDayOffset, today } from '../src/lib/dates';
import { findStudents, sortDump, splitChunks } from '../src/logic/braindump';
import { closeDayDue, dayNotClosed } from '../src/logic/closeday';
import { at } from '../src/logic/incidents';
import { ENCRYPTED } from '../src/sync/fields';
import { buildExport } from '../src/exporting';
import type { Lesson, Student } from '../src/types';

let n = 0;
beforeEach(async () => {
  setDayOffset(0);
  const instance = new PulseDB(`round8-b-${++n}`);
  useDatabase(instance);
  await instance.open();
});
afterEach(() => setDayOffset(0));

async function setup() {
  const a = await svc.createClass({ name: '8B History' });
  const b = await svc.createClass({ name: '9C Geography' });
  const mia = await svc.addStudent(a.id, { firstName: 'Mia', lastName: 'Nguyen' });
  const mia2 = await svc.addStudent(b.id, { firstName: 'Mia', lastName: 'Brown' });
  const cal = await svc.addStudent(a.id, { firstName: 'Callum', lastName: 'Kowalski', preferredName: 'Cal' });
  const leo = await svc.addStudent(b.id, { firstName: 'Leo', lastName: 'Okafor' });
  return { a, b, mia, mia2, cal, leo };
}

describe('Brain dump: finding names', () => {
  it('splits into chunks', () => {
    expect(splitChunks('Cal was great today. Mia forgot her book!\nCall Leo\'s mum; ask about camp')).toEqual(['Cal was great today.', 'Mia forgot her book!', "Call Leo's mum", 'ask about camp']);
  });

  it('matches first, preferred and last names, and asks when a name fits two students', async () => {
    const { a, mia, mia2, cal, leo } = await setup();
    const all = await db.students.toArray();
    expect(findStudents('Cal was great today', all).studentIds).toEqual([cal.id]);        // preferred
    expect(findStudents('Callum helped out', all).studentIds).toEqual([cal.id]);          // first
    expect(findStudents('Spoke to Okafor after class', all).studentIds).toEqual([leo.id]); // last
    expect(findStudents("Call Leo's mum", all).studentIds).toEqual([leo.id]);             // possessive
    const amb = findStudents('Mia forgot her book', all);
    expect(amb.studentIds).toEqual([]);
    expect(amb.ambiguous).toEqual([{ token: 'Mia', options: expect.arrayContaining([mia.id, mia2.id]) }]);
    expect(findStudents('Mia Brown forgot her book', all).studentIds).toEqual([mia2.id]);  // full name settles it
    expect(findStudents('Mia forgot her book', all, a.id).studentIds).toEqual([mia.id]);   // started from 8B's page
    expect(findStudents('we will leo the plan', all).studentIds).toEqual([]);              // lower case words never match
    expect(findStudents('Cal and Leo argued', all).studentIds.sort()).toEqual([cal.id, leo.id].sort());
  });

  it('creates the right record for each chip, saves leftovers to the journal, and deletes the text after 30 days', async () => {
    const { a, mia, cal, leo } = await setup();
    const text = 'Cal was brilliant in the debate. Mia Nguyen seemed upset at lunch. Leo needs a reminder about his excursion form. Call Mia Nguyen\'s dad about missed homework. Cal helped set up. Photocopy worksheets for Monday. Leo was off task.';
    const d = await svc.saveBrainDump(text, a.id);
    const chunks = sortDump(text, await db.students.toArray(), a.id);
    expect(chunks).toHaveLength(7);
    const choice = (i: number, action?: svc.DumpAction) => ({ text: chunks[i].text, studentIds: chunks[i].studentIds, action });
    const counts = await svc.applyDumpChunks(d.id, [choice(0, 'positive'), choice(1, 'wellbeing'), choice(2, 'followup'), choice(3, 'home'), choice(4, 'note'), choice(5), choice(6, 'skip')], a.id);
    expect(counts).toMatchObject({ positive: 1, wellbeing: 1, followup: 1, home: 1, note: 1, journal: 2 });

    const notes = await db.notes.toArray();
    expect(notes.find((x) => x.studentId === cal.id && x.tags?.includes('positive'))?.text).toContain('brilliant');
    expect(notes.find((x) => x.studentId === cal.id && !x.tags)?.text).toContain('helped set up');
    const wb = (await db.observations.where('studentId').equals(mia.id).toArray());
    expect(wb.map((o) => o.categoryId)).toEqual(['wellbeing']);
    expect(wb[0].note).toContain('upset at lunch');
    const tasks = await db.followUps.toArray();
    expect(tasks.find((t) => t.studentId === leo.id)).toMatchObject({ kind: 'custom', about: expect.stringContaining('excursion form') });
    expect(tasks.find((t) => t.studentId === mia.id)).toMatchObject({ kind: 'home', draft: 'home', title: 'Contact home: Mia' });
    const journal = await db.journal.toArray();
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ classId: a.id, tags: ['Brain dump'] });
    expect(journal[0].text).toContain('Photocopy worksheets');
    expect(journal[0].text).toContain('Leo was off task');
    expect((await db.brainDumps.get(d.id))!.sortedAt).toBeTruthy();

    expect(await svc.purgeBrainDumps(Date.now() + 29 * 86_400_000)).toBe(0);
    expect(await svc.purgeBrainDumps(Date.now() + 30 * 86_400_000 + 1000)).toBe(1);
    expect(await db.brainDumps.count()).toBe(0);
  });

  it('Brain dump text is encrypted when synced and never exported', async () => {
    expect(ENCRYPTED.brainDumps).toEqual(['text']);
    const { a } = await setup();
    await svc.saveBrainDump('SECRET-DUMP-TEXT', a.id);
    const r = await buildExport({ kind: 'class', classIds: [a.id], categoryIds: [], includeNotes: true, includeIcp: true, deidentify: true, hideClassNames: false });
    expect(JSON.stringify(r.sheets)).not.toContain('SECRET-DUMP-TEXT');
  });
});

describe('Close day', () => {
  it('lists open lessons, today\'s events, unlodged reports, open follow-ups and unsent drafts across all classes', async () => {
    const { a, b, mia, leo } = await setup();
    const la = await svc.openLesson(a.id);
    const lb = await svc.openLesson(b.id);
    await svc.closeLesson(lb.id, { happy: 'yes', planDone: 'yes' } as never);
    await svc.logIssue({ studentId: mia.id, classId: a.id, date: today(), lessonId: la.id }, { areas: { focus: [] } });
    await svc.logIssue({ studentId: leo.id, classId: b.id, date: today(), lessonId: lb.id }, { areas: { behaviour: [] } });
    const i = await svc.saveIncident({ studentId: leo.id, classId: b.id, date: today(), time: '11:00', areas: {}, what: 'x', where: 'Classroom', others: [], actions: [], context: [] });
    const [lodge, home] = await svc.addIncidentTasks(i, [{ kind: 'lodge', due: at(today(), '16:00') }, { kind: 'home', due: at(today(), '16:30') }]);
    const later = await svc.addFollowUp({ kind: 'custom', title: 'Next week thing', due: Date.now() + 5 * 86_400_000 });
    await svc.addUrgentFollowUp({ studentId: mia.id, classId: a.id, date: today() });

    const day = await svc.loadDay(today());
    expect(day.openLessons.map((l) => l.id)).toEqual([la.id]);
    expect(day.issues.map((c) => c.classId).sort()).toEqual([a.id, b.id].sort());
    expect(day.incidentsToday.map((x) => x.id)).toEqual([i.id]);
    expect(day.unlodged.map((x) => x.id)).toEqual([i.id]);
    expect(day.tasksDue.map((t) => t.id)).toContain(lodge.id);
    expect(day.tasksDue.map((t) => t.id)).not.toContain(later.id);
    expect(day.drafts.map((t) => t.id)).toEqual([home.id]);
    expect(day.urgentToday).toHaveLength(1);

    // "Move to tomorrow" reschedules the task.
    await svc.moveFollowUpToTomorrow(lodge.id);
    expect((await db.followUps.get(lodge.id))!.dueAt).toBe(at(addDays(today(), 1), '16:00'));
    expect((await svc.loadDay(today())).tasksDue.map((t) => t.id)).not.toContain(lodge.id);

    await svc.closeDay(today(), { reflection: 'good', counts: { lodged: 1 } });
    expect(await db.dayCloses.get(today())).toMatchObject({ reflection: 'good', counts: { lodged: 1 } });
  });

  it('"Day not closed" shows the next morning, and Close day is offered from 3 pm or after the last lesson', async () => {
    const d = today();
    const lesson = (date: string, classId: string, status: Lesson['status'] = 'closed') => ({ id: `${date}${classId}`, classId, date, openedAt: 0, status, createdAt: 0 }) as Lesson;
    expect(dayNotClosed(d, [lesson(addDays(d, -1), 'a')], [])).toBe(addDays(d, -1));
    expect(dayNotClosed(d, [lesson(addDays(d, -1), 'a')], [{ id: addDays(d, -1), date: addDays(d, -1), counts: {}, closedAt: 0 }])).toBeNull();
    expect(dayNotClosed(d, [], [])).toBeNull();

    const wd = ((new Date().getDay() + 6) % 7) + 1;
    const tt = [{ id: 't1', classId: 'a', day: wd, start: '09:00', end: '10:00' }, { id: 't2', classId: 'b', day: wd, start: '11:00', end: '12:00' }] as never;
    expect(closeDayDue({ date: d, nowMin: 12 * 60, timetable: tt, lessons: [lesson(d, 'a')] })).toBe(false);
    expect(closeDayDue({ date: d, nowMin: 12 * 60, timetable: tt, lessons: [lesson(d, 'a'), lesson(d, 'b')] })).toBe(true);
    expect(closeDayDue({ date: d, nowMin: 15 * 60, timetable: tt, lessons: [lesson(d, 'a', 'open')] })).toBe(true);
    expect(closeDayDue({ date: d, nowMin: 15 * 60, timetable: tt, lessons: [] })).toBe(false);
    expect(closeDayDue({ date: d, nowMin: 16 * 60, timetable: tt, lessons: [lesson(d, 'a')], close: { id: d, date: d, counts: {}, closedAt: 0 } })).toBe(false);
  });

  it('with +1 day, yesterday shows as not closed', async () => {
    const { a } = await setup();
    await svc.openLesson(a.id);
    setDayOffset(1);
    const lessons = await db.lessons.toArray();
    expect(dayNotClosed(today(), lessons, await db.dayCloses.toArray())).toBe(addDays(today(), -1));
  });
});

// Keep the Student type import used (fixtures above are built through services).
export type _S = Student;
