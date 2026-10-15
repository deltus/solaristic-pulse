// "Solaristic Pulse · Your classes": the landing page. Today's classes with progress,
// so finishing a class's check-ins brings you back here and closes the loop.

import { db, getSettings, saveSettings } from '../../db';
import { icpDueStatus } from '../../logic/icp';
import { formatShort, today, weekday } from '../../lib/dates';
import { go, useLive } from '../hooks';
import { Empty, Icon } from '../components';
import type { ReminderState } from '../reminders';

async function loadHome(date: string) {
  const [settings, classes, students, checkins, timetable, adjustments, icpChecks] = await Promise.all([
    getSettings(), db.classes.toArray(), db.students.toArray(), db.checkins.where('date').equals(date).toArray(),
    db.timetable.toArray(), db.icpAdjustments.toArray(), db.icpChecks.toArray()
  ]);
  return { settings, classes: classes.filter((c) => !c.archived), students, checkins, timetable, adjustments, icpChecks };
}

export function HomeScreen({ reminder }: { reminder: ReminderState }) {
  const date = today();
  const data = useLive(() => loadHome(date), [date]);
  if (!data) return null;
  const { settings, classes, students, checkins, timetable, adjustments, icpChecks } = data;
  const first = settings.profile.name.trim().split(/\s+/)[0];

  if (!classes.length) {
    return <div class="card" style="margin-top:20px"><Empty icon="classes">Add your first class to get started.<br /><a class="btn primary" style="margin-top:12px" href="#/classes">Add a class</a></Empty></div>;
  }

  const wd = weekday(date);
  const rows = classes.map((c) => {
    const lessons = timetable.filter((t) => t.classId === c.id && t.day === wd).sort((a, b) => a.start.localeCompare(b.start));
    const done = checkins.filter((k) => k.classId === c.id && (k.status === 'complete' || k.status === 'partial')).length;
    const target = c.dailyTarget ?? settings.dailyTarget;
    const ids = new Set(students.filter((s) => s.classId === c.id && !s.archived).map((s) => s.id));
    const icpDue = adjustments.filter((a) => ids.has(a.studentId) && a.active && icpDueStatus(a, icpChecks, date, true).due).length;
    return { c, lesson: lessons[0], done, target, icpDue, size: ids.size, now: reminder.current?.classId === c.id };
  });
  const todays = rows.filter((r) => r.lesson || r.done > 0).sort((a, b) => Number(b.now) - Number(a.now) || (a.lesson?.start ?? '99').localeCompare(b.lesson?.start ?? '99'));
  const others = rows.filter((r) => !todays.includes(r)).sort((a, b) => a.c.name.localeCompare(b.c.name));
  const allDone = todays.length > 0 && todays.every((r) => r.done >= r.target);

  const open = async (id: string) => { await saveSettings({ currentClassId: id }); go('today'); };
  const card = (r: (typeof rows)[number]) => {
    const pct = Math.min(100, Math.round((r.done / Math.max(1, r.target)) * 100));
    const finished = r.done >= r.target;
    return (
      <button key={r.c.id} class={`class-card ${r.now ? 'now' : ''} ${finished ? 'finished' : ''}`} onClick={() => open(r.c.id)}>
        <div class="row between">
          <span class="class-card-name">{r.c.name}</span>
          {r.now ? <span class="badge blue">Now</span> : finished ? <span class="badge ok"><Icon name="check" /> Done</span> : r.lesson ? <span class="tiny muted mono">{r.lesson.start}</span> : null}
        </div>
        <div class="tiny muted">{[r.lesson?.room, `${r.size} students`, r.icpDue ? `${r.icpDue} ICP due` : ''].filter(Boolean).join(' · ')}</div>
        <div class="class-progress"><i style={{ width: `${pct}%` }} /></div>
        <div class="row between tiny"><span class="muted">{r.done}/{r.target} check-ins</span><span class="class-go">{finished ? 'Review' : r.done ? 'Continue' : 'Start'} <Icon name="arrow" /></span></div>
      </button>
    );
  };

  return (
    <div>
      <span class="eyebrow">{formatShort(date)}</span>
      <h1 class="home-title">{allDone ? `All done for today${first ? `, ${first}` : ''}` : 'Your classes'}</h1>
      <p class="muted small" style="margin:4px 0 16px">{allDone ? 'Every class has had its check-ins. See you next lesson.' : todays.length ? 'Tap a class to start its check-ins.' : 'No lessons on your timetable today. Pick any class.'}</p>
      {allDone && <div class="done-state" style="padding:4px 0 14px"><div class="check"><Icon name="check" /></div></div>}
      {todays.length > 0 && <><div class="section" style="margin-top:6px"><h3 class="grow">Today</h3></div><div class="class-grid">{todays.map(card)}</div></>}
      {others.length > 0 && <><div class="section"><h3 class="grow">{todays.length ? 'Other classes' : 'Classes'}</h3></div><div class="class-grid">{others.map(card)}</div></>}
    </div>
  );
}
