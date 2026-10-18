import { useEffect, useState } from 'preact/hooks';
import { db, saveSettings, sortedCategories } from '../../db';
import type { Question, ResponseOption, Settings } from '../../types';
import * as svc from '../../services';
import { parseTimetable, type TimetableRow } from '../../logic/importers';
import { loadDemoData } from '../../demo';
import {
  isNative, pickFile, readSpreadsheet, 
  requestPersistentStorage, showNotification, storageStatus
} from '../../platform';
import { DAY_NAMES, formatDate, today } from '../../lib/dates';
import { go, useLive, useSettings } from '../hooks';
import { Empty, Field, Icon, PageHead, Sheet, Switch, toast } from '../components';
import { PinSetup, PrivacyNotice } from '../Onboarding';
import { LessonForm } from './Classes';
import { saveFile, shareBlob } from '../../files';
import { saveSample } from '../../samples';
import { parseIcs, type IcsCandidate } from '../../logic/ics';
import { RecentFiles } from '../Files';
import { ReminderPrompt, turnOnReminders } from '../ReminderPrompt';
import { AccountSection, InviteSection } from '../Account';
import { saveProfile } from '../../cloud';

const SECTIONS: [string, string, string, string][] = [
  ['profile', 'Profile', 'user', 'Name, email and school'],
  ['account', 'Account & devices', 'devices', 'Sign in to use Pulse on your phone and PC'],
  ['invite', 'Invite a colleague', 'qr', 'QR code or email link to download and join'],
  ['checkins', 'Check-ins', 'check', 'Daily target, coverage and quick notes'],
  ['questions', 'Questions & categories', 'edit', 'Custom questions in the rotation'],
  ['timetable', 'Timetable', 'calendar', 'Import or edit your lessons'],
  ['reminders', 'Reminders', 'bell', 'Lesson, daily and ICP reminders'],
  ['security', 'PIN lock', 'lock', 'Protect the app with a PIN'],
  ['data', 'Data, backup & deletion', 'shield', 'Where data lives, backup, restore, delete'],
  ['privacy', 'Privacy notice', 'shield', 'How your data is handled'],
  ['about', 'About & install', 'today', 'Version, offline use and installation']
];

