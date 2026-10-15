import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { db, getSettings, saveSettings, sortedCategories } from '../../db';
import * as svc from '../../services';
import { computePriority, lastCheckedDate, ADJUST_MAX, ADJUST_MIN, WEIGHT_MAX, WEIGHT_MIN } from '../../logic/priority';
import { allOpenFollowUps } from '../../logic/followups';
import { categoryTrend } from '../../logic/trends';
import { rollingShare } from '../../logic/insights';
import { TrendLine } from '../TrendLine';
import { blitzTopic } from '../../logic/blitz';
import { icpDueStatus, implementationSummary, ICP_FREQUENCIES, ICP_OUTCOMES } from '../../logic/icp';
import { daysBetween, formatDate, formatShort, relativeDay, today } from '../../lib/dates';
import { go, useLive } from '../hooks';
import { Avatar, displayName, Empty, Icon, PageHead, levelBadge, toast } from '../components';
import { StudentForm } from './Classes';

type Filter = 'all' | 'flagged' | 'followup' | 'overdue' | 'archived';

export function StudentsScreen() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [classId, setClassId] = useState('');
  const data = useLive(async () => {
    const [classes, students, observations, checkins, questions, settings, categories] = await Promise.all([
      db.classes.toArray(), db.students.toArray(), db.observations.toArray(), db.checkins.toArray(),
      db.questions.filter((x) => x.enabled).toArray(), getSettings(), db.categories.toArray()
    ]);
    return { classes, students, observations, checkins, questions, settings, categories };
  }, []);
  if (!data) return null;
  const date = today();
  const obsBy = group(data.observations, (o) => o.studentId);
  const chkBy = group(data.checkins, (c) => c.studentId);
  const className = (id: string) => data.classes.find((c) => c.id === id)?.name ?? '';

  const rows = data.students
    .filter((s) => (filter === 'archived' ? s.archived : !s.archived))
    .filter((s) => !classId || s.classId === classId)
    .filter((s) => `${s.firstName} ${s.lastName} ${s.preferredName ?? ''} ${s.externalId ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .map((s) => {
      const last = lastCheckedDate(chkBy.get(s.id) ?? []);
      const days = last ? daysBetween(last, date) : null;
      const follow = allOpenFollowUps(obsBy.get(s.id) ?? [], data.questions).length;
      const weight = computePriority(s, obsBy.get(s.id) ?? [], (chkBy.get(s.id) ?? []).filter((c) => c.date <= date), data.questions, data.categories, date).weight;
      return { s, last, days, follow, weight, overdue: days === null || days >= data.settings.maxGapDays };
    })
    .filter((r) => filter !== 'flagged' || r.s.flag)
    .filter((r) => filter !== 'followup' || r.follow)
    .filter((r) => filter !== 'overdue' || r.overdue)
    .sort((a, b) => a.s.lastName.localeCompare(b.s.lastName) || a.s.firstName.localeCompare(b.s.firstName));

  const filters: [Filter, string][] = [['all', 'All'], ['flagged', 'Flagged'], ['followup', 'Follow-up'], ['overdue', 'Overdue'], ['archived', 'Archived']];
  return (
    <div>
      <PageHead eyebrow="Students" title="All students" />
      <input class="input" placeholder="Search by name or ID" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="chips" style="margin-top:10px">
        {filters.map(([f, l]) => <button key={f} class={`chip small ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{l}</button>)}
        <select class="input" style="min-height:30px;width:auto;padding:2px 8px;border-radius:999px;font-size:12.5px" value={classId} onChange={(e) => setClassId((e.target as HTMLSelectElement).value)} aria-label="Filter by class">
          <option value="">All classes</option>
          {data.classes.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {rows.length ? (
        <div class="list">
          {rows.map(({ s, last, follow, overdue, weight }) => (
            <a key={s.id} class="list-item" href={`#/students/${s.id}`}>
              <Avatar s={s} />
              <span class="grow">
                <span class="title">{displayName(s)}</span>
                <div class="sub">{className(s.classId)} · {last ? `checked ${relativeDay(last)}` : 'not yet checked in'}</div>
              </span>
              <WeightBadge w={weight} />
              {s.flag && <span class="badge flag"><Icon name="flag" /></span>}
              {follow > 0 && <span class="badge some">{follow} follow-up</span>}
              {overdue && !s.archived && <span class="badge">Overdue</span>}
            </a>
          ))}
        </div>
      ) : <div class="card"><Empty icon="students">No students match.</Empty></div>}
    </div>
  );
}

