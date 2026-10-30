// Round 6, option A end to end: a class teacher's device and a relief teacher's device talking to a
// fake ReliefServer that follows the same rules as supabase/migrations/20261027000000_relief_passes.sql.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PulseDB, useDatabase, db } from '../src/db';
import * as svc from '../src/services';
import type { ReliefServer, ServerEntry, ServerPass, ServerUse } from '../src/relief/server';
import { cancelPass, importReliefEntries, sendPass, updatePassUses, useReliefServer } from '../src/relief/owner';
import { endReliefSession, enterReliefMode, reliefDbName, reliefTick, startReliefSession, unsentCount, type ReliefSession } from '../src/relief/device';
import { applyReliefEntry, openBundle, RELIEF_TABLES, reliefEntries, reliefToReview } from '../src/logic/relief';
import { summarise, summaryText } from '../src/logic/checkin';
import { today } from '../src/lib/dates';

type User = { uid: string; email: string };
const CLASS_TEACHER: User = { uid: 'u-teacher', email: 'teacher@school.example' };
const SAM: User = { uid: 'u-sam', email: 'sam@school.example' };
const STRANGER: User = { uid: 'u-other', email: 'other@school.example' };

/** Mirrors the SQL: row-level security for the owner, and the three relief functions. */
class FakeReliefServer implements ReliefServer {
  user: User | null = CLASS_TEACHER;
  now = () => Date.now();
  passes = new Map<string, ServerPass & { owner_id: string; claimed_by: string | null; claimed_device: string | null }>();
  uses: (ServerUse & { user_id: string })[] = [];
  rows = new Map<string, ServerEntry & { owner_id: string }>();

  private me() { if (!this.user) throw new Error('not-signed-in'); return this.user; }
  private mine(id: string) { const p = this.passes.get(id); return p && p.owner_id === this.me().uid ? p : undefined; }

  async savePass(p: ServerPass) {
    const old = this.passes.get(p.id);
    if (old && old.owner_id !== this.me().uid) throw new Error('row-level security');
    this.passes.set(p.id, { claimed_by: null, claimed_device: null, ...old, ...p, owner_id: this.me().uid });
  }
  async cancelPass(id: string, at: string) { const p = this.mine(id); if (p) p.cancelled_at = at; }
  async passUses(ids: string[]) {
    const own = ids.filter((id) => this.mine(id));
    return { uses: this.uses.filter((u) => own.includes(u.pass_id)), claimed: own.map((id) => ({ id, claimed_device: this.passes.get(id)!.claimed_device })) };
  }
  async entries() { return [...this.rows.values()].filter((r) => r.owner_id === this.me().uid); }
  async deleteEntries(keys: { pass_id: string; tbl: string; row_id: string }[]) {
    for (const k of keys) { const id = `${k.pass_id}|${k.tbl}|${k.row_id}`; if (this.rows.get(id)?.owner_id === this.me().uid) this.rows.delete(id); }
  }
  async claim(passId: string, device: string) {
    const u = this.me();
    const p = this.passes.get(passId);
    if (!p) throw new Error('not-found');
    if (p.cancelled_at) throw new Error('cancelled');
    if (this.now() < Date.parse(p.starts_at)) throw new Error('not-yet');
    if (this.now() > Date.parse(p.ends_at)) throw new Error('expired');
    if (p.relief_email && p.relief_email !== u.email) throw new Error('wrong-email');
    if (p.claimed_device && (p.claimed_device !== device || p.claimed_by !== u.uid)) throw new Error('other-device');
    if (!p.claimed_device) { p.claimed_by = u.uid; p.claimed_device = device; }
    this.uses.push({ pass_id: passId, user_id: u.uid, email: u.email, device_id: device, used_at: new Date(this.now()).toISOString() });
    return { sealed: p.sealed, class_id: p.class_id, ends_at: p.ends_at };
  }
  async state(passId: string, device: string) {
    const u = this.me();
    const p = this.passes.get(passId);
    if (!p) return 'cancelled' as const;
    if (p.claimed_by !== u.uid || p.claimed_device !== device) throw new Error('other-device');
    if (p.cancelled_at) return 'cancelled' as const;
    return this.now() > Date.parse(p.ends_at) ? 'expired' as const : 'active' as const;
  }
  async push(passId: string, device: string, batch: { tbl: string; id: string; enc: string; client_at: string }[]) {
    const u = this.me();
    if (batch.length > 500) throw new Error('bad-batch');
    const p = this.passes.get(passId);
    if (!p) throw new Error('not-found');
    if (p.claimed_by !== u.uid || p.claimed_device !== device) throw new Error('other-device');
    const until = Math.min(p.cancelled_at ? Date.parse(p.cancelled_at) : Infinity, Date.parse(p.ends_at));
    if (this.now() > until + 2 * 86_400_000) throw new Error('expired');
    let n = 0;
    for (const r of batch) {
      if (!(RELIEF_TABLES as readonly string[]).includes(r.tbl) || !r.id || r.id.length > 200 || !r.enc || r.enc.length > 200_000 || Date.parse(r.client_at) > until) continue;
      const key = `${passId}|${r.tbl}|${r.id}`;
      const old = this.rows.get(key);
      if (old && r.client_at < old.client_at) continue;
      this.rows.set(key, { pass_id: passId, owner_id: p.owner_id, tbl: r.tbl, row_id: r.id, enc: r.enc, client_at: r.client_at });
      n++;
    }
    return n;
  }
}

