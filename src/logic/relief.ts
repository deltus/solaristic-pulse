// Relief passes: rules for when a pass works, exactly what a relief teacher's device may receive
// (the "bundle"), and the class teacher's review of what relief teachers entered.
//
// The bundle is the privacy boundary: it is built on the class teacher's device and holds only
// names, flag and ICP markers (ICP text only when shared), today's plan, last lesson's homework
// and the queue order. No history, averages, notes, evidence, ranking reasons, journal or other
// classes. It is encrypted with a key made for that one pass, which travels only in the pass link
// after '#' (never sent to a server), the same way the "Add a device" QR code carries a key.

import type { Assessment, AssessmentCheck, BrainBreakLog, Checkin, ColdCall, HomeworkCheck, IcpAdjustment, IssueTag, Lesson, Observation, ReliefPass, ReliefTag, SchoolClass, Student } from '../types';
import { addDays, parseISODate, weekday } from '../lib/dates';
import { rankByNeed } from './need';
import { openLessonFor } from './lessons';
import { decryptJson, encryptJson, fromB64Url, importKey, newKeyBytes, toB64Url } from '../sync/crypto';

export const MAX_SCHOOL_DAYS = 5;
export const AUTO_ACCEPT_DAYS = 7;

/** Monday–Friday days from `from` to `to` inclusive. */
export function schoolDays(from: string, to: string): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (weekday(d) <= 5) n++;
  return n;
}

export interface PassInput { classId: string; from: string; to?: string; reliefName?: string; reliefEmail?: string; shareIcp?: boolean; plan?: string; createdBy?: string }

/** Checks a new pass; returns a plain-English problem or null. */
export function passProblem(p: PassInput, today: string): string | null {
  const to = p.to || p.from;
  if (!p.classId) return 'Choose a class.';
  if (p.from < today) return 'The first day can’t be in the past.';
  if (to < p.from) return 'The last day must be on or after the first day.';
  if (schoolDays(p.from, to) > MAX_SCHOOL_DAYS) return `A pass can cover up to ${MAX_SCHOOL_DAYS} school days.`;
  if (p.reliefEmail?.trim() && !/^\S+@\S+\.\S+$/.test(p.reliefEmail.trim())) return 'Check the email address.';
  return null;
}

/**
 * Makes a pass record. Kept separate from any screen so a future reception/admin role can call it
 * for any class in the school.
 */
export function makeReliefPass(p: PassInput, id: string, now: number): ReliefPass {
  return {
    id, classId: p.classId, from: p.from, to: p.to || p.from, reliefName: p.reliefName?.trim() || undefined,
    reliefEmail: p.reliefEmail?.trim().toLowerCase() || undefined, shareIcp: !!p.shareIcp, plan: p.plan?.trim() || undefined,
    createdAt: now, ...(p.createdBy ? { createdBy: p.createdBy } : {})
  };
}

/** The pass stops working at the end of its last day, local time. */
export function passEnds(pass: Pick<ReliefPass, 'to'>): number {
  const d = parseISODate(pass.to);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}
const passStarts = (pass: Pick<ReliefPass, 'from'>) => parseISODate(pass.from).getTime();

export type PassStatus = 'cancelled' | 'upcoming' | 'active' | 'expired';
export function passStatus(pass: ReliefPass, now: number): PassStatus {
  if (pass.cancelledAt && pass.cancelledAt <= now) return 'cancelled';
  if (now < passStarts(pass)) return 'upcoming';
  return now > passEnds(pass) ? 'expired' : 'active';
}

export type UseRefusal = 'cancelled' | 'not-yet' | 'expired' | 'wrong-email' | 'other-device';
export const REFUSAL_TEXT: Record<UseRefusal, string> = {
  cancelled: 'This pass was cancelled. Ask the class teacher for a new one.',
  'not-yet': 'This pass starts on a later day.',
  expired: 'This pass has ended.',
  'wrong-email': 'This pass is for a different email address. Sign in with the email the class teacher used.',
  'other-device': 'This pass is already in use. Ask the class teacher for a new one.'
};

