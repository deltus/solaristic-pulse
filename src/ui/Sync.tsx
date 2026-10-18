// Live sync screens: the sync card in Account & devices, the recovery key, and "copy my records" on a new device.

import { useEffect, useState } from 'preact/hooks';
import * as sync from '../sync/cloudSync';
import { syncNow, useSyncStatus, type SyncStatus } from '../sync/engine';
import { fromRecoveryKey } from '../sync/crypto';
import { saveSettings } from '../db';
import { saveFile } from '../files';
import { Field, Icon, Sheet, toast } from './components';

type SetupState = Awaited<ReturnType<typeof sync.syncSetupState>>;

export function syncLine(s: SyncStatus): string {
  const waiting = s.pending ? `${s.pending} change${s.pending === 1 ? '' : 's'} waiting` : '';
  switch (s.state) {
    case 'syncing': return 'Syncing…';
    case 'offline': return `Offline${waiting ? `: ${waiting}, sent when you're back online` : ''}`;
    case 'error': return `Sync problem: ${s.error ?? 'unknown error'}`;
    case 'idle': return waiting || (s.lastSyncAt ? 'Up to date' : 'Ready');
    default: return 'Off';
  }
}

/* ---------- Card in Settings → Account & devices ---------- */

export function SyncCard() {
  const status = useSyncStatus();
  const [on, setOn] = useState(sync.syncWanted());
  const [flow, setFlow] = useState(false);
  const [showKey, setShowKey] = useState<string | null>(null);

  async function off() {
    if (!confirm('Turn off sync on this device? Records stay here, but changes stop going to your other devices.')) return;
    await sync.turnOffSync();
    setOn(false);
    toast('Sync turned off on this device');
  }

  return (
    <div class="card">
      <span class="eyebrow">Live sync</span>
      {!on ? (
        <>
          <p class="small">Keep your classes, check-ins, notes and ICP records the same on every device you sign in on: record on your phone, report on your PC. Changes save here first and sync within seconds when you're online.</p>
          <p class="tiny muted">Names, school IDs, notes and ICP text are encrypted on this device with a key only your devices hold. Ratings and dates are stored readable so reports can be built later.</p>
          <button class="btn primary" onClick={() => setFlow(true)}><Icon name="devices" /> Turn on sync</button>
        </>
      ) : (
        <>
          <div class="row between wrap">
            <span class={`sync-state ${status.state}`}><i />{syncLine(status)}</span>
            <button class="btn small" disabled={status.state === 'syncing'} onClick={() => void syncNow()}>Sync now</button>
          </div>
          <div class="row wrap" style="margin-top:10px">
            <button class="btn small ghost" onClick={async () => setShowKey(await sync.recoveryKey())}><Icon name="lock" /> Recovery key</button>
            <button class="btn small ghost danger" onClick={off}>Turn off on this device</button>
          </div>
        </>
      )}
      {flow && <TurnOnFlow onClose={() => setFlow(false)} onDone={() => { setFlow(false); setOn(true); }} />}
      {showKey && <Sheet title="Recovery key" onClose={() => setShowKey(null)}><RecoveryKey value={showKey} /></Sheet>}
    </div>
  );
}

function RecoveryKey({ value }: { value: string }) {
  async function save() {
    await saveFile(new Blob([`Solaristic Pulse recovery key\n\n${value}\n\nKeep this private. You need it to read your synced records on a new device if you can't scan the code from one of your devices.\n`], { type: 'text/plain' }), 'solaristic-pulse-recovery-key.txt', 'backup');
  }
  return (
    <div>
      <p class="small">This key unlocks the names and notes in your synced records. Keep it somewhere safe and private, for example in your password manager. Without it, and without one of your devices, encrypted names and notes can't be recovered, not even by Solaristic.</p>
      <div class="recovery-key mono">{value}</div>
      <div class="row wrap">
        <button class="btn small" onClick={async () => { try { await navigator.clipboard.writeText(value); toast('Copied'); } catch { toast('Copy failed'); } }}>Copy</button>
        <button class="btn small" onClick={save}><Icon name="download" /> Save as file</button>
      </div>
    </div>
  );
}

