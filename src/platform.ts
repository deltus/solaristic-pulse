// Platform helpers: files, sharing, notifications and PIN hashing.
// Everything runs locally; nothing here contacts a server (the optional account lives in cloud.ts).

import type { PinConfig } from './types';

export const isNative = () => !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

/* ---------- Files (saving lives in files.ts) ---------- */

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Reads the first sheet of a CSV/XLSX file into rows of strings. SheetJS is loaded on demand. */
export async function readSpreadsheet(file: File): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
}

export function mailtoLink(to: string, subject: string, body: string) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Opens the share sheet with a message and link. Returns false if sharing isn't available. */
export async function shareText(title: string, text: string, url: string): Promise<boolean> {
  try {
    if (isNative()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, url, dialogTitle: title });
      return true;
    }
    if (!navigator.share) return false;
    await navigator.share({ title, text, url });
    return true;
  } catch (e) {
    return (e as Error).name === 'AbortError';
  }
}

/* ---------- Install (PWA) ---------- */
// Chrome/Edge fire `beforeinstallprompt` when the app can be installed; keep it for an "Install app" button.

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let installPrompt: InstallPrompt | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e as InstallPrompt;
  });
}
export const canInstall = () => !!installPrompt;
export const isInstalled = () => isNative() || window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export async function promptInstall(): Promise<boolean> {
  if (!installPrompt) return false;
  await installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  installPrompt = null;
  return outcome === 'accepted';
}

/* ---------- Notifications ---------- */

export function notificationsSupported(): boolean {
  return isNative() || 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (isNative()) {
    const { requestNativeNotifications } = await import('./native');
    return requestNativeNotifications();
  }
  if (!('Notification' in window)) return false;
  return (await Notification.requestPermission()) === 'granted';
}

export function notificationPermission(): string {
  if (isNative()) return 'native';
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

export async function showNotification(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return void (await reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/favicon-64.png' }));
    new Notification(title, { body, icon: 'icons/icon-192.png' });
  } catch {
    /* in-app reminders still show */
  }
}

/* ---------- PIN (PBKDF2) ---------- */
// The PIN deters casual access to the app. It does NOT encrypt the stored data.

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return b64(bits);
}

export async function hashPin(pin: string): Promise<PinConfig> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 150_000;
  return { salt: b64(salt), iterations, length: pin.length, hash: await derive(pin, salt, iterations) };
}

export async function verifyPin(pin: string, cfg: PinConfig): Promise<boolean> {
  return (await derive(pin, unb64(cfg.salt), cfg.iterations)) === cfg.hash;
}

/* ---------- Storage ---------- */

export async function storageStatus(): Promise<{ persisted: boolean | null; usage?: number; quota?: number }> {
  const s = navigator.storage;
  if (!s) return { persisted: null };
  const [persisted, est] = await Promise.all([s.persisted?.() ?? Promise.resolve(null), s.estimate?.() ?? Promise.resolve({} as StorageEstimate)]);
  return { persisted, usage: est.usage, quota: est.quota };
}

export async function requestPersistentStorage(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}
