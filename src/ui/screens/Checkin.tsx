// Daily check-in: a ranked queue of the whole class, one swipeable card at a time.
// Right (by default) = All good, left = Issue, up = Skip. Also used for "Select student"
// (one student, same card). A daily target per lesson ("3 of 5 today") with clear stopping points.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { IcpAdjustment, IcpOutcome, Student } from '../../types';
import * as svc from '../../services';
import { saveSettings } from '../../db';
import { CHECKIN_AREAS, SUB_HINT_TIMES, UNDO_SECONDS, WELLBEING, type CheckinArea, type SubOption } from '../../config/checkin';
import { areaAverage, checkinIdFor, lessonOf, openFollow, followLead, streakDue, wellbeingRecent, type CheckinTarget } from '../../logic/checkin';
import { issueSwipe, type IssueOutcome } from '../../logic/swipe';
import { needWords, rankByNeed, type NeedRow } from '../../logic/need';
import { extraMessage, milestoneAfter, type Milestone } from '../../logic/target';
import { icpDueStatus } from '../../logic/icp';
import { evidenceDue } from '../../logic/evidence';
import { hasFeature } from '../../features';
import { today } from '../../lib/dates';
import { go, useLive, useSettings } from '../hooks';
import { displayName, Empty, Icon, initials, Switch, toast } from '../components';
import { SwipeCard, haptic, sideOf, type SwipeAction, type SwipeControl } from '../Swipe';
import { EvidencePrompt, EvidenceSheet } from '../Evidence';

type Step = 'card' | 'issue' | 'icp';

const ICP_PICK: { value: IcpOutcome; label: string; cls: string }[] = [
  { value: 'implemented', label: 'Yes', cls: 'l0' },
  { value: 'partial', label: 'Partly', cls: 'l1' },
  { value: 'not', label: 'No', cls: 'l2' },
  { value: 'na', label: 'Not needed', cls: 'ln' }
];

/** Everything typed or ticked on the issue screen. */
interface IssueDraft {
  picked: Record<string, string[]>;
  minor: Record<string, string[]>;
  noteOn: boolean;
  note: string;
  subNotes: Record<string, string>;
  follow: boolean;
}
const EMPTY_DRAFT: IssueDraft = { picked: {}, minor: {}, noteOn: false, note: '', subNotes: {}, follow: true };

