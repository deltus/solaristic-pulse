import Dexie, { type Table } from 'dexie';
import type {
  Assessment, AssessmentCheck, Category, Relationship, Room, SeatingPlan, Checkin, Checkout, DayPlan, EvidenceItem, ColdCall, HomeworkCheck, IcpAdjustment, IssueTag, JournalEntry, Lesson, IcpCheck, Observation, Question,
  SchoolClass, Settings, Student, StudentNote, TimetableEntry
} from './types';
import { DEFAULT_SETTINGS } from './types';
import type { SavedFile } from './files';
import { outboxMiddleware, type OutboxEntry } from './sync/outbox';
import { dbName } from './preview';
import { SUB_MOVES } from './config/checkin';

export class PulseDB extends Dexie {
  classes!: Table<SchoolClass, string>;
  students!: Table<Student, string>;
  checkins!: Table<Checkin, string>;
  observations!: Table<Observation, string>;
  plans!: Table<DayPlan, string>;
  questions!: Table<Question, string>;
  categories!: Table<Category, string>;
  notes!: Table<StudentNote, string>;
  icpAdjustments!: Table<IcpAdjustment, string>;
  icpChecks!: Table<IcpCheck, string>;
  timetable!: Table<TimetableEntry, string>;
  kv!: Table<{ key: string; value: unknown }, string>;
  checkouts!: Table<Checkout, string>;
  issueTags!: Table<IssueTag, string>;
  homework!: Table<HomeworkCheck, string>;
  lessons!: Table<Lesson, string>;
  coldCalls!: Table<ColdCall, string>;
  journal!: Table<JournalEntry, string>;
  assessments!: Table<Assessment, string>;
  assessmentChecks!: Table<AssessmentCheck, string>;
  relationships!: Table<Relationship, string>;
  rooms!: Table<Room, string>;
  seatingPlans!: Table<SeatingPlan, string>;
  /** ICP evidence (photos, files, notes, voice). Device only: not synced or backed up. */
  evidence!: Table<EvidenceItem, string>;
  files!: Table<SavedFile, string>;
  /** Changes waiting to be sent to the cloud, and the sync position (not part of backups). */
  outbox!: Table<OutboxEntry, [string, string]>;
  syncState!: Table<{ key: string; value: unknown }, string>;

  constructor(name = dbName()) {
    super(name);
    this.version(1).stores({
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
      kv: 'key'
    });
    // v2: short prompts for the check-in card.
    // v3: recent saved files (not part of backups).
    this.version(3).stores({ files: 'id, createdAt' });
    this.version(2).stores({}).upgrade(async (tx) => {
      for (const q of CORE_QUESTIONS) await tx.table('questions').update(q.id, { shortText: q.shortText });
    });
    // v4: Effort / Prepared for class / Behaviour / Coping with work, two answers each.
    this.version(4).stores({}).upgrade(async (tx) => {
      for (const c of CORE_CATEGORIES) await tx.table('categories').put(c);
      for (const q of CORE_QUESTIONS) {
        const old = await tx.table('questions').get(q.id);
        await tx.table('questions').put(old ? { ...old, text: q.text, shortText: q.shortText, options: q.options, categoryId: q.categoryId, order: q.order } : q);
      }
    });
    // v5: live sync bookkeeping.
    this.version(5).stores({ outbox: '[tbl+id], at', syncState: 'key' });
    // v6: class focus check-outs, and ICP evidence kept on the device.
    this.version(6).stores({ checkouts: 'id, classId, date', evidence: 'id, studentId, adjustmentId, date' });
    // v7: swipe check-in. Effort becomes Attention, Prepared for class becomes historical
    // Preparedness (still fed by Blitz), old Effort difficulties get a "low effort" detail.
    this.version(7).stores({ issueTags: 'id, studentId, checkinId, classId, date', homework: 'id, studentId, classId, lessonId, date' }).upgrade(async (tx) => {
      await migrateToSwipe(tx);
    });
    // v8: lessons are records (open, close, teacher check) and cold calls. Days that already had
    // check-ins become closed "historical" lessons whose ids match the ids those check-ins already use.
    this.version(8).stores({ lessons: 'id, classId, date, status', coldCalls: 'id, studentId, classId, lessonId, date' }).upgrade(async (tx) => {
      await addHistoricalLessons(tx);
    });
    // v9: coping note tags follow the new coping list; evidence can belong to a check-in.
    this.version(9).stores({ evidence: 'id, studentId, adjustmentId, checkinId, date' }).upgrade(async (tx) => {
      const coping = CORE_CATEGORIES.find((c) => c.id === 'coping')!;
      await tx.table('categories').update('coping', { tags: coping.tags });
    });
    // v10: final check-in lists (round 3b). Wellbeing becomes its own flag; older sub-options move (SUB_MOVES).
    this.version(10).stores({}).upgrade(async (tx) => {
      await moveSubOptions(tx);
    });
    // v11: teacher journal, and assessments with their checks (round 4).
    this.version(11).stores({ journal: 'id, classId, date, lessonId', assessments: 'id, classId', assessmentChecks: 'id, assessmentId, studentId, classId, date' });
    // v14: seating plans (round 7). Numbered above round 5 (v12) and round 6 (v13) so the branches don't clash;
    // whichever round merges into main later must still use a version above the one live phones already have.
    this.version(14).stores({ relationships: 'id, classId, studentA, studentB, checkinId', rooms: 'id', seatingPlans: 'id, classId' });
    this.use(outboxMiddleware(this));
    this.on('populate', (tx) => {
      tx.table('categories').bulkAdd(CORE_CATEGORIES);
      tx.table('questions').bulkAdd(CORE_QUESTIONS);
    });
  }
}

