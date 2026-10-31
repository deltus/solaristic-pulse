// All reads/writes to the local database go through these functions.

import { db, newId, getSettings, CORE_CATEGORIES, CORE_QUESTIONS, TABLES } from './db';
import { CHECKIN_AREAS } from './config/checkin';
import type {
  ColdCall, ColdCallResult, Happy, Lesson, PlanDone, HomeworkCheck, Category, Checkin, CheckinSource, CheckinStatus, Checkout, DayPlan, EvidenceItem, EvidenceKind, FollowUpOutcome, IcpAdjustment, IcpOutcome,
  Assessment, AssessmentCheck, AssessmentResult, BalanceTag, BrainBreakLog, ReliefPass, JournalEntry, Relationship, RelationshipType, Room, SeatWatch, SeatingPlan, SupportLevel, Observation, Question, ResponseOption, SchoolClass, Student, TimetableEntry
} from './types';
import { computePriority, rankStudents, ADJUST_MIN, ADJUST_MAX } from './logic/priority';
import { dueQuestions } from './logic/schedule';
import { followUpLevel, FOLLOW_UP_OPTIONS } from './logic/followups';
import type { IcpMatch, RosterRow, TimetableRow } from './logic/importers';
import { today as todayISO } from './lib/dates';
import { blitzTopic, type BlitzMark } from './logic/blitz';
import { checkoutId, clampPct } from './logic/checkout';
import { buildAllGood, buildIssue, checkinIdFor as swipeCheckinId, type CheckinTarget, type IssueInput, type SavedRecords } from './logic/checkin';
import { addDays, nowMs } from './lib/dates';
import { REMIND_LATER_MIN, lessonName, openLessonFor } from './logic/lessons';
import { docxBlob, filterJournal, journalDocumentXml } from './logic/journal';
import type { BrainBreak } from './config/brainBreaks';
import { buildReliefBundle, makeReliefPass, newPassKey, passProblem, type PassInput, type ReliefBundle, type ReliefEntry } from './logic/relief';
import { saveFile } from './files';
import { formatDate } from './lib/dates';
import { SIGNALS } from './config/seating';
import { answerWatch, leftOutMuteId, newSupport, newWatch, pairKey, seatLabel, type PairSuggestion } from './logic/seatingData';
import { printableHtml, shortNames } from './logic/seatingPrint';
import type { BrainDump, DayClose, FollowUp, FollowUpKind, Incident } from './types';
import { at as atTime, dueFrom, endOfDay, incidentContext, moveToTomorrow } from './logic/incidents';
import { BRAIN_DUMP_KEEP_DAYS, END_OF_DAY, INCIDENT_TASKS, type DueChip } from './config/incidents';

const clean = (s?: string) => (s ?? '').trim();
const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/* ---------------- Classes ---------------- */

export async function createClass(data: { name: string; subject?: string; yearLevel?: string }): Promise<SchoolClass> {
  const c: SchoolClass = {
    id: newId(), name: clean(data.name) || 'Untitled class', subject: clean(data.subject) || undefined,
    yearLevel: clean(data.yearLevel) || undefined, archived: false, createdAt: Date.now()
  };
  await db.classes.add(c);
  return c;
}

export async function updateClass(id: string, patch: Partial<SchoolClass>) {
  await db.classes.update(id, patch);
}

export async function deleteClassPermanently(id: string) {
  const students = await db.students.where('classId').equals(id).primaryKeys();
  for (const sid of students) await deleteStudentPermanently(sid);
  await db.transaction('rw', [db.classes, db.timetable, db.plans, db.checkins, db.observations, db.checkouts, db.issueTags, db.homework, db.lessons, db.coldCalls, db.journal, db.assessments, db.assessmentChecks, db.brainBreaks, db.reliefPasses, db.relationships, db.seatingPlans, db.incidents, db.followUps], async () => {
    await db.incidents.where('classId').equals(id).delete();
    await db.followUps.where('classId').equals(id).delete();
    await db.reliefPasses.where('classId').equals(id).delete();
    await db.brainBreaks.where('classId').equals(id).delete();
    await db.relationships.where('classId').equals(id).delete();
    await db.seatingPlans.where('classId').equals(id).delete();
    await db.journal.where('classId').equals(id).delete();
    await db.assessmentChecks.where('classId').equals(id).delete();
    await db.assessments.where('classId').equals(id).delete();
    await db.lessons.where('classId').equals(id).delete();
    await db.coldCalls.where('classId').equals(id).delete();
    await db.issueTags.where('classId').equals(id).delete();
    await db.homework.where('classId').equals(id).delete();
    await db.checkouts.where('classId').equals(id).delete();
    await db.timetable.where('classId').equals(id).delete();
    await db.plans.where('classId').equals(id).delete();
    await db.checkins.where('classId').equals(id).delete();
    await db.observations.where('classId').equals(id).delete();
    await db.classes.delete(id);
  });
}

/* ---------------- Students ---------------- */

export async function addStudent(classId: string, data: Partial<Student>): Promise<Student> {
  const s: Student = {
    id: newId(), classId, firstName: clean(data.firstName), lastName: clean(data.lastName),
    preferredName: clean(data.preferredName) || undefined, externalId: clean(data.externalId) || undefined,
    archived: false, priorityAdjust: clampAdjust(data.priorityAdjust ?? 0), createdAt: Date.now()
  };
  if (!s.firstName) throw new Error('First name is required');
  await db.students.add(s);
  return s;
}

export async function updateStudent(id: string, patch: Partial<Student>) {
  // Archiving deletes the student's support level (it's only for current seating).
  await db.students.update(id, patch.archived ? { ...patch, support: undefined, seatWatch: undefined } : patch);
}

export async function deleteStudentPermanently(id: string) {
  await db.transaction('rw', [db.students, db.observations, db.checkins, db.notes, db.icpAdjustments, db.icpChecks, db.plans, db.evidence, db.issueTags, db.homework, db.coldCalls, db.assessmentChecks, db.relationships, db.incidents, db.followUps], async () => {
    // Deleting a student deletes their incidents and follow-up tasks too.
    await db.incidents.where('studentId').equals(id).delete();
    await db.followUps.where('studentId').equals(id).delete();
    await db.relationships.where('studentA').equals(id).delete();
    await db.relationships.where('studentB').equals(id).delete();
    await db.assessmentChecks.where('studentId').equals(id).delete();
    await db.coldCalls.where('studentId').equals(id).delete();
    await db.issueTags.where('studentId').equals(id).delete();
    await db.homework.where('studentId').equals(id).delete();
    await db.evidence.where('studentId').equals(id).delete();
    await db.observations.where('studentId').equals(id).delete();
    await db.checkins.where('studentId').equals(id).delete();
    await db.notes.where('studentId').equals(id).delete();
    await db.icpChecks.where('studentId').equals(id).delete();
    await db.icpAdjustments.where('studentId').equals(id).delete();
    await db.plans.toCollection().modify((p) => { p.entries = p.entries.filter((e) => e.studentId !== id); });
    await db.students.delete(id);
  });
}

export async function importRoster(rows: RosterRow[], fallbackClassId?: string) {
  let added = 0, duplicates = 0;
  const createdClasses: string[] = [];
  await db.transaction('rw', [db.classes, db.students], async () => {
    const classes = await db.classes.toArray();
    const byName = new Map(classes.map((c) => [key(c.name), c]));
    const existing = await db.students.toArray();
    const seen = new Set(existing.map((s) => `${s.classId}|${key(s.firstName)}|${key(s.lastName)}`));
    for (const r of rows) {
      let classId = fallbackClassId;
      if (r.className) {
        let c = byName.get(key(r.className));
        if (!c) {
          c = { id: newId(), name: r.className.trim(), archived: false, createdAt: Date.now() };
          await db.classes.add(c);
          byName.set(key(c.name), c);
          createdClasses.push(c.name);
        }
        classId = c.id;
      }
      if (!classId) throw new Error('Choose a class for students without a class column.');
      const k = `${classId}|${key(r.firstName)}|${key(r.lastName)}`;
      if (seen.has(k)) { duplicates++; continue; }
      seen.add(k);
      await db.students.add({
        id: newId(), classId, firstName: r.firstName, lastName: r.lastName, preferredName: r.preferredName,
        externalId: r.externalId, archived: false, priorityAdjust: clampAdjust(r.priorityAdjust ?? 0), createdAt: Date.now()
      });
      added++;
    }
  });
  return { added, duplicates, createdClasses };
}

