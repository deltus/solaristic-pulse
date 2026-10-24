import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { PulseDB, useDatabase, db, saveSettings } from '../src/db';
import { loadDemoData } from '../src/demo';
import { addNote } from '../src/services';
import { buildExport, toBlob, type ExportOptions } from '../src/exporting';

let classIds: string[] = [];
let bill = '';
const allCats = async () => (await db.categories.toArray()).map((c) => c.id);

beforeAll(async () => {
  useDatabase(new PulseDB('export-test'));
  await db.open();
  await loadDemoData();
  await saveSettings({ profile: { name: 'Alex Morgan', email: 'alex@example.edu.au', school: 'Fictional Bay College' } });
  classIds = (await db.classes.toArray()).map((c) => c.id);
  bill = (await db.students.filter((s) => s.firstName === 'William' && s.lastName === 'Harris').first())!.id;
  // A note that mentions several identifiers, to test scrubbing.
  await addNote(bill, 'Bill Harris sat with Ethan Taylor; Ms Alex Morgan from Fictional Bay College called home.');
});

async function readBack(o: ExportOptions) {
  const r = await buildExport(o);
  const blob = await toBlob(r.sheets, 'xlsx');
  const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' });
  const text = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n');
  return { r, wb, text };
}

const base = (): ExportOptions => ({
  kind: 'class', classIds, categoryIds: [], includeNotes: true, includeIcp: true, deidentify: false, hideClassNames: false
});

describe('exports (scenarios 11, 13, 14)', () => {
  it('class export contains the expected sheets and names', async () => {
    const { wb, text, r } = await readBack({ ...base(), categoryIds: await allCats() });
    expect(wb.SheetNames).toEqual(['Summary', 'Observations', 'Check-ins', 'Check-outs', 'Teacher notes', 'ICP adjustments', 'ICP check-ins', 'About this report']);
    expect(text).toContain('Bill Harris');
    expect(r.students).toBe(36);
    expect(r.observations).toBeGreaterThan(100);
  });

  it('de-identified export removes names, IDs and identifying terms from every sheet', async () => {
    const { text, wb } = await readBack({ ...base(), categoryIds: await allCats(), deidentify: true, hideClassNames: true });
    const students = await db.students.toArray();
    for (const s of students) {
      for (const n of [s.firstName, s.lastName, s.preferredName].filter(Boolean) as string[]) {
        expect(text, `leaked ${n}`).not.toMatch(new RegExp(`\\b${n.replace("'", "'")}\\b`));
      }
    }
    expect(text).not.toMatch(/Alex Morgan|Fictional Bay College|7B English|9C Science/);
    expect(text).toMatch(/Student 0\d\d/);
    expect(text).toContain('[redacted]');
    const about = XLSX.utils.sheet_to_csv(wb.Sheets['About this report']);
    expect(about).toMatch(/notes can still contain identifying details/);
    // Same student → same pseudonym across sheets.
    const summary = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets.Summary);
    const obs = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets.Observations);
    expect(new Set(obs.map((o) => o.Student)).size).toBeLessThanOrEqual(summary.length);
    expect(Object.keys(obs[0])).not.toContain('Student ID');
  });

  it('filters by date, category and notes', async () => {
    const { wb } = await readBack({ ...base(), categoryIds: ['homework'], includeNotes: false, includeIcp: false, from: '2099-01-01' });
    expect(wb.SheetNames).not.toContain('ICP adjustments');
    expect(wb.SheetNames).not.toContain('Teacher notes');
    const obs = XLSX.utils.sheet_to_json(wb.Sheets.Observations);
    expect(obs).toHaveLength(0);
    const head = XLSX.utils.sheet_to_json<string[]>(wb.Sheets.Observations, { header: 1 })[0];
    expect(head).not.toContain('Teacher notes');
  });

  it('individual student report includes trends, follow-ups, ICP history and before/after comparison', async () => {
    const { wb, text } = await readBack({ ...base(), kind: 'student', studentId: bill, categoryIds: await allCats() });
    expect(wb.SheetNames).toEqual(expect.arrayContaining(['Summary', 'Observations', 'Follow-ups', 'Changes over time', 'Teacher notes', 'ICP adjustments', 'ICP check-ins', 'ICP vs observations', 'About this report']));
    expect(text).toContain('Preferential seating near the teacher');
    expect(text).toMatch(/association only|Not enough|similar before and after/);
    expect(text).not.toMatch(/(?<!not that the )adjustment (has )?(caused|led to|resulted in)/i);
    const deid = await readBack({ ...base(), kind: 'student', studentId: bill, categoryIds: await allCats(), deidentify: true });
    expect(deid.text).not.toMatch(/Harris|William|\bBill\b/);
    expect(deid.r.baseName).toMatch(/Student-0\d\d/);
  });

  it('CSV export contains the observation rows', async () => {
    const r = await buildExport({ ...base(), categoryIds: await allCats() });
    const csv = await (await toBlob(r.sheets, 'csv')).text();
    expect(csv.split('\n')[0]).toContain('Student,Student ID,Class,Date,Category');
    expect(csv.split('\n').length).toBeGreaterThan(100);
  });
});

import initSqlJs from 'sql.js';
import { buildSqlScript, buildSqliteFile } from '../src/sqlExport';

describe('SQL exports', () => {
  it('builds a valid SQL script and SQLite database with all history', async () => {
    const script = await buildSqlScript({ deidentify: false });
    expect(script).toContain('CREATE TABLE observations');
    expect(script).toContain("'Harris'");
    const blob = await buildSqliteFile({ deidentify: false }, () => initSqlJs());
    const SQL = await initSqlJs();
    const sq = new SQL.Database(new Uint8Array(await blob.arrayBuffer()));
    const n = sq.exec('SELECT COUNT(*) FROM observations')[0].values[0][0] as number;
    expect(n).toBe(await db.observations.count());
    const co = sq.exec('SELECT COUNT(*), MIN(pct_working) >= 0, SUM(minutes_working + minutes_distracted = lesson_minutes) = COUNT(*) FROM checkouts')[0].values[0];
    expect(co).toEqual([await db.checkouts.count(), 1, 1]);
    const byArea = sq.exec("SELECT category_id, ROUND(AVG(level > 0), 2) FROM observations WHERE level IS NOT NULL GROUP BY category_id");
    expect(byArea[0].values.length).toBeGreaterThan(2);
    sq.close();
  });
  it('de-identifies names in the SQL export', async () => {
    const script = await buildSqlScript({ deidentify: true });
    expect(script).not.toMatch(/Harris|William|Fictional Bay College/);
    expect(script).toMatch(/'Student 0\d\d'/);
  });
});
