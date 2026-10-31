// Round 9: Check for understanding, and "absent for the rest of the day".
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PulseDB, useDatabase, db } from '../src/db';
import * as svc from '../src/services';
import { addDays, setDayOffset, today } from '../src/lib/dates';
import { intentionTopic, allOthersYes, contentHint, contentSignals, cycleMark, exitTicketDone, lessonScore, planTicketInsight, prefillAbsent, scoreSeries, suggestedQuestion, thumbsShares } from '../src/logic/cfu';
import { pickColdCall } from '../src/logic/coldcall';
import { supportSuggestion } from '../src/logic/seatingData';
import { studentTimeline } from '../src/logic/timeline';
import { earlierLessons } from '../src/logic/lessons';
import { ENCRYPTED, SYNCED_TABLES } from '../src/sync/fields';
import type { CfuResult, Lesson } from '../src/types';
import { dropStep, lastStep, pushStep, type PrevStep } from '../src/logic/previous';

let n = 0;
beforeEach(async () => {
  setDayOffset(0);
  const instance = new PulseDB(`round9-${++n}`);
  useDatabase(instance);
  await instance.open();
});
afterEach(() => setDayOffset(0));

async function setup() {
  const a = await svc.createClass({ name: '8B History' });
  const b = await svc.createClass({ name: '9C Geography' });
  const mia = await svc.addStudent(a.id, { firstName: 'Mia', lastName: 'Nguyen' });
  const cal = await svc.addStudent(a.id, { firstName: 'Callum', lastName: 'Kowalski' });
  const ana = await svc.addStudent(a.id, { firstName: 'Ana', lastName: 'Silva' });
  const leo = await svc.addStudent(b.id, { firstName: 'Leo', lastName: 'Okafor' });
  const lesson = await svc.openLesson(a.id, 'Explain why the Roman Empire split');
  return { a, b, mia, cal, ana, leo, lesson };
}
const ctxOf = async (classId: string) => (await svc.loadLessonContext(classId))!;

