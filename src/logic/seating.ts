// Seating plan assistant: pure functions, no database.
//
// makePlan() fills the room hardest-to-place students first, then improves the plan with random
// swaps (simulated annealing, seeded so tests repeat). Hard rules are never broken when they can
// be met: seating needs, keep apart "never together" and locked seats. Soft goals are weighted
// (src/config/seating.ts PLANNER). The teacher always has the final say: the plan is a suggestion.

import type { RelationshipType, RoomLayout } from '../types';
import { PLANNER, needShort } from '../config/seating';
import { geometry, needSeats, tableName, type SeatGeometry } from './rooms';

export interface PlannerStudent {
  id: string;
  name: string;
  /** Seating need ids; those that came from an ICP adjustment are also in icpNeeds. */
  needs: string[];
  icpNeeds?: string[];
  /** Only when support levels are switched on and the level hasn't expired. */
  support?: 'more' | 'on_track' | 'extension';
  /** Balance tag ids. */
  tags: string[];
  /** Recent Attention concerns (off task, not listening) and how to say it, e.g. "off task 4× recently". */
  attention: number;
  attentionText?: string;
  /** The ranking's recent concern score (spread across tables). */
  concern: number;
  /** Wellbeing → friendship issues recently: make sure they're with someone they work well with. */
  leftOut?: boolean;
}

export interface PlannerRelationship { a: string; b: string; type: RelationshipType; strength: 1 | 2 }

export interface PlannerInput {
  room: RoomLayout;
  students: PlannerStudent[];
  relationships: PlannerRelationship[];
  /** Balance tags with "Don't leave anyone alone from this tag" on. */
  noAloneTags: { id: string; name: string }[];
  /** Seat id → student id for locked seats. */
  locked?: Record<string, string>;
  /** Student id → seat id in the current plan (same room), for Minimise changes. */
  previous?: Record<string, string>;
  options: { useSupport: boolean; supportTable: boolean; minimiseChanges: boolean };
  seed?: number;
  iterations?: number;
}

export interface Goal { kind: 'keepApart' | 'worksWell' | 'alone' | 'tagAlone' | 'attention' | 'mixed' | 'supportTable'; text: string; met: boolean; studentIds: string[] }
export interface Warning { studentId: string; text: string }

export interface PlanReport {
  /** Seat id → student id. */
  seats: Record<string, string>;
  /** Hard rules that couldn't all be met, naming the rule and why. Empty = all rules met. */
  problems: string[];
  goals: Goal[];
  /** "Nobody sits alone" broken: listed first, in amber. */
  warnings: Warning[];
  /** 1–2 short teacher-only reasons per student. */
  reasons: Record<string, string[]>;
  moves: number;
  unseated: string[];
}

/** Seeded random numbers (mulberry32). */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Everything the scorer needs, worked out once per plan. */
interface Model {
  g: SeatGeometry;
  ok: Record<string, boolean[]>;
  st: PlannerStudent[];
  idx: Map<string, number>;
  apart: [number, number, 1 | 2][];
  well: [number, number][];
  partners: number[][];
  aloneCheck: boolean[];
  tagMembers: { id: string; name: string; members: number[] }[];
  lockedSeat: number[];
  prevSeat: number[];
  tableSize: Map<number, number>;
  supportTableId: number | null;
  confident: number;
  input: PlannerInput;
}