export function SettingsScreen({ section }: { section?: string; sub?: string }) {
  const settings = useSettings();
  if (!settings) return null;
  const title = SECTIONS.find((s) => s[0] === section)?.[1];
  if (!section || !title) {
    return (
      <div>
        <PageHead eyebrow="Settings" title="Settings" />
        <div class="list">
          {SECTIONS.map(([id, label, icon, sub]) => (
            <a key={id} class="list-item" href={`#/settings/${id}`}>
              <Icon name={icon} />
              <span class="grow"><span class="title">{label}</span><div class="sub">{sub}</div></span>
              <Icon name="chevron" />
            </a>
          ))}
          <button class="list-item" onClick={async () => { await saveSettings({ tutorialDone: false }); go("today"); }}>
            <Icon name="info" />
            <span class="grow"><span class="title">Replay the tour</span><div class="sub">Where everything is</div></span>
            <Icon name="chevron" />
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <PageHead eyebrow="Settings" title={title} back="#/settings" />
      {section === 'profile' && <ProfileSection s={settings} />}
      {section === 'account' && <AccountSection s={settings} />}
      {section === 'invite' && <InviteSection s={settings} />}
      {section === 'checkins' && <CheckinSection s={settings} />}
      {section === 'questions' && <QuestionsSection />}
      {section === 'timetable' && <TimetableSection />}
      {section === 'reminders' && <RemindersSection s={settings} />}
      {section === 'security' && <SecuritySection s={settings} />}
      {section === 'data' && <DataSection s={settings} />}
      {section === 'privacy' && <div class="card"><PrivacyNotice /></div>}
      {section === 'about' && <AboutSection s={settings} />}
    </div>
  );
}

function ProfileSection({ s }: { s: Settings }) {
  const [p, setP] = useState({ ...s.profile, school: s.profile.school ?? '' });
  const set = (k: keyof typeof p) => (e: Event) => { const v = (e.target as HTMLInputElement).value; setP((cur) => ({ ...cur, [k]: v })); };
  return (
    <div class="card">
      <Field label="Name"><input class="input" value={p.name} onInput={set('name')} /></Field>
      <Field label="Email address" hint="Pre-fills the 'Email draft' button in Reports and the account sign-in. The app never sends email itself."><input class="input" type="email" value={p.email} onInput={set('email')} /></Field>
      <Field label="School (optional)"><input class="input" value={p.school} onInput={set('school')} /></Field>
      <button class="btn primary" onClick={async () => { await saveSettings({ profile: p }); await saveProfile(p).catch(() => {}); toast('Profile saved'); }}>Save</button>
    </div>
  );
}

function CheckinSection({ s }: { s: Settings }) {
  const [tags, setTags] = useState(s.contextTags.join(', '));
  return (
    <div class="card">
      <Field label="Check-ins per class per day" hint="Can be overridden per class.">
        <input class="input" type="number" min={1} max={40} value={s.dailyTarget} onChange={(e) => saveSettings({ dailyTarget: Math.max(1, Math.min(40, Number((e.target as HTMLInputElement).value) || 5)) })} />
      </Field>
      <Field label="Coverage limit (days)" hint="A student not checked for this many days goes to the front of the queue, whatever their priority. Keep it larger than class size ÷ daily target × days between lessons.">
        <input class="input" type="number" min={3} max={60} value={s.maxGapDays} onChange={(e) => saveSettings({ maxGapDays: Math.max(3, Math.min(60, Number((e.target as HTMLInputElement).value) || 14)) })} />
      </Field>
      <Switch label="Move to the next student automatically" hint="After every question for a student is answered." checked={s.autoAdvance} onChange={(v) => saveSettings({ autoAdvance: v })} />
      <Field label="Quick context tags" hint="Comma separated. Shown when adding detail to an answer.">
        <input class="input" value={tags} onInput={(e) => setTags((e.target as HTMLInputElement).value)} onBlur={() => saveSettings({ contextTags: tags.split(',').map((t) => t.trim()).filter(Boolean) })} />
      </Field>
    </div>
  );
}

/* ---------------- Questions ---------------- */

const FREQS: [number, string][] = [[0, 'Every check-in'], [7, 'Weekly'], [14, 'Fortnightly'], [28, 'Every 4 weeks']];

function QuestionsSection() {
  const data = useLive(async () => ({ questions: (await db.questions.toArray()).sort((a, b) => a.order - b.order), categories: await sortedCategories(), classes: await db.classes.toArray() }), []);
  const [editing, setEditing] = useState<Question | 'new' | null>(null);
  if (!data) return null;
  const cat = (id: string) => data.categories.find((c) => c.id === id)?.name ?? id;
  return (
    <div>
      <p class="small muted">Questions are asked during each student check-in. Custom questions join the rotation according to their frequency, and get the same contextual follow-ups as the core three.</p>
      <div class="list">
        {data.questions.map((q) => (
          <div key={q.id} class="list-item">
            <span class="grow" onClick={() => setEditing(q)} style="cursor:pointer">
              <span class="title">{q.text.replace(/\{name\}/g, '…')}</span>
              <div class="sub">{cat(q.categoryId)} · {FREQS.find((f) => f[0] === q.frequencyDays)?.[1] ?? `Every ${q.frequencyDays} days`}{q.classIds.length ? ` · ${q.classIds.map((id) => data.classes.find((c) => c.id === id)?.name).filter(Boolean).join(', ')}` : ' · All classes'}{q.studentIds.length ? ` · ${q.studentIds.length} students` : ''}{q.builtIn ? ' · Core' : ''}</div>
            </span>
            <label class="switch" style="padding:0"><input type="checkbox" aria-label="Enabled" checked={q.enabled} onChange={(e) => db.questions.update(q.id, { enabled: (e.target as HTMLInputElement).checked })} /></label>
          </div>
        ))}
      </div>
      <button class="btn primary" onClick={() => setEditing('new')}><Icon name="plus" /> New question</button>
      {editing && <QuestionForm q={editing === 'new' ? undefined : editing} categories={data.categories} classes={data.classes} onClose={() => setEditing(null)} />}
    </div>
  );
}

function QuestionForm({ q, categories, classes, onClose }: { q?: Question; categories: { id: string; name: string }[]; classes: { id: string; name: string; archived: boolean }[]; onClose: () => void }) {
  const students = useLive(() => db.students.toArray(), []);
  const [f, setF] = useState({
    text: q?.text ?? '', categoryId: q?.categoryId ?? categories[0]?.id ?? 'focus', options: q?.options ?? [
      { label: 'As expected', level: 0 }, { label: 'Some difficulty', level: 1 }, { label: 'Significant difficulty', level: 2 }, { label: 'Not observed / unsure', level: null }
    ] as ResponseOption[],
    allowDetail: q?.allowDetail ?? true, classIds: q?.classIds ?? [], studentIds: q?.studentIds ?? [], frequencyDays: q?.frequencyDays ?? 7
  });
  const [newCat, setNewCat] = useState('');
  const builtIn = !!q?.builtIn;
  const toggle = (l: string[], id: string) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]);
  const scopedStudents = (students ?? []).filter((s) => !s.archived && (!f.classIds.length || f.classIds.includes(s.classId))).sort((a, b) => a.lastName.localeCompare(b.lastName));

  async function save() {
    if (!f.text.trim()) return toast('Enter the question text');
    if (f.options.filter((o) => o.label.trim()).length < 2) return toast('Add at least two response options');
    let categoryId = f.categoryId;
    if (categoryId === '__new') {
      if (!newCat.trim()) return toast('Name the new category');
      categoryId = (await svc.saveCategory(newCat)).id;
    }
    await svc.saveQuestion({ ...q, ...f, categoryId, options: f.options.filter((o) => o.label.trim()) });
    toast('Question saved');
    onClose();
  }
  async function remove() {
    if (!q || !confirm('Delete this question?')) return;
    const r = await svc.deleteQuestion(q.id);
    toast(r === 'deleted' ? 'Question deleted' : 'It has history, so it was disabled instead');
    onClose();
  }

  return (
    <Sheet title={q ? 'Edit question' : 'New question'} onClose={onClose}>
      <Field label="Question" hint="Use {name} where the student's name should appear."><input class="input" value={f.text} onInput={(e) => setF({ ...f, text: (e.target as HTMLInputElement).value })} placeholder="Did {name} bring the required equipment?" /></Field>
      {!builtIn && (
        <Field label="Category">
          <select class="input" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: (e.target as HTMLSelectElement).value })}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__new">+ New category…</option>
          </select>
        </Field>
      )}
      {f.categoryId === '__new' && <Field label="New category name"><input class="input" value={newCat} onInput={(e) => setNewCat((e.target as HTMLInputElement).value)} placeholder="e.g. Organisation" /></Field>}
      <span class="eyebrow">Response options</span>
      {f.options.map((o, i) => (
        <div class="row" key={i} style="margin-bottom:6px">
          <input class="input grow" value={o.label} onInput={(e) => setF({ ...f, options: f.options.map((x, j) => (j === i ? { ...x, label: (e.target as HTMLInputElement).value } : x)) })} />
          <select class="input" style="width:auto" disabled={builtIn} value={o.level === null ? 'n' : String(o.level)} onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            setF({ ...f, options: f.options.map((x, j) => (j === i ? { ...x, level: v === 'n' ? null : (Number(v) as 0 | 1 | 2) } : x)) });
          }}>
            <option value="0">As expected</option><option value="1">Some difficulty</option><option value="2">Significant</option><option value="n">Not rated</option>
          </select>
          {!builtIn && <button class="icon-btn" aria-label="Remove option" onClick={() => setF({ ...f, options: f.options.filter((_, j) => j !== i) })}><Icon name="x" /></button>}
        </div>
      ))}
      {!builtIn && f.options.length < 6 && <button class="btn small ghost" onClick={() => setF({ ...f, options: [...f.options, { label: '', level: 0 }] })}><Icon name="plus" /> Option</button>}
      <p class="tiny muted">The rating behind each option drives follow-ups and trends. “Not rated” answers never count as difficulty.</p>
      <Switch label="Allow optional detail" checked={f.allowDetail} onChange={(v) => setF({ ...f, allowDetail: v })} />
      <Field label="How often per student">
        <select class="input" value={f.frequencyDays} onChange={(e) => setF({ ...f, frequencyDays: Number((e.target as HTMLSelectElement).value) })}>
          {FREQS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
        </select>
      </Field>
      <span class="eyebrow">Applies to classes (none ticked = all)</span>
      {classes.filter((c) => !c.archived).map((c) => (
        <label class="check" key={c.id}><input type="checkbox" checked={f.classIds.includes(c.id)} onChange={() => setF({ ...f, classIds: toggle(f.classIds, c.id), studentIds: [] })} /><span>{c.name}</span></label>
      ))}
      <details style="margin:6px 0 10px">
        <summary class="small">Only for specific students ({f.studentIds.length ? `${f.studentIds.length} selected` : 'everyone'})</summary>
        <div style="max-height:220px;overflow:auto">
          {scopedStudents.map((s) => (
            <label class="check" key={s.id}><input type="checkbox" checked={f.studentIds.includes(s.id)} onChange={() => setF({ ...f, studentIds: toggle(f.studentIds, s.id) })} /><span>{s.preferredName || s.firstName} {s.lastName}</span></label>
          ))}
        </div>
      </details>
      <div class="actions">
        {q && !builtIn && <button class="btn danger" onClick={remove}><Icon name="trash" /></button>}
        <button class="btn" onClick={onClose}>Cancel</button>
        <button class="btn primary" onClick={save}>Save</button>
      </div>
    </Sheet>
  );
}

