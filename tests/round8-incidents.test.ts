// Round 8, part A: "Follow up urgently", serious incidents, follow-up tasks, report pack and email drafts.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PulseDB, useDatabase, db } from '../src/db';
import * as svc from '../src/services';
import { addDays, setDayOffset, today } from '../src/lib/dates';
import { rankByNeed } from '../src/logic/need';
import { at, dueFrom, followUpReminders, homeDraft, incidentContext, moveToTomorrow, openTodayText, reportPack, staffDraft, urgentIds, withoutOtherNames } from '../src/logic/incidents';
import { applyReliefEntry } from '../src/logic/relief';
import { ENCRYPTED } from '../src/sync/fields';
import { buildExport } from '../src/exporting';
import { buildSqlScript } from '../src/sqlExport';
import type { Incident } from '../src/types';

let n = 0;
beforeEach(async () => {
  setDayOffset(0);
  const instance = new PulseDB(`round8-a-${++n}`);
  useDatabase(instance);
  await instance.open();
});
afterEach(() => setDayOffset(0));

async function setup() {
  const c = await svc.createClass({ name: '8B History', subject: 'History', yearLevel: 'Year 8' });
  const other = await svc.createClass({ name: '9C Geography' });
  const ava = await svc.addStudent(c.id, { firstName: 'Ava', lastName: 'Example' });
  const ben = await svc.addStudent(c.id, { firstName: 'Ben', lastName: 'Sample' });
  const cal = await svc.addStudent(c.id, { firstName: 'Callum', lastName: 'Test', preferredName: 'Cal' });
  const zed = await svc.addStudent(other.id, { firstName: 'Zed', lastName: 'Elsewhere' });
  return { c, other, ava, ben, cal, zed };
}

const incident = (p: Partial<Incident> & Pick<Incident, 'studentId' | 'classId'>): svc.IncidentInput => ({
  date: today(), time: '10:42', areas: { behaviour: ['disruptive'] }, what: 'Threw a chair near Ben and Cal Test.', where: 'Classroom', others: [], actions: ['removed', 'separated'], context: [], ...p
});

describe('Follow up urgently', () => {
  it('creates a task due at the end of today, and puts the student top of tomorrow\'s queue', async () => {
    const { c, ava, ben } = await setup();
    const l = await svc.openLesson(c.id);
    const r = await svc.logIssue({ studentId: ben.id, classId: c.id, date: today(), lessonId: l.id }, { areas: { focus: ['off_task'] }, followUp: true });
    expect(r.checkin.followUp).toBe(true); // plain issues still get the normal follow-up next lesson
    const t = await svc.addUrgentFollowUp({ studentId: ben.id, classId: c.id, date: today() });
    expect(t).toMatchObject({ kind: 'urgent', status: 'todo', studentId: ben.id });
    expect(t.dueAt).toBeGreaterThanOrEqual(Math.min(at(today(), '17:00'), Date.now() + 15 * 60_000));
    expect(new Date(t.dueAt).toDateString()).toBe(new Date().toDateString());

    // Today: no change to the order. Tomorrow: Ben is first, whatever the need scores say.
    expect(urgentIds([t], [], today()).size).toBe(0);
    setDayOffset(1);
    const ctx = (await svc.loadLessonContext(c.id))!;
    const urgent = urgentIds(ctx.followUps, ctx.checkins, today());
    expect([...urgent]).toEqual([ben.id]);
    const ranked = rankByNeed({ ...ctx, lessonId: 'next', today: today(), urgent });
    expect(ranked[0]).toMatchObject({ studentId: ben.id, urgent: true });
    expect(ranked[0].reasons[0]).toBe('Urgent follow-up');
    expect(ranked.some((x) => x.studentId === ava.id && !x.urgent)).toBe(true);

    // Seen again after that day: no longer pushed up.
    expect(urgentIds([t], [{ studentId: ben.id, date: addDays(today(), 1), status: 'complete' }], addDays(today(), 2)).size).toBe(0);
  });
});

