// Check for understanding (round 9): the menu on the class page and three of its four modes
// (Cold call is ColdCall.tsx). Thumbs check (counts only, no names), Whole class yes/no (a
// Blitz-style grid) and Exit or entry ticket (set up, show on the projector, swipe through the class).
// Students marked absent earlier today start as Absent; their chip offers "Here now" or "Arrived late".

import { useEffect, useRef, useState } from 'preact/hooks';
import { saveSettings } from '../../db';
import * as svc from '../../services';
import { CFU_MODES, THUMBS, THUMBS_HOLD_MS, TICKET_NOT_YET_TAGS, type CfuMode } from '../../config/cfu';
import { UNDO_SECONDS } from '../../config/checkin';
import { allOthersYes, cycleMark, prefillAbsent, suggestedQuestion, thumbsShares, type GridMark, type ThumbCounts } from '../../logic/cfu';
import { earlierLessons, lessonName } from '../../logic/lessons';
import type { CfuCheck, CfuResultValue, Lesson, Student } from '../../types';
import { go, useLive, useSettings } from '../hooks';
import { displayName, Icon, initials, Sheet, toast } from '../components';
import { SwipeCard, sideOf, type SwipeAction, type SwipeControl } from '../Swipe';
import { NeedLesson } from './Checkin';

const byName = (a: Student, b: Student) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
const modePath = (classId: string, m: CfuMode) => (m === 'coldcall' ? `class/${classId}/coldcall` : `class/${classId}/cfu/${m}`);

/** The tile's menu: four modes, the last one used first. */
export function CfuMenu({ classId, onClose }: { classId: string; onClose: () => void }) {
  const settings = useSettings();
  const last = settings?.lastCfuMode;
  const modes = [...CFU_MODES].sort((a, b) => (a.id === last ? -1 : b.id === last ? 1 : 0));
  return (
    <Sheet title="Check for understanding" onClose={onClose}>
      <div class="cfu-menu">
        {modes.map((m) => (
          <button key={m.id} class="list-item cfu-mode" onClick={() => { void saveSettings({ lastCfuMode: m.id }); onClose(); go(modePath(classId, m.id)); }}>
            <span class="guide-icon small"><Icon name={m.icon} /></span>
            <span class="grow"><b>{m.label}</b><span class="tiny muted" style="display:block">{m.hint}</span></span>
            {m.id === last && <span class="tiny muted">Last used</span>}
            <Icon name="chevron" />
          </button>
        ))}
      </div>
    </Sheet>
  );
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

/* ---------------- Thumbs check ---------------- */

export function ThumbsScreen({ classId }: { classId: string }) {
  const ctx = useLive(() => svc.loadLessonContext(classId), [classId]);
  const [counts, setCounts] = useState<ThumbCounts>({ up: 0, mid: 0, down: 0 });
  if (!ctx) return null;
  if (!ctx.lesson) return <NeedLesson classId={classId} name={ctx.cls.name} />;
  const lesson = ctx.lesson;
  const sh = thumbsShares(counts);
  const bump = (id: keyof ThumbCounts, n: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, c[id] + n) }));

  async function save() {
    await svc.saveThumbs(lesson, counts);
    toast(`Thumbs check saved: ${sh.up}% got it`);
    go(`class/${classId}`);
  }

  return (
    <div class="cc">
      <Header classId={classId} name={ctx.cls.name} right={`${sh.total} counted`} />
      <div class="cc-eyebrow" style="margin-top:8px">Thumbs check</div>
      <IntentionLine lesson={lesson} />
      <p class="tiny muted" style="margin:4px 0 10px">Tap to add one, press and hold to take one off. No names are saved.</p>
      <div class="thumbs">
        {THUMBS.map((t) => <ThumbButton key={t.id} emoji={t.emoji} label={t.label} n={counts[t.id]} cls={t.id} onAdd={() => bump(t.id, 1)} onRemove={() => bump(t.id, -1)} />)}
      </div>
      <div class="pct-bar" aria-label={`${sh.up}% got it, ${sh.mid}% sort of, ${sh.down}% not yet`}>
        {sh.total ? <><i class="up" style={{ width: `${sh.up}%` }} /><i class="mid" style={{ width: `${sh.mid}%` }} /><i class="down" style={{ width: `${sh.down}%` }} /></> : null}
      </div>
      <div class="row between tiny" style="margin:4px 0 14px">
        <span>👍 {sh.up}%</span><span>👊 {sh.mid}%</span><span>👎 {sh.down}%</span>
      </div>
      <button class="btn primary big block" disabled={!sh.total} onClick={save}><Icon name="check" /> Save</button>
    </div>
  );
}

