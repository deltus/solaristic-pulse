// Builds class and individual student reports as spreadsheet sheets, generated entirely on the device.

import { db, getSettings, sortedCategories } from './db';
import type { Category, Checkin, IcpAdjustment, IcpCheck, Observation, Student, StudentNote } from './types';
import { lastCheckedDate } from './logic/priority';
import { needByStudent, needWords, type NeedRow } from './logic/need';
import { openFollow, stripWellbeing, type OpenFollow } from './logic/checkin';
import { coldCallText } from './logic/coldcall';
import { studentTimeline } from './logic/timeline';
import { ASSESSMENT_REASONS, HOMEWORK_REASONS, subLabel } from './config/checkin';
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
  const classIds = [...new Set(students.map((s) => s.classId))];
  const [observationsRaw, checkinsRaw, notesAll, adjustments, icpAll, checkoutsAll, evidenceAll, classCheckins, classObs, classTags, classHomework, classLessons, coldCallsAll, assessmentsAll, assessmentChecksAll] = await Promise.all([
    db.observations.where('studentId').anyOf(ids).toArray(), db.checkins.where('studentId').anyOf(ids).toArray(),
    db.notes.where('studentId').anyOf(ids).toArray(), db.icpAdjustments.where('studentId').anyOf(ids).toArray(),
    db.icpChecks.where('studentId').anyOf(ids).toArray(),
    o.kind === 'class' ? db.checkouts.where('classId').anyOf(o.classIds).toArray() : Promise.resolve([]),
    o.kind === 'student' ? db.evidence.where('studentId').anyOf(ids).toArray() : Promise.resolve([]),
    db.checkins.where('classId').anyOf(classIds).toArray(), db.observations.where('classId').anyOf(classIds).toArray(),
    db.issueTags.where('classId').anyOf(classIds).toArray(), db.homework.where('classId').anyOf(classIds).toArray(),
    db.lessons.where('classId').anyOf(classIds).toArray(), db.coldCalls.where('studentId').anyOf(ids).toArray(),
    db.assessments.where('classId').anyOf(classIds).toArray(), db.assessmentChecks.where('studentId').anyOf(ids).toArray()
  ]);
  // Wellbeing is sensitive: left out of de-identified exports (the ranking below still uses it).
  const kept = o.deidentify ? stripWellbeing(observationsRaw, classTags.filter((t) => ids.includes(t.studentId)), checkinsRaw) : null;
  const observationsAll = kept?.observations ?? observationsRaw;
  const checkinsAll = kept?.checkins ?? checkinsRaw;
  const tagsAll = kept?.tags ?? classTags.filter((t) => ids.includes(t.studentId));
  const homeworkAll = classHomework.filter((h) => ids.includes(h.studentId));
  const inRange = (d: string) => (!o.from || d >= o.from) && (!o.to || d <= o.to);
  const cats = new Set(o.categoryIds);
  const observations = observationsAll.filter((x) => !x.blitz && inRange(x.date) && cats.has(x.categoryId));
  const blitzObs = observationsAll.filter((x) => !!x.blitz && inRange(x.date) && cats.has(x.categoryId));
  const checkins = checkinsAll.filter((x) => inRange(x.date));
  const notes = notesAll.filter((x) => inRange(x.date));
  const icpChecks = icpAll.filter((x) => inRange(x.date));
  const checkouts = checkoutsAll.filter((x) => inRange(x.date));
  // Check-in evidence always; ICP evidence only when ICP information is included.
  const evidence = evidenceAll.filter((x) => inRange(x.date) && (x.checkinId || o.includeIcp));
  const tags = tagsAll.filter((x) => inRange(x.date));
  const homework = homeworkAll.filter((x) => inRange(x.date));
  const need = needByStudent(allStudents.filter((s) => classIds.includes(s.classId)), classCheckins, classObs, classTags, classHomework, date, classLessons, assessmentChecksAll);
  const coldCalls = coldCallsAll.filter((x) => inRange(x.date));
  const lessonsInRange = classLessons.filter((l) => inRange(l.date));
  const lessonTitle = (id: string) => { const l = classLessons.find((x) => x.id === id); return l?.intention ? scrub(l.intention) : ''; };

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
  // Year level stays in de-identified exports: it isn't identifying on its own.
  const yr = (id: string) => allClasses.find((c) => c.id === id)?.yearLevel ?? '';
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;
  const usedCats = categories.filter((c) => cats.has(c.id));
  const qText = (id: string, s: Student) => (questions.find((q) => q.id === id)?.text ?? '').replace(/\{name\}/g, o.deidentify ? 'the student' : s.preferredName || s.firstName);

  const per = new Map(students.map((s) => [s.id, {
    need: need.get(s.id),
    open: openFollow(checkinsAll.filter((x) => x.studentId === s.id && x.date <= date), observationsAll.filter((x) => x.studentId === s.id), tagsAll.filter((x) => x.studentId === s.id))
  }]));

  const chkWeight = new Map(checkinsAll.map((c) => [c.id, c.weight]));
  const obsRows = (list: Observation[]): Cell[][] => [
    [...studentHead, 'Class', 'Year level', 'Date', 'Category', 'Question', 'Response', 'Recorded as', 'Difficulty level (0–2)', 'Follow-up outcome', 'Context', ...(o.includeNotes ? ['Teacher notes'] : []), 'Draw weight at check-in (older check-ins)', 'Recent concerns now', 'Flagged', 'Follow-up currently open'],
    ...list.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt).map((x) => {
      const s = students.find((st) => st.id === x.studentId)!;
      const p = per.get(s.id)!;
      return [
        ...studentCols(s), cls(x.classId), yr(x.classId), formatDate(x.date), catName(x.categoryId), qText(x.questionId, s), x.response, x.source ?? 'observed',
        x.level ?? '', x.followUp ? x.followUp.outcome : '', x.context ?? '', ...(o.includeNotes ? [text(x.note)] : []),
        chkWeight.get(x.checkinId) ?? '', p.need?.concern ?? '', s.flag ? 'Yes' : 'No', p.open && p.open.summary.checkin.id === x.checkinId && (x.level ?? 0) >= 1 ? 'Yes' : 'No'
      ];
    })
  ];

  const icpSheets = (): Sheet[] => {
    if (!o.includeIcp) return [];
    const adjRows: Cell[][] = [[...studentHead, 'Class', 'Year level', 'Adjustment', 'Details', 'Frequency', 'Start', 'End', 'Active', 'Records in period', 'Implemented', 'Partly', 'Not implemented', 'Not applicable', 'Implementation rate %']];
    for (const a of adjustments) {
      const s = students.find((st) => st.id === a.studentId)!;
      const sum = implementationSummary(icpChecks.filter((c) => c.adjustmentId === a.id));
      adjRows.push([...studentCols(s), cls(s.classId), yr(s.classId), scrub(a.title), text(a.details), ICP_FREQUENCIES.find((f) => f.value === a.frequency)?.label ?? '', formatDate(a.startDate), a.endDate ? formatDate(a.endDate) : '', a.active ? 'Yes' : 'No', sum.total, sum.implemented, sum.partial, sum.not, sum.na, sum.rate ?? '']);
    }
    const chkRows: Cell[][] = [[...studentHead, 'Class', 'Year level', 'Date', 'Adjustment', 'Outcome', ...(o.includeNotes ? ['Notes'] : [])]];
    for (const c of [...icpChecks].sort((a, b) => a.date.localeCompare(b.date))) {
      const s = students.find((st) => st.id === c.studentId)!;
      const a = adjustments.find((x) => x.id === c.adjustmentId);
      chkRows.push([...studentCols(s), cls(s.classId), yr(s.classId), formatDate(c.date), scrub(a?.title), ICP_OUTCOMES.find((x) => x.value === c.outcome)?.label ?? c.outcome, ...(o.includeNotes ? [text(c.note)] : [])]);
    }
    return [{ name: 'ICP adjustments', rows: adjRows }, { name: 'ICP check-ins', rows: chkRows }];
  };

  const notesSheet = (list: StudentNote[]): Sheet[] => o.includeNotes && list.length
    ? [{ name: 'Teacher notes', rows: [[...studentHead, 'Date', 'Note'], ...list.sort((a, b) => a.date.localeCompare(b.date)).map((n) => [...studentCols(students.find((s) => s.id === n.studentId)!), formatDate(n.date), scrub(n.text)])] }]
    : [];

  // Blitz marks: whole-class, one topic, kept apart from check-ins but in the same areas.
  const blitzSheet = (): Sheet[] => blitzObs.length
    ? [{ name: 'Blitz', rows: [[...studentHead, 'Class', 'Year level', 'Date', 'Topic', 'Area', 'Result'], ...[...blitzObs].sort((a, b) => a.date.localeCompare(b.date)).map((x) => {
        const s = students.find((st) => st.id === x.studentId)!;
        return [...studentCols(s), cls(x.classId), yr(x.classId), formatDate(x.date), blitzTopic(x.blitz!)?.label ?? x.blitz!, catName(x.categoryId), x.response];
      })] }]
    : [];

  // Class focus check-outs: one row per lesson.
  const checkoutSheet = (): Sheet[] => checkouts.length
    ? [{ name: 'Check-outs', rows: [['Class', 'Year level', 'Date', 'Lesson start', 'Lesson length (min)', 'Working %', 'Focus zone', 'Working (min)', 'Distracted (min)', ...(o.includeNotes ? ['Note'] : [])],
        ...[...checkouts].sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? '').localeCompare(b.start ?? '')).map((x) => {
          const m = splitMinutes(x.lessonMin, x.pctWorking);
          return [cls(x.classId), yr(x.classId), formatDate(x.date), x.start ?? '', x.lessonMin, x.pctWorking, zoneFor(x.pctWorking).label, m.working, m.distracted, ...(o.includeNotes ? [text(x.note)] : [])];
        })] }]
    : [];

  // Evidence is listed only; the files themselves stay on the device.
  const evidenceFor = (x: (typeof evidence)[number]) => (x.checkinId ? 'Daily check-in' : scrub(adjustments.find((a) => a.id === x.adjustmentId)?.title));
  const evidenceSheet = (): Sheet[] => evidence.length
    ? [{ name: evidence.some((x) => x.adjustmentId) ? 'ICP evidence' : 'Evidence', rows: [['Date', 'For', 'Type', ...(o.deidentify ? [] : ['File']), ...(o.includeNotes ? ['Note'] : [])],
        ...[...evidence].sort((a, b) => a.date.localeCompare(b.date)).map((x) => [formatDate(x.date), evidenceFor(x), EVIDENCE_KINDS.find((k) => k.value === x.kind)?.label ?? x.kind, ...(o.deidentify ? [] : [x.name ?? '']), ...(o.includeNotes ? [text(x.text)] : [])])] }]
    : [];

  // Ticked sub-options on Issues. Unticked ones are "not flagged" and never listed.
  const issueSheet = (): Sheet[] => tags.length
    ? [{ name: 'Issue details', rows: [[...studentHead, 'Class', 'Year level', 'Date', 'Area', 'Detail', 'Recorded as'],
        ...[...tags].sort((a, b) => a.date.localeCompare(b.date)).map((t) => [...studentCols(students.find((s) => s.id === t.studentId)!), cls(t.classId), yr(t.classId), formatDate(t.date), catName(t.areaId), subLabel(t.areaId, t.tagId), t.source])] }]
    : [];
  const homeworkSheet = (): Sheet[] => homework.length
    ? [{ name: 'Homework', rows: [[...studentHead, 'Class', 'Year level', 'Date', 'Result', 'Reason'],
        ...[...homework].sort((a, b) => a.date.localeCompare(b.date)).map((h) => [...studentCols(students.find((s) => s.id === h.studentId)!), cls(h.classId), yr(h.classId), formatDate(h.date), h.done ? 'Done' : 'Not done', h.reason ? HOMEWORK_REASONS.find((r) => r.id === h.reason)?.label ?? h.reason : ''])] }]
    : [];

  // Assessment check results, with the task and checkpoint.
  const assessmentChecks = assessmentChecksAll.filter((x) => inRange(x.date));
  const taskName = (id: string) => scrub(assessmentsAll.find((a) => a.id === id)?.name);
  const assessmentSheet = (): Sheet[] => assessmentChecks.length
    ? [{ name: 'Assessments', rows: [[...studentHead, 'Class', 'Year level', 'Date', 'Task', 'Due', 'Checkpoint', 'Result', 'Reasons'],
        ...[...assessmentChecks].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt).map((c) => {
          const a = assessmentsAll.find((x) => x.id === c.assessmentId);
          return [...studentCols(students.find((s) => s.id === c.studentId)!), cls(c.classId), yr(c.classId), formatDate(c.date), taskName(c.assessmentId), a?.dueDate ? formatDate(a.dueDate) : '', scrub(c.checkpoint), c.result === 'on_track' ? 'On track' : 'Behind', (c.reasons ?? []).map((r) => ASSESSMENT_REASONS.find((x) => x.id === r)?.label ?? r).join(', ')];
        })] }]
    : [];
  const coldCallSheet = (): Sheet[] => coldCalls.length
    ? [{ name: 'Cold calls', rows: [[...studentHead, 'Class', 'Year level', 'Date', 'Lesson', 'Result', 'Details'],
        ...[...coldCalls].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt).map((c) => [...studentCols(students.find((s) => s.id === c.studentId)!), cls(c.classId), yr(c.classId), formatDate(c.date), lessonTitle(c.lessonId), c.result === 'good' ? 'Answered well' : 'Struggled', c.result === 'good' ? '' : coldCallText(c).replace(/^struggled,? ?/, '')])] }]
    : [];
  // Lessons of the class. The teacher's own close-of-lesson answers (happy, plan, note) are never exported.
  const lessonsSheet = (): Sheet[] => lessonsInRange.some((l) => !l.historical)
    ? [{ name: 'Lessons', rows: [['Class', 'Year level', 'Date', 'Learning intention', 'Status', 'Class attention %', 'Homework set', ...(o.includeNotes ? ['Homework'] : [])],
        ...[...lessonsInRange].filter((l) => !l.historical).sort((a, b) => a.openedAt - b.openedAt).map((l) => [cls(l.classId), yr(l.classId), formatDate(l.date), scrub(l.intention), l.status === 'closed' ? 'Closed' : 'Open', l.attentionPct ?? '', l.homeworkSet ? 'Yes' : 'No', ...(o.includeNotes ? [text(l.homeworkText)] : [])])] }]
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
      ...(evidence.length ? [['Evidence', "Listed only. Photos, files and voice memos stay on the teacher's device and are not included in this report."]] : []),
      ...(checkouts.length ? [['Check-outs', "Teacher's estimate at the end of each lesson of the share of the lesson the class spent working. Low focus 0–49%, Mixed 50–74%, Focused 75–100%."]] : []),
      ['De-identified', o.deidentify ? 'Yes: names replaced with stable pseudonyms (Student 001 …) within this report' : 'No: contains student names'],
      ...(o.deidentify ? [['Warning', DEID_WARNING]] : []),
      ['Teacher reflections', "Not included. Close-of-lesson answers and 'My teaching' patterns stay private to the teacher."],
      ['Generated locally', 'This file was created on the teacher\'s device. No data was uploaded.'],
      [],
      ['Limitations'],
      ...LIMITATIONS.map((l) => ['', l]),
      [],
      ['Difficulty level', '0 = meeting expectations, 1 = needs support (2 = significant difficulty, older records only), blank = not rated'],
      ['Recorded as', 'observed = the teacher tapped it; implied = from All good or an area not tapped on an Issue; migrated = converted from an older version of the app']
    ]
  };

  // Student report: lesson-by-lesson, joining check-in, homework and cold calls.
  const lessonTimelineSheet = (): Sheet[] => {
    const s = students[0];
    if (!s) return [];
    const rows = studentTimeline({ lessons: lessonsInRange, checkins: checkinsAll, observations: observationsAll, tags: tagsAll, homework: homeworkAll, coldCalls, studentId: s.id }, 500);
    return rows.length ? [{ name: 'Lesson by lesson', rows: [['Date', 'Lesson', 'Check-in', 'Homework', 'Cold call'], ...rows.reverse().map((r) => [formatDate(r.date), scrub(r.name), r.checkin ?? '', r.homework ?? '', r.coldCall ?? ''])] }] : [];
  };

  let sheets: Sheet[];
  if (o.kind === 'class') {
    const summary: Cell[][] = [[...studentHead, 'Class', 'Year level', 'Recent concerns', 'Lessons since last seen', 'Flagged', ...(o.includeNotes ? ['Flag reason'] : []), 'Open follow-ups', 'Last check-in', 'Check-ins in period', 'Absences in period', ...usedCats.map((c) => `${c.name} trend`)]];
    for (const s of [...students].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))) {
      const p = per.get(s.id)!;
      const sChk = checkins.filter((c) => c.studentId === s.id);
      const last = lastCheckedDate(checkinsAll.filter((c) => c.studentId === s.id));
      summary.push([
        ...studentCols(s), cls(s.classId), yr(s.classId), p.need?.concern ?? 0, p.need ? p.need.lessonsSince ?? 'Never' : '', s.flag ? 'Yes' : 'No', ...(o.includeNotes ? [text(s.flag?.reason)] : []),
        p.open ? scrub(p.open.text) : '', last ? formatDate(last) : '',
        sChk.filter((c) => c.status === 'complete' || c.status === 'partial').length, sChk.filter((c) => c.status === 'absent').length,
        ...usedCats.map((c) => TREND_TEXT[categoryTrend(observationsAll.filter((x) => x.studentId === s.id), c, o.to && o.to < date ? o.to : date).status])
      ]);
    }
    const chkRows: Cell[][] = [[...studentHead, 'Class', 'Year level', 'Date', 'Status', 'Result', 'Follow up next time', ...(o.includeNotes ? ['Note'] : []), 'Draw weight at check-in (older check-ins)']];
    for (const c of [...checkins].sort((a, b) => a.date.localeCompare(b.date))) {
      const s = students.find((st) => st.id === c.studentId)!;
      chkRows.push([...studentCols(s), cls(c.classId), yr(c.classId), formatDate(c.date), c.status === 'absent' ? 'Not here' : c.status, c.result === 'good' ? 'All good' : c.result === 'issue' ? 'Issue' : '', c.result === 'issue' ? (c.followUp === false ? 'No' : 'Yes') : '', ...(o.includeNotes ? [text(c.note)] : []), c.weight ?? '']);
    }
    sheets = [{ name: 'Summary', rows: summary }, { name: 'Observations', rows: obsRows(observations) }, { name: 'Check-ins', rows: chkRows }, ...issueSheet(), ...homeworkSheet(), ...coldCallSheet(), ...assessmentSheet(), ...lessonsSheet(), ...blitzSheet(), ...checkoutSheet(), ...notesSheet(notes), ...icpSheets(), about];
  } else {
    sheets = buildStudentSheets(students[0], {
      o, date, observations, observationsAll, checkins, notes, adjustments, icpChecks, usedCats, categories,
      p: per.get(students[0].id)!, nameOf, cls, yr, text, scrub, catName, obsRows, icpSheets, notesSheet, blitzSheet, studentHead, extra: [...lessonTimelineSheet(), ...issueSheet(), ...homeworkSheet(), ...coldCallSheet(), ...assessmentSheet()]
    });
    sheets.push(...evidenceSheet(), about);
  }

  const s0 = students[0];
  const who = o.kind === 'student' && s0 ? (o.deidentify ? nameOf(s0) : `${s0.preferredName || s0.firstName} ${s0.lastName}`) : undefined;
  const named = classIds.map((id) => ({ name: classLabel.get(id) ?? '', yearLevel: allClasses.find((c) => c.id === id)?.yearLevel }));
  const baseName = exportBaseName({ kind: o.kind, who, classes: named, date, deidentified: o.deidentify });
  return { sheets, baseName, students: students.length, observations: observations.length };
}