function model(input: PlannerInput): Model {
  const g = geometry(input.room);
  const ok = needSeats(g);
  const st = input.students;
  const idx = new Map(st.map((s, i) => [s.id, i]));
  const seatPos = new Map(g.seats.map((s, i) => [s.id, i]));
  const rels = input.relationships.filter((r) => idx.has(r.a) && idx.has(r.b) && r.a !== r.b);
  const apart = rels.filter((r) => r.type === 'keepApart').map((r) => [idx.get(r.a)!, idx.get(r.b)!, r.strength] as [number, number, 1 | 2]);
  const well = rels.filter((r) => r.type === 'worksWell').map((r) => [idx.get(r.a)!, idx.get(r.b)!] as [number, number]);
  const partners = st.map(() => [] as number[]);
  for (const [a, b] of well) { partners[a].push(b); partners[b].push(a); }
  const tableSize = new Map<number, number>();
  for (const s of g.seats) tableSize.set(s.table, (tableSize.get(s.table) ?? 0) + 1);
  // The support table is the table (of 2 or more) nearest the teacher.
  let supportTableId: number | null = null, best = Infinity;
  if (input.options.useSupport && input.options.supportTable) {
    for (const [t, n] of tableSize) {
      if (n < 2) continue;
      const d = Math.min(...g.seats.map((s, i) => (s.table === t ? g.teacher[i] : Infinity)));
      if (d < best) { best = d; supportTableId = t; }
    }
  }
  const lockedSeat = st.map(() => -1);
  for (const [seat, sid] of Object.entries(input.locked ?? {})) if (idx.has(sid) && seatPos.has(seat)) lockedSeat[idx.get(sid)!] = seatPos.get(seat)!;
  const prevSeat = st.map((s) => (input.options.minimiseChanges && input.previous?.[s.id] !== undefined && seatPos.has(input.previous[s.id]) ? seatPos.get(input.previous[s.id])! : -1));
  return {
    g, ok, st, idx, apart, well, partners,
    aloneCheck: st.map((s, i) => partners[i].length > 0 || !!s.leftOut),
    tagMembers: input.noAloneTags.map((t) => ({ ...t, members: st.flatMap((s, i) => (s.tags.includes(t.id) ? [i] : [])) })).filter((t) => t.members.length > 1),
    lockedSeat, prevSeat, tableSize, supportTableId,
    confident: input.options.useSupport ? st.filter((s) => s.support === 'on_track' || s.support === 'extension').length : 0,
    input
  };
}

const needRule = (m: Model, need: string) => m.ok[need];

/** Same table (or next to each other when the "table" is a single desk). */
const together = (m: Model, a: number, b: number) => {
  const sa = m.g.seats[a], sb = m.g.seats[b];
  return sa.table === sb.table || ((m.tableSize.get(sa.table) ?? 1) === 1 && m.g.neighbours[a].has(b));
};

/** Total cost of an assignment: pos[student] = seat position or -1. Lower is better. */
function cost(m: Model, pos: number[]): number {
  const W = PLANNER;
  let c = 0;
  m.st.forEach((s, i) => {
    const p = pos[i];
    if (p < 0) return;
    for (const n of s.needs) { const r = needRule(m, n); if (r && !r[p]) c += W.hard; }
    if (s.attention) c += W.attention * s.attention * m.g.teacher[p];
    if (m.prevSeat[i] >= 0 && m.prevSeat[i] !== p) c += W.move;
    if (m.supportTableId !== null && s.support === 'more' && m.g.seats[p].table !== m.supportTableId) c += W.supportTable;
    if (m.aloneCheck[i] && m.partners[i].length && !m.partners[i].some((j) => pos[j] >= 0 && together(m, p, pos[j]))) c += W.alone;
  });
  for (const [a, b, strength] of m.apart) {
    const pa = pos[a], pb = pos[b];
    if (pa < 0 || pb < 0) continue;
    const same = m.g.seats[pa].table === m.g.seats[pb].table;
    if (strength === 2 && (same || m.g.neighbours[pa].has(pb))) c += W.hard;
    else if (same) c += W.keepApart;
  }
  for (const [a, b] of m.well) {
    const pa = pos[a], pb = pos[b];
    if (pa >= 0 && pb >= 0 && !together(m, pa, pb) && !m.g.neighbours[pa].has(pb)) c += W.worksWell;
  }
  // Tables: spread the load, mixed tables, nobody alone from a tag.
  const load = new Map<number, number>(), count = new Map<number, number>(), conf = new Map<number, number>();
  m.st.forEach((s, i) => {
    const p = pos[i];
    if (p < 0) return;
    const t = m.g.seats[p].table;
    load.set(t, (load.get(t) ?? 0) + s.concern);
    count.set(t, (count.get(t) ?? 0) + 1);
    if (s.support === 'on_track' || s.support === 'extension') conf.set(t, (conf.get(t) ?? 0) + 1);
  });
  for (const v of load.values()) c += W.spread * v * v;
  if (m.input.options.useSupport && !m.input.options.supportTable && m.confident) {
    for (const [t, n] of count) if (n > 1 && !conf.get(t)) c += W.mixed;
  }
  for (const tag of m.tagMembers) {
    const per = new Map<number, number>();
    for (const i of tag.members) if (pos[i] >= 0) { const t = m.g.seats[pos[i]].table; per.set(t, (per.get(t) ?? 0) + 1); }
    for (const [t, n] of per) if (n === 1 && (m.tableSize.get(t) ?? 1) > 1) c += W.alone;
  }
  return c;
}