/** Can this person use the pass on this device now? (The server will run the same check.) */
export function canUsePass(pass: ReliefPass, who: { email?: string; deviceId: string }, now: number): { ok: true } | { ok: false; reason: UseRefusal } {
  const st = passStatus(pass, now);
  if (st === 'cancelled') return { ok: false, reason: 'cancelled' };
  if (st === 'upcoming') return { ok: false, reason: 'not-yet' };
  if (st === 'expired') return { ok: false, reason: 'expired' };
  if (pass.reliefEmail && pass.reliefEmail !== who.email?.trim().toLowerCase()) return { ok: false, reason: 'wrong-email' };
  if (pass.claimedDevice && pass.claimedDevice !== who.deviceId) return { ok: false, reason: 'other-device' };
  return { ok: true };
}

/** First use locks the pass to that device and logs every use. */
export function recordUse(pass: ReliefPass, who: { email?: string; deviceId: string }, now: number): ReliefPass {
  return { ...pass, claimedDevice: pass.claimedDevice ?? who.deviceId, uses: [...(pass.uses ?? []), { at: now, device: who.deviceId, ...(who.email ? { email: who.email } : {}) }] };
}

/** On the relief teacher's device: delete the downloaded class once the pass is over and nothing is waiting to sync. */
export const shouldClearReliefData = (pass: ReliefPass, now: number, unsentEntries: number) =>
  passStatus(pass, now) !== 'active' && passStatus(pass, now) !== 'upcoming' && unsentEntries === 0;

/* ---------- What the relief teacher's device receives ---------- */

export interface ReliefStudent { id: string; firstName: string; lastName: string; preferredName?: string; flagged: boolean; icp: boolean; adjustments?: { title: string; details?: string }[] }
export interface ReliefBundle {
  pass: { id: string; from: string; to: string; reliefName?: string; plan?: string; shareIcp: boolean };
  cls: { id: string; name: string; subject?: string; yearLevel?: string };
  students: ReliefStudent[];
  /** Check-in order (the class teacher's ranking), without the reasons. */
  queue: string[];
  homeworkLastLesson?: string;
  /** Active assessment names, so Assessment check could be added later. */
  assessments?: { id: string; name: string; dueDate?: string }[];
}

export function buildReliefBundle(pass: ReliefPass, d: {
  cls: SchoolClass; students: Student[]; adjustments: IcpAdjustment[]; lessons: Lesson[]; checkins: Checkin[]; observations: Observation[];
  tags: IssueTag[]; homework: HomeworkCheck[]; assessments?: Assessment[]; assessmentChecks?: AssessmentCheck[]; today: string;
}): ReliefBundle {
  const live = d.students.filter((s) => s.classId === d.cls.id && !s.archived);
  const activeAdj = (id: string) => d.adjustments.filter((a) => a.studentId === id && a.active && a.startDate <= pass.to && (!a.endDate || a.endDate >= pass.from));
  const lessonId = openLessonFor(d.lessons, d.cls.id)?.id ?? `next|${d.cls.id}`;
  const queue = rankByNeed({ students: live, checkins: d.checkins, observations: d.observations, tags: d.tags, homework: d.homework, lessons: d.lessons, assessmentChecks: d.assessmentChecks, lessonId, today: d.today }).map((r) => r.studentId);
  const last = d.lessons.filter((l) => l.classId === d.cls.id && l.status === 'closed' && !l.historical).sort((a, b) => b.openedAt - a.openedAt)[0];
  return {
    pass: { id: pass.id, from: pass.from, to: pass.to, reliefName: pass.reliefName, plan: pass.plan, shareIcp: pass.shareIcp },
    cls: { id: d.cls.id, name: d.cls.name, subject: d.cls.subject, yearLevel: d.cls.yearLevel },
    students: live.map((s) => {
      const adj = activeAdj(s.id);
      return {
        id: s.id, firstName: s.firstName, lastName: s.lastName, ...(s.preferredName ? { preferredName: s.preferredName } : {}),
        // Markers only: never the flag reason.
        flagged: !!s.flag, icp: adj.length > 0,
        ...(pass.shareIcp && adj.length ? { adjustments: adj.map((a) => ({ title: a.title, ...(a.details ? { details: a.details } : {}) })) } : {})
      };
    }),
    queue,
    ...(last?.homeworkSet ? { homeworkLastLesson: last.homeworkText || 'Homework (no details)' } : {}),
    ...(d.assessments?.length ? { assessments: d.assessments.filter((a) => a.classId === d.cls.id && !a.closed && (!a.dueDate || a.dueDate >= d.today)).map((a) => ({ id: a.id, name: a.name, ...(a.dueDate ? { dueDate: a.dueDate } : {}) })) } : {})
  };
}

