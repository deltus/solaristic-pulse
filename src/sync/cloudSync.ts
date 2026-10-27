// Connects the sync engine to Supabase: the account's encryption key, turning sync on and off,
// and live updates (Supabase Realtime tells this device when another device saved something).

import { useEffect, useState } from 'preact/hooks';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { planAutoSync } from './plan';
import { currentAccount, onAccountChange, sb, thisDeviceId } from '../cloud';
import { db, getSettings, saveSettings } from '../db';
import { storageKey } from '../preview';
import { fromB64Url, importKey, keyMatches, makeKeyCheck, newKeyBytes, toB64Url, toRecoveryKey } from './crypto';
import {
  clearLocalForDownload, enqueueAll, resetPosition, startSync, stopSync, storeKey, storedKey, syncNow, type SyncRow, type Transport
} from './engine';

const SYNC_ON = storageKey('pulse.sync');
const PENDING_KEY = storageKey('pulse.pendingKey');
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* private mode */ } }
};

export const syncWanted = () => ls.get(SYNC_ON) === 'on';
/** True when the teacher switched sync off on this device; then it isn't turned back on automatically. */
const syncDeclined = () => ls.get(SYNC_ON) === 'off';
const KEY_UNSAVED = storageKey('pulse.keyUnsaved');

/* ---------- Things the teacher needs to do (shown as a banner) ---------- */

export type Attention = 'needKey' | 'choose' | 'saveKey' | null;
let attention: Attention = ls.get(KEY_UNSAVED) ? 'saveKey' : null;
const attentionListeners = new Set<(a: Attention) => void>();
function setAttention(a: Attention) {
  attention = a;
  attentionListeners.forEach((l) => l(a));
}
export function useSyncAttention(): Attention {
  const [a, setA] = useState(attention);
  useEffect(() => {
    attentionListeners.add(setA);
    setA(attention);
    return () => void attentionListeners.delete(setA);
  }, []);
  return a;
}
export function recoveryKeySaved() {
  ls.del(KEY_UNSAVED);
  if (attention === 'saveKey') setAttention(null);
}
export const hasPendingKey = () => !!ls.get(PENDING_KEY);

function transport(): Transport {
  return {
    async push(rows: SyncRow[]) {
      const c = await sb();
      const { error } = await c.rpc('push_rows', { p_rows: rows });
      if (error) throw new Error(error.message);
    },
    async pull(after: number, limit: number) {
      const c = await sb();
      const { data, error } = await c.from('sync_rows').select('tbl,id,data,enc,deleted,client_at,seq').gt('seq', after).order('seq').limit(limit);
      if (error) throw new Error(error.message);
      return data as SyncRow[];
    }
  };
}

/* ---------- The account's encryption key ---------- */

async function accountKeyCheck(): Promise<string | null> {
  const c = await sb();
  const { data, error } = await c.from('sync_keys').select('key_check').maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { key_check: string } | null)?.key_check ?? null;
}

/** What turning sync on will involve on this device. */
export async function syncSetupState(): Promise<{ accountHasKey: boolean; deviceHasKey: boolean; cloudRows: number; localClasses: number }> {
  const c = await sb();
  const [check, local, count] = await Promise.all([
    accountKeyCheck(),
    storedKey(),
    c.from('sync_rows').select('id', { count: 'exact', head: true }).eq('deleted', false)
  ]);
  let deviceHasKey = false;
  if (check && local) deviceHasKey = await keyMatches(await importKey(fromB64Url(local)), check);
  if (check && !deviceHasKey) deviceHasKey = await usePendingKey(check);
  return { accountHasKey: !!check, deviceHasKey, cloudRows: count.count ?? 0, localClasses: await db.classes.count() };
}

/** First device: makes the key and returns the recovery key to show the teacher. */
export async function createAccountKey(): Promise<string> {
  const raw = newKeyBytes();
  const c = await sb();
  const { error } = await c.from('sync_keys').insert({ key_check: await makeKeyCheck(await importKey(raw)) });
  if (error) throw new Error(/duplicate/i.test(error.message) ? 'Your account already has a sync key. Enter your recovery key instead.' : error.message);
  await storeKey(toB64Url(raw));
  return toRecoveryKey(raw);
}

/** Another device: checks a typed recovery key (or one from the QR code) against the account. */
export async function adoptKey(raw: Uint8Array): Promise<boolean> {
  const check = await accountKeyCheck();
  if (!check || !(await keyMatches(await importKey(raw), check))) return false;
  await storeKey(toB64Url(raw));
  return true;
}

async function usePendingKey(check: string): Promise<boolean> {
  const p = ls.get(PENDING_KEY);
  if (!p) return false;
  try {
    const raw = fromB64Url(p);
    if (await keyMatches(await importKey(raw), check)) {
      await storeKey(toB64Url(raw));
      ls.del(PENDING_KEY);
      return true;
    }
  } catch { /* malformed */ }
  return false;
}

export async function recoveryKey(): Promise<string | null> {
  const k = await storedKey();
  return k ? toRecoveryKey(fromB64Url(k)) : null;
}

