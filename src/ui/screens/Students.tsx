import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { db, getSettings, saveSettings, sortedCategories } from '../../db';
import * as svc from '../../services';
import { lastCheckedDate } from '../../logic/priority';
import { needByStudent, needWords, type NeedRow } from '../../logic/need';
import { openFollow, followLead } from '../../logic/checkin';
import { homeworkHistory } from '../../logic/lessons';
import { coldCallHistory, coldCallsLastLessons, coldCallStats } from '../../logic/coldcall';
import { EVIDENCE_KINDS } from '../../logic/evidence';
import { studentTimeline } from '../../logic/timeline';
import { categoryTrend } from '../../logic/trends';
import { rollingShare } from '../../logic/insights';
import { TrendLine } from '../TrendLine';
import { blitzTopic } from '../../logic/blitz';
import { icpDueStatus, implementationSummary, ICP_FREQUENCIES, ICP_OUTCOMES } from '../../logic/icp';
import { daysBetween, formatDate, formatShort, relativeDay, today } from '../../lib/dates';
import { go, useLive } from '../hooks';
import { Avatar, displayName, Empty, Icon, PageHead, levelBadge, toast } from '../components';
import { StudentForm } from './Classes';
import { homeworkText } from './Homework';
import { subLabel } from '../../config/checkin';

type Filter = 'all' | 'flagged' | 'followup' | 'overdue' | 'archived';

