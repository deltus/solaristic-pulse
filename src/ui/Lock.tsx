import { useEffect, useRef, useState } from 'preact/hooks';
import type { PinConfig } from '../types';
import { verifyPin } from '../platform';
import { deleteAllData } from '../services';

export function LockScreen({ pin, name, onUnlock }: { pin: PinConfig; name?: string; onUnlock: () => void }) {
  const [entry, setEntry] = useState('');
  const [shake, setShake] = useState(false);
  const [fails, setFails] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);
  const waiting = Date.now() < waitUntil;

  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [waiting]);

  // Refs avoid losing digits typed faster than React re-renders.
  const entryRef = useRef('');
  const busyRef = useRef(false);
  const setDigits = (v: string) => { entryRef.current = v; setEntry(v); };

  async function submit(value: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const ok = await verifyPin(value, pin);
    busyRef.current = false;
    setBusy(false);
    if (ok) return onUnlock();
    setShake(true);
    setTimeout(() => setShake(false), 400);
    setDigits('');
    const n = fails + 1;
    setFails(n);
    if (n % 5 === 0) setWaitUntil(Date.now() + 30_000);
  }

  function press(d: string) {
    if (busyRef.current || Date.now() < waitUntil) return;
    const next = (entryRef.current + d).slice(0, 8);
    setDigits(next);
    if (pin.length && next.length === pin.length) submit(next);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setDigits(entryRef.current.slice(0, -1));
      else if (e.key === 'Enter' && entryRef.current.length >= 4) submit(entryRef.current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function forgot() {
    const answer = prompt('Without the PIN the only option is to erase all data on this device (restore it afterwards from a backup file if you have one).\n\nType ERASE to delete all data and remove the PIN.');
    if (answer?.trim().toUpperCase() !== 'ERASE') return;
    await deleteAllData();
    location.reload();
  }

  return (
    <div class="lock">
      <div class="mark"><img src="icons/mark.png" alt="Solaristic Radar" /></div>
      <h1>{name?.trim() || 'Welcome back'}</h1>
      <p class="lock-sub">{waiting ? `Too many attempts. Try again in ${Math.ceil((waitUntil - Date.now()) / 1000)}s` : 'Enter your PIN'}</p>
      <div class={`pin-dots ${shake ? 'shake' : ''}`} aria-live="polite" aria-label={`${entry.length} digits entered`}>
        {Array.from({ length: Math.max(pin.length ?? 4, entry.length) }, (_, i) => <i key={i} class={i < entry.length ? 'on' : ''} />)}
      </div>
      <div class="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => press(d)}>{d}</button>)}
        <button class="text" onClick={() => setDigits(entryRef.current.slice(0, -1))}>Delete</button>
        <button onClick={() => press('0')}>0</button>
        <button class="text" disabled={entry.length < 4 || busy || waiting} onClick={() => submit(entry)}>{busy ? '…' : 'Unlock'}</button>
      </div>
      <button class="btn ghost small forgot" onClick={forgot}>Forgot PIN?</button>
    </div>
  );
}
