// Daily check-in: a ranked queue of the whole class, one swipeable card at a time.
// Right (by default) = All good, left = Issue, up = Skip. Also used for "Select student"
// (one student, same card).

import { useEffect, useRef, useState } from 'preact/hooks';
import type { IcpAdjustment, IcpOutcome, Student } from '../../types';
import * as svc from '../../services';
import { CHECKIN_AREAS, UNDO_SECONDS, type CheckinArea } from '../../config/checkin';
import { lessonOf, openFollow, followLead, recentSummaries, streakDue, summaryText, type CheckinTarget } from '../../logic/checkin';
import { needWords, rankByNeed, type NeedRow } from '../../logic/need';
import { icpDueStatus } from '../../logic/icp';
import { evidenceDue } from '../../logic/evidence';
import { hasFeature } from '../../features';
import { formatShort, today } from '../../lib/dates';
import { go, useLive } from '../hooks';
import { displayName, Empty, Icon, initials, toast } from '../components';
import { SwipeCard, sideOf, type SwipeAction, type SwipeControl } from '../Swipe';
import { EvidencePrompt, EvidenceSheet } from '../Evidence';

type Step = 'card' | 'issue' | 'details' | 'icp';

const ICP_PICK: { value: IcpOutcome; label: string; cls: string }[] = [
  { value: 'implemented', label: 'Yes', cls: 'l0' },
  { value: 'partial', label: 'Partly', cls: 'l1' },
  { value: 'not', label: 'No', cls: 'l2' },
  { value: 'na', label: 'Not needed', cls: 'ln' }
];

