// Optional Supabase account: sign in by email on several devices, list/remove linked devices,
// and invite other teachers with a QR code or email link.
// Only account details go to Supabase; student records stay on the device (see docs/SUPABASE.md).
// Everything here is inert unless VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set at build time.

import { useEffect, useState } from 'preact/hooks';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { isNative } from './platform';
import { deviceName, readLaunchParams } from './logic/invite';
import { getSettings } from './db';
import { toast } from './ui/components';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const LIVE_APP_URL = 'https://deltus.github.io/solaristic-pulse/';

export const cloudConfigured = () => !!(URL_ && KEY);

/** Public address used in invite links and sign-in emails. */
export function appUrl(): string {
  const env = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined;
  if (env) return env;
  if (isNative()) return LIVE_APP_URL;
  return location.origin + location.pathname;
}

/** Optional direct download for the Android app (e.g. a GitHub Release asset). */
export const apkUrl = () => (import.meta.env.VITE_ANDROID_APK_URL as string | undefined) || undefined;

/* ---------- Client and session state ---------- */

let client: Promise<SupabaseClient> | null = null;
function sb(): Promise<SupabaseClient> {
  if (!cloudConfigured()) throw new Error('Cloud sign-in is not set up in this build.');
  client ??= import('@supabase/supabase-js').then(({ createClient }) => {
    const c = createClient(URL_!, KEY!, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'pulse.auth' }
    });
    c.auth.onAuthStateChange((event, session) => {
      setAccount(session?.user ? { status: 'signedIn', user: session.user } : { status: 'signedOut' });
      // Defer: Supabase calls inside this callback can deadlock the auth lock.
      if (event === 'SIGNED_IN') setTimeout(() => void afterSignIn(), 0);
    });
    return c;
  });
  return client;
}

export type Account = { status: 'off' } | { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: User };
let account: Account = { status: cloudConfigured() ? 'loading' : 'off' };
const listeners = new Set<(a: Account) => void>();
function setAccount(a: Account) {
  account = a;
  listeners.forEach((l) => l(a));
}

export function useAccount(): Account {
  const [a, setA] = useState(account);
  useEffect(() => {
    listeners.add(setA);
    setA(account);
    return () => void listeners.delete(setA);
  }, []);
  return a;
}

/* ---------- Start-up ---------- */

const INVITE_KEY = 'pulse.invite';
const SIGNIN_KEY = 'pulse.signinEmail';
const DEVICE_KEY = 'pulse.deviceId';

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* private mode */ } }
};

/** Called once at launch: remembers `?invite=` / `?signin=` from the link, then restores any session. */
export function initCloud() {
  const p = readLaunchParams(location.href);
  if (p.invite) ls.set(INVITE_KEY, p.invite);
  if (p.signin) ls.set(SIGNIN_KEY, p.signin);
  if (p.clean) history.replaceState(null, '', p.clean);
  if (!cloudConfigured()) return;
  sb().then(async (c) => {
    const { data } = await c.auth.getSession();
    setAccount(data.session?.user ? { status: 'signedIn', user: data.session.user } : { status: 'signedOut' });
    if (data.session) void checkInDevice();
  }).catch(() => setAccount({ status: 'signedOut' }));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && account.status === 'signedIn') void checkInDevice();
  });
}

export const pendingInvite = () => ls.get(INVITE_KEY);
export const dismissInvite = () => ls.del(INVITE_KEY);
export const suggestedEmail = () => ls.get(SIGNIN_KEY);

/* ---------- Sign in / out ---------- */

/** Emails a one-time code (and a sign-in link) to the address. */
export async function sendSignInCode(email: string) {
  const c = await sb();
  const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: appUrl() } });
  if (error) throw new Error(friendly(error.message));
}

export async function verifySignInCode(email: string, code: string) {
  const c = await sb();
  const { error } = await c.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) throw new Error(friendly(error.message));
}

export async function signOut() {
  const c = await sb();
  await c.auth.signOut({ scope: 'local' });
}

/** Signs out every other device (e.g. a lost phone). This device stays signed in. */
export async function signOutOtherDevices() {
  const c = await sb();
  const { error } = await c.auth.signOut({ scope: 'others' });
  if (error) throw new Error(friendly(error.message));
}

