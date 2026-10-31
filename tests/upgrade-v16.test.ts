// Going live with rounds 5–9 together: a phone on the live database (v11) upgrades to v16 and keeps its data.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { PulseDB, useDatabase } from '../src/db';
import * as svc from '../src/services';

/** The live app's database as it was at v11 (every table up to round 4). */
function liveV11(name: string) {
  const d = new Dexie(name);
  d.version(11).stores({
    classes: 'id',
    students: 'id, classId',
    checkins: 'id, studentId, classId, date, [classId+date]',
    observations: 'id, studentId, classId, checkinId, date, questionId',
    plans: 'id, date, classId',
    questions: 'id',
    categories: 'id',
    notes: 'id, studentId',
    icpAdjustments: 'id, studentId',
    icpChecks: 'id, adjustmentId, studentId, date',
    timetable: 'id, classId',
    kv: 'key',
    files: 'id, createdAt',
    outbox: '[tbl+id], at',
    syncState: 'key',
    checkouts: 'id, classId, date',
    evidence: 'id, studentId, adjustmentId, checkinId, date',
    issueTags: 'id, studentId, checkinId, classId, date',
    homework: 'id, studentId, classId, lessonId, date',
    lessons: 'id, classId, date, status',
    coldCalls: 'id, studentId, classId, lessonId, date',
    journal: 'id, classId, date, lessonId',
    assessments: 'id, classId',
    assessmentChecks: 'id, assessmentId, studentId, classId, date'
  });
  return d;
}

describe('Upgrade from the live database (v11) to v16', () => {
  it('keeps classes, students, check-ins, lessons, cold calls, notes and the journal, and adds the new tables', async () => {
    const name = 'upgrade-v11-v16';
    const old = liveV11(name);
    await old.open();
    await old.table('classes').add({ id: 'c1', name: '8B History', archived: false, createdAt: 1 });
    await old.table('students').add({ id: 's1', classId: 'c1', firstName: 'Mia', lastName: 'Nguyen', archived: false, createdAt: 1 });
    await old.table('lessons').add({ id: 'l1', classId: 'c1', date: '2026-10-20', openedAt: 1, status: 'closed', createdAt: 1 });
    await old.table('checkins').add({ id: 'k1', studentId: 's1', classId: 'c1', date: '2026-10-20', lessonId: 'l1', status: 'good', createdAt: 1 });
    await old.table('coldCalls').add({ id: 'cc1', lessonId: 'l1', classId: 'c1', studentId: 's1', date: '2026-10-20', result: 'good', createdAt: 1 });
    await old.table('notes').add({ id: 'n1', studentId: 's1', date: '2026-10-20', text: 'Fictional note', createdAt: 1 });
    await old.table('journal').add({ id: 'j1', classId: 'c1', date: '2026-10-20', text: 'Fictional journal', createdAt: 1 });
    await old.table('kv').put({ key: 'settings', value: { onboarded: true } });
    old.close();

    const db = new PulseDB(name);
    useDatabase(db);
    await db.open();
    expect(db.verno).toBe(16);
    expect(await db.classes.get('c1')).toMatchObject({ name: '8B History' });
    expect(await db.students.get('s1')).toMatchObject({ firstName: 'Mia' });
    expect(await db.checkins.get('k1')).toMatchObject({ status: 'good' });
    expect(await db.lessons.get('l1')).toMatchObject({ status: 'closed' });
    expect(await db.coldCalls.get('cc1')).toMatchObject({ result: 'good' });
    expect(await db.notes.get('n1')).toMatchObject({ text: 'Fictional note' });
    expect(await db.journal.get('j1')).toMatchObject({ text: 'Fictional journal' });
    // The new tables from rounds 5–9 are there and empty.
    for (const t of [db.brainBreaks, db.customBreaks, db.reliefPasses, db.relationships, db.rooms, db.seatingPlans, db.incidents, db.followUps, db.dayCloses, db.brainDumps, db.cfuChecks, db.cfuResults, db.absences]) {
      expect(await t.count()).toBe(0);
    }
    // ...and work with the old data.
    await svc.markAbsent('c1', 's1', '2026-10-20', 'blitz');
    expect(await db.absences.count()).toBe(1);
    db.close();
  });
});