describe('Absent for the rest of the day', () => {
  it('Absent in Blitz carries to a later yes/no grid and cold call the same day; "All others: Yes" skips them', async () => {
    const { a, mia, cal, ana } = await setup();
    await svc.saveBlitz(a.id, today(), 'homework', { [mia.id]: 'absent', [cal.id]: 'yes' });
    const ctx = await ctxOf(a.id);
    expect([...ctx.absentNow]).toEqual([mia.id]);
    const ids = ctx.students.map((s) => s.id);
    // Yes/no grid starts with Mia as Absent; "All others: Yes" marks everyone else and leaves her absent.
    const grid = prefillAbsent({}, ctx.absentNow, ids);
    expect(grid).toEqual({ [mia.id]: 'absent' });
    const all = allOthersYes(grid, ids, new Set([mia.id]), 'got');
    expect(all).toEqual({ [mia.id]: 'absent', [cal.id]: 'got', [ana.id]: 'got' });
    // The cold call roll leaves her out, every time.
    for (let i = 0; i < 20; i++) expect(pickColdCall(ctx.students, [], ctx.absentNow, Math.random)?.id).not.toBe(mia.id);
  });

  it('entering a check-in for the student clears it', async () => {
    const { a, mia, lesson } = await setup();
    await svc.markAbsent(a.id, mia.id, today(), 'cfu');
    expect((await ctxOf(a.id)).absentNow.has(mia.id)).toBe(true);
    await svc.logAllGood({ studentId: mia.id, classId: a.id, date: today(), lessonId: lesson.id });
    expect((await ctxOf(a.id)).absentNow.has(mia.id)).toBe(false);
  });

  it('a note or a homework result also clears it, but another mode marking the class does not', async () => {
    const { a, mia, cal, lesson } = await setup();
    await svc.markAbsent(a.id, mia.id, today(), 'blitz');
    // A whole-class yes/no grid saved later doesn't silently mark her present.
    await svc.saveYesNo(lesson, { [cal.id]: 'got' });
    expect((await ctxOf(a.id)).absentNow.has(mia.id)).toBe(true);
    await svc.addNote(mia.id, 'Came in at morning tea');
    expect((await ctxOf(a.id)).absentNow.has(mia.id)).toBe(false);
    await svc.markAbsent(a.id, cal.id, today(), 'homework');
    await svc.saveHomeworkCheck({ studentId: cal.id, classId: a.id, date: today(), lessonId: lesson.id }, true);
    expect((await ctxOf(a.id)).absentNow.has(cal.id)).toBe(false);
  });

  it('resets the next day', async () => {
    const { a, mia } = await setup();
    await svc.markAbsent(a.id, mia.id, today(), 'blitz');
    setDayOffset(1);
    expect((await ctxOf(a.id)).absentNow.size).toBe(0);
  });

  it("absent in one class doesn't affect a different class", async () => {
    const { a, b, mia, leo } = await setup();
    await svc.markAbsent(a.id, mia.id, today(), 'blitz');
    expect((await ctxOf(b.id)).absentNow.size).toBe(0);
    await svc.markAbsent(b.id, leo.id, today(), 'checkin');
    expect([...(await ctxOf(a.id)).absentNow]).toEqual([mia.id]);
  });

  it('"Not here" in the check-in marks it; undo lifts it; "Here now" brings them back to the queue', async () => {
    const { a, mia, lesson } = await setup();
    const t = { studentId: mia.id, classId: a.id, date: today(), lessonId: lesson.id };
    const id = await svc.markNotHere(t);
    expect((await ctxOf(a.id)).absentNow.has(mia.id)).toBe(true);
    await svc.undoNotHere(t, id);
    expect((await ctxOf(a.id)).absentNow.has(mia.id)).toBe(false);
    expect(await db.checkins.get(id)).toBeUndefined();

    await svc.markNotHere(t);
    await svc.markHereNow(a.id, mia.id, today());
    const ctx = await ctxOf(a.id);
    expect(ctx.absentNow.has(mia.id)).toBe(false);
    expect(ctx.checkins.filter((c) => c.studentId === mia.id)).toEqual([]);
  });

  it('"Arrived late" clears it and saves a minor note', async () => {
    const { a, mia } = await setup();
    await svc.markAbsent(a.id, mia.id, today(), 'cfu');
    await svc.markArrivedLate(a.id, mia.id, today());
    expect((await ctxOf(a.id)).absentNow.has(mia.id)).toBe(false);
    const notes = await db.notes.where('studentId').equals(mia.id).toArray();
    expect(notes.map((x) => [x.text, x.tags])).toEqual([['Arrived late', ['late', 'minor']]]);
  });

  it('an absent swipe on a ticket marks it, and its undo lifts it', async () => {
    const { a, mia, lesson } = await setup();
    const check = await svc.startTicket(lesson, 'exit', 'What did we learn?');
    const r = await svc.recordTicket(check, mia.id, 'absent');
    expect((await ctxOf(a.id)).absentNow.has(mia.id)).toBe(true);
    await svc.undoTicketResult(r);
    expect((await ctxOf(a.id)).absentNow.has(mia.id)).toBe(false);
  });
});

