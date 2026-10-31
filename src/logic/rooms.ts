// Classroom layouts: templates, seat geometry (how far each desk is from the board, door,
// teacher and windows) and turning a room so the board is at the top (projector view).

import type { RoomCell, RoomCellKind, RoomLayout } from '../types';
import type { RoomTemplateId } from '../config/seating';

export interface Seat {
  id: string;
  index: number;
  r: number;
  c: number;
  table: number;
}

const cell = (k: RoomCellKind, t?: number): RoomCell => (t === undefined ? { k } : { k, t });

/**
 * A room template for about `students` students. Row 0 is the board, row 1 has the teacher's desk,
 * the left column has windows and the door is on the right wall at the back.
 */
export function roomTemplate(id: RoomTemplateId, students = 28): RoomLayout {
  const n = Math.max(2, students);
  if (id === 'ushape') return uShape(n);
  const block = { pairs: [2, 1], threes: [3, 1], singles: [1, 1], fours: [2, 2], sixes: [3, 2] }[id] as [number, number];
  const perRow = { pairs: 4, threes: 3, singles: 6, fours: 3, sixes: 3 }[id] as number;
  const rowGap = id === 'fours' || id === 'sixes' ? 1 : 0;
  const size = block[0] * block[1];
  const blocks = Math.ceil(n / size);
  const blockRows = Math.ceil(blocks / perRow);
  const inner = perRow * block[0] + (perRow - 1);
  const cols = inner + 2;
  const rows = 2 + blockRows * block[1] + (blockRows - 1) * rowGap + 1;
  const cells: RoomCell[] = Array.from({ length: rows * cols }, () => cell('empty'));
  const set = (r: number, c: number, x: RoomCell) => { cells[r * cols + c] = x; };
  let table = 0;
  for (let br = 0; br < blockRows; br++) {
    for (let bc = 0; bc < perRow; bc++) {
      if (table >= blocks) break;
      table++;
      const r0 = 2 + br * (block[1] + rowGap), c0 = 1 + bc * (block[0] + 1);
      for (let dr = 0; dr < block[1]; dr++) for (let dc = 0; dc < block[0]; dc++) set(r0 + dr, c0 + dc, cell('desk', table));
    }
  }
  decorate(cells, rows, cols);
  return { rows, cols, cells };
}

/** Desks in a U facing the board, joined into pairs. */
function uShape(n: number): RoomLayout {
  const cols = 10;
  const side = Math.max(2, Math.ceil((n - (cols - 4)) / 2));
  const rows = 2 + side + 1;
  const cells: RoomCell[] = Array.from({ length: rows * cols }, () => cell('empty'));
  const path: [number, number][] = [];
  for (let r = 2; r < 2 + side; r++) path.push([r, 1]);
  for (let c = 2; c < cols - 2; c++) path.push([1 + side, c]);
  for (let r = 1 + side; r >= 2; r--) path.push([r, cols - 2]);
  // Remove the duplicate corners, then pair up desks along the U.
  const seen = new Set<string>();
  const desks = path.filter(([r, c]) => { const k = `${r},${c}`; if (seen.has(k)) return false; seen.add(k); return true; });
  desks.forEach(([r, c], i) => { cells[r * cols + c] = cell('desk', Math.floor(i / 2) + 1); });
  decorate(cells, rows, cols);
  return { rows, cols, cells };
}

function decorate(cells: RoomCell[], rows: number, cols: number) {
  const mid = Math.floor(cols / 2);
  for (let c = Math.max(1, mid - 2); c <= Math.min(cols - 2, mid + 2); c++) cells[c] = cell('board');
  cells[cols + cols - 2] = cell('teacher');
  for (let r = 2; r < rows - 1; r += 2) if (cells[r * cols].k === 'empty') cells[r * cols] = cell('window');
  cells[(rows - 1) * cols + cols - 1] = cell('door');
}

export const seatsOf = (room: RoomLayout): Seat[] =>
  room.cells.flatMap((x, i) => (x.k === 'desk' ? [{ id: String(i), index: i, r: Math.floor(i / room.cols), c: i % room.cols, table: x.t ?? -(i + 1) }] : []));

/** Number of tables and seats, for the summary. */
export function roomSummary(room: RoomLayout) {
  const seats = seatsOf(room);
  return { seats: seats.length, tables: new Set(seats.map((s) => s.table)).size };
}

const cheb = (a: { r: number; c: number }, b: { r: number; c: number }) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
const positions = (room: RoomLayout, k: RoomCellKind) =>
  room.cells.flatMap((x, i) => (x.k === k ? [{ r: Math.floor(i / room.cols), c: i % room.cols }] : []));