/** "Import students" inside a class: everyone goes into this class, whatever a Class column says. */
export const importStudentsIntoClass = (rows: RosterRow[], classId: string) => importRoster(rows.map((r) => ({ ...r, className: undefined })), classId);

/** Typed names (one per line) added to one class, skipping anyone already in it. */
export const addStudentsByName = (classId: string, names: { firstName: string; lastName: string }[]) =>
  importRoster(names.map((n) => ({ firstName: n.firstName, lastName: n.lastName })), classId);

/* ---------------- Flags & priority ---------------- */

export async function setFlag(studentId: string, reason: string | null) {
  await db.students.update(studentId, { flag: reason === null ? undefined : { reason: reason.trim(), since: todayISO() } });
}

export async function setPriorityAdjust(studentId: string, value: number) {
  const v = Math.round(Math.max(ADJUST_MIN, Math.min(ADJUST_MAX, value)) * 100) / 100;
  await db.students.update(studentId, { priorityAdjust: v });
}

/** Clears the teacher's manual priority inputs (flag and adjustment). Observation-based factors remain. */
export async function resetPriority(studentId: string) {
  await db.students.update(studentId, { priorityAdjust: 0, flag: undefined });
}

/* ---------------- Class data & daily plan ---------------- */

export interface ClassData {
  cls: SchoolClass;
  students: Student[];
  observations: Observation[];
  checkins: Checkin[];
  questions: Question[];
  categories: Category[];
}

export async function loadClassData(classId: string): Promise<ClassData | null> {
  const cls = await db.classes.get(classId);
  if (!cls) return null;
  const students = await db.students.where('classId').equals(classId).toArray();
  const ids = students.map((s) => s.id);
  const [observations, checkins, questions, categories] = await Promise.all([
    db.observations.where('studentId').anyOf(ids).toArray(),
    db.checkins.where('studentId').anyOf(ids).toArray(),
    db.questions.toArray(),
    db.categories.toArray()
  ]);
  return { cls, students, observations, checkins, questions: questions.filter((q) => q.enabled), categories };
}

export const planId = (date: string, classId: string) => `${date}|${classId}`;
export const checkinIdFor = (date: string, classId: string, studentId: string) => `${date}|${classId}|${studentId}`;

async function rankFor(classId: string, date: string, exclude: Set<string>) {
  const data = await loadClassData(classId);
  if (!data) return [];
  const settings = await getSettings();
  for (const c of data.checkins) if (c.date === date && c.classId === classId) exclude.add(c.studentId);
  return rankStudents({
    students: data.students, observations: data.observations, checkins: data.checkins,
    questions: data.questions, categories: data.categories, today: date,
    maxGapDays: settings.maxGapDays, excludeIds: exclude
  });
}

export async function classTarget(classId: string): Promise<number> {
  const [cls, settings] = await Promise.all([db.classes.get(classId), getSettings()]);
  return cls?.dailyTarget ?? settings.dailyTarget;
}

/** Returns today's stable plan for a class, creating it on first request. */
export async function ensurePlan(classId: string, date: string = todayISO()): Promise<DayPlan> {
  const id = planId(date, classId);
  const existing = await db.plans.get(id);
  if (existing) return existing;
  const ranked = await rankFor(classId, date, new Set());
  const target = await classTarget(classId);
  const plan: DayPlan = {
    id, date, classId,
    entries: ranked.slice(0, target).map((c) => ({ studentId: c.studentId, source: 'daily' as const, reasons: c.reasons, weight: c.weight }))
  };
  // Another tab/render may have created it meanwhile; keep the first.
  await db.transaction('rw', db.plans, async () => {
    if (!(await db.plans.get(id))) await db.plans.add(plan);
  });
  return (await db.plans.get(id))!;
}

/** Adds the next-highest-priority students (Check More Students). Returns how many were added. */
export async function extendPlan(classId: string, date: string, count: number, source: CheckinSource = 'extra', reasonPrefix?: string): Promise<number> {
  const plan = await ensurePlan(classId, date);
  const ranked = await rankFor(classId, date, new Set(plan.entries.map((e) => e.studentId)));
  const extra = ranked.slice(0, count).map((c) => ({
    studentId: c.studentId, source, weight: c.weight, reasons: reasonPrefix ? [reasonPrefix, ...c.reasons] : c.reasons
  }));
  if (extra.length) await db.plans.update(plan.id, { entries: [...plan.entries, ...extra] });
  return extra.length;
}

/** Teacher picks a student manually. */
export async function addToPlan(classId: string, date: string, studentId: string) {
  const plan = await ensurePlan(classId, date);
  const idx = plan.entries.findIndex((e) => e.studentId === studentId);
  const entries = plan.entries.filter((e) => e.studentId !== studentId);
  const entry = idx >= 0 ? plan.entries[idx] : { studentId, source: 'manual' as const, reasons: ['Chosen by teacher'] };
  // Put the chosen student next in the queue (after any completed check-ins).
  const done = new Set((await db.checkins.where('[classId+date]').equals([classId, date]).toArray()).map((c) => c.studentId));
  const firstPending = entries.findIndex((e) => !done.has(e.studentId));
  entries.splice(firstPending < 0 ? entries.length : firstPending, 0, entry);
  await db.plans.update(plan.id, { entries });
}

/* ---------------- Check-ins & observations ---------------- */

export async function getOrCreateCheckin(studentId: string, classId: string, date: string, source: CheckinSource): Promise<Checkin> {
  const id = checkinIdFor(date, classId, studentId);
  const existing = await db.checkins.get(id);
  if (existing) return existing;
  const c: Checkin = { id, studentId, classId, date, createdAt: Date.now(), status: 'partial', source, weight: await currentWeight(studentId, date) };
  await db.checkins.put(c);
  return c;
}

export async function refreshCheckinStatus(checkinId: string): Promise<CheckinStatus | undefined> {
  const c = await db.checkins.get(checkinId);
  if (!c || c.status === 'absent' || c.status === 'skipped') return c?.status;
  const [student, questions, obs] = await Promise.all([
    db.students.get(c.studentId), db.questions.toArray(), db.observations.where('studentId').equals(c.studentId).toArray()
  ]);
  if (!student) return;
  const due = dueQuestions(questions, student, c.classId, obs, c.date, c.id);
  const answered = new Set(obs.filter((o) => o.checkinId === c.id).map((o) => o.questionId));
  const status: CheckinStatus = due.every((q) => answered.has(q.id)) ? 'complete' : 'partial';
  if (status !== c.status) await db.checkins.update(c.id, { status });
  return status;
}

export interface AnswerInput {
  checkin: Checkin;
  question: Question;
  option?: ResponseOption;
  followUp?: { previousId: string; prevLevel: 1 | 2; outcome: FollowUpOutcome };
  /** Optional detail typed before the answer was chosen. */
  note?: string;
  context?: string;
}

/** Saves (or corrects) the answer to one question in a check-in. History in other check-ins is never changed. */
export async function answerQuestion({ checkin, question, option, followUp, note, context }: AnswerInput): Promise<Observation> {
  const id = `${checkin.id}|${question.id}`;
  const existing = await db.observations.get(id);
  const response = followUp ? FOLLOW_UP_OPTIONS.find((f) => f.outcome === followUp.outcome)!.label : option!.label;
  const level = followUp ? followUpLevel(followUp.prevLevel, followUp.outcome) : option!.level;
  const obs: Observation = {
    id, checkinId: checkin.id, studentId: checkin.studentId, classId: checkin.classId, date: checkin.date,
    createdAt: existing?.createdAt ?? Date.now(), updatedAt: existing ? Date.now() : undefined,
    questionId: question.id, categoryId: question.categoryId, response, level,
    followUp: followUp ? { previousId: followUp.previousId, outcome: followUp.outcome } : undefined,
    context: context ?? existing?.context, note: note?.trim() || existing?.note
  };
  await db.observations.put(obs);
  await refreshCheckinStatus(checkin.id);
  return obs;
}

