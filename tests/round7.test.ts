import { describe, expect, it } from 'vitest';
import type { IssueTag, Relationship, RoomLayout } from '../src/types';
import { evaluatePlan, makePlan, scoreLine, seatOfStudent, swapWarnings, type PlannerInput, type PlannerStudent } from '../src/logic/seating';
import { geometry, needSeats, roomTemplate, seatsOf } from '../src/logic/rooms';
import {
  answerWatch, leftOutStudents, leftOutSuggestions, newSupport, newWatch, pairSuggestions, plannerRelationships, supportFor, watchRaise, watchReview
} from '../src/logic/seatingData';
import { printableHtml, projectorGrid, shortNames } from '../src/logic/seatingPrint';

const NAMES = ['Ali Khan', 'Sam Reid', 'Priya Das', 'Mia Ford', 'Leo Park', 'Ava Lund', 'Noah Tran', 'Isla Webb', 'Kai Moss', 'Zoe Hart', 'Eli Cole', 'Ruby Shaw',
  'Finn Yates', 'Lucy Bell', 'Omar Aziz', 'Ella Ross', 'Jack Dunn', 'Maya Ortiz', 'Theo Lam', 'Ivy Nash', 'Max Hill', 'Ada Penn', 'Leon Voss', 'Nina Pratt',
  'Owen Fox', 'Lara Quinn', 'Hugo Grey', 'Tara Wynn', 'Ezra Holt', 'Iris Vale', 'Jude Marsh', 'Cleo Stone'];

const kid = (i: number, extra: Partial<PlannerStudent> = {}): PlannerStudent => ({ id: `s${i}`, name: NAMES[i], needs: [], tags: [], attention: 0, concern: 0, ...extra });
const input = (n: number, extra: Partial<PlannerInput> = {}, room: RoomLayout = roomTemplate('fours', n)): PlannerInput => ({
  room, students: Array.from({ length: n }, (_, i) => kid(i)), relationships: [], noAloneTags: [],
  options: { useSupport: false, supportTable: false, minimiseChanges: true }, seed: 1, ...extra
});
const tableOf = (inp: PlannerInput, seats: Record<string, string>, sid: string) => inp.room.cells[Number(seatOfStudent(seats)[sid])].t;

describe('Round 7: seating planner hard rules', () => {
  it('always meets a "front" need when there are enough front seats', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const inp = input(24, { seed });
      inp.students[3].needs = ['front']; inp.students[10].needs = ['front']; inp.students[17].needs = ['front'];
      const plan = makePlan(inp);
      const front = needSeats(geometry(inp.room)).front;
      const seats = seatsOf(inp.room);
      for (const id of ['s3', 's10', 's17']) expect(front[seats.findIndex((s) => s.id === seatOfStudent(plan.seats)[id])]).toBe(true);
      expect(plan.problems).toEqual([]);
    }
  });

  it('never puts a "never together" pair at the same table or next to each other', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const inp = input(28, { seed, relationships: [{ a: 's0', b: 's1', type: 'keepApart', strength: 2 }, { a: 's2', b: 's3', type: 'keepApart', strength: 2 }, { a: 's0', b: 's4', type: 'keepApart', strength: 2 }] });
      const plan = makePlan(inp);
      const g = geometry(inp.room);
      const at = (id: string) => g.seats.findIndex((s) => s.id === seatOfStudent(plan.seats)[id]);
      for (const [a, b] of [['s0', 's1'], ['s2', 's3'], ['s0', 's4']]) {
        expect(g.seats[at(a)].table).not.toBe(g.seats[at(b)].table);
        expect(g.neighbours[at(a)].has(at(b))).toBe(false);
      }
    }
  });

  it('keeps locked seats where they are', () => {
    const inp = input(20);
    const seats = seatsOf(inp.room);
    inp.locked = { [seats[10].id]: 's5', [seats[0].id]: 's12' };
    inp.students[5].needs = ['front']; // would pull them forward if they weren't locked
    const plan = makePlan(inp);
    expect(plan.seats[seats[10].id]).toBe('s5');
    expect(plan.seats[seats[0].id]).toBe('s12');
    expect(plan.reasons.s5).toContain('Locked seat');
  });

  it('explains an impossible setup (6 "front" students, 4 front seats), naming the rule', () => {
    // Rows of singles, 4 desks in the front row.
    const room: RoomLayout = { rows: 4, cols: 4, cells: [
      { k: 'board' }, { k: 'board' }, { k: 'board' }, { k: 'board' },
      { k: 'desk', t: 1 }, { k: 'desk', t: 2 }, { k: 'desk', t: 3 }, { k: 'desk', t: 4 },
      { k: 'desk', t: 5 }, { k: 'desk', t: 6 }, { k: 'desk', t: 7 }, { k: 'desk', t: 8 },
      { k: 'desk', t: 9 }, { k: 'desk', t: 10 }, { k: 'desk', t: 11 }, { k: 'desk', t: 12 }
    ] };
    const inp = input(10, {}, room);
    for (let i = 0; i < 6; i++) inp.students[i].needs = ['front'];
    const plan = makePlan(inp);
    expect(plan.problems[0]).toMatch(/6 students need "front" but the room has only 4 seats/);
    expect(plan.problems[0]).toMatch(/Seating need rule/);
    expect(scoreLine(plan)).toMatch(/rules? not met/);
  });
});