export function CheckinScreen({ classId, studentId }: { classId: string; studentId?: string }) {
  const date = today();
  const ctx = useLive(() => svc.loadLessonContext(classId), [classId]);
  const settings = useSettings();
  const lessonId = ctx?.lesson?.id ?? '';
  const [skipped, setSkipped] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(studentId ?? null);
  const [step, setStep] = useState<Step>('card');
  const [draft, setDraft] = useState<IssueDraft>(EMPTY_DRAFT);
  const [withEvidence, setWithEvidence] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceCount, setEvidenceCount] = useState(0);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  // ICP adjustments for the ICP step, fixed when the step opens (answering one marks it done for today).
  const [icpList, setIcpList] = useState<IcpAdjustment[]>([]);
  const [streakDone, setStreakDone] = useState<Set<string>>(new Set());
  const card = useRef<SwipeControl | null>(null);

  // Saved this session (before the database refresh arrives) plus everything already in the database.
  const [justLogged, setJustLogged] = useState<Set<string>>(new Set());
  /** All good / Issue saved this session: these count toward the target ("Not here" doesn't). */
  const [justChecked, setJustChecked] = useState<Set<string>>(new Set());
  const thisLesson = (ctx?.checkins ?? []).filter((c) => lessonOf(c) === lessonId);
  const loggedHere = new Set([...thisLesson.map((c) => c.studentId), ...justLogged]);
  const checkedHere = new Set([...thisLesson.filter((c) => c.status === 'complete' || c.status === 'partial').map((c) => c.studentId), ...justChecked]);
  const ranked: NeedRow[] = ctx ? rankByNeed({ ...ctx, lessonId, today: date, excludeIds: loggedHere }) : [];
  // Skipped students go to the end, in the order they were skipped.
  const queue = [...ranked.filter((r) => !skipped.includes(r.studentId)), ...skipped.map((id) => ranked.find((r) => r.studentId === id)).filter((r): r is NeedRow => !!r)];
  const single = !!studentId;
  const target = ctx ? ctx.cls.dailyTarget ?? settings?.dailyTarget ?? 5 : 5;
  // Keep the current student on screen until the teacher moves on.
  useEffect(() => { if (!single && !activeId && queue[0]) setActiveId(queue[0].studentId); }, [activeId, queue[0]?.studentId]);

  if (!ctx) return ctx === null ? <p class="muted">Class not found.</p> : null;
  if (!ctx.lesson) return <NeedLesson classId={classId} name={ctx.cls.name} />;
  const { cls, students } = ctx;
  const s = students.find((x) => x.id === activeId);
  const back = `#/class/${classId}`;
  const targetOf = (id: string): CheckinTarget => ({ studentId: id, classId, date, lessonId });

  function reset() { setStep('card'); setDraft(EMPTY_DRAFT); setWithEvidence(false); setEvidenceOpen(false); setEvidenceCount(0); }
  function moveOn() {
    reset();
    if (single) { go(`class/${classId}`); return; }
    setActiveId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  /** Marks a student as done this lesson; All good / Issue also count toward the target. */
  const markLogged = (id: string, checked: boolean) => {
    setJustLogged((j) => new Set([...j, id]));
    if (!checked) return;
    setJustChecked((j) => new Set([...j, id]));
    const count = new Set([...checkedHere, id]).size;
    const everyoneSeen = !queue.some((r) => r.studentId !== id);
    if (!single) setMilestone(milestoneAfter(count, target, { extra: settings?.extraEncouragement !== false, everyoneSeen }));
  };
  /** Undo for 5 seconds after any save: removes what was saved and brings the student back. */
  function offerUndo(label: string, studentId: string, run: () => Promise<unknown>) {
    toast(label, {
      label: 'Undo', seconds: UNDO_SECONDS, run: async () => {
        await run();
        const drop = (j: Set<string>) => { const n = new Set(j); n.delete(studentId); return n; };
        setJustLogged(drop); setJustChecked(drop); setMilestone(null); reset(); setActiveId(studentId);
      }
    });
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
    const r = await svc.logAllGood(targetOf(id));
    markLogged(id, true);
    offerUndo(`All good · ${displayName(students.find((x) => x.id === id)!)}`, id, () => svc.undoCheckin(r.checkin.id));
    afterSave(id);
  }
  async function saveIssue(id: string) {
    const d = draft;
    const r = await svc.logIssue(targetOf(id), { areas: d.picked, minor: d.minor, note: d.noteOn ? d.note : undefined, subNotes: d.subNotes, followUp: d.follow });
    markLogged(id, true);
    offerUndo(`${r.checkin.result === 'issue' ? 'Issue saved' : 'Saved'} · ${displayName(students.find((x) => x.id === id)!)}`, id, () => svc.undoCheckin(r.checkin.id));
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
      {!single && <span class="tiny muted mono">{queue.length} to go</span>}
    </div>
  );
  const progress = !single && (
    <div class="target-bar">
      <span class={`target-count ${checkedHere.size >= target ? 'met' : ''}`}><b>{checkedHere.size}</b> of {target} today</span>
      <a class="btn small" href={back}>Done for now</a>
    </div>
  );

  if (!s) {
    return (
      <div class="cc">
        {header}
        <div class="done-state">
          <div class="check"><Icon name="check" /></div>
          <h2>That's the whole class. All done for this lesson</h2>
          <p class="muted small">{cls.name} · {checkedHere.size} checked in</p>
          <a class="btn primary" href={back} style="margin-top:10px">Back to {cls.name}</a>
        </div>
      </div>
    );
  }

  // Between cards: the target card, or a small message every few students after it.
  if (milestone && step === 'card') {
    return (
      <div class="cc">
        {header}
        {progress}
        {milestone.kind === 'target' ? (
          <div class="milestone-card card-enter">
            <div class="check"><Icon name="check" /></div>
            <h2>Nice work! You've hit today's check-in target for {cls.name}.</h2>
            <div class="grid2" style="margin-top:14px">
              <a class="btn big" href={back}>Finish for now</a>
              <button class="btn big primary" onClick={() => setMilestone(null)}>Keep going</button>
            </div>
          </div>
        ) : (
          <div class="milestone-card small card-enter">
            <p style="margin:0 0 10px"><b>{extraMessage(milestone.count)}</b></p>
            <button class="btn primary block" onClick={() => setMilestone(null)}>Next student <Icon name="arrow" /></button>
          </div>
        )}
      </div>
    );
  }

  const row = ranked.find((r) => r.studentId === s.id);
  const sChk = ctx.checkins.filter((c) => c.studentId === s.id);
  const sObs = ctx.observations.filter((o) => o.studentId === s.id);
  const sTags = ctx.tags.filter((t) => t.studentId === s.id);
  const hasIcp = ctx.adjustments.some((a) => a.studentId === s.id && a.active);
  const fu = openFollow(sChk, sObs, sTags, lessonId);
  const askStreak = step === 'card' && !streakDone.has(s.id) && streakDue(s, sChk, sObs, sTags, date);
  const already = sChk.find((c) => lessonOf(c) === lessonId);
  const wellbeing = wellbeingRecent(sObs, date);
  const good = { side: sideOf('good'), btn: <button class="btn big good-btn" onClick={() => card.current?.fling('good')}><Icon name="check" /> All good</button> };
  const issue = { side: sideOf('issue'), btn: <button class="btn big issue-btn" onClick={() => card.current?.fling('issue')}><Icon name="alert" /> Issue</button> };

  return (
    <div class="cc checkin">
      {header}
      {step === 'card' && progress}

      {step === 'card' && (
        <>
          <SwipeCard key={s.id} control={card} onSwipe={onCard} labels={{ good: 'All good', issue: 'Issue', up: 'Skip' }} class="student-card">
            <div class="row" style="gap:12px">
              <span class="avatar big">{initials(s)}</span>
              <div class="grow">
                <h1 class="card-name">{displayName(s)} {s.flag && <Icon name="flag" class="flag" />}{hasIcp && <span class="icp-mark" title="Has ICP adjustments">ICP</span>}</h1>
                {row && <div class="tiny muted">{needWords(row)}</div>}
              </div>
            </div>
            {already && <p class="tiny muted" style="margin:8px 0 0">Already logged this lesson ({already.status === 'absent' ? 'not here' : already.result === 'issue' ? 'issue' : 'all good'}). Logging again replaces it.</p>}
            <div class="area-rows">
              {CHECKIN_AREAS.map((a) => {
                const av = areaAverage(sObs, a.id);
                return (
                  <div key={a.id} class="area-row">
                    <span class="grow">{a.name}</span>
                    <span class="small">{av.total ? `Meets ${av.meets} of last ${av.total}` : <span class="muted">No answers yet</span>}</span>
                    <span class={`trend-arrow ${av.trend ?? 'none'}`} aria-label={av.trend ? `Trend ${av.trend}` : 'No trend yet'}>{av.trend === 'up' ? '↑' : av.trend === 'down' ? '↓' : av.trend === 'flat' ? '→' : ''}</span>
                  </div>
                );
              })}
            </div>
            {wellbeing > 0 && <p class="tiny muted wellbeing-note">Wellbeing flagged {wellbeing}× recently</p>}
            {fu && <div class="follow-box"><b>{followLead(fu, date)}:</b> {fu.text}. <b>Again?</b></div>}
            {askStreak && (
              <div class="streak-box pop-in">
                <b class="small">Consistently good lately. Exceeding in any area?</b>
                <div class="chips" style="flex-wrap:wrap;margin-top:8px">
                  {CHECKIN_AREAS.map((a) => <button key={a.id} class="chip small" onClick={async () => { await svc.answerStreak(targetOf(s.id), a.id); setStreakDone(new Set([...streakDone, s.id])); }}>{a.name}</button>)}
                  <button class="chip small" onClick={async () => { await svc.answerStreak(targetOf(s.id), null); setStreakDone(new Set([...streakDone, s.id])); }}>No, at level</button>
                </div>
              </div>
            )}
          </SwipeCard>
          <div class="grid2 swipe-buttons">{good.side === 'left' ? [good.btn, issue.btn] : [issue.btn, good.btn]}</div>
          <div class="row between" style="margin-top:10px">
            <button class="link-btn" onClick={() => card.current?.fling('up')}><Icon name="skip" /> {single ? 'Cancel' : 'Skip'}</button>
            <button class="link-btn" onClick={async () => {
              const id = await svc.markNotHere(targetOf(s.id));
              markLogged(s.id, false);
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
        <IssueStep s={s} draft={draft} setDraft={setDraft}
          evidence={hasFeature('evidence') ? { on: withEvidence, count: evidenceCount, toggle: (v) => { setWithEvidence(v); if (v) setEvidenceOpen(true); }, open: () => setEvidenceOpen(true) } : null}
          onOutcome={(o: IssueOutcome) => { if (o === 'save') saveIssue(s.id); else if (o === 'back' || o === 'cancel') reset(); }} />
      )}
      {evidenceOpen && (
        <EvidenceSheet checkin={{ id: checkinIdFor(lessonId, s.id), studentId: s.id, label: `Check-in · ${displayName(s)}` }}
          onClose={async () => { setEvidenceOpen(false); setEvidenceCount(await svc.countEvidence(checkinIdFor(lessonId, s.id))); }} />
      )}

      {step === 'icp' && <IcpStep s={s} due={icpList} ctx={ctx} date={date} onDone={moveOn} />}

    </div>
  );
}

const HOLD_NOTE_MS = 500;

/** A sub-option chip: tap to tick, hold for half a second to add a note to just this issue. */
function HoldChip({ label, on, hasNote, onTap, onHold }: { label: string; on: boolean; hasNote: boolean; onTap: () => void; onHold: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const st = useRef<{ x: number; y: number; fired: boolean } | null>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const cancel = () => { clearTimeout(timer.current); st.current = null; setHolding(false); };
  return (
    <button
      class={`chip small hold-chip ${on ? 'active' : ''} ${holding ? 'holding' : ''}`} aria-pressed={on}
      style={{ '--hold': `${HOLD_NOTE_MS}ms` } as Record<string, string>}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        st.current = { x: e.clientX, y: e.clientY, fired: false };
        setHolding(true);
        timer.current = setTimeout(() => { if (st.current) st.current.fired = true; setHolding(false); haptic(25); onHold(); }, HOLD_NOTE_MS);
      }}
      onPointerMove={(e) => { if (st.current && !st.current.fired && Math.hypot(e.clientX - st.current.x, e.clientY - st.current.y) > 8) cancel(); }}
      onPointerUp={() => { const fired = st.current?.fired; const pressed = !!st.current; cancel(); if (pressed && !fired) onTap(); }}
      onPointerLeave={() => { if (!st.current?.fired) cancel(); }}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => { if (e.detail === 0) onTap(); /* keyboard activation */ }}
    >
      <span class="hold-fill" aria-hidden="true" />
      <span class="opt-label">{label}</span>{hasNote && <Icon name="edit" class="chip-note" />}
    </button>
  );
}

