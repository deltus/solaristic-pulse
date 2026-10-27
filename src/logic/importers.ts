// Pure parsers for roster and timetable spreadsheets. Input is an array of rows
// (first row = headers), as produced by SheetJS for CSV or XLSX files.

import { normaliseTime } from '../lib/dates';

type Cell = string | number | boolean | null | undefined;
const norm = (h: Cell) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const str = (c: Cell) => String(c ?? '').trim();

function findCol(headers: string[], names: string[]): number {
  return headers.findIndex((h) => names.includes(h));
}

export interface RosterRow {
  firstName: string;
  lastName: string;
  preferredName?: string;
  externalId?: string;
  className?: string;
  /** Teacher adjustment to the draw weight (-0.5 … +1). */
  priorityAdjust?: number;
}

export function parseRoster(rows: Cell[][]): { rows: RosterRow[]; errors: string[] } {
  const errors: string[] = [];
  if (!rows.length) return { rows: [], errors: ['The file is empty.'] };
  const h = rows[0].map(norm);
  const first = findCol(h, ['first', 'firstname', 'given', 'givenname', 'forename']);
  const last = findCol(h, ['last', 'lastname', 'surname', 'family', 'familyname']);
  const full = findCol(h, ['name', 'student', 'studentname', 'fullname']);
  const pref = findCol(h, ['preferred', 'preferredname', 'nickname', 'knownas']);
  const id = findCol(h, ['id', 'studentid', 'studentnumber', 'code', 'studentcode']);
  const cls = findCol(h, ['class', 'classname', 'group', 'rollclass', 'classcode']);
  const prio = findCol(h, ['priority', 'weight', 'drawweight', 'startingpriority']);
  if (first < 0 && full < 0) {
    return { rows: [], errors: ['No name column found. Use headers such as "First name", "Last name" or "Name".'] };
  }

  const out: RosterRow[] = [];
  rows.slice(1).forEach((r, i) => {
    if (!r || r.every((c) => str(c) === '')) return;
    let firstName = first >= 0 ? str(r[first]) : '';
    let lastName = last >= 0 ? str(r[last]) : '';
    if (!firstName && full >= 0) {
      const n = str(r[full]);
      if (n.includes(',')) {
        [lastName, firstName] = n.split(',').map((x) => x.trim());
      } else {
        const parts = n.split(/\s+/);
        lastName = parts.length > 1 ? parts.pop()! : '';
        firstName = parts.join(' ');
      }
    }
    if (!firstName) {
      errors.push(`Row ${i + 2}: missing first name, skipped.`);
      return;
    }
    out.push({
      firstName, lastName,
      preferredName: pref >= 0 ? str(r[pref]) || undefined : undefined,
      externalId: id >= 0 ? str(r[id]) || undefined : undefined,
      className: cls >= 0 ? str(r[cls]) || undefined : undefined,
      priorityAdjust: prio >= 0 ? parsePriority(r[prio]) : undefined
    });
  });
  return { rows: out, errors };
}

const DAYS: Record<string, number> = {
  mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6, sun: 7, sunday: 7
};

export function parseDay(raw: Cell): number | null {
  const s = str(raw).toLowerCase();
  if (/^[1-7]$/.test(s)) return Number(s);
  return DAYS[s.replace(/[^a-z]/g, '')] ?? null;
}

export interface TimetableRow {
  className: string;
  day: number;
  start: string;
  end: string;
  room?: string;
  notes?: string;
}

