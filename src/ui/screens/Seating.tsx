// Seating plan assistant: Plan (Room → Check → Plan), Relationships and Students tabs, and the
// Present view (names only, for the board). The app suggests and explains; the teacher makes every change.

import { useMemo, useState } from 'preact/hooks';
import type { BalanceTag, Relationship, RoomCellKind, RoomLayout, SeatingPlan, Student } from '../../types';
import * as svc from '../../services';
import { newId } from '../../db';
import { ROOM_TEMPLATES, SEATING_NEEDS, SEATING_PURPOSE, SUPPORT_LEVELS, needLabel, needShort, supportLabel, type RoomTemplateId } from '../../config/seating';
import { makePlan, evaluatePlan, scoreLine, seatOfStudent, swapWarnings, type PlannerInput, type PlanReport } from '../../logic/seating';
import {
  deskTableAt, movedCount, placeBoard, placeDoor, placeWindows, refitSeats, renumberTables, roomSummary, roomTemplate, sameLayout, tableName, wallOf, windowWalls
} from '../../logic/rooms';
import {
  icpNeedSuggestions, leftOutStudents, leftOutSuggestions, pairKey, pairSuggestions, plannerRelationships, plannerStudents, relationshipList,
  supportNeedsReview, supportSuggestion, watchReview
} from '../../logic/seatingData';
import { projectorGrid, shortNames } from '../../logic/seatingPrint';
import { needByStudent } from '../../logic/need';
import { formatDate, today } from '../../lib/dates';
import { useLive, useSettings } from '../hooks';
import { displayName, Icon, Sheet, Switch, toast } from '../components';
import { PeoplePicker } from './Checkin';
import { Present, isPhone, openPresent } from '../Present';
import { useSyncStatus } from '../../sync/engine';

type Tab = 'plan' | 'relationships' | 'students' | 'present';

export function SeatingScreen({ classId, tab, focus }: { classId: string; tab?: string; focus?: string }) {
  const ctx = useLive(() => svc.loadSeating(classId), [classId]);
  const settings = useSettings();
  if (!ctx || !settings) return ctx === null ? <p class="muted">Class not found.</p> : null;
  // "projector" is the old link to Present.
  const t: Tab = tab === 'relationships' || tab === 'students' ? tab : tab === 'present' || tab === 'projector' ? 'present' : 'plan';
  if (t === 'present') return <SeatingPresent ctx={ctx} />;
  const suggestions = pairSuggestions(ctx.relationships, today()).length + leftOutSuggestions(leftOutStudents(ctx.tags, today()), ctx.relationships, today()).length;
  return (
    <div class="seating">
      <a class="link-btn back-btn" href={`#/classes/${classId}`}><Icon name="back" /> {ctx.cls.name}</a>
      <h1 style="margin:8px 0 10px">Seating plan</h1>
      <div class="chips class-tabs" role="tablist">
        {([['plan', 'Plan'], ['relationships', `Relationships${suggestions ? ` (${suggestions})` : ''}`], ['students', 'Students']] as const).map(([id, label]) => (
          <a key={id} role="tab" aria-selected={t === id} class={`chip ${t === id ? 'active' : ''}`} href={`#/class/${classId}/seating${id === 'plan' ? '' : `/${id}`}`}>{label}</a>
        ))}
      </div>
      {t === 'plan' && <PlanTab key={ctx.seatingPlan?.id ?? 'none'} ctx={ctx} useSupport={!!settings.seatingSupport} focus={focus} />}
      {t === 'relationships' && <RelationshipsTab ctx={ctx} />}
      {t === 'students' && <StudentsTab ctx={ctx} useSupport={!!settings.seatingSupport} />}
    </div>
  );
}

/* ---------------- Plan: Room → Check → Plan ---------------- */

type Seats = Record<string, { studentId: string; locked?: boolean }>;

function plannerInput(ctx: svc.SeatingContext, room: RoomLayout, useSupport: boolean, opts: { supportTable: boolean; minimise: boolean }, seats?: Seats, seed = 1): PlannerInput {
  const date = today();
  const need = needByStudent(ctx.students, ctx.checkins, ctx.observations, ctx.tags, ctx.homework, date, ctx.lessons, ctx.assessmentChecks);
  const concern = new Map([...need].map(([id, r]) => [id, r.concern]));
  const active = ctx.seatingPlan;
  const sameRoom = !!active && active.room.rows === room.rows && active.room.cols === room.cols && active.room.cells.every((c, i) => c.k === room.cells[i]?.k);
  return {
    room,
    students: plannerStudents({ students: ctx.students, tags: ctx.tags, adjustments: ctx.adjustments, concern, useSupport, today: date }),
    relationships: plannerRelationships(ctx.relationships),
    noAloneTags: (ctx.cls.balanceTags ?? []).filter((t) => t.noAlone).map((t) => ({ id: t.id, name: t.name })),
    locked: Object.fromEntries(Object.entries(seats ?? {}).filter(([, v]) => v.locked).map(([k, v]) => [k, v.studentId])),
    previous: sameRoom ? seatOfStudent(active!.seats) : undefined,
    options: { useSupport, supportTable: opts.supportTable, minimiseChanges: opts.minimise },
    seed
  };
}

