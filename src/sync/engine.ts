// Live sync between a teacher's devices.
// Every change saves on the device first and is recorded in the outbox (see outbox.ts). The engine then
//   push: sends outbox rows to the cloud, identifying fields encrypted;
//   pull: fetches every cloud row newer than the last one seen and applies it, unless a newer local change is waiting.
// The latest change wins; the server keeps earlier versions in sync_history. The transport is swappable for tests.

import { useEffect, useState } from 'preact/hooks';
import { db } from '../db';
import { decryptJson, encryptJson, importKey } from './crypto';
import { SYNCED_TABLES, isSynced, joinRow, splitRow } from './fields';
import { markRemote, onOutboxChange, setTracking, stamp } from './outbox';

export interface SyncRow {
  tbl: string;
  id: string;
  data: Record<string, unknown> | null;
  enc: string | null;
  deleted: boolean;
  client_at: string;
  device_id?: string | null;
  seq?: number;
}

export interface Transport {
  push(rows: SyncRow[]): Promise<void>;
  /** Rows with seq > after, oldest first. */
  pull(after: number, limit: number): Promise<SyncRow[]>;
}

export type SyncStatus = { state: 'off' | 'idle' | 'syncing' | 'offline' | 'error'; pending: number; lastSyncAt?: number; error?: string };

const BATCH = 400;
let transport: Transport | null = null;
let key: CryptoKey | null = null;
let deviceId: string | null = null;
let status: SyncStatus = { state: 'off', pending: 0 };
const listeners = new Set<(s: SyncStatus) => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l(status));
}
export const syncStatus = () => status;
export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState(status);
  useEffect(() => {
    listeners.add(setS);
    setS(status);
    return () => void listeners.delete(setS);
  }, []);
  return s;
}

/* ---------- Local bookkeeping ---------- */

async function getState<T>(k: string): Promise<T | undefined> {
  return (await db.syncState.get(k))?.value as T | undefined;
}
const setState = (k: string, value: unknown) => db.syncState.put({ key: k, value });

export async function storedKey(): Promise<string | undefined> {
  return getState<string>('key');
}
export async function storeKey(rawB64Url: string) {
  await setState('key', rawB64Url);
}

async function refreshPending() {
  setStatus({ pending: await db.outbox.count() });
}

/** Queues every local record for upload (first sync from a device that already has data). */
export async function enqueueAll() {
  for (const t of SYNCED_TABLES) {
    const ids = (await db.table(t).toCollection().primaryKeys()) as string[];
    if (ids.length) await db.outbox.bulkPut(ids.map((id) => ({ tbl: t, id, at: stamp() })));
  }
  await refreshPending();
}

/** Clears this device's records (without telling the cloud) so a full download can replace them. */
export async function clearLocalForDownload() {
  await db.transaction('rw', [...SYNCED_TABLES.map((t) => db.table(t)), db.outbox, db.syncState], async (tx) => {
    markRemote(tx);
    for (const t of SYNCED_TABLES) await db.table(t).clear();
    await db.outbox.clear();
    await db.syncState.delete('lastSeq');
  });
}

export async function resetPosition() {
  await db.syncState.delete('lastSeq');
}

/* ---------- Start / stop ---------- */

let debounce: ReturnType<typeof setTimeout> | undefined;
onOutboxChange(() => {
  void refreshPending();
  clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), 1200);
});

export async function startSync(opts: { transport: Transport; keyB64Url: string; deviceId: string; importRaw: (s: string) => Uint8Array }) {
  transport = opts.transport;
  deviceId = opts.deviceId;
  key = await importKey(opts.importRaw(opts.keyB64Url));
  setTracking(true);
  setStatus({ state: 'idle', error: undefined });
  await refreshPending();
  await syncNow();
}

export function stopSync() {
  setTracking(false);
  transport = null;
  key = null;
  clearTimeout(debounce);
  setStatus({ state: 'off', pending: 0, error: undefined });
}

/* ---------- Push and pull ---------- */

let running: Promise<void> | null = null;
let again = false;

/** Sends local changes, then fetches remote ones. Calls made while a sync is running queue one more pass. */
export function syncNow(): Promise<void> {
  if (!transport || !key) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setStatus({ state: 'offline' });
        break;
      }
      setStatus({ state: 'syncing' });
      try {
        await push();
        await pull();
        setStatus({ state: 'idle', lastSyncAt: Date.now(), error: undefined });
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        setStatus({ state: /fetch|network|Failed to fetch/i.test(msg) ? 'offline' : 'error', error: msg });
        break;
      }
    } while (again && transport);
    await refreshPending();
  })().finally(() => { running = null; });
  return running;
}

async function push() {
  for (;;) {
    if (!transport || !key) return;
    const batch = await db.outbox.orderBy('at').limit(BATCH).toArray();
    if (!batch.length) return;
    const rows: SyncRow[] = [];
    for (const o of batch) {
      if (!isSynced(o.tbl)) continue;
      const row = await db.table(o.tbl).get(o.id);
      const client_at = new Date(o.at).toISOString();
      if (!row) {
        rows.push({ tbl: o.tbl, id: o.id, data: null, enc: null, deleted: true, client_at, device_id: deviceId });
        continue;
      }
      const { data, secret } = splitRow(o.tbl, row);
      rows.push({ tbl: o.tbl, id: o.id, data, enc: secret ? await encryptJson(key, secret) : null, deleted: false, client_at, device_id: deviceId });
    }
    if (rows.length) await transport.push(rows);
    // Remove only entries that didn't change again while sending.
    await db.transaction('rw', db.outbox, async () => {
      for (const o of batch) {
        const cur = await db.outbox.get([o.tbl, o.id]);
        if (cur && cur.at === o.at) await db.outbox.delete([o.tbl, o.id]);
      }
    });
    await refreshPending();
    if (batch.length < BATCH) return;
  }
}

async function pull() {
  let last = (await getState<number>('lastSeq')) ?? 0;
  for (;;) {
    if (!transport || !key) return;
    const rows = await transport.pull(last, BATCH);
    if (!rows.length) return;
    const decoded = await Promise.all(rows.map(async (r) => ({
      r,
      row: r.deleted || !r.data ? null : joinRow(r.data, r.enc ? await decryptJson<Record<string, unknown>>(key!, r.enc) : null)
    })));
    last = Number(rows[rows.length - 1].seq ?? last);
    await db.transaction('rw', [...SYNCED_TABLES.map((t) => db.table(t)), db.outbox, db.syncState], async (tx) => {
      markRemote(tx);
      for (const { r, row } of decoded) {
        if (!isSynced(r.tbl)) continue;
        const waiting = await db.outbox.get([r.tbl, r.id]);
        if (waiting && waiting.at > Date.parse(r.client_at)) continue; // a newer local change will be sent
        if (row) await db.table(r.tbl).put(row);
        else await db.table(r.tbl).delete(r.id);
        if (waiting) await db.outbox.delete([r.tbl, r.id]);
      }
      await db.syncState.put({ key: 'lastSeq', value: last });
    });
    if (rows.length < BATCH) return;
  }
}