describe('Check for understanding', () => {
  it('thumbs check saves counts only, with no student records', async () => {
    const { a, lesson } = await setup();
    await svc.saveThumbs(lesson, { up: 18, mid: 6, down: 2 });
    const checks = await db.cfuChecks.where('classId').equals(a.id).toArray();
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ kind: 'thumbs', counts: { up: 18, mid: 6, down: 2 }, lessonId: lesson.id });
    expect(await db.cfuResults.count()).toBe(0);
    expect(thumbsShares({ up: 18, mid: 6, down: 2 })).toEqual({ total: 26, up: 69, mid: 23, down: 8 });
    expect(lessonScore(lesson.id, checks, [])).toBe(69);
  });

  it('yes/no grid: a tap cycles Yes, Not yet, unchecked; "All others: Yes" works; results save per student', async () => {
    expect(cycleMark(undefined)).toBe('got');
    expect(cycleMark('got')).toBe('notyet');
    expect(cycleMark('notyet')).toBeUndefined();
    const { mia, cal, ana, lesson } = await setup();
    const marks = allOthersYes({ [mia.id]: 'notyet' as const }, [mia.id, cal.id, ana.id], new Set(), 'got' as const);
    expect(marks).toEqual({ [mia.id]: 'notyet', [cal.id]: 'got', [ana.id]: 'got' });
    await svc.saveYesNo(lesson, marks);
    const rs = await db.cfuResults.toArray();
    expect(rs.map((r) => [r.studentId, r.result, r.kind]).sort()).toEqual([[ana.id, 'got', 'yesno'], [cal.id, 'got', 'yesno'], [mia.id, 'notyet', 'yesno']].sort());
    expect(lessonScore(lesson.id, [], rs)).toBe(67);
  });

  it('tickets save per student and feed the content signal', async () => {
    const { a, mia, cal, lesson } = await setup();
    const check = await svc.startTicket(lesson, 'exit', 'In one sentence, what did we learn?');
    await svc.recordTicket(check, mia.id, 'notyet', ['misconception']);
    await svc.recordTicket(check, cal.id, 'partly');
    const rs = await db.cfuResults.toArray();
    expect(rs.find((r) => r.studentId === mia.id)).toMatchObject({ result: 'notyet', tags: ['misconception'], kind: 'exit' });
    // Another "not yet" on a yes/no and a struggled cold call: Coping → Content is suggested.
    await svc.saveYesNo(lesson, { [mia.id]: 'notyet' });
    await svc.logColdCall(lesson, mia.id, 'struggled');
    const ctx = await ctxOf(a.id);
    const sig = contentSignals(mia.id, ctx.cfuResults, ctx.coldCalls, today());
    expect(sig).toEqual({ notYet: 2, struggled: 1, total: 3 });
    expect(contentHint(sig)).toBe('Suggested: 2 "not yet" and 1 struggled cold call recently');
    expect(contentHint(contentSignals(cal.id, ctx.cfuResults, ctx.coldCalls, today()))).toBeNull();
    // ...and the "support right now" suggestion.
    expect(supportSuggestion(mia.id, ctx.tags, ctx.coldCalls, today(), ctx.assessmentChecks, ctx.cfuResults)).toContain('3 content signals');
    expect(supportSuggestion(mia.id, ctx.tags, ctx.coldCalls, today(), ctx.assessmentChecks, [])).toBeNull();
  });

  it("entry tickets use the previous lesson's intention; exit tickets this lesson's", async () => {
    const { a } = await setup();
    const yesterday = addDays(today(), -1);
    const prev: Lesson = { id: 'prev', classId: a.id, date: yesterday, openedAt: Date.now() - 86_400_000, closedAt: Date.now() - 83_000_000, status: 'closed', intention: 'Describe the fall of Rome.', createdAt: Date.now() - 86_400_000 };
    await db.lessons.add(prev);
    const ctx = await ctxOf(a.id);
    const before = earlierLessons(ctx.lessons, a.id, ctx.lesson)[0];
    expect(before.id).toBe('prev');
    expect(suggestedQuestion('entry', ctx.lesson!, before)).toBe('In one sentence, what did we learn about the fall of Rome?');
    expect(suggestedQuestion('exit', ctx.lesson!, before)).toBe('In one sentence, what did we learn about why the Roman Empire split?');
    expect(intentionTopic('We are learning to explain how volcanoes erupt.')).toBe('how volcanoes erupt');
    expect(intentionTopic('Fractions of amounts')).toBe('fractions of amounts');
    expect(intentionTopic('Use')).toBe('use');
    expect(suggestedQuestion('entry', ctx.lesson!, undefined)).toBe('In one sentence, what did we learn last lesson?');
    const check = await svc.startTicket(ctx.lesson!, 'entry', 'Q', before.id);
    expect(check).toMatchObject({ kind: 'entry', aboutLessonId: 'prev' });
  });

  it('Close lesson offers "Run an exit ticket?" until one is done (an empty one left behind is removed)', async () => {
    const { a, mia, lesson } = await setup();
    expect(exitTicketDone((await ctxOf(a.id)).cfuChecks, lesson.id)).toBe(false);
    const empty = await svc.startTicket(lesson, 'exit', 'Q');
    await svc.dropEmptyTicket(empty.id);
    expect(exitTicketDone((await ctxOf(a.id)).cfuChecks, lesson.id)).toBe(false);
    const check = await svc.startTicket(lesson, 'exit', 'Q');
    await svc.recordTicket(check, mia.id, 'got');
    await svc.dropEmptyTicket(check.id);
    expect(exitTicketDone((await ctxOf(a.id)).cfuChecks, lesson.id)).toBe(true);
    // An entry ticket doesn't count as an exit ticket.
    const other = await svc.openLesson((await setupOther()).id);
    await svc.startTicket(other, 'entry', 'Q');
    expect(exitTicketDone(await db.cfuChecks.toArray(), other.id)).toBe(false);
  });

  it("the lesson's understanding score shows in the timeline and the class graph", async () => {
    const { a, mia, cal, lesson } = await setup();
    const check = await svc.startTicket(lesson, 'exit', 'Q');
    await svc.recordTicket(check, mia.id, 'notyet', ['incomplete']);
    await svc.recordTicket(check, cal.id, 'got');
    const ctx = await ctxOf(a.id);
    expect(lessonScore(lesson.id, ctx.cfuChecks, ctx.cfuResults)).toBe(50);
    const row = studentTimeline({ ...ctx, studentId: mia.id })[0];
    expect(row.understanding).toBe('Exit ticket: not yet (incomplete)');
    expect(row.text).toContain('Exit ticket: not yet');
    const graph = scoreSeries(ctx.lessons, ctx.cfuChecks, ctx.cfuResults);
    expect(graph.values).toEqual([0.5]);
    expect(graph.lessons.map((l) => l.id)).toEqual([lesson.id]);
  });

  it('My teaching compares exit tickets in lessons where the plan was finished vs not', () => {
    const mk = (id: string, planDone: Lesson['planDone']): Lesson => ({ id, classId: 'c', date: '2026-10-20', openedAt: 0, status: 'closed', planDone, happy: 'yes', createdAt: 0 });
    const res = (lessonId: string, got: number, of: number): CfuResult[] => Array.from({ length: of }, (_, i) => ({ id: `${lessonId}|${i}`, checkId: lessonId, lessonId, classId: 'c', studentId: `s${i}`, date: '2026-10-20', kind: 'exit', result: i < got ? 'got' : 'notyet', createdAt: 0 }));
    const lessons = [mk('a', 'yes'), mk('b', 'yes'), mk('c', 'partly'), mk('d', 'no')];
    const results = [...res('a', 8, 10), ...res('b', 9, 10), ...res('c', 6, 10), ...res('d', 5, 10)];
    expect(planTicketInsight(lessons, results)).toBe("Lessons where you got through the plan averaged 85% on exit tickets, vs 55% when you didn't.");
    expect(planTicketInsight(lessons.slice(0, 3), results)).toBeNull();
  });

  it('new tables sync, with the ticket question encrypted', () => {
    for (const t of ['cfuChecks', 'cfuResults', 'absences']) expect(SYNCED_TABLES).toContain(t);
    expect(ENCRYPTED.cfuChecks).toEqual(['question']);
  });

  it('deleting a student removes their results and absences', async () => {
    const { a, mia, lesson } = await setup();
    await svc.saveYesNo(lesson, { [mia.id]: 'got' });
    await svc.markAbsent(a.id, mia.id, today(), 'blitz');
    await svc.deleteStudentPermanently(mia.id);
    expect(await db.cfuResults.count()).toBe(0);
    expect(await db.absences.count()).toBe(0);
  });
});

