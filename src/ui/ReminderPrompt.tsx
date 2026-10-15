// "Turn on reminders" — used in first-time setup, on Today and in Settings.

import { useEffect, useState } from 'preact/hooks';
import { getSettings, saveSettings } from '../db';
import { isNative } from '../platform';
import { Icon, toast } from './components';

export type NotifState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export async function notifState(): Promise<NotifState> {
  if (isNative()) return (await import('../native')).notificationState();
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : (Notification.permission as NotifState);
}

/** Asks for permission and switches reminders on if allowed. */
export async function turnOnReminders(): Promise<NotifState> {
  let granted = false;
  if (isNative()) granted = await (await import('../native')).requestNativeNotifications();
  else if ('Notification' in window) granted = (await Notification.requestPermission()) === 'granted';
  if (granted) {
    const s = await getSettings();
    await saveSettings({ reminders: { ...s.reminders, enabled: true } });
  }
  return notifState();
}

export function ReminderPrompt({ compact, onDone }: { compact?: boolean; onDone?: (on: boolean) => void }) {
  const [state, setState] = useState<NotifState | null>(null);
  const [exact, setExact] = useState<'granted' | 'denied' | 'n/a'>('n/a');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setState(await notifState());
    if (isNative()) setExact(await (await import('../native')).exactAlarmState());
  };
  useEffect(() => {
    refresh();
    // Re-check when the teacher comes back from the phone's settings.
    const on = () => !document.hidden && refresh();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  async function enable() {
    setBusy(true);
    const s = await turnOnReminders();
    setBusy(false);
    setState(s);
    if (s === 'granted') {
      toast('Reminders are on');
      if (isNative()) setExact(await (await import('../native')).exactAlarmState());
      onDone?.(true);
    }
  }

  if (state === null) return null;
  if (state === 'unsupported') {
    return <p class="small muted">This browser can't show notifications. In-app reminders on Today still work.</p>;
  }
  if (state === 'denied') {
    return (
      <div class="notice">
        <b>Notifications are blocked for Pulse.</b>{' '}
        {isNative()
          ? 'Open your phone’s Settings → Apps → Solaristic Pulse → Notifications, switch them on, then come back.'
          : 'Allow notifications for this site in your browser’s settings, then come back.'}
        <div style="margin-top:8px"><button class="btn small" onClick={refresh}>I’ve allowed them</button></div>
      </div>
    );
  }
  return (
    <div class="stack">
      {state !== 'granted' && (
        <button class={`btn primary ${compact ? '' : 'block'}`} disabled={busy} onClick={enable}><Icon name="bell" /> Turn on reminders</button>
      )}
      {state === 'granted' && !compact && <p class="small" style="color:var(--ok)"><Icon name="check" class="sr-only" />Notifications are allowed.</p>}
      {state === 'granted' && exact === 'denied' && (
        <div class="notice info">
          For reminders right on time, allow <b>Alarms &amp; reminders</b> for Pulse. Without it they can arrive a few minutes late.
          <div style="margin-top:8px"><button class="btn small" onClick={async () => (await import('../native')).openExactAlarmSettings()}>Allow on-time reminders</button></div>
        </div>
      )}
    </div>
  );
}
