// "Solaristic Radar · Your classes": the landing page. Today's classes with progress,
// so finishing a class's check-ins brings you back here and closes the loop.

import { db, getSettings, saveSettings } from '../../db';
import { icpDueStatus } from '../../logic/icp';
import { addDays, formatShort, nowMinutes, today, weekday } from '../../lib/dates';
import { closeDayDue, dayNotClosed } from '../../logic/closeday';
import { go, useLive, useTick } from '../hooks';
import { displayName, Empty, Icon } from '../components';
import { watchRaise } from '../../logic/seatingData';
import type { ReminderState } from '../reminders';
import { ReliefReviewCard } from '../Relief';
import { FollowUpsHome } from '../Incident';

async function loadHome(date: string) {
  const [settings, classes, students, checkins, timetable, adjustments, icpChecks, lessons, recentLessons, closes] = await Promise.all([
    getSettings(), db.classes.toArray(), db.students.toArray(), db.checkins.where('date').equals(date).toArray(),
    db.timetable.toArray(), db.icpAdjustments.toArray(), db.icpChecks.toArray(), db.lessons.where('status').anyOf('open', 'finishing').toArray(),
    db.lessons.filter((l) => l.date >= addDays(date, -5)).toArray(), db.dayCloses.toArray()
  ]);
  return { settings, classes: classes.filter((c) => !c.archived), students, checkins, timetable, adjustments, icpChecks, lessons, recentLessons, closes };
}

export function HomeScreen({ reminder }: { reminder: ReminderState }) {
  const date = today();
  const data = useLive(() => loadHome(date), [date]);
  useTick(60_000);
  if (!data) return null;
  const { settings, classes, students, checkins, timetable, adjustments, icpChecks } = data;
  const first = settings.profile.name.trim().split(/\s+/)[0];
  const closedToday = data.closes.some((c) => c.date === date);
  const closeDue = closeDayDue({ date, nowMin: nowMinutes(), timetable, lessons: data.recentLessons, close: data.closes.find((c) => c.date === date) });
  const notClosed = dayNotClosed(date, data.recentLessons, data.closes);

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
      {students.filter((s) => !s.archived && watchRaise(s.seatWatch)).map((s) => (
        <a key={s.id} class="notice review-seat" href={`#/class/${s.classId}/seating/plan/${s.id}`}>{displayName(s)} isn't settling at {s.seatWatch!.table}. Review the seating plan? <Icon name="chevron" /></a>
      ))}
      {notClosed && <div class="notice day-not-closed"><b>Day not closed</b> ({formatShort(notClosed)}). <a class="btn small" href={`#/closeday/${notClosed}`}>Close yesterday</a></div>}
      {closeDue && <div class="card close-day-prompt"><div class="row between"><span><b>Ready to close the day?</b><br /><span class="tiny muted">Open lessons, follow-ups, emails and a quick reflection.</span></span><a class="btn primary small" href="#/closeday">Close day</a></div></div>}
      <ReliefReviewCard />
      <div class="row home-tools" style="gap:8px;margin:0 0 12px">
        <a class="btn small" href="#/braindump"><Icon name="edit" /> Brain dump</a>
        {!closeDue && !closedToday && <a class="btn small" href="#/closeday"><Icon name="check" /> Close day</a>}
        {closedToday && <span class="tiny muted">Day closed ✓</span>}
      </div>
      {todays.length > 0 && <><div class="section" style="margin-top:6px"><h3 class="grow">Today</h3></div><div class="class-grid">{todays.map(card)}</div></>}
      {others.length > 0 && <><div class="section"><h3 class="grow">{todays.length ? 'Other classes' : 'Classes'}</h3></div><div class="class-grid">{others.map(card)}</div></>}
      {/* Follow-ups sit below the classes (Thomas/Azeem, 31/10). */}
      <div style="margin-top:16px"><FollowUpsHome /></div>
    </div>
  );
}

