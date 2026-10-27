import { useEffect, useRef, useState } from 'preact/hooks';
import { db, sortedCategories } from '../../db';
import type { EvidenceItem, IcpAdjustment, IcpCheck, IcpOutcome, Student, TimetableEntry } from '../../types';
import * as svc from '../../services';
import { compareBeforeAfter, icpDueStatus, implementationSummary, ICP_FREQUENCIES, ICP_OUTCOMES } from '../../logic/icp';
import { formatDate, formatShort, relativeDay, today, weekday } from '../../lib/dates';
import { useLive } from '../hooks';
import { Avatar, displayName, Empty, Icon, PageHead } from '../components';
import { HoldOpt } from './Today';
import { evidenceDue } from '../../logic/evidence';
import { hasFeature } from '../../features';
import { downloadEvidencePack, EvidencePrompt, EvidenceSection, EvidenceSheet } from '../Evidence';
import { AdjustmentForm, IcpImport } from '../IcpForms';


function hasLesson(timetable: TimetableEntry[], classId: string, date: string) {
  const forClass = timetable.filter((t) => t.classId === classId);
  return !forClass.length || forClass.some((t) => t.day === weekday(date));
}

/** `classFilter`: opened from a class page (ICP button), showing that class only, with Back to the class. */
export function IcpScreen({ studentId, mode, classFilter }: { studentId?: string; mode?: string; classFilter?: string }) {
  const date = today();
  const data = useLive(async () => {
    const [classes, students, adjustments, checks, timetable, observations, categories, evidence] = await Promise.all([
      db.classes.toArray(), db.students.toArray(), db.icpAdjustments.toArray(), db.icpChecks.toArray(), db.timetable.toArray(),
      studentId ? db.observations.where('studentId').equals(studentId).toArray() : Promise.resolve([]), sortedCategories(),
      studentId ? db.evidence.where('studentId').equals(studentId).toArray() : db.evidence.toArray()
    ]);
    return { classes, students, adjustments, checks, timetable, observations, categories, evidence };
  }, [studentId]);
  const [classId, setClassId] = useState(classFilter ?? '');
  const [form, setForm] = useState<{ adj?: IcpAdjustment; studentId?: string } | null>(null);
  const [evFor, setEvFor] = useState<{ adj: IcpAdjustment; reason?: string } | null>(null);
  const [importing, setImporting] = useState(false);
  if (!data) return null;
  const evidenceSheet = evFor && <EvidenceSheet adj={data.adjustments.find((a) => a.id === evFor.adj.id) ?? evFor.adj} reason={evFor.reason} onClose={() => setEvFor(null)} />;
  // Just answered counts as recorded, before the new check has reached `data`.
  const evDue = (a: IcpAdjustment) => hasFeature('evidence') ? evidenceDue(a, data.evidence, [...data.checks, { adjustmentId: a.id }], date) : { due: false, reason: '' };

  const studentOf = (id: string) => data.students.find((s) => s.id === id);
  const classOf = (id: string) => data.classes.find((c) => c.id === id);

  if (studentId && mode === 'check') {
    const s = studentOf(studentId);
    if (!s) return <p>Student not found.</p>;
    const items = data.adjustments
      .filter((a) => a.studentId === s.id && a.active)
      .map((a) => ({ a, st: icpDueStatus(a, data.checks, date, hasLesson(data.timetable, s.classId, date)) }))
      .filter((x) => x.st.due || x.st.doneToday)
      .map((x) => x.a);
    return <><IcpSurvey s={s} className={classOf(s.classId)?.name ?? ''} items={items} checks={data.checks} date={date} evDue={evDue} onEvidence={(adj) => setEvFor({ adj, reason: evDue(adj).reason })} />{evidenceSheet}</>;
  }

  if (studentId) {
    const s = studentOf(studentId);
    if (!s) return <p>Student not found.</p>;
    return <><StudentIcp s={s} className={classOf(s.classId)?.name ?? ''} data={data} date={date} onEdit={(adj) => setForm({ adj, studentId })} form={form} closeForm={() => setForm(null)} onEvidence={(adj) => setEvFor({ adj })} />{evidenceSheet}</>;
  }

  const active = data.adjustments.filter((a) => {
    const s = studentOf(a.studentId);
    return a.active && s && !s.archived && !classOf(s.classId)?.archived && (!classId || s.classId === classId);
  });
  const withStatus = active.map((a) => {
    const s = studentOf(a.studentId)!;
    return { a, s, st: icpDueStatus(a, data.checks, date, hasLesson(data.timetable, s.classId, date)) };
  }).filter((x) => x.st.due || x.st.doneToday);
  // One entry per student, however many adjustments they have today.
  const groups = [...new Set(withStatus.map((x) => x.s.id))].map((id) => {
    const items = withStatus.filter((x) => x.s.id === id);
    return { s: items[0].s, items, done: items.filter((x) => x.st.doneToday).length, overdue: items.some((x) => x.st.overdue) };
  });
  const pending = groups.filter((g) => g.done < g.items.length).sort((x, y) => Number(y.overdue) - Number(x.overdue));
  const finished = groups.filter((g) => g.done === g.items.length);
  const studentsWithAdj = [...new Set(data.adjustments.map((a) => a.studentId))].map(studentOf).filter((s): s is Student => !!s && (!classId || s.classId === classId));
  const classesWithAdj = data.classes.filter((c) => !c.archived && data.adjustments.some((a) => studentOf(a.studentId)?.classId === c.id));
  const checkFor = (aId: string) => data.checks.find((c) => c.adjustmentId === aId && c.date === date);

  return (
    <div>
      <PageHead eyebrow={classFilter ? `ICP Check-In · ${classOf(classFilter)?.name ?? "Class"}` : "Individual Curriculum Plans"} title="ICP Check-In" back={classFilter ? `#/class/${classFilter}` : undefined}>
        <button class="btn small" onClick={() => setImporting(true)}><Icon name="upload" /> Import</button>
        <button class="btn primary small" onClick={() => setForm({})}><Icon name="plus" /> Adjustment</button>
      </PageHead>
      {!classFilter && <div class="chips">
        <button class={`chip small ${!classId ? 'active' : ''}`} onClick={() => setClassId('')}>All classes</button>
        {classesWithAdj.map((c) => <button key={c.id} class={`chip small ${classId === c.id ? 'active' : ''}`} onClick={() => setClassId(c.id)}>{c.name}</button>)}
      </div>}

      <div class="section"><h2>Due today</h2><span class="tiny muted mono">{pending.length} student{pending.length === 1 ? '' : 's'}</span></div>
      {pending.length ? pending.map((g) => g.items.length > SURVEY_THRESHOLD ? (
        <a key={g.s.id} class="card icp-group link-card" href={`#/icp/${g.s.id}/check`}>
          <Avatar s={g.s} />
          <span class="grow">
            <b>{displayName(g.s)}</b>
            <div class="tiny muted ellipsis">{classOf(g.s.classId)?.name} · {g.items.map((x) => x.a.title).join(', ')}</div>
          </span>
          {g.overdue && g.done === 0 && <span class="badge some">Overdue</span>}
          <Ring done={g.done} total={g.items.length} />
        </a>
      ) : (
        <div key={g.s.id} class="card icp-group">
          <div class="row">
            <Avatar s={g.s} />
            <span class="grow"><b>{displayName(g.s)}</b><div class="tiny muted">{classOf(g.s.classId)?.name}</div></span>
            {g.overdue && g.done === 0 && <span class="badge some">Overdue</span>}
            <Ring done={g.done} total={g.items.length} />
          </div>
          {g.items.map(({ a }) => {
            const c = checkFor(a.id);
            return (
              <div key={a.id} class="icp-inline">
                <div class="small" style="font-weight:600">{a.title}</div>
                <div class="seg" role="group" aria-label={a.title}>
                  {ICP_OUTCOMES.map((o) => (
                    <button key={o.value} class={c?.outcome === o.value ? 'sel' : ''} onClick={async () => {
                      await svc.recordIcpCheck(a, date, o.value);
                      // Evidence due: ask straight away (the sheet has upload / take a picture / not today).
                      if ((o.value === 'implemented' || o.value === 'partial') && evDue(a).due) setEvFor({ adj: a, reason: evDue(a).reason });
                    }}>
                      {o.value === 'implemented' ? 'Yes' : o.value === 'partial' ? 'Partly' : o.value === 'not' ? 'No' : 'N/A'}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )) : <div class="card"><Empty icon="icp">{active.length ? 'All ICP check-ins due today are recorded.' : 'No active adjustments yet. Add one to start tracking.'}</Empty></div>}

      {finished.length > 0 && (
        <>
          <div class="section"><h2>Done today</h2><span class="tiny muted mono">{finished.length}</span></div>
          <div class="list">
            {finished.map((g) => (
              <a key={g.s.id} class="list-item" href={`#/icp/${g.s.id}/check`}>
                <Avatar s={g.s} />
                <span class="grow"><span class="title">{displayName(g.s)}</span><div class="sub">{g.items.length} of {g.items.length} recorded</div></span>
                <span class="badge ok"><Icon name="check" /> Done</span>
              </a>
            ))}
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
      {importing && <IcpImport onClose={() => setImporting(false)} />}
      {evidenceSheet}
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

function StudentIcp({ s, className, data, date, onEdit, form, closeForm, onEvidence }: {
  s: Student; className: string; date: string; onEdit: (a?: IcpAdjustment) => void; form: { adj?: IcpAdjustment } | null; closeForm: () => void; onEvidence: (a: IcpAdjustment) => void;
  data: { evidence: EvidenceItem[]; adjustments: IcpAdjustment[]; checks: IcpCheck[]; timetable: TimetableEntry[]; observations: import('../../types').Observation[]; categories: import('../../types').Category[]; students: Student[]; classes: import('../../types').SchoolClass[] };
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
        {data.evidence.length > 0 && <button class="btn small" onClick={() => downloadEvidencePack(s, displayName(s))}><Icon name="download" /> Evidence pack ({data.evidence.length})</button>}
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
            <EvidenceSection adj={a} items={data.evidence} checks={data.checks} onAdd={() => onEvidence(a)} />

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

/** Students with more than this many adjustments due go through a survey; others answer on the list. */
const SURVEY_THRESHOLD = 2;

function Ring({ done, total }: { done: number; total: number }) {
  const c = 2 * Math.PI * 14;
  return (
    <svg class="ring" viewBox="0 0 36 36" aria-label={`${done} of ${total} recorded`}>
      <circle cx="18" cy="18" r="14" fill="none" stroke="var(--line)" stroke-width="4" />
      <circle cx="18" cy="18" r="14" fill="none" stroke="var(--burgundy)" stroke-width="4" stroke-dasharray={c} stroke-dashoffset={c * (1 - (total ? done / total : 0))} transform="rotate(-90 18 18)" stroke-linecap="round" />
      <text x="18" y="22" text-anchor="middle" font-size="10" font-weight="700" fill="var(--ink)">{done}/{total}</text>
    </svg>
  );
}

const ICP_PICK: { value: IcpOutcome; label: string; cls: string }[] = [
  { value: 'implemented', label: 'Yes', cls: 'l0' },
  { value: 'partial', label: 'Partly', cls: 'l1' },
  { value: 'not', label: 'No', cls: 'l2' },
  { value: 'na', label: 'Not needed today', cls: 'ln' }
];

/** One adjustment at a time, like the daily check-ins; ends with a summary. */
function IcpSurvey({ s, className, items, checks, date, evDue, onEvidence }: { s: Student; className: string; items: IcpAdjustment[]; checks: IcpCheck[]; date: string; evDue: (a: IcpAdjustment) => { due: boolean; reason: string }; onEvidence: (a: IcpAdjustment) => void }) {
  const answered = (a: IcpAdjustment) => checks.find((c) => c.adjustmentId === a.id && c.date === date);
  const first = items.findIndex((a) => !answered(a));
  const [idx, setIdx] = useState(first < 0 ? 0 : first);
  const [summary, setSummary] = useState(first < 0 && items.length > 0);
  const [leaving, setLeaving] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [askEvidence, setAskEvidence] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // Once evidence is added (or "Not today"), move on to the next adjustment.
  const evStillDue = items.length > 0 && evDue(items[idx]).due;
  useEffect(() => { if (askEvidence && !evStillDue) next(); }, [askEvidence, evStillDue]);
  const back = '#/icp';
  const lastChecked = checks.filter((c) => c.studentId === s.id && c.date < date).map((c) => c.date).sort().pop();

  if (!items.length) {
    return <div><PageHead eyebrow="ICP" title={displayName(s)} back={back} /><div class="card"><Empty icon="icp">Nothing due for {s.preferredName || s.firstName} today.</Empty></div></div>;
  }
  const next = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLeaving(true);
      timer.current = setTimeout(() => { setLeaving(false); setNoteOpen(false); setAskEvidence(false); if (idx < items.length - 1) setIdx(idx + 1); else setSummary(true); }, 220);
    }, 160);
  };

  if (summary) {
    return (
      <div class="cc fade-up">
        <div class="done-state">
          <div class="check"><Icon name="check" /></div>
          <h2>{displayName(s)}</h2>
          <p class="muted small">{items.length} adjustment{items.length === 1 ? '' : 's'} recorded</p>
        </div>
        <div class="card flat" style="padding:4px 14px">
          {items.map((a) => {
            const c = answered(a);
            const o = ICP_PICK.find((x) => x.value === c?.outcome);
            return (
              <div class="recent-row" key={a.id}>
                <span class="grow">{a.title}{c?.note ? <div class="tiny muted">“{c.note}”</div> : null}</span>
                <span class={`status ${o?.value === 'implemented' ? 'meeting' : o ? 'support' : 'none'}`}>{o?.label ?? 'Not recorded'}</span>
              </div>
            );
          })}
        </div>
        <a class="btn primary block" style="margin-top:16px" href={back}>Back to the list</a>
        <button class="btn block" style="margin-top:8px" onClick={() => { setSummary(false); setIdx(0); }}>Review answers</button>
      </div>
    );
  }

  const a = items[idx];
  const cur = answered(a);
  return (
    <div class="cc">
      <div class="row between">
        <a class="link-btn back-btn" href={back}><Icon name="back" /> ICP Check-In</a>
        <a class="link-btn" href={back}>Skip</a>
      </div>
      <div class="segbar" style="margin-top:6px">{items.map((x, k) => <i key={x.id} class={answered(x) || k === idx ? 'on' : ''} />)}</div>
      <div class="cc-eyebrow" style="margin-top:8px">ICP · {idx + 1} of {items.length}</div>
      <div class="cc-head"><h1>{displayName(s)}</h1></div>
      <p class="cc-sub">{className}{lastChecked ? ` · last checked ${relativeDay(lastChecked, date)}` : ''}</p>
      <div key={a.id} class={leaving ? "q-step q-leave" : "q-step q-enter"}>
        <div class="cc-q" style="margin-bottom:6px">{a.title} today?</div>
        {a.details && <p class="small muted" style="margin:0 0 14px">{a.details}</p>}
        <div class="cc-opts">
          {ICP_PICK.map((o) => (
            <HoldOpt key={o.value} cls={o.cls} selected={cur?.outcome === o.value} label={o.label} canHold
              onPick={async (held) => {
                clearTimeout(timer.current);
                await svc.recordIcpCheck(a, date, o.value);
                if (held) { setDraft(cur?.note ?? ''); setNoteOpen(true); }
                else if ((o.value === 'implemented' || o.value === 'partial') && evDue(a).due) setAskEvidence(true);
                else next();
              }} />
          ))}
        </div>
        {noteOpen ? (
          <div class="note-box pop-in">
            <div class="note-title">Note</div>
            <textarea class="input" autoFocus value={draft} placeholder="Context for this adjustment" onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)} />
            <button class="btn primary block" style="margin-top:10px" onClick={async () => { await svc.updateIcpNote(`${a.id}|${date}`, draft.trim()); next(); }}>{draft.trim() ? 'Save and next' : 'Next'} <Icon name="arrow" /></button>
          </div>
        ) : askEvidence && evDue(a).due ? (
          <EvidencePrompt adj={a} reason={evDue(a).reason} onAdd={() => onEvidence(a)} onSkip={() => undefined} />
        ) : <p class="hold-hint">{cur?.note ? `“${cur.note}” · hold to edit` : 'Hold an answer to add a note'}</p>}
      </div>
      <div class="cc-foot">
        <button class="link-btn back-btn" onClick={() => (idx > 0 ? setIdx(idx - 1) : (location.hash = back))}><Icon name="back" /> Back</button>
        <div class="step-dots">{items.map((x, k) => <button key={x.id} class={k === idx ? 'cur' : answered(x) ? 'done' : ''} aria-label={`Adjustment ${k + 1}`} onClick={() => setIdx(k)} />)}</div>
        <span style="width:48px" />
      </div>
    </div>
  );
}