/** Make a plan. Same input and seed = same plan; "Shuffle" passes a new seed. */
export function makePlan(input: PlannerInput): PlanReport {
  const m = model(input);
  const rand = seeded(input.seed ?? 1);
  // A few independent searches from different starting points; the best one wins.
  let best: { pos: number[]; cost: number } | null = null;
  for (let r = 0; r < PLANNER.restarts; r++) {
    const run = search(m, rand, input.iterations ?? PLANNER.iterations);
    if (!best || run.cost < best.cost) best = run;
  }
  const seats: Record<string, string> = {};
  best!.pos.forEach((p, i) => { if (p >= 0) seats[m.g.seats[p].id] = m.st[i].id; });
  const report = evaluate(m, seats);
  return { ...report, problems: [...precheck(m), ...report.problems] };
}

/** One search: fill the room hardest-to-place first, then improve with random swaps (simulated annealing). */
function search(m: Model, rand: () => number, iters: number): { pos: number[]; cost: number } {
  const nSeats = m.g.seats.length;
  const pos = m.st.map(() => -1);
  const taken = new Array<number>(nSeats).fill(-1);
  const place = (i: number, p: number) => { pos[i] = p; taken[p] = i; };
  // Locked seats first, then (Minimise changes) everyone in their current seat.
  m.lockedSeat.forEach((p, i) => { if (p >= 0 && taken[p] < 0) place(i, p); });
  m.prevSeat.forEach((p, i) => { if (p >= 0 && pos[i] < 0 && taken[p] < 0) place(i, p); });
  // Hardest to place first: seating needs, "never together", left out, then the rest at random.
  const difficulty = (i: number) => {
    const s = m.st[i];
    const needSeatsFree = s.needs.map((n) => needRule(m, n)?.filter(Boolean).length ?? nSeats);
    return (needSeatsFree.length ? 100 - Math.min(...needSeatsFree) : 0) * 10 + m.apart.filter(([a, b, k]) => k === 2 && (a === i || b === i)).length * 5 + (s.leftOut ? 3 : 0) + m.partners[i].length + rand();
  };
  const order = m.st.map((_, i) => i).filter((i) => pos[i] < 0).sort((a, b) => difficulty(b) - difficulty(a));
  for (const i of order) {
    let bestP = -1, bestC = Infinity;
    for (let p = 0; p < nSeats; p++) {
      if (taken[p] >= 0) continue;
      pos[i] = p;
      const c = cost(m, pos) + rand() * 0.01;
      if (c < bestC) { bestC = c; bestP = p; }
    }
    pos[i] = -1;
    if (bestP >= 0) place(i, bestP);
  }

  // Improve with random swaps (a student with another student or an empty desk).
  const movable = (p: number) => taken[p] < 0 || m.lockedSeat[taken[p]] < 0;
  let cur = cost(m, pos);
  let best = cur, bestPos = [...pos];
  for (let k = 0; k < iters && nSeats > 1; k++) {
    const temp = PLANNER.startTemp * Math.pow(0.002, k / iters);
    const p1 = Math.floor(rand() * nSeats), p2 = Math.floor(rand() * nSeats);
    if (p1 === p2 || !movable(p1) || !movable(p2) || (taken[p1] < 0 && taken[p2] < 0)) continue;
    const a = taken[p1], b = taken[p2];
    if (a >= 0) pos[a] = p2;
    if (b >= 0) pos[b] = p1;
    const next = cost(m, pos);
    if (next <= cur || rand() < Math.exp((cur - next) / temp)) {
      taken[p1] = b; taken[p2] = a; cur = next;
      if (cur < best) { best = cur; bestPos = [...pos]; }
    } else {
      if (a >= 0) pos[a] = p1;
      if (b >= 0) pos[b] = p2;
    }
  }
  return { pos: bestPos, cost: best };
}


