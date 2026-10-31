// "Today": the class page for the current class (switches automatically when a timetabled
// lesson starts). Opens with "Open lesson?"; then six equal buttons (Daily check-in, Homework
// check, Check for understanding, Blitz, Select student, ICP) and Close lesson.

import { useEffect, useRef, useState } from 'preact/hooks';
import { ClassFollowUps } from '../Incident';
import { db, saveSettings } from '../../db';
import * as svc from '../../services';
import { formatShort, nowMs, today } from '../../lib/dates';
import { go, useLive, useSettings, useTick } from '../hooks';
import { displayName, Empty, Icon, Sheet } from '../components';
import { homeworkButton, minutesOpen } from '../../logic/lessons';
import { icpDueForClass } from '../../logic/icp';
import { classColdCallSummary } from '../../logic/coldcall';
import { promptToClose } from '../lessonPrompts';
import type { ReminderState } from '../reminders';
import { ReminderPrompt } from '../ReminderPrompt';
import { lessonOf } from '../../logic/checkin';
import { activeAssessments, assessmentSummary, dueText } from '../../logic/assessments';
import { reviewSeatItems } from './Seating';
import { CfuMenu } from './Cfu';

export function TodayScreen({ reminder }: { reminder: ReminderState }) {
  const settings = useSettings();
  const classes = useLive(() => db.classes.toArray().then((cs) => cs.filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name))), []);
  const autoSwitched = useRef<string | null>(null);

  // Follow the timetable: when a lesson starts, switch to that class once.
  useEffect(() => {
    const cur = reminder.current;
    if (cur && autoSwitched.current !== cur.id && settings && settings.currentClassId !== cur.classId) {
      autoSwitched.current = cur.id;
      saveSettings({ currentClassId: cur.classId });
    } else if (cur) autoSwitched.current = cur.id;
  }, [reminder.current?.id, settings?.currentClassId]);

  if (!settings || !classes) return null;
  if (!classes.length) {
    return <div class="card" style="margin-top:20px"><Empty icon="classes">Create your first class to start.<br /><a class="btn primary" style="margin-top:12px" href="#/classes">Add a class</a></Empty></div>;
  }
  const classId = classes.find((c) => c.id === settings.currentClassId)?.id ?? classes[0].id;
  return <ClassHub classId={classId} reminder={reminder} />;
}

