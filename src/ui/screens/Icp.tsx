import { useState } from 'preact/hooks';
import { db, sortedCategories } from '../../db';
import type { IcpAdjustment, IcpCheck, IcpFrequency, Student, TimetableEntry } from '../../types';
import * as svc from '../../services';
import { compareBeforeAfter, icpDueStatus, implementationSummary, ICP_FREQUENCIES, ICP_OUTCOMES } from '../../logic/icp';
import { formatDate, formatShort, today, weekday } from '../../lib/dates';
import { useLive } from '../hooks';
import { Avatar, displayName, Empty, Field, Icon, PageHead, Sheet, Switch, toast } from '../components';

const TEMPLATES = ['Preferential seating', 'Individual teacher time', 'Additional time provided', 'Adjusted task or resource provided', 'Agreed support implemented'];

function hasLesson(timetable: TimetableEntry[], classId: string, date: string) {
  const forClass = timetable.filter((t) => t.classId === classId);
  return !forClass.length || forClass.some((t) => t.day === weekday(date));
}

export function IcpScreen({ studentId }: { studentId?: string }) {
  const date = today();
  const data = useLive(async () => {
    const [classes, students, adjustments, checks, timetable, observations, categories] = await Promise.all([
      db.classes.toArray(), db.students.toArray(), db.icpAdjustments.toArray(), db.icpChecks.toArray(), db.timetable.toArray(),
      studentId ? db.observations.where('studentId').equals(studentId).toArray() : Promise.resolve([]), sortedCategories()
    ]);
    return { classes, students, adjustments, checks, timetable, observations, categories };
  }, [studentId]);
  const [classId, setClassId] = useState('');
  const [form, setForm] = useState<{ adj?: IcpAdjustment; studentId?: string } | null>(null);
  if (!data) return null;

  const studentOf = (id: string) => data.students.find((s) => s.id === id);
  const classOf = (id: string) => data.classes.find((c) => c.id === id);

  if (studentId) {
    const s = studentOf(studentId);
    if (!s) return <p>Student not found.</p>;
    return <StudentIcp s={s} className={classOf(s.classId)?.name ?? ''} data={data} date={date} onEdit={(adj) => setForm({ adj, studentId })} form={form} closeForm={() => setForm(null)} />;
  }

  const active = data.adjustments.filter((a) => {
    const s = studentOf(a.studentId);
    return a.active && s && !s.archived && !classOf(s.classId)?.archived && (!classId || s.classId === classId);
  });
  const withStatus = active.map((a) => {
    const s = studentOf(a.studentId)!;
    return { a, s, st: icpDueStatus(a, data.checks, date, hasLesson(data.timetable, s.classId, date)) };
  });
  const due = withStatus.filter((x) => x.st.due).sort((x, y) => Number(y.st.overdue) - Number(x.st.overdue));
  const doneToday = withStatus.filter((x) => x.st.doneToday);
  const studentsWithAdj = [...new Set(data.adjustments.map((a) => a.studentId))].map(studentOf).filter((s): s is Student => !!s && (!classId || s.classId === classId));
  const classesWithAdj = data.classes.filter((c) => !c.archived && data.adjustments.some((a) => studentOf(a.studentId)?.classId === c.id));

  return (
    <div>
      <PageHead eyebrow="Individual Curriculum Plans" title="ICP Check-In">
        <button class="btn primary small" onClick={() => setForm({})}><Icon name="plus" /> Adjustment</button>
      </PageHead>
      <div class="chips">
        <button class={`chip small ${!classId ? 'active' : ''}`} onClick={() => setClassId('')}>All classes</button>
        {classesWithAdj.map((c) => <button key={c.id} class={`chip small ${classId === c.id ? 'active' : ''}`} onClick={() => setClassId(c.id)}>{c.name}</button>)}
      </div>
      {due.some((x) => x.st.overdue) && <div class="notice"><b>{due.filter((x) => x.st.overdue).length} overdue ICP check-in{due.filter((x) => x.st.overdue).length === 1 ? '' : 's'}.</b> Record whether each agreed adjustment was implemented.</div>}

      <div class="section"><h2>Due today</h2><span class="tiny muted mono">{due.length} due · {doneToday.length} done</span></div>
      {due.length ? due.map(({ a, s, st }) => (
        <div class="card" key={a.id}>
          <div class="row">
            <Avatar s={s} />
            <div class="grow">
              <a href={`#/icp/${s.id}`} style="color:inherit;text-decoration:none"><b>{displayName(s)}</b></a> <span class="tiny muted">· {classOf(s.classId)?.name}</span>
              <div class="small">{a.title}</div>
            </div>
            {st.overdue ? <span class="badge some">Overdue</span> : <span class="badge">{ICP_FREQUENCIES.find((f) => f.value === a.frequency)?.label}</span>}
          </div>
          {a.details && <p class="small muted" style="margin:8px 0 0">{a.details}</p>}
          <p class="tiny muted" style="margin:6px 0 8px">{st.label}</p>
          <OutcomeButtons adj={a} date={date} current={data.checks.find((c) => c.adjustmentId === a.id && c.date === date)} />
        </div>
      )) : <div class="card"><Empty icon="icp">{active.length ? 'All ICP check-ins due today are recorded.' : 'No active adjustments yet. Add one to start tracking.'}</Empty></div>}

      {doneToday.length > 0 && (
        <>
          <div class="section"><h2>Recorded today</h2></div>
          <div class="list">
            {doneToday.map(({ a, s }) => {
              const c = data.checks.find((x) => x.adjustmentId === a.id && x.date === date)!;
              return (
                <div class="list-item" key={a.id}>
                  <Avatar s={s} />
                  <span class="grow"><span class="title">{displayName(s)}: {a.title}</span><div class="sub">{ICP_OUTCOMES.find((o) => o.value === c.outcome)?.label}{c.note ? ` · ${c.note}` : ''}</div></span>
                  <button class="btn small ghost" onClick={() => svc.deleteIcpCheck(c.id)}>Undo</button>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div class="section"><h2>Students with adjustments</h2></div>
      {studentsWithAdj.length ? (
        <div class="list">
          {studentsWithAdj.map((s) => {
            const adjs = data.adjustments.filter((a) => a.studentId === s.id);
            const sum = implementationSummary(data.checks.filter((c) => c.studentId === s.id));
            return (
              <a key={s.id} class="list-item" href={`#/icp/${s.id}`}>
                <Avatar s={s} />
                <span class="grow"><span class="title">{displayName(s)}</span><div class="sub">{classOf(s.classId)?.name} · {adjs.filter((a) => a.active).length} active · {sum.rate === null ? 'no records' : `${sum.rate}% implemented`}</div></span>
                <Icon name="chevron" />
              </a>
            );
          })}
        </div>
      ) : <p class="small muted">None yet.</p>}
      {form && <AdjustmentForm adj={form.adj} studentId={form.studentId} students={data.students.filter((s) => !s.archived)} classes={data.classes} onClose={() => setForm(null)} />}
    </div>
  );
}

function OutcomeButtons({ adj, date, current }: { adj: IcpAdjustment; date: string; current?: IcpCheck }) {
  return (
    <div>
      <div class="grid4">
        {ICP_OUTCOMES.map((o, i) => (
          <button key={o.value} class={`resp ${['l0', 'l1', 'l2', 'ln'][i]} ${current?.outcome === o.value ? 'sel' : ''}`} onClick={() => svc.recordIcpCheck(adj, date, o.value)}>{o.label}</button>
        ))}
      </div>
      {current && (
        <button class="btn ghost small" style="margin-top:6px" onClick={async () => {
          const n = prompt('Context or notes for this ICP check-in:', current.note ?? '');
          if (n !== null) await svc.updateIcpNote(current.id, n.trim());
        }}><Icon name="edit" /> {current.note ? 'Edit note' : 'Add note'}</button>
      )}
    </div>
  );
}

function StudentIcp({ s, className, data, date, onEdit, form, closeForm }: {
  s: Student; className: string; date: string; onEdit: (a?: IcpAdjustment) => void; form: { adj?: IcpAdjustment } | null; closeForm: () => void;
  data: { adjustments: IcpAdjustment[]; checks: IcpCheck[]; timetable: TimetableEntry[]; observations: import('../../types').Observation[]; categories: import('../../types').Category[]; students: Student[]; classes: import('../../types').SchoolClass[] };
}) {
  const adjs = data.adjustments.filter((a) => a.studentId === s.id).sort((a, b) => Number(b.active) - Number(a.active) || b.startDate.localeCompare(a.startDate));
  const cats = data.categories.filter((c) => c.builtIn || data.observations.some((o) => o.categoryId === c.id));
  return (
    <div>
      <PageHead eyebrow={`ICP · ${className}`} title={displayName(s)} back="#/icp">
        <button class="btn primary small" onClick={() => onEdit(undefined)}><Icon name="plus" /> Adjustment</button>
      </PageHead>
      <div class="row wrap" style="margin-bottom:12px">
        <a class="btn small" href={`#/students/${s.id}`}><Icon name="user" /> Profile</a>
        <a class="btn small" href={`#/reports/${s.id}`}><Icon name="download" /> Student report</a>
      </div>
      {!adjs.length && <div class="card"><Empty icon="icp">No adjustments recorded for {s.preferredName || s.firstName}.</Empty></div>}
      {adjs.map((a) => {
        const checks = data.checks.filter((c) => c.adjustmentId === a.id).sort((x, y) => y.date.localeCompare(x.date));
        const sum = implementationSummary(checks);
        const st = icpDueStatus(a, data.checks, date, hasLesson(data.timetable, s.classId, date));
        const rows = compareBeforeAfter(a, data.observations, cats, date);
        return (
          <div class="card" key={a.id}>
            <div class="row between" style="align-items:flex-start">
              <div class="grow">
                <span class="eyebrow">{ICP_FREQUENCIES.find((f) => f.value === a.frequency)?.label} · from {formatDate(a.startDate)}{a.endDate ? ` to ${formatDate(a.endDate)}` : ''}</span>
                <h3>{a.title}</h3>
                {a.details && <p class="small muted">{a.details}</p>}
              </div>
              <button class="icon-btn" aria-label="Edit adjustment" onClick={() => onEdit(a)}><Icon name="edit" /></button>
            </div>
            <div class="row wrap" style="margin:6px 0 10px">
              {!a.active ? <span class="badge">Ended</span> : st.overdue ? <span class="badge some">Overdue</span> : st.doneToday ? <span class="badge ok">Done today</span> : <span class="badge">{st.label}</span>}
              <span class="badge blue">{sum.rate === null ? 'No records yet' : `${sum.rate}% implemented`}</span>
              <span class="tiny muted">{sum.implemented} yes · {sum.partial} partly · {sum.not} no · {sum.na} n/a</span>
            </div>
            {a.active && <OutcomeButtons adj={a} date={date} current={checks.find((c) => c.date === date)} />}

            <div class="divider" />
            <span class="eyebrow">Observations before and after this adjustment</span>
            {rows.map((r) => (
              <p key={r.categoryId} class="small"><b>{r.categoryName}:</b> {r.statement} <span class="tiny muted">(before n={r.before.n}, after n={r.after.n})</span></p>
            ))}
            <p class="tiny muted">Average difficulty: 0 = as expected, 1 = some, 2 = significant. Compares 6 weeks before the start date with the period since.</p>

            <div class="divider" />
            <span class="eyebrow">Implementation history</span>
            {checks.length ? checks.slice(0, 30).map((c) => (
              <div key={c.id} class="row" style="padding:5px 0;border-top:1px dashed var(--line)">
                <span class="tiny mono muted" style="width:92px">{formatShort(c.date)}</span>
                <span class="grow small"><b>{ICP_OUTCOMES.find((o) => o.value === c.outcome)?.label}</b>{c.note ? ` · ${c.note}` : ''}</span>
                <button class="icon-btn" aria-label="Delete record" onClick={() => confirm('Delete this ICP record?') && svc.deleteIcpCheck(c.id)}><Icon name="trash" /></button>
              </div>
            )) : <p class="small muted">No implementation records yet.</p>}
          </div>
        );
      })}
      {form && <AdjustmentForm adj={form.adj} studentId={s.id} students={[s]} classes={data.classes} onClose={closeForm} />}
    </div>
  );
}

function AdjustmentForm({ adj, studentId, students, classes, onClose }: { adj?: IcpAdjustment; studentId?: string; students: Student[]; classes: { id: string; name: string }[]; onClose: () => void }) {
  const [f, setF] = useState({
    studentId: adj?.studentId ?? studentId ?? '', title: adj?.title ?? '', details: adj?.details ?? '',
    frequency: adj?.frequency ?? ('lesson' as IcpFrequency), startDate: adj?.startDate ?? today(), endDate: adj?.endDate ?? '', active: adj?.active ?? true
  });
  const set = (k: keyof typeof f) => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });
  async function save() {
    if (!f.studentId || !f.title.trim()) return toast('Choose a student and describe the adjustment');
    await svc.saveAdjustment({ ...adj, ...f, endDate: f.endDate || undefined });
    toast('Adjustment saved');
    onClose();
  }
  async function remove() {
    if (!adj || !confirm('Delete this adjustment and its entire implementation history? Consider setting an end date instead to keep the record.')) return;
    await svc.deleteAdjustment(adj.id);
    onClose();
  }
  const sorted = [...students].sort((a, b) => a.lastName.localeCompare(b.lastName));
  return (
    <Sheet title={adj ? 'Edit adjustment' : 'New ICP adjustment'} onClose={onClose}>
      {!studentId && (
        <Field label="Student">
          <select class="input" value={f.studentId} onChange={set('studentId')}>
            <option value="">Choose a student…</option>
            {classes.map((c) => {
              const list = sorted.filter((s) => s.classId === c.id);
              return list.length ? <optgroup key={c.id} label={c.name}>{list.map((s) => <option key={s.id} value={s.id}>{displayName(s)}</option>)}</optgroup> : null;
            })}
          </select>
        </Field>
      )}
      <Field label="Adjustment"><input class="input" value={f.title} onInput={set('title')} placeholder="e.g. Preferential seating" /></Field>
      {!adj && <div class="chips" style="flex-wrap:wrap;margin:-4px 0 10px">{TEMPLATES.map((t) => <button key={t} class="chip small" onClick={() => setF({ ...f, title: t })}>{t}</button>)}</div>}
      <Field label="Details (what was agreed)"><textarea class="input" value={f.details} onInput={set('details')} /></Field>
      <Field label="Expected frequency">
        <select class="input" value={f.frequency} onChange={set('frequency')}>{ICP_FREQUENCIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
      </Field>
      <div class="grid2">
        <Field label="Start date"><input class="input" type="date" value={f.startDate} onInput={set('startDate')} /></Field>
        <Field label="End date (optional)"><input class="input" type="date" value={f.endDate} onInput={set('endDate')} /></Field>
      </div>
      {adj && <Switch label="Active" checked={f.active} onChange={(v) => setF({ ...f, active: v })} hint="Inactive adjustments keep their history but stop reminders." />}
      <div class="actions">
        {adj && <button class="btn danger" onClick={remove}><Icon name="trash" /></button>}
        <button class="btn" onClick={onClose}>Cancel</button>
        <button class="btn primary" onClick={save}>Save</button>
      </div>
    </Sheet>
  );
}