/** Rules that can't all be met whatever the plan (too few seats of a kind). */
function precheck(m: Model): string[] {
  const out: string[] = [];
  const nSeats = m.g.seats.length;
  if (m.st.length > nSeats) out.push(`${m.st.length} students but only ${nSeats} desks: add desks in Step 1.`);
  const counts = new Map<string, number>();
  for (const s of m.st) for (const n of s.needs) if (needRule(m, n)) counts.set(n, (counts.get(n) ?? 0) + 1);
  for (const [n, k] of counts) {
    const free = needRule(m, n).filter(Boolean).length;
    if (k > free) out.push(`${k} students need "${needShort(n).toLowerCase()}" but the room has only ${free} seat${free === 1 ? '' : 's'} that fit${free === 1 ? 's' : ''}. Seating need rule can't be met for everyone.`);
  }
  if (!m.g.has.door && counts.has('near_door')) out.push('Mark the door on the room so "near the door" can be checked.');
  return out;
}

/** Score an existing plan (after the teacher swaps or locks seats). */
export function evaluatePlan(input: PlannerInput, seats: Record<string, string>): PlanReport {
  return evaluate(model(input), seats);
}

function evaluate(m: Model, seats: Record<string, string>): PlanReport {
  const seatPos = new Map(m.g.seats.map((s, i) => [s.id, i]));
  const pos = m.st.map(() => -1);
  for (const [seat, sid] of Object.entries(seats)) if (m.idx.has(sid) && seatPos.has(seat)) pos[m.idx.get(sid)!] = seatPos.get(seat)!;
  const name = (i: number) => m.st[i].name;
  const first = (i: number) => m.st[i].name.split(' ')[0];
  const tbl = (p: number) => tableName(m.input.room, m.g.seats[p].id);
  const problems: string[] = [], goals: Goal[] = [], warnings: Warning[] = [];
  const reasons: Record<string, string[]> = {};
  const why = (i: number, r: string) => { (reasons[m.st[i].id] ??= []).push(r); };

  m.st.forEach((s, i) => {
    const p = pos[i];
    if (p < 0) return;
    if (m.lockedSeat[i] === p) why(i, 'Locked seat');
    for (const n of s.needs) {
      const r = needRule(m, n);
      if (!r) continue;
      if (!r[p]) problems.push(`${name(i)}: seating need "${needShort(n).toLowerCase()}" not met.`);
      else why(i, `${needShort(n)}: ${s.icpNeeds?.includes(n) ? 'ICP seating need' : 'seating need'}`);
    }
  });
  for (const [a, b, strength] of m.apart) {
    const pa = pos[a], pb = pos[b];
    if (pa < 0 || pb < 0) continue;
    const same = m.g.seats[pa].table === m.g.seats[pb].table, next = m.g.neighbours[pa].has(pb);
    if (strength === 2) {
      if (same || next) problems.push(`${first(a)} and ${first(b)} are ${same ? 'at the same table' : 'neighbours'}: keep apart (never together).`);
      else { why(a, `Away from ${first(b)} (keep apart)`); why(b, `Away from ${first(a)} (keep apart)`); }
    } else {
      goals.push({ kind: 'keepApart', text: `${first(a)} and ${first(b)} at different tables`, met: !same, studentIds: [m.st[a].id, m.st[b].id] });
      if (!same) { why(a, `Away from ${first(b)} (keep apart)`); why(b, `Away from ${first(a)} (keep apart)`); }
    }
  }
  for (const [a, b] of m.well) {
    const pa = pos[a], pb = pos[b];
    if (pa < 0 || pb < 0) continue;
    const met = together(m, pa, pb) || m.g.neighbours[pa].has(pb);
    goals.push({ kind: 'worksWell', text: `${first(a)} with ${first(b)}`, met, studentIds: [m.st[a].id, m.st[b].id] });
    if (met) { why(a, `With ${first(b)} (work well together)`); why(b, `With ${first(a)} (work well together)`); }
  }
  m.st.forEach((s, i) => {
    const p = pos[i];
    if (p < 0 || !m.aloneCheck[i]) return;
    const met = m.partners[i].some((j) => pos[j] >= 0 && together(m, p, pos[j]));
    goals.push({ kind: 'alone', text: `${first(i)} with someone they work well with`, met, studentIds: [s.id] });
    if (!met) {
      warnings.push({
        studentId: s.id,
        text: m.partners[i].length
          ? `${name(i)} has no one they work well with at ${tbl(p)}.${s.leftOut ? ' Flagged as left out recently.' : ''}`
          : `${name(i)} was flagged as left out, and no one is marked as working well with them yet.`
      });
    }
  });
  for (const tag of m.tagMembers) {
    const per = new Map<number, number[]>();
    for (const i of tag.members) if (pos[i] >= 0) { const t = m.g.seats[pos[i]].table; per.set(t, [...(per.get(t) ?? []), i]); }
    for (const i of tag.members) {
      if (pos[i] < 0 || (m.tableSize.get(m.g.seats[pos[i]].table) ?? 1) < 2) continue;
      const alone = per.get(m.g.seats[pos[i]].table)!.length === 1;
      goals.push({ kind: 'tagAlone', text: `${first(i)} not the only one from ${tag.name}`, met: !alone, studentIds: [m.st[i].id] });
      if (alone) warnings.push({ studentId: m.st[i].id, text: `${name(i)} is the only one from ${tag.name} at ${tbl(pos[i])}.` });
    }
  }
  const nearTeacher = needSeats(m.g).near_teacher;
  m.st.forEach((s, i) => {
    const p = pos[i];
    if (p < 0 || s.attention < 2) return;
    const met = nearTeacher[p];
    goals.push({ kind: 'attention', text: `${first(i)} near the teacher (${s.attentionText ?? 'recent attention concerns'})`, met, studentIds: [s.id] });
    if (met) why(i, `Near teacher: ${s.attentionText ?? 'recent attention concerns'}`);
  });
  if (m.input.options.useSupport) {
    if (m.supportTableId !== null) {
      m.st.forEach((s, i) => {
        if (pos[i] < 0 || s.support !== 'more') return;
        const met = m.g.seats[pos[i]].table === m.supportTableId;
        goals.push({ kind: 'supportTable', text: `${first(i)} at the support table`, met, studentIds: [s.id] });
        if (met) why(i, 'Support table near teacher');
      });
    } else if (m.confident) {
      const tables = new Map<number, number[]>();
      m.st.forEach((_, i) => { if (pos[i] >= 0) { const t = m.g.seats[pos[i]].table; tables.set(t, [...(tables.get(t) ?? []), i]); } });
      const multi = [...tables].filter(([, xs]) => xs.length > 1);
      const withConf = multi.filter(([, xs]) => xs.some((i) => m.st[i].support === 'on_track' || m.st[i].support === 'extension'));
      const possible = Math.min(multi.length, m.confident);
      goals.push({ kind: 'mixed', text: `A confident student at every table (${withConf.length} of ${multi.length})`, met: withConf.length >= possible, studentIds: [] });
    }
  }
  let moves = 0;
  m.st.forEach((_, i) => { if (m.prevSeat[i] >= 0 && pos[i] !== m.prevSeat[i]) moves++; });
  for (const id of Object.keys(reasons)) reasons[id] = [...new Set(reasons[id])].slice(0, 2);
  return { seats, problems, goals, warnings, reasons, moves, unseated: m.st.filter((_, i) => pos[i] < 0).map((s) => s.id) };
}

