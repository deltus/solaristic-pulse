import { useState } from 'preact/hooks';
import { db } from '../../db';
import type { SchoolClass, Student, TimetableEntry } from '../../types';
import * as svc from '../../services';
import { parseRoster, type RosterRow } from '../../logic/importers';
import { pickFile, readSpreadsheet } from '../../platform';
import { saveSample } from '../../samples';
import { DAY_NAMES, today } from '../../lib/dates';
import { needByStudent } from '../../logic/need';
import { NeedBadge } from './Students';
import { ClassOverview } from './ClassOverview';
import { ClassSetup } from '../ClassSetup';
import { JournalList } from '../Journal';
import { AssessmentsPanel } from './Assessment';
import { ReliefPanel } from '../Relief';
import { go, useLive } from '../hooks';
import { Avatar, displayName, Empty, Field, Icon, PageHead, Sheet, toast } from '../components';

/** Classes by name, subject or year level; students by first, last or preferred name. */
export function searchClassesAndStudents(classes: SchoolClass[], students: Student[], q: string) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return { classes, students: [] as Student[] };
  const hit = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  return {
    classes: classes.filter((c) => hit([c.name, c.subject, c.yearLevel].filter(Boolean).join(' '))),
    students: students.filter((s) => !s.archived && hit([s.firstName, s.lastName, s.preferredName].filter(Boolean).join(' ')))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
  };
}

export function ClassesScreen() {
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [q, setQ] = useState('');
  const data = useLive(async () => ({
    classes: await db.classes.toArray(),
    students: await db.students.toArray(),
    timetable: await db.timetable.toArray()
  }), []);
  if (!data) return null;
  const match = searchClassesAndStudents(data.classes, data.students, q);
  const list = data.classes.filter((c) => c.archived === showArchived && (!q.trim() || match.classes.includes(c))).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <PageHead eyebrow="Classes" title="Your classes">
        <button class="btn primary small" onClick={() => setAdding(true)}><Icon name="plus" /> New class</button>
      </PageHead>
      <input class="input" type="search" placeholder="Search classes or students" aria-label="Search classes or students" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} style="margin-bottom:10px" />
      {q.trim() !== '' && match.students.length > 0 && (
        <>
          <div class="section" style="margin-top:4px"><h3 class="grow">Students</h3><span class="tiny muted mono">{match.students.length}</span></div>
          <div class="list" style="margin-bottom:12px">
            {match.students.slice(0, 8).map((s) => (
              <a key={s.id} class="list-item" href={`#/students/${s.id}`}>
                <Avatar s={s} />
                <span class="grow"><span class="title">{displayName(s)}</span><div class="sub">{data.classes.find((c) => c.id === s.classId)?.name ?? ''}</div></span>
                <Icon name="chevron" />
              </a>
            ))}
          </div>
          <div class="section"><h3 class="grow">Classes</h3></div>
        </>
      )}
      <div class="row wrap" style="margin-bottom:12px">
        <button class="btn small" onClick={() => setImporting(true)}><Icon name="upload" /> Import all classes (CSV/XLSX)</button>
        <a class="btn small" href="#/settings/timetable"><Icon name="calendar" /> Timetable</a>
        <span class="grow" />
        <button class={`chip small ${showArchived ? 'active' : ''}`} onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Showing archived' : 'Show archived'}</button>
      </div>
      {list.length ? (
        <div class="list">
          {list.map((c) => {
            const n = data.students.filter((s) => s.classId === c.id && !s.archived).length;
            const lessons = data.timetable.filter((t) => t.classId === c.id).length;
            return (
              <a key={c.id} class="list-item" href={`#/classes/${c.id}`}>
                <span class="avatar" style="border-radius:10px;background:var(--navy);color:#fff">{c.name.slice(0, 2).toUpperCase()}</span>
                <span class="grow">
                  <span class="title">{c.name}</span>
                  <div class="sub">{[c.yearLevel, `${n} student${n === 1 ? '' : 's'}`, lessons ? `${lessons} lesson${lessons === 1 ? '' : 's'}/week` : 'No timetable'].filter(Boolean).join(' · ')}</div>
                </span>
                <Icon name="chevron" />
              </a>
            );
          })}
        </div>
      ) : (
        <div class="card"><Empty icon="classes">{q.trim() ? `No classes match “${q.trim()}”.` : showArchived ? 'No archived classes.' : 'No classes yet. Create one, or import a roster with a Class column to create several at once.'}</Empty></div>
      )}
      {adding && <NewClassSheet onClose={() => setAdding(false)} />}
      {importing && <RosterImport onClose={() => setImporting(false)} />}
    </div>
  );
}

