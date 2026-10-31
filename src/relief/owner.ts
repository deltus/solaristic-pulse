// The class teacher's device: sends each pass's sealed class data to the server (and refreshes it
// while the pass runs, so the check-in order stays current), cancels passes, collects the use log,
// and brings relief entries in. Entries are unsealed with the pass key, checked
// (applyReliefEntry), saved locally (so normal sync re-locks them with the teacher's own key),
// then deleted from the server.

import { db } from '../db';
import type { ReliefPass } from '../types';
import { applyReliefEntry, newPassKey, passStatus, RELIEF_TABLES, sealBundle, serverPass, unseal, type SealedEntry } from '../logic/relief';
import { reliefBundleFor } from '../services';
import { cloudConfigured, currentAccount, onAccountChange } from '../cloud';
import { supabaseRelief, type ReliefServer } from './server';

let server: ReliefServer = supabaseRelief;
/** Tests use a fake server. */
export const useReliefServer = (s: ReliefServer) => { server = s; };

export const canSendPasses = () => cloudConfigured() && currentAccount().status === 'signedIn';

/** Seals the class data for the pass (making its key if needed) and stores it on the server. */
export async function sendPass(passId: string): Promise<ReliefPass> {
  let pass = (await db.reliefPasses.get(passId))!;
  if (!pass.key) {
    await db.reliefPasses.update(passId, { key: newPassKey() });
    pass = (await db.reliefPasses.get(passId))!;
  }
  const { sealed } = await sealBundle(await reliefBundleFor(passId), pass.key!);
  await server.savePass(serverPass(pass, sealed));
  await db.reliefPasses.update(passId, { sentAt: Date.now() });
  return (await db.reliefPasses.get(passId))!;
}

/** Stops a pass here and on the server straight away. */
export async function cancelPass(passId: string) {
  const at = Date.now();
  await db.reliefPasses.update(passId, { cancelledAt: at });
  const pass = await db.reliefPasses.get(passId);
  if (pass?.sentAt) await server.cancelPass(passId, new Date(at).toISOString());
}

const REFRESH_MS = 15 * 60_000;

/** Re-sends running passes now and then (the class's check-in order changes as lessons happen). */
export async function refreshPasses(now = Date.now()) {
  for (const p of await db.reliefPasses.toArray()) {
    const st = passStatus(p, now);
    if ((st === 'active' || st === 'upcoming') && p.key && (!p.sentAt || now - p.sentAt > REFRESH_MS)) await sendPass(p.id);
  }
}

/** Copies the use log and the locked device from the server onto the local passes. */
export async function updatePassUses() {
  const passes = (await db.reliefPasses.toArray()).filter((p) => p.sentAt);
  if (!passes.length) return;
  const { uses, claimed } = await server.passUses(passes.map((p) => p.id));
  for (const p of passes) {
    const mine = uses.filter((u) => u.pass_id === p.id).map((u) => ({ at: new Date(u.used_at).getTime(), device: u.device_id ?? '', ...(u.email ? { email: u.email } : {}) }));
    const device = claimed.find((c) => c.id === p.id)?.claimed_device ?? undefined;
    if (mine.length !== (p.uses?.length ?? 0) || device !== p.claimedDevice) await db.reliefPasses.update(p.id, { uses: mine, claimedDevice: device });
  }
}

/** Brings relief entries in. Returns how many records were saved or removed. */
export async function importReliefEntries(): Promise<number> {
  const entries = await server.entries();
  if (!entries.length) return 0;
  const passes = new Map((await db.reliefPasses.toArray()).map((p) => [p.id, p]));
  // Lessons and check-ins first, so their answers can be checked against them.
  const order = (t: string) => (RELIEF_TABLES as readonly string[]).indexOf(t);
  const sorted = [...entries].sort((a, b) => order(a.tbl) - order(b.tbl) || a.client_at.localeCompare(b.client_at));
  const done: { pass_id: string; tbl: string; row_id: string }[] = [];
  const students = new Map<string, Set<string>>();
  let changed = 0;
  for (const e of sorted) {
    const pass = passes.get(e.pass_id);
    if (!pass?.key) continue; // the pass hasn't reached this device yet: leave it for later
    if (!students.has(pass.classId)) students.set(pass.classId, new Set(await db.students.where('classId').equals(pass.classId).primaryKeys() as string[]));
    let body: SealedEntry;
    try {
      body = await unseal<SealedEntry>(pass.key, e.enc);
    } catch {
      done.push({ pass_id: e.pass_id, tbl: e.tbl, row_id: e.row_id }); // not sealed with this pass's key: drop it
      continue;
    }
    const table = (RELIEF_TABLES as readonly string[]).includes(e.tbl) ? db.table(e.tbl) : null;
    const existing = table ? ((await table.get(e.row_id)) as Record<string, unknown> | undefined) : undefined;
    const checkinId = (body.row?.checkinId ?? existing?.checkinId) as string | undefined;
    const parentCheckin = (e.tbl === 'observations' || e.tbl === 'issueTags') && checkinId ? ((await db.checkins.get(checkinId)) as unknown as Record<string, unknown> | undefined) : undefined;
    const r = applyReliefEntry({ tbl: e.tbl, id: e.row_id, body }, pass, { studentIds: students.get(pass.classId)!, existing, parentCheckin });
    if (r.action === 'put') { await db.table(r.tbl).put(r.row); changed++; }
    else if (r.action === 'delete') { await db.table(r.tbl).delete(r.id); changed++; }
    done.push({ pass_id: e.pass_id, tbl: e.tbl, row_id: e.row_id });
  }
  if (done.length) await server.deleteEntries(done);
  return changed;
}

let running = false;
/** One round: refresh running passes, bring entries in, update the use log. */
export async function runReliefOwner() {
  if (running || !canSendPasses() || !navigator.onLine) return;
  running = true;
  try {
    await refreshPasses();
    await importReliefEntries();
    await updatePassUses();
  } catch (e) {
    console.warn('Relief pass update failed', e);
  } finally {
    running = false;
  }
}

/** Started once in the normal app (not on a relief device). */
export function startReliefOwner() {
  onAccountChange((a) => { if (a.status === 'signedIn') void runReliefOwner(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void runReliefOwner(); });
  setInterval(() => { if (!document.hidden) void runReliefOwner(); }, 2 * 60_000);
}