describe('Round 7: seating planner goals', () => {
  it('puts works-well pairs together more often than chance (seeded runs)', () => {
    let together = 0, total = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const inp = input(24, { seed, relationships: [{ a: 's0', b: 's9', type: 'worksWell', strength: 1 }, { a: 's4', b: 's15', type: 'worksWell', strength: 1 }, { a: 's7', b: 's20', type: 'worksWell', strength: 1 }] });
      const plan = makePlan(inp);
      for (const [a, b] of [['s0', 's9'], ['s4', 's15'], ['s7', 's20']]) { total++; if (tableOf(inp, plan.seats, a) === tableOf(inp, plan.seats, b)) together++; }
    }
    // By chance about 3 in 23 would share a table of 4.
    expect(together / total).toBeGreaterThan(0.8);
  });

  it('support levels: ignored when off or expired; mixed tables give each table a confident student; the support table is nearest the teacher', () => {
    const today = '2026-11-02';
    expect(supportFor({ support: newSupport('more', today) }, false, today)).toBeUndefined();
    expect(supportFor({ support: { level: 'more', setAt: '2026-08-01', reviewBy: '2026-10-10' } }, true, today)).toBeUndefined();
    expect(supportFor({ support: newSupport('extension', today) }, true, today)).toBe('extension');
    expect(newSupport('more', today).reviewBy).toBe('2027-01-11');

    // 16 students at 4 tables of 4; 4 confident students.
    const mixed = input(16, { options: { useSupport: true, supportTable: false, minimiseChanges: false } });
    mixed.students.forEach((s, i) => { s.support = i < 4 ? 'on_track' : 'more'; });
    const plan = makePlan(mixed);
    const tables = new Map<number, string[]>();
    for (const [seat, sid] of Object.entries(plan.seats)) { const t = mixed.room.cells[Number(seat)].t!; tables.set(t, [...(tables.get(t) ?? []), sid]); }
    for (const ids of tables.values()) if (ids.length > 1) expect(ids.some((id) => ['s0', 's1', 's2', 's3'].includes(id))).toBe(true);

    const support = input(16, { options: { useSupport: true, supportTable: true, minimiseChanges: false } });
    support.students.forEach((s, i) => { s.support = i < 3 ? 'more' : 'on_track'; });
    const p2 = makePlan(support);
    const g = geometry(support.room);
    const nearest = [...new Set(g.seats.map((s) => s.table))].sort((a, b) =>
      Math.min(...g.seats.map((s, i) => (s.table === a ? g.teacher[i] : 99))) - Math.min(...g.seats.map((s, i) => (s.table === b ? g.teacher[i] : 99))))[0];
    for (const id of ['s0', 's1', 's2']) expect(tableOf(support, p2.seats, id)).toBe(nearest);
    // Off: levels are ignored entirely.
    const off = input(16);
    off.students.forEach((s) => { s.support = undefined; });
    expect(makePlan(off).goals.some((x) => x.kind === 'mixed' || x.kind === 'supportTable')).toBe(false);
  });

  it('nobody sits alone when it can be avoided; when it can\'t, the warning names the student', () => {
    const inp = input(16, { relationships: [{ a: 's0', b: 's1', type: 'worksWell', strength: 1 }, { a: 's2', b: 's3', type: 'worksWell', strength: 1 }] });
    expect(makePlan(inp).warnings).toEqual([]);
    // Mia's only works-well partner must be kept apart from Mia ("never together"): unavoidable.
    const hard = input(16, { relationships: [{ a: 's3', b: 's4', type: 'worksWell', strength: 1 }, { a: 's3', b: 's4', type: 'keepApart', strength: 2 }] });
    const plan = makePlan(hard);
    expect(plan.problems).toEqual([]);
    expect(plan.warnings.map((w) => w.text).join(' ')).toMatch(/Mia Ford has no one they work well with at Table \d/);
  });

  it('balance tags: nobody is the only member of a "don\'t leave alone" tag at a table when it can be avoided', () => {
    const inp = input(16, { noAloneTags: [{ id: 'eal', name: 'EAL' }] });
    for (const i of [0, 5, 9, 13]) inp.students[i].tags = ['eal'];
    const plan = makePlan(inp);
    const per = new Map<number, number>();
    for (const id of ['s0', 's5', 's9', 's13']) { const t = tableOf(inp, plan.seats, id)!; per.set(t, (per.get(t) ?? 0) + 1); }
    for (const n of per.values()) expect(n).toBeGreaterThan(1);
    expect(plan.warnings).toEqual([]);
  });

  it('minimise changes: re-planning with one new student moves only a few others', () => {
    const first = input(23, { relationships: [{ a: 's0', b: 's1', type: 'worksWell', strength: 1 }] });
    const plan = makePlan(first);
    const again = input(24, { previous: seatOfStudent(plan.seats), seed: 9, relationships: first.relationships }, first.room);
    const next = makePlan(again);
    expect(next.unseated).toEqual([]);
    expect(next.moves).toBeLessThanOrEqual(3);
  });

  it('warns when a swap breaks a rule', () => {
    const inp = input(16, { relationships: [{ a: 's0', b: 's1', type: 'keepApart', strength: 2 }] });
    const plan = makePlan(inp);
    const g = geometry(inp.room);
    const s0 = seatOfStudent(plan.seats).s0;
    const p0 = g.seats.findIndex((s) => s.id === s0);
    const neighbourSeat = g.seats[[...g.neighbours[p0]][0]].id;
    const w = swapWarnings(inp, plan.seats, neighbourSeat, seatOfStudent(plan.seats).s1);
    expect(w.join(' ')).toMatch(/Ali and Sam are (now )?(neighbours|at the same table), keep apart/);
  });

  it('plans 32 students in under a second', () => {
    const inp = input(32, {
      relationships: [
        { a: 's0', b: 's1', type: 'keepApart', strength: 2 }, { a: 's2', b: 's3', type: 'keepApart', strength: 1 }, { a: 's4', b: 's5', type: 'worksWell', strength: 1 },
        { a: 's6', b: 's7', type: 'worksWell', strength: 1 }, { a: 's8', b: 's9', type: 'keepApart', strength: 2 }, { a: 's10', b: 's11', type: 'worksWell', strength: 1 }
      ], noAloneTags: [{ id: 'a', name: 'Group A' }], options: { useSupport: true, supportTable: false, minimiseChanges: true }
    }, roomTemplate('pairs', 32));
    inp.students.forEach((s, i) => { s.concern = i % 5; s.attention = i % 7 === 0 ? 3 : 0; s.tags = i % 4 === 0 ? ['a'] : []; s.support = i % 3 === 0 ? 'on_track' : 'more'; if (i % 9 === 0) s.needs = ['front']; });
    const t = performance.now();
    const plan = makePlan(inp);
    expect(performance.now() - t).toBeLessThan(1000);
    expect(Object.keys(plan.seats)).toHaveLength(32);
    // Scoring an edited plan is quick too.
    expect(evaluatePlan(inp, plan.seats).problems).toEqual([]);
  });
});