/** New class: the same steps as first-time setup (class details, then type names or import a file). */
function NewClassSheet({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<'class' | 'students'>('class');
  return (
    <Sheet title="New class" onClose={onClose}>
      <ClassSetup phase={phase} setPhase={setPhase} heading="Class details" onBack={onClose}
        onDone={(c) => { toast(`${c.name} set up${c.added ? ` with ${c.added} students` : ''}`); onClose(); go(`classes/${c.id}`); }} />
    </Sheet>
  );
}

function ClassForm({ cls, onClose }: { cls?: SchoolClass; onClose: () => void }) {
  const [f, setF] = useState({ name: cls?.name ?? '', subject: cls?.subject ?? '', yearLevel: cls?.yearLevel ?? '', dailyTarget: cls?.dailyTarget ? String(cls.dailyTarget) : '' });
  async function save() {
    if (!f.name.trim()) return;
    const target = f.dailyTarget ? Math.max(1, Math.min(40, Number(f.dailyTarget))) : undefined;
    if (cls) await svc.updateClass(cls.id, { name: f.name.trim(), subject: f.subject.trim() || undefined, yearLevel: f.yearLevel.trim() || undefined, dailyTarget: target });
    else {
      const c = await svc.createClass(f);
      if (target) await svc.updateClass(c.id, { dailyTarget: target });
      go(`classes/${c.id}`);
    }
    onClose();
  }
  const set = (k: keyof typeof f) => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });
  return (
    <Sheet title={cls ? 'Edit class' : 'New class'} onClose={onClose}>
      <Field label="Class name"><input class="input" value={f.name} onInput={set('name')} placeholder="e.g. 9C Science" autoFocus /></Field>
      <div class="grid2">
        <Field label="Subject"><input class="input" value={f.subject} onInput={set('subject')} /></Field>
        <Field label="Year level"><input class="input" value={f.yearLevel} onInput={set('yearLevel')} placeholder="Year 9" /></Field>
      </div>
      <Field label="Check-in target per lesson (optional)" hint="Leave empty to use the one in Settings.">
        <input class="input" type="number" min={1} max={40} value={f.dailyTarget} onInput={set('dailyTarget')} />
      </Field>
      <div class="actions"><button class="btn" onClick={onClose}>Cancel</button><button class="btn primary" disabled={!f.name.trim()} onClick={save}>Save</button></div>
    </Sheet>
  );
}

