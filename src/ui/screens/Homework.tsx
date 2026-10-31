// Homework check: the homework set in the previous lesson of this class, checked for the whole
// class in roster order. Done / Not done, with optional reasons.
// Saved as Homework records (not a daily check-in), shown in reports and counted in the ranking.

import { useEffect, useRef, useState } from 'preact/hooks';
import * as svc from '../../services';
import { HOMEWORK_REASONS, UNDO_SECONDS } from '../../config/checkin';
import type { CheckinTarget } from '../../logic/checkin';
import { earlierLessons, homeworkHistory, homeworkToCheck, lessonName } from '../../logic/lessons';
import { today } from '../../lib/dates';
import { NeedLesson } from './Checkin';
import { useLive } from '../hooks';
import { displayName, Icon, initials, toast } from '../components';
import { SwipeCard, sideOf, type SwipeAction, type SwipeControl } from '../Swipe';
import type { HomeworkCheck } from '../../types';
import { AbsentChip } from './Cfu';
import { PreviousButton, usePrevious } from '../Previous';

export const homeworkText = (h: Pick<HomeworkCheck, 'done' | 'reason'>) =>
  h.done ? 'Done' : `Not done${h.reason ? `, ${(HOMEWORK_REASONS.find((r) => r.id === h.reason)?.label ?? h.reason).toLowerCase()}` : ''}`;