const rel = (over: Partial<Relationship>): Relationship => ({
  id: Math.random().toString(36), classId: 'c', studentA: 's0', studentB: 's1', type: 'keepApart', strength: 1, source: 'checkin', confirmed: false,
  date: '2026-10-28', createdAt: 1, updatedAt: 1, ...over
});

describe('Round 7: suggestions, left out and the seat watch', () => {
  const today = '2026-11-02';
  it('suggests a keep-apart after 2 signals (not 1), and "Never suggest" sticks', () => {
    expect(pairSuggestions([rel({})], today)).toEqual([]);
    const two = [rel({}), rel({ studentA: 's1', studentB: 's0', date: '2026-10-20' })];
    expect(pairSuggestions(two, today)).toMatchObject([{ type: 'keepApart', count: 2 }]);
    // Unconfirmed signals aren't used by the planner.
    expect(plannerRelationships(two)).toEqual([]);
    expect(plannerRelationships([...two.slice(0, 1), rel({ useAnyway: true })])).toHaveLength(1);
    const never = [...two, rel({ source: 'suggested', muted: 'never' }), rel({ date: '2026-11-01' })];
    expect(pairSuggestions(never, today)).toEqual([]);
    expect(pairSuggestions([...two, rel({ source: 'suggested', muted: '2026-11-10' })], today)).toEqual([]);
    expect(pairSuggestions([...two, rel({ source: 'suggested', muted: '2026-11-01' })], today)).toHaveLength(1);
    // Signals older than 6 weeks don't count.
    expect(pairSuggestions([rel({ date: '2026-09-01' }), rel({})], today)).toEqual([]);
    // Works-well signals work the same way.
    expect(pairSuggestions([rel({ type: 'worksWell' }), rel({ type: 'worksWell' })], today)).toMatchObject([{ type: 'worksWell' }]);
  });

  it('friendship issues never create a keep-apart; they suggest a works-well instead', () => {
    const tags: IssueTag[] = [{ id: 'x', checkinId: 'c1', studentId: 's3', classId: 'c', date: '2026-10-30', areaId: 'wellbeing', tagId: 'friendship', source: 'observed', createdAt: 1 }];
    const left = leftOutStudents(tags, today);
    expect([...left]).toEqual(['s3']);
    expect(leftOutSuggestions(left, [], today)).toEqual(['s3']);
    expect(leftOutSuggestions(left, [rel({ studentA: 's3', studentB: 's9', type: 'worksWell', confirmed: true })], today)).toEqual([]);
    expect(pairSuggestions([], today)).toEqual([]);
    // In the planner a left-out student must be with a works-well partner (it never separates anyone).
    const inp = input(16, { relationships: [{ a: 's3', b: 's9', type: 'worksWell', strength: 1 }] });
    inp.students[3].leftOut = true;
    const plan = makePlan(inp);
    expect(tableOf(inp, plan.seats, 's3')).toBe(tableOf(inp, plan.seats, 's9'));
  });

  it('seat watch: "Not settled" creates a Review seat item, two in a row raise it, two Settled end it', () => {
    let w = newWatch('p1', 'Table 3', 'alone', today);
    w = answerWatch(w, false, today, 'l1');
    expect(watchReview(w)).toBe(true);
    expect(watchRaise(w)).toBe(false);
    w = answerWatch(w, false, '2026-11-03', 'l2');
    expect(watchRaise(w)).toBe(true);
    w = answerWatch(w, true, '2026-11-04', 'l3');
    expect(watchReview(w)).toBe(false);
    expect(w.ended).toBe(false);
    w = answerWatch(w, true, '2026-11-05', 'l4');
    expect(w.ended).toBe(true);
  });
});

