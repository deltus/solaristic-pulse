// Assessment check: the same swipe flow as Homework check, for long tasks. Right = On track,
// left = Behind (optional reasons), up = Skip, through the class in roster order.
// Also the Assessments tab under Manage class: set up tasks, see past ones, extend a due date.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { Assessment } from '../../types';
import * as svc from '../../services';
import { ASSESSMENT_REASONS, UNDO_SECONDS } from '../../config/checkin';
import type { CheckinTarget } from '../../logic/checkin';
import { activeAssessments, assessmentResultText, assessmentSummary, dueText, latestResults, pastAssessments } from '../../logic/assessments';
import { formatDate, today } from '../../lib/dates';
import { db } from '../../db';
import { NeedLesson } from './Checkin';
import { useLive } from '../hooks';
import { displayName, Empty, Field, Icon, initials, Sheet, toast } from '../components';
import { SwipeCard, sideOf, type SwipeAction, type SwipeControl } from '../Swipe';

export function AssessmentCheckScreen({ classId, assessmentId }: { classId: string; assessmentId?: string }) {
  const date = today();
  const ctx = useLive(() => svc.loadLessonContext(classId), [classId]);
  const lessonId = ctx?.lesson?.id ?? '';
  const active = ctx ? activeAssessments(ctx.assessments, classId, date) : [];
  const [chosen, setChosen] = useState<string | null>(assessmentId ?? null);
  const task: Assessment | undefined = active.find((a) => a.id === chosen) ?? (active.length === 1 ? active[0] : undefined);
  const [checkpoint, setCheckpoint] = useState<string>('');
  const [skipped, setSkipped] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const card = useRef<SwipeControl | null>(null);

  // Saved this session (before the database refresh arrives) plus what is already saved this lesson.
  const [justChecked, setJustChecked] = useState<Set<string>>(new Set());
  const checked = new Set([...(ctx?.assessmentChecks ?? []).filter((c) => task && c.assessmentId === task.id && c.lessonId === lessonId).map((c) => c.studentId), ...justChecked]);
  const roster = [...(ctx?.students ?? [])].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)).filter((s) => !checked.has(s.id));
  const queue = [...roster.filter((s) => !skipped.includes(s.id)), ...skipped.map((id) => roster.find((s) => s.id === id)).filter((s) => !!s)] as typeof roster;
  useEffect(() => { if (task && !activeId && queue[0]) setActiveId(queue[0].id); }, [task?.id, activeId, queue[0]?.id]);
  useEffect(() => { if (task && !checkpoint && task.checkpoints.length) setCheckpoint(task.checkpoints[0]); }, [task?.id]);

  if (!ctx) return null;
  if (!ctx.lesson) return <NeedLesson classId={classId} name={ctx.cls.name} />;
  const back = `#/class/${classId}`;
  const header = (
    <div class="row between">
      <a class="link-btn back-btn" href={back}><Icon name="back" /> {ctx.cls.name}</a>
      {task && <span class="tiny muted mono">{checked.size} checked · {queue.length} to go</span>}
    </div>
  );
  if (!active.length) {
    return <div class="cc">{header}<div class="done-state"><h2>No active assessments</h2><p class="muted small">Set one up under Manage class → Assessments.</p><a class="btn primary" href={`#/classes/${classId}/assessments`}>Assessments</a></div></div>;
  }
  if (!task) {
    return (
      <div class="cc">
        {header}
        <h2 style="margin:10px 0">Which assessment?</h2>
        <div class="list">{active.map((a) => <button key={a.id} class="list-item" onClick={() => setChosen(a.id)}><span class="grow"><span class="title">{a.name}</span><div class="sub">{dueText(a, date) || 'No due date'}</div></span><Icon name="chevron" /></button>)}</div>
      </div>
    );
  }
  const s = ctx.students.find((x) => x.id === activeId);
  const target = (id: string): CheckinTarget => ({ studentId: id, classId, date, lessonId });

  async function save(id: string, onTrack: boolean, why: string[] = []) {
    const row = await svc.saveAssessmentCheck(target(id), task!.id, onTrack ? 'on_track' : 'behind', why, checkpoint || undefined);
    setJustChecked((j) => new Set([...j, id]));
    const name = displayName(ctx!.students.find((x) => x.id === id)!);
    toast(`${onTrack ? 'On track' : 'Behind'} · ${name}`, { label: 'Undo', seconds: UNDO_SECONDS, run: async () => { await svc.undoAssessmentCheck(row.id); setJustChecked((j) => { const n = new Set(j); n.delete(id); return n; }); setAsking(false); setActiveId(id); } });
    setAsking(false);
    setReasons([]);
    setActiveId(null);
  }
  function onSwipe(a: SwipeAction) {
    if (!s) return;
    if (a === 'good') save(s.id, true);
    else if (a === 'issue') setAsking(true);
    else { setSkipped((k) => [...k.filter((x) => x !== s.id), s.id]); setActiveId(null); }
  }

  const due = dueText(task, date);
  const top = (
    <>
      <div class="cc-eyebrow" style="margin-top:8px">Assessment check</div>
      <p class="hw-from"><b>{task.name}</b>{due ? ` · ${due}` : ''}</p>
      {task.checkpoints.length > 0 && (
        <div class="chips" style="flex-wrap:wrap;margin:-4px 0 10px">
          <span class="tiny muted" style="align-self:center">Checkpoint:</span>
          {task.checkpoints.map((c) => <button key={c} class={`chip small ${checkpoint === c ? 'active' : ''}`} onClick={() => setCheckpoint(c)}>{c}</button>)}
        </div>
      )}
    </>
  );
  if (!s) {
    const sum = assessmentSummary(task, ctx.students, [...ctx.assessmentChecks]);
    return (
      <div class="cc">
        {header}
        {top}
        <div class="done-state">
          <div class="check"><Icon name="check" /></div>
          <h2>Everyone checked for {task.name}</h2>
          <p class="muted small">{sum.onTrack} on track · {sum.behind} behind</p>
          <a class="btn primary" href={back} style="margin-top:10px">Back to {ctx.cls.name}</a>
        </div>
      </div>
    );
  }

  const last = latestResults(ctx.assessmentChecks.filter((c) => c.lessonId !== lessonId), task.id).get(s.id);
  const onTrack = <button class="btn big good-btn" onClick={() => card.current?.fling('good')}><Icon name="check" /> On track</button>;
  const behind = <button class="btn big issue-btn" onClick={() => card.current?.fling('issue')}><Icon name="alert" /> Behind</button>;
  return (
    <div class="cc checkin">
      {header}
      {top}
      {asking ? (
        <div class="fade-up student-card">
          <h1 class="card-name">{displayName(s)}</h1>
          <p class="small muted" style="margin:4px 0 12px">Behind. Why? (optional, tick any)</p>
          <div class="chips" style="flex-wrap:wrap">
            {ASSESSMENT_REASONS.map((r) => <button key={r.id} class={`chip ${reasons.includes(r.id) ? 'active' : ''}`} aria-pressed={reasons.includes(r.id)} onClick={() => setReasons(reasons.includes(r.id) ? reasons.filter((x) => x !== r.id) : [...reasons, r.id])}>{r.label}</button>)}
          </div>
          <div class="grid2" style="margin-top:12px">
            <button class="btn" onClick={() => { setAsking(false); setReasons([]); }}><Icon name="back" /> Back</button>
            <button class="btn primary" onClick={() => save(s.id, false, reasons)}>Save <Icon name="check" /></button>
          </div>
        </div>
      ) : (
        <>
          <SwipeCard key={s.id} control={card} onSwipe={onSwipe} labels={{ good: 'On track', issue: 'Behind', up: 'Skip' }} class="student-card">
            <div class="row" style="gap:12px">
              <span class="avatar big">{initials(s)}</span>
              <h1 class="card-name grow">{displayName(s)}</h1>
            </div>
            <div class="hw-now">{task.name}{due ? ` · ${due}` : ''}</div>
            <div class="hw-history">
              {last ? <div class="row between tiny"><span class="muted">Last check ({formatDate(last.date)})</span><span class={last.result === 'on_track' ? 'ok' : 'warn'}>{assessmentResultText(last)}</span></div> : <span class="tiny muted">Not checked yet for this task</span>}
            </div>
          </SwipeCard>
          <div class="grid2 swipe-buttons">{sideOf('good') === 'left' ? [onTrack, behind] : [behind, onTrack]}</div>
          <div class="row" style="margin-top:10px"><button class="link-btn" onClick={() => card.current?.fling('up')}><Icon name="skip" /> Skip</button></div>
          <p class="hold-hint">Swipe {sideOf('good')} for on track, {sideOf('issue')} for behind, up to skip</p>
        </>
      )}
    </div>
  );
}