export interface SeatGeometry {
  seats: Seat[];
  /** Distance (in cells) from the board, the teacher's desk (or the board if there's none), the door and the nearest window. */
  board: number[];
  teacher: number[];
  door: (number | null)[];
  window: (number | null)[];
  /** Seats next to each other (including diagonally). */
  neighbours: Set<number>[];
  /** Seat has no desk of its own table to the left (left end of a pair) / to one side (aisle). */
  leftEnd: boolean[];
  aisle: boolean[];
  has: { board: boolean; teacher: boolean; door: boolean; window: boolean };
}

/** Distance to the board along the way the room faces (rows from a top/bottom board, columns from a side board). */
function boardDistance(room: RoomLayout, p: { r: number; c: number }, board: { r: number; c: number }[]) {
  if (!board.length) return p.r;
  const sameRow = board.every((b) => b.r === board[0].r), sameCol = board.every((b) => b.c === board[0].c);
  if (sameRow && board.length > 1) return Math.abs(p.r - board[0].r);
  if (sameCol && board.length > 1) return Math.abs(p.c - board[0].c);
  return Math.min(...board.map((b) => cheb(p, b)));
}

export function geometry(room: RoomLayout): SeatGeometry {
  const seats = seatsOf(room);
  const board = positions(room, 'board'), teacher = positions(room, 'teacher'), door = positions(room, 'door'), win = positions(room, 'window');
  const near = (p: Seat, list: { r: number; c: number }[]) => (list.length ? Math.min(...list.map((x) => cheb(p, x))) : null);
  const at = (r: number, c: number) => (r < 0 || c < 0 || r >= room.rows || c >= room.cols ? null : room.cells[r * room.cols + c]);
  const bd = seats.map((s) => boardDistance(room, s, board));
  return {
    seats,
    board: bd,
    teacher: seats.map((s, i) => near(s, teacher) ?? bd[i]),
    door: seats.map((s) => near(s, door)),
    window: seats.map((s) => near(s, win)),
    neighbours: seats.map((s) => new Set(seats.map((o, j) => (o !== s && cheb(o, s) === 1 ? j : -1)).filter((j) => j >= 0))),
    leftEnd: seats.map((s) => { const l = at(s.r, s.c - 1); return !(l?.k === 'desk' && (l.t ?? -1) === s.table); }),
    aisle: seats.map((s) => { const l = at(s.r, s.c - 1), r = at(s.r, s.c + 1); return l?.k !== 'desk' || r?.k !== 'desk'; }),
    has: { board: board.length > 0, teacher: teacher.length > 0, door: door.length > 0, window: win.length > 0 }
  };
}

/** Which seats meet each seating need (by seat position in `geometry().seats`). Unknown needs have no seat rule. */
export function needSeats(g: SeatGeometry): Record<string, boolean[]> {
  const levels = [...new Set(g.board)].sort((a, b) => a - b);
  const minTeacher = Math.min(...g.teacher);
  // "Front": the tables in the row nearest the board (a whole group of 4 counts, not just its front half).
  const frontTables = new Set(g.seats.filter((_, i) => g.board[i] === levels[0]).map((s) => s.table));
  return {
    front: g.seats.map((s) => frontTables.has(s.table)),
    near_board: g.board.map((d) => d <= (levels[0] ?? 0)),
    near_teacher: g.teacher.map((d) => d <= minTeacher + 2),
    near_door: g.door.map((d) => (d === null ? true : d <= 2)),
    aisle: g.aisle,
    away_windows: g.window.map((d) => d === null || d >= 2),
    quiet: g.door.map((d) => d === null || d >= 3),
    left_handed: g.leftEnd
  };
}

/** The room turned so the board is at the top, and where each old cell went. */
export function boardAtTop(room: RoomLayout): { room: RoomLayout; map: number[] } {
  const board = positions(room, 'board');
  let turns = 0;
  if (board.length) {
    const r = board.reduce((a, b) => a + b.r, 0) / board.length, c = board.reduce((a, b) => a + b.c, 0) / board.length;
    const d = { top: r, bottom: room.rows - 1 - r, left: c, right: room.cols - 1 - c };
    const side = (Object.keys(d) as (keyof typeof d)[]).reduce((a, b) => (d[b] < d[a] ? b : a));
    turns = { top: 0, right: 3, bottom: 2, left: 1 }[side];
  }
  let cur = room, map = room.cells.map((_, i) => i);
  for (let t = 0; t < turns; t++) {
    // Rotate 90° clockwise: (r, c) → (c, rows - 1 - r).
    const rows = cur.cols, cols = cur.rows;
    const cells = new Array<RoomCell>(rows * cols);
    const moved = new Array<number>(cur.cells.length);
    cur.cells.forEach((x, i) => { const r = Math.floor(i / cur.cols), c = i % cur.cols; const j = c * cols + (cur.rows - 1 - r); cells[j] = x; moved[i] = j; });
    map = map.map((i) => moved[i]);
    cur = { rows, cols, cells };
  }
  return { room: cur, map };
}