function KeyEntry({ onOk }: { onOk: () => void }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function check() {
    const raw = fromRecoveryKey(text);
    if (!raw) return setErr("That doesn't look like a recovery key: it has 52 letters and numbers.");
    setBusy(true); setErr('');
    try {
      if (await sync.adoptKey(raw)) onOk();
      else setErr("That key doesn't match your account. Check it and try again.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p class="small">Your account already syncs from another device. To unlock it here, either:</p>
      <ul class="small" style="margin:0 0 10px;padding-left:18px">
        <li>on that device, open Settings → Account & devices → <b>Add a device</b> and scan the QR code with this device's camera, or</li>
        <li>type your recovery key below.</li>
      </ul>
      <Field label="Recovery key">
        <textarea class="input mono" rows={2} spellcheck={false} autoCapitalize="characters" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder="XXXX-XXXX-XXXX-…" />
      </Field>
      {err && <p class="error small">{err}</p>}
      <button class="btn primary" disabled={busy} onClick={check}>{busy ? 'Checking…' : 'Unlock'}</button>
    </>
  );
}

function TurnOnFlow({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [st, setSt] = useState<SetupState | null>(null);
  const [step, setStep] = useState<'load' | 'key' | 'newKey' | 'mode' | 'working'>('load');
  const [newKey, setNewKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const load = () => sync.syncSetupState().then((s) => {
    setSt(s);
    setStep(!s.accountHasKey ? 'newKey' : !s.deviceHasKey ? 'key' : 'mode');
  }, (e) => setErr((e as Error).message));
  useEffect(() => { void load(); }, []);

  async function makeKey() {
    try {
      setNewKey(await sync.createAccountKey());
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => { if (step === 'newKey' && !newKey) void makeKey(); }, [step]);

  async function go(mode: 'upload' | 'merge' | 'replace') {
    setStep('working');
    try {
      await sync.turnOnSync(mode);
      toast(mode === 'replace' ? 'Your records are now on this device' : 'Sync is on');
      onDone();
    } catch (e) {
      setErr((e as Error).message);
      setStep('mode');
    }
  }

  // Decide automatically when there's only one sensible choice.
  const needsChoice = !!st && st.cloudRows > 0 && st.localClasses > 0;
  useEffect(() => {
    if (step !== 'mode' || !st || needsChoice) return;
    void go(st.cloudRows > 0 ? 'replace' : 'upload');
  }, [step, st]);

  return (
    <Sheet title="Turn on sync" onClose={onClose}>
      {err && <p class="error small">{err}</p>}
      {step === 'load' && !err && <p class="small muted">Checking your account…</p>}
      {step === 'key' && <KeyEntry onOk={() => void load()} />}
      {step === 'newKey' && (newKey ? (
        <>
          <p class="small"><b>This is your first synced device.</b> A private key has been made to encrypt names and notes.</p>
          <RecoveryKey value={newKey} />
          <label class="check" style="margin-top:12px">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved((e.target as HTMLInputElement).checked)} />
            <span>I've saved my recovery key somewhere safe.</span>
          </label>
          <button class="btn primary" disabled={!saved} onClick={() => setStep('mode')}>Continue</button>
        </>
      ) : !err && <p class="small muted">Making your key…</p>)}
      {step === 'mode' && needsChoice && st && (
        <>
          <p class="small">Your account already has records from another device, and this device has its own. What should happen?</p>
          <div class="stack">
            <button class="btn block primary" onClick={() => go('replace')}>Use my account's records here<span class="tiny" style="display:block;opacity:.8">Replaces what's on this device (e.g. demo data)</span></button>
            <button class="btn block" onClick={() => go('merge')}>Combine both<span class="tiny muted" style="display:block">Adds this device's records to your account</span></button>
          </div>
        </>
      )}
      {(step === 'working' || (step === 'mode' && !needsChoice)) && <p class="small muted">Syncing your records…</p>}
    </Sheet>
  );
}

/* ---------- During setup on a new device ---------- */

/** Shown after signing in on the first setup screen when the account already has records. */
export function SetupDownload() {
  const [st, setSt] = useState<SetupState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = () => sync.syncSetupState().then(setSt, (e) => setErr((e as Error).message));
  useEffect(() => { void load(); }, []);
  if (err) return <p class="error small">{err}</p>;
  if (!st || st.cloudRows === 0) return null;

  async function download() {
    setBusy(true);
    try {
      await sync.downloadToNewDevice();
      await saveSettings({ onboarded: true, tutorialDone: true });
      toast('Your records are on this device');
      location.hash = '#/home';
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div class="card" style="margin-bottom:14px">
      <span class="eyebrow">Your records</span>
      {st.deviceHasKey ? (
        <>
          <p class="small">Your account already has classes and records from another device. Copy them here and skip the rest of setup?</p>
          <button class="btn primary" disabled={busy} onClick={download}>{busy ? 'Copying…' : 'Copy my records to this device'}</button>
        </>
      ) : <KeyEntry onOk={() => void load()} />}
    </div>
  );
}
