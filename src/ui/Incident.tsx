// Serious incidents (one fast screen, mostly pre-filled), the report pack, email drafts and
// follow-up tasks. The school's own system is the official record; this is the teacher's working copy.

import { useEffect, useState } from 'preact/hooks';
import type { FollowUp, Incident, IncidentContextItem, Student } from '../types';
import * as svc from '../services';
import { db } from '../db';
import { ISSUE_AREAS } from '../config/checkin';
import { ACTION_CHIPS, DEFAULT_WHERE, DUE_CHIPS, INCIDENT_TASKS, SAFETY_BANNER, STAFF_ROLES, WELLBEING_WARNING, WHAT_HINT, type DueChip } from '../config/incidents';
import { homeDraft, homeDraftGeneral, mailto, openTodayText, reportPack, staffDraft, type Draft } from '../logic/incidents';
import { formatDate, nowMs, relativeDay, today, toISODate } from '../lib/dates';
import { saveFile } from '../files';
import { shareText } from '../platform';
import { isRelief } from '../relief/device';
import { go, useLive, useSettings } from './hooks';
import { displayName, Icon, Sheet, toast } from './components';

/* ---------- Starting from the issue screen ---------- */

/** What the issue screen hands over (areas already ticked, the note, the check-in it came from). */
export interface IncidentPrefill { areas: Record<string, string[]>; note?: string; checkinId?: string; others?: string[] }
let prefill: { key: string; value: IncidentPrefill } | null = null;
export function startIncident(classId: string, studentId: string, value: IncidentPrefill) {
  prefill = { key: `${classId}|${studentId}`, value };
  go(`class/${classId}/incident/${studentId}`);
}

const hhmm = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed. Select the text and copy it instead.'); }
}

/* ---------- A2. Lodging a serious incident ---------- */

