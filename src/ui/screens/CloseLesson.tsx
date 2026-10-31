// Close lesson: class attention (the focus dial), homework set, and the teacher's own check
// (two required questions and a note). "Remind me in 30 minutes" keeps it to finish later.

import { useState } from 'preact/hooks';
import type { Happy, PlanDone } from '../../types';
import * as svc from '../../services';
import { clampPct, zoneFor } from '../../logic/checkout';
import { lessonName, REMIND_LATER_MIN } from '../../logic/lessons';
import { formatShort } from '../../lib/dates';
import { go, useLive } from '../hooks';
import { Icon, toast } from '../components';
import { Speedometer, ZONE_COLOUR } from '../Speedometer';
import { cancelClosePrompt, promptToClose } from '../lessonPrompts';
import { JournalForm } from '../Journal';
import { isRelief } from '../../relief/device';
import { exitTicketDone } from '../../logic/cfu';

const HAPPY: { v: Happy; label: string }[] = [{ v: 'yes', label: 'Yes' }, { v: 'mostly', label: 'Mostly' }, { v: 'no', label: 'No' }];
const PLAN: { v: PlanDone; label: string }[] = [{ v: 'yes', label: 'Yes' }, { v: 'partly', label: 'Partly' }, { v: 'no', label: 'No' }];

export function CloseLessonScreen({ classId }: { classId: string }) {
  const ctx = useLive(() => svc.loadLessonContext(classId), [classId]);
  if (!ctx) return null;
  if (!ctx.lesson) {
    return (
      <div class="cc">
        <a class="link-btn back-btn" href={`#/class/${classId}`}><Icon name="back" /> {ctx.cls.name}</a>
        <div class="done-state"><div class="check"><Icon name="check" /></div><h2>No lesson open</h2><p class="muted small">Every lesson for {ctx.cls.name} is closed.</p></div>
      </div>
    );
  }
  return <CloseForm key={ctx.lesson.id} classId={classId} className={ctx.cls.name} lesson={ctx.lesson} offerTicket={!exitTicketDone(ctx.cfuChecks, ctx.lesson.id)} />;
}