export function StudentsScreen() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [classId, setClassId] = useState('');
  const data = useLive(async () => {
    const [classes, students, observations, checkins, tags, homework, settings, lessons] = await Promise.all([
      db.classes.toArray(), db.students.toArray(), db.observations.toArray(), db.checkins.toArray(),
      db.issueTags.toArray(), db.homework.toArray(), getSettings(), db.lessons.toArray()
    ]);
    return { classes, students, observations, checkins, tags, homework, settings, lessons };
  }, []);
  if (!data) return null;
  const date = today();
  const obsBy = group(data.observations, (o) => o.studentId);
  const chkBy = group(data.checkins, (c) => c.studentId);
  const className = (id: string) => data.classes.find((c) => c.id === id)?.name ?? '';
  const need = needByStudent(data.students, data.checkins, data.observations, data.tags, data.homework, date, data.lessons);
  const tagBy = group(data.tags, (t) => t.studentId);

  const rows = data.students
    .filter((s) => (filter === 'archived' ? s.archived : !s.archived))
    .filter((s) => !classId || s.classId === classId)
    .filter((s) => `${s.firstName} ${s.lastName} ${s.preferredName ?? ''} ${s.externalId ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .map((s) => {
      const last = lastCheckedDate(chkBy.get(s.id) ?? []);
      const days = last ? daysBetween(last, date) : null;
      const follow = openFollow(chkBy.get(s.id) ?? [], obsBy.get(s.id) ?? [], tagBy.get(s.id) ?? []) ? 1 : 0;
      return { s, last, days, follow, row: need.get(s.id), overdue: days === null || days >= data.settings.maxGapDays };
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
          {rows.map(({ s, last, follow, overdue, row }) => (
            <a key={s.id} class="list-item" href={`#/students/${s.id}`}>
              <Avatar s={s} />
              <span class="grow">
                <span class="title">{displayName(s)}</span>
                <div class="sub">{className(s.classId)} · {last ? `checked ${relativeDay(last)}` : 'not yet checked in'}</div>
              </span>
              {row && <NeedBadge r={row} />}
              {s.flag && <span class="badge flag"><Icon name="flag" /></span>}
              {follow > 0 && <span class="badge some">Follow-up</span>}
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
    const [cls, observations, checkins, questions, allQuestions, categories, notes, adjustments, icpChecks, timetable, classStudents, classCheckins, classObs, classTags, classHomework, classLessons, coldCalls, evidence] = await Promise.all([
      db.classes.get(student.classId), db.observations.where('studentId').equals(id).toArray(), db.checkins.where('studentId').equals(id).toArray(),
      db.questions.filter((q) => q.enabled).toArray(), db.questions.toArray(), sortedCategories(), db.notes.where('studentId').equals(id).toArray(),
      db.icpAdjustments.where('studentId').equals(id).toArray(), db.icpChecks.where('studentId').equals(id).toArray(),
      db.timetable.where('classId').equals(student.classId).toArray(),
      db.students.where('classId').equals(student.classId).toArray(), db.checkins.where('classId').equals(student.classId).toArray(),
      db.observations.where('classId').equals(student.classId).toArray(), db.issueTags.where('classId').equals(student.classId).toArray(),
      db.homework.where('classId').equals(student.classId).toArray(), db.lessons.where('classId').equals(student.classId).toArray(),
      db.coldCalls.where('studentId').equals(id).toArray(), db.evidence.where('studentId').equals(id).toArray()
    ]);
    const row = needByStudent(classStudents, classCheckins, classObs, classTags, classHomework, today(), classLessons).get(id);
    const tags = classTags.filter((t) => t.studentId === id);
    const homework = classHomework.filter((h) => h.studentId === id);
    return { student, cls, observations, checkins, questions, allQuestions, categories, notes, adjustments, icpChecks, timetable, row, tags, homework, classLessons, coldCalls, evidence };
  }, [id]);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [showAll, setShowAll] = useState(false);

  if (!data) return null;
  if (!data.student) return <p>Student not found. <a href="#/students">Back</a></p>;
  const { student: s, cls, observations, checkins, allQuestions, categories, notes, adjustments, icpChecks, timetable, row, tags, homework, classLessons, coldCalls, evidence } = data as Required<typeof data>;
  const ccRecentLessons = coldCallsLastLessons(coldCalls, classLessons, s.classId, s.id);
  const hwHistory = homeworkHistory(classLessons, homework, s.classId, s.id);
  const ccStats = coldCallStats(coldCalls, date);
  const ccRecent = coldCallHistory(coldCalls, classLessons, s.id, 5);
  const byLesson = studentTimeline({ lessons: classLessons, checkins, observations, tags, homework, coldCalls, studentId: s.id }, 10);
  const follow = openFollow(checkins, observations, tags);
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
    await saveSettings({ currentClassId: s.classId });
    go(`class/${s.classId}/student/${s.id}`);
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
  for (const c of checkins) {
    if (c.result === 'good') items.push({ date: c.date, t: c.createdAt, kind: 'status', el: <div class="tl-item"><span class="badge blue">All good</span></div> });
  }
  for (const h of homework) items.push({ date: h.date, t: h.createdAt, kind: 'hw', el: <div class={`tl-item ${h.done ? '' : 'difficulty'}`}><span class="label-tag">Homework</span><span class="badge">{homeworkText(h)}</span></div> });
  for (const o of observations) {
    // Implied values (All good, untapped areas) are summarised by the "All good" line above.
    if (o.source === 'implied') continue;
    const subs = tags.filter((t) => t.checkinId === o.checkinId && t.areaId === o.categoryId).map((t) => subLabel(t.areaId, t.tagId).toLowerCase());
    const q = allQuestions.find((x) => x.id === o.questionId);
    items.push({
      date: o.date, t: o.createdAt, kind: 'obs',
      el: (
        <div class={`tl-item ${o.level === 2 ? 'sig' : o.level === 1 ? 'difficulty' : ''}`}>
          <span class="label-tag">{catName(o.categoryId)}</span>
          <span class={`badge ${levelBadge(o.level)}`}>{o.blitz ? `Blitz · ${blitzTopic(o.blitz)?.label ?? o.blitz}: ${o.response}` : o.followUp ? `Follow-up: ${o.response}` : o.response}</span>
          {subs.length > 0 && <span class="small"> · {subs.join(', ')}</span>}
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
  // Evidence added to daily check-ins ("Include evidence?"). ICP evidence lives on the ICP page.
  for (const e of evidence.filter((x) => x.checkinId)) {
    items.push({ date: e.date, t: e.createdAt, kind: 'evidence', el: <div class="tl-item"><span class="label-tag">Evidence</span>{EVIDENCE_KINDS.find((k) => k.value === e.kind)?.label ?? e.kind}{e.name ? ` · ${e.name}` : ''}{e.text && <div class="small">{e.text}</div>}</div> });
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
        <div class="card flat" style="margin:0"><span class="eyebrow">Open follow-up</span><b>{follow ? follow.text : 'None'}</b><div class="tiny muted">{follow ? `${followLead(follow, date)} · shown on the next check-in` : 'Shown on the card at the next check-in'}</div></div>
      </div>

      <div class="section"><h2>Place in the queue</h2></div>
      {row && <NeedCard r={row} />}
      <div class="grid2 cc-glance">
        <div class="card flat" style="margin:0"><span class="eyebrow">Cold calls · last 5 lessons</span><b>{ccRecentLessons.count}</b><div class="tiny muted">{ccRecentLessons.prevCount} in the 5 before</div></div>
        <div class="card flat" style="margin:0">
          <span class="eyebrow">Answered well · last 5 lessons</span>
          <b>{ccRecentLessons.goodPct === null ? '–' : `${ccRecentLessons.goodPct}%`} {ccRecentLessons.trend && <span class={`trend-arrow ${ccRecentLessons.trend}`} aria-label={`Trend ${ccRecentLessons.trend}`}>{ccRecentLessons.trend === 'up' ? '↑' : ccRecentLessons.trend === 'down' ? '↓' : '→'}</span>}</b>
          <div class="tiny muted">{ccRecentLessons.prevGoodPct === null ? 'Nothing to compare yet' : `${ccRecentLessons.prevGoodPct}% in the 5 before`}</div>
        </div>
      </div>

      {hwHistory.length > 0 && (
        <>
          <div class="section"><h2>Homework</h2><span class="tiny muted">last 5 lessons with homework</span></div>
          <div class="card flat" style="padding:4px 14px">
            {hwHistory.map((h) => (
              <div key={h.key} class="recent-row"><span class="grow">{h.label}{h.what ? <div class="tiny muted">{h.what}</div> : null}</span><span class={`status ${h.done === null ? 'none' : h.done ? 'meeting' : 'support'}`}>{h.result}</span></div>
            ))}
          </div>
        </>
      )}

      {ccStats.total > 0 && (
        <>
          <div class="section"><h2>Cold calls</h2><span class="tiny muted">{ccStats.total} total</span></div>
          <div class="card">
            <div class="row between"><b>{ccStats.goodPct}% answered well</b>{ccStats.topStruggle && <span class="tiny muted">Most common struggle: {ccStats.topStruggle.toLowerCase()}</span>}</div>
            <TrendLine values={ccStats.weekly.map((w) => w.share)} height={40} labels={['8 weeks ago', 'this week']} />
            <div style="margin-top:8px">{ccRecent.map((h) => <div key={h.call.id} class="tiny"><span class={h.call.result === 'good' ? 'ok' : 'warn'}>●</span> {h.text}</div>)}</div>
          </div>
        </>
      )}

      {byLesson.length > 0 && (
        <>
          <div class="section"><h2>Lesson by lesson</h2><span class="tiny muted">last {byLesson.length}</span></div>
          <div class="card flat" style="padding:4px 14px">
            {byLesson.map((r) => <div key={r.lesson.id} class="lesson-row">{r.text}</div>)}
          </div>
        </>
      )}

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

function NeedCard({ r }: { r: NeedRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="card">
      <div class="row between">
        <b>{needWords(r)}</b>
        <button class="btn small ghost" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'How this works'}</button>
      </div>
      {r.reasons.length > 0 && <ul class="parts">{r.reasons.map((x) => <li key={x}><span>{x}</span></li>)}</ul>}
      {open && (
        <div class="small muted stack" style="margin-top:10px">
          <p>The daily check-in shows the class as a queue, most need first. Need adds up two things: <b>recent concerns</b> (issues, Blitz "No"s and homework not done, each counting half as much after two weeks, plus an open follow-up or a flag) and <b>lessons since last seen</b> in this class.</p>
          <p>Everyone starts at 0 concerns, and students who haven't been seen yet come first, so a new class works through everyone before anyone comes up twice. After that, students with recent concerns come up about twice as often.</p>
          <p>"Not here" and skipped students never count against anyone.</p>
        </div>
      )}
    </div>
  );
}

/** Compact need on lists: concerns (if any) and lessons since last seen. */
export function NeedBadge({ r }: { r: Pick<NeedRow, 'concern' | 'lessonsSince'> }) {
  return (
    <span class={`wt ${r.concern >= 1 ? 'up' : ''}`} title={needWords(r)}>
      {r.concern > 0 ? `${r.concern} · ` : ''}{r.lessonsSince === null ? 'new' : `${r.lessonsSince}L`}
    </span>
  );
}
