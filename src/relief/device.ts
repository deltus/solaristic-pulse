// The relief teacher's device. A pass link starts a relief session that uses its own database
// (never the teacher's own Radar data), with the teacher's own sync paused. The class data comes
// from the server sealed with the pass key; everything they enter goes back sealed the same way.
// When the pass ends or is cancelled, unsent entries are sent and the relief database is deleted.

import Dexie from 'dexie';
import { db, getSettings, saveSettings } from '../db';
import { dbName, storageKey } from '../preview';
import { encryptJson, fromB64Url, importKey } from '../sync/crypto';
import { outboxSettled, setTracking } from '../sync/outbox';
import { openBundle, RELIEF_TABLES, type ReliefBundle, type UseRefusal } from '../logic/relief';
import { errorCode, type ReliefServer } from './server';

export interface ReliefSession { passId: string; key: string; endsAt?: string; className?: string }

const SESSION_KEY = storageKey('pulse.relief');
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* private mode */ } }
};

export function loadReliefSession(): ReliefSession | null {
  try { return JSON.parse(ls.get(SESSION_KEY) ?? 'null') as ReliefSession | null; } catch { return null; }
}
export const saveReliefSession = (s: ReliefSession) => ls.set(SESSION_KEY, JSON.stringify(s));
export const clearReliefSession = () => ls.del(SESSION_KEY);

/** Each pass gets its own database on the relief teacher's device. */
export const reliefDbName = (passId: string) => `${dbName()}-relief-${passId}`;

/* ---------- Relief mode flag and the class data, for screens to read ---------- */

let active: { session: ReliefSession; bundle: ReliefBundle | null } | null = null;
export function enterReliefMode(s: ReliefSession) { active = { session: s, bundle: null }; }
export const isRelief = () => !!active;
export const reliefBundle = () => active?.bundle ?? null;

/** Check-in order from the class teacher's ranking (relief mode only). */
export function reliefOrder<T extends { studentId: string }>(rows: T[]): T[] {
  const q = active?.bundle?.queue;
  if (!q) return rows;
  const at = (id: string) => { const i = q.indexOf(id); return i < 0 ? q.length : i; };
  return [...rows].sort((a, b) => at(a.studentId) - at(b.studentId));
}

/* ---------- Starting: claim the pass and set up the relief database ---------- */

export type StartResult = { ok: true; bundle: ReliefBundle } | { ok: false; reason: UseRefusal | 'not-found' | 'offline' | 'not-signed-in' | 'broken-link' };

/** Opens the pass on this device (each open is logged by the server) and loads the class into the relief database. */
export async function startReliefSession(server: ReliefServer, s: ReliefSession, deviceId: string): Promise<StartResult> {
  let claimed: { sealed: string; class_id: string; ends_at: string };
  try {
    claimed = await server.claim(s.passId, deviceId);
  } catch (e) {
    const code = errorCode(e);
    if (['cancelled', 'not-yet', 'expired', 'wrong-email', 'other-device', 'not-found', 'not-signed-in'].includes(code)) return { ok: false, reason: code as UseRefusal };
    return { ok: false, reason: 'offline' };
  }
  let bundle: ReliefBundle;
  try {
    bundle = await openBundle(s.key, claimed.sealed);
  } catch {
    return { ok: false, reason: 'broken-link' };
  }
  if (bundle.cls.id !== claimed.class_id) return { ok: false, reason: 'broken-link' };
  await seedReliefDatabase(bundle);
  saveReliefSession({ ...s, endsAt: claimed.ends_at, className: bundle.cls.name });
  if (active) active.bundle = bundle;
  return { ok: true, bundle };
}

