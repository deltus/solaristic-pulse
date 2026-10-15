import Dexie, { type Table } from 'dexie';
import type {
  Category, Checkin, DayPlan, IcpAdjustment, IcpCheck, Observation, Question,
  SchoolClass, Settings, Student, StudentNote, TimetableEntry
} from './types';
import { DEFAULT_SETTINGS } from './types';
import type { SavedFile } from './files';

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
  files!: Table<SavedFile, string>;

  constructor(name = 'solaristic-pulse') {
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
    this.on('populate', (tx) => {
      tx.table('categories').bulkAdd(CORE_CATEGORIES);
      tx.table('questions').bulkAdd(CORE_QUESTIONS);
    });
  }
}

export const TABLES = [
  'classes', 'students', 'checkins', 'observations', 'plans', 'questions', 'categories',
  'notes', 'icpAdjustments', 'icpChecks', 'timetable', 'kv'
] as const;
export type TableName = (typeof TABLES)[number];

export const STANDARD_OPTIONS = [
  { label: 'As expected', level: 0 as const },
  { label: 'Some difficulty', level: 1 as const },
  { label: 'Significant difficulty', level: 2 as const },
  { label: 'Not observed / unsure', level: null }
];

export const CORE_CATEGORIES: Category[] = [
  { id: 'focus', name: 'Attention / Focus', phrase: 'staying focused', builtIn: true },
  { id: 'homework', name: 'Homework', phrase: 'completing homework', builtIn: true },
  { id: 'behaviour', name: 'Behaviour', phrase: 'behaviour', builtIn: true }
];

export const CORE_QUESTIONS: Question[] = [
  {
    id: 'q-focus', text: 'Was {name} focused and engaged during the lesson?', categoryId: 'focus',
    options: [
      { label: 'Focused / as expected', level: 0 }, { label: 'Some difficulty', level: 1 },
      { label: 'Significant difficulty', level: 2 }, { label: 'Not observed / unsure', level: null }
    ],
    allowDetail: true, classIds: [], studentIds: [], frequencyDays: 0, enabled: true, builtIn: true, order: 0, shortText: 'Focused today?'
  },
  {
    id: 'q-homework', text: 'Did {name} complete their assigned homework?', categoryId: 'homework',
    options: [
      { label: 'Completed', level: 0 }, { label: 'Partly completed', level: 1 },
      { label: 'Not completed', level: 2 }, { label: 'None set / unsure', level: null }
    ],
    allowDetail: true, classIds: [], studentIds: [], frequencyDays: 0, enabled: true, builtIn: true, order: 1, shortText: 'Homework done?'
  },
  {
    id: 'q-behaviour', text: "Was {name}'s behaviour appropriate and productive?", categoryId: 'behaviour',
    options: [
      { label: 'Positive / as expected', level: 0 }, { label: 'Some difficulty', level: 1 },
      { label: 'Significant difficulty', level: 2 }, { label: 'Not observed / unsure', level: null }
    ],
    allowDetail: true, classIds: [], studentIds: [], frequencyDays: 0, enabled: true, builtIn: true, order: 2, shortText: 'Behaviour on track?'
  }
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