export async function updateObservationDetail(id: string, patch: { context?: string; note?: string }) {
  await db.observations.update(id, { ...patch, updatedAt: Date.now() });
}

export async function clearAnswer(id: string) {
  const o = await db.observations.get(id);
  if (!o) return;
  await db.observations.delete(id);
  await refreshCheckinStatus(o.checkinId);
}

/** Absent or skipped: recorded separately, never as a negative observation. Daily slots are back-filled. */
export async function markStatus(studentId: string, classId: string, date: string, status: 'absent' | 'skipped') {
  const plan = await ensurePlan(classId, date);
  const entry = plan.entries.find((e) => e.studentId === studentId);
  const c = await getOrCreateCheckin(studentId, classId, date, entry?.source ?? 'manual');
  await db.transaction('rw', db.checkins, db.observations, async () => {
    await db.observations.where('checkinId').equals(c.id).delete();
    await db.checkins.update(c.id, { status });
  });
  if (entry?.source === 'daily') {
    await extendPlan(classId, date, 1, 'daily', status === 'absent' ? 'Replacing an absent student' : 'Replacing a skipped student');
  }
}

/** Removes a check-in (e.g. undo absent/skip) so the student returns to the queue. */
export async function undoCheckin(checkinId: string) {
  await db.transaction('rw', db.checkins, db.observations, db.issueTags, db.evidence, db.relationships, async () => {
    await db.relationships.where('checkinId').equals(checkinId).delete();
    await db.evidence.where('checkinId').equals(checkinId).delete();
    await db.observations.where('checkinId').equals(checkinId).delete();
    await db.issueTags.where('checkinId').equals(checkinId).delete();
    await db.checkins.delete(checkinId);
  });
}

/* ---------------- Swipe check-in ---------------- */

/** Saves one student's check-in for a lesson, replacing anything already saved for them in that lesson. */
async function saveRecords(r: SavedRecords): Promise<SavedRecords> {
  await db.transaction('rw', db.checkins, db.observations, db.issueTags, async () => {
    await db.observations.where('checkinId').equals(r.checkin.id).filter((o) => !o.exceeding).delete();
    await db.issueTags.where('checkinId').equals(r.checkin.id).delete();
    await db.checkins.put(r.checkin);
    await db.observations.bulkPut(r.observations);
    if (r.tags.length) await db.issueTags.bulkPut(r.tags);
  });
  return r;
}

export const logAllGood = (t: CheckinTarget) => saveRecords(buildAllGood(t));
export const logIssue = (t: CheckinTarget, input: IssueInput) => saveRecords(buildIssue(t, input));

/** "Not here": absent for this lesson, no ratings. */
export async function markNotHere(t: CheckinTarget) {
  const id = swipeCheckinId(t.lessonId, t.studentId);
  await db.transaction('rw', db.checkins, db.observations, db.issueTags, async () => {
    await db.observations.where('checkinId').equals(id).delete();
    await db.issueTags.where('checkinId').equals(id).delete();
    await db.checkins.put({ id, studentId: t.studentId, classId: t.classId, date: t.date, lessonId: t.lessonId, createdAt: Date.now(), status: 'absent', source: 'daily' });
  });
  return id;
}

/** Positive streak answer: "exceeding" in an area (or null = "No, at level"). Not asked again for 2 weeks. */
export async function answerStreak(t: CheckinTarget, areaId: string | null) {
  if (areaId) {
    const area = CHECKIN_AREAS.find((a) => a.id === areaId)!;
    const checkinId = swipeCheckinId(t.lessonId, t.studentId);
    await db.observations.put({
      id: `${checkinId}|exceeding|${areaId}`, checkinId, studentId: t.studentId, classId: t.classId, date: t.date, createdAt: Date.now(),
      questionId: area.questionId, categoryId: areaId, response: 'Exceeding', level: 0, exceeding: true, source: 'observed'
    });
  }
  await db.students.update(t.studentId, { streakAskedAt: t.date });
}

/** Everything the class screens need for one class. */
export async function loadLessonContext(classId: string) {
  const cls = await db.classes.get(classId);
  if (!cls) return null;
  const students = (await db.students.where('classId').equals(classId).toArray()).filter((s) => !s.archived);
  const ids = students.map((s) => s.id);
  const [checkins, observations, tags, homework, adjustments, icpChecks, evidence, lessons, coldCalls, assessments, assessmentChecks, plans, followUps] = await Promise.all([
    db.checkins.where('classId').equals(classId).toArray(),
    db.observations.where('classId').equals(classId).toArray(),
    db.issueTags.where('classId').equals(classId).toArray(),
    db.homework.where('classId').equals(classId).toArray(),
    db.icpAdjustments.where('studentId').anyOf(ids).toArray(),
    db.icpChecks.where('studentId').anyOf(ids).toArray(),
    db.evidence.where('studentId').anyOf(ids).toArray(),
    db.lessons.where('classId').equals(classId).toArray(),
    db.coldCalls.where('classId').equals(classId).toArray(),
    db.assessments.where('classId').equals(classId).toArray(),
    db.assessmentChecks.where('classId').equals(classId).toArray(),
    db.seatingPlans.where('classId').equals(classId).toArray(),
    db.followUps.where('classId').equals(classId).toArray()
  ]);
  const lesson = openLessonFor(lessons, classId);
  /** The class's active seating plan, if there is one. */
  const seatingPlan = plans.find((p) => p.active);
  return { cls, students, checkins, observations, tags, homework, adjustments, icpChecks, evidence, lessons, coldCalls, assessments, assessmentChecks, lesson, seatingPlan, followUps };
}
export type LessonContext = NonNullable<Awaited<ReturnType<typeof loadLessonContext>>>;

/* ---------------- Lessons ---------------- */

/** Open lesson: one Lesson record (class, start time). If the class already has one open, that one continues. */
export async function openLesson(classId: string, intention?: string): Promise<Lesson> {
  const existing = openLessonFor(await db.lessons.where('classId').equals(classId).toArray(), classId);
  if (existing) return existing;
  const now = nowMs();
  const l: Lesson = { id: newId(), classId, date: todayISO(), openedAt: now, status: 'open', createdAt: now, ...(clean(intention) ? { intention: clean(intention) } : {}) };
  await db.lessons.add(l);
  return l;
}

export async function setIntention(lessonId: string, text: string) {
  await db.lessons.update(lessonId, { intention: clean(text) || undefined });
}

export interface CloseAnswers {
  attentionPct?: number;
  homeworkSet?: boolean;
  homeworkText?: string;
  happy?: Happy;
  planDone?: PlanDone;
  note?: string;
}
const tidy = (a: CloseAnswers) => ({
  attentionPct: a.attentionPct === undefined ? undefined : clampPct(a.attentionPct),
  homeworkSet: !!a.homeworkSet, homeworkText: a.homeworkSet ? clean(a.homeworkText) || undefined : undefined,
  happy: a.happy, planDone: a.planDone, note: clean(a.note) || undefined
});

/** Close lesson. The two teacher questions are required; everything else is optional. */
export async function closeLesson(lessonId: string, a: CloseAnswers) {
  if (!a.happy || !a.planDone) throw new Error('Answer the two teacher questions to close the lesson');
  await db.lessons.update(lessonId, { ...tidy(a), status: 'closed', closedAt: nowMs(), remindAt: undefined });
}

/** "Remind me in 30 minutes": keep what's filled in, mark the lesson "to finish". */
export async function finishLessonLater(lessonId: string, a: CloseAnswers, minutes = REMIND_LATER_MIN) {
  const remindAt = nowMs() + minutes * 60_000;
  await db.lessons.update(lessonId, { ...tidy(a), status: 'finishing', remindAt });
  return remindAt;
}

/* ---------------- Cold call ---------------- */

