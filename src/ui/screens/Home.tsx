// "Solaristic Radar · Your classes": the landing page. Today's classes with progress,
// so finishing a class's check-ins brings you back here and closes the loop.

import { db, getSettings, saveSettings } from '../../db';
import { icpDueStatus } from '../../logic/icp';
import { formatShort, today, weekday } from '../../lib/dates';
import { go, useLive, useTick } from '../hooks';
import { Empty, Icon } from '../components';
import type { ReminderState } from '../reminders';
import { ReliefReviewCard } from '../Relief';

async function loadHome(date: string) {
  const [settings, classes, students, checkins, timetable, adjustments, icpChecks, lessons] = await Promise.all([
    getSettings(), db.classes.toArray(), db.students.toArray(), db.checkins.where('date').equals(date).toArray(),
    db.timetable.toArray(), db.icpAdjustments.toArray(), db.icpChecks.toArray(), db.lessons.where('status').anyOf('open', 'finishing').toArray()
  ]);
  return { settings, classes: classes.filter((c) => !c.archived), students, checkins, timetable, adjustments, icpChecks, lessons };
}

export function HomeScreen({ reminder }: { reminder: ReminderState }) {
  const date = today();
  const data = useLive(() => loadHome(date), [date]);
  useTick(60_000);
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
    const ids = new Set(students.filter((s) => s.classId === c.id && !s.archived).map((s) => s.id));
    const icpDue = adjustments.filter((a) => ids.has(a.studentId) && a.active && icpDueStatus(a, icpChecks, date, true).due).length;
    return { c, lesson: lessons[0], open: data.lessons.some((l) => l.classId === c.id), done, icpDue, size: ids.size, now: reminder.current?.classId === c.id };
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
          {r.open ? <span class="badge ok">Lesson open</span> : r.now ? <span class="badge blue">Now</span> : r.lesson ? <span class="tiny muted mono">{r.lesson.start}</span> : null}
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
      <ReliefReviewCard />
      {todays.length > 0 && <><div class="section" style="margin-top:6px"><h3 class="grow">Today</h3></div><div class="class-grid">{todays.map(card)}</div></>}
      {others.length > 0 && <><div class="section"><h3 class="grow">{todays.length ? 'Other classes' : 'Classes'}</h3></div><div class="class-grid">{others.map(card)}</div></>}
    </div>
  );
}

