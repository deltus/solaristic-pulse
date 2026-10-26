// "Today": the class page for the current class (switches automatically when a timetabled
// lesson starts). Four big buttons: Daily check-in, Homework check, Blitz, Select student.

import { useEffect, useRef, useState } from 'preact/hooks';
import { db, saveSettings } from '../../db';
import { formatShort, nowMinutes, today } from '../../lib/dates';
import { go, useLive, useSettings } from '../hooks';
import { Empty, Icon } from '../components';
import type { ReminderState } from '../reminders';
import { ReminderPrompt } from '../ReminderPrompt';
import { lessonForCheckout } from '../../logic/checkout';
import { lessonIdFor, lessonOf } from '../../logic/checkin';

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
  const date = today();
  const lessonId = lessonIdFor(date, classId);
  const data = useLive(async () => {
    const [cls, checkins, homework, lessonCount, classes] = await Promise.all([
      db.classes.get(classId), db.checkins.where('classId').equals(classId).toArray(), db.homework.where('lessonId').equals(lessonId).toArray(),
      db.timetable.count(), db.classes.toArray()
    ]);
    return { cls, checkins, homework, lessonCount, classes };
  }, [classId, lessonId]);
  useEffect(() => { if (data?.cls && settings && settings.currentClassId !== classId) saveSettings({ currentClassId: classId }); }, [classId, !!data?.cls]);
  if (!data || !settings) return null;
  if (!data.cls) return <p class="muted">Class not found. <a href="#/home">Your classes</a></p>;
  const here = data.checkins.filter((c) => lessonOf(c) === lessonId);
  const seen = here.filter((c) => c.status === 'complete' || c.status === 'partial').length;

  async function endLesson() {
    const lesson = lessonForCheckout(await db.timetable.where('classId').equals(classId).toArray(), classId, date, nowMinutes());
    go(`checkout/${classId}${lesson ? `/${lesson.id}` : ''}`);
  }

  return (
    <div>
      <div class="row between today-top"><a class="link-btn back-btn" href="#/home"><Icon name="back" /> Your classes</a><LessonInfo reminder={reminder} classId={classId} classes={data.classes} /></div>
      {!!data.lessonCount && !settings.reminders.enabled && !settings.reminderCardDismissed && <ReminderCard />}
      <span class="eyebrow">{formatShort(date)}</span>
      <h1 class="home-title">{data.cls.name}</h1>
      <p class="muted small" style="margin:4px 0 16px">{seen} seen this lesson{here.length > seen ? ` · ${here.length - seen} not here` : ''}{data.homework.length ? ` · ${data.homework.length} homework checked` : ''}</p>
      <div class="hub-grid" data-tour="hub">
        <a class="hub-btn primary" href={`#/class/${classId}/checkin`}><Icon name="today" /><b>Daily check-in</b><span>Swipe through the class, most need first</span></a>
        <a class="hub-btn" href={`#/class/${classId}/homework`}><Icon name="reports" /><b>Homework check</b><span>Done or not done, whole class</span></a>
        <a class="hub-btn" href={`#/classes/${classId}/blitz`}><Icon name="bolt" /><b>Blitz</b><span>One question, whole class</span></a>
        <a class="hub-btn" href={`#/class/${classId}/select`}><Icon name="search" /><b>Select student</b><span>Log one student now</span></a>
      </div>
      <div class="row wrap" style="margin-top:16px;gap:8px">
        <button class="btn small" onClick={endLesson}><Icon name="gauge" /> End lesson</button>
        <a class="btn small ghost" href={`#/classes/${classId}`}><Icon name="classes" /> Manage class</a>
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