export function IncidentForm({ classId, studentId }: { classId: string; studentId: string }) {
  const relief = isRelief();
  const settings = useSettings();
  const [pre] = useState(() => (prefill?.key === `${classId}|${studentId}` ? prefill.value : null));
  const start = useLive(() => svc.incidentStart(classId, studentId, pre?.checkinId), [classId, studentId]);
  const [f, setF] = useState<Omit<svc.IncidentInput, 'studentId' | 'classId' | 'context'> | null>(null);
  const [context, setContext] = useState<IncidentContextItem[]>([]);
  const [saved, setSaved] = useState<Incident | null>(null);

  useEffect(() => {
    if (!start || f) return;
    const now = nowMs();
    setF({
      date: toISODate(new Date(now)), time: hhmm(now), lessonId: start.ctx.lesson?.id, intention: start.ctx.lesson?.intention,
      areas: pre?.areas ?? {}, what: pre?.note ?? '', where: DEFAULT_WHERE, others: pre?.others ?? [], witnesses: '', actions: [], actionNote: ''
    });
    // A relief teacher never sees past records, so no context is compiled on their device.
    setContext(relief ? [] : start.context);
    prefill = null;
  }, [start]);

  if (start === null) return <p class="muted">Student not found.</p>;
  if (!start || !f || !settings) return null;
  if (saved) return <IncidentTasksOffer incident={saved} student={start.student} />;
  const s = start.student;
  const classmates = start.ctx.students.filter((x) => x.id !== s.id);
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const toggleArea = (id: string) => { const a = { ...f.areas }; if (a[id]) delete a[id]; else a[id] = []; set({ areas: a }); };
  const toggleSub = (id: string, sub: string) => { const cur = f.areas[id] ?? []; set({ areas: { ...f.areas, [id]: cur.includes(sub) ? cur.filter((x) => x !== sub) : [...cur, sub] } }); };
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function save() {
    // On a relief phone the "Relief: name" tag is added when the class teacher's phone brings it in.
    const i = await svc.saveIncident({ ...f!, studentId, classId, context });
    if (relief) { toast('Incident saved. It goes to the class teacher.'); go(`class/${classId}`); return; }
    setSaved(i);
  }

  return (
    <div class="incident">
      <div class="row between"><a class="link-btn back-btn" href={`#/class/${classId}`}><Icon name="back" /> {start.ctx.cls.name}</a><span class="tiny muted mono">Serious incident</span></div>
      <div class="safety-banner" role="alert"><Icon name="alert" /> <span>{SAFETY_BANNER}</span></div>
      <h1 style="margin:10px 0 2px">{displayName(s)}</h1>
      <p class="small muted" style="margin:0 0 12px">{start.ctx.cls.name}{f.intention ? ` · ${f.intention}` : ''}</p>

      <div class="grid2">
        <label class="field"><span>Date</span><input class="input" type="date" value={f.date} onInput={(e) => set({ date: (e.target as HTMLInputElement).value })} /></label>
        <label class="field"><span>Time</span><input class="input" type="time" value={f.time} onInput={(e) => set({ time: (e.target as HTMLInputElement).value })} /></label>
      </div>
      <label class="field"><span>Where</span><input class="input" value={f.where} onInput={(e) => set({ where: (e.target as HTMLInputElement).value })} /></label>

      <h3 class="inc-h">What happened</h3>
      <div class="chips" style="flex-wrap:wrap">
        {ISSUE_AREAS.map((a) => <button key={a.id} class={`chip small ${f.areas[a.id] ? 'active' : ''}`} aria-pressed={!!f.areas[a.id]} onClick={() => toggleArea(a.id)}>{a.name}</button>)}
      </div>
      {ISSUE_AREAS.filter((a) => f.areas[a.id]).map((a) => (
        <div key={a.id} class="chips inc-subs" style="flex-wrap:wrap">
          {a.subs.map((sub) => <button key={sub.id} class={`chip tiny-chip ${f.areas[a.id]!.includes(sub.id) ? 'active' : ''}`} onClick={() => toggleSub(a.id, sub.id)}>{sub.label}</button>)}
        </div>
      ))}
      <textarea class="input" rows={4} value={f.what} placeholder={WHAT_HINT} onInput={(e) => set({ what: (e.target as HTMLTextAreaElement).value })} />
      <p class="tiny muted" style="margin:4px 0 0">{WHAT_HINT}</p>

      <h3 class="inc-h">Others involved <span class="tiny muted">(optional)</span></h3>
      <div class="chips" style="flex-wrap:wrap">
        {classmates.map((x) => <button key={x.id} class={`chip tiny-chip ${f.others.includes(x.id) ? 'active' : ''}`} aria-pressed={f.others.includes(x.id)} onClick={() => set({ others: toggle(f.others, x.id) })}>{displayName(x)}</button>)}
      </div>
      <label class="field"><span>Witnesses <span class="tiny muted">(optional)</span></span><input class="input" value={f.witnesses ?? ''} onInput={(e) => set({ witnesses: (e.target as HTMLInputElement).value })} /></label>

      <h3 class="inc-h">Action taken</h3>
      <div class="chips" style="flex-wrap:wrap">
        {ACTION_CHIPS.map((a) => <button key={a.id} class={`chip small ${f.actions.includes(a.id) ? 'active' : ''}`} aria-pressed={f.actions.includes(a.id)} onClick={() => set({ actions: toggle(f.actions, a.id) })}>{a.label}</button>)}
      </div>
      <input class="input" style="margin-top:8px" value={f.actionNote ?? ''} placeholder="Anything else you did" onInput={(e) => set({ actionNote: (e.target as HTMLInputElement).value })} />

      {!relief && (
        <>
          <h3 class="inc-h">Context <span class="tiny muted">(tick what goes in the report)</span></h3>
          {context.length ? context.map((c) => (
            <label key={c.id} class={`check-row ctx-row ${c.kind === 'wellbeing' ? 'sensitive' : ''}`}>
              <input type="checkbox" checked={c.include} onChange={(e) => { const v = (e.target as HTMLInputElement).checked; setContext(context.map((x) => (x.id === c.id ? { ...x, include: v } : x))); }} />
              <span>{c.date ? <b class="tiny mono">{c.date.slice(5).split('-').reverse().join('/')} </b> : null}{c.text}{c.kind === 'wellbeing' && <span class="tiny warn-text"> {WELLBEING_WARNING}</span>}{c.kind === 'icpTitles' && <span class="tiny muted"> (only if needed)</span>}</span>
            </label>
          )) : <p class="small muted">Nothing else recorded for {s.preferredName || s.firstName} in this class in the last 4 weeks.</p>}
        </>
      )}

      <div class="actions" style="margin-top:16px">
        <a class="btn" href={`#/class/${classId}`}>Cancel</a>
        <button class="btn primary" disabled={!f.what.trim() && !Object.keys(f.areas).length} onClick={save}><Icon name="check" /> Save incident</button>
      </div>
    </div>
  );
}

/* ---------- A3. Offering the follow-ups ---------- */

