// Brain dump: type (or dictate with the phone keyboard) everything on your mind, tap Sort, and
// Radar finds the students mentioned (on the device only) so each chunk becomes a record in one
// tap. Leftovers go to the journal. The original text is deleted after 30 days.

import { useState } from 'preact/hooks';
import type { Student } from '../types';
import * as svc from '../services';
import { db } from '../db';
import { sortDump, type Chunk } from '../logic/braindump';
import { BRAIN_DUMP_KEEP_DAYS, DUE_CHIPS, type DueChip } from '../config/incidents';
import { useLive } from './hooks';
import { displayName, Icon, toast } from './components';

const ACTIONS: { id: svc.DumpAction; label: string }[] = [
  { id: 'note', label: 'Note' },
  { id: 'followup', label: 'Follow-up' },
  { id: 'home', label: 'Contact home' },
  { id: 'wellbeing', label: 'Wellbeing flag' },
  { id: 'positive', label: 'Positive' },
  { id: 'skip', label: 'Skip' }
];

type Row = Chunk & { action?: svc.DumpAction; due?: DueChip };

export function BrainDumpBox({ classId, onDone }: { classId?: string; onDone?: (n: number) => void }) {
  const data = useLive(async () => ({ students: (await db.students.toArray()).filter((s) => !s.archived), classes: await db.classes.toArray() }), []);
  const [text, setText] = useState('');
  const [dumpId, setDumpId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  if (!data) return null;
  const student = (id: string) => data.students.find((s) => s.id === id);
  const className = (s?: Student) => data.classes.find((c) => c.id === s?.classId)?.name ?? '';

  async function sort() {
    const d = await svc.saveBrainDump(text, classId, dumpId ?? undefined);
    setDumpId(d.id);
    setRows(sortDump(text, data!.students, classId));
  }
  const upd = (id: string, patch: Partial<Row>) => setRows(rows!.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  function pick(r: Row, token: string, sid: string) {
    upd(r.id, { studentIds: [...new Set([...r.studentIds, sid])], ambiguous: r.ambiguous.filter((a) => a.token !== token) });
  }
  async function save() {
    const counts = await svc.applyDumpChunks(dumpId!, rows!.map((r) => ({ text: r.text, studentIds: r.studentIds, action: r.action, due: r.due })), classId);
    const made = counts.note + counts.followup + counts.home + counts.wellbeing + counts.positive;
    toast(`Brain dump sorted: ${made} record${made === 1 ? '' : 's'}${counts.journal ? `, ${counts.journal} to the journal` : ''}`);
    setText(''); setRows(null); setDumpId(null);
    onDone?.(made + counts.journal);
  }

  if (!rows) {
    return (
      <div class="brain-dump">
        <textarea class="input dump-text" rows={8} value={text} placeholder="Everything on your mind. Use your keyboard's microphone to dictate. Mention students by name." onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
        <p class="tiny muted" style="margin:4px 0 8px">Names are found on this device; nothing is sent anywhere. The text is kept for {BRAIN_DUMP_KEEP_DAYS} days, then deleted.</p>
        <button class="btn primary block" disabled={!text.trim()} onClick={sort}><Icon name="search" /> Sort</button>
      </div>
    );
  }
  return (
    <div class="brain-dump">
      {rows.map((r) => (
        <div key={r.id} class="card dump-chunk">
          <p class="small" style="margin:0 0 6px">{r.text}</p>
          {r.ambiguous.map((a) => (
            <div key={a.token} class="dump-ask">
              <span class="tiny"><b>Which {a.token}?</b></span>
              <div class="chips" style="flex-wrap:wrap">{a.options.map((id) => <button key={id} class="chip tiny-chip" onClick={() => pick(r, a.token, id)}>{displayName(student(id)!)} · {className(student(id))}</button>)}</div>
            </div>
          ))}
          {r.studentIds.length ? (
            <>
              <div class="chips" style="flex-wrap:wrap;margin-bottom:6px">
                {r.studentIds.map((id) => <span key={id} class="chip small static">{displayName(student(id)!)} <button class="link-btn tiny" aria-label="Not this student" onClick={() => upd(r.id, { studentIds: r.studentIds.filter((x) => x !== id) })}>✕</button></span>)}
              </div>
              <div class="chips" style="flex-wrap:wrap">
                {ACTIONS.map((a) => <button key={a.id} class={`chip small ${r.action === a.id ? 'active' : ''}`} aria-pressed={r.action === a.id} onClick={() => upd(r.id, { action: a.id })}>{a.label}</button>)}
              </div>
              {(r.action === 'followup' || r.action === 'home') && (
                <div class="chips due-chips" style="flex-wrap:wrap">{DUE_CHIPS.map((d) => <button key={d.id} class={`chip tiny-chip ${(r.due ?? (r.action === 'home' ? 'eod' : 'morning')) === d.id ? 'active' : ''}`} onClick={() => upd(r.id, { due: d.id })}>{d.label}</button>)}</div>
              )}
            </>
          ) : !r.ambiguous.length && <p class="tiny muted" style="margin:0">No student found: this goes to your journal.</p>}
        </div>
      ))}
      <p class="tiny muted">Chunks without a choice, and skipped ones, go into one journal entry.</p>
      <div class="actions">
        <button class="btn" onClick={() => setRows(null)}>Back to text</button>
        <button class="btn primary" onClick={save}><Icon name="check" /> Save</button>
      </div>
    </div>
  );
}

export function BrainDumpScreen({ classId }: { classId?: string }) {
  const cls = useLive(async () => (classId ? await db.classes.get(classId) : undefined), [classId]);
  return (
    <div>
      <div class="row between"><a class="link-btn back-btn" href={classId ? `#/class/${classId}` : '#/'}><Icon name="back" /> {cls?.name ?? 'Home'}</a><span class="tiny muted mono">Brain dump</span></div>
      <h1 style="margin:10px 0 8px">Brain dump</h1>
      <BrainDumpBox classId={classId} onDone={() => { location.hash = classId ? `#/class/${classId}` : '#/'; }} />
    </div>
  );
}