function PlanTab({ ctx, useSupport, focus }: { ctx: svc.SeatingContext; useSupport: boolean; focus?: string }) {
  const active = ctx.seatingPlan;
  const [step, setStep] = useState<'room' | 'check' | 'plan'>(active ? 'plan' : 'room');
  const [room, setRoom] = useState<RoomLayout>(active?.room ?? roomTemplate('pairs', Math.max(ctx.students.length, 8)));
  const [roomId, setRoomId] = useState<string | undefined>(active?.roomId);
  const [seats, setSeats] = useState<Seats>(active?.seats ?? {});
  const [supportTable, setSupportTable] = useState(false);
  const [minimise, setMinimise] = useState(true);
  const [seed, setSeed] = useState(1);
  const [saved, setSaved] = useState(!!active);
  const input = useMemo(() => plannerInput(ctx, room, useSupport, { supportTable, minimise }, seats, seed), [ctx, room, useSupport, supportTable, minimise, seats, seed]);

  function make(nextSeed = seed) {
    const r = makePlan({ ...input, seed: nextSeed });
    const locked = new Set(Object.entries(seats).filter(([, v]) => v.locked).map(([k]) => k));
    setSeats(Object.fromEntries(Object.entries(r.seats).map(([k, sid]) => [k, { studentId: sid, ...(locked.has(k) ? { locked: true } : {}) }])));
    setSaved(false);
    setStep('plan');
  }

  /** "Use this room": with an active plan in a different room, re-fit it straight away; otherwise check, then plan. */
  function useRoom() {
    if (!active || sameLayout(active.room, room)) { setStep('check'); return; }
    const { keep } = refitSeats(active.room, active.seats, room);
    const held = Object.fromEntries(Object.entries(keep).map(([k, v]) => [k, v.studentId]));
    const r = makePlan({ ...plannerInput(ctx, room, useSupport, { supportTable, minimise }, undefined, seed), locked: held });
    const next: Seats = Object.fromEntries(Object.entries(r.seats).map(([k, sid]) => [k, { studentId: sid, ...(keep[k]?.locked && keep[k].studentId === sid ? { locked: true } : {}) }]));
    setSeats(next);
    setSaved(false);
    setStep('plan');
    const n = movedCount(active.room, active.seats, room, next);
    toast(n ? `${n} student${n === 1 ? '' : 's'} moved because the room changed` : 'Everyone kept their seat in the new room');
  }

  if (step === 'room') {
    return <RoomStep ctx={ctx} room={room} roomId={roomId} onUse={useRoom}
      onRoom={(r, id) => { setRoom(r); setRoomId(id); setSeats(active && sameLayout(active.room, r) ? active.seats : {}); }} />;
  }
  if (step === 'check') {
    const rels = plannerRelationships(ctx.relationships);
    const sugg = pairSuggestions(ctx.relationships, today()).length + leftOutSuggestions(leftOutStudents(ctx.tags, today()), ctx.relationships, today()).length;
    const needs = ctx.students.filter((s) => s.seatingNeeds?.length).length;
    const sum = roomSummary(room);
    return (
      <div class="card fade-up">
        <span class="eyebrow">Step 2 · Check</span>
        <p class="small" style="margin:6px 0 12px">
          {ctx.students.length} students · {needs} with seating needs · {rels.filter((r) => r.type === 'keepApart').length} keep-apart · {rels.filter((r) => r.type === 'worksWell').length} work-well
          {sugg > 0 && <> · <a href={`#/class/${ctx.cls.id}/seating/relationships`}>{sugg} suggestion{sugg === 1 ? '' : 's'} to review</a></>}
        </p>
        <p class="tiny muted">{sum.seats} desks at {sum.tables} tables.{sum.seats < ctx.students.length ? ' Not enough desks: add some in Step 1.' : ''}</p>
        {useSupport && (
          <div class="seg" role="radiogroup" aria-label="Tables">
            <button class={!supportTable ? 'on' : ''} aria-pressed={!supportTable} onClick={() => setSupportTable(false)}>Mixed tables</button>
            <button class={supportTable ? 'on' : ''} aria-pressed={supportTable} onClick={() => setSupportTable(true)}>Support table near teacher</button>
          </div>
        )}
        {active && <Switch label="Minimise changes" hint="Keep most students where they sit in the current plan." checked={minimise} onChange={setMinimise} />}
        <div class="grid2" style="margin-top:12px">
          <button class="btn" onClick={() => setStep('room')}><Icon name="back" /> Room</button>
          <button class="btn primary" onClick={() => make()}>Make a plan <Icon name="arrow" /></button>
        </div>
      </div>
    );
  }
  return (
    <PlanStep ctx={ctx} input={input} room={room} roomId={roomId} seats={seats} setSeats={(s) => { setSeats(s); setSaved(false); }} saved={saved} focus={focus}
      onShuffle={() => { const n = seed + 1; setSeed(n); make(n); }} onNew={() => setStep('room')} onSaved={() => setSaved(true)} />
  );
}

const PALETTE: [RoomCellKind, string][] = [['desk', 'Desk'], ['empty', 'Empty'], ['board', 'Board'], ['teacher', 'Teacher'], ['door', 'Door'], ['window', 'Window']];