/** "Year 8" → "Yr 8"; "8" → "Yr 8"; anything else as typed. */
export function yearShort(year?: string): string {
  const y = (year ?? '').trim();
  const n = y.match(/^(?:year|yr|y)?\s*(\d{1,2})$/i);
  return n ? `Yr ${n[1]}` : y;
}

/** "8B Science (Yr 8)": a class with its year level, for file names. */
export function classTitle(name: string, year?: string): string {
  const yr = yearShort(year);
  return yr ? `${name} (${yr})` : name;
}

/** File name without extension, e.g. "8B Science (Yr 8) – class report 2026-10-27". Characters files can't hold are removed. */
export function exportBaseName(p: { kind: 'class' | 'student'; who?: string; classes: { name: string; yearLevel?: string }[]; date: string; deidentified: boolean }): string {
  const cls = p.classes.length === 1 ? classTitle(p.classes[0].name, p.classes[0].yearLevel) : p.classes.length ? `${p.classes.length} classes` : '';
  const parts = p.kind === 'student' ? [p.who, cls, 'student report'] : [cls, 'class report'];
  const base = `${parts.filter(Boolean).join(' – ')} ${p.date}${p.deidentified ? ' (de-identified)' : ''}`;
  return base.replace(/[\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
}
function buildStudentSheets(s: Student, c: {
  o: ExportOptions; date: string; observations: Observation[]; observationsAll: Observation[]; checkins: Checkin[]; notes: StudentNote[];
  adjustments: IcpAdjustment[]; icpChecks: IcpCheck[]; usedCats: Category[]; categories: Category[];
  p: { need?: NeedRow; open: OpenFollow | null }; extra: Sheet[];
  nameOf: (s: Student) => string; cls: (id: string) => string; yr: (id: string) => string; text: (t?: string) => string; scrub: (t?: string) => string;
  catName: (id: string) => string; obsRows: (l: Observation[]) => Cell[][]; icpSheets: () => Sheet[];
  notesSheet: (l: StudentNote[]) => Sheet[]; blitzSheet: () => Sheet[]; studentHead: string[];
}): Sheet[] {
  const { o, date, observations, observationsAll, checkins, usedCats, p } = c;
  const end = o.to && o.to < date ? o.to : date;
  const sum: Cell[][] = [
    ['Student', c.nameOf(s)],
    ['Class', c.cls(s.classId)],
    ['Year level', c.yr(s.classId)],
    ['Check-ins in period', checkins.filter((x) => x.status === 'complete' || x.status === 'partial').length],
    ['Absences in period', checkins.filter((x) => x.status === 'absent').length],
    ['Place in the check-in queue', p.need ? needWords(p.need) : ''],
    ...(p.need?.reasons ?? []).map((x) => ['  Because of', x]),
    ['Flagged for monitoring', s.flag ? `Yes, since ${formatDate(s.flag.since)}${o.includeNotes && s.flag.reason ? `: ${c.text(s.flag.reason)}` : ''}` : 'No'],
    ['Open follow-up', p.open ? c.scrub(p.open.text) : 'None'],
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
    ...c.extra,
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