describe('incident context', () => {
  it('covers the last 4 weeks for this student and class only; wellbeing and ICP titles start unticked', async () => {
    const { c, other, ava, ben, zed } = await setup();
    const l = await svc.openLesson(c.id);
    const d = today();
    await svc.logIssue({ studentId: ava.id, classId: c.id, date: d, lessonId: l.id }, { areas: { focus: ['off_task'] }, note: 'Kept talking' });
    await svc.logIssue({ studentId: ava.id, classId: c.id, date: addDays(d, -3), lessonId: 'older' }, { areas: { wellbeing: [] }, note: 'Upset about home' });
    await svc.logIssue({ studentId: ava.id, classId: c.id, date: addDays(d, -40), lessonId: 'ancient' }, { areas: { behaviour: [] }, note: 'Too old to include' });
    await svc.logIssue({ studentId: ben.id, classId: c.id, date: d, lessonId: l.id }, { areas: { behaviour: [] }, note: 'Ben only' });
    await svc.logIssue({ studentId: zed.id, classId: other.id, date: d, lessonId: 'x' }, { areas: { behaviour: [] }, note: 'Other class' });
    await svc.addNote(ava.id, 'Asked for help with essay');
    await svc.saveAdjustment({ studentId: ava.id, title: 'Extra time', details: '25%' });
    const start = (await svc.incidentStart(c.id, ava.id))!;
    const text = JSON.stringify(start.context);
    expect(text).toContain('Kept talking');
    expect(text).toContain('Asked for help with essay');
    for (const no of ['Too old to include', 'Ben only', 'Other class']) expect(text).not.toContain(no);
    const wb = start.context.find((x) => x.kind === 'wellbeing')!;
    expect(wb.text).toContain('Upset about home');
    expect(wb.include).toBe(false);
    expect(start.context.find((x) => x.kind === 'icp')).toMatchObject({ include: true, text: 'ICP adjustments in place' });
    expect(start.context.find((x) => x.kind === 'icpTitles')).toMatchObject({ include: false });
    expect(start.context.find((x) => x.kind === 'icp')!.text).not.toContain('Extra time');
  });

  it('includes the seat when there is an active seating plan', () => {
    const plan = { room: { rows: 1, cols: 2, cells: [{ k: 'desk' as const, t: 3 }, { k: 'desk' as const, t: 3 }] }, seats: { '0': { studentId: 's1' } }, active: true } as never;
    const items = incidentContext({ student: { id: 's1', classId: 'c' } as never, classId: 'c', date: today(), checkins: [], observations: [], tags: [], notes: [], followUps: [], adjustments: [], homework: [], assessmentChecks: [], seatingPlan: plan });
    expect(items.find((x) => x.kind === 'seat')?.text).toMatch(/Table 3/);
  });

  it('the report pack only shows what is ticked, and ICP details only if ticked', async () => {
    const { c, ava, ben, cal } = await setup();
    const i = await svc.saveIncident(incident({
      studentId: ava.id, classId: c.id, others: [ben.id],
      context: [
        { id: 'a', kind: 'issue', date: today(), text: 'Focus: off task', include: true },
        { id: 'w', kind: 'wellbeing', date: today(), text: 'Wellbeing: upset about home', include: false },
        { id: 'icp', kind: 'icp', text: 'ICP adjustments in place', include: true },
        { id: 'icpTitles', kind: 'icpTitles', text: 'ICP adjustments: Extra time', include: false }
      ]
    }));
    const students = [ava, ben, cal];
    const pack = reportPack(i, { student: ava, students, className: c.name, teacher: 'Ms Teacher' });
    expect(pack.text).toContain('Ava Example');
    expect(pack.text).toContain('Ben Sample'); // others involved are in the school report
    expect(pack.text).toContain('Focus: off task');
    expect(pack.text).toContain('ICP adjustments in place');
    expect(pack.text).not.toContain('upset about home');
    expect(pack.text).not.toContain('Extra time');
    expect(pack.text).toContain('Removed from class; Separated students');
    const ticked = { ...i, context: i.context.map((x) => (x.id === 'icpTitles' ? { ...x, include: true } : x)) };
    expect(reportPack(ticked, { student: ava, students, className: c.name }).text).toContain('Extra time');
  });
});

