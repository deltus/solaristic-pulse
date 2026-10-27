// Setting up a class: name, subject and year level, then students by typing names or importing a
// file. Used by first-time setup and by "New class" on the Classes page, so both work the same.

import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import * as svc from '../services';
import { parseNameLines, parseRoster } from '../logic/importers';
import { pickFile, readSpreadsheet } from '../platform';
import { Field, Icon, toast } from './components';

export interface SetUpClass { id: string; name: string; added: number }

export function ClassSetup({ phase, setPhase, heading, onBack, onDone, footer }: {
  phase: 'class' | 'students';
  setPhase: (p: 'class' | 'students') => void;
  /** e.g. "Add your first class" or "New class". */
  heading: string;
  onBack?: () => void;
  onDone: (c: SetUpClass) => void;
  /** Extra content under the class form (e.g. "Explore with demo data" in first-time setup). */
  footer?: ComponentChildren;
}) {
  const [cls, setCls] = useState({ name: '', subject: '', yearLevel: '' });
  const [classId, setClassId] = useState<string | null>(null);
  const [names, setNames] = useState('');
  const [added, setAdded] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = parseNameLines(names);
  const set = (k: keyof typeof cls) => (e: Event) => setCls({ ...cls, [k]: (e.target as HTMLInputElement).value });

  async function saveClass() {
    if (!cls.name.trim()) return setErr('Give your class a name.');
    setErr('');
    const data = { name: cls.name.trim(), subject: cls.subject.trim() || undefined, yearLevel: cls.yearLevel.trim() || undefined };
    if (classId) await svc.updateClass(classId, data);
    else setClassId((await svc.createClass(data)).id);
    setPhase('students');
  }
  async function saveStudents() {
    if (!classId) return;
    setBusy(true);
    const r = parsed.length ? await svc.addStudentsByName(classId, parsed) : { added: 0 };
    setBusy(false);
    setNames('');
    onDone({ id: classId, name: cls.name.trim(), added: added + r.added });
  }
  async function importFile() {
    const file = await pickFile('.csv,.xlsx,.xls,text/csv');
    if (!file || !classId) return;
    try {
      const r = parseRoster(await readSpreadsheet(file));
      if (!r.rows.length) return setErr(r.errors[0] ?? 'No students found in that file.');
      const res = await svc.importStudentsIntoClass(r.rows, classId);
      setAdded(added + res.added);
      setErr('');
      toast(`Imported ${res.added} students${res.duplicates ? `, skipped ${res.duplicates} already in the class` : ''}`);
    } catch (e) {
      setErr(`Could not read the file: ${(e as Error).message}`);
    }
  }
  const error = err && <p class="small" style="color:var(--sig)">{err}</p>;

  if (phase === 'class') {
    return (
      <>
        <h1>{heading}</h1>
        <Field label="Class name"><input class="input" value={cls.name} placeholder="9C Science" autoFocus onInput={set('name')} /></Field>
        <div class="grid2">
          <Field label="Subject (optional)"><input class="input" value={cls.subject} placeholder="Science" onInput={set('subject')} /></Field>
          <Field label="Year level (optional)"><input class="input" value={cls.yearLevel} placeholder="Year 9" onInput={set('yearLevel')} /></Field>
        </div>
        {error}
        <div class="grid2">
          {onBack ? <button class="btn" onClick={onBack}><Icon name="back" /> Back</button> : <span />}
          <button class="btn primary" onClick={saveClass}>Continue</button>
        </div>
        {footer}
      </>
    );
  }
  return (
    <>
      <h1>Add students to {cls.name}</h1>
      <p class="muted" style="margin:8px 0 14px">Type names, or import a CSV or Excel file.</p>
      <span class="eyebrow">Type names</span>
      <p class="tiny muted" style="margin:2px 0 6px">One name per line. You can paste a column straight from a spreadsheet.</p>
      <textarea class="input" style="min-height:160px" value={names} placeholder={'Ethan Taylor\nMia Nguyen\nTaylor, Sam'} onInput={(e) => setNames((e.target as HTMLTextAreaElement).value)} />
      <div class="row between" style="margin:8px 0 14px">
        <span class="small muted">{parsed.length ? `${parsed.length} ready to add` : added ? `${added} added` : 'No names yet'}</span>
        <button class="btn small" onClick={importFile}><Icon name="upload" /> Import a file</button>
      </div>
      {error}
      <div class="grid2">
        <button class="btn" onClick={() => setPhase('class')}><Icon name="back" /> Back</button>
        <button class="btn primary" disabled={busy} onClick={saveStudents}>{parsed.length ? `Add ${parsed.length}` : added ? 'Continue' : 'Skip for now'}</button>
      </div>
    </>
  );
}