/** The fragment (#pk=…) added to the "Add a device" QR code. Fragments are never sent to any server. */
export async function keyFragment(): Promise<string> {
  const k = await storedKey();
  return k ? `#pk=${k}` : '';
}

/* ---------- On / off ---------- */

/**
 * upload: this device's records become the account's (first device).
 * merge: both are combined; the newest version of each record wins.
 * replace: this device's records are replaced by the account's.
 */
export async function turnOnSync(mode: 'upload' | 'merge' | 'replace') {
  if (mode === 'replace') await clearLocalForDownload();
  else {
    await resetPosition();
    await enqueueAll();
  }
  ls.set(SYNC_ON, 'on');
  if (attention === 'needKey' || attention === 'choose') setAttention(ls.get(KEY_UNSAVED) ? 'saveKey' : null);
  await resume();
}

/** explicit: the teacher chose to switch it off here, so it stays off until they turn it on again. */
export async function turnOffSync(explicit = true) {
  if (explicit) ls.set(SYNC_ON, 'off');
  else ls.del(SYNC_ON);
  if (attention === 'needKey' || attention === 'choose') setAttention(null);
  stopSync();
  await unsubscribe();
}

/** On a new device during setup: download everything and copy the profile name. */
export async function downloadToNewDevice() {
  await turnOnSync('replace');
  const a = currentAccount();
  if (a.status !== 'signedIn') return;
  const c = await sb();
  const { data } = await c.from('profiles').select('display_name, school').maybeSingle();
  const p = data as { display_name: string; school: string } | null;
  await saveSettings({ profile: { name: p?.display_name ?? '', email: a.user.email ?? '', school: p?.school ?? '' }, privacyAcceptedAt: Date.now() });
}

let channel: RealtimeChannel | null = null;
async function unsubscribe() {
  if (!channel) return;
  const c = await sb();
  await c.removeChannel(channel);
  channel = null;
}

async function resume() {
  const a = currentAccount();
  if (!syncWanted() || a.status !== 'signedIn') return;
  const k = await storedKey();
  if (!k) return;
  await startSync({ transport: transport(), keyB64Url: k, deviceId: thisDeviceId(), importRaw: fromB64Url });
  if (channel) return;
  const c = await sb();
  let t: ReturnType<typeof setTimeout> | undefined;
  // A fresh name each time: supabase-js hands back a still-closing channel if the name is reused.
  channel = c.channel(`sync-${a.user.id}-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sync_rows', filter: `user_id=eq.${a.user.id}` }, () => {
      clearTimeout(t);
      t = setTimeout(() => void syncNow(), 400);
    })
    .subscribe();
}

let autoRunning = false;
/**
 * Turns sync on by itself when a signed-in device hasn't decided yet: uploads from the account's first device,
 * downloads onto an empty device, and only asks (banner) when the key is missing or both sides have records.
 */
export async function autoSync() {
  const a = currentAccount();
  if (autoRunning || a.status !== 'signedIn' || syncWanted() || syncDeclined()) return;
  if (!(await getSettings()).onboarded) return; // first-time setup offers "Copy my records" itself
  autoRunning = true;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const plan = planAutoSync(await syncSetupState());
      if (plan === 'needKey' || plan === 'choose') return setAttention(plan);
      if (plan === 'createKeyAndUpload') {
        try {
          await createAccountKey();
        } catch {
          continue; // another device made the key at the same moment: decide again
        }
        ls.set(KEY_UNSAVED, '1');
        setAttention('saveKey');
      }
      return await turnOnSync(plan === 'download' ? 'replace' : 'upload');
    }
  } catch (e) {
    console.warn('Automatic sync set-up failed', e);
  } finally {
    autoRunning = false;
  }
}

/** Called once at launch, before the app's router reads the address. */
export function initSync() {
  const m = location.hash.match(/^#pk=([A-Za-z0-9_-]{40,})/);
  if (m) {
    ls.set(PENDING_KEY, m[1]);
    history.replaceState(null, '', location.pathname + location.search + '#/');
  }
  let wasSignedIn = false;
  onAccountChange(async (a) => {
    const signedOut = wasSignedIn && a.status === 'signedOut';
    wasSignedIn = a.status === 'signedIn';
    if (a.status === 'signedIn') {
      await resume();
      await autoSync();
    } else if (signedOut) {
      // Signing out (or this device being removed) stops sync and forgets the key; records stay on the device.
      // Signing in again turns it back on automatically.
      await turnOffSync(false);
      ls.del(KEY_UNSAVED);
      setAttention(null);
      await db.syncState.delete('key');
    }
  });
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void syncNow(); });
  setInterval(() => { if (!document.hidden) void syncNow(); }, 60_000);
}

/**
 * Part of "Delete all data on this device": stops sync first (so nothing is deleted in the cloud),
 * then signs out and forgets the sync key and every saved sign-in detail. Records are deleted by the caller.
 */
export async function forgetAccountOnThisDevice() {
  await turnOffSync(true);
  if (currentAccount().status === 'signedIn') await (await sb()).auth.signOut({ scope: 'local' }).catch(() => {});
  await db.syncState.clear();
  await db.outbox.clear();
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(storageKey('pulse.'))) localStorage.removeItem(k);
  } catch { /* private mode */ }
  setAttention(null);
}