function group<T>(xs: T[], k: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of xs) (m.get(k(x)) ?? m.set(k(x), []).get(k(x))!).push(x);
  return m;
}

export function StudentProfile({ id }: { id: string }) {
  const date = today();
  const data = useLive(async () => {
    const student = await db.students.get(id);
    if (!student) return { student: undefined };
    const [cls, observations, checkins, questions, allQuestions, categories, notes, adjustments, icpChecks, timetable] = await Promise.all([
      db.classes.get(student.classId), db.observations.where('studentId').equals(id).toArray(), db.checkins.where('studentId').equals(id).toArray(),
      db.questions.filter((q) => q.enabled).toArray(), db.questions.toArray(), sortedCategories(), db.notes.where('studentId').equals(id).toArray(),
      db.icpAdjustments.where('studentId').equals(id).toArray(), db.icpChecks.where('studentId').equals(id).toArray(),
      db.timetable.where('classId').equals(student.classId).toArray()
    ]);
    return { student, cls, observations, checkins, questions, allQuestions, categories, notes, adjustments, icpChecks, timetable };
  }, [id]);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [showAll, setShowAll] = useState(false);

  if (!data) return null;
  if (!data.student) return <p>Student not found. <a href="#/students">Back</a></p>;
  const { student: s, cls, observations, checkins, questions, allQuestions, categories, notes, adjustments, icpChecks, timetable } = data as Required<typeof data>;
  const priority = computePriority(s, observations, checkins.filter((c) => c.date <= date), questions, categories, date);
  const follow = allOpenFollowUps(observations, questions);
  const catName = (cid: string) => categories.find((c) => c.id === cid)?.name ?? cid;
  const usedCats = categories.filter((c) => c.builtIn || observations.some((o) => o.categoryId === c.id));
  const last = lastCheckedDate(checkins);
  const absences = checkins.filter((c) => c.status === 'absent').length;

  async function flag() {
    if (s.flag) {
      await svc.setFlag(s.id, null);
      toast('Flag removed');
    } else {
      const reason = prompt('Why are you flagging this student for closer monitoring? (optional, keep it factual)');
      if (reason === null) return;
      await svc.setFlag(s.id, reason);
      toast('Flagged: they will be checked more often');
    }
  }
  async function checkNow() {
    await svc.addToPlan(s.classId, date, s.id);
    await saveSettings({ currentClassId: s.classId });
    go('today');
  }
  async function archive() {
    await svc.updateStudent(s.id, { archived: !s.archived });
    toast(s.archived ? 'Student restored' : 'Student archived. History is kept.');
  }
  async function remove() {
    const ok = prompt(`Permanently delete ${displayName(s)} and all their observations, notes and ICP records? This cannot be undone. Archiving keeps history instead.\n\nType DELETE to confirm.`);
    if (ok?.trim().toUpperCase() !== 'DELETE') return;
    await svc.deleteStudentPermanently(s.id);
    toast('Student deleted');
    go('students');
  }

  // Timeline: observations grouped by check-in date, plus ICP checks and notes.
  type Item = { date: string; t: number; kind: string; el: JSX.Element };
  const items: Item[] = [];
  for (const c of checkins) {
    if (c.status === 'absent' || c.status === 'skipped') items.push({ date: c.date, t: c.createdAt, kind: 'status', el: <div class="tl-item"><span class="badge">{c.status === 'absent' ? 'Absent' : 'Skipped'}</span></div> });
  }
  for (const o of observations) {
    const q = allQuestions.find((x) => x.id === o.questionId);
    items.push({
      date: o.date, t: o.createdAt, kind: 'obs',
      el: (
        <div class={`tl-item ${o.level === 2 ? 'sig' : o.level === 1 ? 'difficulty' : ''}`}>
          <span class="label-tag">{catName(o.categoryId)}</span>
          <span class={`badge ${levelBadge(o.level)}`}>{o.blitz ? `Blitz · ${blitzTopic(o.blitz)?.label ?? o.blitz}: ${o.response}` : o.followUp ? `Follow-up: ${o.response}` : o.response}</span>
          {o.context && <span class="tiny muted"> · {o.context}</span>}
          {q && !q.builtIn && <div class="tiny muted">{q.text.replace(/\{name\}/g, s.preferredName || s.firstName)}</div>}
          {o.note && <div class="small">{o.note}</div>}
        </div>
      )
    });
  }
  for (const c of icpChecks) {
    const a = adjustments.find((x) => x.id === c.adjustmentId);
    items.push({ date: c.date, t: c.createdAt, kind: 'icp', el: <div class="tl-item icp"><span class="label-tag">ICP</span>{a?.title ?? 'Adjustment'}: <b>{ICP_OUTCOMES.find((o) => o.value === c.outcome)?.label}</b>{c.note && <div class="small">{c.note}</div>}</div> });
  }
  for (const n of notes) items.push({ date: n.date, t: n.createdAt, kind: 'note', el: <div class="tl-item"><span class="label-tag">Note</span>{n.text}</div> });
  items.sort((a, b) => b.date.localeCompare(a.date) || b.t - a.t);
  const dates = [...new Set(items.map((i) => i.date))];
  const shownDates = showAll ? dates : dates.slice(0, 8);
  const hasLessonToday = !timetable.length || timetable.some((t) => t.day === (new Date().getDay() || 7));

  return (
    <div>
      <PageHead eyebrow={`${cls?.name ?? 'No class'}${s.archived ? ' · Archived' : ''}`} title={displayName(s)} back="#/students">
        <button class="icon-btn" aria-label="Edit student" onClick={() => setEditing(true)}><Icon name="edit" /></button>
      </PageHead>
      {s.preferredName && <p class="small muted" style="margin-top:-8px">Legal name: {s.firstName} {s.lastName}{s.externalId ? ` · ID ${s.externalId}` : ''}</p>}

      <div class="row wrap" style="margin-bottom:14px">
        {!s.archived && <button class="btn primary small" onClick={checkNow}><Icon name="check" /> Check in now</button>}
        <button class={`btn small ${s.flag ? 'burgundy' : ''}`} onClick={flag}><Icon name="flag" /> {s.flag ? 'Flagged' : 'Flag for monitoring'}</button>
        <a class="btn small" href={`#/reports/${s.id}`}><Icon name="download" /> Student report</a>
      </div>
      {s.flag && <div class="notice burgundy"><b>Flagged {relativeDay(s.flag.since)}</b>{s.flag.reason ? `: ${s.flag.reason}` : ''}. A flag only increases how often this student is checked; it is not a label and can be removed at any time.</div>}

      <div class="grid2">
        <div class="card flat" style="margin:0"><span class="eyebrow">Last check-in</span><b>{last ? relativeDay(last) : 'Never'}</b><div class="tiny muted">{checkins.filter((c) => c.status === 'complete' || c.status === 'partial').length} check-ins · {absences} absences</div></div>
        <div class="card flat" style="margin:0"><span class="eyebrow">Open follow-ups</span><b>{follow.length ? follow.map((f) => catName(f.categoryId)).join(', ') : 'None'}</b><div class="tiny muted">Asked again at the next check-in</div></div>
      </div>

      <div class="section"><h2>Draw weight</h2></div>
      <PriorityCard studentId={s.id} weight={priority.weight} raw={priority.raw} parts={priority.parts} adjust={s.priorityAdjust} />

      <div class="section"><h2>Trends</h2><span class="tiny muted">last 8 weeks · includes Blitz</span></div>
      <div class="legend" style="margin-bottom:8px"><span><i style="background:var(--ok)" />Meeting expectations</span><span><i style="background:var(--some)" />Needs support</span><span>Line: share of the last 5 answers meeting expectations</span></div>
      {usedCats.map((c) => {
        const t = categoryTrend(observations, c, date);
        return (
          <div class="card" key={c.id}>
            <div class="row between"><h3>{c.name}</h3><span class={`badge ${t.status === 'improving' ? 'ok' : t.status === 'declining' ? 'some' : ''}`}>{t.status === 'insufficient' ? 'Not enough data' : t.status === 'improving' ? 'Improving' : t.status === 'declining' ? 'More difficulty' : 'Stable'}</span></div>
            {(() => { const r = rollingShare(observations, c.id, date); return <TrendLine values={r.map((p) => 1 - p.share)} dots={r.map((p) => p.level)} labels={r.length ? [formatDate(r[0].date), formatDate(r[r.length - 1].date)] : undefined} />; })()}
            <p class="small"><span class="label-tag">Interpretation</span>{t.summary}</p>
            {t.facts.map((f) => <p key={f} class="small muted"><span class="label-tag">Observed</span>{f}</p>)}
          </div>
        );
      })}

      <div class="section"><h2>ICP adjustments</h2><a class="btn small" href={`#/icp/${s.id}`}>Manage</a></div>
      {adjustments.length ? (
        <div class="list">
          {adjustments.map((a) => {
            const sum = implementationSummary(icpChecks.filter((c) => c.adjustmentId === a.id));
            const st = icpDueStatus(a, icpChecks, date, hasLessonToday);
            return (
              <a key={a.id} class="list-item" href={`#/icp/${s.id}`}>
                <Icon name="icp" />
                <span class="grow"><span class="title">{a.title}</span><div class="sub">{ICP_FREQUENCIES.find((f) => f.value === a.frequency)?.label} · since {formatDate(a.startDate)} · {sum.rate === null ? 'no records yet' : `${sum.rate}% implemented (${sum.total} records)`}</div></span>
                {!a.active ? <span class="badge">Ended</span> : st.overdue ? <span class="badge some">Overdue</span> : st.doneToday ? <span class="badge ok">Done today</span> : null}
              </a>
            );
          })}
        </div>
      ) : <p class="small muted">No individual adjustments recorded.</p>}

      <div class="section"><h2>Teacher notes</h2></div>
      <div class="card">
        <textarea class="input" placeholder="Add a dated note (factual, observable)…" value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
        <div class="actions" style="margin-top:8px"><button class="btn primary small" disabled={!note.trim()} onClick={async () => { await svc.addNote(s.id, note); setNote(''); toast('Note saved'); }}>Save note</button></div>
        {notes.sort((a, b) => b.createdAt - a.createdAt).map((n) => (
          <div key={n.id} class="row" style="padding:8px 0;border-top:1px solid var(--line);margin-top:8px">
            <div class="grow"><div class="tiny muted mono">{formatShort(n.date)}</div><div class="small">{n.text}</div></div>
            <button class="icon-btn" aria-label="Delete note" onClick={() => confirm('Delete this note?') && svc.deleteNote(n.id)}><Icon name="trash" /></button>
          </div>
        ))}
      </div>

      <div class="section"><h2>History</h2><span class="tiny muted mono">{observations.length} observations</span></div>
      {dates.length ? (
        <div class="card">
          {shownDates.map((d) => (
            <div key={d}>
              <div class="timeline-day">{formatShort(d)} · {relativeDay(d)}</div>
              {items.filter((i) => i.date === d).map((i, k) => <div key={k}>{i.el}</div>)}
            </div>
          ))}
          {dates.length > shownDates.length && <button class="btn block" style="margin-top:12px" onClick={() => setShowAll(true)}>Show all {dates.length} days</button>}
        </div>
      ) : <div class="card"><Empty icon="clock">No history yet.</Empty></div>}

      <div class="section"><h2>Manage</h2></div>
      <div class="row wrap">
        <button class="btn" onClick={archive}><Icon name="archive" /> {s.archived ? 'Restore student' : 'Archive student'}</button>
        <button class="btn danger" onClick={remove}><Icon name="trash" /> Delete permanently</button>
      </div>
      {editing && <StudentForm classId={s.classId} student={s} onClose={() => setEditing(false)} />}
    </div>
  );
}