export const TABLES = [
  'classes', 'students', 'checkins', 'observations', 'plans', 'questions', 'categories',
  'notes', 'icpAdjustments', 'icpChecks', 'timetable', 'checkouts', 'issueTags', 'homework', 'lessons', 'coldCalls', 'journal', 'assessments', 'assessmentChecks', 'relationships', 'rooms', 'seatingPlans', 'kv'
] as const;
export type TableName = (typeof TABLES)[number];

export const STANDARD_OPTIONS = [
  { label: 'As expected', level: 0 as const },
  { label: 'Some difficulty', level: 1 as const },
  { label: 'Significant difficulty', level: 2 as const },
  { label: 'Not observed / unsure', level: null }
];

/** Two answers for every core question; press and hold an answer to add a note. */
const TWO = (yes: string, no: string, noteOnNo = false) => [
  { label: yes, level: 0 as const },
  { label: no, level: 1 as const, ...(noteOnNo ? { askNote: true } : {}) }
];

export const CORE_CATEGORIES: Category[] = [
  { id: 'focus', name: 'Attention', phrase: 'attention', builtIn: true, notePrompt: 'What got in the way?', tags: ['Independent work', 'Group work', 'Whole class', 'Devices'] },
  { id: 'homework', name: 'Preparedness', phrase: 'being prepared for class', builtIn: true, notePrompt: 'What was missing?', tags: ['Homework', 'Equipment', 'Uniform', 'Late'] },
  { id: 'behaviour', name: 'Behaviour', phrase: 'behaviour', builtIn: true, notePrompt: 'What happened?', tags: ['Peers', 'Instructions', 'Transitions', 'Language'] },
  { id: 'coping', name: 'Coping with work', phrase: 'coping with the work', builtIn: true, notePrompt: 'What were they finding hard?', tags: ['Workload', 'Pace', 'Content', 'Dysregulated', 'Withdrawn'] },
  // Flag only: recorded when ticked, never as "fine". No running average.
  { id: 'wellbeing', name: 'Wellbeing', phrase: 'wellbeing', builtIn: true, notePrompt: 'What did you notice?', tags: [] }
];

const core = { allowDetail: true, classIds: [], studentIds: [], frequencyDays: 0, enabled: true, builtIn: true };
export const CORE_QUESTIONS: Question[] = [
  // Preparedness is now entered through Blitz; the question stays (switched off) for older records.
  { ...core, id: 'q-homework', order: 0, categoryId: 'homework', text: 'Was {name} prepared for class?', shortText: 'Prepared for class?', options: TWO('Meeting expectations', 'Needs support'), enabled: false },
  { ...core, id: 'q-focus', order: 1, categoryId: 'focus', text: "How was {name}'s attention?", shortText: 'Attention', options: TWO('Meeting expectations', 'Needs support') },
  { ...core, id: 'q-behaviour', order: 2, categoryId: 'behaviour', text: "How was {name}'s behaviour?", shortText: 'Behaviour today?', options: TWO('Meeting expectations', 'Needs support') },
  { ...core, id: 'q-coping', order: 3, categoryId: 'coping', text: 'Is {name} coping with the work?', shortText: 'Coping with the work?', options: TWO('Yes', 'No', true) },
  // Wellbeing is only recorded through its tick box on the issue screen, so it is never asked as a question.
  { ...core, id: 'q-wellbeing', order: 4, categoryId: 'wellbeing', text: 'Is {name} OK in themselves?', shortText: 'Wellbeing', options: TWO('Meeting expectations', 'Needs support'), enabled: false }
];

export let db = new PulseDB();

/** Used by tests to point the app at a fresh database. */
export function useDatabase(instance: PulseDB) {
  db = instance;
}

export async function getSettings(): Promise<Settings> {
  const row = await db.kv.get('settings');
  const stored = (row?.value ?? {}) as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    profile: { ...DEFAULT_SETTINGS.profile, ...stored.profile },
    reminders: { ...DEFAULT_SETTINGS.reminders, ...stored.reminders }
  };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await db.kv.put({ key: 'settings', value: next });
  return next;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Core categories first (Focus, Homework, Behaviour), then custom ones by name. */
export async function sortedCategories(): Promise<Category[]> {
  const order = CORE_CATEGORIES.map((c) => c.id);
  return (await db.categories.toArray()).sort((a, b) => {
    const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name);
  });
}