function friendly(msg: string) {
  if (/expired|invalid/i.test(msg) && /token|otp|code/i.test(msg)) return 'That code is wrong or has expired. Request a new one.';
  if (/rate limit|security purposes/i.test(msg)) return 'Too many attempts. Wait a minute and try again.';
  if (/fetch|network/i.test(msg)) return 'No connection. Check your internet and try again.';
  return msg;
}

/** Copies the teacher's name and school to their account (no-op when signed out). */
export async function saveProfile(p: { name: string; school?: string }) {
  if (account.status !== 'signedIn') return;
  const c = await sb();
  const { error } = await c.from('profiles').upsert({ id: account.user.id, display_name: p.name, school: p.school ?? '', updated_at: new Date().toISOString() });
  if (error) throw new Error(friendly(error.message));
}

/** Profile, this device and any invite the teacher arrived with. */
async function afterSignIn() {
  ls.del(SIGNIN_KEY);
  try {
    const s = await getSettings();
    const c = await sb();
    if (account.status !== 'signedIn') return;
    await saveProfile(s.profile);
    await checkInDevice();
    const code = pendingInvite();
    if (code) {
      await c.rpc('accept_invite', { p_code: code });
      dismissInvite();
    }
  } catch (e) {
    console.warn('Account set-up after sign-in failed', e);
  }
}

/* ---------- Linked devices ---------- */

export function thisDeviceId(): string {
  let id = ls.get(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    ls.set(DEVICE_KEY, id);
  }
  return id;
}

export interface Device { id: string; name: string; platform: string; created_at: string; last_seen: string; revoked_at: string | null }

let checking = false;
/** Records this device as active; signs out here if it was removed from another device. */
export async function checkInDevice() {
  if (checking || !navigator.onLine) return;
  checking = true;
  try {
    const c = await sb();
    const { data: revoked, error } = await c.rpc('touch_device', {
      p_id: thisDeviceId(), p_name: deviceName(navigator.userAgent, isNative()), p_platform: isNative() ? 'android' : 'web'
    });
    if (!error && revoked) {
      await c.auth.signOut({ scope: 'local' });
      ls.del(DEVICE_KEY);
      toast('This device was removed from your account and has been signed out.');
    }
  } finally {
    checking = false;
  }
}

export async function listDevices(): Promise<Device[]> {
  const c = await sb();
  const { data, error } = await c.from('devices').select('*').is('revoked_at', null).order('last_seen', { ascending: false });
  if (error) throw new Error(friendly(error.message));
  return data as Device[];
}

/** Removes a device: it signs itself out the next time it opens. */
export async function removeDevice(id: string) {
  const c = await sb();
  const { error } = await c.from('devices').update({ revoked_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(friendly(error.message));
}

/* ---------- Invites ---------- */

export interface Invite { code: string; invitee_email: string | null; created_at: string; expires_at: string; accepted_at: string | null }

export async function createInvite(code: string, inviterName: string, inviteeEmail?: string): Promise<void> {
  const c = await sb();
  const { error } = await c.from('invites').insert({ code, inviter_name: inviterName, invitee_email: inviteeEmail || null });
  if (error) throw new Error(friendly(error.message));
}

export async function listInvites(): Promise<Invite[]> {
  const c = await sb();
  const { data, error } = await c.from('invites').select('code, invitee_email, created_at, expires_at, accepted_at').order('created_at', { ascending: false }).limit(20);
  if (error) throw new Error(friendly(error.message));
  return data as Invite[];
}

export async function deleteInvite(code: string) {
  const c = await sb();
  const { error } = await c.from('invites').delete().eq('code', code);
  if (error) throw new Error(friendly(error.message));
}

/** Who sent an invite (works before signing in). */
export async function inviteDetails(code: string): Promise<{ inviter_name: string; expired: boolean; accepted: boolean } | null> {
  if (!cloudConfigured()) return null;
  const c = await sb();
  const { data } = await c.rpc('invite_details', { p_code: code });
  return (data as { inviter_name: string; expired: boolean; accepted: boolean }[] | null)?.[0] ?? null;
}