/* ---------------- Timetable ---------------- */

function TimetableSection() {
  const data = useLive(async () => ({ timetable: await db.timetable.toArray(), classes: await db.classes.toArray() }), []);
  const [rows, setRows] = useState<TimetableRow[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [opts, setOpts] = useState({ replace: true, createMissing: true });
  const [adding, setAdding] = useState(false);
  const [ics, setIcs] = useState<IcsCandidate[] | null>(null);
  if (!data) return null;
  const name = (id: string) => data.classes.find((c) => c.id === id)?.name ?? '?';

  async function choose() {
    const file = await pickFile('.csv,.xlsx,.xls,text/csv');
    if (!file) return;
    try {
      const r = parseTimetable(await readSpreadsheet(file));
      setRows(r.rows);
      setErrors(r.errors);
    } catch (e) {
      setErrors([`Could not read the file: ${(e as Error).message}`]);
    }
  }
  async function confirmImport() {
    if (!rows) return;
    const r = await svc.importTimetable(rows, opts);
    toast(`Imported ${r.added} lessons${r.created.length ? `, created ${r.created.length} classes` : ''}${r.unmatched.length ? `; no class found for: ${r.unmatched.join(', ')}` : ''}`);
    setRows(null);
  }

  return (
    <div>
      <div class="card">
        <span class="eyebrow">Import from CSV or Excel</span>
        <p class="small muted">Columns: <b>Class</b>, <b>Day</b> (Mon or Monday), <b>Start</b>, <b>End</b> (or one <b>Time</b> column like 09:00-10:00), optional <b>Room</b> and <b>Notes</b>. Class names are matched to your classes.</p>
        <div class="row wrap">
          <button class="btn primary" onClick={choose}><Icon name="upload" /> Choose file</button>
          <button class="btn ghost small" onClick={() => saveSample('timetable')}>Get a sample timetable</button>
        </div>
        <div class="row wrap" style="margin-top:10px">
          <button class="btn" onClick={async () => { const f = await pickFile('.ics,text/calendar'); if (f) setIcs(parseIcs(await f.text())); }}><Icon name="calendar" /> Import from Outlook (.ics)</button>
        </div>
        {errors.map((e) => <p key={e} class="small" style="color:var(--sig);margin:6px 0 0">{e}</p>)}
        {rows && (
          <div style="margin-top:12px">
            <p class="small"><b>{rows.length} lessons</b> ready to import.</p>
            <Switch label="Replace the existing timetable" checked={opts.replace} onChange={(v) => setOpts({ ...opts, replace: v })} />
            <Switch label="Create classes that don't exist yet" checked={opts.createMissing} onChange={(v) => setOpts({ ...opts, createMissing: v })} />
            <div class="actions"><button class="btn" onClick={() => setRows(null)}>Cancel</button><button class="btn primary" onClick={confirmImport}>Import</button></div>
          </div>
        )}
      </div>
      <div class="section"><h2>Weekly timetable</h2><button class="btn small" onClick={() => setAdding(true)}><Icon name="plus" /> Lesson</button></div>
      {data.timetable.length ? DAY_NAMES.map((d, i) => {
        const lessons = data.timetable.filter((t) => t.day === i + 1).sort((a, b) => a.start.localeCompare(b.start));
        if (!lessons.length) return null;
        return (
          <div key={d}>
            <div class="timeline-day">{d}</div>
            <div class="list">
              {lessons.map((t) => (
                <div key={t.id} class="list-item">
                  <span class="mono small" style="width:96px">{t.start}–{t.end}</span>
                  <span class="grow"><span class="title">{name(t.classId)}</span><div class="sub">{[t.room, t.notes].filter(Boolean).join(' · ') || ' '}</div></span>
                  <button class="icon-btn" aria-label="Delete lesson" onClick={() => svc.deleteTimetableEntry(t.id)}><Icon name="trash" /></button>
                </div>
              ))}
            </div>
          </div>
        );
      }) : <div class="card"><Empty icon="calendar">No lessons yet. With a timetable, Today opens the class you're teaching and reminders know when to prompt you.</Empty></div>}
      {data.timetable.length > 0 && <button class="btn danger small" onClick={() => confirm('Remove every lesson from the timetable?') && db.timetable.clear()}>Clear timetable</button>}
      {adding && <LessonForm onClose={() => setAdding(false)} />}
      {ics && <IcsImport candidates={ics} classes={data.classes.filter((c) => !c.archived)} onClose={() => setIcs(null)} />}
    </div>
  );
}

/* ---------------- Reminders ---------------- */

function RemindersSection({ s }: { s: Settings }) {
  const r = s.reminders;
  const set = (patch: Partial<Settings['reminders']>) => saveSettings({ reminders: { ...r, ...patch } });
  return (
    <div>
      <div class="card">
        <span class="eyebrow">Notifications</span>
        <p class="small muted">Get a nudge before each class, after it, and once a day.{isNative() ? ' They arrive even when Pulse is closed.' : ' In a browser they only arrive while Pulse is open; the Android app gets them any time.'}</p>
        <ReminderPrompt />
        <Switch label="Reminders on" checked={r.enabled} onChange={async (v) => {
          if (v) {
            const st = await turnOnReminders();
            if (st !== 'granted') toast('Notifications aren’t allowed yet. In-app reminders still work.');
          } else set({ enabled: false });
        }} />
        <Field label="Before each lesson">
          <select class="input" value={r.beforeLessonMin ?? 'off'} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; set({ beforeLessonMin: v === 'off' ? null : Number(v) }); }}>
            <option value="off">Off</option><option value="0">At the start</option><option value="5">5 minutes before</option><option value="10">10 minutes before</option><option value="15">15 minutes before</option>
          </select>
        </Field>
        <Switch label="After each lesson" hint="A nudge to finish any remaining check-ins." checked={r.afterLesson} onChange={(v) => set({ afterLesson: v })} />
        <Field label="Daily check-in reminder">
          <input class="input" type="time" value={r.dailyTime ?? ''} onInput={(e) => set({ dailyTime: (e.target as HTMLInputElement).value || null })} />
        </Field>
        <Switch label="Include ICP reminders" checked={r.icp} onChange={(v) => set({ icp: v })} />
        <div class="grid2">
          <Field label="Quiet hours from"><input class="input" type="time" value={r.quietStart} onInput={(e) => set({ quietStart: (e.target as HTMLInputElement).value })} /></Field>
          <Field label="Until"><input class="input" type="time" value={r.quietEnd} onInput={(e) => set({ quietEnd: (e.target as HTMLInputElement).value })} /></Field>
        </div>
        <button class="btn small" onClick={async () => {
          if (isNative()) {
            const { testNativeNotification } = await import('../../native');
            await testNativeNotification();
          } else await showNotification('Solaristic Pulse', 'Test reminder: notifications are working.');
          toast('Test sent (if notifications are allowed)');
        }}><Icon name="bell" /> Send a test notification</button>
      </div>
    </div>
  );
}