function CloseForm({ classId, className, lesson, offerTicket }: { classId: string; className: string; lesson: NonNullable<svc.LessonContext['lesson']>; offerTicket: boolean }) {
  // No preset needle (no anchoring): it appears where the teacher first taps. "Skip" leaves attention out.
  const [pct, setPct] = useState<number | null>(lesson.attentionPct ?? null);
  const [skipped, setSkipped] = useState(false);
  const [hwSet, setHwSet] = useState(!!lesson.homeworkSet);
  const [hwText, setHwText] = useState(lesson.homeworkText ?? '');
  const [happy, setHappy] = useState<Happy | undefined>(lesson.happy);
  const [plan, setPlan] = useState<PlanDone | undefined>(lesson.planDone);
  const [note, setNote] = useState(lesson.note ?? '');
  const [journal, setJournal] = useState(false);
  const answers = () => ({ attentionPct: pct ?? undefined, homeworkSet: hwSet, homeworkText: hwText, happy, planDone: plan, note });
  const zone = pct === null ? null : zoneFor(pct);
  const move = (v: number) => { setSkipped(false); setPct(clampPct(v)); };
  const attentionDone = pct !== null || skipped;
  // Relief teachers skip the teacher check: those answers are the class teacher's own reflection.
  const relief = isRelief();
  const ready = attentionDone && (relief || (!!happy && !!plan));

  async function close() {
    await svc.closeLesson(lesson.id, answers());
    cancelClosePrompt(lesson.id);
    toast(`${className} closed`);
    go('home');
  }
  async function later() {
    const at = await svc.finishLessonLater(lesson.id, answers());
    promptToClose(lesson, className, at);
    toast(`Reminder in ${REMIND_LATER_MIN} minutes`);
    go('home');
  }

  return (
    <div class="cc close-lesson">
      <a class="link-btn back-btn" href={`#/class/${classId}`}><Icon name="back" /> {className}</a>
      <div class="cc-eyebrow" style="margin-top:10px">Close lesson · {formatShort(lesson.date)}</div>
      <div class="cc-head"><h1>{lesson.intention ? lessonName(lesson) : className}</h1></div>
      {offerTicket && !relief && (
        <div class="notice info row between" style="gap:10px">
          <span><b>Run an exit ticket?</b> <span class="tiny muted">None done this lesson.</span></span>
          <button class="btn small" onClick={() => go(`class/${classId}/cfu/ticket/close`)}>Run one</button>
        </div>
      )}

      <section class="close-part">
        <h3>Class attention</h3>
        <p class="small muted">Roughly how much of the lesson was the class on task?</p>
        <div class="speedo-wrap">
          <Speedometer value={pct} onChange={move} label="Share of the lesson the class was on task" />
          <div class="speedo-readout">
            <button class="round-btn" aria-label="Down 1%" onClick={() => move((pct ?? 75) - 1)}><Icon name="minus" /></button>
            <div class="grow">
              <div class="speedo-value">{pct !== null ? `${pct}%` : skipped ? 'Skipped' : '–'}</div>
              <div class="speedo-zone-label" style={{ color: zone ? ZONE_COLOUR[zone.zone] : 'var(--muted)' }}>{zone ? zone.label : skipped ? 'Not recorded' : 'Tap the dial'}</div>
            </div>
            <button class="round-btn" aria-label="Up 1%" onClick={() => move((pct ?? 75) + 1)}><Icon name="plus" /></button>
          </div>
        </div>
        <div class="row between">
          {pct !== null ? <button class="link-btn tiny" onClick={() => setPct(null)}>Clear</button> : <span />}
          {!skipped && <button class="link-btn tiny" onClick={() => { setPct(null); setSkipped(true); }}>Skip</button>}
        </div>
      </section>

      <section class="close-part">
        <label class="check-row"><input type="checkbox" checked={hwSet} onChange={(e) => setHwSet((e.target as HTMLInputElement).checked)} /> <b>Homework set</b></label>
        {hwSet && <input class="input pop-in" style="margin-top:8px" value={hwText} maxLength={160} placeholder="What was it? e.g. Finish the river worksheet" onInput={(e) => setHwText((e.target as HTMLInputElement).value)} />}
        <p class="tiny muted" style="margin-top:6px">Ticked: Homework check appears next lesson.</p>
      </section>

      {!relief && <section class="close-part">
        <h3>Teacher check</h3>
        <p class="small" style="margin:8px 0 6px">Happy with today's lesson?</p>
        <div class="seg">{HAPPY.map((o) => <button key={o.v} class={happy === o.v ? 'sel' : ''} aria-pressed={happy === o.v} onClick={() => setHappy(o.v)}>{o.label}</button>)}</div>
        <p class="small" style="margin:12px 0 6px">Did you get through what you planned?</p>
        <div class="seg">{PLAN.map((o) => <button key={o.v} class={plan === o.v ? 'sel' : ''} aria-pressed={plan === o.v} onClick={() => setPlan(o.v)}>{o.label}</button>)}</div>
        <textarea class="input" style="margin-top:12px" value={note} placeholder="Note (optional, just for you)" onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
        <p class="tiny muted">Your answers are private to you. They feed "My teaching" and are never in reports or shared exports.</p>
        <button class="link-btn" style="padding:4px 0;color:var(--blue)" onClick={() => setJournal(true)}><Icon name="edit" /> Write a journal entry</button>
        {journal && <JournalForm classId={classId} start={{ lessonId: lesson.id, text: note }} onClose={() => setJournal(false)} />}
      </section>}

      <button class="btn primary block" disabled={!ready} onClick={close}><Icon name="check" /> Close lesson</button>
      {!ready && relief && <p class="hold-hint">Set the class attention (or tap Skip) to close.</p>}
      {!ready && !relief && <p class="hold-hint">{!attentionDone ? 'Set the class attention (or tap Skip)' : ''}{!attentionDone && (!happy || !plan) ? ' and answer' : !happy || !plan ? 'Answer' : ''}{!happy || !plan ? ' the two teacher questions' : ''} to close.</p>}
      <button class="btn ghost block" style="margin-top:8px" onClick={later}><Icon name="clock" /> Remind me in {REMIND_LATER_MIN} minutes</button>
    </div>
  );
}
