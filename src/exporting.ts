// Builds class and individual student reports as spreadsheet sheets, generated entirely on the device.

import { db, getSettings, sortedCategories } from './db';
import type { Category, Checkin, IcpAdjustment, IcpCheck, Observation, Student, StudentNote } from './types';
import { computePriority, lastCheckedDate } from './logic/priority';
import { allOpenFollowUps } from './logic/followups';
import { categoryTrend } from './logic/trends';
import { compareBeforeAfter, implementationSummary, ICP_FREQUENCIES, ICP_OUTCOMES } from './logic/icp';
import { makeScrubber, pseudonymMap } from './logic/deidentify';
import { blitzTopic } from './logic/blitz';
import { splitMinutes, zoneFor } from './logic/checkout';
import { EVIDENCE_KINDS } from './logic/evidence';
import { addDays, daysBetween, formatDate, parseISODate, toISODate, today } from './lib/dates';

export type Cell = string | number | null;
export interface Sheet {
  name: string;
  rows: Cell[][];
  /** 'table' (default): first row is a header. 'pairs': label/value rows. */
  layout?: 'table' | 'pairs';
}

export interface ExportOptions {
  kind: 'class' | 'student';
  classIds: string[];
  studentId?: string;
  from?: string;
  to?: string;
  categoryIds: string[];
  includeNotes: boolean;
  includeIcp: boolean;
  deidentify: boolean;
  hideClassNames: boolean;
}

export interface ExportResult {
  sheets: Sheet[];
  baseName: string;
  students: number;
  observations: number;
}

const LEVEL_TEXT = ['As expected', 'Some difficulty', 'Significant difficulty'];
const TREND_TEXT: Record<string, string> = { insufficient: 'Not enough data', improving: 'Improving', declining: 'More difficulty', stable: 'Stable' };

export const LIMITATIONS = [
  'Observations are brief teacher judgements recorded during lessons. They are not assessments, diagnoses or labels.',
  'Absences, skipped check-ins and "not observed / unsure" answers are excluded from ratings and trends.',
  'Students are checked on a rotation, so the number of observations differs between students and periods.',
  'Trends need at least 4 rated observations in 6 weeks; small numbers can be misleading.',
  'Differences before and after an ICP adjustment show an association only, not that the adjustment caused the change.'
];
export const DEID_WARNING = 'Names were replaced with pseudonyms and known names/IDs in notes were replaced, but notes can still contain identifying details (events, descriptions, other people). Review every note before sharing outside the school.';

