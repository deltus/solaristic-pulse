import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Student } from '../types';

/* ---------- Icons (inline SVG, stroke style) ---------- */
const P: Record<string, JSX.Element> = {
  today: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  classes: <><path d="M12 3 2 8l10 5 10-5-10-5Z" /><path d="m2 13 10 5 10-5" /></>,
  students: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.8 2.8 2.6 3 5.2" /></>,
  icp: <><rect x="5" y="3.5" width="14" height="18" rx="2" /><path d="M9 3.5h6v3H9z" /><path d="m9 13.5 2 2 4-4.5" /></>,
  reports: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 17v-3M12 17v-6M16 17v-2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  flag: <><path d="M4 22V4M4 4h12l-2 4 2 4H4" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  bolt: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  back: <path d="m15 6-6 6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  download: <path d="M12 4v11m-5-5 5 5 5-5M4 20h16" />,
  upload: <path d="M12 20V9m-5 5 5-5 5 5M4 4h16" />,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12 5 5 9-10" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m14 6 4 4" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10h14V9M10 13h4" /></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" /></>,
  skip: <path d="m5 5 9 7-9 7V5ZM19 5v14" />,
  wifiOff: <><path d="m2 2 20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.3-1.6M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 5" /><path d="M12 20h.01" /></>,
  shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v.01M14 21h3M20 17v4M17 20h.01" /></>,
  devices: <><rect x="2" y="4" width="14" height="10" rx="1.5" /><path d="M5 18h8" /><rect x="16" y="8" width="6" height="12" rx="1.5" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>
};

export function Icon({ name, class: cls }: { name: keyof typeof P | string; class?: string }) {
  return (
    <svg class={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {P[name] ?? null}
    </svg>
  );
}

/* ---------- Building blocks ---------- */

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-head">
          <h2>{title}</h2>
          <button class="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ComponentChildren; hint?: string }) {
  return (
    <label class="field">
      <span>{label}</span>
      {children}
      {hint && <div class="tiny muted" style="margin-top:4px">{hint}</div>}
    </label>
  );
}

export function Switch({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label class="switch">
      <span><span style="font-weight:600">{label}</span>{hint && <div class="tiny muted">{hint}</div>}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
    </label>
  );
}

export function Empty({ icon, children }: { icon: string; children: ComponentChildren }) {
  return <div class="empty"><Icon name={icon} /><div>{children}</div></div>;
}

export function initials(s: Pick<Student, 'firstName' | 'lastName' | 'preferredName'>) {
  return ((s.preferredName || s.firstName)[0] + (s.lastName[0] ?? '')).toUpperCase();
}

export function displayName(s: Pick<Student, 'firstName' | 'lastName' | 'preferredName'>) {
  return `${s.preferredName || s.firstName} ${s.lastName}`.trim();
}

export function Avatar({ s }: { s: Student }) {
  return <span class={`avatar ${s.flag ? 'flagged' : ''}`}>{initials(s)}</span>;
}

export function PageHead({ eyebrow, title, children, back }: { eyebrow?: string; title: string; children?: ComponentChildren; back?: string }) {
  return (
    <div style="margin-bottom:14px">
      {back && <a class="btn ghost small no-print" href={back} style="margin:-6px 0 6px -10px"><Icon name="back" /> Back</a>}
      {eyebrow && <span class="eyebrow">{eyebrow}</span>}
      <div class="row between" style="align-items:flex-start">
        <h1 class="grow">{title}</h1>
        {children}
      </div>
      <div class="rule" />
    </div>
  );
}

/* ---------- Toast ---------- */
let pushToast: (msg: string) => void = () => {};
export function toast(msg: string) {
  pushToast(msg);
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    pushToast = (m) => {
      setMsg(m);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 2600);
    };
  }, []);
  return msg ? <div class="toast" role="status">{msg}</div> : null;
}

export const levelClass = (l: number | null | undefined) => (l === 0 ? 'l0' : l === 1 ? 'l1' : l === 2 ? 'l2' : 'ln');
export const levelBadge = (l: number | null | undefined) => (l === 0 ? 'blue' : l === 1 ? 'some' : l === 2 ? 'sig' : '');
