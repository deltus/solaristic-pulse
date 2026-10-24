// Long-term data exports in SQL form, generated on the device:
//  - a .sql script (CREATE TABLE + INSERT) that loads into SQLite, PostgreSQL, MySQL or SQL Server
//  - a .sqlite database file (the same script run through sql.js) for Power BI, Excel or DB Browser

import { db, getSettings } from './db';
import { makeScrubber, pseudonymMap } from './logic/deidentify';
import { splitMinutes } from './logic/checkout';

type Val = string | number | null | undefined;
const q = (v: Val) => (v === null || v === undefined || v === '' ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const b = (v: boolean | undefined) => (v ? 1 : 0);

const SCHEMA: Record<string, string[]> = {
  classes: ['id VARCHAR(64) PRIMARY KEY', 'name TEXT', 'subject TEXT', 'year_level TEXT', 'archived INTEGER'],
  students: ['id VARCHAR(64) PRIMARY KEY', 'class_id VARCHAR(64)', 'first_name TEXT', 'last_name TEXT', 'preferred_name TEXT', 'school_id TEXT', 'archived INTEGER', 'flagged INTEGER', 'flag_reason TEXT', 'priority_adjust REAL'],
  categories: ['id VARCHAR(64) PRIMARY KEY', 'name TEXT'],
  questions: ['id VARCHAR(64) PRIMARY KEY', 'text TEXT', 'category_id VARCHAR(64)', 'built_in INTEGER', 'enabled INTEGER'],
  checkins: ['id VARCHAR(160) PRIMARY KEY', 'student_id VARCHAR(64)', 'class_id VARCHAR(64)', 'date VARCHAR(10)', 'status VARCHAR(16)', 'source VARCHAR(16)', 'draw_weight REAL'],
  observations: ['id VARCHAR(240) PRIMARY KEY', 'checkin_id VARCHAR(160)', 'student_id VARCHAR(64)', 'class_id VARCHAR(64)', 'date VARCHAR(10)', 'question_id VARCHAR(64)', 'category_id VARCHAR(64)', 'response TEXT', 'level INTEGER', 'follow_up_outcome VARCHAR(16)', 'follow_up_of VARCHAR(240)', 'context TEXT', 'note TEXT', 'blitz_topic VARCHAR(32)'],
  notes: ['id VARCHAR(64) PRIMARY KEY', 'student_id VARCHAR(64)', 'date VARCHAR(10)', 'text TEXT'],
  icp_adjustments: ['id VARCHAR(64) PRIMARY KEY', 'student_id VARCHAR(64)', 'title TEXT', 'details TEXT', 'frequency VARCHAR(16)', 'start_date VARCHAR(10)', 'end_date VARCHAR(10)', 'active INTEGER'],
  icp_checks: ['id VARCHAR(160) PRIMARY KEY', 'adjustment_id VARCHAR(64)', 'student_id VARCHAR(64)', 'date VARCHAR(10)', 'outcome VARCHAR(16)', 'note TEXT'],
  timetable: ['id VARCHAR(64) PRIMARY KEY', 'class_id VARCHAR(64)', 'day INTEGER', 'start_time VARCHAR(5)', 'end_time VARCHAR(5)', 'room TEXT', 'notes TEXT'],
  checkouts: ['id VARCHAR(160) PRIMARY KEY', 'class_id VARCHAR(64)', 'date VARCHAR(10)', 'timetable_id VARCHAR(64)', 'lesson_start VARCHAR(5)', 'lesson_minutes INTEGER', 'pct_working INTEGER', 'minutes_working INTEGER', 'minutes_distracted INTEGER', 'note TEXT']
};

export async function buildSqlScript(opts: { deidentify: boolean }): Promise<string> {
  const [settings, classes, students, categories, questions, checkins, observations, notes, adjustments, icpChecks, timetable, checkouts] = await Promise.all([
    getSettings(), db.classes.toArray(), db.students.toArray(), db.categories.toArray(), db.questions.toArray(), db.checkins.toArray(),
    db.observations.toArray(), db.notes.toArray(), db.icpAdjustments.toArray(), db.icpChecks.toArray(), db.timetable.toArray(), db.checkouts.toArray()
  ]);
  const pseudo = pseudonymMap(students);
  const scrub = opts.deidentify ? makeScrubber(students, pseudo, [settings.profile.name, settings.profile.school ?? '']) : (t?: string) => t ?? '';

  const rows: Record<string, Val[][]> = {
    classes: classes.map((c) => [c.id, c.name, c.subject, c.yearLevel, b(c.archived)]),
    students: students.map((s) => opts.deidentify
      ? [s.id, s.classId, pseudo.get(s.id), null, null, null, b(s.archived), b(!!s.flag), scrub(s.flag?.reason), s.priorityAdjust]
      : [s.id, s.classId, s.firstName, s.lastName, s.preferredName, s.externalId, b(s.archived), b(!!s.flag), s.flag?.reason, s.priorityAdjust]),
    categories: categories.map((c) => [c.id, c.name]),
    questions: questions.map((x) => [x.id, x.text, x.categoryId, b(x.builtIn), b(x.enabled)]),
    checkins: checkins.map((c) => [c.id, c.studentId, c.classId, c.date, c.status, c.source, c.weight]),
    observations: observations.map((o) => [o.id, o.checkinId, o.studentId, o.classId, o.date, o.questionId, o.categoryId, o.response, o.level, o.followUp?.outcome, o.followUp?.previousId, o.context, scrub(o.note), o.blitz]),
    notes: notes.map((n) => [n.id, n.studentId, n.date, scrub(n.text)]),
    icp_adjustments: adjustments.map((a) => [a.id, a.studentId, scrub(a.title), scrub(a.details), a.frequency, a.startDate, a.endDate, b(a.active)]),
    icp_checks: icpChecks.map((c) => [c.id, c.adjustmentId, c.studentId, c.date, c.outcome, scrub(c.note)]),
    timetable: timetable.map((t) => [t.id, t.classId, t.day, t.start, t.end, t.room, t.notes]),
    checkouts: checkouts.map((c) => { const m = splitMinutes(c.lessonMin, c.pctWorking); return [c.id, c.classId, c.date, c.timetableId, c.start, c.lessonMin, c.pctWorking, m.working, m.distracted, scrub(c.note)]; })
  };

  const out = [
    `-- Solaristic Radar data export, ${new Date().toISOString()}`,
    `-- ${opts.deidentify ? 'De-identified: names replaced with pseudonyms; notes may still contain identifying details.' : 'Contains student names. Store and share according to school policy.'}`,
    '-- Standard SQL: loads into SQLite, PostgreSQL, MySQL and SQL Server. Difficulty level: 0 = meeting expectations, 1+ = needs support, NULL = not rated.',
    ''
  ];
  for (const [table, cols] of Object.entries(SCHEMA)) {
    out.push(`CREATE TABLE ${table} (\n  ${cols.join(',\n  ')}\n);`);
    const names = cols.map((c) => c.split(' ')[0]).join(', ');
    for (const r of rows[table]) out.push(`INSERT INTO ${table} (${names}) VALUES (${r.map(q).join(', ')});`);
    out.push('');
  }
  return out.join('\n');
}

/** Runs the script through sql.js (SQLite compiled to WebAssembly) and returns the database file. */
export async function buildSqliteFile(opts: { deidentify: boolean }, init?: () => Promise<import('sql.js').SqlJsStatic>): Promise<Blob> {
  const script = await buildSqlScript(opts);
  const SQL = init ? await init() : await (async () => {
    const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]);
    return initSqlJs({ locateFile: () => wasmUrl });
  })();
  const sqlite = new SQL.Database();
  sqlite.exec(`BEGIN;\n${script}\nCOMMIT;`);
  const bytes = sqlite.export();
  sqlite.close();
  return new Blob([bytes as BlobPart], { type: 'application/vnd.sqlite3' });
}