/** The class, its students and last lesson's homework. Not recorded for sending back. */
export async function seedReliefDatabase(b: ReliefBundle) {
  setTracking(false);
  try {
    const now = Date.now();
    await db.transaction('rw', [db.classes, db.students, db.lessons, db.kv], async () => {
      await db.classes.put({ id: b.cls.id, name: b.cls.name, subject: b.cls.subject, yearLevel: b.cls.yearLevel, archived: false, createdAt: now });
      await db.students.bulkPut(b.students.map((s) => ({
        id: s.id, classId: b.cls.id, firstName: s.firstName, lastName: s.lastName, preferredName: s.preferredName, archived: false, priorityAdjust: 0, createdAt: now,
        ...(s.flagged ? { flag: { reason: '', since: b.pass.from } } : {})
      })));
      if (b.homeworkLesson) {
        await db.lessons.put({ id: b.homeworkLesson.id, classId: b.cls.id, date: b.homeworkLesson.date, openedAt: b.homeworkLesson.openedAt, closedAt: b.homeworkLesson.openedAt, status: 'closed', homeworkSet: true, homeworkText: b.homeworkLastLesson, createdAt: b.homeworkLesson.openedAt });
      }
      await db.kv.put({ key: 'reliefBundle', value: b });
    });
    const s = await getSettings();
    await saveSettings({
      onboarded: true, tutorialDone: true, devTools: false, currentClassId: b.cls.id,
      profile: { ...s.profile, name: b.pass.reliefName || s.profile.name || 'Relief teacher' }, reminders: { ...s.reminders, enabled: false }
    });
  } finally {
    // From here on, everything the relief teacher does is recorded to send back.
    setTracking(true);
  }
}

/** The bundle saved on this device (for reopening offline). */
export async function savedBundle(): Promise<ReliefBundle | null> {
  const row = await db.kv.get('reliefBundle');
  const b = (row?.value ?? null) as ReliefBundle | null;
  if (b && active) active.bundle = b;
  return b;
}

/* ---------- Sending entries back ---------- */

/** Sends waiting changes, sealed with the pass key. Returns how many were sent. */
export async function pushReliefEntries(server: ReliefServer, s: ReliefSession, deviceId: string): Promise<number> {
  const waiting = await db.outbox.orderBy('at').limit(400).toArray();
  if (!waiting.length) return 0;
  const key = await importKey(fromB64Url(s.key));
  const rows: { tbl: string; id: string; enc: string; client_at: string }[] = [];
  for (const e of waiting) {
    if (!(RELIEF_TABLES as readonly string[]).includes(e.tbl)) continue;
    const row = await db.table(e.tbl).get(e.id);
    rows.push({ tbl: e.tbl, id: e.id, client_at: new Date(e.at).toISOString(), enc: await encryptJson(key, row ? { row } : { deleted: true }) });
  }
  if (rows.length) await server.push(s.passId, deviceId, rows);
  // Remove what was sent, unless it changed again meanwhile.
  await db.transaction('rw', db.outbox, async () => {
    for (const e of waiting) {
      const cur = await db.outbox.get([e.tbl, e.id]);
      if (cur && cur.at === e.at) await db.outbox.delete([e.tbl, e.id]);
    }
  });
  return rows.length;
}

export const unsentCount = () => db.outbox.count();

/**
 * Every minute and on reopening: send entries, then check the pass. Once it has ended or been
 * cancelled and nothing is waiting (or the server won't take any more), the relief data is deleted.
 */
export async function reliefTick(server: ReliefServer, s: ReliefSession, deviceId: string, now = Date.now()): Promise<'active' | 'ended' | 'offline'> {
  let refused = false;
  await outboxSettled(); // so a change made just now counts as unsent
  try {
    while ((await pushReliefEntries(server, s, deviceId)) > 0 && (await unsentCount()) > 0) { /* keep sending in batches */ }
  } catch (e) {
    if (!['expired', 'cancelled', 'other-device', 'not-found'].includes(errorCode(e))) return 'offline';
    refused = true;
  }
  let state: 'active' | 'cancelled' | 'expired';
  try {
    state = refused ? 'expired' : await server.state(s.passId, deviceId);
  } catch (e) {
    if (!['other-device', 'not-found'].includes(errorCode(e))) return 'offline';
    state = 'cancelled';
  }
  const over = state !== 'active' || (!!s.endsAt && now > new Date(s.endsAt).getTime());
  if (!over) return 'active';
  if (!refused && (await unsentCount()) > 0) return 'active';
  await endReliefSession(s.passId);
  return 'ended';
}

/** Deletes the relief database and the session on this device. */
export async function endReliefSession(passId: string) {
  await outboxSettled();
  setTracking(false);
  db.close();
  await Dexie.delete(reliefDbName(passId));
  clearReliefSession();
  active = null;
}
