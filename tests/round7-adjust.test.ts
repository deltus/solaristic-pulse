import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PulseDB, useDatabase, db } from '../src/db';
import * as svc from '../src/services';
import type { RoomLayout } from '../src/types';
import { makePlan, seatOfStudent, type PlannerInput } from '../src/logic/seating';
import {
  boardAtTop, deskTableAt, movedCount, placeBoard, placeDoor, placeWindows, refitSeats, roomTemplate, roomUsers, seatsOf, wallOf, windowWalls
} from '../src/logic/rooms';
import { projectorGrid, printableHtml, shortNames } from '../src/logic/seatingPrint';
import { ROOM_TEMPLATES } from '../src/config/seating';

const kids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `Student ${i}`, needs: [], tags: [], attention: 0, concern: 0 }));
const input = (room: RoomLayout, n: number, extra: Partial<PlannerInput> = {}): PlannerInput => ({
  room, students: kids(n), relationships: [], noAloneTags: [], options: { useSupport: false, supportTable: false, minimiseChanges: true }, seed: 1, ...extra
});
const desks = (room: RoomLayout) => room.cells.map((c, i) => (c.k === 'desk' ? `${i}:${c.t}` : '')).filter(Boolean).join(',');
const tableSizes = (room: RoomLayout) => { const m = new Map<number, number>(); for (const s of seatsOf(room)) m.set(s.table, (m.get(s.table) ?? 0) + 1); return [...m.values()]; };

describe('Round 7 adjustments: templates', () => {
  it('offers the templates in the agreed order, with Rows of 3', () => {
    expect(ROOM_TEMPLATES.map((t) => t.label)).toEqual(['Groups of 4', 'Rows of pairs', 'Rows of 3', 'Groups of 6', 'U-shape', 'Rows of singles']);
  });

  for (const n of [24, 27]) {
    it(`Rows of 3 seats a class of ${n} at tables of 3, with nobody alone`, () => {
      const room = roomTemplate('threes', n);
      expect(tableSizes(room).every((s) => s === 3)).toBe(true);
      expect(seatsOf(room).length).toBe(Math.ceil(n / 3) * 3);
      // Three tables to a row, with a walkway between tables.
      const plan = makePlan(input(room, n));
      expect(Object.keys(plan.seats).length).toBe(n);
      expect(plan.problems).toEqual([]);
      const bySeat = new Map(Object.entries(plan.seats));
      for (const size of new Set(seatsOf(room).map((s) => s.table))) {
        const at = seatsOf(room).filter((s) => s.table === size && bySeat.has(s.id)).length;
        expect(at === 0 || at >= 2).toBe(true);
      }
    });
  }

  it('6 tables of 4 sit as two rows facing each other, 3 above and 3 below', () => {
    const room = roomTemplate('fours', 24);
    const seats = seatsOf(room);
    expect(tableSizes(room)).toEqual([4, 4, 4, 4, 4, 4]);
    for (let t = 1; t <= 6; t++) {
      const mine = seats.filter((s) => s.table === t);
      expect(new Set(mine.map((s) => s.r)).size).toBe(2);
    }
    const tableRows = new Set(seats.map((s) => Math.min(...seats.filter((o) => o.table === s.table).map((o) => o.r))));
    expect(tableRows.size).toBe(2);
  });

  it('a new desk next to another in the row joins its table; a gap starts a new one', () => {
    const room = roomTemplate('pairs', 8);
    const [first] = seatsOf(room);
    const right = first.index + 2; // past the pair, in the walkway
    expect(deskTableAt(room, right)).toBe(first.table);
    const far = room.cols * (room.rows - 1) + 5; // back row, nothing beside it
    expect(deskTableAt(room, far)).toBeGreaterThan(Math.max(...seatsOf(room).map((s) => s.table)));
  });
});