/* ---------------- Security ---------------- */

function SecuritySection({ s }: { s: Settings }) {
  const [changing, setChanging] = useState(false);
  return (
    <div class="card">
      <p class="small muted">The PIN is required when the app opens and after it has been in the background. It deters casual access; it does <b>not</b> encrypt data stored on the device. If you forget it, the only option is to erase the app's data (then restore from a backup).</p>
      <p><b>Status:</b> {s.pin ? 'PIN is set' : 'No PIN'}</p>
      {changing ? <PinSetup onDone={() => { setChanging(false); toast('PIN saved'); }} onSkip={() => setChanging(false)} /> : (
        <div class="row wrap">
          <button class="btn primary" onClick={() => setChanging(true)}>{s.pin ? 'Change PIN' : 'Set a PIN'}</button>
          {s.pin && <button class="btn danger" onClick={async () => { if (confirm('Remove the PIN?')) { await saveSettings({ pin: undefined }); toast('PIN removed'); } }}>Remove PIN</button>}
        </div>
      )}
      <div class="divider" />
      <Field label="Lock again after the app has been in the background for">
        <select class="input" value={s.lockAfterMin} onChange={(e) => saveSettings({ lockAfterMin: Number((e.target as HTMLSelectElement).value) })}>
          <option value="0">Immediately</option><option value="1">1 minute</option><option value="5">5 minutes</option><option value="15">15 minutes</option><option value="60">1 hour</option>
        </select>
      </Field>
    </div>
  );
}