function DuePicker({ value, onChange }: { value: DueChip | number; onChange: (v: DueChip | number) => void }) {
  const custom = typeof value === 'number';
  return (
    <div class="chips due-chips" style="flex-wrap:wrap">
      {DUE_CHIPS.map((d) => <button key={d.id} class={`chip tiny-chip ${value === d.id ? 'active' : ''}`} onClick={() => onChange(d.id)}>{d.label}</button>)}
      <label class={`chip tiny-chip ${custom ? 'active' : ''}`}>Custom <input type="datetime-local" class="due-custom" value={custom ? new Date(value - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ''} onInput={(e) => { const v = (e.target as HTMLInputElement).value; if (v) onChange(new Date(v).getTime()); }} /></label>
    </div>
  );
}

function IncidentTasksOffer({ incident, student }: { incident: Incident; student: Student }) {
  const [picks, setPicks] = useState(INCIDENT_TASKS.map((t) => ({ kind: t.kind, on: true, due: t.due as DueChip | number, role: t.kind === 'staff' ? STAFF_ROLES[0] : undefined })));
  async function add() {
    await svc.addIncidentTasks(incident, picks.filter((p) => p.on).map(({ kind, due, role }) => ({ kind, due, ...(role ? { role } : {}) })));
    toast('Incident saved');
    go(`incident/${incident.id}`);
  }
  return (
    <div class="incident">
      <h1 style="margin:10px 0 4px">Incident saved</h1>
      <p class="small muted" style="margin:0 0 12px">Follow-ups for {student.preferredName || student.firstName}. Untick any you don't need, and pick when each is due. You'll get a reminder then.</p>
      {picks.map((p, i) => {
        const t = INCIDENT_TASKS[i];
        const upd = (patch: Partial<typeof p>) => setPicks(picks.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        return (
          <div key={t.kind} class="card task-offer">
            <label class="check-row"><input type="checkbox" checked={p.on} onChange={(e) => upd({ on: (e.target as HTMLInputElement).checked })} /> <b>{t.title}</b></label>
            {p.on && t.kind === 'staff' && (
              <div class="chips" style="flex-wrap:wrap;margin:6px 0">{STAFF_ROLES.map((r) => <button key={r} class={`chip tiny-chip ${p.role === r ? 'active' : ''}`} onClick={() => upd({ role: r })}>{r}</button>)}</div>
            )}
            {p.on && <DuePicker value={p.due} onChange={(due) => upd({ due })} />}
          </div>
        );
      })}
      <div class="actions" style="margin-top:12px">
        <button class="btn" onClick={() => go(`incident/${incident.id}`)}>Skip</button>
        <button class="btn primary" onClick={add}><Icon name="check" /> Add follow-ups</button>
      </div>
    </div>
  );
}

/* ---------- A4. Report pack and email drafts ---------- */

function printable(title: string, sections: { heading: string; lines: string[] }[]) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#111}h1{font-size:20px}h2{font-size:15px;margin:18px 0 4px;border-bottom:1px solid #ccc}p{margin:2px 0}</style></head><body><h1>${esc(title)}</h1>${sections.map((s) => `<h2>${esc(s.heading)}</h2>${s.lines.map((l) => `<p>${esc(l)}</p>`).join('')}`).join('')}<p style="margin-top:24px;color:#666;font-size:12px">Working copy from Solaristic Radar. The school's own system is the official record.</p></body></html>`;
}

/** An email draft: the teacher sends it from their own email app. The address is never saved. */
export function DraftBox({ draft, task, label }: { draft: Draft; task?: FollowUp; label: string }) {
  const [to, setTo] = useState('');
  return (
    <div class="card draft-box">
      <div class="row between"><b>{label}</b>{task && <span class={`badge ${task.status === 'todo' ? 'blue' : 'ok'}`}>{task.status === 'todo' ? 'To send' : 'Done'}</span>}</div>
      <input class="input" type="email" placeholder="Email address (not saved)" value={to} onInput={(e) => setTo((e.target as HTMLInputElement).value)} style="margin:8px 0" />
      <p class="tiny muted" style="margin:0">Subject: {draft.subject}</p>
      <pre class="draft-text">{draft.body}</pre>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <a class="btn small primary" href={mailto(draft, to)}><Icon name="mail" /> Open in email</a>
        <button class="btn small" onClick={() => copy(`Subject: ${draft.subject}\n\n${draft.body}`)}>Copy</button>
        {task?.status === 'todo' && <button class="btn small" onClick={async () => { await svc.setFollowUpStatus(task.id, 'done'); toast('Marked done'); }}><Icon name="check" /> Sent? Mark done</button>}
      </div>
    </div>
  );
}

export function IncidentView({ id }: { id: string }) {
  const settings = useSettings();
  const data = useLive(async () => {
    const i = await db.incidents.get(id);
    if (!i) return null;
    const [student, cls, students, tasks] = await Promise.all([db.students.get(i.studentId), db.classes.get(i.classId), db.students.where('classId').equals(i.classId).toArray(), db.followUps.where('incidentId').equals(id).toArray()]);
    return student ? { i, student, className: cls?.name ?? 'Class', students, tasks } : null;
  }, [id]);
  if (data === null) return <p class="muted">Incident not found.</p>;
  if (!data || !settings) return null;
  const { i, student, className, students, tasks } = data;
  const who = { student, students, className, teacher: settings.profile.name, school: settings.profile.school };
  const pack = reportPack(i, who);
  const home = homeDraft(i, who);
  const homeTask = tasks.find((t) => t.draft === 'home');
  const staffTask = tasks.find((t) => t.draft === 'staff');
  const staff = staffDraft(i, { ...who, role: staffTask?.role });

  return (
    <div class="incident">
      <div class="row between"><a class="link-btn back-btn" href={`#/students/${student.id}`}><Icon name="back" /> {displayName(student)}</a><span class="tiny muted mono">Report pack</span></div>
      <div class="safety-banner" role="alert"><Icon name="alert" /> <span>{SAFETY_BANNER}</span></div>
      <div class="report-pack card">
        <h2 style="margin:0 0 6px">{pack.title}</h2>
        {pack.sections.map((s) => <div key={s.heading} class="rp-section"><h4>{s.heading}</h4>{s.lines.map((l, k) => <p key={k}>{l}</p>)}</div>)}
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin:10px 0">
        <button class="btn primary small" onClick={() => copy(pack.text)}>Copy all</button>
        <button class="btn small" onClick={async () => { if (!(await shareText(pack.title, pack.text, ''))) copy(pack.text); }}><Icon name="share" /> Share</button>
        <button class="btn small" onClick={async () => { await saveFile(new Blob([printable(pack.title, pack.sections)], { type: 'text/html' }), `${pack.title.replace(/[^\w ,.-]+/g, '')}.html`); toast('Saved. Open it and print, or save as PDF.'); }}><Icon name="download" /> Save to print or PDF</button>
      </div>
      <label class="check-row"><input type="checkbox" checked={!!i.lodgedAt} onChange={(e) => svc.markLodged(i.id, (e.target as HTMLInputElement).checked)} /> Lodged in the school's system{i.lodgedAt ? ` (${relativeDay(toISODate(new Date(i.lodgedAt)))})` : ''}</label>

      <div class="section"><h3 class="grow">Email drafts</h3></div>
      <p class="tiny muted" style="margin:0 0 8px">Radar never sends email. These open in your own email app.</p>
      <DraftBox label="To home" draft={home} task={homeTask} />
      <DraftBox label={`To school staff${staffTask?.role ? ` (${staffTask.role})` : ''}`} draft={staff} task={staffTask} />

      <div class="section"><h3 class="grow">Follow-ups</h3></div>
      <FollowUpList tasks={tasks} students={students} showAll />
      <button class="btn small danger" style="margin-top:16px" onClick={async () => { if (confirm('Delete this incident and its follow-ups from Radar? (Your school system keeps its own record.)')) { await svc.deleteIncident(i.id); go(`students/${student.id}`); } }}><Icon name="trash" /> Delete</button>
    </div>
  );
}

/* ---------- Follow-up lists (Home, student page, class page, Close day) ---------- */

export function dueText(dueAt: number, now = nowMs()): string {
  const d = new Date(dueAt);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (dueAt < now) return `Overdue · ${relativeDay(toISODate(d))} ${time}`;
  return `${relativeDay(toISODate(d))} ${time}`;
}

export function FollowUpList({ tasks, students, showAll, moveToTomorrow }: { tasks: FollowUp[]; students: Student[]; showAll?: boolean; moveToTomorrow?: boolean }) {
  const [draftFor, setDraftFor] = useState<FollowUp | null>(null);
  const settings = useSettings();
  const list = tasks.filter((t) => showAll || t.status === 'todo').sort((a, b) => Number(a.status !== 'todo') - Number(b.status !== 'todo') || a.dueAt - b.dueAt);
  if (!list.length) return <p class="small muted">No follow-ups.</p>;
  const student = (id?: string) => students.find((s) => s.id === id);
  return (
    <div class="fu-list">
      {list.map((t) => (
        <div key={t.id} class={`fu-row ${t.status !== 'todo' ? 'closed' : t.dueAt < nowMs() ? 'overdue' : ''}`}>
          <div class="grow">
            <b class="small">{t.title}</b>
            <div class="tiny muted">{t.status === 'todo' ? dueText(t.dueAt) : t.status === 'done' ? 'Done' : 'Not needed'}{t.about ? ` · ${t.about}` : ''}</div>
          </div>
          {t.status === 'todo' ? (
            <div class="row fu-actions" style="gap:4px;flex-wrap:wrap;justify-content:flex-end">
              {t.incidentId ? <a class="btn small" href={`#/incident/${t.incidentId}`}>Open</a> : t.draft && student(t.studentId) ? <button class="btn small" onClick={() => setDraftFor(t)}><Icon name="mail" /> Draft</button> : null}
              <button class="btn small primary" aria-label="Done" onClick={() => svc.setFollowUpStatus(t.id, 'done')}><Icon name="check" /></button>
              <button class="btn small" onClick={() => svc.setFollowUpStatus(t.id, 'notNeeded')}>Not needed</button>
              {moveToTomorrow && <button class="btn small" onClick={async () => { await svc.moveFollowUpToTomorrow(t.id); toast('Moved to tomorrow'); }}>Tomorrow</button>}
            </div>
          ) : <button class="link-btn tiny" onClick={() => svc.setFollowUpStatus(t.id, 'todo')}>Reopen</button>}
        </div>
      ))}
      {draftFor && settings && student(draftFor.studentId) && (
        <Sheet title="Email to home" onClose={() => setDraftFor(null)}>
          <GeneralDraft task={draftFor} student={student(draftFor.studentId)!} students={students} teacher={settings.profile.name} school={settings.profile.school} />
        </Sheet>
      )}
    </div>
  );
}

function GeneralDraft({ task, student, students, teacher, school }: { task: FollowUp; student: Student; students: Student[]; teacher: string; school?: string }) {
  const cls = useLive(() => db.classes.get(student.classId), [student.classId]);
  const draft = homeDraftGeneral(task.about ?? '', { student, students, className: cls?.name ?? 'class', teacher, school });
  return <DraftBox label="To home" draft={draft} task={task} />;
}

/** Home: open follow-ups, and the end-of-day count. */
export function FollowUpsHome() {
  const data = useLive(async () => ({ tasks: (await db.followUps.toArray()).filter((t) => t.status === 'todo'), students: await db.students.toArray() }), []);
  if (!data || !data.tasks.length) return null;
  const date = today();
  const summary = openTodayText(data.tasks, date);
  return (
    <div class="card follow-ups-home">
      <div class="row between"><b>Follow-ups</b>{summary && <span class="badge blue">{summary}</span>}</div>
      <FollowUpList tasks={data.tasks.slice().sort((a, b) => a.dueAt - b.dueAt).slice(0, 6)} students={data.students} />
      {data.tasks.length > 6 && <p class="tiny muted" style="margin:6px 0 0">{data.tasks.length - 6} more in Close day.</p>}
    </div>
  );
}

/** Student page: incidents (not on a relief device) and follow-ups. */
export function StudentIncidents({ student }: { student: Student }) {
  const data = useLive(async () => ({
    incidents: (await db.incidents.where('studentId').equals(student.id).toArray()).sort((a, b) => b.createdAt - a.createdAt),
    tasks: await db.followUps.where('studentId').equals(student.id).toArray(),
    students: await db.students.where('classId').equals(student.classId).toArray()
  }), [student.id]);
  if (!data) return null;
  return (
    <div class="student-incidents">
      <div class="section"><h3 class="grow">Incidents and follow-ups</h3><a class="btn small danger" href={`#/class/${student.classId}/incident/${student.id}`}><Icon name="alert" /> Serious incident</a></div>
      {data.incidents.map((i) => (
        <a key={i.id} class="list-row" href={`#/incident/${i.id}`}>
          <span class="grow"><b class="small">{formatDate(i.date)} · {i.time}</b><span class="tiny muted"> {i.what.slice(0, 80)}{i.what.length > 80 ? '…' : ''}</span></span>
          <span class={`badge ${i.lodgedAt ? 'ok' : 'warn'}`}>{i.lodgedAt ? 'Lodged' : 'Not lodged'}</span>
        </a>
      ))}
      <FollowUpList tasks={data.tasks} students={data.students} />
    </div>
  );
}

/** Class page: this class's open follow-ups. */
export function ClassFollowUps({ classId, tasks, students }: { classId: string; tasks: FollowUp[]; students: Student[] }) {
  const open = tasks.filter((t) => t.classId === classId && t.status === 'todo');
  if (!open.length) return null;
  return <div class="card"><b>Follow-ups</b><FollowUpList tasks={open} students={students} /></div>;
}