describe('email drafts', () => {
  it('the home email has no other students\' names, wellbeing notes, ICP details or past incidents', async () => {
    const { c, ava, ben, cal } = await setup();
    const i = await svc.saveIncident(incident({
      studentId: ava.id, classId: c.id, others: [ben.id, cal.id], what: 'Ava threw a chair near Ben and Cal Test, then argued with Sample.',
      context: [
        { id: 'w', kind: 'wellbeing', text: 'Wellbeing: upset about home', include: true },
        { id: 'icpTitles', kind: 'icpTitles', text: 'ICP adjustments: Extra time', include: true },
        { id: 'a', kind: 'issue', date: today(), text: 'Behaviour: disruptive ("earlier incident")', include: true }
      ]
    }));
    const students = [ava, ben, cal];
    const dr = homeDraft(i, { student: ava, students, className: c.name, teacher: 'Ms Teacher', school: 'Fictional College' });
    const all = `${dr.subject}\n${dr.body}`;
    for (const no of ['Ben', 'Sample', 'Cal', 'Callum', 'Test', 'upset about home', 'Extra time', 'ICP', 'earlier incident', 'Wellbeing']) expect(all, no).not.toContain(no);
    expect(all).toContain('Ava');
    expect(all).toContain('another student');
    expect(all).toContain('removed Ava from the class for a short time and separated the students involved');
    expect(all).toContain("I'd be happy to talk");
    expect(dr.body).toContain('Ms Teacher');
    // Staff email: facts plus the ticked context.
    const st = staffDraft(i, { student: ava, students, className: c.name, role: 'Year level coordinator' });
    expect(st.body).toContain('Year level coordinator');
    expect(st.body).toContain('earlier incident');
  });

  it('removes other names without touching the student\'s own', () => {
    const s = (id: string, firstName: string, lastName: string, preferredName?: string) => ({ id, classId: 'c', firstName, lastName, preferredName } as never);
    const students = [s('1', 'Mia', 'Nguyen'), s('2', 'Mia', 'Brown'), s('3', 'Leo', 'Kowalski')];
    expect(withoutOtherNames('Mia pushed Leo Kowalski and Mia Brown.', '1', students)).toBe('Mia pushed another student and another student.');
  });
});