/**
 * Issue screen: tap areas, tick sub-options (hold one to give it its own note), Wellbeing as a separate
 * tick box, minor items under Behaviour, and an optional note, evidence and "follow up next time".
 * Swipe right (towards "good") saves straight away; with nothing ticked it goes back. Swipe left cancels.
 */
function IssueStep({ s, draft, setDraft, evidence, onOutcome }: {
  s: Student; draft: IssueDraft; setDraft: (f: (d: IssueDraft) => IssueDraft) => void;
  evidence: { on: boolean; count: number; toggle: (v: boolean) => void; open: () => void } | null;
  onOutcome: (o: IssueOutcome) => void;
}) {
  const settings = useSettings();
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const [opened, setOpened] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  // Sub-option hints for the first few issue screens; the count is taken once when the screen opens.
  const [showHints, setShowHints] = useState<boolean | null>(null);
  const [tipShown, setTipShown] = useState(false);
  useEffect(() => {
    if (!settings || showHints !== null) return;
    const n = settings.subHintsShown ?? 0;
    setShowHints(n < SUB_HINT_TIMES);
    if (n < SUB_HINT_TIMES) void saveSettings({ subHintsShown: n + 1 });
    if (!(settings.tipsSeen ?? []).includes('hold-note')) setTipShown(true);
  }, [settings]);
  // Bring a newly opened area (and its options) into view.
  useEffect(() => {
    if (!opened) return;
    const t = setTimeout(() => refs.current[opened]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
    return () => clearTimeout(t);
  }, [opened]);
  const { picked, minor } = draft;
  const toggleArea = (a: CheckinArea) => {
    if (picked[a.id] === undefined) setOpened(a.id);
    setDraft((d) => {
      const next = { ...d.picked };
      if (next[a.id]) delete next[a.id]; else next[a.id] = [];
      return { ...d, picked: next };
    });
  };
  const toggleSub = (a: CheckinArea, sub: string, on?: boolean) => setDraft((d) => {
    const cur = d.picked[a.id] ?? [];
    const want = on ?? !cur.includes(sub);
    return { ...d, picked: { ...d.picked, [a.id]: want ? [...new Set([...cur, sub])] : cur.filter((x) => x !== sub) } };
  });
  const toggleMinor = (a: CheckinArea, m: string) => setDraft((d) => {
    const cur = d.minor[a.id] ?? [];
    return { ...d, minor: { ...d.minor, [a.id]: cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m] } };
  });
  const minorList = Object.values(minor).flat();
  const any = Object.keys(picked).length > 0 || minorList.length > 0;
  const dismissTip = () => { setTipShown(false); void saveSettings({ tipsSeen: [...(settings?.tipsSeen ?? []), 'hold-note'] }); };

  const subChips = (a: CheckinArea) => (
    <>
      <div class="chips sub-chips pop-in">
        {a.subs.map((x: SubOption) => {
          const key = `${a.id}|${x.id}`;
          return (
            <span key={x.id} class="sub-opt">
              <HoldChip label={x.label} on={picked[a.id]?.includes(x.id) ?? false} hasNote={!!draft.subNotes[key]}
                onTap={() => toggleSub(a, x.id)} onHold={() => { toggleSub(a, x.id, true); setNoteFor(key); }} />
              {showHints && x.hint && <span class="sub-hint tiny muted">{x.hint}</span>}
            </span>
          );
        })}
      </div>
      {noteFor?.startsWith(`${a.id}|`) && (
        <div class="sub-note pop-in">
          <label class="tiny muted">Note for {a.subs.find((x) => `${a.id}|${x.id}` === noteFor)?.label}</label>
          <textarea class="input" autoFocus value={draft.subNotes[noteFor] ?? ''} onInput={(e) => { const v = (e.target as HTMLTextAreaElement).value; setDraft((d) => ({ ...d, subNotes: { ...d.subNotes, [noteFor]: v } })); }} />
          <button class="btn small" onClick={() => setNoteFor(null)}>Done</button>
        </div>
      )}
    </>
  );

  const wb = picked[WELLBEING.id] !== undefined;
  return (
    <>
      <SwipeCard onSwipe={(a) => onOutcome(issueSwipe(a, picked, minorList))} allow={['good', 'issue']} labels={{ good: any ? 'Save' : 'Back', issue: 'Cancel' }} class="issue-card">
        <div class="cc-eyebrow">Issue · {displayName(s)}</div>
        <h2 style="margin:6px 0 12px">What happened?</h2>
        {tipShown && (
          <div class="tip-box pop-in">
            <span class="small">Tip: hold an issue to add a note to it.</span>
            <button class="link-btn" onClick={dismissTip}>Got it</button>
          </div>
        )}
        <div class="area-list">
          {CHECKIN_AREAS.map((a) => {
            const on = picked[a.id] !== undefined;
            return (
              <div key={a.id} ref={(el) => { refs.current[a.id] = el; }} class={`area-toggle ${on ? 'on' : ''}`}>
                <button class="area-btn" aria-pressed={on} onClick={() => toggleArea(a)}>
                  <span class="area-name">{a.name}<span class="area-q">{a.question}</span></span>{on && <Icon name="check" />}
                </button>
                {on && subChips(a)}
                {!!a.minor?.length && (
                  <div class="minor-row">
                    <span class="tiny muted">Minor:</span>
                    {a.minor.map((m) => <button key={m.id} class={`chip tiny-chip ${minor[a.id]?.includes(m.id) ? 'active' : ''}`} aria-pressed={minor[a.id]?.includes(m.id) ?? false} onClick={() => toggleMinor(a, m.id)}>{m.label}</button>)}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={(el) => { refs.current[WELLBEING.id] = el; }} class={`wellbeing-box ${wb ? 'on' : ''}`}>
            <label class="check-row wellbeing-check">
              <input type="checkbox" checked={wb} onChange={() => toggleArea(WELLBEING)} />
              <span><b>Wellbeing</b> <span class="tiny muted">(flag only)</span><span class="area-q">{WELLBEING.question}</span></span>
            </label>
            {wb && subChips(WELLBEING)}
            {wb && <p class="tiny muted safety-line">{WELLBEING.safetyLine}</p>}
            {wb && !draft.noteOn && <p class="tiny muted" style="margin:6px 0 0">A short note helps.</p>}
          </div>
        </div>

        <div class="issue-extras">
          <label class="check-row"><input type="checkbox" checked={draft.noteOn} onChange={(e) => { const v = (e.target as HTMLInputElement).checked; setDraft((d) => ({ ...d, noteOn: v })); }} /> Add a note</label>
          {draft.noteOn && <textarea class="input" autoFocus value={draft.note} placeholder={wb ? 'What did you notice?' : 'Note'} onInput={(e) => { const v = (e.target as HTMLTextAreaElement).value; setDraft((d) => ({ ...d, note: v })); }} />}
          {evidence && (
            <div class="evidence-toggle">
              <Switch label="Include evidence?" hint="A photo of the work, a file, a note or a voice memo. Stays on this device." checked={evidence.on} onChange={evidence.toggle} />
              {evidence.on && <button class="btn small" onClick={evidence.open}><Icon name="camera" /> {evidence.count ? `${evidence.count} added · add more` : 'Add evidence'}</button>}
            </div>
          )}
          <label class="check-row"><input type="checkbox" checked={draft.follow} onChange={(e) => { const v = (e.target as HTMLInputElement).checked; setDraft((d) => ({ ...d, follow: v })); }} /> Follow up next time</label>
        </div>
        <p class="hold-hint">Swipe {sideOf('good')} to save · {sideOf('issue')} to cancel. Nothing is saved if you cancel.</p>
      </SwipeCard>
      <div class="issue-bar two">
        <button class="btn" onClick={() => onOutcome('cancel')}><Icon name="x" /> Cancel</button>
        <button class="btn primary" disabled={!any} onClick={() => onOutcome('save')}>Save <Icon name="check" /></button>
      </div>
    </>
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