/** A small drawing of a room for the picker tiles. */
function RoomThumb({ room }: { room: RoomLayout }) {
  return (
    <svg class="room-thumb" viewBox={`0 0 ${room.cols} ${room.rows}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      {room.cells.map((c, i) => {
        if (c.k === 'empty') return null;
        const x = i % room.cols, y = Math.floor(i / room.cols);
        return c.k === 'board' ? <rect key={i} class="th-board" x={x} y={y + 0.3} width={1.02} height={0.4} />
          : <rect key={i} class={`th-${c.k}`} x={x + 0.08} y={y + 0.08} width={0.84} height={0.84} rx={0.15} />;
      })}
    </svg>
  );
}

type WallStep = 'board' | 'door' | 'window';
const WALL_STEPS: [WallStep, string][] = [['board', 'Tap the wall with the board'], ['door', 'Tap where the door is'], ['window', 'Tap the wall(s) with windows']];

/**
 * Step 1: pick a template or one of your rooms (it's made straight away, sized to the class), then
 * "Use this room". "Tweak" opens the grid editor, with a quick wall setup at the top.
 */
function RoomStep({ ctx, room, roomId, onRoom, onUse }: { ctx: svc.SeatingContext; room: RoomLayout; roomId?: string; onRoom: (r: RoomLayout, id?: string) => void; onUse: () => void }) {
  const [mode, setMode] = useState<'pick' | 'picked' | 'edit'>('pick');
  const [label, setLabel] = useState('');
  const [tool, setTool] = useState<RoomCellKind | 'group'>('desk');
  const [group, setGroup] = useState<number[]>([]);
  const [wall, setWall] = useState<WallStep | null>('board');
  const size = Math.max(ctx.students.length, 8);
  const saved = ctx.rooms.find((r) => r.id === roomId);
  const nextTable = () => Math.max(0, ...room.cells.map((c) => c.t ?? 0)) + 1;
  const sum = roomSummary(room);

  function pick(r: RoomLayout, name: string, id?: string) { onRoom(r, id); setLabel(name); setMode('picked'); }
  function nextWall() { setWall(wall === 'board' ? 'door' : wall === 'door' ? 'window' : null); }
  function tap(i: number) {
    const c = room.cells[i];
    if (wall) {
      if (wall === 'board') { onRoom(placeBoard(room, wallOf(room, i)), roomId); nextWall(); }
      else if (wall === 'door') { onRoom(placeDoor(room, i), roomId); nextWall(); }
      else { const w = wallOf(room, i), on = windowWalls(room); onRoom(placeWindows(room, on.includes(w) ? on.filter((x) => x !== w) : [...on, w]), roomId); }
      return;
    }
    if (tool === 'group') {
      if (c.k === 'desk') setGroup(group.includes(i) ? group.filter((x) => x !== i) : [...group, i]);
      return;
    }
    const cells = [...room.cells];
    cells[i] = tool === 'desk' ? (c.k === 'desk' ? { k: 'empty' } : { k: 'desk', t: deskTableAt(room, i) }) : { k: c.k === tool ? 'empty' : tool };
    onRoom({ ...room, cells }, roomId);
  }
  function joinGroup() {
    const t = nextTable();
    onRoom(renumberTables({ ...room, cells: room.cells.map((c, i) => (group.includes(i) ? { k: 'desk', t } : c)) }), roomId);
    setGroup([]);
  }
  const resize = (dr: number, dc: number) => {
    const rows = Math.max(3, Math.min(14, room.rows + dr)), cols = Math.max(3, Math.min(14, room.cols + dc));
    const cells = Array.from({ length: rows * cols }, (_, i) => { const r = Math.floor(i / cols), c = i % cols; return r < room.rows && c < room.cols ? room.cells[r * room.cols + c] : { k: 'empty' as const }; });
    onRoom({ rows, cols, cells }, roomId);
  };
  async function saveAs() {
    const name = prompt('Name this room (e.g. B12, Science lab 3)', saved?.name ?? '');
    if (name === null) return;
    const r = await svc.saveRoom({ ...renumberTables(room), name, id: roomId });
    onRoom({ rows: r.rows, cols: r.cols, cells: r.cells }, r.id);
    setLabel(r.name);
    toast(`Saved to Your rooms: ${r.name}`);
  }
  async function rename() {
    if (!saved) return;
    const name = prompt('Rename room', saved.name);
    if (name === null) return;
    await svc.renameRoom(saved.id, name);
    setLabel(name.trim() || 'Room');
  }
  async function duplicate() {
    if (!saved) return;
    const r = await svc.duplicateRoom(saved.id);
    if (r) { pick({ rows: r.rows, cols: r.cols, cells: r.cells }, r.name, r.id); toast(`Made a copy: ${r.name}`); }
  }
  async function remove() {
    if (!saved || !confirm(`Delete the room "${saved.name}"? Plans already made keep their copy.`)) return;
    const res = await svc.deleteRoom(saved.id);
    if (!res.ok) {
      const one = res.usedBy.length === 1;
      toast(`Can't delete: ${res.usedBy.join(', ')} ${one ? 'uses' : 'use'} it in the active plan. Switch ${one ? 'that class' : 'those classes'} to another room first.`);
      return;
    }
    toast('Room deleted');
    onRoom(room);
    setMode('pick');
  }

  if (mode === 'pick') {
    return (
      <div class="fade-up">
        <span class="eyebrow">Step 1 · Room</span>
        {ctx.rooms.length > 0 && (
          <>
            <h3 class="room-h">Your rooms</h3>
            <div class="room-tiles">
              {ctx.rooms.map((r) => (
                <button key={r.id} class={`room-tile ${roomId === r.id ? 'active' : ''}`} onClick={() => pick({ rows: r.rows, cols: r.cols, cells: r.cells }, r.name, r.id)}>
                  <RoomThumb room={r} /><span class="room-tile-name">{r.name}</span><span class="tiny muted">{roomSummary(r).seats} desks</span>
                </button>
              ))}
            </div>
          </>
        )}
        <h3 class="room-h">{ctx.rooms.length ? 'Templates' : 'Pick a layout'}</h3>
        <div class="room-tiles">
          {ROOM_TEMPLATES.map((t) => {
            const r = roomTemplate(t.id as RoomTemplateId, size);
            return (
              <button key={t.id} class="room-tile" onClick={() => pick(r, t.label)}>
                <RoomThumb room={r} /><span class="room-tile-name">{t.label}</span><span class="tiny muted">{roomSummary(r).seats} desks</span>
              </button>
            );
          })}
        </div>
        {ctx.seatingPlan && <button class="link-btn" style="margin-top:12px" onClick={() => { onRoom(ctx.seatingPlan!.room, ctx.seatingPlan!.roomId); setLabel(''); setMode('picked'); }}>Keep the current room</button>}
      </div>
    );
  }

  if (mode === 'picked') {
    return (
      <div class="fade-up">
        <span class="eyebrow">Step 1 · Room</span>
        <h2 style="margin:6px 0 2px">{label || saved?.name || 'Current room'}</h2>
        <p class="tiny muted" style="margin:0 0 8px">{sum.seats} desks · {sum.tables} tables · {ctx.students.length} students{sum.seats < ctx.students.length ? ' · not enough desks: tap Tweak to add some' : ''}</p>
        <RoomGrid room={room} render={(i) => { const c = room.cells[i]; return <div key={i} class={`rc k-${c.k} ${c.k === 'desk' && (c.t ?? 0) % 2 ? 'odd' : ''}`} />; }} />
        <button class="btn primary block" style="margin-top:12px" onClick={onUse}>Use this room <Icon name="arrow" /></button>
        <div class="row between" style="margin-top:8px">
          <button class="btn small" onClick={() => { setWall('board'); setMode('edit'); }}><Icon name="edit" /> Tweak</button>
          <button class="link-btn" onClick={() => setMode('pick')}>Pick another</button>
        </div>
        {saved && (
          <div class="row" style="gap:12px;margin-top:10px">
            <button class="link-btn tiny" onClick={rename}>Rename</button>
            <button class="link-btn tiny" onClick={duplicate}>Duplicate</button>
            <button class="link-btn tiny" onClick={remove}>Delete</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div class="fade-up">
      <span class="eyebrow">Step 1 · Room · Tweak</span>
      {wall ? (
        <div class="wall-strip card flat">
          <ol class="wall-steps">
            {WALL_STEPS.map(([id, text], n) => <li key={id} class={wall === id ? 'on' : WALL_STEPS.findIndex((x) => x[0] === wall) > n ? 'done' : ''}><b>{n + 1}</b> {text}</li>)}
          </ol>
          <div class="row between">
            <span class="tiny muted">{wall === 'window' ? 'Tap a wall again to remove. Desks stay put.' : 'Desks stay put.'}</span>
            <span class="row" style="gap:6px">
              {wall === 'window' && <button class="btn small primary" onClick={() => setWall(null)}>Done</button>}
              <button class="btn small" onClick={nextWall}>Skip</button>
            </span>
          </div>
        </div>
      ) : (
        <button class="link-btn tiny" style="margin:4px 0" onClick={() => setWall('board')}>Set up walls (board, door, windows)</button>
      )}
      {!wall && (
        <>
          <div class="chips room-tools" style="flex-wrap:wrap;margin-top:6px">
            {PALETTE.map(([k, text]) => <button key={k} class={`chip tiny-chip ${tool === k ? 'active' : ''}`} aria-pressed={tool === k} onClick={() => { setTool(k); setGroup([]); }}><i class={`swatch sw-${k}`} />{text}</button>)}
            <button class={`chip tiny-chip ${tool === 'group' ? 'active' : ''}`} aria-pressed={tool === 'group'} onClick={() => setTool('group')}>Group desks</button>
          </div>
          <p class="tiny muted" style="margin:4px 0 8px">{tool === 'group' ? 'Tap desks, then "Join as one table" (e.g. two rows back to back).'
            : tool === 'desk' ? 'Tap to add or remove a desk. Desks touching in a row are one table; leave an empty square for a walkway.'
            : `Tap a square to place: ${PALETTE.find((p) => p[0] === tool)?.[1].toLowerCase()}. The front of the room is wherever the board is.`}</p>
        </>
      )}
      <RoomGrid room={room} render={(i) => {
        const c = room.cells[i];
        return <button key={i} class={`rc k-${c.k} ${group.includes(i) ? 'picked' : ''} ${c.k === 'desk' && (c.t ?? 0) % 2 ? 'odd' : ''}`} aria-label={`${c.k}${c.t ? ` table ${c.t}` : ''}`} onClick={() => tap(i)}>{c.k === 'desk' ? <span class="rc-t">{c.t}</span> : c.k === 'board' ? '' : c.k === 'empty' ? '' : c.k[0].toUpperCase()}</button>;
      }} />
      <div class="row between" style="margin:8px 0">
        <span class="tiny muted">{sum.seats} desks · {sum.tables} tables · {ctx.students.length} students</span>
        {!wall && (
          <span class="row" style="gap:6px">
            <button class="chip tiny-chip" onClick={() => resize(1, 0)}>+ row</button><button class="chip tiny-chip" onClick={() => resize(-1, 0)}>− row</button>
            <button class="chip tiny-chip" onClick={() => resize(0, 1)}>+ col</button><button class="chip tiny-chip" onClick={() => resize(0, -1)}>− col</button>
          </span>
        )}
      </div>
      {tool === 'group' && !wall && <button class="btn small" disabled={group.length < 1} onClick={joinGroup}>Join as one table</button>}
      <div class="grid2" style="margin-top:12px">
        <button class="btn" onClick={saveAs}>{saved ? 'Save room' : 'Save as a room'}</button>
        <button class="btn primary" onClick={onUse}>Use this room <Icon name="arrow" /></button>
      </div>
      <button class="link-btn" style="margin-top:10px" onClick={() => setMode('pick')}>Pick another layout</button>
    </div>
  );
}

function RoomGrid({ room, render, big }: { room: RoomLayout; render: (i: number) => preact.JSX.Element; big?: boolean }) {
  return (
    <div class={`room-wrap ${big ? 'big' : ''}`}>
      <div class="room-grid" style={{ gridTemplateColumns: `repeat(${room.cols}, minmax(${big ? 0 : 46}px, 1fr))` }}>
        {room.cells.map((_, i) => render(i))}
      </div>
    </div>
  );
}

function PlanStep({ ctx, input, room, roomId, seats, setSeats, saved, focus, onShuffle, onNew, onSaved }: {
  ctx: svc.SeatingContext; input: PlannerInput; room: RoomLayout; roomId?: string; seats: Seats; setSeats: (s: Seats) => void; saved: boolean; focus?: string;
  onShuffle: () => void; onNew: () => void; onSaved: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [showGoals, setShowGoals] = useState(false);
  const [askWatch, setAskWatch] = useState<string[] | null>(null);
  const flat = Object.fromEntries(Object.entries(seats).map(([k, v]) => [k, v.studentId]));
  const report: PlanReport = useMemo(() => evaluatePlan(input, flat), [input, JSON.stringify(flat)]);
  const name = (id: string) => { const s = ctx.students.find((x) => x.id === id); return s ? displayName(s) : 'Unknown'; };
  const short = shortNames(ctx.students);
  const review = new Set(ctx.students.filter((s) => watchReview(s.seatWatch)).map((s) => s.id));
  if (focus) review.add(focus);
  const warnIds = new Set(report.warnings.map((w) => w.studentId));
  const pickedStudent = picked ? seats[picked]?.studentId : undefined;

  function tap(seat: string) {
    if (!picked) { setPicked(seat); return; }
    if (picked === seat) { setPicked(null); return; }
    if (seats[picked]?.locked || seats[seat]?.locked) { toast('Unlock the seat first'); setPicked(null); return; }
    const w = swapWarnings(input, flat, picked, seat);
    const next = { ...seats };
    const a = seats[picked], b = seats[seat];
    delete next[picked]; delete next[seat];
    if (a) next[seat] = a;
    if (b) next[picked] = b;
    setSeats(next);
    setPicked(null);
    if (w.length) toast(w[0]);
  }
  async function save(watchAlone: boolean) {
    const left = leftOutStudents(ctx.tags, today());
    const watch = [
      ...(watchAlone ? report.warnings.map((w) => ({ studentId: w.studentId, reason: 'alone' as const })) : []),
      ...[...left].filter((id) => !warnIds.has(id) || !watchAlone).map((id) => ({ studentId: id, reason: 'left_out' as const }))
    ].filter((w, i, xs) => xs.findIndex((x) => x.studentId === w.studentId) === i && Object.values(seats).some((v) => v.studentId === w.studentId));
    await svc.saveSeatingPlan({ classId: ctx.cls.id, room: renumberTables(room), roomId, seats }, watch);
    setAskWatch(null);
    onSaved();
    toast('Saved as the active plan');
  }
  const unseated = ctx.students.filter((s) => !Object.values(seats).some((v) => v.studentId === s.id));

  return (
    <div class="fade-up">
      <button class={`score-bar ${report.problems.length ? 'bad' : report.warnings.length ? 'warn' : 'good'}`} onClick={() => setShowGoals(!showGoals)} aria-expanded={showGoals}>
        <span class="grow">{scoreLine(report)}{report.warnings.length ? ` · ${report.warnings.length} sitting alone` : ''}</span><Icon name="chevron" />
      </button>
      {showGoals && (
        <div class="card flat goal-list">
          {report.warnings.map((w) => <div key={w.text} class="small warn-line"><Icon name="alert" /> {w.text}</div>)}
          {report.problems.map((p) => <div key={p} class="small bad-line"><Icon name="x" /> {p}</div>)}
          {report.goals.filter((g) => !g.met && g.kind !== 'alone' && g.kind !== 'tagAlone').map((g) => <div key={g.text} class="small muted">○ {g.text}</div>)}
          {!report.warnings.length && !report.problems.length && report.goals.every((g) => g.met) && <div class="small">Everything is met.</div>}
        </div>
      )}
      <p class="tiny muted" style="margin:6px 0">Tap a student for their reasons. Tap two students (or a student and an empty desk) to swap.{saved && ctx.seatingPlan ? ` Active since ${formatDate(ctx.seatingPlan.activeFrom ?? today())}.` : ' Not saved yet.'}</p>
      <RoomGrid room={room} render={(i) => {
        const c = room.cells[i];
        if (c.k !== 'desk') return <div key={i} class={`rc k-${c.k}`}>{c.k === 'board' ? '' : c.k === 'empty' ? '' : c.k === 'door' ? 'Door' : c.k === 'teacher' ? 'You' : ''}</div>;
        const v = seats[String(i)];
        return (
          <button key={i} class={`rc k-desk seat ${(c.t ?? 0) % 2 ? 'odd' : ''} ${picked === String(i) ? 'picked' : ''} ${v && review.has(v.studentId) ? 'review' : ''} ${v && warnIds.has(v.studentId) ? 'alone' : ''}`} onClick={() => tap(String(i))}
            aria-label={v ? `${name(v.studentId)}, ${tableName(room, String(i))}` : `Empty desk, ${tableName(room, String(i))}`}>
            {v ? <span class="seat-name">{short.get(v.studentId)}</span> : <span class="muted">–</span>}
            {v?.locked && <Icon name="lock" class="seat-lock" />}
          </button>
        );
      }} />
      {pickedStudent && (
        <div class="card flat reason-card pop-in">
          <div class="row between"><b>{name(pickedStudent)}</b><span class="tiny muted">{tableName(room, picked!)}</span></div>
          {(report.reasons[pickedStudent] ?? []).map((r) => <div key={r} class="small">• {r}</div>)}
          {!report.reasons[pickedStudent]?.length && <div class="small muted">No special reasons for this seat.</div>}
          {report.warnings.filter((w) => w.studentId === pickedStudent).map((w) => <div key={w.text} class="small warn-line">{w.text}</div>)}
          <div class="row" style="gap:8px;margin-top:8px">
            <button class="btn small" onClick={() => { setSeats({ ...seats, [picked!]: { ...seats[picked!], locked: !seats[picked!].locked } }); setPicked(null); }}><Icon name="lock" /> {seats[picked!]?.locked ? 'Unlock seat' : 'Lock seat'}</button>
            {review.has(pickedStudent) && <button class="btn small" onClick={async () => { await svc.clearSeatReview(pickedStudent); setPicked(null); toast('Seat reviewed'); }}>Mark seat reviewed</button>}
            <a class="btn small" href={`#/students/${pickedStudent}`}>Student</a>
          </div>
        </div>
      )}
      {unseated.length > 0 && <p class="small warn-line">No desk: {unseated.map(displayName).join(', ')}. Add desks in the room, or swap.</p>}
      <div class="grid2" style="margin-top:12px">
        <button class="btn" onClick={onShuffle}><Icon name="skip" /> Shuffle</button>
        <button class="btn primary" disabled={saved} onClick={() => (report.warnings.length ? setAskWatch(report.warnings.map((w) => w.studentId)) : save(false))}>{saved ? 'Active plan' : 'Save as active plan'}</button>
        <button class={`btn ${saved ? '' : 'disabled'}`} onClick={() => (saved ? openPresent(`#/class/${ctx.cls.id}/seating/present`) : toast('Save the plan first'))}><Icon name="today" /> Present</button>
        <button class="btn" disabled={!saved || !ctx.seatingPlan} onClick={async () => { await svc.exportSeatingPlan(ctx.seatingPlan!, ctx.students, ctx.cls.name); }}><Icon name="download" /> Export</button>
      </div>
      <button class="link-btn" style="margin-top:10px" onClick={onNew}>New plan or change the room</button>
      {askWatch && (
        <Sheet title="Keep an eye on them?" onClose={() => setAskWatch(null)}>
          <p class="small">{askWatch.map(name).join(', ')} {askWatch.length === 1 ? 'is' : 'are'} sitting without someone they work well with. Keep an eye on them? They'll come up in check-ins for the next 3 lessons with "How are they going there?".</p>
          <div class="actions"><button class="btn" onClick={() => save(false)}>No</button><button class="btn primary" autoFocus onClick={() => save(true)}>Yes</button></div>
        </Sheet>
      )}
    </div>
  );
}

/** Present on the board: big names only, no reasons, levels or colours that hint at needs. Board at the top. */
function SeatingPresent({ ctx }: { ctx: svc.SeatingContext }) {
  const sync = useSyncStatus();
  if (!ctx.seatingPlan) return <p class="muted">No active plan yet. <a href={`#/class/${ctx.cls.id}/seating`}>Make one</a></p>;
  const footer = isPhone() && !window.opener
    ? <>To show it on the board, open Radar on the classroom computer and tap Present.{sync.state !== 'off' ? ' Your plan is already there.' : ''}</>
    : undefined;
  return <SeatsProjector plan={ctx.seatingPlan} students={ctx.students} className={ctx.cls.name} closeHref={`#/class/${ctx.cls.id}/seating`} footer={footer} />;
}

/** The seating plan on the Present page (also what a relief teacher sees under "Seats"). */
export function SeatsProjector({ plan, students, className, closeHref, footer }: {
  plan: Pick<SeatingPlan, 'room' | 'seats'>; students: Student[]; className: string; closeHref: string; footer?: preact.ComponentChildren;
}) {
  const g = projectorGrid(plan, shortNames(students));
  return (
    <Present title={className} closeHref={closeHref} footer={footer}>
      <div class="room-grid projector-grid" style={{ gridTemplateColumns: `repeat(${g.cols}, minmax(0, 1fr))` }}>
        {g.cells.map((c, i) => <div key={i} class={`pc k-${c.kind}`}>{c.kind === 'desk' ? c.name ?? '' : c.kind === 'board' ? '' : c.kind === 'door' ? 'Door' : ''}</div>)}
      </div>
    </Present>
  );
}

/* ---------------- Relationships ---------------- */

function RelationshipsTab({ ctx }: { ctx: svc.SeatingContext }) {
  const date = today();
  const [pick, setPick] = useState<string[]>([]);
  const [never, setNever] = useState(false);
  const [leftOutFor, setLeftOutFor] = useState<string | null>(null);
  const name = (id: string) => { const s = ctx.students.find((x) => x.id === id); return s ? displayName(s) : 'Unknown'; };
  const first = (id: string) => name(id).split(' ')[0];
  const sugg = pairSuggestions(ctx.relationships, date);
  const left = leftOutSuggestions(leftOutStudents(ctx.tags, date), ctx.relationships, date);
  const list = relationshipList(ctx.relationships);
  // Single signals not yet confirmed: "use anyway".
  const settledPairs = new Set(list.map((r) => `${r.type}|${pairKey(r.studentA, r.studentB)}`));
  const signals = new Map<string, Relationship[]>();
  for (const r of ctx.relationships) {
    if (r.confirmed || r.source !== 'checkin' || r.muted) continue;
    const k = `${r.type}|${pairKey(r.studentA, r.studentB)}`;
    if (!settledPairs.has(k) && !sugg.some((x) => x.type === r.type && pairKey(x.a, x.b) === pairKey(r.studentA, r.studentB))) signals.set(k, [...(signals.get(k) ?? []), r]);
  }
  async function add(type: 'keepApart' | 'worksWell') {
    await svc.addRelationship(ctx.cls.id, pick[0], pick[1], type, { strength: type === 'keepApart' && never ? 2 : 1 });
    toast(type === 'keepApart' ? `Keep apart: ${first(pick[0])} and ${first(pick[1])}` : `Works well: ${first(pick[0])} and ${first(pick[1])}`);
    setPick([]); setNever(false);
  }
  return (
    <div class="fade-up">
      {(sugg.length > 0 || left.length > 0) && <div class="section"><h3 class="grow">Suggestions</h3></div>}
      {sugg.map((s) => (
        <div key={`${s.type}${s.a}${s.b}`} class="card flat suggestion">
          <p class="small" style="margin:0 0 8px">{s.type === 'keepApart'
            ? <><b>{first(s.a)} and {first(s.b)}</b>: peer conflict logged {s.count}× together. Keep apart?</>
            : <><b>{first(s.a)} and {first(s.b)}</b>: worked well together {s.count}×. Seat them together?</>}</p>
          <div class="row" style="gap:6px">
            <button class="btn small primary" onClick={() => svc.confirmSuggestion(ctx.cls.id, s)}>Yes</button>
            <button class="btn small" onClick={() => svc.muteSuggestion(ctx.cls.id, s, 'notNow')}>Not now</button>
            <button class="btn small" onClick={() => svc.muteSuggestion(ctx.cls.id, s, 'never')}>Never suggest</button>
          </div>
        </div>
      ))}
      {left.map((id) => (
        <div key={id} class="card flat suggestion">
          <p class="small" style="margin:0 0 8px"><b>{first(id)}</b> was flagged as left out. Seat {first(id)} with someone they work well with?</p>
          <div class="row" style="gap:6px">
            <button class="btn small primary" onClick={() => setLeftOutFor(id)}>Yes</button>
            <button class="btn small" onClick={() => svc.muteLeftOut(ctx.cls.id, id)}>Not now</button>
          </div>
        </div>
      ))}
      {leftOutFor && (
        <PeoplePicker title={`${first(leftOutFor)} works well with…`} people={ctx.students.filter((s) => s.id !== leftOutFor)} onClose={() => setLeftOutFor(null)}
          onSave={async (ids) => { for (const b of ids) await svc.addRelationship(ctx.cls.id, leftOutFor, b, 'worksWell', { source: 'suggested' }); setLeftOutFor(null); toast('Saved'); }} />
      )}

      <div class="section"><h3 class="grow">Add</h3><span class="tiny muted">tap two names</span></div>
      <div class="card flat">
        <div class="chips" style="flex-wrap:wrap">
          {[...ctx.students].sort((a, b) => displayName(a).localeCompare(displayName(b))).map((s) => {
            const on = pick.includes(s.id);
            return <button key={s.id} class={`chip small ${on ? 'active' : ''}`} aria-pressed={on} onClick={() => setPick(on ? pick.filter((x) => x !== s.id) : [...pick.slice(-1), s.id])}>{displayName(s)}</button>;
          })}
        </div>
        {pick.length === 2 && (
          <div class="pop-in" style="margin-top:10px">
            <div class="grid2">
              <button class="btn" onClick={() => add('worksWell')}>Works well together</button>
              <button class="btn" onClick={() => add('keepApart')}>Keep apart</button>
            </div>
            <label class="check-row tiny" style="margin-top:6px"><input type="checkbox" checked={never} onChange={(e) => setNever((e.target as HTMLInputElement).checked)} /> Keep apart: never together (not next to each other either)</label>
          </div>
        )}
      </div>

      <div class="section"><h3 class="grow">Used in plans</h3><span class="tiny muted mono">{list.length}</span></div>
      <div class="card flat" style="padding:4px 14px">
        {!list.length && <p class="small muted">None yet.</p>}
        {list.map((r) => (
          <div key={r.id} class="mini-row">
            <span class="grow">{first(r.studentA)} & {first(r.studentB)}<div class="tiny muted">{r.type === 'worksWell' ? 'Work well together' : r.strength === 2 ? 'Keep apart · never together' : 'Keep apart'}{!r.confirmed ? ' · unconfirmed, used anyway' : ''}</div></span>
            {r.type === 'keepApart' && <button class="link-btn tiny" onClick={() => svc.updateRelationship(r.id, { strength: r.strength === 2 ? 1 : 2 })}>{r.strength === 2 ? 'Allow neighbours' : 'Make never together'}</button>}
            <button class="icon-btn" aria-label="Remove" onClick={() => svc.deleteRelationship(r)}><Icon name="x" /></button>
          </div>
        ))}
      </div>

      {signals.size > 0 && (
        <>
          <div class="section"><h3 class="grow">From check-ins</h3><span class="tiny muted">not confirmed yet</span></div>
          <div class="card flat" style="padding:4px 14px">
            {[...signals.values()].map((rs) => (
              <div key={rs[0].id} class="mini-row">
                <span class="grow">{first(rs[0].studentA)} & {first(rs[0].studentB)}<div class="tiny muted">{rs[0].type === 'keepApart' ? 'Peer conflict' : 'Worked well'} {rs.length}× · {formatDate(rs[rs.length - 1].date)}</div></span>
                <label class="check-row tiny"><input type="checkbox" checked={rs.some((r) => r.useAnyway)} onChange={(e) => svc.updateRelationship(rs[0].id, { useAnyway: (e.target as HTMLInputElement).checked })} /> Use anyway</label>
              </div>
            ))}
          </div>
        </>
      )}
      <p class="tiny muted" style="margin-top:12px">Only relationships you confirm (or tick "use anyway") are used in plans. Teacher-only: never shown on Present, printouts or relief passes.</p>
    </div>
  );
}

/* ---------------- Students: seating needs, support, balance tags ---------------- */

function StudentsTab({ ctx, useSupport }: { ctx: svc.SeatingContext; useSupport: boolean }) {
  const date = today();
  const [edit, setEdit] = useState<Student | null>(null);
  const [tagName, setTagName] = useState('');
  const tags = ctx.cls.balanceTags ?? [];
  const sorted = [...ctx.students].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  const reviews = useSupport ? sorted.filter((s) => supportNeedsReview(s, date)) : [];
  const suggested = useSupport ? sorted.filter((s) => s.support?.level !== 'more').map((s) => ({ s, why: supportSuggestion(s.id, ctx.tags, ctx.coldCalls, date, ctx.assessmentChecks, ctx.cfuResults) })).filter((x) => x.why) : [];
  const saveTags = (next: BalanceTag[]) => svc.saveBalanceTags(ctx.cls.id, next);
  return (
    <div class="fade-up">
      {reviews.map((s) => (
        <div key={s.id} class="card flat suggestion">
          <p class="small" style="margin:0 0 8px"><b>{displayName(s)}</b>: "{supportLabel(s.support!.level)}" was set on {formatDate(s.support!.setAt)}. Still accurate?</p>
          <div class="row" style="gap:6px">
            <button class="btn small primary" onClick={() => svc.setSupport(s.id, s.support!.level)}>Yes</button>
            <button class="btn small" onClick={() => setEdit(s)}>Change</button>
            <button class="btn small" onClick={() => svc.setSupport(s.id, null)}>Clear</button>
          </div>
        </div>
      ))}
      {suggested.map(({ s, why }) => (
        <div key={s.id} class="card flat suggestion">
          <p class="small" style="margin:0 0 8px"><b>{displayName(s)}</b>: needs more support right now? {why}.</p>
          <div class="row" style="gap:6px">
            <button class="btn small primary" onClick={() => svc.setSupport(s.id, 'more')}>Yes</button>
            <button class="btn small" onClick={() => setEdit(s)}>Choose</button>
          </div>
        </div>
      ))}

      <div class="list">
        {sorted.map((s) => {
          const icp = icpNeedSuggestions(s, ctx.adjustments);
          const level = useSupport && s.support && !supportNeedsReview(s, date) ? supportLabel(s.support.level) : null;
          const bits = [...(s.seatingNeeds ?? []).map(needShort), ...(s.seatingNeedNote ? [s.seatingNeedNote] : []), ...(level ? [level] : []), ...(s.balanceTags ?? []).map((t) => tags.find((x) => x.id === t)?.name).filter(Boolean)];
          return (
            <div key={s.id} class="list-item" style="flex-wrap:wrap">
              <button class="grow link-row" onClick={() => setEdit(s)}>
                <span class="title">{displayName(s)}</span>
                <div class="sub">{bits.length ? bits.join(' · ') : 'No seating needs'}</div>
              </button>
              {icp.map((x) => (
                <div key={x.need} class="icp-suggest tiny">
                  This ICP suggests: <b>{needShort(x.need).toLowerCase()}</b>.
                  <button class="link-btn tiny" onClick={() => svc.setSeatingNeeds(s.id, [...(s.seatingNeeds ?? []), x.need], s.seatingNeedNote)}>Add</button>
                  <button class="link-btn tiny" onClick={() => svc.dismissIcpNeed(s.id, x.need)}>No</button>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div class="section"><h3 class="grow">Balance tags</h3></div>
      <div class="card flat">
        <p class="tiny muted" style="margin-top:0">Your own groups, e.g. "Group A" / "Group B", "EAL", "New this term". Teacher-only and encrypted: never on Present, printouts, exports or relief passes.</p>
        {tags.map((t) => (
          <div key={t.id} class="row between" style="margin:6px 0">
            <b class="small">{t.name}</b>
            <span class="row" style="gap:8px">
              <label class="check-row tiny"><input type="checkbox" checked={t.noAlone} onChange={(e) => saveTags(tags.map((x) => (x.id === t.id ? { ...x, noAlone: (e.target as HTMLInputElement).checked } : x)))} /> Don't leave anyone alone</label>
              <button class="icon-btn" aria-label={`Delete ${t.name}`} onClick={() => saveTags(tags.filter((x) => x.id !== t.id))}><Icon name="x" /></button>
            </span>
          </div>
        ))}
        <div class="row" style="gap:6px;margin-top:6px">
          <input class="input" placeholder="New tag" value={tagName} onInput={(e) => setTagName((e.target as HTMLInputElement).value)} />
          <button class="btn small" disabled={!tagName.trim()} onClick={() => { saveTags([...tags, { id: newId(), name: tagName.trim(), noAlone: true }]); setTagName(''); }}>Add</button>
        </div>
      </div>
      {edit && <SeatingSheet s={ctx.students.find((x) => x.id === edit.id) ?? edit} tags={tags} useSupport={useSupport} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** Seating needs (and, when switched on, support level and balance tags) for one student. */
export function SeatingSheet({ s, tags, useSupport, onClose }: { s: Student; tags: BalanceTag[]; useSupport: boolean; onClose: () => void }) {
  const [needs, setNeeds] = useState<string[]>(s.seatingNeeds ?? []);
  const [note, setNote] = useState(s.seatingNeedNote ?? '');
  const [level, setLevel] = useState<string | null>(s.support?.level ?? null);
  const [mine, setMine] = useState<string[]>(s.balanceTags ?? []);
  async function save() {
    await svc.setSeatingNeeds(s.id, needs, note);
    if (useSupport && level !== (s.support?.level ?? null)) await svc.setSupport(s.id, level as 'more' | 'on_track' | 'extension' | null);
    if (tags.length) await svc.setStudentBalanceTags(s.id, mine);
    onClose();
  }
  return (
    <Sheet title={`Seating · ${displayName(s)}`} onClose={onClose}>
      <span class="eyebrow">Seating needs</span>
      <div class="chips" style="flex-wrap:wrap;margin:6px 0">
        {SEATING_NEEDS.map((n) => { const on = needs.includes(n.id); return <button key={n.id} class={`chip small ${on ? 'active' : ''}`} aria-pressed={on} onClick={() => setNeeds(on ? needs.filter((x) => x !== n.id) : [...needs, n.id])}>{needLabel(n.id)}</button>; })}
      </div>
      <input class="input" placeholder="Other need (optional)" value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} />
      {useSupport && (
        <>
          <span class="eyebrow" style="margin-top:12px;display:block">Support right now</span>
          <div class="seg" role="radiogroup" aria-label="Support right now">
            {SUPPORT_LEVELS.map((l) => <button key={l.id} class={level === l.id ? 'on' : ''} aria-pressed={level === l.id} onClick={() => setLevel(level === l.id ? null : l.id)}>{l.label}</button>)}
          </div>
          <p class="tiny muted">Teacher-only. Counts for 10 weeks, then asks "Still accurate?".</p>
        </>
      )}
      {tags.length > 0 && (
        <>
          <span class="eyebrow" style="margin-top:12px;display:block">Balance tags</span>
          <div class="chips" style="flex-wrap:wrap;margin:6px 0">
            {tags.map((t) => { const on = mine.includes(t.id); return <button key={t.id} class={`chip small ${on ? 'active' : ''}`} aria-pressed={on} onClick={() => setMine(on ? mine.filter((x) => x !== t.id) : [...mine, t.id])}>{t.name}</button>; })}
          </div>
        </>
      )}
      <div class="actions"><button class="btn" onClick={onClose}>Cancel</button><button class="btn primary" onClick={save}>Save</button></div>
    </Sheet>
  );
}

/** Settings → Seating. */
export function SeatingSettings({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div class="card">
      <Switch label="Use support levels in seating plans" hint="Teacher-only, reviewed each term, used to balance tables." checked={on} onChange={onChange} />
      <h3 style="margin:14px 0 6px">What seating data is used for</h3>
      <p class="small">{SEATING_PURPOSE}</p>
      <ul class="small tips">
        <li>Seating needs, relationships, support levels and balance tags are only used to suggest seats. You make every change.</li>
        <li>They are encrypted when synced, left out of de-identified exports, and never shown on Present, printouts or relief passes.</li>
        <li>Support levels are off by default. When on, each level counts for 10 weeks and is then asked about again. Archiving a student deletes it.</li>
        <li>There is no gender or other protected-attribute field. Balance tags are your own groups.</li>
      </ul>
    </div>
  );
}

/** Students to review on the class page: "Review seat". */
export function reviewSeatItems(students: Student[]) {
  return students.filter((s) => watchReview(s.seatWatch)).map((s) => ({ s, table: s.seatWatch!.table }));
}