let server: FakeReliefServer;
let n = 0;
let teacherDb: PulseDB;

beforeEach(async () => {
  server = new FakeReliefServer();
  useReliefServer(server);
  teacherDb = new PulseDB(`relief-teacher-${++n}`);
  useDatabase(teacherDb);
  await teacherDb.open();
});
afterEach(() => useDatabase(teacherDb));

/** The class teacher sets up 8B and sends a pass for Sam. */
async function teacherSendsPass(opts: { shareIcp?: boolean; email?: string | null } = {}) {
  server.user = CLASS_TEACHER;
  useDatabase(teacherDb);
  const c = await svc.createClass({ name: '8B History', subject: 'History', yearLevel: 'Year 8' });
  const other = await svc.createClass({ name: '9C Geography' });
  const ava = await svc.addStudent(c.id, { firstName: 'Ava', lastName: 'Example' });
  const ben = await svc.addStudent(c.id, { firstName: 'Ben', lastName: 'Sample' });
  const zed = await svc.addStudent(other.id, { firstName: 'Zed', lastName: 'Elsewhere' });
  await svc.saveAdjustment({ studentId: ben.id, title: 'Extra time', details: 'Up to 25% on tests' });
  await svc.addNote(ava.id, 'Private teacher note');
  const pass = await svc.createReliefPass({ classId: c.id, from: today(), reliefName: 'Sam Relief', ...(opts.email === null ? {} : { reliefEmail: opts.email ?? SAM.email }), shareIcp: opts.shareIcp ?? false, plan: 'Chapter 4' });
  const sent = await sendPass(pass.id);
  return { c, other, ava, ben, zed, pass: sent, session: { passId: sent.id, key: sent.key! } as ReliefSession };
}

/** Switches to the relief teacher's own device and database for this pass. */
async function onReliefDevice(user: User, passId: string) {
  server.user = user;
  const rdb = new PulseDB(reliefDbName(passId));
  useDatabase(rdb);
  await rdb.open();
  return rdb;
}

function backToTeacher() { server.user = CLASS_TEACHER; useDatabase(teacherDb); }