export async function buildExport(o: ExportOptions): Promise<ExportResult> {
  const date = today();
  const [settings, allClasses, allStudents, categories, questions] = await Promise.all([
    getSettings(), db.classes.toArray(), db.students.toArray(), sortedCategories(), db.questions.toArray()
  ]);
  const students = o.kind === 'student'
    ? allStudents.filter((s) => s.id === o.studentId)
    : allStudents.filter((s) => o.classIds.includes(s.classId));
  const ids = students.map((s) => s.id);
  const [observationsAll, checkinsAll, notesAll, adjustments, icpAll, checkoutsAll, evidenceAll] = await Promise.all([
    db.observations.where('studentId').anyOf(ids).toArray(), db.checkins.where('studentId').anyOf(ids).toArray(),
    db.notes.where('studentId').anyOf(ids).toArray(), db.icpAdjustments.where('studentId').anyOf(ids).toArray(),
    db.icpChecks.where('studentId').anyOf(ids).toArray(),
    o.kind === 'class' ? db.checkouts.where('classId').anyOf(o.classIds).toArray() : Promise.resolve([]),
    o.kind === 'student' && o.includeIcp ? db.evidence.where('studentId').anyOf(ids).toArray() : Promise.resolve([])
  ]);
  const inRange = (d: string) => (!o.from || d >= o.from) && (!o.to || d <= o.to);
  const cats = new Set(o.categoryIds);
  const observations = observationsAll.filter((x) => !x.blitz && inRange(x.date) && cats.has(x.categoryId));
  const blitzObs = observationsAll.filter((x) => !!x.blitz && inRange(x.date) && cats.has(x.categoryId));
  const checkins = checkinsAll.filter((x) => inRange(x.date));
  const notes = notesAll.filter((x) => inRange(x.date));
  const icpChecks = icpAll.filter((x) => inRange(x.date));
  const checkouts = checkoutsAll.filter((x) => inRange(x.date));
  const evidence = evidenceAll.filter((x) => inRange(x.date));

  // Pseudonyms are assigned over every student in the selected classes so they stay stable across the report.
  const pseudoPool = o.kind === 'student' ? allStudents.filter((s) => s.classId === students[0]?.classId) : students;
  const pseudo = pseudonymMap(pseudoPool);
  const classLabel = new Map(allClasses.map((c, i) => [c.id, o.deidentify && o.hideClassNames ? `Class ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? i : ''}` : c.name]));
  const extra = [settings.profile.name, settings.profile.school ?? '', ...(o.deidentify && o.hideClassNames ? allClasses.map((c) => c.name) : [])];
  const scrub = o.deidentify ? makeScrubber(allStudents, pseudo, extra) : (t?: string) => t ?? '';
  const text = (t?: string) => (o.includeNotes ? scrub(t) : '');
  const nameOf = (s: Student) => (o.deidentify ? pseudo.get(s.id)! : `${s.preferredName || s.firstName} ${s.lastName}`);
  const studentCols = (s: Student): Cell[] => (o.deidentify ? [nameOf(s)] : [nameOf(s), s.externalId ?? '']);
  const studentHead = o.deidentify ? ['Student'] : ['Student', 'Student ID'];
  const cls = (id: string) => classLabel.get(id) ?? '';
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;
  const usedCats = categories.filter((c) => cats.has(c.id));
  const qText = (id: string, s: Student) => (questions.find((q) => q.id === id)?.text ?? '').replace(/\{name\}/g, o.deidentify ? 'the student' : s.preferredName || s.firstName);

  const per = new Map(students.map((s) => {
    const sObs = observationsAll.filter((x) => x.studentId === s.id);
    const sChk = checkinsAll.filter((x) => x.studentId === s.id && x.date <= date);
    return [s.id, {
      priority: computePriority(s, sObs, sChk, questions.filter((q) => q.enabled), categories, date),
      open: allOpenFollowUps(sObs, questions.filter((q) => q.enabled))
    }];
  }));

  const chkWeight = new Map(checkinsAll.map((c) => [c.id, c.weight]));
  const obsRows = (list: Observation[]): Cell[][] => [
    [...studentHead, 'Class', 'Date', 'Category', 'Question', 'Response', 'Difficulty level (0–2)', 'Follow-up outcome', 'Context', ...(o.includeNotes ? ['Teacher notes'] : []), 'Draw weight at check-in', 'Current draw weight', 'Flagged', 'Follow-up currently open'],
    ...list.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt).map((x) => {
      const s = students.find((st) => st.id === x.studentId)!;
      const p = per.get(s.id)!;
      return [
        ...studentCols(s), cls(x.classId), formatDate(x.date), catName(x.categoryId), qText(x.questionId, s), x.response,
        x.level ?? '', x.followUp ? x.followUp.outcome : '', x.context ?? '', ...(o.includeNotes ? [text(x.note)] : []),
        chkWeight.get(x.checkinId) ?? '', p.priority.weight, s.flag ? 'Yes' : 'No', p.open.some((f) => f.questionId === x.questionId) ? 'Yes' : 'No'
      ];
    })
  ];

  const icpSheets = (): Sheet[] => {
    if (!o.includeIcp) return [];
    const adjRows: Cell[][] = [[...studentHead, 'Class', 'Adjustment', 'Details', 'Frequency', 'Start', 'End', 'Active', 'Records in period', 'Implemented', 'Partly', 'Not implemented', 'Not applicable', 'Implementation rate %']];
    for (const a of adjustments) {
      const s = students.find((st) => st.id === a.studentId)!;
      const sum = implementationSummary(icpChecks.filter((c) => c.adjustmentId === a.id));
      adjRows.push([...studentCols(s), cls(s.classId), scrub(a.title), text(a.details), ICP_FREQUENCIES.find((f) => f.value === a.frequency)?.label ?? '', formatDate(a.startDate), a.endDate ? formatDate(a.endDate) : '', a.active ? 'Yes' : 'No', sum.total, sum.implemented, sum.partial, sum.not, sum.na, sum.rate ?? '']);
    }
    const chkRows: Cell[][] = [[...studentHead, 'Class', 'Date', 'Adjustment', 'Outcome', ...(o.includeNotes ? ['Notes'] : [])]];
    for (const c of [...icpChecks].sort((a, b) => a.date.localeCompare(b.date))) {
      const s = students.find((st) => st.id === c.studentId)!;
      const a = adjustments.find((x) => x.id === c.adjustmentId);
      chkRows.push([...studentCols(s), cls(s.classId), formatDate(c.date), scrub(a?.title), ICP_OUTCOMES.find((x) => x.value === c.outcome)?.label ?? c.outcome, ...(o.includeNotes ? [text(c.note)] : [])]);
    }
    return [{ name: 'ICP adjustments', rows: adjRows }, { name: 'ICP check-ins', rows: chkRows }];
  };

  const notesSheet = (list: StudentNote[]): Sheet[] => o.includeNotes && list.length
    ? [{ name: 'Teacher notes', rows: [[...studentHead, 'Date', 'Note'], ...list.sort((a, b) => a.date.localeCompare(b.date)).map((n) => [...studentCols(students.find((s) => s.id === n.studentId)!), formatDate(n.date), scrub(n.text)])] }]
    : [];

  // Blitz marks: whole-class, one topic, kept apart from check-ins but in the same areas.
  const blitzSheet = (): Sheet[] => blitzObs.length
    ? [{ name: 'Blitz', rows: [[...studentHead, 'Class', 'Date', 'Topic', 'Area', 'Result'], ...[...blitzObs].sort((a, b) => a.date.localeCompare(b.date)).map((x) => {
        const s = students.find((st) => st.id === x.studentId)!;
        return [...studentCols(s), cls(x.classId), formatDate(x.date), blitzTopic(x.blitz!)?.label ?? x.blitz!, catName(x.categoryId), x.response];
      })] }]
    : [];

  // Class focus check-outs: one row per lesson.
  const checkoutSheet = (): Sheet[] => checkouts.length
    ? [{ name: 'Check-outs', rows: [['Class', 'Date', 'Lesson start', 'Lesson length (min)', 'Working %', 'Focus zone', 'Working (min)', 'Distracted (min)', ...(o.includeNotes ? ['Note'] : [])],
        ...[...checkouts].sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? '').localeCompare(b.start ?? '')).map((x) => {
          const m = splitMinutes(x.lessonMin, x.pctWorking);
          return [cls(x.classId), formatDate(x.date), x.start ?? '', x.lessonMin, x.pctWorking, zoneFor(x.pctWorking).label, m.working, m.distracted, ...(o.includeNotes ? [text(x.note)] : [])];
        })] }]
    : [];

  // ICP evidence is listed only; the files themselves stay on the device.
  const evidenceSheet = (): Sheet[] => o.includeIcp && evidence.length
    ? [{ name: 'ICP evidence', rows: [['Date', 'Adjustment', 'Type', ...(o.deidentify ? [] : ['File']), ...(o.includeNotes ? ['Note'] : [])],
        ...[...evidence].sort((a, b) => a.date.localeCompare(b.date)).map((x) => [formatDate(x.date), scrub(adjustments.find((a) => a.id === x.adjustmentId)?.title), EVIDENCE_KINDS.find((k) => k.value === x.kind)?.label ?? x.kind, ...(o.deidentify ? [] : [x.name ?? '']), ...(o.includeNotes ? [text(x.text)] : [])])] }]
    : [];

  const about: Sheet = {
    name: 'About this report',
    layout: 'pairs',
    rows: [
      ['Solaristic Radar report'],
      ['Generated', `${formatDate(date)} ${new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`],
      ['Period', `${o.from ? formatDate(o.from) : 'All records'} to ${o.to ? formatDate(o.to) : formatDate(date)}`],
      ['Classes', o.kind === 'student' ? cls(students[0]?.classId ?? '') : o.classIds.map(cls).join(', ')],
      ['Categories', usedCats.map((c) => c.name).join(', ')],
      ['Teacher notes included', o.includeNotes ? 'Yes' : 'No'],
      ['ICP information included', o.includeIcp ? 'Yes' : 'No'],
      ...(evidence.length ? [['ICP evidence', "Listed only. Photos, files and voice memos stay on the teacher's device and are not included in this report."]] : []),
      ...(checkouts.length ? [['Check-outs', "Teacher's estimate at the end of each lesson of the share of the lesson the class spent working. Low focus 0–49%, Mixed 50–74%, Focused 75–100%."]] : []),
      ['De-identified', o.deidentify ? 'Yes: names replaced with stable pseudonyms (Student 001 …) within this report' : 'No: contains student names'],
      ...(o.deidentify ? [['Warning', DEID_WARNING]] : []),
      ['Generated locally', 'This file was created on the teacher\'s device. No data was uploaded.'],
      [],
      ['Limitations'],
      ...LIMITATIONS.map((l) => ['', l]),
      [],
      ['Difficulty level', '0 = as expected, 1 = some difficulty, 2 = significant difficulty, blank = not rated']
    ]
  };

  let sheets: Sheet[];
  if (o.kind === 'class') {
    const summary: Cell[][] = [[...studentHead, 'Class', 'Current draw weight', 'Flagged', ...(o.includeNotes ? ['Flag reason'] : []), 'Open follow-ups', 'Last check-in', 'Check-ins in period', 'Absences in period', ...usedCats.map((c) => `${c.name} trend`)]];
    for (const s of [...students].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))) {
      const p = per.get(s.id)!;
      const sChk = checkins.filter((c) => c.studentId === s.id);
      const last = lastCheckedDate(checkinsAll.filter((c) => c.studentId === s.id));
      summary.push([
        ...studentCols(s), cls(s.classId), p.priority.weight, s.flag ? 'Yes' : 'No', ...(o.includeNotes ? [text(s.flag?.reason)] : []),
        p.open.map((f) => catName(f.categoryId)).join(', '), last ? formatDate(last) : '',
        sChk.filter((c) => c.status === 'complete' || c.status === 'partial').length, sChk.filter((c) => c.status === 'absent').length,
        ...usedCats.map((c) => TREND_TEXT[categoryTrend(observationsAll.filter((x) => x.studentId === s.id), c, o.to && o.to < date ? o.to : date).status])
      ]);
    }
    const chkRows: Cell[][] = [[...studentHead, 'Class', 'Date', 'Status', 'Selected by', 'Draw weight at check-in']];
    for (const c of [...checkins].sort((a, b) => a.date.localeCompare(b.date))) {
      const s = students.find((st) => st.id === c.studentId)!;
      chkRows.push([...studentCols(s), cls(c.classId), formatDate(c.date), c.status, c.source === 'daily' ? 'Daily rotation' : c.source === 'extra' ? 'Check More Students' : 'Teacher', c.weight ?? '']);
    }
    sheets = [{ name: 'Summary', rows: summary }, { name: 'Observations', rows: obsRows(observations) }, { name: 'Check-ins', rows: chkRows }, ...blitzSheet(), ...checkoutSheet(), ...notesSheet(notes), ...icpSheets(), about];
  } else {
    sheets = buildStudentSheets(students[0], {
      o, date, observations, observationsAll, checkins, notes, adjustments, icpChecks, usedCats, categories,
      p: per.get(students[0].id)!, nameOf, cls, text, scrub, catName, obsRows, icpSheets, notesSheet, blitzSheet, studentHead
    });
    sheets.push(...evidenceSheet(), about);
  }

  const s0 = students[0];
  const who = o.kind === 'student' && s0 ? (o.deidentify ? nameOf(s0) : `${s0.lastName}-${s0.preferredName || s0.firstName}`) : 'class-report';
  const baseName = `solaristic-radar_${who}`.replace(/[^\w-]+/g, '-') + `_${date}${o.deidentify ? '_deidentified' : ''}`;
  return { sheets, baseName, students: students.length, observations: observations.length };
}

