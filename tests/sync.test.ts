import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { PulseDB, useDatabase, db } from '../src/db';
import * as svc from '../src/services';
import { clearLocalForDownload, enqueueAll, startSync, stopSync, syncNow, type SyncRow, type Transport } from '../src/sync/engine';
import { fromB64Url, fromRecoveryKey, newKeyBytes, toB64Url, toRecoveryKey } from '../src/sync/crypto';
import { splitRow } from '../src/sync/fields';
import { setTracking } from '../src/sync/outbox';

/** In-memory stand-in for the Supabase sync_rows table and push_rows function. */
function fakeServer() {
  const rows = new Map<string, SyncRow & { seq: number }>();
  let seq = 0;
  const t: Transport & { rows: typeof rows } = {
    rows,
    async push(batch) {
      for (const r of batch) {
        const k = `${r.tbl}|${r.id}`;
        const cur = rows.get(k);
        if (cur && Date.parse(r.client_at) < Date.parse(cur.client_at)) continue;
        rows.set(k, { ...structuredClone(r), seq: ++seq });
      }
    },
    async pull(after, limit) {
      return [...rows.values()].filter((r) => r.seq > after).sort((a, b) => a.seq - b.seq).slice(0, limit).map((r) => structuredClone(r));
    }
  };
  return t;
}

const tick = () => new Promise((r) => setTimeout(r, 10));
let n = 0;
async function device() {
  const d = new PulseDB(`sync-${++n}`);
  await d.open();
  return d;
}
async function on(d: PulseDB, server: Transport, key: string, id: string) {
  useDatabase(d);
  stopSync();
  await startSync({ transport: server, keyB64Url: key, deviceId: id, importRaw: fromB64Url });
}

afterEach(() => { stopSync(); setTracking(false); });

describe('live sync', () => {
  it('keeps two devices in step: create, edit, delete, with names and notes encrypted', async () => {
    const server = fakeServer();
    const key = toB64Url(newKeyBytes());
    const A = await device(), B = await device();

    // Device A has data before sync is turned on.
    useDatabase(A);
    const cls = await svc.createClass({ name: '9B Science' });
    const stu = await svc.addStudent(cls.id, { firstName: 'Mia', lastName: 'Fictional' });
    await enqueueAll();
    await on(A, server, key, '00000000-0000-4000-8000-00000000000a');

    const cloudStudent = server.rows.get(`students|${stu.id}`)!;
    expect(cloudStudent.data).not.toHaveProperty('firstName');
    expect(cloudStudent.enc).toBeTruthy();
    expect(JSON.stringify(cloudStudent)).not.toContain('Mia');
    expect(server.rows.get(`classes|${cls.id}`)!.data).toMatchObject({ name: '9B Science' });

    // Device B downloads everything.
    useDatabase(B);
    await clearLocalForDownload();
    await on(B, server, key, '00000000-0000-4000-8000-00000000000b');
    expect((await db.students.get(stu.id))?.firstName).toBe('Mia');
    expect(await db.questions.count()).toBeGreaterThan(0);

    // An edit on B reaches A.
    await db.students.update(stu.id, { preferredName: 'Mimi' });
    await tick();
    await syncNow();
    await on(A, server, key, '00000000-0000-4000-8000-00000000000a');
    expect((await db.students.get(stu.id))?.preferredName).toBe('Mimi');

    // A delete on A reaches B.
    await db.students.delete(stu.id);
    await tick();
    await syncNow();
    expect(server.rows.get(`students|${stu.id}`)!.deleted).toBe(true);
    await on(B, server, key, '00000000-0000-4000-8000-00000000000b');
    expect(await db.students.get(stu.id)).toBeUndefined();
  });

  it('does not overwrite a newer change still waiting on this device', async () => {
    const server = fakeServer();
    const key = toB64Url(newKeyBytes());
    const A = await device();
    useDatabase(A);
    const cls = await svc.createClass({ name: 'Old' });
    await enqueueAll();
    await on(A, server, key, '00000000-0000-4000-8000-00000000000a');

    // Another device saved an older version; this device has a newer, unsent edit.
    stopSync();
    setTracking(true);
    await server.push([{ tbl: 'classes', id: cls.id, data: { ...cls, name: 'From other device' }, enc: null, deleted: false, client_at: new Date(Date.now() + 5).toISOString() }]);
    await new Promise((r) => setTimeout(r, 20));
    await db.classes.update(cls.id, { name: 'Newest here' });
    await tick();
    await on(A, server, key, '00000000-0000-4000-8000-00000000000a');
    expect((await db.classes.get(cls.id))?.name).toBe('Newest here');
    expect(server.rows.get(`classes|${cls.id}`)!.data).toMatchObject({ name: 'Newest here' });
  });

  it('does not record changes while sync is off, or changes that came from the cloud', async () => {
    const A = await device();
    useDatabase(A);
    await svc.createClass({ name: 'Untracked' });
    await tick();
    expect(await db.outbox.count()).toBe(0);
    setTracking(true);
    await svc.createClass({ name: 'Tracked' });
    await db.timetable.clear();
    await tick();
    expect(await db.outbox.where('tbl').equals('classes').count()).toBe(1);
  });
});

describe('sync keys and fields', () => {
  it('round-trips the recovery key, forgiving typing slips', () => {
    const raw = newKeyBytes();
    const text = toRecoveryKey(raw);
    expect(text.replace(/-/g, '')).toHaveLength(52);
    expect(fromRecoveryKey(text)).toEqual(raw);
    expect(fromRecoveryKey(text.toLowerCase().replace(/-/g, ' '))).toEqual(raw);
    expect(fromRecoveryKey(text.replace(/0/g, 'O'))).toEqual(raw);
    expect(fromRecoveryKey('ABCD-1234')).toBeNull();
    expect(fromB64Url(toB64Url(raw))).toEqual(raw);
  });

  it('keeps ratings readable and hides identifying text', () => {
    const { data, secret } = splitRow('observations', { id: 'o', level: 1, response: 'Needs support', note: 'Mia was upset', context: 'Peers' });
    expect(data).toEqual({ id: 'o', level: 1, response: 'Needs support' });
    expect(secret).toEqual({ note: 'Mia was upset', context: 'Peers' });
    expect(splitRow('checkins', { id: 'c', status: 'complete' }).secret).toBeNull();
  });
});
