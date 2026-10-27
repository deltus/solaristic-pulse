// Which tables sync, and which of their fields are encrypted before they leave the device.

export const SYNCED_TABLES = [
  'classes', 'students', 'checkins', 'observations', 'plans', 'questions', 'categories',
  'notes', 'icpAdjustments', 'icpChecks', 'timetable', 'checkouts', 'issueTags', 'homework', 'lessons', 'coldCalls'
] as const;
// Not synced: `evidence` (photos, files, voice memos stay on the device in this version).
export type SyncedTable = (typeof SYNCED_TABLES)[number];
export const isSynced = (t: string): t is SyncedTable => (SYNCED_TABLES as readonly string[]).includes(t);

/** Identifying or free-text fields: encrypted end to end. Everything else (ratings, dates, areas, weights) stays readable. */
export const ENCRYPTED: Record<SyncedTable, string[]> = {
  classes: [],
  students: ['firstName', 'lastName', 'preferredName', 'externalId', 'flag'],
  checkins: ['note'],
  observations: ['note', 'context'],
  plans: ['entries'],
  questions: [],
  categories: [],
  notes: ['text'],
  icpAdjustments: ['title', 'details', 'evidence'],
  icpChecks: ['note'],
  timetable: ['notes'],
  checkouts: ['note'],
  issueTags: ['note'],
  homework: [],
  // Learning intention, homework text and the teacher's own answers about the lesson.
  lessons: ['intention', 'homeworkText', 'happy', 'planDone', 'note'],
  coldCalls: []
};

type Row = Record<string, unknown>;

export function splitRow(tbl: SyncedTable, row: Row): { data: Row; secret: Row | null } {
  const data: Row = {};
  const secret: Row = {};
  let any = false;
  for (const [k, v] of Object.entries(row)) {
    if (ENCRYPTED[tbl].includes(k)) {
      if (v !== undefined) { secret[k] = v; any = true; }
    } else data[k] = v;
  }
  return { data, secret: any ? secret : null };
}

export const joinRow = (data: Row, secret: Row | null): Row => ({ ...data, ...(secret ?? {}) });