/* ---------------- Data ---------------- */

function DataSection({ s }: { s: Settings }) {
  const [st, setSt] = useState<{ persisted: boolean | null; usage?: number; quota?: number } | null>(null);
  const counts = useLive(async () => ({ classes: await db.classes.count(), students: await db.students.count(), observations: await db.observations.count(), icp: await db.icpChecks.count() }), []);
  useEffect(() => { storageStatus().then(setSt); }, []);
  const mb = (n?: number) => (n === undefined ? '?' : `${(n / 1_048_576).toFixed(1)} MB`);

  async function backup(share: boolean) {
    const data = await svc.createBackup();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const name = `solaristic-pulse-backup_${today()}.json`;
    if (!share || !(await shareBlob(blob, name, 'Solaristic Pulse backup'))) await saveFile(blob, name, 'backup');
    await saveSettings({ lastBackupAt: Date.now() });
    toast('Backup created');
  }
  async function restore() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm(`Restore "${file.name}"? This REPLACES all data currently in the app with the backup's contents.`)) return;
      await svc.restoreBackup(data);
      toast('Backup restored');
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      alert(`Restore failed: ${(e as Error).message}`);
    }
  }
  async function wipe() {
    const a = prompt('This permanently deletes ALL classes, students, observations, ICP records, settings and the PIN from this device. Download a backup first if you may need the data.\n\nType DELETE to confirm.');
    if (a?.trim().toUpperCase() !== 'DELETE') return;
    await svc.deleteAllData();
    location.hash = '#/today';
    location.reload();
  }
  async function demo() {
    if ((counts?.classes ?? 0) > 0 && !confirm('Add the fictional demo classes alongside your existing data?')) return;
    await loadDemoData();
    toast('Demo data loaded');
    go('today');
  }

  return (
    <div>
      <div class="card">
        <span class="eyebrow">Where your data is stored</span>
        <p class="small">On this device only, in the app's local database (IndexedDB){isNative() ? ' inside the Android app' : ' for this browser and web address'}. It is not synced or uploaded, and it is <b>not encrypted</b> by the app.</p>
        <p class="small muted">{counts ? `${counts.classes} classes · ${counts.students} students · ${counts.observations} observations · ${counts.icp} ICP records` : ''}{st?.usage !== undefined ? ` · using ${mb(st.usage)}` : ''}</p>
        <p class="small">Protected from automatic clean-up: <b>{st?.persisted === null ? 'unknown' : st?.persisted ? 'yes' : 'no'}</b>{' '}
          {st && !st.persisted && <button class="btn small ghost" onClick={async () => { await requestPersistentStorage(); setSt(await storageStatus()); }}>Request</button>}
        </p>
      </div>
      <div class="card">
        <span class="eyebrow">Backup & restore</span>
        <p class="small">Last backup: <b>{s.lastBackupAt ? formatDate(new Date(s.lastBackupAt).toISOString().slice(0, 10)) : 'never'}</b>. Backups are complete JSON files (not encrypted). Store them according to school policy.</p>
        <div class="row wrap">
          <button class="btn primary" onClick={() => backup(false)}><Icon name="download" /> Download backup</button>
          <button class="btn" onClick={() => backup(true)}><Icon name="share" /> Save / share backup</button>
          <button class="btn" onClick={restore}><Icon name="upload" /> Restore from backup</button>
        </div>
      </div>
      <RecentFiles />
      <div class="card">
        <span class="eyebrow">Demo data</span>
        <p class="small muted">Three invented classes with four weeks of history. All names are fictional.</p>
        <button class="btn" onClick={demo}>Load fictional demo data</button>
      </div>
      <div class="card">
        <span class="eyebrow">Delete data</span>
        <p class="small muted">Individual students and classes can be archived (history kept) or deleted from their own pages. This removes everything.</p>
        <button class="btn danger" onClick={wipe}><Icon name="trash" /> Delete all data on this device</button>
      </div>
    </div>
  );
}

