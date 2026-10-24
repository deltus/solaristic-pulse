// Class focus check-out after a lesson: one dial, how much of the lesson the class was working.
// Always starts at 50% and never shows the last reading, so it isn't anchored to it.

import { useState } from 'preact/hooks';
import { db } from '../../db';
import * as svc from '../../services';
import { CHECKOUT_START, checkoutId, clampPct, lessonLength, splitMinutes, zoneFor } from '../../logic/checkout';
import { formatShort, today } from '../../lib/dates';
import { go, useLive } from '../hooks';
import { Icon, toast } from '../components';
import { Speedometer, ZONE_COLOUR } from '../Speedometer';
import { HoldOpt } from './Today';

export function CheckoutScreen({ classId, timetableId }: { classId: string; timetableId?: string }) {
  const date = today();
  const data = useLive(async () => {
    const [cls, lesson] = await Promise.all([db.classes.get(classId), timetableId ? db.timetable.get(timetableId) : undefined]);
    const already = !!(await db.checkouts.get(checkoutId(date, classId, lesson?.id)));
    return { cls, lesson, already };
  }, [classId, timetableId, date]);
  const [pct, setPct] = useState(CHECKOUT_START);
  const [mins, setMins] = useState<number | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  if (!data) return null;
  if (!data.cls) return <p class="muted">Class not found.</p>;
  const { cls, lesson, already } = data;
  const lessonMin = mins ?? lessonLength(lesson);
  const split = splitMinutes(lessonMin, pct);
  const zone = zoneFor(pct);

  async function save(held: boolean) {
    const row = await svc.saveCheckout({ classId, date, timetableId: lesson?.id, start: lesson?.start, lessonMin, pctWorking: pct });
    if (held) { setNote(row.note ?? ''); setNoteFor(row.id); return; }
    toast('Check-out saved');
    go('home');
  }

  return (
    <div class="cc checkout">
      <div class="row between">
        <a class="link-btn back-btn" href="#/home"><Icon name="back" /> Your classes</a>
        <a class="link-btn" href="#/home">Not now</a>
      </div>
      <div class="cc-eyebrow" style="margin-top:10px">Check-out · {cls.name}</div>
      <div class="cc-head"><h1>How focused was the class?</h1></div>
      <p class="cc-sub">{formatShort(date)}{lesson ? ` · ${lesson.start}–${lesson.end}` : ''} · share of the lesson spent working</p>

      <div class="speedo-wrap">
        <Speedometer value={pct} onChange={setPct} label={`Share of the lesson ${cls.name} spent working`} />
        <div class="speedo-readout">
          <button class="round-btn" aria-label="Down 1%" onClick={() => setPct(clampPct(pct - 1))}><Icon name="minus" /></button>
          <div class="grow">
            <div class="speedo-value">{pct}%</div>
            <div class="speedo-zone-label" style={{ color: ZONE_COLOUR[zone.zone] }}>{zone.label}</div>
          </div>
          <button class="round-btn" aria-label="Up 1%" onClick={() => setPct(clampPct(pct + 1))}><Icon name="plus" /></button>
        </div>
      </div>

      <div class="grid2 checkout-mins">
        <div class="stat"><span class="tiny muted">Working</span><b>{split.working} min</b></div>
        <div class="stat"><span class="tiny muted">Distracted</span><b>{split.distracted} min</b></div>
      </div>
      <label class="row checkout-length tiny muted">
        <span class="grow">Lesson length{lesson ? ' (from your timetable)' : ''}</span>
        <input class="input small mono" type="number" min={5} max={240} step={5} value={lessonMin}
          onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); if (v > 0) setMins(Math.min(240, v)); }} />
        <span>min</span>
      </label>

      {noteFor ? (
        <div class="note-box pop-in">
          <div class="note-title">Note</div>
          <textarea class="input" autoFocus value={note} placeholder="Anything that affected focus, e.g. relief lesson, assembly, test" onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
          <button class="btn primary block" style="margin-top:10px" onClick={async () => { await svc.updateCheckoutNote(noteFor, note); toast('Check-out saved'); go('home'); }}>Done <Icon name="check" /></button>
        </div>
      ) : (
        <div class="cc-opts" style="margin-top:16px">
          <HoldOpt cls="save-opt" selected={false} label="Save check-out" canHold onPick={save} />
          <p class="hold-hint">{already ? 'Already saved for this lesson. Saving again replaces it. ' : ''}Hold Save to add a note</p>
        </div>
      )}
    </div>
  );
}