export function parseTimetable(rows: Cell[][]): { rows: TimetableRow[]; errors: string[] } {
  const errors: string[] = [];
  if (!rows.length) return { rows: [], errors: ['The file is empty.'] };
  const h = rows[0].map(norm);
  const cls = findCol(h, ['class', 'classname', 'subject', 'lesson']);
  const day = findCol(h, ['day', 'dayofweek', 'weekday']);
  const start = findCol(h, ['start', 'starttime', 'from', 'begin']);
  const end = findCol(h, ['end', 'endtime', 'finish', 'finishtime', 'to']);
  const time = findCol(h, ['time', 'times', 'period']);
  const room = findCol(h, ['room', 'location']);
  const notes = findCol(h, ['notes', 'note', 'lessonnotes', 'reminder', 'reminders']);
  if (cls < 0 || day < 0 || ((start < 0 || end < 0) && time < 0)) {
    return { rows: [], errors: ['Expected columns: Class, Day, Start, End (or Time as "09:00-10:00"), optional Room, Notes.'] };
  }
  const out: TimetableRow[] = [];
  rows.slice(1).forEach((r, i) => {
    if (!r || r.every((c) => str(c) === '')) return;
    const line = `Row ${i + 2}`;
    const className = str(r[cls]);
    const d = parseDay(r[day]);
    let s: string | null, e: string | null;
    if (start >= 0 && end >= 0 && str(r[start])) {
      s = normaliseTime(str(r[start]));
      e = normaliseTime(str(r[end]));
    } else {
      const [a, b] = str(r[time]).split(/\s*(?:-|–|to)\s*/);
      s = normaliseTime(a ?? '');
      e = normaliseTime(b ?? '');
    }
    if (!className) return void errors.push(`${line}: missing class.`);
    if (!d) return void errors.push(`${line}: unrecognised day "${str(r[day])}".`);
    if (!s || !e) return void errors.push(`${line}: unrecognised time.`);
    if (e <= s) return void errors.push(`${line}: finish time must be after start time.`);
    out.push({
      className, day: d, start: s, end: e,
      room: room >= 0 ? str(r[room]) || undefined : undefined,
      notes: notes >= 0 ? str(r[notes]) || undefined : undefined
    });
  });
  return { rows: out, errors };
}

/**
 * Starting priority from a roster cell. Accepts a weight (0.5–2.0, standard 1.0)
 * or a word: lower, standard, higher, highest.
 */
export function parsePriority(raw: Cell): number | undefined {
  const s = str(raw).toLowerCase();
  if (!s) return undefined;
  const words: Record<string, number> = { low: -0.5, lower: -0.5, standard: 0, normal: 0, high: 0.5, higher: 0.5, highest: 1, 'very high': 1 };
  if (s in words) return words[s];
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n)) return undefined;
  return Math.round(Math.max(-0.5, Math.min(1, n - 1)) * 100) / 100;
}

/** Parses pasted names: one per line, "First Last", "Last, First" or tab-separated columns. */
export function parseNameLines(text: string): { firstName: string; lastName: string }[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    if (l.includes('\t')) {
      const [f, ...r] = l.split('\t').map((x) => x.trim());
      return { firstName: f, lastName: r.join(' ') };
    }
    if (l.includes(',')) {
      const [last, first] = l.split(',').map((x) => x.trim());
      return first ? { firstName: first, lastName: last } : { firstName: last, lastName: '' };
    }
    const parts = l.split(/\s+/);
    return parts.length > 1 ? { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] } : { firstName: parts[0], lastName: '' };
  }).filter((n) => n.firstName);
}

/* ---------- ICP adjustments ---------- */

export interface IcpImportRow { row: number; studentId?: string; studentName?: string; className?: string; adjustment: string; notes?: string }