describe('Round 7 adjustments: quick wall setup', () => {
  it('moves the board, door and windows without changing desks', () => {
    const room = roomTemplate('fours', 24);
    const before = desks(room);
    const rightWall = room.cols * 3 + room.cols - 1;
    expect(wallOf(room, rightWall)).toBe('right');
    const b = placeBoard(room, 'right');
    expect(desks(b)).toBe(before);
    expect(b.cells.filter((c) => c.k === 'board').length).toBeGreaterThan(0);
    expect(b.cells.every((c, i) => c.k !== 'board' || i % room.cols === room.cols - 1)).toBe(true);
    expect(b.cells.filter((c) => c.k === 'teacher').length).toBe(1);
    // The front is now the right wall: Present turns the room so the board is at the top.
    expect(boardAtTop(b).room.cells.slice(0, boardAtTop(b).room.cols).some((c) => c.k === 'board')).toBe(true);

    const d = placeDoor(b, room.cols * (room.rows - 1) + 2);
    expect(desks(d)).toBe(before);
    expect(d.cells.filter((c) => c.k === 'door').length).toBe(1);
    expect(wallOf(d, d.cells.findIndex((c) => c.k === 'door'))).toBe('bottom');

    const w = placeWindows(d, ['top', 'left']);
    expect(desks(w)).toBe(before);
    expect(windowWalls(w).sort()).toEqual(['left', 'top']);
    expect(windowWalls(placeWindows(w, ['top']))).toEqual(['top']);
    // Windows never cover the board or door.
    expect(w.cells.filter((c) => c.k === 'board').length).toBe(b.cells.filter((c) => c.k === 'board').length);
    expect(w.cells.filter((c) => c.k === 'door').length).toBe(1);
  });
});

describe('Round 7 adjustments: switching rooms', () => {
  it('keeps locked seats and unchanged tables, re-plans the rest and counts who moved', () => {
    const oldRoom = roomTemplate('fours', 16);
    const first = makePlan(input(oldRoom, 16));
    const seats = Object.fromEntries(Object.entries(first.seats).map(([k, v]) => [k, { studentId: v }]));
    const lockedSeat = seatsOf(oldRoom)[0].id; // a spot that is also a desk in the new room
    seats[lockedSeat] = { ...seats[lockedSeat], locked: true } as never;

    // Same desks, board moved: nobody moves.
    const walls = placeBoard(oldRoom, 'left');
    expect(refitSeats(oldRoom, seats, walls).replan).toEqual([]);

    // A different layout: only the locked student is held.
    const newRoom = roomTemplate('pairs', 16);
    const { keep, replan } = refitSeats(oldRoom, seats, newRoom);
    const lockedId = seats[lockedSeat].studentId;
    expect(Object.values(keep).some((v) => v.studentId === lockedId && v.locked)).toBe(true);
    const held = Object.fromEntries(Object.entries(keep).map(([k, v]) => [k, v.studentId]));
    const plan = makePlan(input(newRoom, 16, { locked: held }));
    for (const [k, sid] of Object.entries(held)) expect(plan.seats[k]).toBe(sid);
    expect(Object.keys(plan.seats).length).toBe(16);
    const next = Object.fromEntries(Object.entries(plan.seats).map(([k, v]) => [k, { studentId: v }]));
    const moved = movedCount(oldRoom, seats, newRoom, next);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(replan.length);
    expect(seatOfStudent(plan.seats)[lockedId]).toBeDefined();
  });

  it('keeps a whole table where it still exists', () => {
    const oldRoom = roomTemplate('fours', 8);
    const seats = Object.fromEntries(seatsOf(oldRoom).map((s, i) => [s.id, { studentId: `s${i}` }]));
    // Remove one desk from table 2: table 1 is untouched, table 2's students are re-planned.
    const t2 = seatsOf(oldRoom).find((s) => s.table === 2)!;
    const cells = oldRoom.cells.map((c, i) => (i === t2.index ? { k: 'empty' as const } : c));
    const { keep, replan } = refitSeats(oldRoom, seats, { ...oldRoom, cells });
    expect(replan.sort()).toEqual(seatsOf(oldRoom).map((s, i) => (s.table === 2 ? `s${i}` : '')).filter(Boolean).sort());
    expect(Object.keys(keep).length).toBe(4);
  });
});