function buildStudentSheets(s: Student, c: {
  o: ExportOptions; date: string; observations: Observation[]; observationsAll: Observation[]; checkins: Checkin[]; notes: StudentNote[];
  adjustments: IcpAdjustment[]; icpChecks: IcpCheck[]; usedCats: Category[]; categories: Category[];
  p: { priority: ReturnType<typeof computePriority>; open: ReturnType<typeof allOpenFollowUps> };
  nameOf: (s: Student) => string; cls: (id: string) => string; text: (t?: string) => string; scrub: (t?: string) => string;
  catName: (id: string) => string; obsRows: (l: Observation[]) => Cell[][]; icpSheets: () => Sheet[];
  notesSheet: (l: StudentNote[]) => Sheet[]; blitzSheet: () => Sheet[]; studentHead: string[];
}): Sheet[] {
  const { o, date, observations, observationsAll, checkins, usedCats, p } = c;
  const end = o.to && o.to < date ? o.to : date;
  const sum: Cell[][] = [
    ['Student', c.nameOf(s)],
    ['Class', c.cls(s.classId)],
    ['Check-ins in period', checkins.filter((x) => x.status === 'complete' || x.status === 'partial').length],
    ['Absences in period', checkins.filter((x) => x.status === 'absent').length],
    ['Current draw weight', `${p.priority.weight} (standard 1.0; range 0.5–3.0)`],
    ...p.priority.parts.map((x) => ['  Priority factor', `${c.scrub(x.label)} (${x.delta > 0 ? '+' : ''}${x.delta.toFixed(2)})`]),
    ['Flagged for monitoring', s.flag ? `Yes, since ${formatDate(s.flag.since)}${o.includeNotes && s.flag.reason ? `: ${c.text(s.flag.reason)}` : ''}` : 'No'],
    ['Open follow-ups', p.open.map((f) => c.catName(f.categoryId)).join(', ') || 'None'],
    [],
    ['Category', 'Trend', 'Interpretation', 'Observed facts']
  ];
  for (const cat of usedCats) {
    const t = categoryTrend(observationsAll, cat, end);
    sum.push([cat.name, TREND_TEXT[t.status], t.summary, t.facts.join(' ')]);
  }

  // Changes over time: weekly average difficulty per category.
  const weekStart = (d: string) => { const x = parseISODate(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return toISODate(x); };
  const weeks = [...new Set(observations.map((x) => weekStart(x.date)))].sort();
  const changes: Cell[][] = [['Week starting', ...usedCats.flatMap((cat) => [`${cat.name}: avg difficulty`, `${cat.name}: n`])]];
  for (const w of weeks) {
    const inWeek = observations.filter((x) => x.level !== null && daysBetween(w, x.date) >= 0 && x.date < addDays(w, 7));
    changes.push([formatDate(w), ...usedCats.flatMap((cat) => {
      const l = inWeek.filter((x) => x.categoryId === cat.id).map((x) => x.level as number);
      return [l.length ? Math.round((l.reduce((a, b) => a + b, 0) / l.length) * 10) / 10 : '', l.length];
    })]);
  }

  const byId = new Map(observationsAll.map((x) => [x.id, x]));
  const fu: Cell[][] = [['Date', 'Category', 'Previous observation', 'Previous date', 'Outcome', 'Recorded level', ...(o.includeNotes ? ['Notes'] : [])]];
  for (const x of observations.filter((y) => y.followUp).sort((a, b) => a.date.localeCompare(b.date))) {
    const prev = byId.get(x.followUp!.previousId);
    fu.push([formatDate(x.date), c.catName(x.categoryId), prev?.response ?? '', prev ? formatDate(prev.date) : '', x.response, x.level === null ? 'Not rated' : LEVEL_TEXT[x.level], ...(o.includeNotes ? [c.text(x.note)] : [])]);
  }

  const sheets: Sheet[] = [
    { name: 'Summary', rows: sum, layout: 'pairs' },
    { name: 'Observations', rows: c.obsRows(observations) },
    ...c.blitzSheet(),
    { name: 'Follow-ups', rows: fu },
    { name: 'Changes over time', rows: changes },
    ...c.notesSheet(c.notes)
  ];
  if (o.includeIcp) {
    sheets.push(...c.icpSheets());
    const cmp: Cell[][] = [['Adjustment', 'Start', 'Category', 'Before: n', 'Before: avg difficulty', 'After: n', 'After: avg difficulty', 'Statement']];
    for (const a of c.adjustments) {
      for (const r of compareBeforeAfter(a, observationsAll, usedCats, end)) {
        cmp.push([c.scrub(a.title), formatDate(a.startDate), r.categoryName, r.before.n, r.before.avg ?? '', r.after.n, r.after.avg ?? '', r.statement]);
      }
    }
    sheets.push({ name: 'ICP vs observations', rows: cmp });
  }
  return sheets;
}

/** Writes sheets to an XLSX (styled, via ExcelJS) or CSV blob. Libraries load on demand. */
export async function toBlob(sheets: Sheet[], format: 'xlsx' | 'csv'): Promise<Blob> {
  if (format === 'csv') {
    const XLSX = await import('xlsx');
    const main = sheets.find((x) => x.name === 'Observations') ?? sheets[0];
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(main.rows));
    return new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  }
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Solaristic Radar';
  wb.created = new Date();
  const line = { style: 'thin' as const, color: { argb: 'FFC9C1B1' } };
  const border = { top: line, left: line, bottom: line, right: line };
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name.slice(0, 31));
    const cols = Math.max(1, ...sh.rows.map((r) => r.length));
    sh.rows.forEach((r) => ws.addRow(r.map((c) => (c === null ? '' : c))));
    // Column widths from content (capped), long text wraps.
    for (let c = 1; c <= cols; c++) {
      const longest = Math.max(8, ...sh.rows.slice(0, 300).map((r) => String(r[c - 1] ?? '').length));
      ws.getColumn(c).width = Math.min(55, longest + 2);
    }
    ws.eachRow((row, n) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.value === '') return;
        cell.border = border;
        cell.alignment = { vertical: 'top', wrapText: String(cell.value).length > 55 };
      });
      if (sh.layout === 'pairs') {
        const first = row.getCell(1);
        if (first.value !== '' && first.value !== null) first.font = { bold: true, color: { argb: 'FF0E1A3A' } };
        if (n === 1 && sh.name === 'About this report') first.font = { bold: true, size: 14, color: { argb: 'FF0E1A3A' } };
      }
    });
    if (sh.layout !== 'pairs' && sh.rows.length) {
      const head = ws.getRow(1);
      head.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E1A3A' } };
        cell.alignment = { vertical: 'middle', wrapText: true };
        cell.border = border;
      });
      head.height = 30;
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      if (sh.rows.length > 1) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols } };
      // Light banding makes long tables easier to read.
      for (let n = 2; n <= sh.rows.length; n += 2) {
        ws.getRow(n).eachCell({ includeEmpty: false }, (cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F4EC' } };
        });
      }
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