describe('relief pass, two devices', () => {
  it('only the named email can open it, and only on one device; every open is logged for the class teacher', async () => {
    const { session } = await teacherSendsPass();
    await onReliefDevice(STRANGER, session.passId);
    expect(await startReliefSession(server, session, 'dev-x')).toEqual({ ok: false, reason: 'wrong-email' });

    await onReliefDevice(SAM, session.passId);
    enterReliefMode(session);
    const first = await startReliefSession(server, session, 'dev-1');
    expect(first.ok).toBe(true);
    expect(await startReliefSession(server, session, 'dev-1')).toMatchObject({ ok: true }); // reopening on the same phone is fine
    expect(await startReliefSession(server, session, 'dev-2')).toEqual({ ok: false, reason: 'other-device' });

    backToTeacher();
    await updatePassUses();
    const p = (await db.reliefPasses.get(session.passId))!;
    expect(p.claimedDevice).toBe('dev-1');
    expect(p.uses).toHaveLength(2);
    expect(p.uses![0]).toMatchObject({ device: 'dev-1', email: SAM.email });
    await endReliefSession(session.passId);
  });

  it('does not open before its first day or after its last', async () => {
    const { session } = await teacherSendsPass();
    await onReliefDevice(SAM, session.passId);
    const p = server.passes.get(session.passId)!;
    server.now = () => Date.parse(p.starts_at) - 60_000;
    expect(await startReliefSession(server, session, 'dev-1')).toEqual({ ok: false, reason: 'not-yet' });
    server.now = () => Date.parse(p.ends_at) + 60_000;
    expect(await startReliefSession(server, session, 'dev-1')).toEqual({ ok: false, reason: 'expired' });
  });

  it('a link with the wrong key opens nothing', async () => {
    const { session } = await teacherSendsPass();
    await onReliefDevice(SAM, session.passId);
    const wrong = { ...session, key: session.key.replace(/^./, (ch) => (ch === 'A' ? 'B' : 'A')) };
    expect(await startReliefSession(server, wrong, 'dev-1')).toEqual({ ok: false, reason: 'broken-link' });
    expect(await db.students.count()).toBe(0);
  });

  it('the server only ever holds sealed data, and with ICP unticked the downloaded class has no adjustments', async () => {
    const { session } = await teacherSendsPass({ shareIcp: false });
    const sealed = server.passes.get(session.passId)!.sealed;
    for (const word of ['Ava', 'Ben', 'Example', 'Chapter 4', 'Extra time']) expect(sealed).not.toContain(word);
    const downloaded = JSON.stringify(await openBundle(session.key, sealed));
    for (const secret of ['Extra time', 'Up to 25%', 'Private teacher note', 'Zed', '9C']) expect(downloaded).not.toContain(secret);

    await onReliefDevice(SAM, session.passId);
    await startReliefSession(server, session, 'dev-1');
    const onDevice = JSON.stringify({ students: await db.students.toArray(), classes: await db.classes.toArray(), adj: await db.icpAdjustments?.toArray?.() ?? [], kv: await db.kv.toArray() });
    for (const secret of ['Extra time', 'Up to 25%', 'Private teacher note', 'Zed', '9C']) expect(onDevice).not.toContain(secret);
    expect((await db.classes.toArray()).map((c) => c.name)).toEqual(['8B History']);
    await endReliefSession(session.passId);
  });

  it('with ICP ticked, the adjustments arrive', async () => {
    const { session, ben } = await teacherSendsPass({ shareIcp: true });
    const b = await openBundle(session.key, server.passes.get(session.passId)!.sealed);
    expect(b.students.find((s) => s.id === ben.id)!.adjustments).toEqual([{ title: 'Extra time', details: 'Up to 25% on tests' }]);
  });

  it('entries come back to the class teacher tagged "Relief: Sam Relief", and wait for review', async () => {
    const { c, ava, ben, session } = await teacherSendsPass();
    await onReliefDevice(SAM, session.passId);
    enterReliefMode(session);
    await startReliefSession(server, session, 'dev-1');
    expect(await unsentCount()).toBe(0); // the downloaded class isn't sent back
    const l = await svc.openLesson(c.id);
    await svc.logAllGood({ studentId: ava.id, classId: c.id, date: today(), lessonId: l.id });
    await svc.logIssue({ studentId: ben.id, classId: c.id, date: today(), lessonId: l.id }, { areas: { focus: ['off-task'] }, note: 'Chatty after lunch' });
    expect(await reliefTick(server, session, 'dev-1')).toBe('active');
    expect(await unsentCount()).toBe(0);
    for (const r of server.rows.values()) expect(r.enc).not.toContain('Chatty');

    backToTeacher();
    const before = await db.checkins.count();
    expect(await importReliefEntries()).toBeGreaterThan(0);
    const mine = (await db.checkins.toArray()).filter((x) => x.relief);
    expect(await db.checkins.count()).toBe(before + 2);
    expect(mine.every((x) => x.relief!.name === 'Sam Relief' && x.relief!.passId === session.passId)).toBe(true);
    expect((await db.observations.toArray()).some((o) => JSON.stringify(o).includes('Chatty after lunch'))).toBe(true);
    expect((await db.lessons.toArray()).find((x) => x.id === l.id)?.relief?.name).toBe('Sam Relief');
    expect(server.rows.size).toBe(0); // collected and removed from the server
    const obs = await db.observations.toArray();
    const waiting = reliefToReview(reliefEntries({ checkins: await db.checkins.toArray(), homework: [], coldCalls: [], brainBreaks: [], assessmentChecks: [] }, { checkin: (x) => summaryText(summarise(x, obs, [])) }), Date.now());
    expect(waiting.map((e) => e.studentId).sort()).toEqual([ava.id, ben.id].sort());
    await endReliefSession(session.passId);
  });

  it('entries for another class, an unknown student or the teacher\'s own records are dropped', async () => {
    const { c, other, ava, zed, pass } = await teacherSendsPass();
    const own = await svc.openLesson(c.id);
    const mineCheckin = (await svc.logAllGood({ studentId: ava.id, classId: c.id, date: today(), lessonId: own.id })).checkin;
    const ctx = { studentIds: new Set([ava.id]) };
    const row = { id: 'x1', classId: other.id, studentId: zed.id, lessonId: own.id, date: today() };
    expect(applyReliefEntry({ tbl: 'checkins', id: 'x1', body: { row } }, pass, ctx)).toMatchObject({ action: 'skip', reason: 'another class' });
    expect(applyReliefEntry({ tbl: 'checkins', id: 'x1', body: { row: { ...row, classId: c.id } } }, pass, ctx)).toMatchObject({ action: 'skip', reason: 'unknown student' });
    expect(applyReliefEntry({ tbl: 'checkins', id: mineCheckin.id, body: { row: { ...mineCheckin } } }, pass, { ...ctx, existing: mineCheckin as unknown as Record<string, unknown> })).toMatchObject({ action: 'skip' });
    expect(applyReliefEntry({ tbl: 'checkins', id: mineCheckin.id, body: { deleted: true } }, pass, { ...ctx, existing: mineCheckin as unknown as Record<string, unknown> })).toMatchObject({ action: 'skip' });
    expect(applyReliefEntry({ tbl: 'journal', id: 'j', body: { row: { id: 'j', classId: c.id } } }, pass, ctx)).toMatchObject({ action: 'skip' });
    // A note can't be attached to a check-in that didn't come from this pass (or doesn't exist).
    expect(applyReliefEntry({ tbl: 'observations', id: 'o1', body: { row: { id: 'o1', classId: c.id, studentId: ava.id, checkinId: 'made-up' } } }, pass, ctx)).toMatchObject({ action: 'skip' });
  });

  it('a cancelled pass stops at once; unsent entries still go back, then the relief device deletes the class', async () => {
    const { c, ava, session } = await teacherSendsPass();
    await onReliefDevice(SAM, session.passId);
    enterReliefMode(session);
    await startReliefSession(server, session, 'dev-1');
    const l = await svc.openLesson(c.id);
    await svc.logAllGood({ studentId: ava.id, classId: c.id, date: today(), lessonId: l.id });

    backToTeacher();
    await cancelPass(session.passId);
    expect(server.passes.get(session.passId)!.cancelled_at).not.toBeNull();

    await onReliefDevice(SAM, session.passId);
    expect(await reliefTick(server, session, 'dev-1')).toBe('ended');
    expect(await Dexie.exists(reliefDbName(session.passId))).toBe(false);
    expect(server.rows.size).toBeGreaterThan(0); // what was entered before the cancel arrived
    expect(await startReliefSession(server, session, 'dev-1')).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('an expired pass keeps its data while offline with unsent entries, and clears once they are sent', async () => {
    const { c, ava, session } = await teacherSendsPass();
    await onReliefDevice(SAM, session.passId);
    enterReliefMode(session);
    await startReliefSession(server, session, 'dev-1');
    const l = await svc.openLesson(c.id);
    await svc.logAllGood({ studentId: ava.id, classId: c.id, date: today(), lessonId: l.id });
    const ends = Date.parse(server.passes.get(session.passId)!.ends_at);
    server.now = () => ends + 3_600_000;
    const realPush = server.push.bind(server);
    server.push = async () => { throw new Error('Failed to fetch'); };
    expect(await reliefTick(server, { ...session, endsAt: new Date(ends).toISOString() }, 'dev-1', ends + 3_600_000)).toBe('offline');
    expect(await db.students.count()).toBe(2);
    server.push = realPush;
    expect(await reliefTick(server, { ...session, endsAt: new Date(ends).toISOString() }, 'dev-1', ends + 3_600_000)).toBe('ended');
    expect(await Dexie.exists(reliefDbName(session.passId))).toBe(false);
    expect([...server.rows.values()].some((r) => r.tbl === 'checkins')).toBe(true);
  });

  it('a pass without an email works for whoever opens it first, and then only on that device', async () => {
    const { session } = await teacherSendsPass({ email: null });
    await onReliefDevice(STRANGER, session.passId);
    expect((await startReliefSession(server, session, 'dev-9')).ok).toBe(true);
    await onReliefDevice(SAM, session.passId);
    expect(await startReliefSession(server, session, 'dev-1')).toEqual({ ok: false, reason: 'other-device' });
  });

  it('another teacher can\'t read, change or collect someone else\'s pass or entries', async () => {
    const { session } = await teacherSendsPass();
    server.user = STRANGER;
    expect((await server.passUses([session.passId])).claimed).toEqual([]);
    await expect(server.savePass({ ...server.passes.get(session.passId)!, relief_email: STRANGER.email })).rejects.toThrow();
    await server.cancelPass(session.passId, new Date().toISOString());
    expect(server.passes.get(session.passId)!.cancelled_at).toBeNull();
    expect(await server.entries()).toEqual([]);
  });
});