export function CheckinScreen({ classId, studentId }: { classId: string; studentId?: string }) {
  const date = today();
  const ctx = useLive(() => svc.loadLessonContext(classId), [classId]);
  const lessonId = ctx?.lesson?.id ?? '';
  const [skipped, setSkipped] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(studentId ?? null);
  const [step, setStep] = useState<Step>('card');
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState('');
  const [follow, setFollow] = useState(true);
  const [tick, setTick] = useState(0);
  // ICP adjustments for the ICP step, fixed when the step opens (answering one marks it done for today).
  const [icpList, setIcpList] = useState<IcpAdjustment[]>([]);
  const [streakDone, setStreakDone] = useState<Set<string>>(new Set());
  const card = useRef<SwipeControl | null>(null);

  // Saved this session (before the database refresh arrives) plus everything already in the database.
  const [justLogged, setJustLogged] = useState<Set<string>>(new Set());
  const loggedHere = new Set([...(ctx?.checkins ?? []).filter((c) => lessonOf(c) === lessonId).map((c) => c.studentId), ...justLogged]);
  const ranked: NeedRow[] = ctx ? rankByNeed({ ...ctx, lessonId, today: date, excludeIds: loggedHere }) : [];
  // Skipped students go to the end, in the order they were skipped.
  const queue = [...ranked.filter((r) => !skipped.includes(r.studentId)), ...skipped.map((id) => ranked.find((r) => r.studentId === id)).filter((r): r is NeedRow => !!r)];
  const single = !!studentId;
  // Keep the current student on screen until the teacher moves on.
  useEffect(() => { if (!single && !activeId && queue[0]) setActiveId(queue[0].studentId); }, [activeId, queue[0]?.studentId]);

  if (!ctx) return ctx === null ? <p class="muted">Class not found.</p> : null;
  if (!ctx.lesson) return <NeedLesson classId={classId} name={ctx.cls.name} />;
  const { cls, students } = ctx;
  const s = students.find((x) => x.id === activeId);
  const back = `#/class/${classId}`;
  const target = (id: string): CheckinTarget => ({ studentId: id, classId, date, lessonId });

  function reset() { setStep('card'); setPicked({}); setNote(''); setFollow(true); }
  function moveOn() {
    reset();
    if (single) { go(`class/${classId}`); return; }
    setActiveId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  /** Undo for 5 seconds after any save: removes what was saved and brings the student back. */
  const markLogged = (id: string) => setJustLogged((j) => new Set([...j, id]));
  function offerUndo(label: string, studentId: string, run: () => Promise<unknown>) {
    toast(label, { label: 'Undo', seconds: UNDO_SECONDS, run: async () => { await run(); setJustLogged((j) => { const n = new Set(j); n.delete(studentId); return n; }); reset(); setActiveId(studentId); } });
  }
  function icpDue(id: string) {
    return ctx!.adjustments.filter((a) => a.studentId === id && a.active && a.startDate <= date && (!a.endDate || a.endDate >= date))
      .filter((a) => icpDueStatus(a, ctx!.icpChecks, date, true).due);
  }
  /** After a save: ICP questions if any are due, otherwise straight on. */
  function afterSave(id: string) {
    const list = icpDue(id);
    if (list.length) { setIcpList(list); setStep('icp'); }
    else moveOn();
  }

  async function allGood(id: string) {
    const r = await svc.logAllGood(target(id));
    markLogged(id);
    setTick((t) => t + 1);
    offerUndo(`All good · ${displayName(students.find((x) => x.id === id)!)}`, id, () => svc.undoCheckin(r.checkin.id));
    afterSave(id);
  }
  async function saveIssue(id: string) {
    const r = await svc.logIssue(target(id), { areas: picked, note, followUp: follow });
    markLogged(id);
    offerUndo(`Issue saved · ${displayName(students.find((x) => x.id === id)!)}`, id, () => svc.undoCheckin(r.checkin.id));
    afterSave(id);
  }
  function onCard(a: SwipeAction) {
    if (!s) return;
    if (a === 'good') allGood(s.id);
    else if (a === 'issue') setStep('issue');
    else if (single) go(`class/${classId}`);
    else { setSkipped((k) => [...k.filter((x) => x !== s.id), s.id]); setActiveId(null); }
  }

  const header = (
    <div class="row between">
      <a class="link-btn back-btn" href={back}><Icon name="back" /> {cls.name}</a>
      {!single && <span class="tiny muted mono">{loggedHere.size} seen · {queue.length} to go</span>}
    </div>
  );

  if (!s) {
    return (
      <div class="cc">
        {header}
        <div class="done-state">
          <div class="check"><Icon name="check" /></div>
          <h2>Everyone's been seen this lesson</h2>
          <p class="muted small">{cls.name} · {loggedHere.size} logged</p>
          <a class="btn primary" href={back} style="margin-top:10px">Back to {cls.name}</a>
        </div>
      </div>
    );
  }

  const row = ranked.find((r) => r.studentId === s.id);
  const sChk = ctx.checkins.filter((c) => c.studentId === s.id);
  const sObs = ctx.observations.filter((o) => o.studentId === s.id);
  const sTags = ctx.tags.filter((t) => t.studentId === s.id);
  const recent = recentSummaries(sChk, sObs, sTags, 3);
  const fu = openFollow(sChk, sObs, sTags, lessonId);
  const due = icpDue(s.id);
  const askStreak = step === 'card' && !streakDone.has(s.id) && streakDue(s, sChk, sObs, sTags, date);
  const already = sChk.find((c) => lessonOf(c) === lessonId);
  const good = { side: sideOf('good'), btn: <button class="btn big good-btn" onClick={() => card.current?.fling('good')}><Icon name="check" /> All good</button> };
  const issue = { side: sideOf('issue'), btn: <button class="btn big issue-btn" onClick={() => card.current?.fling('issue')}><Icon name="alert" /> Issue</button> };

  return (
    <div class="cc checkin">
      {header}
      {tick > 0 && <div key={tick} class="good-tick" aria-hidden="true"><Icon name="check" /></div>}

      {step === 'card' && (
        <>
          <SwipeCard key={s.id} control={card} onSwipe={onCard} labels={{ good: 'All good', issue: 'Issue', up: 'Skip' }} class="student-card">
            <div class="row" style="gap:12px">
              <span class="avatar big">{initials(s)}</span>
              <div class="grow">
                <h1 class="card-name">{displayName(s)} {s.flag && <Icon name="flag" class="flag" />}</h1>
                {row && <div class="tiny muted">{needWords(row)}</div>}
              </div>
            </div>
            {already && <p class="tiny muted" style="margin:8px 0 0">Already logged this lesson ({already.status === 'absent' ? 'not here' : already.result === 'issue' ? 'issue' : 'all good'}). Logging again replaces it.</p>}
            <div class="recent-chips">
              {recent.length ? recent.map((r) => <span key={r.checkin.id} class={`chip small result-${r.kind}`} title={formatShort(r.checkin.date)}>{summaryText(r)}</span>) : <span class="tiny muted">No check-ins yet</span>}
            </div>
            {fu && <div class="follow-box"><b>{followLead(fu, date)}:</b> {fu.text}. <b>Again?</b></div>}
            {due.length > 0 && <div class="icp-chips">{due.map((a) => <span key={a.id} class="badge burgundy">ICP: {a.title}</span>)}</div>}
            {askStreak && (
              <div class="streak-box pop-in">
                <b class="small">Consistently good lately. Exceeding in any area?</b>
                <div class="chips" style="flex-wrap:wrap;margin-top:8px">
                  {CHECKIN_AREAS.map((a) => <button key={a.id} class="chip small" onClick={async () => { await svc.answerStreak(target(s.id), a.id); setStreakDone(new Set([...streakDone, s.id])); }}>{a.name}</button>)}
                  <button class="chip small" onClick={async () => { await svc.answerStreak(target(s.id), null); setStreakDone(new Set([...streakDone, s.id])); }}>No, at level</button>
                </div>
              </div>
            )}
          </SwipeCard>
          <div class="grid2 swipe-buttons">{good.side === 'left' ? [good.btn, issue.btn] : [issue.btn, good.btn]}</div>
          <div class="row between" style="margin-top:10px">
            <button class="link-btn" onClick={() => card.current?.fling('up')}><Icon name="skip" /> {single ? 'Cancel' : 'Skip'}</button>
            <button class="link-btn" onClick={async () => {
              const id = await svc.markNotHere(target(s.id));
              markLogged(s.id);
              offerUndo(`Not here · ${displayName(s)}`, s.id, () => svc.undoCheckin(id));
              moveOn();
            }}>Not here</button>
          </div>
          <p class="hold-hint">Swipe {good.side} for all good, {issue.side} for an issue, up to skip</p>
          {!single && queue.length > 1 && (
            <div class="up-next">
              <span class="eyebrow">Up next</span>
              {queue.filter((r) => r.studentId !== s.id).slice(0, 4).map((r) => {
                const x = students.find((y) => y.id === r.studentId)!;
                return <button key={r.studentId} class="mini-row" onClick={() => { reset(); setActiveId(r.studentId); }}><span class="grow">{displayName(x)}</span><span class="tiny muted">{r.lessonsSince === null ? 'new' : r.concern > 0 ? `concerns ${r.concern}` : ''}</span></button>;
              })}
            </div>
          )}
        </>
      )}

      {step === 'issue' && (
        <IssueStep s={s} picked={picked} setPicked={setPicked} onBack={() => reset()} onNext={() => setStep('details')} />
      )}

      {step === 'details' && (
        <div class="fade-up">
          <div class="cc-eyebrow">Issue · {displayName(s)}</div>
          <h2 style="margin:6px 0 12px">Anything to add?</h2>
          {picked.coping !== undefined && <p class="small" style="margin:0 0 6px"><b>Coping with work:</b> a short note helps next time.</p>}
          <textarea class="input" autoFocus value={note} placeholder={picked.coping !== undefined ? 'What did you notice?' : 'Note (optional)'} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
          {picked.coping !== undefined && <p class="tiny muted safety-line">{CHECKIN_AREAS.find((a) => a.id === 'coping')!.safetyLine}</p>}
          <label class="check-row"><input type="checkbox" checked={follow} onChange={(e) => setFollow((e.target as HTMLInputElement).checked)} /> Follow up next time</label>
          <div class="grid2" style="margin-top:14px">
            <button class="btn" onClick={() => setStep('issue')}><Icon name="back" /> Back</button>
            <button class="btn primary" onClick={() => saveIssue(s.id)}>Save <Icon name="check" /></button>
          </div>
        </div>
      )}

      {step === 'icp' && <IcpStep s={s} due={icpList} ctx={ctx} date={date} onDone={moveOn} />}

    </div>
  );
}

/** Issue screen: tap areas, tick sub-options. Swipe towards "good" (or Back) returns with nothing saved. */
function IssueStep({ s, picked, setPicked, onBack, onNext }: { s: Student; picked: Record<string, string[]>; setPicked: (f: (p: Record<string, string[]>) => Record<string, string[]>) => void; onBack: () => void; onNext: () => void }) {
  const toggleArea = (a: CheckinArea) => setPicked((p) => {
    const next = { ...p };
    if (next[a.id]) delete next[a.id]; else next[a.id] = [];
    return next;
  });
  const toggleSub = (a: CheckinArea, sub: string) => setPicked((p) => {
    const cur = p[a.id] ?? [];
    return { ...p, [a.id]: cur.includes(sub) ? cur.filter((x) => x !== sub) : [...cur, sub] };
  });
  return (
    <SwipeCard onSwipe={(a) => a === 'good' && onBack()} allow={['good']} labels={{ good: 'Back' }} class="issue-card">
      <div class="cc-eyebrow">Issue · {displayName(s)}</div>
      <h2 style="margin:6px 0 12px">What happened?</h2>
      <div class="area-list">
        {CHECKIN_AREAS.map((a) => {
          const on = picked[a.id] !== undefined;
          return (
            <div key={a.id} class={`area-toggle ${on ? 'on' : ''}`}>
              <button class="area-btn" aria-pressed={on} onClick={() => toggleArea(a)}>{a.name}{on && <Icon name="check" />}</button>
              {on && (
                <div class="chips sub-chips pop-in">
                  {a.subs.map((x) => <button key={x.id} class={`chip small ${picked[a.id].includes(x.id) ? 'active' : ''}`} aria-pressed={picked[a.id].includes(x.id)} onClick={() => toggleSub(a, x.id)}>{x.label}</button>)}
                </div>
              )}
              {on && a.safetyLine && <p class="tiny muted safety-line">{a.safetyLine}</p>}
            </div>
          );
        })}
      </div>
      <div class="grid2" style="margin-top:14px">
        <button class="btn" onClick={onBack}><Icon name="back" /> Back</button>
        <button class="btn primary" disabled={!Object.keys(picked).length} onClick={onNext}>Next <Icon name="arrow" /></button>
      </div>
      <p class="hold-hint">Swipe {sideOf('good')} or tap Back to change your mind. Nothing is saved until you press Save.</p>
    </SwipeCard>
  );
}

/** ICP adjustments due for this student, after the swipe. Evidence prompt as before. */
function IcpStep({ s, due, ctx, date, onDone }: { s: Student; due: IcpAdjustment[]; ctx: svc.LessonContext; date: string; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, IcpOutcome>>({});
  const [evFor, setEvFor] = useState<{ adj: IcpAdjustment; reason: string } | null>(null);
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const evidence = (a: IcpAdjustment) => (hasFeature('evidence') ? evidenceDue(a, ctx.evidence, [...ctx.icpChecks, { adjustmentId: a.id }], date) : { due: false, reason: '' });
  const allAnswered = due.every((a) => answers[a.id]);
  return (
    <div class="fade-up">
      <div class="cc-eyebrow">ICP · {displayName(s)}</div>
      <h2 style="margin:6px 0 12px">Adjustments today</h2>
      {due.map((a) => {
        const ev = evidence(a);
        const showEv = (answers[a.id] === 'implemented' || answers[a.id] === 'partial') && ev.due && !asked.has(a.id);
        return (
          <div key={a.id} class="icp-step">
            <div class="small" style="font-weight:650;margin-bottom:6px">{a.title}?</div>
            <div class="grid4">
              {ICP_PICK.map((o) => (
                <button key={o.value} class={`resp ${o.cls} ${answers[a.id] === o.value ? 'sel' : ''}`} onClick={async () => { await svc.recordIcpCheck(a, date, o.value); setAnswers({ ...answers, [a.id]: o.value }); }}>{o.label}</button>
              ))}
            </div>
            {showEv && <EvidencePrompt adj={a} reason={ev.reason} onAdd={() => setEvFor({ adj: a, reason: ev.reason })} onSkip={() => setAsked(new Set([...asked, a.id]))} />}
          </div>
        );
      })}
      <button class="btn primary block" style="margin-top:14px" onClick={onDone}>{allAnswered ? 'Next student' : 'Skip ICP for now'} <Icon name="arrow" /></button>
      {evFor && <EvidenceSheet adj={evFor.adj} reason={evFor.reason} onClose={() => { setAsked(new Set([...asked, evFor.adj.id])); setEvFor(null); }} />}
    </div>
  );
}

/** Shown when a class screen is opened without an open lesson. */
export function NeedLesson({ classId, name }: { classId: string; name: string }) {
  return (
    <div class="cc">
      <a class="link-btn back-btn" href={`#/class/${classId}`}><Icon name="back" /> {name}</a>
      <div class="done-state">
        <h2>Open a lesson first</h2>
        <p class="muted small">Everything you log is saved to the lesson.</p>
        <a class="btn primary" href={`#/class/${classId}`} style="margin-top:10px">Open lesson</a>
      </div>
    </div>
  );
}

/** "Select student": search the class, then the same card for one student. */
export function SelectStudentScreen({ classId }: { classId: string }) {
  const ctx = useLive(() => svc.loadLessonContext(classId), [classId]);
  const [q, setQ] = useState('');
  if (!ctx) return null;
  if (!ctx.lesson) return <NeedLesson classId={classId} name={ctx.cls.name} />;
  const lessonId = ctx.lesson.id;
  const logged = new Set(ctx.checkins.filter((c) => lessonOf(c) === lessonId).map((c) => c.studentId));
  const list = [...ctx.students].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
    .filter((s) => !q || displayName(s).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <a class="link-btn back-btn" href={`#/class/${classId}`}><Icon name="back" /> {ctx.cls.name}</a>
      <h1 style="margin:8px 0 12px">Select student</h1>
      <input class="input" type="search" autoFocus placeholder="Search by name" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="card flat" style="padding:4px 14px;margin-top:12px">
        <div class="mini-list">
          {list.map((s) => (
            <a key={s.id} class="mini-row" href={`#/class/${classId}/student/${s.id}`}>
              <span class="grow">{displayName(s)}</span>
              {logged.has(s.id) ? <span class="ok"><Icon name="check" /></span> : <Icon name="chevron" />}
            </a>
          ))}
          {!list.length && <Empty icon="search">No one matches “{q}”.</Empty>}
        </div>
      </div>
    </div>
  );
}