export function ClassHub({ classId, reminder }: { classId: string; reminder: ReminderState }) {
  const settings = useSettings();
  const ctx = useLive(() => svc.loadLessonContext(classId), [classId]);
  const classes = useLive(() => db.classes.toArray(), []);
  const lessonCount = useLive(() => db.timetable.count(), []);
  const classTimetable = useLive(() => db.timetable.where('classId').equals(classId).toArray(), [classId]);
  const [askAnyway, setAskAnyway] = useState(false);
  const [askIntention, setAskIntention] = useState(false);
  const [intention, setIntention] = useState('');
  const [editing, setEditing] = useState(false);
  const [cfuMenu, setCfuMenu] = useState(false);
  useTick(60_000);
  useEffect(() => { if (ctx?.cls && settings && settings.currentClassId !== classId) saveSettings({ currentClassId: classId }); }, [classId, !!ctx?.cls]);
  if (!ctx || !settings || !classes) return ctx === null ? <p class="muted">Class not found. <a href="#/home">Your classes</a></p> : null;
  const { cls, lesson } = ctx;
  const top = <div class="row between today-top"><a class="link-btn back-btn" href="#/home"><Icon name="back" /> Your classes</a><LessonInfo reminder={reminder} classId={classId} classes={classes} /></div>;

  async function open() {
    const l = await svc.openLesson(classId);
    promptToClose(l, cls.name);
    setIntention('');
    setAskIntention(true);
  }

  if (!lesson) {
    return (
      <div>
        {top}
        <div class="open-lesson fade-up" data-tour="hub">
          <span class="eyebrow">{formatShort(today())}</span>
          <h1 class="home-title">{cls.name}</h1>
          <p class="muted" style="margin:6px 0 18px">Open lesson?</p>
          <div class="grid2">
            <a class="btn" href="#/home">Not now</a>
            <button class="btn primary" onClick={open}><Icon name="clock" /> Open lesson</button>
          </div>
          <p class="tiny muted" style="margin-top:14px">Check-ins, homework checks, Blitz and cold calls are saved to the lesson. Close it at the end to note how it went.</p>
        </div>
      </div>
    );
  }

  if (askIntention || editing) {
    const save = async () => { await svc.setIntention(lesson.id, intention); setAskIntention(false); setEditing(false); };
    return (
      <div>
        {top}
        <div class="open-lesson fade-up">
          <span class="eyebrow">{cls.name} · lesson open</span>
          <h2 style="margin:6px 0 12px">Learning intention</h2>
          <input class="input" autoFocus maxLength={120} value={intention} placeholder="e.g. Explain how rivers form meanders" onInput={(e) => setIntention((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <p class="tiny muted" style="margin:6px 0 14px">Optional. One line. It names this lesson in history and reports.</p>
          <div class="grid2">
            <button class="btn" onClick={() => { setAskIntention(false); setEditing(false); }}>{editing ? 'Cancel' : 'Skip'}</button>
            <button class="btn primary" onClick={save}>Continue <Icon name="arrow" /></button>
          </div>
        </div>
      </div>
    );
  }

  const here = ctx.checkins.filter((c) => lessonOf(c) === lesson.id);
  const seen = here.filter((c) => c.status === 'complete' || c.status === 'partial').length;
  const hw = homeworkButton(ctx.lessons, classId, lesson);
  const icpDue = icpDueForClass(ctx.adjustments, ctx.students, ctx.icpChecks, classTimetable ?? [], classId, today()).length;
  const hwDone = ctx.homework.filter((h) => h.lessonId === lesson.id).length;
  const calls = ctx.coldCalls.filter((c) => c.lessonId === lesson.id).length;
  const cc = classColdCallSummary(ctx.students, ctx.coldCalls, today());
  const mins = minutesOpen(lesson, nowMs());
  const assess = activeAssessments(ctx.assessments, classId, today());

  return (
    <div>
      {top}
      {!!lessonCount && !settings.reminders.enabled && !settings.reminderCardDismissed && <ReminderCard />}
      <span class="eyebrow">{formatShort(lesson.date)} · open {mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`}</span>
      <h1 class="home-title">{cls.name}</h1>
      <button class="intention-line" onClick={() => { setIntention(lesson.intention ?? ''); setEditing(true); }}>
        {lesson.intention ? <>{lesson.intention} <Icon name="edit" /></> : <span class="muted">+ Add a learning intention</span>}
      </button>
      <p class="muted small" style="margin:2px 0 14px">{seen} seen{here.length > seen ? ` · ${here.length - seen} not here` : ''}{hwDone ? ` · ${hwDone} homework checked` : ''}{calls ? ` · ${calls} cold call${calls === 1 ? '' : 's'}` : ''}</p>
      {lesson.status === 'finishing' && <div class="notice">You started closing this lesson. <a href={`#/class/${classId}/close`}>Finish closing</a></div>}
      <div class="hub-grid" data-tour="hub">
        <a class="hub-btn primary" href={`#/class/${classId}/checkin`}><Icon name="today" /><b>Daily check-in</b><span>Swipe through the class, most need first</span></a>
        {hw.mode === 'set'
          ? <a class="hub-btn" href={`#/class/${classId}/homework`}><Icon name="reports" /><b>Homework check</b><span>{hw.previous?.homeworkText || 'Homework from last lesson'}</span></a>
          : <button class="hub-btn greyed" onClick={() => setAskAnyway(true)}><Icon name="reports" /><b>Homework check</b><span>No homework set last lesson</span></button>}
        <button class="hub-btn" onClick={() => setCfuMenu(true)}><Icon name="user" /><b>Check for understanding</b><span>Whole class, cold call, select, tickets</span></button>
        <a class="hub-btn" href={`#/classes/${classId}/blitz`}><Icon name="bolt" /><b>Blitz</b><span>One question, whole class</span></a>
        <a class="hub-btn" href={`#/class/${classId}/select`}><Icon name="search" /><b>Select student</b><span>Log one student now</span></a>
        {assess.length > 0 && <a class="hub-btn" href={`#/class/${classId}/assessment${assess.length === 1 ? `/${assess[0].id}` : ''}`}><Icon name="reports" /><b>Assessment check</b><span>{assess.length === 1 ? `${assess[0].name}${dueText(assess[0], today()) ? ` · ${dueText(assess[0], today()).toLowerCase()}` : ''}` : `${assess.length} tasks`}</span></a>}
        <a class="hub-btn" href={`#/icp/class/${classId}`}><Icon name="icp" /><b>ICP {icpDue > 0 && <span class="count-badge" aria-label={`${icpDue} due today`}>{icpDue}</span>}</b><span>{icpDue ? `${icpDue} check${icpDue === 1 ? '' : 's'} due today` : 'Nothing due today'}</span></a>
      </div>
      <a class="hub-btn wide bb-btn" href={`#/class/${classId}/brainbreak`}><Icon name="bolt" /><b>Brain break</b><span>A quick subject game or a calm reset</span></a>
      <a class="btn small" style="margin:8px 0" href={`#/braindump/${classId}`}><Icon name="edit" /> Brain dump</a>
      <ClassFollowUps classId={classId} tasks={ctx.followUps} students={ctx.students} />
      {reviewSeatItems(ctx.students).map(({ s, table }) => (
        <a key={s.id} class="notice review-seat" href={`#/class/${classId}/seating/plan/${s.id}`}><b>Review seat:</b> {displayName(s)} isn't settled at {table} yet. <Icon name="chevron" /></a>
      ))}
      {assess.map((a) => <div key={a.id} class="card flat cc-summary"><span class="eyebrow">Assessment</span><div class="small">{assessmentSummary(a, ctx.students, ctx.assessmentChecks).text}</div></div>)}
      {ctx.students.length > 0 && (
        <div class="card flat cc-summary">
          <span class="eyebrow">Cold calls</span>
          <div class="small">
            {cc.weekGoodPct === null ? 'None this week.' : `${cc.weekGoodPct}% answered well this week (${cc.weekCount}).`}{' '}
            Not called in a while: {cc.waiting.map((w) => `${displayName(w.s)} (${w.last ? formatShort(w.last) : 'never'})`).join(', ')}
          </div>
        </div>
      )}
      {cfuMenu && <CfuMenu classId={classId} onClose={() => setCfuMenu(false)} />}
      {askAnyway && (
        <Sheet title="Check anyway?" onClose={() => setAskAnyway(false)}>
          <p class="small">No homework was set last lesson. You can still check who did any homework, for example if it was set some other way.</p>
          <div class="actions"><button class="btn" onClick={() => setAskAnyway(false)}>Cancel</button><button class="btn primary" onClick={() => go(`class/${classId}/homework/anyway`)}>Check anyway</button></div>
        </Sheet>
      )}
      <div class="grid2 hub-actions">
        <a class="btn primary" href={`#/class/${classId}/close`}><Icon name="check" /> Close lesson</a>
        <a class="btn" href={`#/classes/${classId}`}><Icon name="classes" /> Manage class</a>
      </div>
    </div>
  );
}

function LessonInfo({ reminder, classId, classes }: { reminder: ReminderState; classId: string; classes: { id: string; name: string }[] }) {
  const cur = reminder.current;
  const name = (id: string) => classes.find((c) => c.id === id)?.name ?? 'Class';
  if (cur && cur.classId === classId) return <div class="lesson-line"><Icon name="clock" /><span><b>Now</b> · {cur.start}–{cur.end}{cur.room ? ` · ${cur.room}` : ''}</span></div>;
  if (cur) return <div class="lesson-line"><Icon name="clock" /><span><b>{name(cur.classId)}</b> is on now</span><a class="btn small" href={`#/class/${cur.classId}`}>Switch</a></div>;
  if (reminder.next) return <div class="lesson-line"><Icon name="clock" /><span>Next: <b>{name(reminder.next.classId)}</b> {reminder.next.start}</span></div>;
  return <div class="lesson-line" />;
}

function ReminderCard() {
  return (
    <div class="card reminder-card pop-in">
      <button class="icon-btn close" aria-label="Hide this" onClick={() => saveSettings({ reminderCardDismissed: true })}><Icon name="x" /></button>
      <div class="row" style="align-items:flex-start;gap:12px">
        <span class="guide-icon small"><Icon name="bell" /></span>
        <div class="grow">
          <b>Reminders are off</b>
          <p class="small muted" style="margin:2px 0 10px">Get a nudge 5 minutes before each class, with who to check in with.</p>
          <ReminderPrompt compact />
        </div>
      </div>
    </div>
  );
}

/** Pause before the hold bar appears, so a normal tap never shows it. */
const HOLD_DELAY_MS = 500;
/** Time for the bar to fill once it appears. */
const HOLD_FILL_MS = 600;

/**
 * Answer button. Tap: presses down like a real button, then answers and moves on.
 * Press and hold: after a short pause a bar fills across the button; when full it answers
 * and opens the note box.
 */
export function HoldOpt({ cls, selected, label, canHold, onPick }: { cls: string; selected: boolean; label: string; canHold: boolean; onPick: (held: boolean) => void }) {
  const [holding, setHolding] = useState(false);
  const [down, setDown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fired = useRef(false);
  const pressed = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const cancel = () => { clearTimeout(timer.current); pressed.current = false; setHolding(false); setDown(false); };
  return (
    <button
      class={`opt ${cls} ${selected ? 'sel' : ''} ${holding ? 'holding' : ''} ${down ? 'down' : ''}`}
      style={{ '--hold': `${HOLD_FILL_MS}ms` } as Record<string, string>}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        fired.current = false;
        pressed.current = true;
        setDown(true);
        if (!canHold) return;
        timer.current = setTimeout(() => {
          setHolding(true);
          timer.current = setTimeout(() => {
            fired.current = true;
            pressed.current = false;
            setHolding(false);
            setDown(false);
            navigator.vibrate?.(25);
            onPick(true);
          }, HOLD_FILL_MS);
        }, HOLD_DELAY_MS);
      }}
      onPointerUp={() => {
        if (!pressed.current || fired.current) return;
        cancel();
        navigator.vibrate?.(8); // light "click" on phones that support it
        onPick(false);
      }}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => { if (e.detail === 0) onPick(false); /* keyboard activation */ }}
    >
      <span class="hold-fill" aria-hidden="true" />
      <span class="opt-label">{label}</span><Icon name="check" class="tick" />
    </button>
  );
}
