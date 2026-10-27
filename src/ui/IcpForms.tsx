// ICP adjustment forms: add several at once (common list + typed lines, optional flag), edit one,
// and import a CSV/XLSX file with a preview. Used by the ICP page and the student page.

import { useState } from 'preact/hooks';
import { db } from '../db';
import type { IcpAdjustment, IcpFrequency, Student } from '../types';
import * as svc from '../services';
import { COMMON_ADJUSTMENTS, ICP_FLAG_REASON } from '../config/icp';
import { ICP_FREQUENCIES } from '../logic/icp';
import { evidenceOn } from '../logic/evidence';
import { matchIcpImport, parseIcpImport, type IcpMatch } from '../logic/importers';
import { hasFeature } from '../features';
import { pickFile, readSpreadsheet } from '../platform';
import { saveSample } from '../samples';
import { today } from '../lib/dates';
import { useLive } from './hooks';
import { displayName, Field, Icon, Sheet, Switch, toast } from './components';

type Classes = { id: string; name: string }[];

function StudentPicker({ value, onChange, students, classes }: { value: string; onChange: (id: string) => void; students: Student[]; classes: Classes }) {
  const sorted = [...students].sort((a, b) => a.lastName.localeCompare(b.lastName));
  return (
    <Field label="Student">
      <select class="input" value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
        <option value="">Choose a student…</option>
        {classes.map((c) => {
          const list = sorted.filter((s) => s.classId === c.id);
          return list.length ? <optgroup key={c.id} label={c.name}>{list.map((s) => <option key={s.id} value={s.id}>{displayName(s)}</option>)}</optgroup> : null;
        })}
      </select>
    </Field>
  );
}

/** New adjustments (several at once) or, with `adj`, edit one. */
export function AdjustmentForm({ adj, studentId, students, classes, onClose }: { adj?: IcpAdjustment; studentId?: string; students: Student[]; classes: Classes; onClose: () => void }) {
  return adj
    ? <EditAdjustment adj={adj} onClose={onClose} />
    : <NewAdjustments studentId={studentId} students={students} classes={classes} onClose={onClose} />;
}