/** Manage class → Assessments: active and past tasks, add, edit, extend, end. */
export function AssessmentsPanel({ classId }: { classId: string }) {
  const date = today();
  const data = useLive(async () => ({
    assessments: await db.assessments.where('classId').equals(classId).toArray(),
    checks: await db.assessmentChecks.where('classId').equals(classId).toArray(),
    students: await db.students.where('classId').equals(classId).toArray()
  }), [classId]);
  const [editing, setEditing] = useState<Assessment | 'new' | null>(null);
  if (!data) return null;
  const active = activeAssessments(data.assessments, classId, date);
  const past = pastAssessments(data.assessments, classId, date);
  const row = (a: Assessment) => (
    <button key={a.id} class="list-item" onClick={() => setEditing(a)}>
      <span class="grow">
        <span class="title">{a.name}</span>
        <div class="sub">{[dueText(a, date) || 'No due date', a.checkpoints.length ? a.checkpoints.join(' → ') : '', a.closed ? 'Ended' : ''].filter(Boolean).join(' · ')}</div>
        <div class="tiny muted">{assessmentSummary(a, data.students, data.checks).text.replace(`${a.name}: `, '')}</div>
      </span>
      <Icon name="edit" />
    </button>
  );
  return (
    <div>
      <div class="row" style="margin-bottom:10px"><button class="btn primary small" onClick={() => setEditing('new')}><Icon name="plus" /> New assessment</button></div>
      <div class="section"><h3>Active</h3></div>
      {active.length ? <div class="list">{active.map(row)}</div> : <div class="card"><Empty icon="reports">No active assessments. While one is active, an Assessment check button shows on the class page.</Empty></div>}
      {past.length > 0 && <><div class="section"><h3>Past assessments</h3></div><div class="list">{past.map(row)}</div></>}
      {editing && <AssessmentForm classId={classId} a={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AssessmentForm({ classId, a, onClose }: { classId: string; a?: Assessment; onClose: () => void }) {
  const [f, setF] = useState({ name: a?.name ?? '', dueDate: a?.dueDate ?? '', checkpoints: (a?.checkpoints ?? []).join(', '), closed: !!a?.closed });
  const ended = a && !(!f.closed && (!f.dueDate || today() <= f.dueDate));
  async function save(extra: Partial<Assessment> = {}) {
    if (!f.name.trim()) return toast('Give the task a name');
    await svc.saveAssessment({ ...a, classId, name: f.name, dueDate: f.dueDate || undefined, checkpoints: f.checkpoints.split(',').map((x) => x.trim()).filter(Boolean), closed: f.closed, ...extra });
    toast('Assessment saved');
    onClose();
  }
  async function remove() {
    if (!a || !confirm(`Delete "${a.name}" and all its check results?`)) return;
    await svc.deleteAssessment(a.id);
    onClose();
  }
  return (
    <Sheet title={a ? 'Assessment' : 'New assessment'} onClose={onClose}>
      <Field label="Task name"><input class="input" value={f.name} autoFocus placeholder="e.g. Fieldwork report" onInput={(e) => setF({ ...f, name: (e.target as HTMLInputElement).value })} /></Field>
      <Field label="Due date (optional)" hint={ended ? 'This task has ended. Choose a later due date to extend it, then Save.' : 'After this date the task moves to Past assessments and its button disappears.'}>
        <input class="input" type="date" value={f.dueDate} onInput={(e) => setF({ ...f, dueDate: (e.target as HTMLInputElement).value })} />
      </Field>
      <Field label="Checkpoints (optional)" hint="Comma separated, e.g. Research done, Draft, Final"><input class="input" value={f.checkpoints} onInput={(e) => setF({ ...f, checkpoints: (e.target as HTMLInputElement).value })} /></Field>
      {a && <label class="check"><input type="checkbox" checked={f.closed} onChange={(e) => setF({ ...f, closed: (e.target as HTMLInputElement).checked })} /><span>Ended (hide the Assessment check button now)</span></label>}
      <div class="actions">
        {a && <button class="btn danger" onClick={remove}><Icon name="trash" /></button>}
        <button class="btn" onClick={onClose}>Cancel</button>
        <button class="btn primary" disabled={!f.name.trim()} onClick={() => save()}>Save</button>
      </div>
    </Sheet>
  );
}
