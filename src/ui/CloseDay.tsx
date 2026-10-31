// Close day: a short guided wrap-up across all of today's classes. Every step can be skipped.
// Open lessons → today's events → reports to lodge → follow-ups → emails to send → Brain dump →
// "How was today?". Saves a dayClose record.

import { useState } from 'preact/hooks';
import type { DayClose } from '../types';
import * as svc from '../services';
import { db } from '../db';
import { summarise, summaryText, lessonOf } from '../logic/checkin';
import { at, reportPack } from '../logic/incidents';
import { reflectionInsights } from '../logic/reflection';
import { formatDate, today } from '../lib/dates';
import { go, useLive, useSettings } from './hooks';
import { displayName, Icon, toast } from './components';
import { FollowUpList } from './Incident';
import { BrainDumpBox } from './BrainDump';

const STEPS = ['Open lessons', "Today's events", 'Reports', 'Follow-ups', 'Emails', 'Brain dump', 'How was today?'] as const;

export function CloseDayScreen({ date: forDate }: { date?: string }) {
  const date = forDate ?? today();
  const settings = useSettings();
  const day = useLive(() => svc.loadDay(date), [date]);
  const insight = useLive(async () => {
    const [lessons, classes, observations, homework, checkins] = await Promise.all([db.lessons.toArray(), db.classes.toArray(), db.observations.filter((o) => o.categoryId === 'focus' || o.categoryId === 'behaviour').toArray(), db.homework.toArray(), db.checkins.toArray()]);
    return reflectionInsights({ lessons, classes, observations, homework, checkinLesson: new Map(checkins.map((c) => [c.id, lessonOf(c)])), today: date })[0] ?? null;
  }, [date]);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<Record<string, number>>({});
  const [reflection, setReflection] = useState<DayClose['reflection']>();
  const [note, setNote] = useState('');
  const [closed, setClosed] = useState<DayClose | null>(null);
  if (!day || !settings) return null;
  const bump = (k: string, n = 1) => setDone((d) => ({ ...d, [k]: (d[k] ?? 0) + n }));
  const cls = (id: string) => day.classes.find((c) => c.id === id)?.name ?? 'Class';
  const student = (id?: string) => day.students.find((s) => s.id === id);
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));

  async function finish() {
    const start = at(date, '00:00');
    const closedToday = (await db.followUps.toArray()).filter((f) => f.status !== 'todo' && (f.doneAt ?? 0) >= start).length;
    const counts = { ...done, followUpsClosed: closedToday, openLessons: day!.openLessons.length };
    setClosed(await svc.closeDay(date, { reflection, note, counts }));
  }

  if (closed) {
    const total = (closed.counts.followUpsClosed ?? 0) + (closed.counts.lodged ?? 0) + (closed.counts.brainDump ?? 0);
    return (
      <div class="close-day done-state">
        <h1>Day closed. Nice work.</h1>
        <p class="muted">{total ? `${total} thing${total === 1 ? '' : 's'} sorted today.` : 'All wrapped up.'}</p>
        <button class="btn primary" onClick={() => go('')}>Home</button>
      </div>
    );
  }

  const header = (
    <>
      <div class="row between"><a class="link-btn back-btn" href="#/"><Icon name="back" /> Home</a><span class="tiny muted mono">Close day · {formatDate(date)}</span></div>
      <div class="step-dots" aria-label={`Step ${step + 1} of ${STEPS.length}`}>{STEPS.map((s, i) => <button key={s} class={`dot ${i === step ? 'on' : i < step ? 'past' : ''}`} aria-label={s} onClick={() => setStep(i)} />)}</div>
      <h2 style="margin:8px 0">{STEPS[step]}</h2>
    </>
  );
  const nav = (
    <div class="actions" style="margin-top:14px">
      {step > 0 && <button class="btn" onClick={() => setStep(step - 1)}><Icon name="back" /> Back</button>}
      {step < STEPS.length - 1 ? <button class="btn primary" onClick={next}>Next <Icon name="arrow" /></button> : <button class="btn primary" onClick={finish}><Icon name="check" /> Close day</button>}
    </div>
  );

  let body;
  if (step === 0) {
    body = day.openLessons.length ? day.openLessons.map((l) => (
      <a key={l.id} class="list-row" href={`#/class/${l.classId}/close`}><span class="grow"><b>{cls(l.classId)}</b> <span class="tiny muted">{l.date === date ? 'today' : formatDate(l.date)}</span></span><span class="btn small">Close lesson</span></a>
    )) : <p class="muted small">Every lesson is closed.</p>;
  } else if (step === 1) {
    const byClass = [...new Set([...day.issues.map((c) => c.classId), ...day.incidentsToday.map((i) => i.classId), ...day.urgentToday.map((f) => f.classId ?? '')])].filter(Boolean);
    body = byClass.length ? byClass.map((cid) => (
      <div key={cid} class="card">
        <div class="row between"><b>{cls(cid)}</b><a class="link-btn small" href={`#/class/${cid}/select`}>Anything to add?</a></div>
        {day.incidentsToday.filter((i) => i.classId === cid).map((i) => <div key={i.id} class="small"><Icon name="alert" /> <b>Serious incident</b>: {student(i.studentId) ? displayName(student(i.studentId)!) : ''}</div>)}
        {day.urgentToday.filter((f) => f.classId === cid).map((f) => <div key={f.id} class="small">⚑ {f.title}</div>)}
        {day.issues.filter((c) => c.classId === cid).map((c) => <div key={c.id} class="small">{student(c.studentId) ? displayName(student(c.studentId)!) : ''}: {summaryText(summarise(c, day.observations, day.tags))}</div>)}
      </div>
    )) : <p class="muted small">No issues or incidents today.</p>;
  } else if (step === 2) {
    body = day.unlodged.length ? day.unlodged.map((i) => {
      const s = student(i.studentId);
      return (
        <div key={i.id} class="card">
          <b class="small">{s ? displayName(s) : 'Student'} · {cls(i.classId)} · {formatDate(i.date)}</b>
          <div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">
            {s && <button class="btn small" onClick={async () => { const p = reportPack(i, { student: s, students: day.students.filter((x) => x.classId === i.classId), className: cls(i.classId), teacher: settings.profile.name, school: settings.profile.school }); try { await navigator.clipboard.writeText(p.text); toast('Report copied'); } catch { toast('Copy failed'); } }}>Copy report</button>}
            <a class="btn small" href={`#/incident/${i.id}`}>Open</a>
            <button class="btn small primary" onClick={async () => { await svc.markLodged(i.id); bump('lodged'); toast('Marked lodged'); }}><Icon name="check" /> Mark lodged</button>
          </div>
        </div>
      );
    }) : <p class="muted small">No reports waiting to be lodged.</p>;
  } else if (step === 3) {
    body = day.tasksDue.length ? <FollowUpList tasks={day.tasksDue} students={day.students} moveToTomorrow /> : <p class="muted small">No follow-ups due today.</p>;
  } else if (step === 4) {
    body = day.drafts.length ? <FollowUpList tasks={day.drafts} students={day.students} moveToTomorrow /> : <p class="muted small">No emails waiting.</p>;
  } else if (step === 5) {
    body = <BrainDumpBox onDone={(n) => { bump('brainDump', n); next(); }} />;
  } else {
    body = (
      <>
        <div class="grid3">
          {(['good', 'ok', 'tough'] as const).map((r) => <button key={r} class={`btn big ${reflection === r ? 'primary' : ''}`} aria-pressed={reflection === r} onClick={() => setReflection(r)}>{r === 'good' ? 'Good' : r === 'ok' ? 'OK' : 'Tough'}</button>)}
        </div>
        <textarea class="input" style="margin-top:10px" rows={3} placeholder="Anything about today (optional, private)" value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
        {insight && <div class={`insight ${insight.tone}`} style="margin-top:10px"><Icon name={insight.tone === 'positive' ? 'check' : 'info'} /><span>{insight.text}</span></div>}
      </>
    );
  }
  return <div class="close-day">{header}{body}{nav}</div>;
}
