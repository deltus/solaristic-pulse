// Homework check: the whole class in roster order, Done / Not done, with optional reasons.
// Saved as Homework records (not a daily check-in), shown in reports and counted in the ranking.

import { useEffect, useRef, useState } from 'preact/hooks';
import * as svc from '../../services';
import { HOMEWORK_REASONS, UNDO_SECONDS } from '../../config/checkin';
import { lessonIdFor, type CheckinTarget } from '../../logic/checkin';
import { formatShort, today } from '../../lib/dates';
import { useLive } from '../hooks';
import { displayName, Icon, initials, toast } from '../components';
import { SwipeCard, sideOf, type SwipeAction, type SwipeControl } from '../Swipe';
import type { HomeworkCheck } from '../../types';

export const homeworkText = (h: Pick<HomeworkCheck, 'done' | 'reason'>) =>
  h.done ? 'Done' : `Not done${h.reason ? `, ${(HOMEWORK_REASONS.find((r) => r.id === h.reason)?.label ?? h.reason).toLowerCase()}` : ''}`;

export function HomeworkScreen({ classId }: { classId: string }) {
  const date = today();
  const lessonId = lessonIdFor(date, classId);
  const ctx = useLive(() => svc.loadLessonContext(classId), [classId]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const card = useRef<SwipeControl | null>(null);

  // Saved this session (before the database refresh arrives) plus what is already saved.
  const [justChecked, setJustChecked] = useState<Set<string>>(new Set());
  const checked = new Set([...(ctx?.homework ?? []).filter((h) => h.lessonId === lessonId).map((h) => h.studentId), ...justChecked]);
  const roster = [...(ctx?.students ?? [])].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)).filter((s) => !checked.has(s.id));
  const queue = [...roster.filter((s) => !skipped.includes(s.id)), ...skipped.map((id) => roster.find((s) => s.id === id)).filter((s) => !!s)] as typeof roster;
  useEffect(() => { if (!activeId && queue[0]) setActiveId(queue[0].id); }, [activeId, queue[0]?.id]);

  if (!ctx) return null;
  const back = `#/class/${classId}`;
  const s = ctx.students.find((x) => x.id === activeId);
  const target = (id: string): CheckinTarget => ({ studentId: id, classId, date, lessonId });

  async function save(id: string, done: boolean, reason?: string) {
    const row = await svc.saveHomeworkCheck(target(id), done, reason);
    setJustChecked((j) => new Set([...j, id]));
    const name = displayName(ctx!.students.find((x) => x.id === id)!);
    toast(`${done ? 'Done' : 'Not done'} · ${name}`, { label: 'Undo', seconds: UNDO_SECONDS, run: async () => { await svc.undoHomeworkCheck(row.id); setJustChecked((j) => { const n = new Set(j); n.delete(id); return n; }); setAsking(false); setActiveId(id); } });
    setAsking(false);
    setActiveId(null);
  }
  function onSwipe(a: SwipeAction) {
    if (!s) return;
    if (a === 'good') save(s.id, true);
    else if (a === 'issue') setAsking(true);
    else { setSkipped((k) => [...k.filter((x) => x !== s.id), s.id]); setActiveId(null); }
  }

  const header = (
    <div class="row between">
      <a class="link-btn back-btn" href={back}><Icon name="back" /> {ctx.cls.name}</a>
      <span class="tiny muted mono">{checked.size} checked · {queue.length} to go</span>
    </div>
  );
  if (!s) {
    return (
      <div class="cc">
        {header}
        <div class="done-state">
          <div class="check"><Icon name="check" /></div>
          <h2>Homework checked for everyone</h2>
          <a class="btn primary" href={back} style="margin-top:10px">Back to {ctx.cls.name}</a>
        </div>
      </div>
    );
  }

  const history = ctx.homework.filter((h) => h.studentId === s.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const done = <button class="btn big good-btn" onClick={() => card.current?.fling('good')}><Icon name="check" /> Done</button>;
  const notDone = <button class="btn big issue-btn" onClick={() => card.current?.fling('issue')}><Icon name="x" /> Not done</button>;

  return (
    <div class="cc checkin">
      {header}
      <div class="cc-eyebrow" style="margin-top:8px">Homework check</div>
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
            <div class="hw-history">
              {history.length ? history.map((h) => (
                <div key={h.id} class="row between tiny"><span class="muted">{formatShort(h.date)}</span><span class={h.done ? 'ok' : 'warn'}>{homeworkText(h)}</span></div>
              )) : <span class="tiny muted">No homework checks yet</span>}
            </div>
          </SwipeCard>
          <div class="grid2 swipe-buttons">{sideOf('good') === 'left' ? [done, notDone] : [notDone, done]}</div>
          <div class="row" style="margin-top:10px"><button class="link-btn" onClick={() => card.current?.fling('up')}><Icon name="skip" /> Skip</button></div>
          <p class="hold-hint">Swipe {sideOf('good')} for done, {sideOf('issue')} for not done, up to skip</p>
        </>
      )}
    </div>
  );
}