function AboutSection({ s }: { s: Settings }) {
  return (
    <>
    <div class="card">
      <span class="eyebrow">Developer tools</span>
      <Switch label="Show the “+1 day” test button" hint="Moves the app’s date forward to try follow-ups, rotation and overdue reminders. Records you make while testing are dated on the simulated day, so use it with test or demo data." checked={s.devTools !== false} onChange={(v) => saveSettings({ devTools: v })} />
    </div>
    <div class="card small stack">
      <p><b>Solaristic Pulse</b> v{__APP_VERSION__}: offline classroom check-ins.</p>
      <p><b>Works offline.</b> After the first load (or installing the Android app), everything runs on this device with no internet connection. Nothing in the app requires internet access; signing in (Settings → Account & devices) is optional and only needs a connection while you sign in.</p>
      <p><b>Install on Android.</b> Use the Solaristic Pulse APK, or in Chrome open the app's web address and choose <i>Install app</i> / <i>Add to Home screen</i>.</p>
      <p><b>iPhone / iPad.</b> Open the web address in Safari → Share → <i>Add to Home Screen</i>. Scheduled notifications are not available there; in-app reminders are.</p>
      <p><b>Dictation.</b> Use your keyboard's microphone button in any note field. Depending on your keyboard settings, dictation may be processed by your keyboard provider rather than on the device.</p>
      <p class="muted">Selection, follow-ups and trends use simple, deterministic rules on this device. No AI service is used.</p>
    </div>
    </>
  );
}

