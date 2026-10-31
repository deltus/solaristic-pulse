// Blitz: pick a topic, then mark every student Yes / No (or absent) in one screen.

import { useEffect, useState } from 'preact/hooks';
import { db } from '../../db';
import * as svc from '../../services';
import { BLITZ_TOPICS, blitzTopic, type BlitzMark } from '../../logic/blitz';
import { formatShort, today, weekday } from '../../lib/dates';
import { go, useLive } from '../hooks';
import { Avatar, displayName, Empty, Icon, PageHead, toast } from '../components';
import { prefillAbsent } from '../../logic/cfu';
import { AbsentChip } from './Cfu';

/** Blitz tab: choose a class first (today's classes on top), then a topic. */
export function BlitzScreen({ classId, fromClassPage }: { classId?: string; fromClassPage?: boolean }) {
  return classId ? <BlitzClass classId={classId} back={fromClassPage ? `#/classes/${classId}` : '#/blitz'} /> : <BlitzPicker />;
}

function BlitzPicker() {
  const date = today();
  const data = useLive(async () => ({
    classes: (await db.classes.toArray()).filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name)),
    timetable: await db.timetable.toArray(),
    done: await db.observations.where('date').equals(date).filter((o) => !!o.blitz).toArray()
  }), [date]);
  if (!data) return null;
  const wd = weekday(date);
  const lessonAt = (id: string) => data.timetable.filter((t) => t.classId === id && t.day === wd).map((t) => t.start).sort()[0];
  const sorted = [...data.classes].sort((a, b) => (lessonAt(a.id) ?? '99').localeCompare(lessonAt(b.id) ?? '99'));
  return (
    <div>
      <PageHead eyebrow={`Blitz · ${formatShort(date)}`} title="Which class?" />
      <p class="muted small" style="margin-top:-6px">Mark a whole class Yes or No on one thing, like homework or uniform, in under a minute.</p>
      <div class="class-grid">
        {sorted.map((c) => {
          const topics = [...new Set(data.done.filter((o) => o.classId === c.id).map((o) => blitzTopic(o.blitz!)?.label ?? o.blitz!))];
          return (
            <button key={c.id} class="class-card" onClick={() => go(`blitz/${c.id}`)}>
              <div class="row between"><span class="class-card-name">{c.name}</span>{lessonAt(c.id) && <span class="tiny muted mono">{lessonAt(c.id)}</span>}</div>
              <div class="tiny muted">{topics.length ? `Done today: ${topics.join(', ')}` : 'No blitz yet today'}</div>
              <div class="row between tiny"><span /><span class="class-go">Start a blitz <Icon name="arrow" /></span></div>
            </button>
          );
        })}
      </div>
      {!sorted.length && <div class="card"><Empty icon="classes">Add a class first.</Empty></div>}
    </div>
  );
}

function BlitzClass({ classId, back }: { classId: string; back: string }) {
  const date = today();
  const data = useLive(async () => ({
    cls: await db.classes.get(classId),
    students: (await db.students.where('classId').equals(classId).toArray()).filter((s) => !s.archived)
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)),
    categories: await db.categories.toArray(),
    /** Absent earlier today in this class (round 9): pre-filled as Absent. */
    absent: new Set((await db.absences.where('classId').equals(classId).filter((a) => a.date === date).toArray()).map((a) => a.studentId))
  }), [classId, date]);
  const [topic, setTopic] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, BlitzMark>>({});
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!topic) return;
    setLoaded(false);
    svc.loadBlitz(classId, date, topic).then((m) => { setMarks(prefillAbsent(m, data?.absent ?? new Set(), (data?.students ?? []).map((s) => s.id))); setLoaded(true); });
  }, [topic, classId, date, !!data]);

  if (!data?.cls) return null;
  const { cls, students, categories, absent } = data;

  if (!topic) {
    return (
      <div>
        <PageHead eyebrow={`Blitz · ${cls.name} · ${formatShort(date)}`} title="What are you checking?" back={back} />
        <p class="muted small" style="margin-top:-6px">Mark the whole class Yes or No on one thing. It's saved separately from check-ins and feeds the matching area in trends and reports.</p>
        <div class="blitz-grid">
          {BLITZ_TOPICS.map((t) => (
            <button key={t.id} class="blitz-topic" onClick={() => setTopic(t.id)}>
              <span class="guide-icon small"><Icon name={t.icon} /></span>
              <b>{t.label}</b>
              <span class="tiny muted">feeds {categories.find((c) => c.id === t.categoryId)?.name ?? t.categoryId}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const t = blitzTopic(topic)!;
  if (!loaded) return <p class="muted" style="padding:20px 0">Loading…</p>;
  const counts = { yes: 0, no: 0, absent: 0 } as Record<BlitzMark, number>;
  Object.values(marks).forEach((m) => counts[m]++);
  const unmarked = students.length - Object.keys(marks).length;
  const set = (id: string, m: BlitzMark) => setMarks((x) => (x[id] === m ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== id)) : { ...x, [id]: m }));

  async function save() {
    setBusy(true);
    const lesson = await db.lessons.where('classId').equals(cls!.id).filter((l) => l.status !== 'closed').last();
    await svc.saveBlitz(cls!.id, date, t.id, marks, lesson?.id);
    setBusy(false);
    toast(`${t.label} blitz saved: ${counts.yes} yes, ${counts.no} no`);
    location.hash = back;
  }

  return (
    <div>
      <PageHead eyebrow={`Blitz · ${cls.name} · ${formatShort(date)}`} title={t.prompt}>
        <button class="btn small ghost" onClick={() => setTopic(null)}>Change</button>
      </PageHead>
      <div class="row wrap" style="margin:-6px 0 12px;gap:8px">
        <button class="btn small" onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.id, marks[s.id] === 'absent' ? 'absent' : 'yes'])))}><Icon name="check" /> Mark everyone Yes</button>
        <span class="tiny muted">then change the exceptions</span>
      </div>
      <div class="card flat" style="padding:2px 12px">
        {students.map((s) => {
          const m = marks[s.id];
          if (m === 'absent' && absent.has(s.id)) {
            return (
              <div key={s.id} class="blitz-row absent">
                <Avatar s={s} />
                <span class="grow">{displayName(s)}</span>
                <AbsentChip classId={cls.id} student={s} date={date} onHere={() => set(s.id, 'absent')} />
              </div>
            );
          }
          return (
            <div key={s.id} class="blitz-row">
              <Avatar s={s} />
              <span class="grow">{displayName(s)}</span>
              <div class="blitz-btns">
                <button class={`bz yes ${m === 'yes' ? 'on' : ''}`} aria-label={`${displayName(s)}: yes`} onClick={() => set(s.id, 'yes')}><Icon name="check" /></button>
                <button class={`bz no ${m === 'no' ? 'on' : ''}`} aria-label={`${displayName(s)}: no`} onClick={() => set(s.id, 'no')}><Icon name="x" /></button>
                <button class={`bz abs ${m === 'absent' ? 'on' : ''}`} aria-label={`${displayName(s)}: absent`} onClick={() => set(s.id, 'absent')}>A</button>
              </div>
            </div>
          );
        })}
      </div>
      <div class="blitz-bar">
        <span class="small"><b>{counts.yes}</b> yes · <b>{counts.no}</b> no · {counts.absent} absent{unmarked ? ` · ${unmarked} not marked` : ''}</span>
        <button class="btn primary" disabled={busy || !Object.keys(marks).length} onClick={save}>Save blitz</button>
      </div>
    </div>
  );
}
