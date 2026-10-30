// The relief-pass server calls (supabase/migrations/20261027000000_relief_passes.sql), behind an
// interface so tests can use a fake server that follows the same rules.

import { sb } from '../cloud';

export interface ServerPass { id: string; class_id: string; starts_at: string; ends_at: string; relief_email: string | null; sealed: string; cancelled_at: string | null }
export interface ServerEntry { pass_id: string; tbl: string; row_id: string; enc: string; client_at: string }
export interface ServerUse { pass_id: string; email: string | null; device_id: string | null; used_at: string }

export interface ReliefServer {
  /* Class teacher */
  savePass(p: ServerPass): Promise<void>;
  cancelPass(id: string, at: string): Promise<void>;
  passUses(ids: string[]): Promise<{ uses: ServerUse[]; claimed: { id: string; claimed_device: string | null }[] }>;
  entries(): Promise<ServerEntry[]>;
  deleteEntries(keys: { pass_id: string; tbl: string; row_id: string }[]): Promise<void>;
  /* Relief teacher */
  claim(passId: string, device: string): Promise<{ sealed: string; class_id: string; ends_at: string }>;
  state(passId: string, device: string): Promise<'active' | 'cancelled' | 'expired'>;
  push(passId: string, device: string, rows: { tbl: string; id: string; enc: string; client_at: string }[]): Promise<number>;
}

/** Server errors come back as a short code (see the migration); anything else is passed on as is. */
export function errorCode(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  return msg.match(/not-signed-in|not-found|cancelled|not-yet|expired|wrong-email|other-device|bad-batch/)?.[0] ?? msg;
}

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

export const supabaseRelief: ReliefServer = {
  async savePass(p) {
    const c = await sb();
    const { error } = await c.from('relief_passes').upsert({ ...p, updated_at: new Date().toISOString() });
    fail(error);
  },
  async cancelPass(id, at) {
    const c = await sb();
    const { error } = await c.from('relief_passes').update({ cancelled_at: at, updated_at: new Date().toISOString() }).eq('id', id);
    fail(error);
  },
  async passUses(ids) {
    if (!ids.length) return { uses: [], claimed: [] };
    const c = await sb();
    const [u, p] = await Promise.all([
      c.from('relief_uses').select('pass_id, email, device_id, used_at').in('pass_id', ids).order('used_at'),
      c.from('relief_passes').select('id, claimed_device').in('id', ids)
    ]);
    fail(u.error); fail(p.error);
    return { uses: (u.data ?? []) as ServerUse[], claimed: (p.data ?? []) as { id: string; claimed_device: string | null }[] };
  },
  async entries() {
    const c = await sb();
    const { data, error } = await c.from('relief_entries').select('pass_id, tbl, row_id, enc, client_at').order('client_at').limit(1000);
    fail(error);
    return (data ?? []) as ServerEntry[];
  },
  async deleteEntries(keys) {
    const c = await sb();
    for (const k of keys) {
      const { error } = await c.from('relief_entries').delete().match(k);
      fail(error);
    }
  },
  async claim(passId, device) {
    const c = await sb();
    const { data, error } = await c.rpc('claim_relief_pass', { p_id: passId, p_device: device });
    fail(error);
    return data as { sealed: string; class_id: string; ends_at: string };
  },
  async state(passId, device) {
    const c = await sb();
    const { data, error } = await c.rpc('relief_pass_state', { p_id: passId, p_device: device });
    fail(error);
    return data as 'active' | 'cancelled' | 'expired';
  },
  async push(passId, device, rows) {
    const c = await sb();
    const { data, error } = await c.rpc('push_relief_entries', { p_id: passId, p_device: device, p_rows: rows });
    fail(error);
    return data as number;
  }
};
