import { useState } from 'preact/hooks';
import { saveSettings } from '../db';
import { hashPin } from '../platform';
import { Field } from './components';

export function PrivacyNotice() {
  return (
    <div class="small stack">
      <p><b>Where your data is stored.</b> Everything you enter (classes, students, observations, ICP records, timetable and settings) is saved only in this app's local storage on this device (IndexedDB). Student records are not sent to a server, cloud database or AI service. The app works without an internet connection.</p>
      <p><b>Optional account.</b> If you sign in (Settings → Account & devices), your email, name, school, a list of your devices and any invites you create are stored in the Solaristic account service (Supabase). No student information is included unless you turn on <b>Live sync</b>: then your records are also stored there so your devices stay in step. Names, school IDs, notes and ICP text are encrypted on this device first with a key only your devices hold. Ratings and dates are stored readable.</p>
      <p><b>Not encrypted.</b> Local storage is <u>not encrypted</u> by this app. The optional PIN stops casual access to the app but does not encrypt data. Use a device with its own screen lock and encryption.</p>
      <p><b>Backups are your responsibility.</b> Uninstalling the app or clearing site data deletes the records. Download regular backups (Settings → Data) and store them according to your school's policy. Backup and export files are not encrypted.</p>
      <p><b>Use with real students only after checking policy.</b> Student information is sensitive. Before entering real student records, check your school's and education department's privacy, record-keeping and device policies. Record only what you need, and write notes factually.</p>
      <p><b>Not a diagnostic tool.</b> Trends and priorities are simple counts and rules based on your own observations. They are not assessments, diagnoses or labels.</p>
    </div>
  );
}

export function PinSetup({ onDone, onSkip }: { onDone: () => void; onSkip?: () => void }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState('');
  async function save() {
    if (!/^\d{4,8}$/.test(a)) return setErr('Use 4 to 8 digits.');
    if (a !== b) return setErr('The PINs do not match.');
    await saveSettings({ pin: await hashPin(a) });
    onDone();
  }
  return (
    <div>
      <Field label="New PIN (4–8 digits)">
        <input class="input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={a} onInput={(e) => setA((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
      </Field>
      <Field label="Confirm PIN">
        <input class="input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={b} onInput={(e) => setB((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
      </Field>
      {err && <p class="small" style="color:var(--sig)">{err}</p>}
      <div class="actions">
        {onSkip && <button class="btn" onClick={onSkip}>Skip for now</button>}
        <button class="btn primary" onClick={save}>Set PIN</button>
      </div>
    </div>
  );
}