/** Saves a cold call. "Wasn't listening" also records an Attention concern for that lesson. */
export async function logColdCall(lesson: Pick<Lesson, 'id' | 'classId' | 'date'>, studentId: string, result: ColdCallResult, tags: string[] = []): Promise<ColdCall> {
  const now = Date.now();
  const c: ColdCall = { id: newId(), lessonId: lesson.id, classId: lesson.classId, studentId, date: lesson.date, result, ...(result === 'struggled' && tags.length ? { tags } : {}), createdAt: now };
  await db.transaction('rw', db.coldCalls, db.observations, async () => {
    await db.coldCalls.add(c);
    if (result === 'struggled' && tags.includes('not_listening')) {
      await db.observations.put({
        id: `cold|${c.id}`, checkinId: `cold|${lesson.id}`, studentId, classId: lesson.classId, date: lesson.date, createdAt: now,
        questionId: 'cold-call', categoryId: 'focus', response: "Wasn't listening (cold call)", level: 1, source: 'observed', lessonId: lesson.id, coldCallId: c.id
      });
    }
  });
  return c;
}

export async function undoColdCall(id: string) {
  await db.transaction('rw', db.coldCalls, db.observations, async () => {
    await db.observations.where('id').equals(`cold|${id}`).delete();
    await db.coldCalls.delete(id);
  });
}

/* ---------------- Homework check ---------------- */

export async function saveHomeworkCheck(t: CheckinTarget, done: boolean, reason?: string, forLessonId?: string) {
  const row: HomeworkCheck = { id: `${t.lessonId}|${t.studentId}`, lessonId: t.lessonId, ...(forLessonId ? { forLessonId } : {}), classId: t.classId, studentId: t.studentId, date: t.date, done, ...(reason ? { reason } : {}), createdAt: Date.now() };
  await db.homework.put(row);
  return row;
}

export async function undoHomeworkCheck(id: string) {
  await db.homework.delete(id);
}

/* ---------------- Notes ---------------- */

export async function addNote(studentId: string, text: string) {
  if (!text.trim()) return;
  await db.notes.add({ id: newId(), studentId, date: todayISO(), text: text.trim(), createdAt: Date.now() });
}

export async function deleteNote(id: string) {
  await db.notes.delete(id);
}

/* ---------------- ICP ---------------- */

export async function saveAdjustment(a: Partial<IcpAdjustment> & { studentId: string; title: string }): Promise<IcpAdjustment> {
  const full: IcpAdjustment = {
    id: a.id ?? newId(), studentId: a.studentId, title: a.title.trim(), details: clean(a.details) || undefined,
    frequency: a.frequency ?? 'lesson', startDate: a.startDate ?? todayISO(), endDate: a.endDate || undefined,
    active: a.active ?? true, createdAt: a.createdAt ?? Date.now(), evidence: a.evidence
  };
  await db.icpAdjustments.put(full);
  return full;
}


/**
 * Several adjustments for one student in one go (same frequency and dates), skipping any the student
 * already has. Optionally flags the student.
 */
export async function saveAdjustments(
  studentId: string, items: { title: string; details?: string }[],
  shared: Partial<Pick<IcpAdjustment, 'frequency' | 'startDate' | 'endDate' | 'evidence'>> = {}, flag?: string
): Promise<{ added: IcpAdjustment[]; skipped: number }> {
  const have = new Set((await db.icpAdjustments.where('studentId').equals(studentId).toArray()).filter((a) => a.active).map((a) => a.title.trim().toLowerCase()));
  const added: IcpAdjustment[] = [];
  let skipped = 0;
  for (const it of items) {
    const k = it.title.trim().toLowerCase();
    if (!k || have.has(k)) { if (k) skipped++; continue; }
    have.add(k);
    added.push(await saveAdjustment({ ...shared, studentId, title: it.title, details: it.details }));
  }
  if (flag !== undefined) await setFlag(studentId, flag);
  return { added, skipped };
}

/** ICP import: saves the rows the preview marked "ok". */
export async function importIcpRows(matches: IcpMatch[]): Promise<number> {
  let n = 0;
  for (const m of matches) {
    if (m.status !== 'ok' || !m.studentId) continue;
    await saveAdjustment({ studentId: m.studentId, title: m.row.adjustment, details: m.row.notes });
    n++;
  }
  return n;
}
export async function deleteAdjustment(id: string) {
  await db.transaction('rw', db.icpAdjustments, db.icpChecks, db.evidence, async () => {
    await db.evidence.where('adjustmentId').equals(id).delete();
    await db.icpChecks.where('adjustmentId').equals(id).delete();
    await db.icpAdjustments.delete(id);
  });
}

export async function recordIcpCheck(adj: IcpAdjustment, date: string, outcome: IcpOutcome, note?: string) {
  const id = `${adj.id}|${date}`;
  const existing = await db.icpChecks.get(id);
  await db.icpChecks.put({
    id, adjustmentId: adj.id, studentId: adj.studentId, date, outcome,
    note: note ?? existing?.note, createdAt: existing?.createdAt ?? Date.now()
  });
}

export async function updateIcpNote(id: string, note: string) {
  await db.icpChecks.update(id, { note });
}

export async function deleteIcpCheck(id: string) {
  await db.icpChecks.delete(id);
}

/** "Not today" on an evidence prompt: ask again tomorrow. */
export async function snoozeEvidence(adj: IcpAdjustment, date: string = todayISO()) {
  await db.icpAdjustments.update(adj.id, { evidence: { ...adj.evidence, snoozedUntil: addDays(date, 1) } });
}

/** Who a piece of evidence belongs to: an ICP adjustment, or a daily check-in ("Include evidence?"). */
export type EvidenceOwner = { studentId: string; adjustmentId?: string; checkinId?: string };
const ownerOf = (o: Pick<IcpAdjustment, 'id' | 'studentId'> | EvidenceOwner): EvidenceOwner =>
  'id' in o ? { studentId: o.studentId, adjustmentId: o.id } : o;

export async function addEvidence(owner: Pick<IcpAdjustment, 'id' | 'studentId'> | EvidenceOwner, item: { kind: EvidenceKind; blob?: Blob; name?: string; text?: string }, date: string = todayISO()): Promise<EvidenceItem> {
  const o = ownerOf(owner);
  const e: EvidenceItem = {
    id: newId(), studentId: o.studentId, ...(o.adjustmentId ? { adjustmentId: o.adjustmentId } : {}), ...(o.checkinId ? { checkinId: o.checkinId } : {}),
    date, kind: item.kind, createdAt: Date.now(),
    ...(item.blob ? { blob: item.blob, mime: item.blob.type, size: item.blob.size, name: item.name } : {}),
    ...(clean(item.text) ? { text: clean(item.text) } : {})
  };
  await db.evidence.add(e);
  return e;
}

export const countEvidence = (checkinId: string) => db.evidence.where('checkinId').equals(checkinId).count();

export async function updateEvidenceText(id: string, text: string) {
  await db.evidence.update(id, { text: clean(text) || undefined });
}

export async function deleteEvidence(id: string) {
  await db.evidence.delete(id);
}

/* ---------------- Check-outs ---------------- */

export async function saveCheckout(c: { classId: string; date: string; timetableId?: string; start?: string; lessonMin: number; pctWorking: number; note?: string }): Promise<Checkout> {
  const id = checkoutId(c.date, c.classId, c.timetableId);
  const existing = await db.checkouts.get(id);
  const row: Checkout = {
    id, classId: c.classId, date: c.date, timetableId: c.timetableId, start: c.start,
    lessonMin: Math.max(1, Math.round(c.lessonMin)), pctWorking: clampPct(c.pctWorking),
    note: clean(c.note) || existing?.note, createdAt: existing?.createdAt ?? Date.now(), ...(existing ? { updatedAt: Date.now() } : {})
  };
  await db.checkouts.put(row);
  return row;
}

export async function updateCheckoutNote(id: string, note: string) {
  await db.checkouts.update(id, { note: clean(note) || undefined });
}

/* ---------------- Timetable ---------------- */

