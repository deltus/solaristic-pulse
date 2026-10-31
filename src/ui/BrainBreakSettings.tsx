// Settings → Brain breaks: hide any break from the roll, preview its instructions, and add your own
// (they join the roll like the built-in ones; a new subject becomes a new group).

import { useState } from 'preact/hooks';
import { db, saveSettings } from '../db';
import type { Settings } from '../types';
import * as svc from '../services';
import { BREAK_GROUPS, BRAIN_BREAKS, type BrainBreak } from '../config/brainBreaks';
import { slug, subjectGroups } from '../logic/brainBreaks';
import { useLive } from './hooks';
import { Field, Icon, Sheet, Switch, toast } from './components';
import { BreakInstructions } from './screens/BrainBreak';

export function BrainBreaksSection({ s }: { s: Settings }) {
  const custom = useLive(() => db.customBreaks.toArray(), []);
  const [adding, setAdding] = useState<BrainBreak | 'new' | null>(null);
  const [viewing, setViewing] = useState<BrainBreak | null>(null);
  if (!custom) return null;
  const hidden = new Set(s.hiddenBreaks ?? []);
  const all = [...BRAIN_BREAKS, ...custom];
  const groups = [...subjectGroups(all), BREAK_GROUPS.find((g) => g.id === 'calm')!];
  const setShown = (id: string, shown: boolean) => saveSettings({ hiddenBreaks: shown ? [...hidden].filter((x) => x !== id) : [...hidden, id] });
  return (
    <div>
      <p class="small muted">Switch off any break you don't want in the roll. Your own breaks join the roll like the built-in ones.</p>
      <button class="btn primary small" style="margin-bottom:12px" onClick={() => setAdding('new')}><Icon name="plus" /> Add your own</button>
      {groups.map((g) => {
        const list = all.filter((b) => b.group === g.id);
        if (!list.length) return null;
        return (
          <div key={g.id} class="card">
            <h3 style="margin:0 0 6px">{g.label}</h3>
            {list.map((b) => (
              <div key={b.id} class="row bb-setting">
                <button class="link-btn grow" style="text-align:left" onClick={() => setViewing(b)}>{b.name}{b.custom ? ' (yours)' : ''}<span class="tiny muted"> · {b.minutes} min{b.years !== 'Any' ? ` · Yr ${b.years}` : ''}</span></button>
                {b.custom && <button class="icon-btn" aria-label={`Edit ${b.name}`} onClick={() => setAdding(b)}><Icon name="edit" /></button>}
                <Switch label="" checked={!hidden.has(b.id)} onChange={(v) => setShown(b.id, v)} />
              </div>
            ))}
          </div>
        );
      })}
      {viewing && <Sheet title="Brain break" onClose={() => setViewing(null)}><BreakInstructions b={viewing} all={all} /></Sheet>}
      {adding && <CustomBreakForm b={adding === 'new' ? undefined : adding} groups={groups} onClose={() => setAdding(null)} />}
    </div>
  );
}

function CustomBreakForm({ b, groups, onClose }: { b?: BrainBreak; groups: { id: string; label: string }[]; onClose: () => void }) {
  const [f, setF] = useState({
    name: b?.name ?? '', group: b?.group ?? groups[0].id, newSubject: '', link: b?.link ?? '', years: b?.years ?? '7–12', minutes: b?.minutes ?? '3',
    resources: (b?.resources ?? []).join('\n'), steps: (b?.steps ?? []).join('\n')
  });
  const set = (k: keyof typeof f) => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });
  async function save() {
    const group = f.group === '__new' ? slug(f.newSubject) : f.group;
    if (!f.name.trim() || !group || !f.steps.trim()) return toast('Add a name, a subject and at least one step');
    await svc.saveCustomBreak({
      id: b?.id, name: f.name, group, type: group === 'calm' ? 'calm' : 'perk', years: f.years.trim() || 'Any', minutes: f.minutes.trim() || '3',
      link: f.link.trim() || undefined, resources: f.resources.split('\n'), steps: f.steps.split('\n')
    });
    toast('Brain break saved');
    onClose();
  }
  async function remove() {
    if (!b || !confirm(`Delete "${b.name}"?`)) return;
    await svc.deleteCustomBreak(b.id);
    onClose();
  }
  return (
    <Sheet title={b ? 'Your brain break' : 'Add your own brain break'} onClose={onClose}>
      <Field label="Name"><input class="input" value={f.name} autoFocus onInput={set('name')} /></Field>
      <Field label="Subject">
        <select class="input" value={f.group} onChange={set('group')}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          <option value="__new">New subject…</option>
        </select>
      </Field>
      {f.group === '__new' && <Field label="New subject name"><input class="input" value={f.newSubject} placeholder="e.g. English" onInput={set('newSubject')} /></Field>}
      <Field label="Link (optional)"><input class="input" type="url" value={f.link} placeholder="https://" onInput={set('link')} /></Field>
      <div class="grid2">
        <Field label="Years"><input class="input" value={f.years} placeholder="7–10" onInput={set('years')} /></Field>
        <Field label="Minutes"><input class="input" value={f.minutes} placeholder="3–5" onInput={set('minutes')} /></Field>
      </div>
      <Field label="You'll need (one per line, empty = nothing)"><textarea class="input" value={f.resources} onInput={set('resources')} /></Field>
      <Field label="Steps (one per line; start a line with Say: for words to read aloud)"><textarea class="input" style="min-height:120px" value={f.steps} onInput={set('steps')} /></Field>
      <div class="actions">
        {b && <button class="btn danger" onClick={remove}><Icon name="trash" /></button>}
        <button class="btn" onClick={onClose}>Cancel</button>
        <button class="btn primary" onClick={save}>Save</button>
      </div>
    </Sheet>
  );
}