export function StudentForm({ classId, student, onClose }: { classId: string; student?: Student; onClose: () => void }) {
  const classes = useLive(() => db.classes.toArray(), []);
  const [f, setF] = useState({
    firstName: student?.firstName ?? '', lastName: student?.lastName ?? '', preferredName: student?.preferredName ?? '',
    externalId: student?.externalId ?? '', classId: student?.classId ?? classId, priorityAdjust: String(student?.priorityAdjust ?? 0)
  });
  const [addAnother, setAddAnother] = useState(!student);
  async function save() {
    if (!f.firstName.trim()) return;
    if (student) {
      await svc.updateStudent(student.id, {
        firstName: f.firstName.trim(), lastName: f.lastName.trim(), preferredName: f.preferredName.trim() || undefined,
        externalId: f.externalId.trim() || undefined, classId: f.classId, priorityAdjust: Number(f.priorityAdjust)
      });
      onClose();
    } else {
      await svc.addStudent(f.classId, { ...f, priorityAdjust: Number(f.priorityAdjust) });
      toast(`Added ${f.firstName}`);
      if (addAnother) setF({ ...f, firstName: '', lastName: '', preferredName: '', externalId: '' });
      else onClose();
    }
  }
  const set = (k: keyof typeof f) => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });
  return (
    <Sheet title={student ? 'Edit student' : 'Add student'} onClose={onClose}>
      <div class="grid2">
        <Field label="First name"><input class="input" value={f.firstName} onInput={set('firstName')} autoFocus /></Field>
        <Field label="Last name"><input class="input" value={f.lastName} onInput={set('lastName')} /></Field>
      </div>
      <div class="grid2">
        <Field label="Preferred name"><input class="input" value={f.preferredName} onInput={set('preferredName')} /></Field>
        <Field label="School ID (optional)"><input class="input" value={f.externalId} onInput={set('externalId')} /></Field>
      </div>
      {student && (
        <Field label="Class" hint="Moving a student keeps their history.">
          <select class="input" value={f.classId} onChange={set('classId')}>
            {(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}
      {!student && <label class="check"><input type="checkbox" checked={addAnother} onChange={(e) => setAddAnother((e.target as HTMLInputElement).checked)} /><span>Add another after saving</span></label>}
      <div class="actions"><button class="btn" onClick={onClose}>{student ? 'Cancel' : 'Done'}</button><button class="btn primary" disabled={!f.firstName.trim()} onClick={save}>Save</button></div>
    </Sheet>
  );
}

export function RosterImport({ classId, onClose }: { classId?: string; onClose: () => void }) {
  const classes = useLive(() => db.classes.toArray().then((cs) => cs.filter((c) => !c.archived)), []);
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [target, setTarget] = useState(classId ?? '');
  const [fileName, setFileName] = useState('');

  async function choose() {
    const file = await pickFile('.csv,.xlsx,.xls,text/csv');
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = parseRoster(await readSpreadsheet(file));
      setRows(parsed.rows);
      setErrors(parsed.errors);
    } catch (e) {
      setErrors([`Could not read the file: ${(e as Error).message}`]);
    }
  }
  // Inside a class, everyone goes into that class (any Class column is ignored).
  const needsClass = !classId && rows?.some((r) => !r.className);
  async function confirm() {
    if (!rows) return;
    const r = classId ? await svc.importStudentsIntoClass(rows, classId) : await svc.importRoster(rows, target || undefined);
    toast(`Imported ${r.added} student${r.added === 1 ? '' : 's'}${r.duplicates ? `, skipped ${r.duplicates} already present` : ''}`);
    onClose();
  }

  return (
    <Sheet title={classId ? 'Import students' : 'Import all classes'} onClose={onClose}>
      <p class="small muted">Use a CSV or Excel file with a header row. Recognised columns: <b>First name</b>, <b>Last name</b> (or a single <b>Name</b>), optional <b>Preferred name</b> and <b>Student ID</b>{classId
        ? '. Everyone in the file is added to this class.'
        : <>, and <b>Class</b>. A Class column creates missing classes automatically.</>} The file is read on this device only.</p>
      <div class="row wrap" style="margin:10px 0">
        <button class="btn primary" onClick={choose}><Icon name="upload" /> Choose file</button>
        <button class="btn ghost small" onClick={() => saveSample('roster')}>Get a sample roster</button>
      </div>
      {fileName && <p class="small"><b>{fileName}</b>: {rows?.length ?? 0} students found.</p>}
      {errors.map((e) => <p key={e} class="small" style="color:var(--sig)">{e}</p>)}
      {rows && rows.length > 0 && (
        <>
          {needsClass && (
            <Field label="Class for rows without a Class column">
              <select class="input" value={target} onChange={(e) => setTarget((e.target as HTMLSelectElement).value)}>
                <option value="">Choose a class…</option>
                {(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
          <div class="list" style="max-height:240px;overflow:auto">
            {rows.slice(0, 50).map((r, i) => (
              <div key={i} class="list-item"><span class="grow"><span class="title">{r.firstName} {r.lastName}</span><div class="sub">{[r.preferredName && `Preferred: ${r.preferredName}`, r.externalId, !classId && r.className].filter(Boolean).join(' · ')}</div></span></div>
            ))}
          </div>
          {rows.length > 50 && <p class="tiny muted">…and {rows.length - 50} more</p>}
          <div class="actions"><button class="btn" onClick={onClose}>Cancel</button><button class="btn primary" disabled={needsClass && !target} onClick={confirm}>Import {rows.length} students</button></div>
        </>
      )}
    </Sheet>
  );
}

export function ClassDetail({ id, tab }: { id: string; tab?: string }) {
  const data = useLive(async () => ({
    cls: await db.classes.get(id),
    students: await db.students.where('classId').equals(id).toArray(),
    timetable: await db.timetable.where('classId').equals(id).toArray(),
    observations: await db.observations.where('classId').equals(id).toArray(),
    checkins: await db.checkins.where('classId').equals(id).toArray(),
    tags: await db.issueTags.where('classId').equals(id).toArray(),
    homework: await db.homework.where('classId').equals(id).toArray(),
    lessons: await db.lessons.where('classId').equals(id).toArray()
  }), [id]);
  const [sheet, setSheet] = useState<'edit' | 'student' | 'import' | 'lesson' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  if (!data) return null;
  const { cls, students, timetable } = data;
  if (!cls) return <p>Class not found. <a href="#/classes">Back to classes</a></p>;
  const need = needByStudent(students, data.checkins, data.observations, data.tags, data.homework, today(), data.lessons);
  const shown = students.filter((s) => s.archived === showArchived).sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

  async function archive() {
    await svc.updateClass(cls!.id, { archived: !cls!.archived });
    toast(cls!.archived ? 'Class restored' : 'Class archived. Its history is kept.');
  }
  async function remove() {
    const ok = prompt(`Permanently delete ${cls!.name}, its ${students.length} students and ALL their observations and ICP records? This cannot be undone.\n\nArchiving keeps history instead. Type the class name to confirm.`);
    if (ok?.trim() !== cls!.name) return;
    await svc.deleteClassPermanently(cls!.id);
    toast('Class deleted');
    go('classes');
  }

  const head = (
    <>
      <PageHead eyebrow={[cls.yearLevel, cls.subject].filter(Boolean).join(' · ') || 'Class'} title={cls.name} back="#/classes">
        <button class="icon-btn" aria-label="Edit class" onClick={() => setSheet('edit')}><Icon name="edit" /></button>
      </PageHead>
      <div class="chips class-tabs" role="tablist">
        {[['', 'Class'], ['journal', 'Journal'], ['assessments', 'Assessments'], ['relief', 'Relief']].map(([t, label]) => (
          <a key={t} role="tab" aria-selected={(tab ?? '') === t} class={`chip ${(tab ?? '') === t ? 'active' : ''}`} href={`#/classes/${cls.id}${t ? `/${t}` : ''}`}>{label}</a>
        ))}
      </div>
    </>
  );
  if (tab === 'journal' || tab === 'assessments' || tab === 'relief') {
    return (
      <div>
        {head}
        {tab === 'journal'
          ? <><p class="small muted" style="margin:0 0 10px">Your private journal for {cls.name}. Never in reports or shared exports.</p><JournalList classId={cls.id} /></>
          : tab === 'relief' ? <ReliefPanel classId={cls.id} />
          : <AssessmentsPanel classId={cls.id} />}
        {sheet === 'edit' && <ClassForm cls={cls} onClose={() => setSheet(null)} />}
      </div>
    );
  }

  return (
    <div>
      {head}
      {cls.archived && <div class="notice">This class is archived. It is hidden from Today and the rotation; its records are kept.</div>}
      {!cls.archived && <ClassOverview classId={cls.id} onBlitz={() => go(`classes/${cls.id}/blitz`)} />}

      <div class="row wrap" style="margin-bottom:12px">
        <button class="btn primary small" onClick={() => setSheet('student')}><Icon name="plus" /> Add student</button>
        <button class="btn small" onClick={() => setSheet('import')}><Icon name="upload" /> Import students</button>
        <span class="grow" />
        <button class={`chip small ${showArchived ? 'active' : ''}`} onClick={() => setShowArchived(!showArchived)}>Archived ({students.filter((s) => s.archived).length})</button>
      </div>

      <div class="section"><h2>Roster</h2><span class="tiny muted mono">{shown.length}</span></div>
      {shown.length ? (
        <div class="list">
          {shown.map((s) => (
            <a key={s.id} class="list-item" href={`#/students/${s.id}`}>
              <Avatar s={s} />
              <span class="grow"><span class="title">{displayName(s)}</span><div class="sub">{[s.preferredName && `${s.firstName} ${s.lastName}`, s.externalId].filter(Boolean).join(' · ') || ' '}</div></span>
              {need.get(s.id) && <NeedBadge r={need.get(s.id)!} />}
              {s.flag && <span class="badge flag"><Icon name="flag" /> Flagged</span>}
              <Icon name="chevron" />
            </a>
          ))}
        </div>
      ) : <div class="card"><Empty icon="students">{showArchived ? 'No archived students.' : 'No students yet.'}</Empty></div>}

      <div class="section"><h2>Timetable</h2><button class="btn small" onClick={() => setSheet('lesson')}><Icon name="plus" /> Lesson</button></div>
      {timetable.length ? (
        <div class="list">
          {timetable.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)).map((t) => (
            <div key={t.id} class="list-item">
              <Icon name="calendar" />
              <span class="grow"><span class="title">{DAY_NAMES[t.day - 1]} {t.start}–{t.end}</span><div class="sub">{[t.room, t.notes].filter(Boolean).join(' · ') || ' '}</div></span>
              <button class="icon-btn" aria-label="Delete lesson" onClick={() => svc.deleteTimetableEntry(t.id)}><Icon name="trash" /></button>
            </div>
          ))}
        </div>
      ) : <p class="small muted">No lessons yet. Add them here or import your whole timetable in Settings → Timetable.</p>}

      <div class="section"><h2>Manage</h2></div>
      <div class="row wrap">
        <a class="btn" href={`#/classes/${cls.id}/relief`}><Icon name="user" /> Relief pass</a>
        <button class="btn" onClick={archive}><Icon name="archive" /> {cls.archived ? 'Restore class' : 'Archive class'}</button>
        <button class="btn danger" onClick={remove}><Icon name="trash" /> Delete permanently</button>
      </div>

      {sheet === 'edit' && <ClassForm cls={cls} onClose={() => setSheet(null)} />}
      {sheet === 'student' && <StudentForm classId={cls.id} onClose={() => setSheet(null)} />}
      {sheet === 'import' && <RosterImport classId={cls.id} onClose={() => setSheet(null)} />}
      {sheet === 'lesson' && <LessonForm classId={cls.id} onClose={() => setSheet(null)} />}
    </div>
  );
}

export function LessonForm({ classId, onClose }: { classId?: string; onClose: () => void }) {
  const classes = useLive(() => db.classes.toArray().then((cs) => cs.filter((c) => !c.archived)), []);
  const [f, setF] = useState<Omit<TimetableEntry, 'id'>>({ classId: classId ?? '', day: 1, start: '09:00', end: '10:00', room: '', notes: '' });
  const set = (k: keyof typeof f) => (e: Event) => setF({ ...f, [k]: k === 'day' ? Number((e.target as HTMLSelectElement).value) : (e.target as HTMLInputElement).value });
  async function save() {
    if (!f.classId || f.end <= f.start) return toast('Choose a class and a finish time after the start time');
    await svc.saveTimetableEntry({ ...f, room: f.room?.trim() || undefined, notes: f.notes?.trim() || undefined });
    toast('Lesson added');
    onClose();
  }
  return (
    <Sheet title="Add a lesson" onClose={onClose}>
      {!classId && (
        <Field label="Class">
          <select class="input" value={f.classId} onChange={set('classId')}>
            <option value="">Choose…</option>
            {(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Day">
        <select class="input" value={f.day} onChange={set('day')}>{DAY_NAMES.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select>
      </Field>
      <div class="grid2">
        <Field label="Start"><input class="input" type="time" value={f.start} onInput={set('start')} /></Field>
        <Field label="Finish"><input class="input" type="time" value={f.end} onInput={set('end')} /></Field>
      </div>
      <Field label="Room"><input class="input" value={f.room} onInput={set('room')} /></Field>
      <Field label="Lesson notes / reminders"><input class="input" value={f.notes} onInput={set('notes')} placeholder="e.g. Collect permission notes" /></Field>
      <div class="actions"><button class="btn" onClick={onClose}>Cancel</button><button class="btn primary" onClick={save}>Save</button></div>
    </Sheet>
  );
}
