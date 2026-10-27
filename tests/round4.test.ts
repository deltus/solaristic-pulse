import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Assessment, Student } from '../src/types';
import { PulseDB, useDatabase, db } from '../src/db';
import * as svc from '../src/services';
import { parseIcpImport, matchIcpImport, parseNameLines } from '../src/logic/importers';
import { activeAssessments, assessmentSummary, isActiveAssessment, pastAssessments } from '../src/logic/assessments';
import { rankByNeed, recentConcern } from '../src/logic/need';
import { defaultJournalLesson, filterJournal, journalDocumentXml } from '../src/logic/journal';
import { buildExport, classTitle, exportBaseName, yearShort } from '../src/exporting';
import { buildSqlScript } from '../src/sqlExport';
import { today } from '../src/lib/dates';

let n = 0;
beforeEach(async () => {
  const instance = new PulseDB(`round4-${++n}`);
  useDatabase(instance);
  await instance.open();
});

describe('second class setup', () => {
  it('works by typing names', async () => {
    await svc.createClass({ name: '7B English' });
    const c = await svc.createClass({ name: '8C Science', subject: 'Science', yearLevel: 'Year 8' });
    const r = await svc.addStudentsByName(c.id, parseNameLines('Ava Example\nSample, Ben\nAva Example'));
    expect(r.added).toBe(2);
    expect((await db.students.where('classId').equals(c.id).toArray()).map((s) => s.firstName).sort()).toEqual(['Ava', 'Ben']);
    expect(await db.classes.get(c.id)).toMatchObject({ subject: 'Science', yearLevel: 'Year 8' });
  });

  it('"Import students" inside a class only adds to that class, even with a Class column', async () => {
    const a = await svc.createClass({ name: '7B English' });
    const b = await svc.createClass({ name: '8C Science' });
    const r = await svc.importStudentsIntoClass([{ firstName: 'Cleo', lastName: 'Test', className: '7B English' }, { firstName: 'Dev', lastName: 'Test', className: 'New class' }], b.id);
    expect(r.added).toBe(2);
    expect(await db.students.where('classId').equals(b.id).count()).toBe(2);
    expect(await db.students.where('classId').equals(a.id).count()).toBe(0);
    expect(await db.classes.count()).toBe(2);
  });
});

describe('ICP adjustments', () => {
  it('saves several at once, skips ones the student already has, and can flag the student', async () => {
    const c = await svc.createClass({ name: '7B' });
    const s = await svc.addStudent(c.id, { firstName: 'Ava', lastName: 'Test' });
    await svc.saveAdjustment({ studentId: s.id, title: 'Extra time' });
    const r = await svc.saveAdjustments(s.id, [{ title: 'Extra time' }, { title: 'Movement breaks' }, { title: 'Reader or scribe', details: 'For tests' }], { frequency: 'weekly' }, 'New ICP adjustments');
    expect(r.added.map((a) => a.title)).toEqual(['Movement breaks', 'Reader or scribe']);
    expect(r.skipped).toBe(1);
    expect(r.added.every((a) => a.frequency === 'weekly')).toBe(true);
    expect((await db.students.get(s.id))?.flag?.reason).toBe('New ICP adjustments');
    // Unticked: not flagged.
    const t = await svc.addStudent(c.id, { firstName: 'Ben', lastName: 'Test' });
    await svc.saveAdjustments(t.id, [{ title: 'Visual supports' }]);
    expect((await db.students.get(t.id))?.flag).toBeUndefined();
  });

  it('CSV import shows matches, unknown students and duplicates in the preview', () => {
    const students = [
      { id: 's1', firstName: 'Ava', lastName: 'Example', externalId: 'S1001', classId: 'c1' },
      { id: 's2', firstName: 'Ben', lastName: 'Sample', classId: 'c1' },
      { id: 's3', firstName: 'Ben', lastName: 'Sample', classId: 'c2' }
    ] as Student[];
    const classes = [{ id: 'c1', name: '7B English' }, { id: 'c2', name: '8C Science' }];
    const parsed = parseIcpImport([
      ['Student ID', 'Student name', 'Class', 'Adjustment', 'Notes'],
      ['S1001', '', '', 'Extra time', '25% extra'],
      ['', 'Ben Sample', '7B English', 'Chunked instructions', ''],
      ['', 'Ben Sample', '', 'Visual supports', ''],
      ['', 'Zed Nobody', '', 'Extra time', ''],
      ['', 'Ava Example', '', 'Seated near the front', ''],
      ['S1001', '', '', 'Extra time', ''],
      ['', 'Ava Example', '', '', '']
    ]);
    expect(parsed.rows).toHaveLength(6);
    expect(parsed.errors).toEqual(['Row 8: no adjustment, skipped.']);
    const m = matchIcpImport(parsed.rows, students, classes, [{ studentId: 's1', title: 'Seated near the front', active: true }]);
    expect(m.map((x) => x.status)).toEqual(['ok', 'ok', 'ambiguous', 'unknown', 'duplicate', 'duplicate']);
    expect(m[0].studentId).toBe('s1');
    expect(m[1].studentId).toBe('s2');
    expect(m[5].problem).toBe('Listed twice in the file');
  });

  it('imports only the rows marked ready', async () => {
    const c = await svc.createClass({ name: '7B' });
    const s = await svc.addStudent(c.id, { firstName: 'Ava', lastName: 'Test' });
    const n = await svc.importIcpRows([
      { row: { row: 2, studentName: 'Ava Test', adjustment: 'Extra time', notes: '25%' }, status: 'ok', studentId: s.id },
      { row: { row: 3, studentName: 'Zed', adjustment: 'Extra time' }, status: 'unknown' }
    ]);
    expect(n).toBe(1);
    expect(await db.icpAdjustments.toArray()).toMatchObject([{ studentId: s.id, title: 'Extra time', details: '25%' }]);
  });
});