export function HomeworkScreen({ classId, anyway = false }: { classId: string; anyway?: boolean }) {
  const date = today();
  const ctx = useLive(() => svc.loadLessonContext(classId), [classId]);
  const lessonId = ctx?.lesson?.id ?? '';
  const [skipped, setSkipped] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const card = useRef<SwipeControl | null>(null);
  const prev = usePrevious();
  /** Brought back from Absent (Undo or Previous): shown again before the database refresh arrives. */
  const [hereAgain, setHereAgain] = useState<Set<string>>(new Set());

  // Saved this session (before the database refresh arrives) plus what is already saved.
  const [justChecked, setJustChecked] = useState<Set<string>>(new Set());
  const checked = new Set([...(ctx?.homework ?? []).filter((h) => h.lessonId === lessonId).map((h) => h.studentId), ...justChecked]);
  const sorted = [...(ctx?.students ?? [])].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  // Absent today in this class: shown as Absent, not asked.
  const absentList = sorted.filter((s) => ctx?.absentNow.has(s.id) && !checked.has(s.id));
  const roster = sorted.filter((s) => !checked.has(s.id) && !ctx?.absentNow.has(s.id));
  const queue = [...roster.filter((s) => !skipped.includes(s.id)), ...skipped.map((id) => roster.find((s) => s.id === id)).filter((s) => !!s)] as typeof roster;
  // Moves on when the current student is checked, or marked absent (once the database refresh arrives).
  const activeAbsent = !!activeId && !!ctx?.absentNow.has(activeId) && !hereAgain.has(activeId);
  useEffect(() => { if ((!activeId || activeAbsent) && queue[0]) setActiveId(queue[0].id); }, [activeId, activeAbsent, queue[0]?.id]);

  if (!ctx) return null;
  if (!ctx.lesson) return <NeedLesson classId={classId} name={ctx.cls.name} />;
  const back = `#/class/${classId}`;
  // "Check anyway": no homework was marked as set; link the checks to the previous lesson if there is one.
  const forLesson = homeworkToCheck(ctx.lessons, classId, ctx.lesson) ?? (anyway ? earlierLessons(ctx.lessons, classId, ctx.lesson)[0] : undefined);
  if (!forLesson && !anyway) {
    return (
      <div class="cc">
        <a class="link-btn back-btn" href={back}><Icon name="back" /> {ctx.cls.name}</a>
        <div class="done-state"><h2>No homework to check</h2><p class="muted small">The last lesson of {ctx.cls.name} wasn't closed with homework set.</p></div>
      </div>
    );
  }
  const setWhat = forLesson?.homeworkSet ? forLesson.homeworkText || 'Homework' : null;
  const s = activeAbsent ? undefined : ctx.students.find((x) => x.id === activeId);
  const target = (id: string): CheckinTarget => ({ studentId: id, classId, date, lessonId });

  async function save(id: string, done: boolean, reason?: string) {
    const row = await svc.saveHomeworkCheck(target(id), done, reason, forLesson?.id);
    setJustChecked((j) => new Set([...j, id]));
    offerUndo(`${done ? 'Done' : 'Not done'} · ${nameOf(id)}`, id, () => svc.undoHomeworkCheck(row.id));
    setAsking(false);
    setActiveId(null);
  }
  const nameOf = (id: string) => displayName(ctx!.students.find((x) => x.id === id)!);
  /** Undo for 5 seconds; "Previous" keeps the same undo for the rest of this visit. */
  function offerUndo(label: string, id: string, run: () => Promise<unknown>) {
    prev.push(id, run);
    toast(label, { label: 'Undo', seconds: UNDO_SECONDS, run: async () => { prev.drop(id); await run(); bringBack(id); } });
  }
  function bringBack(id: string) {
    setJustChecked((j) => { const n = new Set(j); n.delete(id); return n; });
    setHereAgain((h) => new Set([...h, id]));
    setSkipped((k) => k.filter((x) => x !== id));
    setAsking(false);
    setActiveId(id);
  }
  const previous = <PreviousButton prev={prev} name={nameOf} onBack={bringBack} />;
  function onSwipe(a: SwipeAction) {
    if (!s) return;
    if (a === 'good') save(s.id, true);
    else if (a === 'issue') setAsking(true);
    else { setSkipped((k) => [...k.filter((x) => x !== s.id), s.id]); setActiveId(null); }
  }

  const header = (
    <div class="row between">
      <a class="link-btn back-btn" href={back}><Icon name="back" /> {ctx.cls.name}</a>
      <span class="tiny muted mono">{checked.size} checked{absentList.length ? ` · ${absentList.length} absent` : ''} · {queue.length} to go</span>
    </div>
  );
  const absentStrip = absentList.length > 0 && (
    <div class="absent-strip">
      <span class="tiny muted">Absent today:</span>
      {absentList.map((x) => <span key={x.id} class="row" style="gap:4px"><span class="small">{displayName(x)}</span><AbsentChip classId={classId} student={x} date={date} /></span>)}
    </div>
  );
  if (!s) {
    return (
      <div class="cc">
        {header}
        <div class="done-state">
          <div class="check"><Icon name="check" /></div>
          <h2>Homework checked for everyone{absentList.length ? ' here' : ''}</h2>
          {absentStrip}
          <div style="margin-top:10px">{previous}</div>
          <a class="btn primary" href={back} style="margin-top:10px">Back to {ctx.cls.name}</a>
        </div>
      </div>
    );
  }

  const history = homeworkHistory(ctx.lessons, ctx.homework, classId, s.id, 6).filter((h) => h.key !== forLesson?.id).slice(0, 5);
  const done = <button class="btn big good-btn" onClick={() => card.current?.fling('good')}><Icon name="check" /> Done</button>;
  const notDone = <button class="btn big issue-btn" onClick={() => card.current?.fling('issue')}><Icon name="x" /> Not done</button>;

  return (
    <div class="cc checkin">
      {header}
      <div class="cc-eyebrow" style="margin-top:8px">Homework check</div>
      <p class="hw-from">{setWhat ? <>Homework from last lesson: <b>{setWhat}</b></> : 'Checking anyway: no homework was set last lesson.'}</p>
      {asking ? (
        <div class="fade-up student-card">
          <h1 class="card-name">{displayName(s)}</h1>
          <p class="small muted" style="margin:4px 0 12px">Not done. Why? (optional)</p>
          <div class="cc-opts">
            {HOMEWORK_REASONS.map((r) => <button key={r.id} class="opt" onClick={() => save(s.id, false, r.id)}><span class="opt-label">{r.label}</span></button>)}
          </div>
          <div class="grid2" style="margin-top:12px">
            <button class="btn" onClick={() => setAsking(false)}><Icon name="back" /> Back</button>
            <button class="btn primary" onClick={() => save(s.id, false)}>Skip reason <Icon name="arrow" /></button>
          </div>
        </div>
      ) : (
        <>
          <SwipeCard key={s.id} control={card} onSwipe={onSwipe} labels={{ good: 'Done', issue: 'Not done', up: 'Skip' }} class="student-card">
            <div class="row" style="gap:12px">
              <span class="avatar big">{initials(s)}</span>
              <h1 class="card-name grow">{displayName(s)}</h1>
            </div>
            {setWhat && forLesson && <div class="hw-now">Checking: <b>{setWhat}</b>, from {lessonName(forLesson)}</div>}
            <div class="hw-history">
              {history.length ? history.map((h) => (
                <div key={h.key} class="row between tiny"><span class="muted ellipsis">{h.label}</span><span class={h.done === null ? 'muted' : h.done ? 'ok' : 'warn'}>{h.result}</span></div>
              )) : <span class="tiny muted">No earlier homework</span>}
            </div>
          </SwipeCard>
          <div class="grid2 swipe-buttons">{sideOf('good') === 'left' ? [done, notDone] : [notDone, done]}</div>
          <div class="row between" style="margin-top:10px">
            <button class="link-btn" onClick={() => card.current?.fling('up')}><Icon name="skip" /> Skip</button>
            <button class="link-btn" onClick={async () => {
              // Absent: for the rest of the day in this class (no homework record).
              await svc.markAbsent(classId, s.id, date, 'homework');
              setHereAgain((h) => { const n = new Set(h); n.delete(s.id); return n; });
              offerUndo(`Absent · ${displayName(s)}`, s.id, () => svc.markHereNow(classId, s.id, date));
              setActiveId(null);
            }}>Absent</button>
          </div>
          {previous}
          <p class="hold-hint">Swipe {sideOf('good')} for done, {sideOf('issue')} for not done, up to skip</p>
          {absentStrip}
        </>
      )}
    </div>
  );
}
