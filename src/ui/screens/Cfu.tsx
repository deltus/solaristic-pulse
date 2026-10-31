// Check for understanding (round 9): the menu on the class page and two of its four modes
// (Cold call and Select a student are ColdCall.tsx). Whole class (everyone starts as Yes; tap the
// few who aren't) and Entry or exit ticket (up to 3 questions, shown with Present, then swipe
// through the class). Students marked absent earlier today start as Absent; their chip offers
// "Here now" or "Arrived late".

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { saveSettings } from '../../db';
import * as svc from '../../services';
import { CFU_MODES, cfuModeOf, MAX_TICKET_QUESTIONS, TICKET_NOT_YET_TAGS, TICKET_TIMERS, WHOLE_HOLD_MS, type CfuMode } from '../../config/cfu';
import { UNDO_SECONDS } from '../../config/checkin';
import { holdMark, suggestedQuestion, tapMark, ticketQuestions, wholeClassStart, type GridMark } from '../../logic/cfu';
import { earlierLessons, lessonName } from '../../logic/lessons';
import type { CfuCheck, CfuResultValue, Lesson, Student } from '../../types';
import { go, useLive, useSettings } from '../hooks';
import { displayName, Icon, initials, Sheet, toast } from '../components';
import { SwipeCard, sideOf, type SwipeAction, type SwipeControl } from '../Swipe';
import { NeedLesson } from './Checkin';
import { PreviousButton, usePrevious } from '../Previous';
import { openPresent, Present } from '../Present';

const byName = (a: Student, b: Student) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
const modePath = (classId: string, m: CfuMode) => (m === 'coldcall' ? `class/${classId}/coldcall` : `class/${classId}/cfu/${m}`);
const modeOf = (id: CfuMode) => CFU_MODES.find((m) => m.id === id)!;