function PriorityCard({ studentId, weight, raw, parts, adjust }: { studentId: string; weight: number; raw: number; parts: { label: string; delta: number }[]; adjust: number }) {
  const [open, setOpen] = useState(false);
  const desc = weight > 1.05 ? 'Checked more often than standard' : weight < 0.95 ? 'Checked a little less often than standard' : 'Standard priority';
  return (
    <div class="card">
      <div class="row between">
        <div><div class="weight">{weight.toFixed(2)}×</div><div class="small muted">{desc} (1.00)</div></div>
        <button class="btn small ghost" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'How this works'}</button>
      </div>
      <ul class="parts">
        <li><span>Base priority</span><b>1.00</b></li>
        {parts.map((p) => <li key={p.label}><span>{p.label}</span><b>{p.delta > 0 ? '+' : ''}{p.delta.toFixed(2)}</b></li>)}
        {raw !== weight && <li><span>Limited to the allowed range</span><b>{WEIGHT_MIN}–{WEIGHT_MAX}</b></li>}
      </ul>
      <div class="divider" />
      <label class="field" style="margin:0">
        <span>Teacher adjustment: {adjust > 0 ? '+' : ''}{adjust.toFixed(2)}</span>
        <input type="range" min={ADJUST_MIN} max={ADJUST_MAX} step={0.25} value={adjust} onChange={(e) => svc.setPriorityAdjust(studentId, Number((e.target as HTMLInputElement).value))} />
      </label>
      <div class="row between tiny muted"><span>Less often</span><span>More often</span></div>
      <div class="actions"><button class="btn small" onClick={async () => { await svc.resetPriority(studentId); toast('Manual priority reset (flag and adjustment cleared)'); }}>Reset manual priority</button></div>
      {open && (
        <div class="small muted stack" style="margin-top:10px">
          <p>Each lesson the app ranks students by <b>priority × (days since last check-in + 1)</b>, so everyone's turn comes round and higher-priority students come round sooner. A priority of 2.0 means roughly twice as often as 1.0.</p>
          <p>Priority starts at 1.0 and is always kept between {WEIGHT_MIN} and {WEIGHT_MAX}. It rises with a teacher flag, open follow-ups or <i>repeated</i> difficulties (two or more in four weeks; one difficulty alone never counts), and eases with reported improvement or when the student has already had several check-ins this week.</p>
          <p>Absences, skipped check-ins and “unsure” answers never count against a student. Anyone not checked for the coverage limit set in Settings is put at the front of the queue regardless of priority.</p>
        </div>
      )}
    </div>
  );
}

/** Draw weight shown as a multiplier: 1× is standard. */
export function WeightBadge({ w }: { w: number }) {
  return <span class={`wt ${w > 1.05 ? 'up' : w < 0.95 ? 'down' : ''}`} title="Draw weight: how often this student comes up compared with standard (1×)">{w.toFixed(1)}×</span>;
}