describe('year level in exports', () => {
  it('shortens year levels and puts them in file names', () => {
    expect(yearShort('Year 8')).toBe('Yr 8');
    expect(yearShort('8')).toBe('Yr 8');
    expect(yearShort('Foundation')).toBe('Foundation');
    expect(classTitle('8B Science', 'Year 8')).toBe('8B Science (Yr 8)');
    expect(exportBaseName({ kind: 'class', classes: [{ name: '8B Science', yearLevel: 'Year 8' }], date: '2026-10-27', deidentified: false })).toBe('8B Science (Yr 8) – class report 2026-10-27');
  });

  it('adds a Year level column next to Class, and keeps it when de-identified', async () => {
    const c = await svc.createClass({ name: '8B Science', yearLevel: 'Year 8' });
    const s = await svc.addStudent(c.id, { firstName: 'Ava', lastName: 'Test' });
    const l = await svc.openLesson(c.id);
    await svc.logAllGood({ studentId: s.id, classId: c.id, date: today(), lessonId: l.id });
    for (const deidentify of [false, true]) {
      const r = await buildExport({ kind: 'class', classIds: [c.id], categoryIds: ['behaviour', 'focus', 'coping'], includeNotes: true, includeIcp: true, deidentify, hideClassNames: false });
      expect(r.baseName).toContain('8B Science (Yr 8) – class report');
      const summary = r.sheets.find((x) => x.name === 'Summary')!;
      const head = summary.rows[0] as string[];
      expect(head[head.indexOf('Class') + 1]).toBe('Year level');
      expect(summary.rows[1][head.indexOf('Year level')]).toBe('Year 8');
    }
    expect(await buildSqlScript({ deidentify: true })).toContain("'Year 8'");
  });
});

describe('teacher journal', () => {
  it('links to the current lesson by default, and stays out of reports and SQL exports', async () => {
    const c = await svc.createClass({ name: '8B' });
    await svc.addStudent(c.id, { firstName: 'Ava', lastName: 'Test' });
    const l = await svc.openLesson(c.id);
    expect(defaultJournalLesson(await db.lessons.toArray(), c.id)?.id).toBe(l.id);
    const e = await svc.saveJournalEntry({ classId: c.id, lessonId: l.id, text: 'Tried think-pair-share; very quiet start', tags: ['Engagement', 'Engagement', ' Mentor feedback '], aitsl: 3 });
    expect(await db.journal.get(e.id)).toMatchObject({ lessonId: l.id, tags: ['Engagement', 'Mentor feedback'], aitsl: 3 });
    const r = await buildExport({ kind: 'class', classIds: [c.id], categoryIds: [], includeNotes: true, includeIcp: true, deidentify: false, hideClassNames: false });
    expect(JSON.stringify(r.sheets)).not.toContain('think-pair-share');
    for (const deidentify of [false, true]) expect(await buildSqlScript({ deidentify })).not.toContain('think-pair-share');
  });

  it('is in its own export, filtered by date and class', () => {
    const e = (id: string, classId: string, date: string, text: string) => ({ id, classId, date, text, tags: [], createdAt: 0 });
    const list = [e('1', 'a', '2026-10-01', 'First'), e('2', 'b', '2026-10-05', 'Second'), e('3', 'a', '2026-10-20', 'Third <&>')];
    expect(filterJournal(list, { from: '2026-10-02', classIds: ['a'] }).map((x) => x.id)).toEqual(['3']);
    const xml = journalDocumentXml({ title: 'Teaching journal', subtitle: 'All classes', entries: [{ ...list[2], tags: ['Engagement'], aitsl: 4 }], className: () => '7B', lessonName: () => '' });
    expect(xml).toContain('Third &lt;&amp;&gt;');
    expect(xml).toContain('Standard 4: Create and maintain supportive and safe learning environments');
    expect(xml).toContain('<w:document');
  });
});