export async function importTimetable(rows: TimetableRow[], opts: { replace: boolean; createMissing: boolean }) {
  const unmatched = new Set<string>();
  const created: string[] = [];
  let added = 0;
  await db.transaction('rw', db.classes, db.timetable, async () => {
    if (opts.replace) await db.timetable.clear();
    const classes = await db.classes.toArray();
    const byName = new Map(classes.map((c) => [key(c.name), c]));
    for (const r of rows) {
      let c = byName.get(key(r.className));
      if (!c && opts.createMissing) {
        c = { id: newId(), name: r.className.trim(), archived: false, createdAt: Date.now() };
        await db.classes.add(c);
        byName.set(key(c.name), c);
        created.push(c.name);
      }
      if (!c) { unmatched.add(r.className); continue; }
      await db.timetable.add({ id: newId(), classId: c.id, day: r.day, start: r.start, end: r.end, room: r.room, notes: r.notes });
      added++;
    }
  });
  return { added, created, unmatched: [...unmatched] };
}

export async function saveTimetableEntry(t: Omit<TimetableEntry, 'id'> & { id?: string }) {
  await db.timetable.put({ ...t, id: t.id ?? newId() });
}

export async function deleteTimetableEntry(id: string) {
  await db.timetable.delete(id);
}

/* ---------------- Questions & categories ---------------- */

export async function saveQuestion(q: Partial<Question> & { text: string; categoryId: string }) {
  const all = await db.questions.toArray();
  const full: Question = {
    id: q.id ?? newId(), text: q.text.trim(), categoryId: q.categoryId,
    options: q.options?.length ? q.options : [
      { label: 'As expected', level: 0 }, { label: 'Some difficulty', level: 1 },
      { label: 'Significant difficulty', level: 2 }, { label: 'Not observed / unsure', level: null }
    ],
    allowDetail: q.allowDetail ?? true, classIds: q.classIds ?? [], studentIds: q.studentIds ?? [],
    frequencyDays: q.frequencyDays ?? 7, enabled: q.enabled ?? true, builtIn: q.builtIn ?? false,
    order: q.order ?? Math.max(0, ...all.map((x) => x.order)) + 1
  };
  await db.questions.put(full);
  return full;
}

/** Deletes a custom question. If it has history it is disabled instead, so records are preserved. */
export async function deleteQuestion(id: string): Promise<'deleted' | 'disabled'> {
  const q = await db.questions.get(id);
  if (!q || q.builtIn) return 'disabled';
  const used = await db.observations.where('questionId').equals(id).count();
  if (used) {
    await db.questions.update(id, { enabled: false });
    return 'disabled';
  }
  await db.questions.delete(id);
  return 'deleted';
}

export async function saveCategory(name: string, phrase?: string): Promise<Category> {
  const c: Category = { id: newId(), name: name.trim(), phrase: (phrase || name).trim().toLowerCase(), builtIn: false };
  await db.categories.add(c);
  return c;
}

/* ---------------- Backup, restore, deletion ---------------- */

export const BACKUP_FORMAT = 'solaristic-pulse-backup';

export async function createBackup() {
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) tables[t] = await db.table(t).toArray();
  return { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), tables };
}

export async function restoreBackup(data: unknown) {
  const d = data as { format?: string; tables?: Record<string, unknown[]> };
  if (!d || d.format !== BACKUP_FORMAT || !d.tables) throw new Error('This file is not a Solaristic Radar backup.');
  for (const t of TABLES) if (d.tables[t] !== undefined && !Array.isArray(d.tables[t])) throw new Error(`Backup table "${t}" is invalid.`);
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      const rows = d.tables![t] ?? [];
      if (rows.length) await db.table(t).bulkAdd(rows);
    }
    if (!(await db.categories.count())) await db.categories.bulkAdd(CORE_CATEGORIES);
    if (!(await db.questions.count())) await db.questions.bulkAdd(CORE_QUESTIONS);
  });
}

export async function deleteAllData() {
  await db.files.clear();
  await db.evidence.clear();
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) await db.table(t).clear();
    await db.categories.bulkAdd(CORE_CATEGORIES);
    await db.questions.bulkAdd(CORE_QUESTIONS);
  });
}

/* ---------------- Draw weight ---------------- */

export const clampAdjust = (v: number) => Math.round(Math.max(ADJUST_MIN, Math.min(ADJUST_MAX, v)) * 100) / 100;

/** The student's draw weight right now (stored on each check-in for later analysis). */
export async function currentWeight(studentId: string, date: string = todayISO()): Promise<number | undefined> {
  const student = await db.students.get(studentId);
  if (!student) return undefined;
  const [obs, chks, questions, categories] = await Promise.all([
    db.observations.where('studentId').equals(studentId).toArray(),
    db.checkins.where('studentId').equals(studentId).toArray(),
    db.questions.filter((q) => q.enabled).toArray(),
    db.categories.toArray()
  ]);
  return computePriority(student, obs, chks.filter((c) => c.date <= date), questions, categories, date).weight;
}

/* ---------------- Blitz (whole class, one topic) ---------------- */

const blitzObsId = (date: string, topic: string, studentId: string) => `blitz|${date}|${topic}|${studentId}`;

/** Existing marks for a class/topic/day, so a Blitz can be reopened and corrected. */
export async function loadBlitz(classId: string, date: string, topic: string): Promise<Record<string, BlitzMark>> {
  const obs = await db.observations.where('checkinId').equals(`blitz|${date}|${classId}`).filter((o) => o.blitz === topic).toArray();
  return Object.fromEntries(obs.map((o) => [o.studentId, o.level === null ? 'absent' : o.level ? 'no' : 'yes']));
}

/**
 * Saves a Blitz. Marks are stored as observations flagged `blitz` (separate from check-ins,
 * so they don't count as a check-in) but in the matching area, so they feed trends and reports.
 */
export async function saveBlitz(classId: string, date: string, topicId: string, marks: Record<string, BlitzMark>, lessonId?: string) {
  const topic = blitzTopic(topicId);
  if (!topic) throw new Error('Unknown Blitz topic');
  const checkinId = `blitz|${date}|${classId}`;
  await db.transaction('rw', db.observations, async () => {
    await db.observations.where('checkinId').equals(checkinId).filter((o) => o.blitz === topicId).delete();
    const now = Date.now();
    await db.observations.bulkPut(Object.entries(marks).map(([studentId, m], i) => ({
      id: blitzObsId(date, topicId, studentId), checkinId, studentId, classId, date, createdAt: now + i,
      questionId: `blitz-${topicId}`, categoryId: topic.categoryId, blitz: topicId, ...(lessonId ? { lessonId } : {}),
      response: m === 'yes' ? 'Yes' : m === 'no' ? 'No' : 'Absent', level: m === 'absent' ? null : m === 'no' ? 1 : 0
    })));
  });
}

/* ---------------- Teacher journal (private) ---------------- */

export async function saveJournalEntry(e: Partial<JournalEntry> & { classId: string; text: string }): Promise<JournalEntry> {
  const now = Date.now();
  const full: JournalEntry = {
    id: e.id ?? newId(), classId: e.classId, date: e.date ?? todayISO(), lessonId: e.lessonId || undefined, text: e.text.trim(),
    tags: [...new Set((e.tags ?? []).map((t) => t.trim()).filter(Boolean))], aitsl: e.aitsl || undefined,
    createdAt: e.createdAt ?? now, ...(e.id ? { updatedAt: now } : {})
  };
  await db.journal.put(full);
  return full;
}

export const deleteJournalEntry = (id: string) => db.journal.delete(id);

