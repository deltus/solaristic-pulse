// All reads/writes to the local database go through these functions.

import { db, newId, getSettings, CORE_CATEGORIES, CORE_QUESTIONS, TABLES } from './db';
import type {
  Category, Checkin, CheckinSource, CheckinStatus, Checkout, DayPlan, EvidenceItem, EvidenceKind, FollowUpOutcome, IcpAdjustment, IcpOutcome,
  Observation, Question, ResponseOption, SchoolClass, Student, TimetableEntry
} from './types';
import { computePriority, rankStudents, ADJUST_MIN, ADJUST_MAX } from './logic/priority';
import { dueQuestions } from './logic/schedule';
import { followUpLevel, FOLLOW_UP_OPTIONS } from './logic/followups';
import type { RosterRow, TimetableRow } from './logic/importers';
import { today as todayISO } from './lib/dates';
import { blitzTopic, type BlitzMark } from './logic/blitz';
import { checkoutId, clampPct } from './logic/checkout';
import { addDays } from './lib/dates';

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
  await db.transaction('rw', [db.classes, db.timetable, db.plans, db.checkins, db.observations, db.checkouts], async () => {
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
  await db.students.update(id, patch);
}

export async function deleteStudentPermanently(id: string) {
  await db.transaction('rw', [db.students, db.observations, db.checkins, db.notes, db.icpAdjustments, db.icpChecks, db.plans, db.evidence], async () => {
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
  await db.transaction('rw', db.checkins, db.observations, async () => {
    await db.observations.where('checkinId').equals(checkinId).delete();
    await db.checkins.delete(checkinId);
  });
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
  if (!adj.evidence) return;
  await db.icpAdjustments.update(adj.id, { evidence: { ...adj.evidence, snoozedUntil: addDays(date, 1) } });
}

export async function addEvidence(adj: Pick<IcpAdjustment, 'id' | 'studentId'>, item: { kind: EvidenceKind; blob?: Blob; name?: string; text?: string }, date: string = todayISO()): Promise<EvidenceItem> {
  const e: EvidenceItem = {
    id: newId(), studentId: adj.studentId, adjustmentId: adj.id, date, kind: item.kind, createdAt: Date.now(),
    ...(item.blob ? { blob: item.blob, mime: item.blob.type, size: item.blob.size, name: item.name } : {}),
    ...(clean(item.text) ? { text: clean(item.text) } : {})
  };
  await db.evidence.add(e);
  return e;
}

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
export async function saveBlitz(classId: string, date: string, topicId: string, marks: Record<string, BlitzMark>) {
  const topic = blitzTopic(topicId);
  if (!topic) throw new Error('Unknown Blitz topic');
  const checkinId = `blitz|${date}|${classId}`;
  await db.transaction('rw', db.observations, async () => {
    await db.observations.where('checkinId').equals(checkinId).filter((o) => o.blitz === topicId).delete();
    const now = Date.now();
    await db.observations.bulkPut(Object.entries(marks).map(([studentId, m], i) => ({
      id: blitzObsId(date, topicId, studentId), checkinId, studentId, classId, date, createdAt: now + i,
      questionId: `blitz-${topicId}`, categoryId: topic.categoryId, blitz: topicId,
      response: m === 'yes' ? 'Yes' : m === 'no' ? 'No' : 'Absent', level: m === 'absent' ? null : m === 'no' ? 1 : 0
    })));
  });
}