/** Encrypts a bundle with a new key made for this pass. The key goes in the link after '#'. */
export async function sealBundle(bundle: ReliefBundle): Promise<{ key: string; sealed: string }> {
  const raw = newKeyBytes();
  return { key: toB64Url(raw), sealed: await encryptJson(await importKey(raw), bundle) };
}

export async function openBundle(key: string, sealed: string): Promise<ReliefBundle> {
  return decryptJson<ReliefBundle>(await importKey(fromB64Url(key)), sealed);
}

/* ---------- Class teacher: reviewing relief entries ---------- */

export interface ReliefEntry { kind: 'checkin' | 'homework' | 'coldcall' | 'brainbreak' | 'assessment'; id: string; studentId?: string; date: string; at: number; relief: ReliefTag; text: string }

/** Entries waiting for review: not yet accepted, and less than 7 days old (older ones are accepted automatically). */
export function reliefToReview(entries: ReliefEntry[], now: number): ReliefEntry[] {
  return entries.filter((e) => !e.relief.reviewed && now - e.at < AUTO_ACCEPT_DAYS * 86_400_000).sort((a, b) => a.at - b.at);
}

/** Gathers relief-tagged records into one list for the review card. */
export function reliefEntries(d: { checkins: Checkin[]; homework: HomeworkCheck[]; coldCalls: ColdCall[]; brainBreaks: BrainBreakLog[]; assessmentChecks: AssessmentCheck[] }, describe: { checkin: (c: Checkin) => string }): ReliefEntry[] {
  const out: ReliefEntry[] = [];
  for (const c of d.checkins) if (c.relief) out.push({ kind: 'checkin', id: c.id, studentId: c.studentId, date: c.date, at: c.createdAt, relief: c.relief, text: describe.checkin(c) });
  for (const h of d.homework) if (h.relief) out.push({ kind: 'homework', id: h.id, studentId: h.studentId, date: h.date, at: h.createdAt, relief: h.relief, text: `Homework: ${h.done ? 'done' : 'not done'}` });
  for (const c of d.coldCalls) if (c.relief) out.push({ kind: 'coldcall', id: c.id, studentId: c.studentId, date: c.date, at: c.createdAt, relief: c.relief, text: `Cold call: ${c.result === 'good' ? 'answered well' : 'struggled'}` });
  for (const b of d.brainBreaks) if (b.relief) out.push({ kind: 'brainbreak', id: b.id, date: b.date, at: b.at, relief: b.relief, text: `Brain break: ${b.name}` });
  for (const a of d.assessmentChecks) if (a.relief) out.push({ kind: 'assessment', id: a.id, studentId: a.studentId, date: a.date, at: a.createdAt, relief: a.relief, text: `Assessment: ${a.result === 'on_track' ? 'on track' : 'behind'}` });
  return out;
}

/** "Relief: Sam Lee" for the timeline. */
export const reliefLabel = (t?: ReliefTag) => (t ? `Relief: ${t.name}` : '');