/** v7 upgrade (also used by tests): rename areas, switch off Prepared for class, add "low effort" details. */
export async function migrateToSwipe(tx: { table: (n: string) => Table<any, any> }) {
  for (const c of CORE_CATEGORIES) {
    const old = await tx.table('categories').get(c.id);
    await tx.table('categories').put(old ? { ...old, name: c.name, phrase: c.phrase, notePrompt: c.notePrompt } : c);
  }
  for (const q of CORE_QUESTIONS) {
    const old = await tx.table('questions').get(q.id);
    await tx.table('questions').put(old ? { ...old, text: q.text, shortText: q.shortText, enabled: q.enabled } : q);
  }
  const effort = (await tx.table('observations').where('questionId').equals('q-focus').toArray()) as Observation[];
  const tags: IssueTag[] = effort
    .filter((o) => !o.blitz && !o.source && (o.level ?? 0) >= 1)
    .map((o) => ({ id: `${o.checkinId}|focus|low_effort`, checkinId: o.checkinId, studentId: o.studentId, classId: o.classId, date: o.date, areaId: 'focus', tagId: 'low_effort', source: 'migrated', createdAt: o.createdAt }));
  if (tags.length) await tx.table('issueTags').bulkPut(tags);
}

/** v8 upgrade (also used by tests): one closed historical lesson per class per day that has records. */
export async function addHistoricalLessons(tx: { table: (n: string) => Table<any, any> }) {
  const ids = new Map<string, { date: string; classId: string }>();
  const add = (id: string | undefined, date: string, classId: string) => { const k = id ?? `${date}|${classId}`; if (!ids.has(k)) ids.set(k, { date, classId }); };
  await tx.table('checkins').each((c: Checkin) => add(c.lessonId, c.date, c.classId));
  await tx.table('homework').each((h: HomeworkCheck) => add(h.lessonId, h.date, h.classId));
  const existing = new Set(await tx.table('lessons').toCollection().primaryKeys());
  const rows: Lesson[] = [...ids].filter(([id]) => !existing.has(id)).map(([id, x]) => {
    const t = new Date(`${x.date}T09:00:00`).getTime();
    return { id, classId: x.classId, date: x.date, openedAt: t, closedAt: t + 3_600_000, status: 'closed', historical: true, createdAt: t };
  });
  if (rows.length) await tx.table('lessons').bulkPut(rows);
}

export interface SubMoveCounts { tagsMoved: number; toWellbeing: number; wellbeingRows: number; copingCleared: number }

/**
 * v10 upgrade (also used by tests): older sub-options follow the round 3b lists (SUB_MOVES).
 * Check-ins whose coping details move to Wellbeing get a Wellbeing row; if none of their coping
 * details are left, Coping goes back to "meets" (the note moves with them). Coping "needs support"
 * with no details at all stays as Coping.
 */
export async function moveSubOptions(tx: { table: (n: string) => Table<any, any> }): Promise<SubMoveCounts> {
  if (!(await tx.table('categories').get(WELLBEING_CATEGORY.id))) await tx.table('categories').put(WELLBEING_CATEGORY);
  if (!(await tx.table('questions').get(WELLBEING_QUESTION.id))) await tx.table('questions').put(WELLBEING_QUESTION);
  const counts: SubMoveCounts = { tagsMoved: 0, toWellbeing: 0, wellbeingRows: 0, copingCleared: 0 };
  const tags = (await tx.table('issueTags').toArray()) as IssueTag[];
  const touched = new Set<string>();
  for (const t of tags) {
    const to = SUB_MOVES[`${t.areaId}|${t.tagId}`];
    if (!to) continue;
    const id = `${t.checkinId}|${to[0]}|${to[1]}`;
    await tx.table('issueTags').delete(t.id);
    if (!tags.some((x) => x.id === id)) await tx.table('issueTags').put({ ...t, id, areaId: to[0], tagId: to[1] });
    counts.tagsMoved++;
    if (to[0] === 'wellbeing') { counts.toWellbeing++; touched.add(t.checkinId); }
  }
  for (const checkinId of touched) {
    const coping = (await tx.table('observations').get(`${checkinId}|q-coping`)) as Observation | undefined;
    if (!coping) continue;
    const left = await tx.table('issueTags').where('checkinId').equals(checkinId).filter((t: IssueTag) => t.areaId === 'coping').count();
    const id = `${checkinId}|${WELLBEING_QUESTION.id}`;
    const moveNote = !left && !!coping.note;
    if (!(await tx.table('observations').get(id))) {
      await tx.table('observations').put({
        ...coping, id, questionId: WELLBEING_QUESTION.id, categoryId: WELLBEING_CATEGORY.id, response: 'Needs support', level: 1, source: coping.source ?? 'observed',
        note: moveNote ? coping.note : undefined
      });
      counts.wellbeingRows++;
    }
    if (!left) {
      await tx.table('observations').put({ ...coping, response: 'Meeting expectations', level: 0, source: 'implied', note: undefined });
      counts.copingCleared++;
    }
  }
  return counts;
}

export const WELLBEING_CATEGORY = CORE_CATEGORIES.find((c) => c.id === 'wellbeing')!;
export const WELLBEING_QUESTION = CORE_QUESTIONS.find((q) => q.id === 'q-wellbeing')!;
