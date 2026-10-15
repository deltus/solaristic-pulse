// Blitz: pick a topic, then mark every student Yes / No (or absent) in one screen.

import { useEffect, useState } from 'preact/hooks';
import { db } from '../../db';
import * as svc from '../../services';
import { BLITZ_TOPICS, blitzTopic, type BlitzMark } from '../../logic/blitz';
import { formatShort, today } from '../../lib/dates';
import { go, useLive } from '../hooks';
import { Avatar, displayName, Icon, PageHead, toast } from '../components';

export function BlitzScreen({ classId }: { classId: string }) {
  const date = today();
  const data = useLive(async () => ({
    cls: await db.classes.get(classId),
    students: (await db.students.where('classId').equals(classId).toArray()).filter((s) => !s.archived)
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)),
    categories: await db.categories.toArray()
  }), [classId]);
  const [topic, setTopic] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, BlitzMark>>({});
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!topic) return;
    setLoaded(false);
    svc.loadBlitz(classId, date, topic).then((m) => { setMarks(m); setLoaded(true); });
  }, [topic, classId, date]);

  if (!data?.cls) return null;
  const { cls, students, categories } = data;
  const back = `#/classes/${cls.id}`;

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
    await svc.saveBlitz(cls!.id, date, t.id, marks);
    setBusy(false);
    toast(`${t.label} blitz saved: ${counts.yes} yes, ${counts.no} no`);
    go(`classes/${cls!.id}`);
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