function ThumbButton({ emoji, label, n, cls, onAdd, onRemove }: { emoji: string; label: string; n: number; cls: string; onAdd: () => void; onRemove: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false);
  const down = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const cancel = () => { clearTimeout(timer.current); down.current = false; };
  return (
    <button
      class={`thumb-btn ${cls}`}
      aria-label={`${label}: ${n}. Tap to add, hold to take one off`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        held.current = false;
        down.current = true;
        timer.current = setTimeout(() => { held.current = true; navigator.vibrate?.(20); onRemove(); }, THUMBS_HOLD_MS);
      }}
      onPointerUp={() => { if (down.current && !held.current) { navigator.vibrate?.(8); onAdd(); } cancel(); }}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => { if (e.detail === 0) onAdd(); /* keyboard */ }}
    >
      <span class="thumb-emoji" aria-hidden="true">{emoji}</span>
      <b class="thumb-n">{n}</b>
      <span class="tiny">{label}</span>
    </button>
  );
}

/* ---------------- Whole class yes/no ---------------- */

export function YesNoScreen({ classId }: { classId: string }) {
  const ctx = useLive(() => svc.loadLessonContext(classId), [classId]);
  const [marks, setMarks] = useState<Record<string, GridMark> | null>(null);
  const [busy, setBusy] = useState(false);
  // Absent-today students start as Absent (once, when the screen opens).
  useEffect(() => { if (ctx && marks === null) setMarks(prefillAbsent({}, ctx.absentNow, ctx.students.map((s) => s.id))); }, [!!ctx]);
  if (!ctx || !marks) return ctx === null ? null : <p class="muted" style="padding:20px 0">Loading…</p>;
  if (!ctx.lesson) return <NeedLesson classId={classId} name={ctx.cls.name} />;
  const lesson = ctx.lesson;
  const students = [...ctx.students].sort(byName);
  const absent = new Set(students.filter((s) => marks[s.id] === 'absent').map((s) => s.id));
  const count = (m: GridMark) => Object.values(marks).filter((x) => x === m).length;
  const unchecked = students.filter((s) => marks[s.id] === undefined).length;
  /** `m` can be a function of the current mark, so quick double taps each count. */
  const setOne = (id: string, m: GridMark | undefined | ((cur: GridMark | undefined) => GridMark | undefined)) => setMarks((x) => {
    const n = { ...x };
    const v = typeof m === 'function' ? m(n[id]) : m;
    if (v === undefined) delete n[id]; else n[id] = v;
    return n;
  });

  async function save() {
    setBusy(true);
    await svc.saveYesNo(lesson, marks!);
    toast(`Saved: ${count('got')} yes, ${count('notyet')} not yet`);
    go(`class/${classId}`);
  }

  return (
    <div>
      <Header classId={classId} name={ctx.cls.name} />
      <div class="cc-eyebrow" style="margin-top:8px">Whole class yes/no</div>
      <IntentionLine lesson={lesson} />
      <p class="tiny muted" style="margin:4px 0 10px">Tap a name once for Yes, twice for Not yet, three times to clear. Untouched means not checked.</p>
      <div class="card flat" style="padding:2px 12px">
        {students.map((s) => {
          const m = marks[s.id];
          if (m === 'absent') {
            return (
              <div key={s.id} class="blitz-row yn-row absent">
                <span class="avatar">{initials(s)}</span>
                <span class="grow">{displayName(s)}</span>
                {ctx.absentNow.has(s.id)
                  ? <AbsentChip classId={classId} student={s} date={lesson.date} onHere={() => setOne(s.id, undefined)} />
                  : <button class="chip small absent-chip" onClick={() => setOne(s.id, undefined)}>Absent</button>}
              </div>
            );
          }
          return (
            <div key={s.id} class={`blitz-row yn-row ${m ?? ''}`}>
              <button class="yn-tap grow" aria-label={`${displayName(s)}: ${m === 'got' ? 'yes' : m === 'notyet' ? 'not yet' : 'not checked'}. Tap to change`} onClick={() => setOne(s.id, cycleMark)}>
                <span class="avatar">{initials(s)}</span>
                <span class="grow">{displayName(s)}</span>
                <span class={`yn-mark ${m ?? ''}`}>{m === 'got' ? <><Icon name="check" /> Yes</> : m === 'notyet' ? 'Not yet' : ''}</span>
              </button>
              <button class="bz abs" aria-label={`${displayName(s)}: absent`} onClick={() => setOne(s.id, 'absent')}>A</button>
            </div>
          );
        })}
      </div>
      <div class="blitz-bar">
        <span class="small"><b>{count('got')}</b> yes · <b>{count('notyet')}</b> not yet{absent.size ? ` · ${absent.size} absent` : ''}{unchecked ? ` · ${unchecked} not checked` : ''}</span>
        <div class="row" style="gap:6px">
          {unchecked > 0 && <button class="btn small" onClick={() => setMarks(allOthersYes(marks, students.map((s) => s.id), absent, 'got' as GridMark))}>All others: Yes</button>}
          <button class="btn primary small" disabled={busy || !Object.keys(marks).length} onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Exit or entry ticket ---------------- */

type TicketPhase = 'setup' | 'show' | 'record' | 'notyet';

/** `fromClose`: opened from Close lesson ("Run an exit ticket?"), so it starts as Exit and returns there. */
export function TicketScreen({ classId, fromClose = false }: { classId: string; fromClose?: boolean }) {
  const ctx = useLive(() => svc.loadLessonContext(classId), [classId]);
  const [kind, setKind] = useState<'exit' | 'entry'>('exit');
  const [question, setQuestion] = useState<string | null>(null);
  const [phase, setPhase] = useState<TicketPhase>('setup');
  const [check, setCheck] = useState<CfuCheck | null>(null);
  const [done, setDone] = useState<Record<string, CfuResultValue>>({});
  const [skipped, setSkipped] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const card = useRef<SwipeControl | null>(null);
  const checkRef = useRef<string | null>(null);
  useEffect(() => () => { if (checkRef.current) void svc.dropEmptyTicket(checkRef.current); }, []);

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
  const q = question ?? suggested;
  const backTo = fromClose ? `class/${classId}/close` : `class/${classId}`;
  const absentList = students.filter((s) => absentNow.has(s.id) && !(s.id in done));

  async function startRecording() {
    if (!check) {
      const c = await svc.startTicket(lesson, kind, q, kind === 'entry' ? previous?.id : undefined);
      checkRef.current = c.id;
      setCheck(c);
    }
    setPhase('record');
  }
  async function save(id: string, result: CfuResultValue, t: string[] = []) {
    const r = await svc.recordTicket(check!, id, result, t);
    setDone((d) => ({ ...d, [id]: result }));
    const name = displayName(students.find((s) => s.id === id)!);
    const label = result === 'got' ? 'Got it' : result === 'partly' ? 'Partly' : result === 'notyet' ? 'Not yet' : 'Absent';
    toast(`${label} · ${name}`, { label: 'Undo', seconds: UNDO_SECONDS, run: async () => { await svc.undoTicketResult(r); setDone((d) => { const n = { ...d }; delete n[id]; return n; }); setActiveId(id); setPhase('record'); } });
    setTags([]);
    setActiveId(null);
    setPhase('record');
  }
  function onSwipe(a: SwipeAction) {
    if (!activeId) return;
    if (a === 'good') save(activeId, 'got');
    else if (a === 'issue') setPhase('notyet');
    else save(activeId, 'partly');
  }

  if (phase === 'show') {
    return (
      <div class="projector" onClick={(e) => e.target === e.currentTarget && setPhase('setup')}>
        <span class="projector-label">{kind === 'exit' ? 'Exit ticket' : 'Entry ticket'}</span>
        <h1 class="projector-q">{q}</h1>
        <p class="projector-hint">Write your answer on paper or a sticky note.</p>
        <div class="projector-actions">
          <button class="btn" onClick={() => setPhase('setup')}><Icon name="back" /> Back</button>
          <button class="btn primary" onClick={startRecording}>Record answers <Icon name="arrow" /></button>
        </div>
      </div>
    );
  }

  const counts = Object.values(done);
  const n = (v: CfuResultValue) => counts.filter((x) => x === v).length;
  const header = <Header classId={classId} name={ctx.cls.name} right={phase === 'setup' ? undefined : `${counts.length} recorded · ${queue.length} to go`} />;

  if (phase === 'setup') {
    return (
      <div class="cc">
        {header}
        <div class="cc-eyebrow" style="margin-top:8px">Exit or entry ticket</div>
        <IntentionLine lesson={lesson} />
        <div class="seg" style="margin:6px 0 4px">
          <button class={kind === 'exit' ? 'sel' : ''} aria-pressed={kind === 'exit'} onClick={() => setKind('exit')}>Exit</button>
          <button class={kind === 'entry' ? 'sel' : ''} aria-pressed={kind === 'entry'} onClick={() => setKind('entry')}>Entry</button>
        </div>
        <p class="tiny muted" style="margin:4px 0 10px">{kind === 'exit' ? 'End of lesson: about today.' : previous ? `Start of lesson: about last lesson${previous.intention ? ` (${lessonName(previous)})` : ''}.` : 'Start of lesson: about last lesson (none recorded yet).'}</p>
        <label class="small" for="ticket-q"><b>Question</b></label>
        <textarea id="ticket-q" class="input" style="margin-top:6px;min-height:84px" maxLength={200} value={q} onInput={(e) => setQuestion((e.target as HTMLTextAreaElement).value)} />
        {question !== null && question !== suggested && <button class="link-btn tiny" onClick={() => setQuestion(null)}>Use the suggested question</button>}
        <div class="grid2" style="margin-top:14px">
          <button class="btn" disabled={!q.trim()} onClick={startRecording}>Record answers</button>
          <button class="btn primary" disabled={!q.trim()} onClick={() => setPhase('show')}><Icon name="share" /> Show it</button>
        </div>
        <p class="tiny muted" style="margin-top:8px">Show it: the question in big text for the projector. Students answer on paper; then swipe through the class to record.</p>
      </div>
    );
  }

  const absentStrip = absentList.length > 0 && (
    <div class="absent-strip">
      <span class="tiny muted">Absent today:</span>
      {absentList.map((s) => <span key={s.id} class="row" style="gap:4px"><span class="small">{displayName(s)}</span><AbsentChip classId={classId} student={s} date={lesson.date} /></span>)}
    </div>
  );

  const s = students.find((x) => x.id === activeId);
  if (!s) {
    return (
      <div class="cc">
        {header}
        <div class="done-state">
          <div class="check"><Icon name="check" /></div>
          <h2>{kind === 'exit' ? 'Exit' : 'Entry'} ticket recorded</h2>
          <p class="small">{n('got')} got it · {n('partly')} partly · {n('notyet')} not yet{n('absent') ? ` · ${n('absent')} absent` : ''}</p>
          {absentStrip}
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
      <p class="hw-from">{kind === 'exit' ? 'Exit' : 'Entry'} ticket: <b>{q}</b></p>
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
      <p class="hold-hint">Swipe {sideOf('good')} for got it, {sideOf('issue')} for not yet, up for partly</p>
      {absentStrip}
    </div>
  );
}
