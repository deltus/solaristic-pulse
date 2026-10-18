// Android (Capacitor) implementations. Loaded only when running inside the native app.

import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';
import { FileOpener } from '@capacitor-community/file-opener';
import type { PlannedReminder } from './logic/reminderPlan';

const SMALL_ICON = 'ic_stat_pulse';
const FOLDER = 'Solaristic Radar';

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export interface NativeFile { uri: string; path: string; directory: Directory; location: string }

/** Writes to Documents/Solaristic Radar; falls back to the app's own storage if shared storage is blocked. */
export async function writeNative(blob: Blob, filename: string): Promise<NativeFile> {
  const data = await toBase64(blob);
  const path = `${FOLDER}/${filename}`;
  try {
    const r = await Filesystem.writeFile({ path, data, directory: Directory.Documents, recursive: true });
    return { uri: r.uri, path, directory: Directory.Documents, location: `Documents › ${FOLDER}` };
  } catch {
    const r = await Filesystem.writeFile({ path, data, directory: Directory.External, recursive: true });
    return { uri: r.uri, path, directory: Directory.External, location: 'App storage (open it from Recent files)' };
  }
}

/** Opens the file in the phone's default app (e.g. Excel, Sheets). Falls back to the share sheet. */
export async function openNative(uri: string, mime: string, title: string): Promise<void> {
  try {
    await FileOpener.open({ filePath: uri, contentType: mime, openWithDefault: true });
  } catch {
    await shareNative(uri, title);
  }
}

export async function shareNative(uri: string, title: string): Promise<void> {
  await Share.share({ title, files: [uri], dialogTitle: title });
}

/** Shares a blob directly (no saved copy), e.g. "Share / attach" on a fresh report. */
export async function shareBlobNative(blob: Blob, filename: string, title: string): Promise<void> {
  const file = await Filesystem.writeFile({ path: filename, data: await toBase64(blob), directory: Directory.Cache });
  await shareNative(file.uri, title);
}

export async function deleteNative(path: string, directory: string): Promise<void> {
  try { await Filesystem.deleteFile({ path, directory: directory as Directory }); } catch { /* already gone */ }
}

/* ---------- Notifications ---------- */

export async function notificationState(): Promise<'granted' | 'denied' | 'prompt'> {
  const p = await LocalNotifications.checkPermissions();
  return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt';
}

export async function requestNativeNotifications(): Promise<boolean> {
  const p = await LocalNotifications.requestPermissions();
  return p.display === 'granted';
}

/** Android 12+: whether reminders can fire at the exact time ("Alarms & reminders"). */
export async function exactAlarmState(): Promise<'granted' | 'denied' | 'n/a'> {
  try {
    const r = await LocalNotifications.checkExactNotificationSetting();
    return r.exact_alarm === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'n/a';
  }
}

export async function openExactAlarmSettings(): Promise<void> {
  await LocalNotifications.changeExactNotificationSetting();
}

export async function testNativeNotification(): Promise<void> {
  await LocalNotifications.schedule({
    notifications: [{ id: 90000, title: 'Solaristic Radar', body: 'Test reminder: notifications are working.', smallIcon: SMALL_ICON, schedule: { at: new Date(Date.now() + 2000), allowWhileIdle: true } }]
  });
}

let fileNoteId = 91000;
/** "Report saved, tap to open" — only shown if notifications are allowed. */
export async function notifyFileSaved(fileId: string, name: string, kind: string): Promise<void> {
  if ((await notificationState()) !== 'granted') return;
  await LocalNotifications.schedule({
    notifications: [{
      id: fileNoteId++, title: `${kind === 'backup' ? 'Backup' : kind === 'sample' ? 'Sample file' : 'Report'} saved`, body: `${name}: tap to open`,
      smallIcon: SMALL_ICON, extra: { fileId }, schedule: { at: new Date(Date.now() + 500), allowWhileIdle: true }
    }]
  });
}

/** Replaces all pending lesson reminders with the given plan (scheduled on the device; no server involved). */
export async function scheduleNativeReminders(items: PlannedReminder[]): Promise<void> {
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter((n) => n.id < 90000);
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  if (!items.length || (await notificationState()) !== 'granted') return;
  await LocalNotifications.schedule({
    notifications: items.slice(0, 200).map((it, i) => ({
      id: i + 1, title: it.title, body: it.body, smallIcon: SMALL_ICON, extra: it.classId ? { classId: it.classId } : undefined,
      schedule: { at: it.at, allowWhileIdle: true }
    }))
  });
}

/** Tapping a notification: open the saved file, or jump to that class's check-ins. */
export function onNotificationTap(handler: (extra: { fileId?: string; classId?: string }) => void): void {
  LocalNotifications.addListener('localNotificationActionPerformed', (a) => handler((a.notification.extra ?? {}) as { fileId?: string; classId?: string }));
}
