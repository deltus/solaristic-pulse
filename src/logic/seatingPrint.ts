// What students can see: the projector view and the printable plan. Names only: never reasons,
// needs, support levels, balance tags or anything colour-coded.

import type { RoomCellKind, SeatingPlan, Student } from '../types';
import { boardAtTop } from './rooms';

export interface ProjectorCell { kind: RoomCellKind; name?: string; table?: number }

/** "Mia N." (or "Mia" when no one else shares the first name). */
export function shortNames(students: Pick<Student, 'id' | 'firstName' | 'lastName' | 'preferredName'>[]): Map<string, string> {
  const first = (s: Pick<Student, 'firstName' | 'preferredName'>) => s.preferredName || s.firstName;
  const count = new Map<string, number>();
  for (const s of students) count.set(first(s), (count.get(first(s)) ?? 0) + 1);
  return new Map(students.map((s) => [s.id, (count.get(first(s)) ?? 0) > 1 && s.lastName ? `${first(s)} ${s.lastName[0]}.` : first(s)]));
}

/** The plan as a grid with the board at the top, for the projector and print. */
export function projectorGrid(plan: Pick<SeatingPlan, 'room' | 'seats'>, names: Map<string, string>) {
  const { room, map } = boardAtTop(plan.room);
  const cells: ProjectorCell[] = room.cells.map((x) => ({ kind: x.k, ...(x.k === 'desk' && x.t ? { table: x.t } : {}) }));
  for (const [seat, v] of Object.entries(plan.seats)) {
    const to = map[Number(seat)];
    if (to !== undefined && cells[to]) cells[to].name = names.get(v.studentId) ?? '';
  }
  return { rows: room.rows, cols: room.cols, cells };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A printable page: class, date and names in their seats. */
export function printableHtml(plan: Pick<SeatingPlan, 'room' | 'seats'>, names: Map<string, string>, className: string, dateText: string): string {
  const g = projectorGrid(plan, names);
  const rows: string[] = [];
  for (let r = 0; r < g.rows; r++) {
    const tds: string[] = [];
    for (let c = 0; c < g.cols; c++) {
      const x = g.cells[r * g.cols + c];
      const text = x.kind === 'desk' ? esc(x.name ?? '') : x.kind === 'board' ? 'Board' : x.kind === 'door' ? 'Door' : x.kind === 'teacher' ? 'Teacher' : '';
      tds.push(`<td class="${x.kind}">${text}</td>`);
    }
    rows.push(`<tr>${tds.join('')}</tr>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(className)} seating plan</title>
<style>body{font:14px system-ui,sans-serif;margin:16px;color:#111}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 12px;color:#555}
table{border-collapse:separate;border-spacing:4px;width:100%;table-layout:fixed}td{height:44px;text-align:center;font-weight:600;font-size:13px}
td.desk{border:1.5px solid #333;border-radius:6px}td.board{background:#ddd;font-weight:400}td.door,td.teacher{border:1px dashed #999;font-weight:400;color:#555}
@media print{body{margin:8mm}}</style></head><body>
<h1>${esc(className)} · seating plan</h1><p>${esc(dateText)}</p><table>${rows.join('')}</table></body></html>`;
}
