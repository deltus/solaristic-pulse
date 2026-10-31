// Serious incidents and follow-up tasks: the context compiled for a report, the report pack,
// the email drafts, due times, reminders and which students go to the top of the queue.
// Pure functions: no database access, so they are easy to test.

import type {
  AssessmentCheck, Checkin, FollowUp, HomeworkCheck, IcpAdjustment, Incident, IncidentContextItem, IssueTag, Observation,
  SeatingPlan, StudentNote, Student
} from '../types';
import { ACTION_CHIPS, CONTEXT_WEEKS, END_OF_DAY, MORNING, TASK_LABEL, type DueChip } from '../config/incidents';
import { ACTION_LEAD, HOME_EMAIL, HOME_EMAIL_GENERAL, NO_ACTION_LINE, STAFF_EMAIL } from '../config/emails';
import { WELLBEING, areaById, subLabel } from '../config/checkin';
import { summarise, summaryText } from './checkin';
import { seatLabel } from './seatingData';
import { addDays, daysBetween, formatDate, formatShort, timeToMinutes, toISODate } from '../lib/dates';
import type { PlannedReminder } from './reminderPlan';

const first = (s: Pick<Student, 'firstName' | 'preferredName'>) => s.preferredName || s.firstName;
const fullName = (s: Pick<Student, 'firstName' | 'lastName' | 'preferredName'>) => `${first(s)} ${s.lastName}`.trim();

/* ---------- Due times ---------- */

/** A time today (or another day) as a timestamp, local time. */
export function at(date: string, hhmm: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const min = timeToMinutes(hhmm);
  return new Date(y, m - 1, d, Math.floor(min / 60), min % 60).getTime();
}

/** "In 1 hour", "End of day" (or an hour from now if that's passed), "Tomorrow morning", "In 2 days". */
export function dueFrom(chip: DueChip, now: number): number {
  const date = toISODate(new Date(now));
  switch (chip) {
    case 'hour': return now + 3600_000;
    case 'eod': { const eod = at(date, END_OF_DAY); return eod > now ? eod : now + 3600_000; }
    case 'morning': return at(addDays(date, 1), MORNING);
    case 'twoDays': return at(addDays(date, 2), MORNING);
  }
}

/** The end of a day, for "due today" counts. */
export const endOfDay = (date: string) => at(addDays(date, 1), '00:00') - 1;

/* ---------- Follow-up tasks ---------- */

export const isOpen = (f: Pick<FollowUp, 'status'>) => f.status === 'todo';

/** Open tasks due by the end of the day (overdue ones included). */
export const openToday = (tasks: FollowUp[], date: string) => tasks.filter((f) => isOpen(f) && f.dueAt <= endOfDay(date)).sort((a, b) => a.dueAt - b.dueAt);

/** "3 follow-ups still open today" */
export function openTodayText(tasks: FollowUp[], date: string): string | null {
  const n = openToday(tasks, date).length;
  return n ? `${n} follow-up${n === 1 ? '' : 's'} still open today` : null;
}