/** The journal's own export (Word), by date range and class. Nothing else ever includes the journal. */
export async function exportJournal(f: { from?: string; to?: string; classIds?: string[] }) {
  const [entries, classes, lessons, settings] = await Promise.all([db.journal.toArray(), db.classes.toArray(), db.lessons.toArray(), getSettings()]);
  const list = filterJournal(entries, f);
  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? 'Class';
  const lessonTitle = (id?: string) => { const l = id ? lessons.find((x) => x.id === id) : undefined; return l ? lessonName(l) : ''; };
  const range = `${f.from ? formatDate(f.from) : 'All entries'} to ${f.to ? formatDate(f.to) : formatDate(todayISO())}`;
  const scope = f.classIds?.length ? f.classIds.map(className).join(', ') : 'All classes';
  const xml = journalDocumentXml({ title: `Teaching journal${settings.profile.name ? ` · ${settings.profile.name}` : ''}`, subtitle: `${scope} · ${range} · ${list.length} entr${list.length === 1 ? 'y' : 'ies'}`, entries: list, className, lessonName: lessonTitle });
  const name = `Teaching journal – ${scope} ${f.from ?? ''}${f.to ? ` to ${f.to}` : ''}`.replace(/[\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return saveFile(await docxBlob(xml), `${name}.docx`, 'report');
}

/* ---------------- Assessments ---------------- */

export async function saveAssessment(a: Partial<Assessment> & { classId: string; name: string }): Promise<Assessment> {
  const full: Assessment = {
    id: a.id ?? newId(), classId: a.classId, name: a.name.trim(), dueDate: a.dueDate || undefined,
    checkpoints: (a.checkpoints ?? []).map((c) => c.trim()).filter(Boolean), closed: a.closed || undefined, createdAt: a.createdAt ?? Date.now()
  };
  await db.assessments.put(full);
  return full;
}

/** One student's result for a task in this lesson (saving again in the same lesson replaces it). */
export async function saveAssessmentCheck(t: CheckinTarget, assessmentId: string, result: AssessmentResult, reasons: string[] = [], checkpoint?: string): Promise<AssessmentCheck> {
  const row: AssessmentCheck = {
    id: `${assessmentId}|${t.lessonId}|${t.studentId}`, assessmentId, classId: t.classId, studentId: t.studentId, lessonId: t.lessonId, date: t.date,
    result, ...(reasons.length ? { reasons } : {}), ...(checkpoint ? { checkpoint } : {}), createdAt: t.now ?? Date.now()
  };
  await db.assessmentChecks.put(row);
  return row;
}

export const undoAssessmentCheck = (id: string) => db.assessmentChecks.delete(id);

/** Deletes a task and all its results. */
export async function deleteAssessment(id: string) {
  await db.transaction('rw', db.assessments, db.assessmentChecks, async () => {
    await db.assessmentChecks.where('assessmentId').equals(id).delete();
    await db.assessments.delete(id);
  });
}

/* ---------------- Brain breaks (no student data) ---------------- */

export async function logBrainBreak(lesson: Pick<Lesson, 'id' | 'classId' | 'date'>, b: Pick<BrainBreak, 'id' | 'name' | 'type' | 'group'>, at = Date.now()): Promise<BrainBreakLog> {
  const row: BrainBreakLog = { id: newId(), classId: lesson.classId, lessonId: lesson.id, date: lesson.date, breakId: b.id, name: b.name, type: b.type, group: b.group, at };
  await db.brainBreaks.add(row);
  return row;
}

export const setBreakHelped = (id: string, helped: 'yes' | 'no') => db.brainBreaks.update(id, { helped });

export async function saveCustomBreak(b: Omit<BrainBreak, 'id' | 'custom'> & { id?: string }): Promise<BrainBreak> {
  const full: BrainBreak = { ...b, id: b.id ?? `custom-${newId()}`, custom: true, name: b.name.trim(), steps: b.steps.map((s) => s.trim()).filter(Boolean), resources: b.resources.map((r) => r.trim()).filter(Boolean) };
  await db.customBreaks.put(full);
  return full;
}

export const deleteCustomBreak = (id: string) => db.customBreaks.delete(id);

/* ---------------- Relief passes ---------------- */

/** Creates a pass (any class: a future reception/admin role can call this too). Throws a plain-English problem. */
export async function createReliefPass(p: PassInput): Promise<ReliefPass> {
  const problem = passProblem(p, todayISO());
  if (problem) throw new Error(problem);
  const settings = await getSettings();
  const pass = { ...makeReliefPass({ ...p, createdBy: p.createdBy ?? (settings.profile.name || undefined) }, newId(), Date.now()), key: newPassKey() };
  await db.reliefPasses.put(pass);
  return pass;
}

/** Stops a pass straight away. */
export const cancelReliefPass = (id: string) => db.reliefPasses.update(id, { cancelledAt: Date.now() });

/** Exactly what the relief teacher's device would receive for this pass. */
export async function reliefBundleFor(passId: string): Promise<ReliefBundle> {
  const pass = await db.reliefPasses.get(passId);
  if (!pass) throw new Error('Pass not found');
  const ctx = await loadLessonContext(pass.classId);
  if (!ctx) throw new Error('Class not found');
  return buildReliefBundle(pass, { ...ctx, today: todayISO() });
}

/** Accept relief entries (they stay; the review card stops showing them). */
export async function acceptReliefEntries(entries: ReliefEntry[]) {
  for (const e of entries) {
    const t = TABLE_OF[e.kind];
    await db.table(t).update(e.id, { relief: { ...e.relief, reviewed: true } });
  }
}

/** Remove one relief entry (and, for a check-in, its answers and details). */
export async function removeReliefEntry(e: ReliefEntry) {
  if (e.kind === 'checkin') return undoCheckin(e.id);
  if (e.kind === 'coldcall') return undoColdCall(e.id);
  if (e.kind === 'homework') return undoHomeworkCheck(e.id);
  await db.table(TABLE_OF[e.kind]).delete(e.id);
}

const TABLE_OF: Record<ReliefEntry['kind'], string> = { checkin: 'checkins', homework: 'homework', coldcall: 'coldCalls', brainbreak: 'brainBreaks', assessment: 'assessmentChecks', incident: 'incidents' };
/* ---------------- Seating plans (round 7) ---------------- */

/** Everything the seating screens need for one class. */
export async function loadSeating(classId: string) {
  const ctx = await loadLessonContext(classId);
  if (!ctx) return null;
  const [relationships, rooms, plans] = await Promise.all([
    db.relationships.where('classId').equals(classId).toArray(),
    db.rooms.toArray(),
    db.seatingPlans.where('classId').equals(classId).toArray()
  ]);
  return { ...ctx, relationships, rooms: rooms.sort((a, b) => a.name.localeCompare(b.name)), plans: plans.sort((a, b) => b.createdAt - a.createdAt) };
}
export type SeatingContext = NonNullable<Awaited<ReturnType<typeof loadSeating>>>;

export async function addRelationship(
  classId: string, a: string, b: string, type: RelationshipType,
  opts: { strength?: 1 | 2; source?: Relationship['source']; confirmed?: boolean; note?: string; checkinId?: string; date?: string } = {}
): Promise<Relationship> {
  const now = Date.now();
  const r: Relationship = {
    id: newId(), classId, studentA: a, studentB: b, type, strength: type === 'keepApart' ? opts.strength ?? 1 : 1,
    source: opts.source ?? 'manual', confirmed: opts.confirmed ?? true, date: opts.date ?? todayISO(), createdAt: now, updatedAt: now,
    ...(clean(opts.note) ? { note: clean(opts.note) } : {}), ...(opts.checkinId ? { checkinId: opts.checkinId } : {})
  };
  await db.relationships.add(r);
  return r;
}
export const updateRelationship = (id: string, patch: Partial<Relationship>) => db.relationships.update(id, { ...patch, updatedAt: Date.now() });

/** Removes a relationship and every other confirmed row for the same pair and kind. */
export async function deleteRelationship(r: Relationship) {
  const k = pairKey(r.studentA, r.studentB);
  const same = (await db.relationships.where('classId').equals(r.classId).toArray()).filter((x) => x.type === r.type && pairKey(x.studentA, x.studentB) === k && (x.confirmed || x.useAnyway));
  await db.relationships.bulkDelete(same.map((x) => x.id));
}

/** Unconfirmed check-in signals ("With who?" on Peer interactions, "Worked well with…" after All good). */
export async function logRelationshipSignals(t: CheckinTarget, ids: string[], type: RelationshipType) {
  const checkinId = swipeCheckinId(t.lessonId, t.studentId);
  await db.relationships.where('checkinId').equals(checkinId).filter((r) => r.type === type).delete();
  for (const other of ids) {
    if (other === t.studentId) continue;
    await addRelationship(t.classId, t.studentId, other, type, { source: 'checkin', confirmed: false, checkinId, date: t.date });
  }
}

/** "Yes" on a suggestion: a confirmed relationship. */
export const confirmSuggestion = (classId: string, s: PairSuggestion) => addRelationship(classId, s.a, s.b, s.type, { source: 'suggested', confirmed: true });

/** "Not now" (2 weeks) or "Never suggest" for a pair. */
export async function muteSuggestion(classId: string, s: Pick<PairSuggestion, 'a' | 'b' | 'type'>, mode: 'notNow' | 'never') {
  const r = await addRelationship(classId, s.a, s.b, s.type, { source: 'suggested', confirmed: false });
  await db.relationships.update(r.id, { muted: mode === 'never' ? 'never' : addDays(todayISO(), SIGNALS.notNowDays) });
}

/** "Not now" on "Seat Mia with someone they work well with?". */
export async function muteLeftOut(classId: string, studentId: string) {
  const now = Date.now();
  await db.relationships.put({
    id: leftOutMuteId(studentId), classId, studentA: studentId, studentB: studentId, type: 'worksWell', strength: 1, source: 'suggested', confirmed: false,
    muted: addDays(todayISO(), SIGNALS.notNowDays), date: todayISO(), createdAt: now, updatedAt: now
  });
}

export async function setSeatingNeeds(studentId: string, needs: string[], note?: string) {
  await db.students.update(studentId, { seatingNeeds: needs.length ? needs : undefined, seatingNeedNote: clean(note) || undefined });
}
export async function dismissIcpNeed(studentId: string, need: string) {
  const s = await db.students.get(studentId);
  if (s) await db.students.update(studentId, { seatingIcpDismissed: [...new Set([...(s.seatingIcpDismissed ?? []), need])] });
}
/** Support right now: set (reviewed in 10 weeks), confirm ("Still accurate?" → Yes) or clear. */
export async function setSupport(studentId: string, level: SupportLevel['level'] | null) {
  await db.students.update(studentId, { support: level ? newSupport(level, todayISO()) : undefined });
}
export async function setStudentBalanceTags(studentId: string, tagIds: string[]) {
  await db.students.update(studentId, { balanceTags: tagIds.length ? tagIds : undefined });
}
export async function saveBalanceTags(classId: string, tags: BalanceTag[]) {
  await db.classes.update(classId, { balanceTags: tags.length ? tags : undefined });
  // Remove deleted tags from students.
  const ids = new Set(tags.map((t) => t.id));
  await db.students.where('classId').equals(classId).modify((s) => {
    if (!s.balanceTags) return;
    s.balanceTags = s.balanceTags.filter((t) => ids.has(t));
    if (!s.balanceTags.length) delete s.balanceTags;
  });
}

export async function saveRoom(r: Omit<Room, 'id' | 'createdAt'> & { id?: string }): Promise<Room> {
  const room: Room = { ...r, id: r.id ?? newId(), name: clean(r.name) || 'Room', createdAt: Date.now() };
  await db.rooms.put(room);
  return room;
}
export const deleteRoom = (id: string) => db.rooms.delete(id);

/**
 * Save as the class's active plan (older plans are kept). Students in `watch` (placed with an "alone"
 * warning the teacher wants to keep an eye on, or flagged as left out) get the seat watch; earlier
 * watches end because the seats changed.
 */
export async function saveSeatingPlan(
  p: Pick<SeatingPlan, 'classId' | 'room' | 'seats'> & { roomId?: string; name?: string },
  watch: { studentId: string; reason: SeatWatch['reason'] }[] = []
): Promise<SeatingPlan> {
  const date = todayISO();
  const plan: SeatingPlan = {
    id: newId(), classId: p.classId, ...(p.roomId ? { roomId: p.roomId } : {}), name: clean(p.name) || `Plan from ${formatDate(date)}`,
    room: p.room, seats: p.seats, active: true, activeFrom: date, createdAt: Date.now()
  };
  await db.transaction('rw', db.seatingPlans, db.students, async () => {
    await db.seatingPlans.where('classId').equals(p.classId).modify({ active: false });
    await db.seatingPlans.add(plan);
    await db.students.where('classId').equals(p.classId).modify((s) => { if (s.seatWatch && !s.seatWatch.ended) s.seatWatch = { ...s.seatWatch, ended: true }; });
    for (const w of watch) {
      const table = seatLabel(plan, w.studentId);
      if (table) await db.students.update(w.studentId, { seatWatch: newWatch(plan.id, table, w.reason, date) });
    }
  });
  return plan;
}
/** Locks on the active plan, without starting a new one. */
export const updateSeatingPlan = (id: string, patch: Partial<SeatingPlan>) => db.seatingPlans.update(id, patch);

/** "New seat at Table 3. How are they going there?" */
export async function answerSeatWatch(studentId: string, settled: boolean, t: Pick<CheckinTarget, 'date' | 'lessonId'>) {
  const s = await db.students.get(studentId);
  if (!s?.seatWatch) return;
  await db.students.update(studentId, { seatWatch: answerWatch(s.seatWatch, settled, t.date, t.lessonId) });
}
export async function clearSeatReview(studentId: string) {
  const s = await db.students.get(studentId);
  if (s?.seatWatch) await db.students.update(studentId, { seatWatch: { ...s.seatWatch, review: false } });
}
export const flagForPlanning = (studentId: string, table: string) => setFlag(studentId, `Not settling at ${table}: review in lesson planning`);

/** The printable plan (names only) as an HTML file the teacher can open and print. */
export async function exportSeatingPlan(plan: SeatingPlan, students: Student[], className: string) {
  const html = printableHtml(plan, shortNames(students), className, `From ${formatDate(plan.activeFrom ?? todayISO())}`);
  return saveFile(new Blob([html], { type: 'text/html' }), `${className} – seating plan ${plan.activeFrom ?? todayISO()}.html`);
}

/* ---------------- Serious incidents and follow-up tasks (round 8) ---------------- */

/** Everything the incident screen needs to pre-fill and compile the context. */
export async function incidentStart(classId: string, studentId: string, checkinId?: string) {
  const ctx = await loadLessonContext(classId);
  const student = await db.students.get(studentId);
  if (!ctx || !student) return null;
  const notes = await db.notes.where('studentId').equals(studentId).toArray();
  const followUps = await db.followUps.where('studentId').equals(studentId).toArray();
  const date = todayISO();
  const context = incidentContext({ ...ctx, student, classId, date, notes, followUps, excludeCheckinId: checkinId });
  return { ctx, student, context };
}

export type IncidentInput = Omit<Incident, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export async function saveIncident(i: IncidentInput): Promise<Incident> {
  const now = nowMs();
  const old = i.id ? await db.incidents.get(i.id) : undefined;
  const full: Incident = {
    ...i, id: i.id ?? newId(), what: i.what.trim(), where: clean(i.where) || 'Classroom', witnesses: clean(i.witnesses) || undefined,
    actionNote: clean(i.actionNote) || undefined, createdAt: old?.createdAt ?? now, ...(old ? { updatedAt: now } : {})
  };
  await db.incidents.put(full);
  return full;
}

export async function markLodged(incidentId: string, lodged = true) {
  await db.incidents.update(incidentId, { lodgedAt: lodged ? nowMs() : undefined });
  if (lodged) await db.followUps.where('incidentId').equals(incidentId).filter((f) => f.kind === 'lodge' && f.status === 'todo').modify({ status: 'done', doneAt: nowMs() });
}

export async function deleteIncident(id: string) {
  await db.transaction('rw', db.incidents, db.followUps, async () => {
    await db.followUps.where('incidentId').equals(id).delete();
    await db.incidents.delete(id);
  });
}

export interface TaskInput { kind: FollowUpKind; title: string; due: DueChip | number; studentId?: string; classId?: string; incidentId?: string; about?: string; role?: string; draft?: 'home' | 'staff' }

export async function addFollowUp(t: TaskInput): Promise<FollowUp> {
  const now = nowMs();
  const f: FollowUp = {
    id: newId(), kind: t.kind, title: t.title.trim(), dueAt: typeof t.due === 'number' ? t.due : dueFrom(t.due, now), status: 'todo', createdAt: now,
    ...(t.studentId ? { studentId: t.studentId } : {}), ...(t.classId ? { classId: t.classId } : {}), ...(t.incidentId ? { incidentId: t.incidentId } : {}),
    ...(clean(t.about) ? { about: clean(t.about) } : {}), ...(t.role ? { role: t.role } : {}), ...(t.draft ? { draft: t.draft } : {})
  };
  await db.followUps.add(f);
  return f;
}

/** The tasks offered after an incident (the teacher picks which, and when). */
export async function addIncidentTasks(i: Incident, picks: { kind: 'lodge' | 'home' | 'staff'; due: DueChip | number; role?: string }[]) {
  const s = await db.students.get(i.studentId);
  const who = s ? (s.preferredName || s.firstName) : 'student';
  const out: FollowUp[] = [];
  for (const p of picks) {
    const base = INCIDENT_TASKS.find((t) => t.kind === p.kind)!;
    const title = p.kind === 'staff' ? `Inform ${p.role ?? 'school staff'} about ${who}` : `${base.title}: ${who}`;
    out.push(await addFollowUp({ kind: p.kind, title, due: p.due, studentId: i.studentId, classId: i.classId, incidentId: i.id, ...(p.role ? { role: p.role } : {}), ...(p.kind !== 'lodge' ? { draft: p.kind } : {}) }));
  }
  return out;
}

/** "Follow up urgently": a task due at the end of today; the student goes top of tomorrow's queue. */
export async function addUrgentFollowUp(t: { studentId: string; classId: string; date: string }) {
  const s = await db.students.get(t.studentId);
  const due = Math.max(atTime(t.date, END_OF_DAY), nowMs() + 15 * 60_000);
  return addFollowUp({ kind: 'urgent', title: `Follow up urgently: ${s ? (s.preferredName || s.firstName) : 'student'}`, due, studentId: t.studentId, classId: t.classId });
}

export async function setFollowUpStatus(id: string, status: FollowUp['status'], note?: string) {
  await db.followUps.update(id, { status, doneAt: status === 'todo' ? undefined : nowMs(), ...(note !== undefined ? { note: clean(note) || undefined } : {}) });
}
export const setFollowUpDue = (id: string, dueAt: number) => db.followUps.update(id, { dueAt });
export async function moveFollowUpToTomorrow(id: string) {
  const f = await db.followUps.get(id);
  if (f) await db.followUps.update(id, { dueAt: moveToTomorrow(f, nowMs()) });
}
export const deleteFollowUp = (id: string) => db.followUps.delete(id);

/* ---------------- Close day ---------------- */

/** Everything Close day goes through, across all classes, for one date. */
export async function loadDay(date: string) {
  const [classes, students, lessons, checkins, observations, tags, incidents, followUps, close] = await Promise.all([
    db.classes.toArray(), db.students.toArray(), db.lessons.toArray(), db.checkins.where('date').equals(date).toArray(),
    db.observations.where('date').equals(date).toArray(), db.issueTags.where('date').equals(date).toArray(),
    db.incidents.toArray(), db.followUps.toArray(), db.dayCloses.get(date)
  ]);
  const end = endOfDay(date);
  return {
    classes, students, close,
    openLessons: lessons.filter((l) => l.status !== 'closed' && l.date <= date),
    issues: checkins.filter((c) => c.result === 'issue'), observations, tags,
    incidentsToday: incidents.filter((i) => i.date === date),
    unlodged: incidents.filter((i) => !i.lodgedAt && i.date <= date),
    tasksDue: followUps.filter((f) => f.status === 'todo' && f.dueAt <= end && !f.draft),
    drafts: followUps.filter((f) => f.status === 'todo' && f.draft),
    urgentToday: followUps.filter((f) => f.kind === 'urgent' && f.createdAt >= atTime(date, '00:00') && f.createdAt <= end)
  };
}
export type DayData = Awaited<ReturnType<typeof loadDay>>;

export async function closeDay(date: string, d: { reflection?: DayClose['reflection']; note?: string; counts: Record<string, number> }): Promise<DayClose> {
  const row: DayClose = { id: date, date, ...(d.reflection ? { reflection: d.reflection } : {}), ...(clean(d.note) ? { note: clean(d.note) } : {}), counts: d.counts, closedAt: nowMs() };
  await db.dayCloses.put(row);
  return row;
}

/* ---------------- Brain dump ---------------- */

export async function saveBrainDump(text: string, classId?: string, id?: string): Promise<BrainDump> {
  const now = nowMs();
  const old = id ? await db.brainDumps.get(id) : undefined;
  const created = old?.createdAt ?? now;
  const row: BrainDump = {
    id: id ?? newId(), date: old?.date ?? todayISO(), ...(classId ? { classId } : {}), text, createdAt: created,
    deleteAfter: created + BRAIN_DUMP_KEEP_DAYS * 86_400_000, ...(old?.sortedAt ? { sortedAt: old.sortedAt } : {})
  };
  await db.brainDumps.put(row);
  return row;
}
export const markDumpSorted = (id: string) => db.brainDumps.update(id, { sortedAt: nowMs() });

/** Deletes Brain dump text older than BRAIN_DUMP_KEEP_DAYS. Run when the app opens. */
export async function purgeBrainDumps(now = nowMs()): Promise<number> {
  const old = (await db.brainDumps.filter((d) => d.deleteAfter <= now).primaryKeys()) as string[];
  await db.brainDumps.bulkDelete(old);
  return old.length;
}

export async function addTaggedNote(studentId: string, text: string, tags: string[]) {
  if (!text.trim()) return;
  await db.notes.add({ id: newId(), studentId, date: todayISO(), text: text.trim(), ...(tags.length ? { tags } : {}), createdAt: nowMs() });
}

/**
 * Brain dump "Wellbeing flag": a Wellbeing check-in with its note. It has its own lesson id, so it
 * never replaces a check-in from a real lesson, and only the Wellbeing area is recorded.
 */
export async function logWellbeingFlag(studentId: string, classId: string, note: string, dumpId: string) {
  const date = todayISO();
  const r = buildIssue({ studentId, classId, date, lessonId: `dump|${dumpId}` }, { areas: { wellbeing: [] }, note });
  r.observations = r.observations.filter((o) => o.categoryId === 'wellbeing');
  r.checkin = { ...r.checkin, source: 'manual' };
  return saveRecords(r);
}

/** Leftovers from a Brain dump become one dated journal entry. */
export const saveDumpLeftovers = (text: string, classId?: string) => (text.trim() ? saveJournalEntry({ classId: classId ?? '', text, tags: ['Brain dump'] }) : Promise.resolve(null));

export type DumpAction = 'note' | 'followup' | 'home' | 'wellbeing' | 'positive' | 'skip';
export interface DumpChunkChoice { text: string; studentIds: string[]; action?: DumpAction; due?: DueChip | number }

/**
 * Turns sorted Brain dump chunks into records: a note, a follow-up, a contact-home task (with an
 * email draft), a Wellbeing flag or a positive note, for each student in the chunk. Chunks with
 * no student, skipped ones and ones left without a choice go into one journal entry.
 */
export async function applyDumpChunks(dumpId: string, chunks: DumpChunkChoice[], classId?: string) {
  const counts: Record<DumpAction | 'journal', number> = { note: 0, followup: 0, home: 0, wellbeing: 0, positive: 0, skip: 0, journal: 0 };
  const leftovers: string[] = [];
  for (const c of chunks) {
    const action = c.studentIds.length ? c.action ?? 'skip' : 'skip';
    if (action === 'skip') { leftovers.push(c.text); counts.skip++; continue; }
    for (const sid of c.studentIds) {
      const s = await db.students.get(sid);
      if (!s) continue;
      const who = s.preferredName || s.firstName;
      if (action === 'note') await addNote(sid, c.text);
      else if (action === 'positive') await addTaggedNote(sid, c.text, ['positive']);
      else if (action === 'wellbeing') await logWellbeingFlag(sid, s.classId, c.text, dumpId);
      else if (action === 'followup') await addFollowUp({ kind: 'custom', title: `Follow up: ${who}`, about: c.text, due: c.due ?? 'morning', studentId: sid, classId: s.classId });
      else if (action === 'home') await addFollowUp({ kind: 'home', title: `Contact home: ${who}`, about: c.text, due: c.due ?? 'eod', studentId: sid, classId: s.classId, draft: 'home' });
      counts[action]++;
    }
  }
  if (leftovers.length) { await saveDumpLeftovers(leftovers.join('\n'), classId); counts.journal = leftovers.length; }
  await markDumpSorted(dumpId);
  return counts;
}