/** Warnings for a swap the teacher made: rules and "alone" goals it newly breaks. */
export function swapWarnings(input: PlannerInput, seats: Record<string, string>, seatA: string, seatB: string): string[] {
  const before = evaluatePlan(input, seats);
  const next = { ...seats };
  const a = seats[seatA], b = seats[seatB];
  delete next[seatA]; delete next[seatB];
  if (a) next[seatB] = a;
  if (b) next[seatA] = b;
  const after = evaluatePlan(input, next);
  const was = new Set([...before.problems, ...before.warnings.map((w) => w.text), ...before.goals.filter((g) => !g.met).map((g) => g.text)]);
  const out = after.problems.filter((p) => !was.has(p)).map((p) => p.replace(/: keep apart \(never together\)\./, ', keep apart'));
  for (const g of after.goals) if (!g.met && g.kind === 'keepApart' && !was.has(g.text)) out.push(`${g.text.replace(' at different tables', '')} are now at the same table, keep apart`);
  for (const w of after.warnings) if (!was.has(w.text)) out.push(w.text);
  return out;
}

/** "All rules met · 9 of 11 goals met" */
export function scoreLine(r: Pick<PlanReport, 'problems' | 'goals'>): string {
  const met = r.goals.filter((g) => g.met).length;
  return `${r.problems.length ? `${r.problems.length} rule${r.problems.length === 1 ? '' : 's'} not met` : 'All rules met'} · ${met} of ${r.goals.length} goals met`;
}

/** Student id → seat id, from a plan's seats. */
export const seatOfStudent = (seats: Record<string, { studentId: string } | string>) =>
  Object.fromEntries(Object.entries(seats).map(([seat, v]) => [typeof v === 'string' ? v : v.studentId, seat]));