let n = 0;
beforeEach(async () => {
  useDatabase(new PulseDB(`round7-adjust-${n++}`));
  await db.open();
});

describe('Round 7 adjustments: saved, named rooms', () => {
  it('one room can be used by two classes, and can\'t be deleted while a plan uses it', async () => {
    const room = await svc.saveRoom({ ...roomTemplate('pairs', 8), name: 'Science lab 3' });
    const a = await svc.createClass({ name: '7B Science' });
    const b = await svc.createClass({ name: '9C Science' });
    for (const c of [a, b]) await svc.saveSeatingPlan({ classId: c.id, room: { rows: room.rows, cols: room.cols, cells: room.cells }, roomId: room.id, seats: {} });
    expect((await svc.loadSeating(a.id))!.rooms.map((r) => r.name)).toEqual(['Science lab 3']);
    expect((await svc.loadSeating(b.id))!.rooms.map((r) => r.name)).toEqual(['Science lab 3']);

    const res = await svc.deleteRoom(room.id);
    expect(res).toEqual({ ok: false, usedBy: ['7B Science', '9C Science'] });
    expect(await db.rooms.get(room.id)).toBeDefined();

    // Once both classes are on other rooms, it can go.
    for (const c of [a, b]) await svc.saveSeatingPlan({ classId: c.id, room: roomTemplate('fours', 8), seats: {} });
    expect(await svc.deleteRoom(room.id)).toEqual({ ok: true });
    expect(await db.rooms.get(room.id)).toBeUndefined();
  });

  it('renames and duplicates rooms', async () => {
    const room = await svc.saveRoom({ ...roomTemplate('fours', 8), name: 'B12' });
    await svc.renameRoom(room.id, '  B14 ');
    expect((await db.rooms.get(room.id))!.name).toBe('B14');
    const copy = await svc.duplicateRoom(room.id);
    expect(copy!.name).toBe('B14 (copy)');
    expect(copy!.id).not.toBe(room.id);
    expect(copy!.cells).toEqual(room.cells);
  });

  it('roomUsers only counts active plans', () => {
    const classes = [{ id: 'a', name: '7B' }, { id: 'b', name: '8A' }];
    expect(roomUsers('r1', [{ roomId: 'r1', active: false, classId: 'a' }, { roomId: 'r1', active: true, classId: 'b' }], classes)).toEqual(['8A']);
  });
});

describe('Round 7 adjustments: Present is names only', () => {
  it('contains names and nothing about needs, levels, tags or reasons', () => {
    const room = roomTemplate('threes', 6);
    const students = [
      { id: 'a', firstName: 'Ali', lastName: 'Khan', seatingNeeds: ['front'], seatingNeedNote: 'Hearing aid', support: { level: 'more' as const, setAt: '2026-10-01', reviewBy: '2026-12-10' }, balanceTags: ['tag-eal'] },
      { id: 'b', firstName: 'Sam', lastName: 'Reid' }
    ];
    const seats = { [seatsOf(room)[0].id]: { studentId: 'a', locked: true }, [seatsOf(room)[1].id]: { studentId: 'b' } };
    const out = JSON.stringify(projectorGrid({ room, seats }, shortNames(students))) + printableHtml({ room, seats }, shortNames(students), '7B', '31 Oct');
    expect(out).toContain('Ali');
    expect(out).toContain('Sam');
    for (const bad of ['front', 'Front', 'Hearing', 'more', 'support', 'tag-eal', 'locked', 'Locked', 'reason', 'Khan']) expect(out).not.toContain(bad);
  });
});