describe('Assessment check', () => {
  const task = (extra: Partial<Assessment> = {}): Assessment => ({ id: 'a1', classId: 'c1', name: 'Fieldwork report', dueDate: '2026-11-10', checkpoints: ['Research done', 'Draft'], createdAt: 0, ...extra });

  it('is active until the due date (the button only shows then), unless ended; extending brings it back', () => {
    expect(isActiveAssessment(task(), '2026-11-10')).toBe(true);
    expect(isActiveAssessment(task(), '2026-11-11')).toBe(false);
    expect(isActiveAssessment(task({ dueDate: undefined }), '2027-01-01')).toBe(true);
    expect(isActiveAssessment(task({ closed: true }), '2026-11-01')).toBe(false);
    expect(activeAssessments([task()], 'c1', '2026-11-11')).toEqual([]);
    expect(pastAssessments([task()], 'c1', '2026-11-11')).toHaveLength(1);
    expect(activeAssessments([task({ dueDate: '2026-11-20' })], 'c1', '2026-11-11')).toHaveLength(1);
  });

  it('saves on track and behind, counts "behind" in the ranking, and sums up the class', async () => {
    const c = await svc.createClass({ name: '8B' });
    const st = await Promise.all(['Ava', 'Ben', 'Cleo'].map((f) => svc.addStudent(c.id, { firstName: f, lastName: 'Test' })));
    const l = await svc.openLesson(c.id);
    const a = await svc.saveAssessment({ classId: c.id, name: 'Fieldwork report', checkpoints: ['Draft'] });
    const t = (id: string) => ({ studentId: id, classId: c.id, date: today(), lessonId: l.id });
    await svc.saveAssessmentCheck(t(st[0].id), a.id, 'on_track', [], 'Draft');
    const b = await svc.saveAssessmentCheck(t(st[1].id), a.id, 'behind', ['missing_research']);
    const checks = await db.assessmentChecks.toArray();
    expect(checks).toHaveLength(2);
    expect(b).toMatchObject({ result: 'behind', reasons: ['missing_research'] });
    expect(assessmentSummary(a, st, checks)).toMatchObject({ onTrack: 1, behind: 1, notChecked: 1, text: 'Fieldwork report: 1 on track · 1 behind · 1 not checked' });
    const concern = recentConcern({}, [], [], [], [], today(), checks.filter((x) => x.studentId === st[1].id));
    expect(concern.value).toBe(0.5);
    expect(concern.reasons).toContain('Behind on an assessment 1×');
    const ranked = rankByNeed({ students: st, checkins: [], observations: [], tags: [], homework: [], lessonId: l.id, today: today(), assessmentChecks: checks });
    expect(ranked.find((r) => r.studentId === st[1].id)!.concern).toBe(0.5);
    expect(ranked.find((r) => r.studentId === st[0].id)!.concern).toBe(0);
    // Checking again in the same lesson replaces the result.
    await svc.saveAssessmentCheck(t(st[1].id), a.id, 'on_track');
    expect(assessmentSummary(a, st, await db.assessmentChecks.toArray()).behind).toBe(0);
  });

  it('is included in class exports with year level', async () => {
    const c = await svc.createClass({ name: '8B', yearLevel: 'Year 8' });
    const s = await svc.addStudent(c.id, { firstName: 'Ava', lastName: 'Test' });
    const l = await svc.openLesson(c.id);
    const a = await svc.saveAssessment({ classId: c.id, name: 'Fieldwork report' });
    await svc.saveAssessmentCheck({ studentId: s.id, classId: c.id, date: today(), lessonId: l.id }, a.id, 'behind', ['not_started']);
    const r = await buildExport({ kind: 'class', classIds: [c.id], categoryIds: [], includeNotes: true, includeIcp: true, deidentify: false, hideClassNames: false });
    const sheet = r.sheets.find((x) => x.name === 'Assessments')!;
    expect(sheet.rows[0]).toEqual(['Student', 'Student ID', 'Class', 'Year level', 'Date', 'Task', 'Due', 'Checkpoint', 'Result', 'Reasons']);
    expect(sheet.rows[1]).toMatchObject(['Ava Test', '', '8B', 'Year 8', expect.any(String), 'Fieldwork report', '', '', 'Behind', 'Not started']);
  });
});

describe('journal Word file', () => {
  it('is a .docx package with the entries in it', async () => {
    const { docxBlob, journalDocumentXml: xmlOf } = await import('../src/logic/journal');
    const JSZip = (await import('jszip')).default;
    const blob = await docxBlob(xmlOf({ title: 'Teaching journal', subtitle: 'x', entries: [{ id: '1', classId: 'a', date: '2026-10-20', text: 'Line one\nLine two', tags: [], createdAt: 0 }], className: () => '7B', lessonName: () => '' }));
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['[Content_Types].xml', '_rels/', '_rels/.rels', 'word/', 'word/document.xml']);
    const doc = await zip.file('word/document.xml')!.async('string');
    expect(doc).toContain('Line one');
    expect(doc).toContain('Line two');
  });
});
