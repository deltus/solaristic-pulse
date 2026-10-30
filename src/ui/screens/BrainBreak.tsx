// Brain break: pick Subject or Calm, a name roll (the same Roll as cold call) lands on a break,
// the result shows the name big enough to project, "Show me how" opens the instructions, and
// "Done" logs it with an optional "Did it help?". No student data.

import { useState } from 'preact/hooks';
import * as svc from '../../services';
import { db } from '../../db';
import type { BrainBreak } from '../../config/brainBreaks';
import { availableBreaks, breaksFor, groupForSubject, instructionParts, startGroup, pickBreak, recentBreakIds, subjectGroups } from '../../logic/brainBreaks';
import { planRoll, type RollPlan } from '../../logic/coldcall';
import { go, useLive, useSettings } from '../hooks';
import { Icon, toast } from '../components';
import { Roll } from '../Roll';
import { NeedLesson } from './Checkin';

type Phase = 'pick' | 'subject' | 'roll' | 'result' | 'how' | 'helped';

/** Opens a game in a new tab (the system browser in the Android app), so it can be projected. */
export function openLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function BrainBreakScreen({ classId }: { classId: string }) {
  const settings = useSettings();
  const ctx = useLive(async () => {
    const lessonCtx = await svc.loadLessonContext(classId);
    if (!lessonCtx) return null;
    return { ...lessonCtx, logs: await db.brainBreaks.where('classId').equals(classId).toArray(), custom: await db.customBreaks.toArray() };
  }, [classId]);
  const [phase, setPhase] = useState<Phase>('pick');
  const [group, setGroup] = useState<string | null>(null);
  const [current, setCurrent] = useState<BrainBreak | null>(null);
  const [roll, setRoll] = useState<RollPlan | null>(null);
  const [rollN, setRollN] = useState(0);
  const [skipTick, setSkipTick] = useState(0);
  const [logId, setLogId] = useState<string | null>(null);

  if (!ctx || !settings) return ctx === null ? <p class="muted">Class not found.</p> : null;
  if (!ctx.lesson) return <NeedLesson classId={classId} name={ctx.cls.name} />;
  const lesson = ctx.lesson;
  const back = `#/class/${classId}`;
  const breaks = availableBreaks(ctx.custom, settings.hiddenBreaks ?? []);
  const groups = subjectGroups(breaks).filter((g) => breaks.some((b) => b.group === g.id));
  const recent = recentBreakIds(ctx.logs, ctx.lessons, classId);

  /** Roll within a group, landing on a fair pick (never the one just shown). */
  function spin(g: string, lastShown?: string) {
    const list = breaksFor(breaks, g, ctx!.cls.yearLevel);
    const chosen = pickBreak(list, recent, lastShown, Math.random);
    if (!chosen) return toast('No breaks in this group. Add your own in Settings → Brain breaks.');
    setGroup(g);
    setCurrent(chosen);
    const plan = planRoll(list.map((b) => b.name), chosen.name, {
      animate: settings!.coldCallAnimation !== false,
      reduceMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    }, Math.random);
    if (!plan.total) { setPhase('result'); return; }
    setSkipTick(0);
    setRollN((n) => n + 1);
    setRoll(plan);
    setPhase('roll');
  }
  function subjectBreak() {
    const g = startGroup(ctx!.cls.subject, groups);
    if (g) spin(g); else setPhase('subject');
  }
  async function done() {
    if (!current) return;
    const row = await svc.logBrainBreak(lesson, current);
    setLogId(row.id);
    setPhase('helped');
  }
  async function helped(answer?: 'yes' | 'no') {
    if (answer && logId) await svc.setBreakHelped(logId, answer);
    toast('Brain break saved');
    go(`class/${classId}`);
  }

  const header = <div class="row between"><a class="link-btn back-btn" href={back}><Icon name="back" /> {ctx.cls.name}</a><span class="tiny muted mono">Brain break</span></div>;
  const chips = group && group !== 'calm' && (
    <div class="chips bb-subjects" style="flex-wrap:wrap">
      {groups.map((g) => <button key={g.id} class={`chip small ${group === g.id ? 'active' : ''}`} onClick={() => spin(g.id)}>{g.label}</button>)}
    </div>
  );

  if (phase === 'pick') {
    return (
      <div class="cc">
        {header}
        <h1 style="margin:10px 0 14px">Brain break</h1>
        <div class="bb-pick">
          <button class="hub-btn primary" onClick={subjectBreak}><Icon name="bolt" /><b>Subject break</b><span>{groupForSubject(ctx.cls.subject, groups) ? `A quick game for ${ctx.cls.subject}` : 'A quick game that works in any class'}</span></button>
          <button class="hub-btn" onClick={() => spin('calm')}><Icon name="clock" /><b>Calm break</b><span>Breathing and grounding to settle the room</span></button>
        </div>
      </div>
    );
  }
  if (phase === 'subject') {
    return (
      <div class="cc">
        {header}
        <h2 style="margin:10px 0">Which subject?</h2>
        <p class="small muted">{ctx.cls.subject ? `No breaks for ${ctx.cls.subject} yet.` : 'This class has no subject set.'} Pick one, or add your own in Settings → Brain breaks.</p>
        <div class="chips" style="flex-wrap:wrap">{groups.map((g) => <button key={g.id} class="chip" onClick={() => spin(g.id)}>{g.label}</button>)}</div>
      </div>
    );
  }
  if (phase === 'roll' && roll) {
    return (
      <div class="cc" onClick={(e) => { if (!(e.target as HTMLElement).closest('.roll, a, button')) setSkipTick((n) => n + 1); }}>
        {header}
        {chips}
        <Roll key={rollN} plan={roll} skip={skipTick} onLanded={() => setTimeout(() => setPhase('result'), 600)} />
      </div>
    );
  }
  if (!current) return null;
  const meta = (
    <div class="chips bb-meta">
      <span class="chip small static">{current.minutes} min</span>
      <span class="chip small static">{current.years === 'Any' ? 'Any year' : `Years ${current.years}`}</span>
      {current.type === 'calm' && <span class="chip small static">Calm</span>}
      {current.link && <span class="chip small static" aria-label="Has a link">🔗</span>}
    </div>
  );
  if (phase === 'result') {
    return (
      <div class="cc">
        {header}
        {chips}
        <button class="bb-name" onClick={() => setPhase('how')}>{current.name}</button>
        {meta}
        <div class="grid2" style="margin-top:18px">
          <button class="btn big" onClick={() => spin(group ?? current.group, current.id)}><Icon name="skip" /> Spin again</button>
          <button class="btn big primary" onClick={() => setPhase('how')}>Show me how <Icon name="arrow" /></button>
        </div>
        <button class="btn block" style="margin-top:10px" onClick={done}><Icon name="check" /> Done</button>
      </div>
    );
  }
  if (phase === 'how') return <div class="cc">{header}<BreakInstructions b={current} all={breaks} onHide={() => setPhase('result')} />{meta}<button class="btn primary block" style="margin-top:14px" onClick={done}><Icon name="check" /> Done</button></div>;
  return (
    <div class="cc">
      {header}
      <div class="done-state">
        <h2>Did it help?</h2>
        <p class="muted small">{current.name}</p>
        <div class="grid2" style="margin-top:12px;width:100%">
          <button class="btn big" aria-label="Yes, it helped" onClick={() => helped('yes')}>👍</button>
          <button class="btn big" aria-label="No, it didn't help" onClick={() => helped('no')}>👎</button>
        </div>
        <button class="link-btn" style="margin-top:12px" onClick={() => helped()}>Skip</button>
      </div>
    </div>
  );
}