describe('Round 7: projector view and print are names only', () => {
  it('contains names, never reasons, needs, levels or tags', () => {
    const inp = input(12, { relationships: [{ a: 's0', b: 's1', type: 'worksWell', strength: 1 }], noAloneTags: [{ id: 'eal', name: 'EAL' }], options: { useSupport: true, supportTable: false, minimiseChanges: false } });
    inp.students[0].needs = ['front']; inp.students[2].support = 'more'; inp.students[3].tags = ['eal']; inp.students[4].tags = ['eal'];
    const plan = makePlan(inp);
    const students = inp.students.map((s) => ({ id: s.id, firstName: s.name.split(' ')[0], lastName: s.name.split(' ')[1] }));
    const names = shortNames(students);
    const seats = Object.fromEntries(Object.entries(plan.seats).map(([k, v]) => [k, { studentId: v }]));
    const html = printableHtml({ room: inp.room, seats }, names, '8B Humanities', '3 November 2026');
    const grid = JSON.stringify(projectorGrid({ room: inp.room, seats }, names));
    for (const out of [html, grid]) {
      expect(out).toContain('Ali');
      expect(out).not.toMatch(/Front|seating need|work well|keep apart|support|extension|on track|EAL|eal|Locked|ICP/i);
    }
    expect(html).toContain('8B Humanities');
    expect(html).toContain('3 November 2026');
  });

  it('turns the room so the board is at the top', () => {
    const room: RoomLayout = { rows: 2, cols: 3, cells: [{ k: 'desk', t: 1 }, { k: 'desk', t: 1 }, { k: 'board' }, { k: 'desk', t: 2 }, { k: 'desk', t: 2 }, { k: 'board' }] };
    const g = projectorGrid({ room, seats: { 0: { studentId: 'a' } } }, new Map([['a', 'Ali']]));
    expect(g.cells.slice(0, g.cols).every((c) => c.kind === 'board')).toBe(true);
    expect(g.cells.some((c) => c.name === 'Ali')).toBe(true);
  });
});