/** "Table 3" for a seat (tables are numbered from the front). */
export const tableName = (room: RoomLayout, seatId: string) => {
  const t = room.cells[Number(seatId)]?.t;
  return t && t > 0 ? `Table ${t}` : `Seat ${Number(seatId) + 1}`;
};

/** Renumber tables from the front of the room (nearest the board first, then left to right). */
export function renumberTables(room: RoomLayout): RoomLayout {
  const g = geometry(room);
  const firstSeat = new Map<number, number>();
  g.seats.forEach((s, i) => { if (s.table > 0 && !firstSeat.has(s.table)) firstSeat.set(s.table, i); });
  const order = [...firstSeat.keys()].sort((a, b) => {
    const sa = g.seats.filter((s) => s.table === a), sb = g.seats.filter((s) => s.table === b);
    const da = Math.min(...sa.map((s) => g.board[g.seats.indexOf(s)])), db = Math.min(...sb.map((s) => g.board[g.seats.indexOf(s)]));
    return da - db || Math.min(...sa.map((s) => s.c)) - Math.min(...sb.map((s) => s.c));
  });
  const to = new Map(order.map((t, i) => [t, i + 1]));
  return { ...room, cells: room.cells.map((x) => (x.k === 'desk' && x.t && to.has(x.t) ? { k: 'desk', t: to.get(x.t) } : x)) };
}

/* ---------------- Quick wall setup ---------------- */

export type Wall = 'top' | 'bottom' | 'left' | 'right';

/** The wall nearest a tapped cell. */
export function wallOf(room: Pick<RoomLayout, 'rows' | 'cols'>, index: number): Wall {
  const r = Math.floor(index / room.cols), c = index % room.cols;
  const d: Record<Wall, number> = { top: r, bottom: room.rows - 1 - r, left: c, right: room.cols - 1 - c };
  return (Object.keys(d) as Wall[]).reduce((a, b) => (d[b] < d[a] ? b : a));
}

/** Cells along a wall (corners left out), and the row or column one step into the room. */
function wallCells(room: RoomLayout, wall: Wall, inset = 0): number[] {
  const { rows, cols } = room;
  if (wall === 'top' || wall === 'bottom') { const r = wall === 'top' ? inset : rows - 1 - inset; return Array.from({ length: cols - 2 }, (_, i) => r * cols + i + 1); }
  const c = wall === 'left' ? inset : cols - 1 - inset;
  return Array.from({ length: rows - 2 }, (_, i) => (i + 1) * cols + c);
}

const clear = (room: RoomLayout, k: RoomCellKind) => room.cells.map((x) => (x.k === k ? cell('empty') : x));

/** Board on the middle of a wall, with the teacher's desk just inside it. Desks never move. */
export function placeBoard(room: RoomLayout, wall: Wall): RoomLayout {
  const cells = clear({ ...room, cells: clear(room, 'board') }, 'teacher');
  const line = wallCells(room, wall);
  const mid = Math.floor(line.length / 2);
  line.forEach((i, j) => { if (Math.abs(j - mid) <= 2 && cells[i].k !== 'desk') cells[i] = cell('board'); });
  // Teacher: one step in from the board, near its far end; the nearest free cell along that line.
  const inner = wallCells(room, wall, 1);
  const want = Math.min(inner.length - 1, mid + 3);
  const free = inner.map((i, j) => ({ i, d: Math.abs(j - want) })).filter((x) => cells[x.i].k === 'empty').sort((a, b) => a.d - b.d)[0];
  if (free) cells[free.i] = cell('teacher');
  return { ...room, cells };
}

/** Door on the wall cell nearest the tap (or the nearest free cell on that wall). */
export function placeDoor(room: RoomLayout, index: number): RoomLayout {
  const cells = clear(room, 'door');
  const wall = wallOf(room, index);
  const r = Math.floor(index / room.cols), c = index % room.cols;
  const line = wallCells(room, wall);
  const pos = (i: number) => ({ r: Math.floor(i / room.cols), c: i % room.cols });
  const free = line.filter((i) => cells[i].k === 'empty' || cells[i].k === 'window')
    .sort((a, b) => cheb(pos(a), { r, c }) - cheb(pos(b), { r, c }))[0];
  if (free !== undefined) cells[free] = cell('door');
  return { ...room, cells };
}

/** Windows (every other cell) on each chosen wall, in free cells only. */
export function placeWindows(room: RoomLayout, walls: Wall[]): RoomLayout {
  const cells = clear(room, 'window');
  for (const w of walls) wallCells(room, w).forEach((i, j) => { if (j % 2 === 0 && cells[i].k === 'empty') cells[i] = cell('window'); });
  return { ...room, cells };
}