describe('follow-up tasks', () => {
  it('due chips, reminders at the chosen times, and where tasks show', async () => {
    const { c, ava, ben } = await setup();
    const now = at(today(), '10:00');
    expect(dueFrom('hour', now)).toBe(now + 3600_000);
    expect(dueFrom('eod', now)).toBe(at(today(), '17:00'));
    expect(dueFrom('eod', at(today(), '18:00'))).toBe(at(today(), '18:00') + 3600_000);
    expect(dueFrom('morning', now)).toBe(at(addDays(today(), 1), '08:00'));
    expect(dueFrom('twoDays', now)).toBe(at(addDays(today(), 2), '08:00'));

    const i = await svc.saveIncident(incident({ studentId: ava.id, classId: c.id }));
    const tasks = await svc.addIncidentTasks(i, [{ kind: 'lodge', due: 'eod' }, { kind: 'home', due: Date.now() + 3600_000 }, { kind: 'staff', due: 'morning', role: 'Wellbeing' }]);
    expect(tasks.map((t) => t.kind)).toEqual(['lodge', 'home', 'staff']);
    expect(tasks[1]).toMatchObject({ draft: 'home', incidentId: i.id, title: 'Contact home: Ava' });
    expect(tasks[2]).toMatchObject({ draft: 'staff', role: 'Wellbeing', title: 'Inform Wellbeing about Ava' });

    const rem = followUpReminders(tasks, Date.now());
    const home = rem.find((r) => r.key.startsWith(`fu-${tasks[1].id}`))!;
    expect(home.at.getTime()).toBe(tasks[1].dueAt);
    expect(home.body).toBe('Contact home. Tap to open Radar.');
    for (const r of rem) expect(`${r.title} ${r.body}`).not.toContain('Ava');

    // Student page, class page and Home all read the same table.
    expect(await db.followUps.where('studentId').equals(ava.id).count()).toBe(3);
    expect((await svc.loadLessonContext(c.id))!.followUps).toHaveLength(3);
    await svc.addUrgentFollowUp({ studentId: ben.id, classId: c.id, date: today() });
    const all = await db.followUps.toArray();
    const dueToday = all.filter((t) => new Date(t.dueAt).toDateString() === new Date().toDateString()).length;
    expect(openTodayText(all, today())).toBe(`${dueToday} follow-up${dueToday === 1 ? '' : 's'} still open today`);

    await svc.setFollowUpStatus(tasks[0].id, 'done');
    await svc.markLodged(i.id);
    expect((await db.incidents.get(i.id))!.lodgedAt).toBeTruthy();
    expect(moveToTomorrow(tasks[1], Date.now())).toBeGreaterThanOrEqual(at(addDays(today(), 1), '08:00'));
  });

  it('marking lodged closes the lodge task; deleting a student deletes their incidents and tasks', async () => {
    const { c, ava } = await setup();
    const i = await svc.saveIncident(incident({ studentId: ava.id, classId: c.id }));
    const [lodge] = await svc.addIncidentTasks(i, [{ kind: 'lodge', due: 'eod' }]);
    await svc.markLodged(i.id);
    expect((await db.followUps.get(lodge.id))!.status).toBe('done');
    await svc.deleteStudentPermanently(ava.id);
    expect(await db.incidents.count()).toBe(0);
    expect(await db.followUps.count()).toBe(0);
  });
});

describe('privacy', () => {
  it('incidents and tasks are encrypted when synced', () => {
    expect(ENCRYPTED.incidents).toEqual(expect.arrayContaining(['what', 'others', 'witnesses', 'actions', 'context', 'areas', 'relief']));
    expect(ENCRYPTED.followUps).toEqual(expect.arrayContaining(['title', 'about', 'note']));
  });

  it('exports, de-identified or not, never include incidents or follow-ups', async () => {
    const { c, ava } = await setup();
    const i = await svc.saveIncident(incident({ studentId: ava.id, classId: c.id, what: 'SECRET-INCIDENT-TEXT' }));
    await svc.addIncidentTasks(i, [{ kind: 'home', due: 'eod' }]);
    for (const deidentify of [true, false]) {
      const r = await buildExport({ kind: 'class', classIds: [c.id], categoryIds: [], includeNotes: true, includeIcp: true, deidentify, hideClassNames: false });
      const json = JSON.stringify(r.sheets);
      expect(json).not.toContain('SECRET-INCIDENT-TEXT');
      expect(json).not.toContain('Contact home');
      expect(await buildSqlScript({ deidentify })).not.toContain('SECRET-INCIDENT-TEXT');
    }
  });

  it('a relief teacher\'s incident comes back tagged, with no compiled context', () => {
    const pass = { id: 'p1', classId: 'c', reliefName: 'Sam Relief' };
    const row = { id: 'i1', studentId: 's1', classId: 'c', others: ['s2'], what: 'x', context: [{ id: 'leak', kind: 'note', text: 'should not come back', include: true }] };
    const r = applyReliefEntry({ tbl: 'incidents', id: 'i1', body: { row } }, pass, { studentIds: new Set(['s1', 's2']) });
    expect(r).toMatchObject({ action: 'put', row: { relief: { passId: 'p1', name: 'Sam Relief' }, context: [] } });
    expect(applyReliefEntry({ tbl: 'incidents', id: 'i1', body: { row: { ...row, others: ['stranger'] } } }, pass, { studentIds: new Set(['s1', 's2']) })).toMatchObject({ action: 'skip' });
  });
});
