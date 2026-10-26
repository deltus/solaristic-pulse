// Cold call: pick a student fairly with a quick name shuffle, show their last 5 cold calls,
// then swipe: right = answered well, left = struggled (optional ticks), up = pick someone else.

import { useEffect, useRef, useState } from 'preact/hooks';
import * as svc from '../../services';
import { UNDO_SECONDS } from '../../config/checkin';
import { lessonOf } from '../../logic/checkin';
import { coldCallHistory, coldCallSummary, pickColdCall, planShuffle, STRUGGLE_TAGS } from '../../logic/coldcall';
import { useLive, useSettings } from '../hooks';
import { displayName, Icon, initials, toast } from '../components';
import { SwipeCard, sideOf, type SwipeAction, type SwipeControl } from '../Swipe';
import { NeedLesson } from './Checkin';


export function ColdCallScreen({ classId }: { classId: string }) {
  const ctx = useLive(() => svc.loadLessonContext(classId), [classId]);
  const settings = useSettings();
  /** The student is chosen before the shuffle starts; a tap on the shuffle shows them at once. */
  const chosenRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'shuffle' | 'card' | 'struggle'>('idle');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [flash, setFlash] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [justCalled, setJustCalled] = useState<{ studentId: string; createdAt: number }[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const card = useRef<SwipeControl | null>(null);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (!ctx) return null;
  if (!ctx.lesson) return <NeedLesson classId={classId} name={ctx.cls.name} />;
  const lesson = ctx.lesson;
  const back = `#/class/${classId}`;
  const notHere = new Set(ctx.checkins.filter((c) => lessonOf(c) === lesson.id && c.status === 'absent').map((c) => c.studentId));
  // Calls saved this session count straight away (before the database refresh arrives).
  const calls = [...ctx.coldCalls, ...justCalled.map((j, i) => ({ id: `just-${i}`, lessonId: lesson.id, classId, date: lesson.date, result: 'good' as const, ...j }))];
  const present = ctx.students.filter((s) => !notHere.has(s.id));
  const s = ctx.students.find((x) => x.id === pickedId);

  function pick(avoid?: string) {
    timers.current.forEach(clearTimeout);
    const chosen = pickColdCall(ctx!.students, calls, new Set([...notHere, ...(avoid && present.length > 1 ? [avoid] : [])]), Math.random);
    if (!chosen) return;
    setTags([]);
    chosenRef.current = chosen.id;
    const plan = planShuffle(present.map(displayName), displayName(chosen), {
      animate: settings?.coldCallAnimation !== false,
      reduceMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    }, Math.random);
    if (!plan.total) return reveal();
    setPhase('shuffle');
    for (const f of plan.frames.slice(0, -1)) timers.current.push(setTimeout(() => setFlash(f.name), f.at));
    timers.current.push(setTimeout(reveal, plan.total));
  }
  /** Show the chosen student (end of the shuffle, a tap on it, or no animation). */
  function reveal() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (!chosenRef.current) return;
    setPickedId(chosenRef.current);
    setPhase('card');
    navigator.vibrate?.(15);
  }

  async function save(result: 'good' | 'struggled', t: string[] = []) {
    const c = await svc.logColdCall(lesson, s!.id, result, t);
    const name = displayName(s!);
    setJustCalled((j) => [...j, { studentId: s!.id, createdAt: c.createdAt }]);
    toast(`${result === 'good' ? 'Answered well' : 'Struggled'} · ${name}`, { label: 'Undo', seconds: UNDO_SECONDS, run: async () => { await svc.undoColdCall(c.id); setJustCalled((j) => j.filter((x) => x.createdAt !== c.createdAt)); } });
    setPhase('idle');
  }
  function onSwipe(a: SwipeAction) {
    if (a === 'good') save('good');
    else if (a === 'issue') setPhase('struggle');
    else pick(s?.id);
  }

  const header = (
    <div class="row between">
      <a class="link-btn back-btn" href={back}><Icon name="back" /> {ctx.cls.name}</a>
      <span class="tiny muted mono">{calls.filter((c) => c.lessonId === lesson.id).length} this lesson</span>
    </div>
  );

  if (phase === 'idle' || phase === 'shuffle') {
    return (
      <div class="cc checkin">
        {header}
        <div class="cc-eyebrow" style="margin-top:8px">Cold call</div>
        <div class={`shuffle-box ${phase === 'shuffle' ? 'spinning' : ''}`} aria-live="polite" role={phase === 'shuffle' ? 'button' : undefined} onClick={() => phase === 'shuffle' && reveal()}>
          {phase === 'shuffle' ? <span><span class="shuffle-name">{flash || '…'}</span><span class="tiny muted shuffle-skip">Tap to show now</span></span> : <span class="muted">Least recently called first, then random. Not here today: left out.</span>}
        </div>
        <button class="btn primary big block" disabled={phase === 'shuffle' || !present.length} onClick={() => pick()}><Icon name="user" /> {phase === 'shuffle' ? 'Picking…' : 'Pick a student'}</button>
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
          <div class="cc-eyebrow">Cold call · {displayName(s)}</div>
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
      <SwipeCard key={s.id} control={card} onSwipe={onSwipe} labels={{ good: 'Answered', issue: 'Struggled', up: 'Pick again' }} class="student-card pop-in">
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
      <div class="row" style="margin-top:10px"><button class="link-btn" onClick={() => pick(s.id)}><Icon name="skip" /> Pick again</button></div>
      <p class="hold-hint">Swipe {sideOf('good')} for answered well, {sideOf('issue')} for struggled, up to pick someone else</p>
    </div>
  );
}