/** Walls that have windows on them. */
export const windowWalls = (room: RoomLayout): Wall[] =>
  [...new Set(room.cells.flatMap((x, i) => (x.k === 'window' ? [wallOf(room, i)] : [])))];

/** A new desk joins the table of a desk right next to it in the same row (desks touching in a line are one table). */
export function deskTableAt(room: RoomLayout, index: number): number {
  const c = index % room.cols;
  for (const j of [c > 0 ? index - 1 : -1, c < room.cols - 1 ? index + 1 : -1]) {
    const x = j >= 0 ? room.cells[j] : undefined;
    if (x?.k === 'desk' && x.t) return x.t;
  }
  return Math.max(0, ...room.cells.map((x) => x.t ?? 0)) + 1;
}

/* ---------------- Switching a class to a different room ---------------- */

type PlanSeats = Record<string, { studentId: string; locked?: boolean }>;

/**
 * What stays when a class moves to a different room: locked students keep the desk at the same spot
 * (or another free desk at the same table), and students whose whole table is still there, at the same
 * spots, stay put. Everyone else is re-planned. `keep` is the seats to hold while planning.
 */
export function refitSeats(oldRoom: RoomLayout, seats: PlanSeats, newRoom: RoomLayout): { keep: PlanSeats; replan: string[] } {
  const rc = (room: RoomLayout, seat: string) => ({ r: Math.floor(Number(seat) / room.cols), c: Number(seat) % room.cols });
  const at = (r: number, c: number) => (r < newRoom.rows && c < newRoom.cols ? r * newRoom.cols + c : -1);
  const newDesk = (r: number, c: number) => { const i = at(r, c); return i >= 0 && newRoom.cells[i].k === 'desk' ? i : -1; };
  // A table survives when all its desks are desks of one table in the new room, and that table has no extra desks.
  const survives = new Map<number, boolean>();
  for (const s of seatsOf(oldRoom)) {
    if (survives.has(s.table)) continue;
    const mine = seatsOf(oldRoom).filter((o) => o.table === s.table).map((o) => newDesk(o.r, o.c));
    const t = mine[0] >= 0 ? newRoom.cells[mine[0]].t : undefined;
    const size = newRoom.cells.filter((x) => x.k === 'desk' && x.t === t).length;
    survives.set(s.table, mine.every((i) => i >= 0 && newRoom.cells[i].t === t) && t !== undefined && size === mine.length);
  }
  const keep: PlanSeats = {};
  const taken = new Set<number>();
  const replan: string[] = [];
  const entries = Object.entries(seats).sort(([, a], [, b]) => Number(!!b.locked) - Number(!!a.locked));
  for (const [seat, v] of entries) {
    const { r, c } = rc(oldRoom, seat);
    const oldTable = oldRoom.cells[Number(seat)]?.t ?? -1;
    let to = newDesk(r, c);
    if (to >= 0 && taken.has(to)) to = -1;
    if (v.locked && to < 0) {
      // Another free desk at the same table, if the table is still there.
      const same = seatsOf(oldRoom).filter((o) => o.table === oldTable).map((o) => newDesk(o.r, o.c)).filter((i) => i >= 0 && !taken.has(i));
      to = same[0] ?? -1;
    }
    if (to >= 0 && (v.locked || survives.get(oldTable))) { keep[String(to)] = v; taken.add(to); }
    else replan.push(v.studentId);
  }
  return { keep, replan };
}

/** Students now at a different spot (row and column) than in the old plan. */
export function movedCount(oldRoom: RoomLayout, oldSeats: PlanSeats, newRoom: RoomLayout, newSeats: PlanSeats): number {
  const spot = (room: RoomLayout, seats: PlanSeats) => new Map(Object.entries(seats).map(([k, v]) => [v.studentId, `${Math.floor(Number(k) / room.cols)},${Number(k) % room.cols}`]));
  const before = spot(oldRoom, oldSeats), after = spot(newRoom, newSeats);
  return [...before].filter(([id, p]) => after.get(id) !== p).length;
}

/** Names of classes whose active plan uses a saved room (it can't be deleted while any do). */
export const roomUsers = (roomId: string, plans: { roomId?: string; active: boolean; classId: string }[], classes: { id: string; name: string }[]) =>
  [...new Set(plans.filter((p) => p.active && p.roomId === roomId).map((p) => classes.find((c) => c.id === p.classId)?.name ?? 'another class'))].sort();

/** Same desks, tables and walls. */
export const sameLayout = (a: RoomLayout, b: RoomLayout) =>
  a.rows === b.rows && a.cols === b.cols && a.cells.every((x, i) => x.k === b.cells[i]?.k && (x.t ?? 0) === (b.cells[i]?.t ?? 0));