/** Columns: student ID or name, class (optional), adjustment, notes (optional). */
export function parseIcpImport(rows: Cell[][]): { rows: IcpImportRow[]; errors: string[] } {
  const errors: string[] = [];
  if (!rows.length) return { rows: [], errors: ['The file is empty.'] };
  const h = rows[0].map(norm);
  const id = findCol(h, ['studentid', 'id', 'studentnumber', 'studentcode', 'code']);
  const name = findCol(h, ['studentname', 'name', 'student', 'fullname']);
  const first = findCol(h, ['first', 'firstname', 'given', 'givenname']);
  const last = findCol(h, ['last', 'lastname', 'surname', 'familyname']);
  const cls = findCol(h, ['class', 'classname', 'group', 'rollclass']);
  const adj = findCol(h, ['adjustment', 'adjustments', 'icp', 'icpadjustment', 'support', 'strategy']);
  const notes = findCol(h, ['notes', 'note', 'details', 'detail', 'comments']);
  if (adj < 0) return { rows: [], errors: ['No "Adjustment" column found. Download the template to see the columns.'] };
  if (id < 0 && name < 0 && first < 0) return { rows: [], errors: ['No student column found. Use "Student ID" or "Student name".'] };
  const out: IcpImportRow[] = [];
  rows.slice(1).forEach((r, i) => {
    if (!r || r.every((c) => str(c) === '')) return;
    const adjustment = str(r[adj]);
    const studentName = name >= 0 && str(r[name]) ? str(r[name]) : [first >= 0 ? str(r[first]) : '', last >= 0 ? str(r[last]) : ''].filter(Boolean).join(' ');
    const studentId = id >= 0 ? str(r[id]) || undefined : undefined;
    if (!adjustment) { errors.push(`Row ${i + 2}: no adjustment, skipped.`); return; }
    if (!studentId && !studentName) { errors.push(`Row ${i + 2}: no student, skipped.`); return; }
    out.push({ row: i + 2, studentId, studentName: studentName || undefined, className: cls >= 0 ? str(r[cls]) || undefined : undefined, adjustment, notes: notes >= 0 ? str(r[notes]) || undefined : undefined });
  });
  return { rows: out, errors };
}

export type IcpMatchStatus = 'ok' | 'unknown' | 'ambiguous' | 'duplicate';
export interface IcpMatch { row: IcpImportRow; status: IcpMatchStatus; studentId?: string; problem?: string }

/**
 * Preview for an ICP import: which student each row belongs to (by student ID, else by name, narrowed
 * by class), and problems: unknown or ambiguous student, or an adjustment the student already has
 * (or that appears twice in the file).
 */
export function matchIcpImport(
  rows: IcpImportRow[],
  students: { id: string; firstName: string; lastName: string; preferredName?: string; externalId?: string; classId: string; archived?: boolean }[],
  classes: { id: string; name: string }[],
  existing: { studentId: string; title: string; active?: boolean }[]
): IcpMatch[] {
  const k = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const live = students.filter((s) => !s.archived);
  const names = (s: (typeof live)[number]) => new Set([
    k(`${s.firstName} ${s.lastName}`), k(`${s.lastName}, ${s.firstName}`), k(`${s.lastName} ${s.firstName}`),
    ...(s.preferredName ? [k(`${s.preferredName} ${s.lastName}`)] : [])
  ]);
  const have = new Set(existing.filter((a) => a.active !== false).map((a) => `${a.studentId}|${k(a.title)}`));
  const inFile = new Set<string>();
  return rows.map((row): IcpMatch => {
    let found = row.studentId ? live.filter((s) => s.externalId && k(s.externalId) === k(row.studentId!)) : [];
    if (!found.length && row.studentName) found = live.filter((s) => names(s).has(k(row.studentName!)));
    if (row.className && found.length > 1) {
      const c = classes.find((x) => k(x.name) === k(row.className!));
      if (c) found = found.filter((s) => s.classId === c.id);
    }
    const who = row.studentName ?? row.studentId;
    if (!found.length) return { row, status: 'unknown', problem: `No student matches "${who}"` };
    if (found.length > 1) return { row, status: 'ambiguous', problem: `${found.length} students match "${who}": add a Student ID or Class` };
    const key = `${found[0].id}|${k(row.adjustment)}`;
    if (have.has(key)) return { row, status: 'duplicate', studentId: found[0].id, problem: 'Already has this adjustment' };
    if (inFile.has(key)) return { row, status: 'duplicate', studentId: found[0].id, problem: 'Listed twice in the file' };
    inFile.add(key);
    return { row, status: 'ok', studentId: found[0].id };
  });
}
