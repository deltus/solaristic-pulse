// Reads an iCalendar (.ics) file, e.g. exported from Microsoft Outlook, and turns
// teaching events into weekly lessons. One-off events are only kept if they repeat
// at the same weekday and time (Outlook often exports each lesson separately).

const pad = (n: number) => String(n).padStart(2, '0');
const DAY: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };

export interface IcsSlot { day: number; start: string; end: string; room?: string }
export interface IcsCandidate {
  summary: string;
  slots: IcsSlot[];
  /** True when the event repeats (RRULE) or occurs at the same weekday/time 2+ times. */
  recurring: boolean;
}

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function unescape(v: string) {
  return v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

/** Parses DTSTART/DTEND values. UTC ("Z") times are converted to local time; TZID times are taken as wall-clock time. */
function parseWhen(value: string): Date | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  if (!m[4]) return null; // all-day event
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
  return m[7] ? new Date(Date.UTC(y, mo - 1, d, h, mi, s)) : new Date(y, mo - 1, d, h, mi, s);
}

const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const isoDay = (d: Date) => (d.getDay() === 0 ? 7 : d.getDay());

export function parseIcs(text: string): IcsCandidate[] {
  const lines = unfold(text);
  const events: { summary: string; start: Date; end: Date; days: number[]; recurring: boolean; room?: string }[] = [];
  let cur: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur?.SUMMARY && cur.DTSTART && cur.DTEND && cur.STATUS !== 'CANCELLED') {
        const start = parseWhen(cur.DTSTART), end = parseWhen(cur.DTEND);
        if (start && end && end > start) {
          const byday = /FREQ=WEEKLY/.test(cur.RRULE ?? '') ? (cur.RRULE.match(/BYDAY=([A-Z,]+)/)?.[1] ?? '').split(',').map((d) => DAY[d.slice(-2)]).filter(Boolean) : [];
          events.push({ summary: unescape(cur.SUMMARY), start, end, days: byday.length ? byday : [isoDay(start)], recurring: !!cur.RRULE, room: cur.LOCATION ? unescape(cur.LOCATION) || undefined : undefined });
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).split(';')[0].toUpperCase();
    if (!(key in cur)) cur[key] = line.slice(i + 1);
  }

  const bySummary = new Map<string, { slots: Map<string, IcsSlot & { count: number }>; recurring: boolean }>();
  for (const e of events) {
    const g = bySummary.get(e.summary) ?? { slots: new Map(), recurring: false };
    g.recurring ||= e.recurring;
    for (const day of e.days) {
      const slot = { day, start: hhmm(e.start), end: hhmm(e.end), room: e.room };
      const k = `${day}|${slot.start}|${slot.end}`;
      const prev = g.slots.get(k);
      g.slots.set(k, { ...slot, room: slot.room ?? prev?.room, count: (prev?.count ?? 0) + (e.recurring ? 2 : 1) });
    }
    bySummary.set(e.summary, g);
  }
  return [...bySummary.entries()]
    .map(([summary, g]) => {
      const repeated = [...g.slots.values()].filter((s) => s.count >= 2);
      const slots = (repeated.length ? repeated : [...g.slots.values()])
        .map(({ count: _c, ...s }) => s)
        .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
      return { summary, slots, recurring: g.recurring || repeated.length > 0 };
    })
    .sort((a, b) => Number(b.recurring) - Number(a.recurring) || a.summary.localeCompare(b.summary));
}