async function setupOther() {
  return svc.createClass({ name: '7A Science' });
}

describe('Previous (go back to the last student)', () => {
  it('goes back newest first; a student answered again appears once; Undo removes them from the list', () => {
    const undo = async () => {};
    let st = pushStep([], { studentId: 'a', undo });
    st = pushStep(st, { studentId: 'b', undo });
    st = pushStep(st, { studentId: 'a', undo }); // went back to a and answered again
    expect(st.map((x) => x.studentId)).toEqual(['b', 'a']);
    expect(lastStep(st)?.studentId).toBe('a');
    st = dropStep(st, 'a'); // the toast's Undo already took it back
    expect(lastStep(st)?.studentId).toBe('b');
    expect(lastStep(dropStep(st, 'b'))).toBeUndefined();
  });

  it('taking back the last two answers removes what was saved, including a "Not here" absence', async () => {
    const { a, mia, cal, lesson } = await setup();
    const t = (id: string) => ({ studentId: id, classId: a.id, date: today(), lessonId: lesson.id });
    let st: PrevStep[] = [];
    const r = await svc.logAllGood(t(mia.id));
    st = pushStep(st, { studentId: mia.id, undo: () => svc.undoCheckin(r.checkin.id) });
    const id = await svc.markNotHere(t(cal.id));
    st = pushStep(st, { studentId: cal.id, undo: () => svc.undoNotHere(t(cal.id), id) });
    for (const who of [cal.id, mia.id]) {
      const step = lastStep(st)!;
      expect(step.studentId).toBe(who);
      st = dropStep(st, who);
      await step.undo();
    }
    const ctx = await ctxOf(a.id);
    expect(ctx.checkins).toEqual([]);
    expect(ctx.absentNow.size).toBe(0);
  });
});
