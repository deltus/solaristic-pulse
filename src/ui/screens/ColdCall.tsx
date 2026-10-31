// Cold call: pick a student fairly with a name roll (src/ui/Roll.tsx), show their last 5 cold calls,
// then swipe: right = answered well, left = struggled (optional ticks), up = pick someone else.
// Select a student (`manual`): the teacher picks from a searchable grid instead of the roll; saved
// as a cold call with `manual: true`, so it still counts in the fairness ranking.

import { useEffect, useRef, useState } from 'preact/hooks';
import * as svc from '../../services';
import { UNDO_SECONDS } from '../../config/checkin';
import { lessonOf } from '../../logic/checkin';
import { coldCallHistory, coldCallSummary, pickColdCall, planRoll, STRUGGLE_TAGS, type RollPlan } from '../../logic/coldcall';
import { Roll } from '../Roll';
import { useLive, useSettings } from '../hooks';
import { displayName, Empty, Icon, initials, toast } from '../components';
import { SwipeCard, sideOf, type SwipeAction, type SwipeControl } from '../Swipe';
import { NeedLesson } from './Checkin';
import { tableName } from '../../logic/rooms';
import { IntentionLine, ModeTitle } from './Cfu';
import { PreviousButton, usePrevious } from '../Previous';


export function ColdCallScreen({ classId, manual = false }: { classId: string; manual?: boolean }) {
  const ctx = useLive(() => svc.loadLessonContext(classId), [classId]);
  const settings = useSettings();
  /** The student is chosen before the shuffle starts; a tap on the shuffle shows them at once. */
  const chosenRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'shuffle' | 'card' | 'struggle'>('idle');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [roll, setRoll] = useState<RollPlan | null>(null);
  /** Bumped by a tap anywhere on the screen during the roll, which jumps it to the landed name. */
  const [skipTick, setSkipTick] = useState(0);
  const [rollN, setRollN] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [justCalled, setJustCalled] = useState<{ studentId: string; createdAt: number }[]>([]);
  /** "Pick from: whole class / a table" (when there's an active seating plan). */
  const [table, setTable] = useState<string | null>(null);
  /** Select a student: the search box. */
  const [q, setQ] = useState('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const card = useRef<SwipeControl | null>(null);
  const prev = usePrevious();
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (!ctx) return null;
  if (!ctx.lesson) return <NeedLesson classId={classId} name={ctx.cls.name} />;
  const lesson = ctx.lesson;
  const back = `#/class/${classId}`;
  // Not here this lesson, or absent earlier today in this class: left out of the roll.
  const notHere = new Set([...ctx.checkins.filter((c) => lessonOf(c) === lesson.id && c.status === 'absent').map((c) => c.studentId), ...ctx.absentNow]);
  // Calls saved this session count straight away (before the database refresh arrives).
  const calls = [...ctx.coldCalls, ...justCalled.map((j, i) => ({ id: `just-${i}`, lessonId: lesson.id, classId, date: lesson.date, result: 'good' as const, ...j }))];
  const plan = ctx.seatingPlan;
  const tables = plan ? [...new Set(Object.keys(plan.seats).map((seat) => tableName(plan.room, seat)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
  const atTable = (id: string) => !table || (!!plan && Object.entries(plan.seats).some(([seat, v]) => v.studentId === id && tableName(plan.room, seat) === table));
  const outside = ctx.students.filter((x) => !atTable(x.id)).map((x) => x.id);
  const present = ctx.students.filter((s) => !notHere.has(s.id) && atTable(s.id));
  const s = ctx.students.find((x) => x.id === pickedId);

  function pick(avoid?: string) {
    timers.current.forEach(clearTimeout);
    const chosen = pickColdCall(ctx!.students, calls, new Set([...notHere, ...outside, ...(avoid && present.length > 1 ? [avoid] : [])]), Math.random);
    if (!chosen) return;
    setTags([]);
    chosenRef.current = chosen.id;
    const plan = planRoll(present.map(displayName), displayName(chosen), {
      animate: settings?.coldCallAnimation !== false,
      reduceMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    }, Math.random);
    if (!plan.total) return reveal();
    setSkipTick(0);
    setRollN((n) => n + 1);
    setRoll(plan);
    setPhase('shuffle');
  }
  /** The roll landed (or was tapped): a moment on the highlighted name, then the card. */
  function landed() {
    timers.current.push(setTimeout(reveal, 700));
  }
  /** Show the chosen student (after the roll, a second tap, or no animation). */
  function reveal() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (!chosenRef.current) return;
    setPickedId(chosenRef.current);
    setPhase('card');
  }

  async function save(result: 'good' | 'struggled', t: string[] = []) {
    const c = await svc.logColdCall(lesson, s!.id, result, t, manual);
    const name = displayName(s!);
    setJustCalled((j) => [...j, { studentId: s!.id, createdAt: c.createdAt }]);
    const undo = async () => { await svc.undoColdCall(c.id); setJustCalled((j) => j.filter((x) => x.createdAt !== c.createdAt)); };
    prev.push(s!.id, undo);
    toast(`${result === 'good' ? 'Answered well' : 'Struggled'} · ${name}`, { label: 'Undo', seconds: UNDO_SECONDS, run: async () => { prev.drop(s!.id); await undo(); } });
    setPhase('idle');
  }
  /** "Previous": the last student called (or marked Not here), back on screen to answer again. */
  function bringBack(id: string) {
    timers.current.forEach(clearTimeout);
    chosenRef.current = id;
    setTags([]);
    setPickedId(id);
    setPhase('card');
  }
  const previous = <PreviousButton prev={prev} name={(id) => displayName(ctx!.students.find((x) => x.id === id)!)} onBack={bringBack} />;
  function onSwipe(a: SwipeAction) {
    if (a === 'good') save('good');
    else if (a === 'issue') setPhase('struggle');
    else if (manual) setPhase('idle');
    else pick(s?.id);
  }
  /** Select a student: the chosen student's card straight away. */
  function choose(id: string) {
    setTags([]);
    chosenRef.current = id;
    setPickedId(id);
    setPhase('card');
  }

  const header = (
    <div class="row between">
      <a class="link-btn back-btn" href={back}><Icon name="back" /> {ctx.cls.name}</a>
      <span class="tiny muted mono">{calls.filter((c) => c.lessonId === lesson.id).length} this lesson</span>
    </div>
  );

  if (manual && phase === 'idle') {
    const calledNow = new Set(calls.filter((c) => c.lessonId === lesson.id).map((c) => c.studentId));
    const list = [...ctx.students].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
      .filter((x) => !q || displayName(x).toLowerCase().includes(q.toLowerCase()));
    return (
      <div class="cc">
        {header}
        <ModeTitle mode="select" />
        <IntentionLine lesson={lesson} />
        <input class="input" type="search" placeholder="Search by name" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} style="margin:6px 0 10px" />
        <div class="pick-grid">
          {list.map((x) => (
            <button key={x.id} class={`pick-cell ${notHere.has(x.id) ? 'absent' : ''}`} onClick={() => choose(x.id)} aria-label={`${displayName(x)}${notHere.has(x.id) ? ', absent today' : ''}${calledNow.has(x.id) ? ', called this lesson' : ''}`}>
              <span class="avatar">{initials(x)}</span>
              <span class="pick-name">{displayName(x)}</span>
              {notHere.has(x.id) ? <span class="tiny muted">Absent</span> : calledNow.has(x.id) ? <span class="tiny ok"><Icon name="check" /></span> : null}
            </button>
          ))}
        </div>
        {!list.length && <Empty icon="search">No one matches “{q}”.</Empty>}
        <p class="tiny muted" style="margin-top:8px">Counts as a cold call, so the fair pick in Cold call assistant knows who's had a turn.</p>
        <div style="margin-top:6px">{previous}</div>
      </div>
    );
  }

  if (phase === 'idle' || phase === 'shuffle') {
    return (
      <div class="cc checkin" onClick={(e) => { if (phase === 'shuffle' && !(e.target as HTMLElement).closest('.roll, a')) setSkipTick((n) => n + 1); }}>
        {header}
        <ModeTitle mode="coldcall" />
        <IntentionLine lesson={lesson} />
        {phase === 'shuffle' && roll
          ? <Roll key={rollN} plan={roll} skip={skipTick} onLanded={landed} />
          : <div class="shuffle-box"><span class="muted">Least recently called first, then random. Not here or absent today: left out.</span></div>}
        {tables.length > 0 && phase === 'idle' && (
          <div class="chips pick-from" style="flex-wrap:wrap;margin-bottom:10px">
            <span class="tiny muted">Pick from:</span>
            <button class={`chip tiny-chip ${!table ? 'active' : ''}`} aria-pressed={!table} onClick={() => setTable(null)}>Whole class</button>
            {tables.map((t) => <button key={t} class={`chip tiny-chip ${table === t ? 'active' : ''}`} aria-pressed={table === t} onClick={() => setTable(t)}>{t}</button>)}
          </div>
        )}
        <button class="btn primary big block" disabled={phase === 'shuffle' || !present.length} onClick={() => pick()}><Icon name="user" /> {phase === 'shuffle' ? 'Picking…' : 'Pick a student'}</button>
        {phase === 'idle' && <div style="margin-top:10px">{previous}</div>}
      </div>
    );
  }

  if (!s) return null;
  const history = coldCallHistory(calls.filter((c) => !c.id.startsWith('just-')), ctx.lessons, s.id, 5);

  if (phase === 'struggle') {
    return (
      <div class="cc checkin">
        {header}
        <div class="fade-up student-card">
          <div class="cc-eyebrow">{manual ? 'Select a student' : 'Cold call'} · {displayName(s)}</div>
          <h2 style="margin:6px 0 10px">Struggled. Anything to note?</h2>
          <div class="chips" style="flex-wrap:wrap">
            {STRUGGLE_TAGS.map((t) => <button key={t.id} class={`chip ${tags.includes(t.id) ? 'active' : ''}`} aria-pressed={tags.includes(t.id)} onClick={() => setTags((x) => (x.includes(t.id) ? x.filter((y) => y !== t.id) : [...x, t.id]))}>{t.label}</button>)}
          </div>
          <p class="tiny muted" style="margin-top:8px">Optional. "Wasn't listening" also counts toward Attention.</p>
          <div class="grid2" style="margin-top:12px">
            <button class="btn" onClick={() => setPhase('card')}><Icon name="back" /> Back</button>
            <button class="btn primary" onClick={() => save('struggled', tags)}>Save <Icon name="check" /></button>
          </div>
        </div>
      </div>
    );
  }

  const good = <button class="btn big good-btn" onClick={() => card.current?.fling('good')}><Icon name="check" /> Answered well</button>;
  const bad = <button class="btn big issue-btn" onClick={() => card.current?.fling('issue')}><Icon name="alert" /> Struggled</button>;
  return (
    <div class="cc checkin">
      {header}
      <SwipeCard key={s.id} control={card} onSwipe={onSwipe} labels={{ good: 'Answered', issue: 'Struggled', up: manual ? 'Choose again' : 'Pick again' }} class="student-card pop-in">
        <div class="row" style="gap:12px">
          <span class="avatar big">{initials(s)}</span>
          <div class="grow">
            <h1 class="card-name">{displayName(s)}</h1>
            <div class="tiny muted">{coldCallSummary(calls, s.id)}</div>
          </div>
        </div>
        <div class="hw-history">
          {history.length ? history.map((h) => <div key={h.call.id} class="tiny"><span class={h.call.result === 'good' ? 'ok' : 'warn'}>●</span> {h.text}</div>) : <span class="tiny muted">First cold call in this class</span>}
        </div>
      </SwipeCard>
      <div class="grid2 swipe-buttons">{sideOf('good') === 'left' ? [good, bad] : [bad, good]}</div>
      <div class="row between" style="margin-top:10px">
        <button class="link-btn" onClick={() => (manual ? setPhase('idle') : pick(s.id))}><Icon name="skip" /> {manual ? 'Choose someone else' : 'Pick again'}</button>
        <button class="link-btn" onClick={async () => {
          // Not here: absent for the rest of the day in this class, then pick someone else.
          await svc.markAbsent(classId, s.id, lesson.date, 'coldcall');
          const undo = () => svc.markHereNow(classId, s.id, lesson.date);
          prev.push(s.id, undo);
          toast(`Not here · ${displayName(s)}`, { label: 'Undo', seconds: UNDO_SECONDS, run: async () => { prev.drop(s.id); await undo(); } });
          setPhase('idle');
        }}>Not here</button>
      </div>
      {previous}
      <p class="hold-hint">Swipe {sideOf('good')} for answered well, {sideOf('issue')} for struggled, up to {manual ? 'choose' : 'pick'} someone else</p>
    </div>
  );
}