/** Review an Outlook calendar export: tick the events that are classes and match them to classes. */
function IcsImport({ candidates, classes, onClose }: { candidates: IcsCandidate[]; classes: { id: string; name: string }[]; onClose: () => void }) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const guess = (summary: string) => classes.find((c) => norm(summary).includes(norm(c.name)) || norm(c.name).includes(norm(summary)))?.name ?? `new:${summary}`;
  const [rows, setRows] = useState(candidates.map((c) => ({ c, include: c.recurring, target: guess(c.summary) })));
  const [replace, setReplace] = useState(true);
  const chosen = rows.filter((r) => r.include);
  const slotText = (c: IcsCandidate) => c.slots.map((s) => `${DAY_NAMES[s.day - 1].slice(0, 3)} ${s.start}`).join(', ');

  async function doImport() {
    const tt: TimetableRow[] = chosen.flatMap((r) => r.c.slots.map((s) => ({
      className: r.target.startsWith('new:') ? r.target.slice(4) : r.target, day: s.day, start: s.start, end: s.end, room: s.room
    })));
    const res = await svc.importTimetable(tt, { replace, createMissing: true });
    toast(`Imported ${res.added} lessons${res.created.length ? ` and ${res.created.length} new class${res.created.length === 1 ? '' : 'es'}` : ''}`);
    onClose();
  }

  return (
    <Sheet title="Import from Outlook" onClose={onClose}>
      {!candidates.length ? <p class="small">No timed events were found in that file.</p> : (
        <>
          <p class="small muted" style="margin-top:0">Tick the events that are your classes. Repeating events and lessons that occur at the same time each week are ticked for you.</p>
          <div class="card flat" style="padding:2px 12px">
            {rows.map((r, i) => (
              <div key={r.c.summary} class="ics-row">
                <label class="check" style="padding:0"><input type="checkbox" checked={r.include} onChange={() => setRows(rows.map((x, j) => (j === i ? { ...x, include: !x.include } : x)))} />
                  <span><b>{r.c.summary}</b><div class="tiny muted">{slotText(r.c)}{r.c.slots[0]?.room ? ` · ${r.c.slots[0].room}` : ''}</div></span></label>
                {r.include && (
                  <select class="input" style="margin-top:6px" value={r.target} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, target: (e.target as HTMLSelectElement).value } : x)))}>
                    <option value={`new:${r.c.summary}`}>New class: {r.c.summary}</option>
                    {classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
          <Switch label="Replace my current timetable" checked={replace} onChange={setReplace} />
          <div class="actions"><button class="btn" onClick={onClose}>Cancel</button><button class="btn primary" disabled={!chosen.length} onClick={doImport}>Import {chosen.length} class{chosen.length === 1 ? '' : 'es'}</button></div>
        </>
      )}
      <details class="small" style="margin-top:12px">
        <summary>How to export from Outlook</summary>
        <p><b>Outlook on Windows:</b> open your calendar → File → Save Calendar → choose a date range that covers a full week of lessons (a term is best) → Save. This creates an .ics file.</p>
        <p><b>Outlook on the web:</b> Settings → Calendar → Shared calendars → Publish a calendar → copy the ICS link, open it in your browser to download the file.</p>
        <p class="muted">This is a one-off import done on this device; re-import if your timetable changes.</p>
      </details>
    </Sheet>
  );
}