/** The tile's menu: four modes, the last one used first. */
export function CfuMenu({ classId, onClose }: { classId: string; onClose: () => void }) {
  const settings = useSettings();
  const last = cfuModeOf(settings?.lastCfuMode);
  const modes = [...CFU_MODES].sort((a, b) => (a.id === last ? -1 : b.id === last ? 1 : 0));
  return (
    <Sheet title="Check for understanding" onClose={onClose}>
      <div class="cfu-menu">
        {modes.map((m) => (
          <button key={m.id} class={`list-item cfu-mode ${m.color}`} onClick={() => { void saveSettings({ lastCfuMode: m.id }); onClose(); go(modePath(classId, m.id)); }}>
            <span class="cfu-icon"><Icon name={m.icon} /></span>
            <span class="grow"><b>{m.label}</b><span class="tiny muted" style="display:block">{m.hint}</span></span>
            {m.id === last && <span class="tiny muted">Last used</span>}
            <Icon name="chevron" />
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** The mode's name in its own colour, with its icon, at the top of its screen. */
export function ModeTitle({ mode, children }: { mode: CfuMode; children?: string }) {
  const m = modeOf(mode);
  return <div class={`cfu-title ${m.color}`}><span class="cfu-icon small"><Icon name={m.icon} /></span>{children ?? m.label}</div>;
}

/** The lesson's learning intention, at the top of each mode (when one was entered). */
export function IntentionLine({ lesson, label = 'Learning intention' }: { lesson?: Pick<Lesson, 'intention'>; label?: string }) {
  if (!lesson?.intention) return null;
  return <div class="cfu-intention"><span class="tiny muted">{label}</span><b>{lesson.intention}</b></div>;
}

/** Absent chip: tap for "Here now" or "Arrived late" (which also saves a minor note). */
export function AbsentChip({ classId, student, date, onHere }: { classId: string; student: Student; date: string; onHere?: () => void }) {
  const [open, setOpen] = useState(false);
  const name = displayName(student);
  async function here(late: boolean) {
    if (late) await svc.markArrivedLate(classId, student.id, date);
    else await svc.markHereNow(classId, student.id, date);
    setOpen(false);
    onHere?.();
    toast(late ? `Arrived late · ${name}` : `Here now · ${name}`);
  }
  return (
    <>
      <button class="chip small absent-chip" aria-label={`${name}: absent. Tap if they're here now`} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>Absent</button>
      {open && (
        <Sheet title={name} onClose={() => setOpen(false)}>
          <p class="small" style="margin-top:0">Marked absent earlier today in this class.</p>
          <div class="actions">
            <button class="btn" onClick={() => here(true)}><Icon name="clock" /> Arrived late</button>
            <button class="btn primary" onClick={() => here(false)}><Icon name="check" /> Here now</button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function Header({ classId, name, right }: { classId: string; name: string; right?: string }) {
  return (
    <div class="row between">
      <a class="link-btn back-btn" href={`#/class/${classId}`}><Icon name="back" /> {name}</a>
      {right && <span class="tiny muted mono">{right}</span>}
    </div>
  );
}

/* ---------------- Whole class ---------------- */

const MARK_TEXT: Record<GridMark, string> = { got: 'Yes', partly: 'Sort of', notyet: 'Not yet', absent: 'Absent' };

export function WholeClassScreen({ classId }: { classId: string }) {
  const ctx = useLive(() => svc.loadLessonContext(classId), [classId]);
  const [marks, setMarks] = useState<Record<string, GridMark> | null>(null);
  const [busy, setBusy] = useState(false);
  // Everyone starts as Yes, absent-today students as Absent (once, when the screen opens).
  useEffect(() => { if (ctx && marks === null) setMarks(wholeClassStart(ctx.students.map((s) => s.id), ctx.absentNow)); }, [!!ctx]);
  if (!ctx || !marks) return ctx === null ? null : <p class="muted" style="padding:20px 0">Loading…</p>;
  if (!ctx.lesson) return <NeedLesson classId={classId} name={ctx.cls.name} />;
  const lesson = ctx.lesson;
  const students = [...ctx.students].sort(byName);
  const count = (m: GridMark) => students.filter((s) => (marks[s.id] ?? 'got') === m).length;
  /** `m` is a function of the current mark, so quick double taps each count. */
  const setOne = (id: string, m: (cur: GridMark) => GridMark) => setMarks((x) => ({ ...x, [id]: m(x![id] ?? 'got') }));

  async function save() {
    setBusy(true);
    const all = Object.fromEntries(students.map((s) => [s.id, marks![s.id] ?? 'got'])) as Record<string, GridMark>;
    await svc.saveWholeClass(lesson, all);
    toast(`Saved: ${count('got')} yes, ${count('partly')} sort of, ${count('notyet')} not yet`);
    go(`class/${classId}`);
  }

  return (
    <div>
      <Header classId={classId} name={ctx.cls.name} />
      <ModeTitle mode="whole" />
      <IntentionLine lesson={lesson} />
      <p class="small" style="margin:6px 0 2px"><b>“Is everyone happy with this?”</b> Thumbs up, sideways or down.</p>
      <p class="tiny muted" style="margin:0 0 10px">Everyone starts as Yes. Tap the few who aren't for Not yet; press and hold for Sort of.</p>
      <div class="card flat" style="padding:2px 12px">
        {students.map((s) => {
          const m = marks[s.id] ?? 'got';
          if (m === 'absent') {
            return (
              <div key={s.id} class="blitz-row yn-row absent">
                <span class="avatar">{initials(s)}</span>
                <span class="grow">{displayName(s)}</span>
                {ctx.absentNow.has(s.id)
                  ? <AbsentChip classId={classId} student={s} date={lesson.date} onHere={() => setOne(s.id, () => 'got')} />
                  : <button class="chip small absent-chip" aria-label={`${displayName(s)}: absent. Tap to undo`} onClick={() => setOne(s.id, () => 'got')}>Absent</button>}
              </div>
            );
          }
          return (
            <div key={s.id} class={`blitz-row yn-row ${m}`}>
              <HoldButton
                class="yn-tap grow"
                label={`${displayName(s)}: ${MARK_TEXT[m]}. Tap for ${m === 'got' ? 'Not yet' : 'Yes'}, hold for Sort of`}
                onTap={() => setOne(s.id, tapMark)}
                onHold={() => setOne(s.id, holdMark)}
              >
                <span class="avatar">{initials(s)}</span>
                <span class="grow">{displayName(s)}</span>
                <span class={`yn-mark ${m}`}>{m === 'got' ? <><Icon name="check" /> Yes</> : MARK_TEXT[m]}</span>
              </HoldButton>
              <button class="bz abs" aria-label={`${displayName(s)}: absent`} onClick={() => setOne(s.id, () => 'absent')}>A</button>
            </div>
          );
        })}
      </div>
      <div class="blitz-bar">
        <span class="small"><b>{count('got')}</b> yes · <b>{count('partly')}</b> sort of · <b>{count('notyet')}</b> not yet{count('absent') ? ` · ${count('absent')} absent` : ''}</span>
        <button class="btn primary small cfu-c-whole" disabled={busy || !students.length} onClick={save}><Icon name="check" /> Save</button>
      </div>
    </div>
  );
}

/** A button with a tap and a press-and-hold (keyboard Enter/Space is a tap). */
function HoldButton({ onTap, onHold, label, children, ...rest }: { onTap: () => void; onHold: () => void; label: string; class: string; children: ComponentChildren }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false);
  const down = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const cancel = () => { clearTimeout(timer.current); down.current = false; };
  return (
    <button
      class={rest.class}
      aria-label={label}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        held.current = false;
        down.current = true;
        timer.current = setTimeout(() => { held.current = true; navigator.vibrate?.(20); onHold(); }, WHOLE_HOLD_MS);
      }}
      onPointerUp={() => { if (down.current && !held.current) { navigator.vibrate?.(8); onTap(); } cancel(); }}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => { if (e.detail === 0) onTap(); /* keyboard */ }}
    >
      {children}
    </button>
  );
}

/* ---------------- Entry or exit ticket ---------------- */

type TicketPhase = 'setup' | 'record' | 'notyet';

const ticketHash = (classId: string, checkId: string, fromClose: boolean) => `#/class/${classId}/cfu/ticket/${checkId}${fromClose ? '/close' : ''}`;

/**
 * `fromClose`: opened from Close lesson ("Run an exit ticket?"), so it starts as Exit and returns there.
 * `resumeId`: back from the Present page on a phone, so recording carries on with that ticket.
 */
export function TicketScreen({ classId, fromClose = false, resumeId }: { classId: string; fromClose?: boolean; resumeId?: string }) {
  const ctx = useLive(() => svc.loadLessonContext(classId), [classId]);
  const [kind, setKind] = useState<'exit' | 'entry'>('exit');
  /** null: just the suggested question. */
  const [qs, setQs] = useState<string[] | null>(null);
  const [timer, setTimer] = useState(0);
  const [phase, setPhase] = useState<TicketPhase>('setup');
  const [check, setCheck] = useState<CfuCheck | null>(null);
  const [done, setDone] = useState<Record<string, CfuResultValue>>({});
  const [skipped, setSkipped] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const card = useRef<SwipeControl | null>(null);
  const checkRef = useRef<string | null>(null);
  /** Leaving for the Present page on this phone: keep the (still empty) ticket. */
  const presenting = useRef(false);
  const resumed = useRef(false);
  const prev = usePrevious();
  useEffect(() => () => { if (checkRef.current && !presenting.current) void svc.dropEmptyTicket(checkRef.current); }, []);
  // Back from Present: the same ticket, with anyone already recorded.
  useEffect(() => {
    if (!ctx || !resumeId || resumed.current) return;
    resumed.current = true;
    const c = ctx.cfuChecks.find((x) => x.id === resumeId);
    if (!c) return;
    checkRef.current = c.id;
    setCheck(c);
    setKind(c.kind === 'entry' ? 'entry' : 'exit');
    setQs(ticketQuestions(c));
    setDone(Object.fromEntries(ctx.cfuResults.filter((r) => r.checkId === c.id).map((r) => [r.studentId, r.result])));
    setPhase('record');
  }, [!!ctx]);

  const students = [...(ctx?.students ?? [])].sort(byName);
  const absentNow = ctx?.absentNow ?? new Set<string>();
  const left = students.filter((s) => !(s.id in done) && !absentNow.has(s.id));
  const queue = [...left.filter((s) => !skipped.includes(s.id)), ...skipped.map((id) => left.find((s) => s.id === id)).filter((s): s is Student => !!s)];
  useEffect(() => { if (phase === 'record' && (!activeId || !queue.some((s) => s.id === activeId))) setActiveId(queue[0]?.id ?? null); }, [phase, activeId, queue[0]?.id]);

  if (!ctx) return null;
  if (!ctx.lesson) return <NeedLesson classId={classId} name={ctx.cls.name} />;
  const lesson = ctx.lesson;
  const previous = earlierLessons(ctx.lessons, classId, lesson)[0];
  const suggested = suggestedQuestion(kind, lesson, previous);
  const questions = qs ?? [suggested];
  const filled = questions.filter((q) => q.trim());
  const saved = ctx.cls.savedQuestions ?? [];
  const backTo = fromClose ? `class/${classId}/close` : `class/${classId}`;
  const absentList = students.filter((s) => absentNow.has(s.id) && !(s.id in done));
  const about = kind === 'entry' ? previous?.id : undefined;
  const setQ = (i: number, v: string) => setQs(questions.map((q, j) => (j === i ? v : q)));

  /** Saves the ticket (or its edited questions) so it can be shown and recorded. */
  async function ensureCheck(): Promise<CfuCheck> {
    if (check) {
      await svc.updateTicket(check.id, kind, filled, about);
      const c = { ...check, kind, questions: filled, aboutLessonId: about };
      setCheck(c);
      return c;
    }
    const c = await svc.startTicket(lesson, kind, filled, about);
    checkRef.current = c.id;
    setCheck(c);
    return c;
  }
  async function startRecording() {
    await ensureCheck();
    setPhase('record');
  }
  /** Show it: the Present page (a new window on a computer, full screen here on a phone). */
  async function showIt() {
    const c = await ensureCheck();
    setPhase('record');
    presenting.current = true;
    openPresent(`#/class/${classId}/cfu/present/${c.id}/${timer * 60}${fromClose ? '/close' : ''}`);
    // Still here (a new window opened): drop the ticket if the teacher leaves without recording.
    setTimeout(() => { presenting.current = false; }, 1500);
  }
  async function saveQuestion(q: string) {
    await svc.saveClassQuestion(classId, q);
    toast(`Saved for ${ctx!.cls.name}`);
  }
  function pickSaved(q: string) {
    const empty = questions.findIndex((x) => !x.trim());
    if (questions.some((x) => x.trim().toLowerCase() === q.toLowerCase())) return;
    if (empty >= 0) setQ(empty, q);
    else if (questions.length < MAX_TICKET_QUESTIONS) setQs([...questions, q]);
    else setQs([...questions.slice(0, -1), q]);
  }

  async function save(id: string, result: CfuResultValue, t: string[] = []) {
    const r = await svc.recordTicket(check!, id, result, t);
    setDone((d) => ({ ...d, [id]: result }));
    const name = displayName(students.find((s) => s.id === id)!);
    const label = result === 'got' ? 'Got it' : result === 'partly' ? 'Partly' : result === 'notyet' ? 'Not yet' : 'Absent';
    const undo = () => svc.undoTicketResult(r);
    prev.push(id, undo);
    toast(`${label} · ${name}`, { label: 'Undo', seconds: UNDO_SECONDS, run: async () => { prev.drop(id); await undo(); bringBack(id); } });
    setTags([]);
    setActiveId(null);
    setPhase('record');
  }
  /** After an undo (toast or Previous): that student's card again. */
  function bringBack(id: string) {
    setDone((d) => { const n = { ...d }; delete n[id]; return n; });
    setSkipped((k) => k.filter((x) => x !== id));
    setTags([]);
    setActiveId(id);
    setPhase('record');
  }
  const previousBtn = <PreviousButton prev={prev} name={(id) => displayName(students.find((x) => x.id === id)!)} onBack={bringBack} />;
  function onSwipe(a: SwipeAction) {
    if (!activeId) return;
    if (a === 'good') save(activeId, 'got');
    else if (a === 'issue') setPhase('notyet');
    else save(activeId, 'partly');
  }

  const counts = Object.values(done);
  const n = (v: CfuResultValue) => counts.filter((x) => x === v).length;
  const header = <Header classId={classId} name={ctx.cls.name} right={phase === 'setup' ? undefined : `${counts.length} recorded · ${queue.length} to go`} />;
  const kindName = kind === 'exit' ? 'Exit ticket' : 'Entry ticket';

  if (phase === 'setup') {
    return (
      <div class="cc">
        {header}
        <ModeTitle mode="ticket" />
        <IntentionLine lesson={lesson} />
        <div class="seg" style="margin:6px 0 4px">
          <button class={kind === 'exit' ? 'sel' : ''} aria-pressed={kind === 'exit'} onClick={() => setKind('exit')}>Exit</button>
          <button class={kind === 'entry' ? 'sel' : ''} aria-pressed={kind === 'entry'} onClick={() => setKind('entry')}>Entry</button>
        </div>
        <p class="tiny muted" style="margin:4px 0 10px">{kind === 'exit' ? 'End of lesson: about today.' : previous ? `Start of lesson: about last lesson${previous.intention ? ` (${lessonName(previous)})` : ''}.` : 'Start of lesson: about last lesson (none recorded yet).'}</p>
        {questions.map((q, i) => {
          const isSaved = saved.some((x) => x.toLowerCase() === q.trim().toLowerCase());
          return (
            <div key={i} class="ticket-q">
              <div class="row between">
                <label class="small" for={`ticket-q${i}`}><b>{questions.length > 1 ? `Question ${i + 1}` : 'Question'}</b></label>
                {questions.length > 1 && <button class="link-btn tiny" aria-label={`Remove question ${i + 1}`} onClick={() => setQs(questions.filter((_, j) => j !== i))}><Icon name="x" /> Remove</button>}
              </div>
              <textarea id={`ticket-q${i}`} class="input" style="margin-top:6px;min-height:70px" maxLength={200} value={q} onInput={(e) => setQ(i, (e.target as HTMLTextAreaElement).value)} />
              {q.trim() && (isSaved
                ? <span class="tiny muted"><Icon name="check" /> Saved for this class</span>
                : <button class="link-btn tiny" onClick={() => saveQuestion(q)}><Icon name="plus" /> Save for this class</button>)}
            </div>
          );
        })}
        <div class="row" style="gap:12px;flex-wrap:wrap">
          {questions.length < MAX_TICKET_QUESTIONS && <button class="link-btn small" onClick={() => setQs([...questions, ''])}><Icon name="plus" /> Add a question</button>}
          {qs !== null && !(questions.length === 1 && questions[0] === suggested) && <button class="link-btn small" onClick={() => setQs(null)}>Use the suggested question</button>}
        </div>
        {saved.length > 0 && (
          <div style="margin-top:12px">
            <span class="tiny muted">Saved for {ctx.cls.name}: tap to use</span>
            <div class="chips saved-qs">
              {saved.map((q) => (
                <span key={q} class="chip saved-q">
                  <button class="saved-q-use" onClick={() => pickSaved(q)}>{q}</button>
                  <button class="saved-q-x" aria-label={`Remove saved question: ${q}`} onClick={() => svc.removeClassQuestion(classId, q)}><Icon name="x" /></button>
                </span>
              ))}
            </div>
          </div>
        )}
        <div style="margin-top:14px">
          <span class="tiny muted">Countdown on the board</span>
          <div class="chips" style="flex-wrap:wrap;margin-top:4px">
            {TICKET_TIMERS.map((m) => <button key={m} class={`chip tiny-chip ${timer === m ? 'active' : ''}`} aria-pressed={timer === m} onClick={() => setTimer(m)}>{m ? `${m} min` : 'None'}</button>)}
          </div>
        </div>
        <div class="grid2" style="margin-top:14px">
          <button class="btn" disabled={!filled.length} onClick={startRecording}>Record answers</button>
          <button class="btn primary cfu-c-ticket" disabled={!filled.length} onClick={showIt}><Icon name="share" /> Show it</button>
        </div>
        <p class="tiny muted" style="margin-top:8px">Show it: the questions in big text for the board. Students answer on paper; then swipe through the class to record.</p>
      </div>
    );
  }

  const absentStrip = absentList.length > 0 && (
    <div class="absent-strip">
      <span class="tiny muted">Absent today:</span>
      {absentList.map((s) => <span key={s.id} class="row" style="gap:4px"><span class="small">{displayName(s)}</span><AbsentChip classId={classId} student={s} date={lesson.date} /></span>)}
    </div>
  );
  const shown = check ? ticketQuestions(check) : filled;
  const showAgain = check && <button class="link-btn small" onClick={() => { presenting.current = true; openPresent(`#/class/${classId}/cfu/present/${check.id}/0${fromClose ? '/close' : ''}`); setTimeout(() => { presenting.current = false; }, 1500); }}><Icon name="share" /> Show it again</button>;

  const s = students.find((x) => x.id === activeId);
  if (!s) {
    return (
      <div class="cc">
        {header}
        <div class="done-state">
          <div class="check"><Icon name="check" /></div>
          <h2>{kindName} recorded</h2>
          <p class="small">{n('got')} got it · {n('partly')} partly · {n('notyet')} not yet{n('absent') ? ` · ${n('absent')} absent` : ''}</p>
          {absentStrip}
          <div style="margin-top:10px">{previousBtn}</div>
          <button class="btn primary" style="margin-top:10px" onClick={() => go(backTo)}>{fromClose ? 'Back to Close lesson' : `Back to ${ctx.cls.name}`}</button>
        </div>
      </div>
    );
  }

  if (phase === 'notyet') {
    return (
      <div class="cc checkin">
        {header}
        <div class="fade-up student-card">
          <div class="cc-eyebrow">Not yet · {displayName(s)}</div>
          <h2 style="margin:6px 0 10px">Anything to note?</h2>
          <div class="chips" style="flex-wrap:wrap">
            {TICKET_NOT_YET_TAGS.map((t) => <button key={t.id} class={`chip ${tags.includes(t.id) ? 'active' : ''}`} aria-pressed={tags.includes(t.id)} onClick={() => setTags((x) => (x.includes(t.id) ? x.filter((y) => y !== t.id) : [...x, t.id]))}>{t.label}</button>)}
            <button class="chip" onClick={() => save(s.id, 'absent')}>Absent</button>
          </div>
          <p class="tiny muted" style="margin-top:8px">Optional. Absent marks them absent for the rest of the day.</p>
          <div class="grid2" style="margin-top:12px">
            <button class="btn" onClick={() => { setTags([]); setPhase('record'); }}><Icon name="back" /> Back</button>
            <button class="btn primary" onClick={() => save(s.id, 'notyet', tags)}>Save <Icon name="check" /></button>
          </div>
        </div>
      </div>
    );
  }

  const got = <button class="btn big good-btn" onClick={() => card.current?.fling('good')}><Icon name="check" /> Got it</button>;
  const notYet = <button class="btn big issue-btn" onClick={() => card.current?.fling('issue')}><Icon name="x" /> Not yet</button>;
  return (
    <div class="cc checkin">
      {header}
      <ModeTitle mode="ticket">{kindName}</ModeTitle>
      <div class="hw-from">{shown.length > 1 ? <ol class="ticket-list">{shown.map((q) => <li key={q}>{q}</li>)}</ol> : <b>{shown[0]}</b>}</div>
      <SwipeCard key={s.id} control={card} onSwipe={onSwipe} labels={{ good: 'Got it', issue: 'Not yet', up: 'Partly' }} class="student-card">
        <div class="row" style="gap:12px">
          <span class="avatar big">{initials(s)}</span>
          <h1 class="card-name grow">{displayName(s)}</h1>
        </div>
      </SwipeCard>
      <div class="grid2 swipe-buttons">{sideOf('good') === 'left' ? [got, notYet] : [notYet, got]}</div>
      <div class="row between" style="margin-top:10px">
        <button class="link-btn" onClick={() => card.current?.fling('up')}>Partly</button>
        <button class="link-btn" onClick={() => { setSkipped((k) => [...k.filter((x) => x !== s.id), s.id]); setActiveId(null); }}><Icon name="skip" /> Skip</button>
      </div>
      <div class="row between">{previousBtn}{showAgain}</div>
      <p class="hold-hint">Swipe {sideOf('good')} for got it, {sideOf('issue')} for not yet, up for partly</p>
      {absentStrip}
    </div>
  );
}

/** The ticket on the board: the questions only, big, with an optional countdown. */
export function TicketPresent({ classId, checkId, seconds, fromClose }: { classId: string; checkId: string; seconds: number; fromClose: boolean }) {
  const check = useLive(() => svc.getCfuCheck(checkId), [checkId]);
  if (check === undefined) return null;
  const qs = check ? ticketQuestions(check) : [];
  return (
    <Present
      title={check?.kind === 'entry' ? 'Entry ticket' : 'Exit ticket'}
      countdown={seconds > 0 ? seconds : undefined}
      closeHref={check ? ticketHash(classId, checkId, fromClose) : `#/class/${classId}`}
      body={qs.length ? (
        <>
          {qs.length > 1 ? <ol class="present-qs">{qs.map((q) => <li key={q}>{q}</li>)}</ol> : <p class="present-q">{qs[0]}</p>}
          <p class="present-hint">Write your answer on paper.</p>
        </>
      ) : <p>This ticket was removed.</p>}
    />
  );
}
