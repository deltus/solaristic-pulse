// Teacher journal: private entries for each class, for the teacher's own development and mentoring.
// Shown on the class's Journal tab and on "My teaching". Never part of reports or shared exports;
// it has its own Word export.

import { useState } from 'preact/hooks';
import { db } from '../db';
import type { JournalEntry, Lesson } from '../types';
import * as svc from '../services';
import { AITSL_STANDARDS, JOURNAL_TAGS, aitslLabel } from '../config/journal';
import { defaultJournalLesson } from '../logic/journal';
import { lessonName } from '../logic/lessons';
import { formatDate, formatShort, today } from '../lib/dates';
import { useLive } from './hooks';
import { Empty, Field, Icon, Sheet, toast } from './components';

/** New or edit. `start` pre-fills a new entry (e.g. from Close lesson: that lesson and its note). */
export function JournalForm({ classId, entry, start, onClose }: { classId: string; entry?: JournalEntry; start?: { lessonId?: string; text?: string }; onClose: () => void }) {
  const lessons = useLive(() => db.lessons.where('classId').equals(classId).toArray(), [classId]);
  const [f, setF] = useState<{ date: string; lessonId: string | null; text: string; tags: string[]; aitsl: string; custom: string }>({
    date: entry?.date ?? today(), lessonId: entry ? entry.lessonId ?? '' : start?.lessonId ?? null, text: entry?.text ?? start?.text ?? '',
    tags: entry?.tags ?? [], aitsl: entry?.aitsl ? String(entry.aitsl) : '', custom: ''
  });
  if (!lessons) return null;
  // Default link: the current or most recent lesson (set once the lessons have loaded).
  const lessonId = f.lessonId ?? defaultJournalLesson(lessons, classId)?.id ?? '';
  const recent = [...lessons].filter((l) => !l.historical).sort((a, b) => b.openedAt - a.openedAt).slice(0, 20);
  const allTags = [...JOURNAL_TAGS, ...f.tags.filter((t) => !JOURNAL_TAGS.includes(t))];
  const toggle = (t: string) => setF({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] });
  async function save() {
    if (!f.text.trim()) return toast('Write something first');
    await svc.saveJournalEntry({ ...entry, classId, date: f.date, lessonId: lessonId || undefined, text: f.text, tags: f.tags, aitsl: Number(f.aitsl) || undefined });
    toast('Journal entry saved');
    onClose();
  }
  async function remove() {
    if (!entry || !confirm('Delete this journal entry?')) return;
    await svc.deleteJournalEntry(entry.id);
    onClose();
  }
  return (
    <Sheet title={entry ? 'Journal entry' : 'New journal entry'} onClose={onClose}>
      <p class="tiny muted" style="margin-top:-4px">Private to you. Never in reports, de-identified exports or anything shared.</p>
      <div class="grid2">
        <Field label="Date"><input class="input" type="date" value={f.date} onInput={(e) => setF({ ...f, date: (e.target as HTMLInputElement).value })} /></Field>
        <Field label="Lesson (optional)">
          <select class="input" value={lessonId} onChange={(e) => setF({ ...f, lessonId: (e.target as HTMLSelectElement).value })}>
            <option value="">No lesson</option>
            {recent.map((l: Lesson) => <option key={l.id} value={l.id}>{formatShort(l.date)} · {lessonName(l)}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Entry"><textarea class="input" style="min-height:140px" autoFocus value={f.text} placeholder="What happened, what you tried, what you'd do next time…" onInput={(e) => setF({ ...f, text: (e.target as HTMLTextAreaElement).value })} /></Field>
      <span class="eyebrow">Tags</span>
      <div class="chips" style="flex-wrap:wrap;margin:6px 0 8px">
        {allTags.map((t) => <button key={t} class={`chip small ${f.tags.includes(t) ? 'active' : ''}`} aria-pressed={f.tags.includes(t)} onClick={() => toggle(t)}>{t}</button>)}
      </div>
      <div class="row" style="gap:6px;margin-bottom:12px">
        <input class="input grow" value={f.custom} placeholder="Add your own tag" onInput={(e) => setF({ ...f, custom: (e.target as HTMLInputElement).value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && f.custom.trim()) setF({ ...f, tags: [...new Set([...f.tags, f.custom.trim()])], custom: '' }); }} />
        <button class="btn small" disabled={!f.custom.trim()} onClick={() => setF({ ...f, tags: [...new Set([...f.tags, f.custom.trim()])], custom: '' })}>Add</button>
      </div>
      <Field label="AITSL standard (optional)">
        <select class="input" value={f.aitsl} onChange={(e) => setF({ ...f, aitsl: (e.target as HTMLSelectElement).value })}>
          <option value="">None</option>
          {AITSL_STANDARDS.map((s) => <option key={s.n} value={s.n}>{s.n}. {s.label}</option>)}
        </select>
      </Field>
      <div class="actions">
        {entry && <button class="btn danger" onClick={remove}><Icon name="trash" /></button>}
        <button class="btn" onClick={onClose}>Cancel</button>
        <button class="btn primary" disabled={!f.text.trim()} onClick={save}>Save</button>
      </div>
    </Sheet>
  );
}

/** Journal entries, newest first, for one class or (no classId) all classes. */
export function JournalList({ classId }: { classId?: string }) {
  const data = useLive(async () => ({
    entries: classId ? await db.journal.where('classId').equals(classId).toArray() : await db.journal.toArray(),
    classes: await db.classes.toArray(),
    lessons: classId ? await db.lessons.where('classId').equals(classId).toArray() : await db.lessons.toArray()
  }), [classId]);
  const [editing, setEditing] = useState<JournalEntry | 'new' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [newFor, setNewFor] = useState(classId ?? '');
  if (!data) return null;
  const entries = [...data.entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const className = (id: string) => data.classes.find((c) => c.id === id)?.name ?? 'Class';
  const lessonTitle = (id?: string) => { const l = id ? data.lessons.find((x) => x.id === id) : undefined; return l ? lessonName(l) : ''; };
  const live = data.classes.filter((c) => !c.archived);
  return (
    <div>
      <div class="row wrap" style="margin-bottom:10px;gap:8px">
        {!classId && live.length > 1 && (
          <select class="input" style="width:auto" value={newFor} onChange={(e) => setNewFor((e.target as HTMLSelectElement).value)} aria-label="Class for the new entry">
            <option value="">Choose a class…</option>
            {live.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <button class="btn primary small" disabled={!(classId || newFor || live.length === 1)} onClick={() => { if (!classId && !newFor && live.length === 1) setNewFor(live[0].id); setEditing('new'); }}><Icon name="plus" /> New entry</button>
        <button class="btn small" onClick={() => setExporting(true)}><Icon name="download" /> Journal (Word)</button>
      </div>
      {entries.length ? (
        <div class="list">
          {entries.map((e) => (
            <button key={e.id} class="list-item journal-item" onClick={() => setEditing(e)}>
              <span class="grow">
                <span class="row between"><b>{formatShort(e.date)}{!classId ? ` · ${className(e.classId)}` : ''}</b><span class="tiny muted">{lessonTitle(e.lessonId)}</span></span>
                <div class="small journal-text">{e.text}</div>
                {(e.tags.length > 0 || e.aitsl) && <div class="tiny muted">{[...e.tags, aitslLabel(e.aitsl)].filter(Boolean).join(' · ')}</div>}
              </span>
            </button>
          ))}
        </div>
      ) : <div class="card"><Empty icon="edit">No journal entries yet. Write one after a lesson, or from Close lesson.</Empty></div>}
      {editing && <JournalForm classId={editing === 'new' ? classId || newFor || live[0]?.id : editing.classId} entry={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {exporting && <JournalExport classId={classId} onClose={() => setExporting(false)} />}
    </div>
  );
}

/** "Journal (Word)": by date range and class, for mentor meetings and portfolio evidence. */
export function JournalExport({ classId, onClose }: { classId?: string; onClose: () => void }) {
  const classes = useLive(() => db.classes.toArray(), []);
  const [f, setF] = useState({ from: '', to: '', classIds: classId ? [classId] : ([] as string[]) });
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const r = await svc.exportJournal({ from: f.from || undefined, to: f.to || undefined, classIds: f.classIds });
    setBusy(false);
    toast(`Saved ${r.name}`);
    onClose();
  }
  return (
    <Sheet title="Export journal" onClose={onClose}>
      <p class="small muted">A Word document of your entries, for mentor meetings or portfolio evidence. Only you decide who sees it.</p>
      <div class="grid2">
        <Field label="From"><input class="input" type="date" value={f.from} onInput={(e) => setF({ ...f, from: (e.target as HTMLInputElement).value })} /></Field>
        <Field label="To"><input class="input" type="date" value={f.to} onInput={(e) => setF({ ...f, to: (e.target as HTMLInputElement).value })} /></Field>
      </div>
      <span class="eyebrow">Classes</span>
      <div class="chips" style="flex-wrap:wrap;margin:6px 0 12px">
        <button class={`chip small ${!f.classIds.length ? 'active' : ''}`} onClick={() => setF({ ...f, classIds: [] })}>All classes</button>
        {(classes ?? []).filter((c) => !c.archived).map((c) => {
          const on = f.classIds.includes(c.id);
          return <button key={c.id} class={`chip small ${on ? 'active' : ''}`} onClick={() => setF({ ...f, classIds: on ? f.classIds.filter((x) => x !== c.id) : [...f.classIds, c.id] })}>{c.name}</button>;
        })}
      </div>
      <p class="tiny muted">{f.from || f.to ? `${f.from ? formatDate(f.from) : 'Start'} to ${f.to ? formatDate(f.to) : 'today'}` : 'All dates'}</p>
      <div class="actions"><button class="btn" onClick={onClose}>Cancel</button><button class="btn primary" disabled={busy} onClick={go}><Icon name="download" /> Export (.docx)</button></div>
    </Sheet>
  );
}
