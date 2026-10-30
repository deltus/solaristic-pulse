// Records every change to a synced table in the `outbox` table, so the sync engine can send it later.
// Works as Dexie middleware, so every screen, import, restore and demo load is covered without changes.
// Changes applied *from* the cloud run in transactions marked with markRemote() and are not recorded.

import type { DBCore, DBCoreMutateRequest, DBCoreMutateResponse, DBCoreTable, Dexie, Middleware } from 'dexie';
import { isSynced } from './fields';

export interface OutboxEntry { tbl: string; id: string; at: number }

let tracking = false;
/** Recording is on only while sync is switched on for this device. */
export const setTracking = (on: boolean) => { tracking = on; };
export const isTracking = () => tracking;

let lastAt = 0;
/** Strictly increasing timestamp, so two changes in the same millisecond still order correctly. */
export function stamp(): number {
  lastAt = Math.max(Date.now(), lastAt + 1);
  return lastAt;
}

const remote = new WeakSet<object>();
/** Call inside a Dexie transaction to stop its writes being recorded (used when applying cloud changes). */
export function markRemote(tx: { idbtrans: object }) {
  remote.add(tx.idbtrans);
}

let onRecorded: () => void = () => {};
let writing: Promise<void> = Promise.resolve();
/** Resolves once changes made so far are in the outbox (they're written a moment after the change). */
export const outboxSettled = () => writing;
export const onOutboxChange = (fn: () => void) => { onRecorded = fn; };

export function outboxMiddleware(db: Dexie): Middleware<DBCore> {
  let pending = new Map<string, OutboxEntry>();
  let scheduled = false;
  const record = (tbl: string, keys: unknown[]) => {
    const at = stamp();
    for (const k of keys) if (typeof k === 'string') pending.set(`${tbl}\u0001${k}`, { tbl, id: k, at });
    if (scheduled) return;
    scheduled = true;
    // Written in its own transaction straight after the change; an aborted change just sends the current row again.
    writing = new Promise<void>((done) => setTimeout(async () => {
      scheduled = false;
      const batch = [...pending.values()];
      pending = new Map();
      try {
        await db.table('outbox').bulkPut(batch);
        onRecorded();
      } catch (e) {
        console.error('Could not record changes for sync', e);
      }
      done();
    }, 0));
  };

  return {
    stack: 'dbcore',
    name: 'sync-outbox',
    create(down) {
      return {
        ...down,
        table(name) {
          const t = down.table(name);
          if (!isSynced(name)) return t;
          const wrapped: DBCoreTable = {
            ...t,
            async mutate(req: DBCoreMutateRequest): Promise<DBCoreMutateResponse> {
              if (!tracking || remote.has(req.trans as object)) return t.mutate(req);
              let keys: unknown[] = [];
              if (req.type === 'delete') keys = req.keys;
              else if (req.type === 'deleteRange') {
                const r = await t.query({ trans: req.trans, values: false, query: { index: t.schema.primaryKey, range: req.range } });
                keys = r.result;
              }
              const res = await t.mutate(req);
              if (req.type === 'add' || req.type === 'put') {
                const pk = t.schema.primaryKey;
                keys = req.keys ?? res.results ?? req.values.map((v) => pk.extractKey?.(v));
                if (res.numFailures) keys = keys.filter((_, i) => !(i in res.failures));
              }
              record(name, keys);
              return res;
            }
          };
          return wrapped;
        }
      };
    }
  };
}
