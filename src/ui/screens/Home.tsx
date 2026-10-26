// "Solaristic Radar · Your classes": the landing page. Today's classes with progress,
// so finishing a class's check-ins brings you back here and closes the loop.

import { db, getSettings, saveSettings } from '../../db';
import { icpDueStatus } from '../../logic/icp';
import { formatShort, nowMinutes, today, weekday } from '../../lib/dates';
import { go, useLive, useTick } from '../hooks';
import { checkoutId, pendingCheckout } from '../../logic/checkout';
import type { SchoolClass, Settings, TimetableEntry } from '../../types';
import { Empty, Icon } from '../components';
import type { ReminderState } from '../reminders';

async function loadHome(date: string) {
  const [settings, classes, students, checkins, timetable, adjustments, icpChecks, checkouts] = await Promise.all([
    getSettings(), db.classes.toArray(), db.students.toArray(), db.checkins.where('date').equals(date).toArray(),
    db.timetable.toArray(), db.icpAdjustments.toArray(), db.icpChecks.toArray(), db.checkouts.where('date').equals(date).toArray()
  ]);
  return { settings, classes: classes.filter((c) => !c.archived), students, checkins, timetable, adjustments, icpChecks, checkouts };
}

export function HomeScreen({ reminder }: { reminder: ReminderState }) {
  const date = today();
  const data = useLive(() => loadHome(date), [date]);
  useTick(60_000);
  if (!data) return null;
  const { settings, classes, students, checkins, timetable, adjustments, icpChecks, checkouts } = data;
  const first = settings.profile.name.trim().split(/\s+/)[0];

  if (!classes.length) {
    return <div class="card" style="margin-top:20px"><Empty icon="classes">Add your first class to get started.<br /><a class="btn primary" style="margin-top:12px" href="#/classes">Add a class</a></Empty></div>;
  }

  const wd = weekday(date);
  const rows = classes.map((c) => {
    const lessons = timetable.filter((t) => t.classId === c.id && t.day === wd).sort((a, b) => a.start.localeCompare(b.start));
    const done = checkins.filter((k) => k.classId === c.id && (k.status === 'complete' || k.status === 'partial')).length;
    const ids = new Set(students.filter((s) => s.classId === c.id && !s.archived).map((s) => s.id));
    const icpDue = adjustments.filter((a) => ids.has(a.studentId) && a.active && icpDueStatus(a, icpChecks, date, true).due).length;
    return { c, lesson: lessons[0], done, icpDue, size: ids.size, now: reminder.current?.classId === c.id };
  });
  const todays = rows.filter((r) => r.lesson || r.done > 0).sort((a, b) => Number(b.now) - Number(a.now) || (a.lesson?.start ?? '99').localeCompare(b.lesson?.start ?? '99'));
  const others = rows.filter((r) => !todays.includes(r)).sort((a, b) => a.c.name.localeCompare(b.c.name));

  const open = async (id: string) => { await saveSettings({ currentClassId: id }); go(`class/${id}`); };
  const card = (r: (typeof rows)[number]) => {
    const pct = Math.min(100, Math.round((r.done / Math.max(1, r.size)) * 100));
    return (
      <button key={r.c.id} class={`class-card ${r.now ? 'now' : ''}`} onClick={() => open(r.c.id)}>
        <div class="row between">
          <span class="class-card-name">{r.c.name}</span>
          {r.now ? <span class="badge blue">Now</span> : r.lesson ? <span class="tiny muted mono">{r.lesson.start}</span> : null}
        </div>
        <div class="tiny muted">{[r.lesson?.room, `${r.size} students`, r.icpDue ? `${r.icpDue} ICP due` : ''].filter(Boolean).join(' · ')}</div>
        <div class="class-progress"><i style={{ width: `${pct}%` }} /></div>
        <div class="row between tiny"><span class="muted">{r.done ? `${r.done} seen today` : 'Not started today'}</span><span class="class-go">Open <Icon name="arrow" /></span></div>
      </button>
    );
  };

  return (
    <div>
      <span class="eyebrow">{formatShort(date)}</span>
      <h1 class="home-title">{first ? `Hi ${first}` : 'Your classes'}</h1>
      <p class="muted small" style="margin:4px 0 16px">{todays.length ? 'Tap a class to open it.' : 'No lessons on your timetable today. Pick any class.'}</p>
      <CheckoutPrompt date={date} classes={classes} timetable={timetable} done={checkouts} settings={settings} />
      {todays.length > 0 && <><div class="section" style="margin-top:6px"><h3 class="grow">Today</h3></div><div class="class-grid">{todays.map(card)}</div></>}
      {others.length > 0 && <><div class="section"><h3 class="grow">{todays.length ? 'Other classes' : 'Classes'}</h3></div><div class="class-grid">{others.map(card)}</div></>}
    </div>
  );
}

/** After a timetabled lesson ends: a gentle, dismissible nudge to do the class check-out. */
function CheckoutPrompt({ date, classes, timetable, done, settings }: { date: string; classes: SchoolClass[]; timetable: TimetableEntry[]; done: { id: string }[]; settings: Settings }) {
  const skipped = settings.checkoutSkipped?.date === date ? settings.checkoutSkipped.ids : [];
  const lesson = pendingCheckout(timetable, date, nowMinutes(), done, skipped, new Set(classes.map((c) => c.id)));
  if (!lesson) return null;
  const name = classes.find((c) => c.id === lesson.classId)?.name ?? 'the class';
  const skip = () => saveSettings({ checkoutSkipped: { date, ids: [...skipped, checkoutId(date, lesson.classId, lesson.id)] } });
  return (
    <div class="card checkout-prompt pop-in">
      <button class="icon-btn close" aria-label="Not now" onClick={skip}><Icon name="x" /></button>
      <div class="row" style="align-items:flex-start;gap:12px">
        <span class="guide-icon small"><Icon name="gauge" /></span>
        <div class="grow">
          <b>How focused was {name}?</b>
          <p class="small muted" style="margin:2px 0 10px">Lesson ended at {lesson.end}. A quick check-out takes a few seconds.</p>
          <div class="row">
            <a class="btn primary small" href={`#/checkout/${lesson.classId}/${lesson.id}`}>Check out</a>
            <button class="btn ghost small" onClick={skip}>Not now</button>
          </div>
        </div>
      </div>
    </div>
  );
}