function NewAdjustments({ studentId, students, classes, onClose }: { studentId?: string; students: Student[]; classes: Classes; onClose: () => void }) {
  const [who, setWho] = useState(studentId ?? '');
  const [ticked, setTicked] = useState<string[]>([]);
  const [lines, setLines] = useState<{ title: string; details: string }[]>([{ title: '', details: '' }]);
  const [shared, setShared] = useState({ frequency: 'lesson' as IcpFrequency, startDate: today(), endDate: '' });
  const [ev, setEv] = useState({ enabled: true, prompt: '' });
  const [flag, setFlag] = useState({ on: false, reason: ICP_FLAG_REASON });
  const items = [...ticked.map((title) => ({ title })), ...lines.filter((l) => l.title.trim()).map((l) => ({ title: l.title, details: l.details.trim() || undefined }))];
  const setLine = (i: number, k: 'title' | 'details', v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  async function save() {
    if (!who || !items.length) return toast('Choose a student and at least one adjustment');
    const evidence = { enabled: ev.enabled ? undefined : false, prompt: ev.prompt.trim() || undefined };
    const r = await svc.saveAdjustments(who, items, { ...shared, endDate: shared.endDate || undefined, evidence }, flag.on ? flag.reason.trim() || ICP_FLAG_REASON : undefined);
    toast(`Saved ${r.added.length} adjustment${r.added.length === 1 ? '' : 's'}${r.skipped ? ` · ${r.skipped} already there` : ''}${flag.on ? ' · student flagged' : ''}`);
    onClose();
  }
  return (
    <Sheet title="New ICP adjustments" onClose={onClose}>
      {!studentId && <StudentPicker value={who} onChange={setWho} students={students} classes={classes} />}
      <span class="eyebrow">Common adjustments</span>
      <div class="chips" style="flex-wrap:wrap;margin:6px 0 12px">
        {COMMON_ADJUSTMENTS.map((t) => {
          const on = ticked.includes(t);
          return <button key={t} class={`chip small ${on ? 'active' : ''}`} aria-pressed={on} onClick={() => setTicked(on ? ticked.filter((x) => x !== t) : [...ticked, t])}>{on && <Icon name="check" />}{t}</button>;
        })}
      </div>
      <span class="eyebrow">Your own</span>
      {lines.map((l, i) => (
        <div key={i} class="adj-line">
          <input class="input" value={l.title} placeholder="Adjustment, e.g. Preferential seating" aria-label={`Adjustment ${i + 1}`} onInput={(e) => setLine(i, 'title', (e.target as HTMLInputElement).value)} />
          <input class="input" value={l.details} placeholder="Details (optional)" aria-label={`Details ${i + 1}`} onInput={(e) => setLine(i, 'details', (e.target as HTMLInputElement).value)} />
          {lines.length > 1 && <button class="icon-btn" aria-label="Remove line" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Icon name="x" /></button>}
        </div>
      ))}
      <button class="btn small" style="margin:4px 0 12px" onClick={() => setLines([...lines, { title: '', details: '' }])}><Icon name="plus" /> Add another</button>
      <Field label="Expected frequency (all of these)">
        <select class="input" value={shared.frequency} onChange={(e) => setShared({ ...shared, frequency: (e.target as HTMLSelectElement).value as IcpFrequency })}>{ICP_FREQUENCIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
      </Field>
      <div class="grid2">
        <Field label="Start date"><input class="input" type="date" value={shared.startDate} onInput={(e) => setShared({ ...shared, startDate: (e.target as HTMLInputElement).value })} /></Field>
        <Field label="End date (optional)"><input class="input" type="date" value={shared.endDate} onInput={(e) => setShared({ ...shared, endDate: (e.target as HTMLInputElement).value })} /></Field>
      </div>
      {hasFeature('evidence') && (
        <>
          <Switch label="Ask for evidence" checked={ev.enabled} onChange={(v) => setEv({ ...ev, enabled: v })} hint="For learning support meetings: asks the first time you record each adjustment, then monthly. Evidence stays on this device." />
          {ev.enabled && <Field label="What to collect (optional)"><input class="input" value={ev.prompt} onInput={(e) => setEv({ ...ev, prompt: (e.target as HTMLInputElement).value })} placeholder="e.g. Photo of the scaffolded worksheet" /></Field>}
        </>
      )}
      <label class="check"><input type="checkbox" checked={flag.on} onChange={(e) => setFlag({ ...flag, on: (e.target as HTMLInputElement).checked })} /><span>Flag this student</span></label>
      {flag.on && <Field label="Flag reason"><input class="input" value={flag.reason} onInput={(e) => setFlag({ ...flag, reason: (e.target as HTMLInputElement).value })} /></Field>}
      <div class="actions">
        <button class="btn" onClick={onClose}>Cancel</button>
        <button class="btn primary" disabled={!who || !items.length} onClick={save}>Save {items.length > 1 ? `${items.length} adjustments` : ''}</button>
      </div>
    </Sheet>
  );
}

function EditAdjustment({ adj, onClose }: { adj: IcpAdjustment; onClose: () => void }) {
  const [f, setF] = useState({
    title: adj.title, details: adj.details ?? '', frequency: adj.frequency, startDate: adj.startDate, endDate: adj.endDate ?? '', active: adj.active
  });
  const [ev, setEv] = useState({ enabled: evidenceOn(adj), prompt: adj.evidence?.prompt ?? '' });
  const set = (k: keyof typeof f) => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });
  async function save() {
    if (!f.title.trim()) return toast('Describe the adjustment');
    const evidence = { snoozedUntil: adj.evidence?.snoozedUntil, enabled: ev.enabled ? undefined : false, prompt: ev.prompt.trim() || undefined };
    await svc.saveAdjustment({ ...adj, ...f, endDate: f.endDate || undefined, evidence });
    toast('Adjustment saved');
    onClose();
  }
  async function remove() {
    if (!confirm('Delete this adjustment and its entire implementation history? Consider setting an end date instead to keep the record.')) return;
    await svc.deleteAdjustment(adj.id);
    onClose();
  }
  return (
    <Sheet title="Edit adjustment" onClose={onClose}>
      <Field label="Adjustment"><input class="input" value={f.title} onInput={set('title')} /></Field>
      <Field label="Details (what was agreed)"><textarea class="input" value={f.details} onInput={set('details')} /></Field>
      <Field label="Expected frequency">
        <select class="input" value={f.frequency} onChange={set('frequency')}>{ICP_FREQUENCIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
      </Field>
      <div class="grid2">
        <Field label="Start date"><input class="input" type="date" value={f.startDate} onInput={set('startDate')} /></Field>
        <Field label="End date (optional)"><input class="input" type="date" value={f.endDate} onInput={set('endDate')} /></Field>
      </div>
      {hasFeature('evidence') && (
        <>
          <Switch label="Ask for evidence" checked={ev.enabled} onChange={(v) => setEv({ ...ev, enabled: v })} hint="For learning support meetings: asks the first time you record this adjustment, then monthly. Evidence stays on this device." />
          {ev.enabled && <Field label="What to collect (optional)"><input class="input" value={ev.prompt} onInput={(e) => setEv({ ...ev, prompt: (e.target as HTMLInputElement).value })} placeholder="e.g. Photo of the scaffolded worksheet" /></Field>}
        </>
      )}
      <Switch label="Active" checked={f.active} onChange={(v) => setF({ ...f, active: v })} hint="Inactive adjustments keep their history but stop reminders." />
      <div class="actions">
        <button class="btn danger" onClick={remove}><Icon name="trash" /></button>
        <button class="btn" onClick={onClose}>Cancel</button>
        <button class="btn primary" onClick={save}>Save</button>
      </div>
    </Sheet>
  );
}

const STATUS_TEXT: Record<IcpMatch['status'], string> = { ok: 'Ready', unknown: 'Unknown student', ambiguous: 'Which student?', duplicate: 'Duplicate' };

/** Import ICP adjustments from a CSV/XLSX file: preview the matches and problems, then save the good rows. */
export function IcpImport({ onClose }: { onClose: () => void }) {
  const data = useLive(async () => ({ students: await db.students.toArray(), classes: await db.classes.toArray(), adjustments: await db.icpAdjustments.toArray() }), []);
  const [matches, setMatches] = useState<IcpMatch[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  async function choose() {
    const file = await pickFile('.csv,.xlsx,.xls,text/csv');
    if (!file || !data) return;
    setFileName(file.name);
    try {
      const parsed = parseIcpImport(await readSpreadsheet(file));
      setErrors(parsed.errors);
      setMatches(matchIcpImport(parsed.rows, data.students, data.classes, data.adjustments));
    } catch (e) {
      setErrors([`Could not read the file: ${(e as Error).message}`]);
    }
  }
  const ok = matches?.filter((m) => m.status === 'ok') ?? [];
  const nameOf = (id?: string) => { const s = data?.students.find((x) => x.id === id); return s ? displayName(s) : ''; };
  async function confirm() {
    if (!matches) return;
    const n = await svc.importIcpRows(matches);
    toast(`Imported ${n} adjustment${n === 1 ? '' : 's'}`);
    onClose();
  }
  return (
    <Sheet title="Import ICP adjustments" onClose={onClose}>
      <p class="small muted">A CSV or Excel file with a header row. Columns: <b>Student ID</b> or <b>Student name</b>, optional <b>Class</b>, <b>Adjustment</b>, optional <b>Notes</b>. One adjustment per row. The file is read on this device only.</p>
      <div class="row wrap" style="margin:10px 0">
        <button class="btn primary" onClick={choose}><Icon name="upload" /> Choose file</button>
        <button class="btn ghost small" onClick={() => saveSample('icp')}><Icon name="download" /> Download template</button>
      </div>
      {fileName && matches && <p class="small"><b>{fileName}</b>: {matches.length} rows · {ok.length} ready · {matches.length - ok.length} with problems</p>}
      {errors.map((e) => <p key={e} class="small" style="color:var(--sig)">{e}</p>)}
      {matches && matches.length > 0 && (
        <>
          <div class="list" style="max-height:280px;overflow:auto">
            {matches.map((m) => (
              <div key={m.row.row} class="list-item">
                <span class="grow">
                  <span class="title">{m.row.adjustment}</span>
                  <div class="sub">{[`Row ${m.row.row}`, nameOf(m.studentId) || m.row.studentName || m.row.studentId, m.row.className, m.problem].filter(Boolean).join(' · ')}</div>
                </span>
                <span class={`badge ${m.status === 'ok' ? 'ok' : 'some'}`}>{STATUS_TEXT[m.status]}</span>
              </div>
            ))}
          </div>
          <div class="actions"><button class="btn" onClick={onClose}>Cancel</button><button class="btn primary" disabled={!ok.length} onClick={confirm}>Import {ok.length}</button></div>
        </>
      )}
    </Sheet>
  );
}
