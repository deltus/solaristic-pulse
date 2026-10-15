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