/** "Move to tomorrow": same time of day, one day later (at least tomorrow morning). */
export function moveToTomorrow(f: FollowUp, now: number): number {
  const tomorrow = addDays(toISODate(new Date(now)), 1);
  const d = new Date(f.dueAt);
  const same = at(tomorrow, `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  return Math.max(same, at(tomorrow, MORNING));
}

/** Reminder notifications for open tasks (no student names: they can show on a lock screen). */
export function followUpReminders(tasks: FollowUp[], now: number, days = 14): PlannedReminder[] {
  return tasks
    .filter((f) => isOpen(f) && f.dueAt > now && f.dueAt - now <= days * 86_400_000)
    .sort((a, b) => a.dueAt - b.dueAt)
    .map((f) => ({ key: `fu-${f.id}-${f.dueAt}`, at: new Date(f.dueAt), title: 'Follow-up due', body: `${TASK_LABEL[f.kind] ?? 'Follow-up'}. Tap to open Radar.`, ...(f.classId ? { classId: f.classId } : {}) }));
}

/**
 * Students with an urgent follow-up from an earlier day who haven't had a check-in since: they go
 * to the top of the queue.
 */
export function urgentIds(tasks: FollowUp[], checkins: Pick<Checkin, 'studentId' | 'date' | 'status'>[], today: string): Set<string> {
  const out = new Set<string>();
  for (const f of tasks) {
    if (f.kind !== 'urgent' || !f.studentId) continue;
    const made = toISODate(new Date(f.createdAt));
    if (made >= today) continue;
    const seenSince = checkins.some((c) => c.studentId === f.studentId && c.date > made && c.date < today && (c.status === 'complete' || c.status === 'partial'));
    if (!seenSince) out.add(f.studentId);
  }
  return out;
}

/* ---------- Incident context ---------- */

const ICP_ITEM = 'ICP adjustments in place';

/**
 * The last 4 weeks for this student in this class: issues, notes and follow-ups as a short
 * timeline, the ICP marker (titles only if ticked), homework and assessment concerns, and the
 * seat. Wellbeing items are unticked by default.
 */
export function incidentContext(d: {
  student: Student; classId: string; date: string;
  checkins: Checkin[]; observations: Observation[]; tags: IssueTag[]; notes: StudentNote[]; followUps: FollowUp[];
  adjustments: IcpAdjustment[]; homework: HomeworkCheck[]; assessmentChecks: AssessmentCheck[]; seatingPlan?: SeatingPlan | null;
  /** The check-in this incident came from (left out of the timeline). */
  excludeCheckinId?: string;
}): IncidentContextItem[] {
  const from = addDays(d.date, -7 * CONTEXT_WEEKS);
  const inWindow = (date: string) => date >= from && date <= d.date;
  const sid = d.student.id;
  const items: IncidentContextItem[] = [];

  for (const c of d.checkins.filter((x) => x.studentId === sid && x.classId === d.classId && inWindow(x.date) && x.id !== d.excludeCheckinId)) {
    const s = summarise(c, d.observations, d.tags);
    if (s.kind !== 'issue') continue;
    const wellbeing = s.issues.some((i) => i.areaId === WELLBEING.id);
    const notes = [c.note, ...s.subNotes].filter(Boolean).join('; ');
    items.push({ id: `checkin:${c.id}`, kind: wellbeing ? 'wellbeing' : 'issue', date: c.date, text: `${summaryText(s)}${notes ? ` ("${notes}")` : ''}`, include: !wellbeing });
  }
  for (const n of d.notes.filter((x) => x.studentId === sid && inWindow(x.date))) {
    items.push({ id: `note:${n.id}`, kind: 'note', date: n.date, text: `Note: ${n.text}`, include: true });
  }
  for (const f of d.followUps.filter((x) => x.studentId === sid && (!x.classId || x.classId === d.classId) && inWindow(toISODate(new Date(x.createdAt))))) {
    const state = f.status === 'done' ? 'done' : f.status === 'notNeeded' ? 'not needed' : 'open';
    items.push({ id: `followup:${f.id}`, kind: 'followup', date: toISODate(new Date(f.createdAt)), text: `Follow-up: ${f.title} (${state})`, include: true });
  }
  items.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  const icp = d.adjustments.filter((a) => a.studentId === sid && a.active);
  if (icp.length) {
    items.push({ id: 'icp', kind: 'icp', text: ICP_ITEM, include: true });
    items.push({ id: 'icpTitles', kind: 'icpTitles', text: `ICP adjustments: ${icp.map((a) => a.title).join('; ')}`, include: false });
  }
  const hw = d.homework.filter((h) => h.studentId === sid && h.classId === d.classId && inWindow(h.date));
  const missed = hw.filter((h) => !h.done).length;
  if (missed) items.push({ id: 'homework', kind: 'homework', text: `Homework not done ${missed} of the last ${hw.length} checks`, include: true });
  const behind = d.assessmentChecks.filter((a) => a.studentId === sid && a.classId === d.classId && inWindow(a.date) && a.result === 'behind').length;
  if (behind) items.push({ id: 'assessment', kind: 'assessment', text: `Behind on assessment progress ${behind}× in the last ${CONTEXT_WEEKS} weeks`, include: true });
  const seat = seatLabel(d.seatingPlan ?? null, sid);
  if (seat) items.push({ id: 'seat', kind: 'seat', text: `Seat: ${seat} (current seating plan)`, include: true });
  return items;
}

/* ---------- Report pack ---------- */

export function areasText(areas: Record<string, string[]>): string {
  return Object.entries(areas).map(([areaId, subs]) => {
    const name = areaById(areaId)?.name ?? areaId;
    return subs.length ? `${name}: ${subs.map((s) => subLabel(areaId, s).toLowerCase()).join(', ')}` : name;
  }).join(' · ');
}

export const actionsText = (i: Pick<Incident, 'actions' | 'actionNote'>) =>
  [...i.actions.map((a) => ACTION_CHIPS.find((c) => c.id === a)?.label ?? a), ...(i.actionNote ? [i.actionNote] : [])].join('; ');

export interface ReportSection { heading: string; lines: string[] }
export interface ReportPack { title: string; sections: ReportSection[]; text: string }

export function reportPack(i: Incident, d: { student: Student; className: string; students: Student[]; teacher?: string; school?: string }): ReportPack {
  const name = (id: string) => { const s = d.students.find((x) => x.id === id); return s ? fullName(s) : 'Unknown student'; };
  const included = i.context.filter((c) => c.include);
  const sections: ReportSection[] = [
    { heading: 'Details', lines: [
      `Student: ${fullName(d.student)}`, `Class: ${d.className}`, ...(d.teacher ? [`Teacher: ${d.teacher}`] : []), ...(d.school ? [`School: ${d.school}`] : []),
      `Date: ${formatDate(i.date)}`, `Time: ${i.time}`, `Where: ${i.where}`, ...(i.intention ? [`Lesson: ${i.intention}`] : []),
      ...(i.relief ? [`Recorded by: ${i.relief.name} (relief teacher)`] : [])
    ] },
    { heading: 'What happened', lines: [...(Object.keys(i.areas).length ? [areasText(i.areas)] : []), ...(i.what.trim() ? [i.what.trim()] : [])] },
    ...(i.others.length ? [{ heading: 'Others involved', lines: [i.others.map(name).join(', ')] }] : []),
    ...(i.witnesses?.trim() ? [{ heading: 'Witnesses', lines: [i.witnesses.trim()] }] : []),
    { heading: 'Action taken', lines: [actionsText(i) || 'None recorded'] },
    ...(included.length ? [{ heading: `Context (last ${CONTEXT_WEEKS} weeks)`, lines: included.map((c) => (c.date ? `${formatShort(c.date)}: ${c.text}` : c.text)) }] : [])
  ];
  const title = `Incident report: ${fullName(d.student)}, ${d.className}, ${formatDate(i.date)}`;
  const text = [title, '', ...sections.flatMap((s) => [s.heading.toUpperCase(), ...s.lines, ''])].join('\n').trim();
  return { title, sections, text };
}

/* ---------- Email drafts ---------- */

export const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? v[k] : m));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replaces other students' names (first, preferred, last, full) with "another student". */
export function withoutOtherNames(text: string, studentId: string, students: Student[]): string {
  const others = students.filter((s) => s.id !== studentId);
  const me = students.find((s) => s.id === studentId);
  const mine = new Set(me ? [me.firstName, me.lastName, me.preferredName].filter(Boolean).map((n) => n!.toLowerCase()) : []);
  // Full names first, then single names (longest first), skipping any the student shares.
  const names = [...new Set(others.flatMap((s) => [`${first(s)} ${s.lastName}`, `${s.firstName} ${s.lastName}`, s.firstName, s.preferredName ?? '', s.lastName]))]
    .filter((n) => n.trim().length > 1 && !mine.has(n.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const n of names) out = out.replace(new RegExp(`\\b${escapeRe(n)}\\b`, 'gi'), 'another student');
  return out.replace(/another student(\s+another student)+/gi, 'another student');
}

export interface Draft { subject: string; body: string }

/**
 * To home: what happened (in the teacher's words, other students' names removed), what the school
 * did and an offer to talk. Never other students, wellbeing notes, ICP details or past incidents.
 */
export function homeDraft(i: Incident, d: { student: Student; students: Student[]; className: string; teacher?: string; school?: string }): Draft {
  const s = first(d.student);
  const acts = i.actions.map((a) => ACTION_CHIPS.find((c) => c.id === a)?.home).filter(Boolean).map((h) => fill(h!, { student: s }));
  const action = acts.length ? `${ACTION_LEAD} ${acts.length > 1 ? `${acts.slice(0, -1).join(', ')} and ${acts[acts.length - 1]}` : acts[0]}.` : NO_ACTION_LINE;
  const what = withoutOtherNames(i.what.trim() || `There was an incident involving ${s}.`, d.student.id, d.students);
  const v = { student: s, class: d.className, date: formatDate(i.date), time: i.time, what, action, teacher: d.teacher || '[your name]', school: d.school || '[school]' };
  return { subject: fill(HOME_EMAIL.subject, v), body: fill(HOME_EMAIL.body, v) };
}

/** To home without an incident (Brain dump "Contact home"). */
export function homeDraftGeneral(about: string, d: { student: Student; students: Student[]; className: string; teacher?: string; school?: string }): Draft {
  const s = first(d.student);
  const v = { student: s, class: d.className, what: withoutOtherNames(about.trim(), d.student.id, d.students), teacher: d.teacher || '[your name]', school: d.school || '[school]' };
  return { subject: fill(HOME_EMAIL_GENERAL.subject, v), body: fill(HOME_EMAIL_GENERAL.body, v) };
}

/** To school staff: the facts plus the ticked context. */
export function staffDraft(i: Incident, d: { student: Student; students: Student[]; className: string; teacher?: string; school?: string; role?: string }): Draft {
  const pack = reportPack(i, d);
  const facts = pack.sections.filter((x) => x.heading !== 'Details').flatMap((x) => [`${x.heading}:`, ...x.lines.map((l) => `- ${l}`), '']).join('\n').trim();
  const v = { student: fullName(d.student), class: d.className, date: formatDate(i.date), time: i.time, role: d.role || 'school staff', facts, teacher: d.teacher || '[your name]' };
  return { subject: fill(STAFF_EMAIL.subject, v), body: fill(STAFF_EMAIL.body, v) };
}

/** A mailto: link (the teacher fills in who it goes to). */
export const mailto = (dr: Draft, to = '') => `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(dr.subject)}&body=${encodeURIComponent(dr.body)}`;

/** Days since a date (for "3 days ago"). */
export const daysAgo = (date: string, today: string) => daysBetween(date, today);
