// Local-date helpers. Dates are stored as local 'YYYY-MM-DD' strings so a
// check-in belongs to the teacher's school day regardless of time zone quirks.

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ---------- Test clock (developer tool) ----------
 * Shifts the app's idea of "today" forward so multi-day behaviour (rotation,
 * follow-ups, overdue, ICP due dates) can be tried without waiting. Stored per device.
 */
const OFFSET_KEY = 'pulse-day-offset';
let offsetDays = (() => {
  try { return Number(localStorage.getItem(OFFSET_KEY)) || 0; } catch { return 0; }
})();
export const DAY_CHANGE_EVENT = 'pulse:day-change';

export function dayOffset(): number {
  return offsetDays;
}

export function setDayOffset(n: number) {
  offsetDays = Math.max(0, Math.round(n));
  try {
    if (offsetDays) localStorage.setItem(OFFSET_KEY, String(offsetDays));
    else localStorage.removeItem(OFFSET_KEY);
  } catch { /* storage unavailable: offset lasts for this session */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DAY_CHANGE_EVENT));
}

export function today(): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return toISODate(d);
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** 1 = Monday … 7 = Sunday. */
export function weekday(s: string): number {
  const d = parseISODate(s).getDay();
  return d === 0 ? 7 : d;
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** DD/MM/YYYY (Australian). */
export function formatDate(s: string): string {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/** e.g. "Wed 15 Oct". */
export function formatShort(s: string): string {
  return parseISODate(s).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function relativeDay(s: string, ref: string = today()): string {
  const n = daysBetween(s, ref);
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n > 1 && n < 14) return `${n} days ago`;
  if (n >= 14 && n < 60) return `${Math.round(n / 7)} weeks ago`;
  return formatDate(s);
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function nowMinutes(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Normalises "9:05", "0905", "9.05am", "1:30 pm" to HH:MM. Returns null if invalid. */
export function normaliseTime(raw: string): string | null {
  const s = String(raw).trim().toLowerCase().replace('.', ':');
  const m = s.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}