/** Resources, numbered steps with "Say:" lines picked out, the game link, notes and the seated version. */
export function BreakInstructions({ b, all, onHide }: { b: BrainBreak; all: BrainBreak[]; onHide?: () => void }) {
  const p = instructionParts(b, all);
  return (
    <div class="bb-how">
      <h2 class="bb-title">{b.name}</h2>
      {b.about && <p class="small muted" style="margin:0 0 10px">{b.about.replace(/^\w/, (c) => c.toUpperCase())}</p>}
      <div class="bb-resources">
        <b>{p.needs}</b>
        {p.optional && <span class="muted"> (optional: {p.optional})</span>}
        {p.openGame && (
          <>
            <button class="btn primary big block" style="margin-top:10px" onClick={() => openLink(p.openGame!)}>🔗 {p.openLabel}</button>
            {b.linkNote && <p class="tiny muted" style="margin:6px 0 0">{b.linkNote}</p>}
          </>
        )}
      </div>
      <ol class="bb-steps">
        {p.steps.map(({ before, say }, i) => <li key={i}>{before}{say && <span class="bb-say">Say: {say}</span>}</li>)}
      </ol>
      {b.notes && <p class="small" style="margin:12px 0 0"><b>Note:</b> {b.notes}</p>}
      {b.seatedVersion && <p class="small" style="margin:8px 0 0"><b>Seated version:</b> {b.seatedVersion}</p>}
      {p.calmRule && <p class="small bb-calm-rule">{p.calmRule}</p>}
      {onHide && <button class="btn block" style="margin-top:14px" onClick={onHide}><Icon name="back" /> Hide instructions</button>}
    </div>
  );
}
