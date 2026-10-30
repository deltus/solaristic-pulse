// "My teaching": the teacher journal for all classes, and private reflection from close-of-lesson
// answers. Patterns appear once there
// are at least 5 closed lessons in the last four weeks. Never part of reports or shared exports.

import { db } from '../../db';
import { MIN_CLOSED_LESSONS, reflectedLessons, reflectionInsights, seatingPlanInsights, WINDOW_DAYS } from '../../logic/reflection';
import { lessonName } from '../../logic/lessons';
import { lessonOf } from '../../logic/checkin';
import { formatShort, today } from '../../lib/dates';
import { useLive } from '../hooks';
import { Empty, Icon, PageHead } from '../components';
import { JournalList } from '../Journal';
import { brainBreakText } from '../../logic/brainBreaks';

const HAPPY = { yes: 'Happy', mostly: 'Mostly happy', no: 'Not happy' };
const PLAN = { yes: 'got through the plan', partly: 'partly through the plan', no: "didn't get through the plan" };

export function TeachingScreen() {
  const date = today();
  const data = useLive(async () => {
    const [lessons, classes, observations, homework, checkins, plans, brainBreaks] = await Promise.all([
      db.lessons.toArray(), db.classes.toArray(), db.observations.filter((o) => o.categoryId === 'focus' || o.categoryId === 'behaviour').toArray(), db.homework.toArray(), db.checkins.toArray(), db.seatingPlans.toArray(), db.brainBreaks.toArray()
    ]);
    return { lessons, classes, observations, homework, plans, brainBreaks, checkinLesson: new Map(checkins.map((c) => [c.id, lessonOf(c)])) };
  }, [date]);
  if (!data) return null;
  const done = reflectedLessons(data.lessons, date);
  const insights = [...reflectionInsights({ ...data, today: date }), ...seatingPlanInsights(data)];
  const cls = (id: string) => data.classes.find((c) => c.id === id)?.name ?? 'Class';

  return (
    <div>
      <PageHead eyebrow="Private to you" title="My teaching" />
      <p class="small muted" style="margin-top:-6px">Patterns from how you closed your lessons over the last {WINDOW_DAYS / 7} weeks. These are prompts for reflection, not judgements. They stay with you and are never part of reports or shared exports.</p>

      <div class="section"><h2>Journal</h2><span class="tiny muted">all classes</span></div>
      <JournalList />

      <div class="section"><h2>Patterns</h2><span class="tiny muted mono">{done.length} closed lesson{done.length === 1 ? '' : 's'}</span></div>
      {insights.length ? insights.map((i) => (
        <div key={i.text} class={`insight ${i.tone}`}><Icon name={i.tone === 'positive' ? 'check' : 'info'} /><span>{i.text}</span></div>
      )) : (
        <div class="card"><Empty icon="reports">Patterns appear after {MIN_CLOSED_LESSONS} closed lessons. You have {done.length} so far. Close a lesson from its class page and answer the two teacher questions.</Empty></div>
      )}

      {done.length > 0 && (
        <>
          <div class="section"><h2>Recent lessons</h2></div>
          <div class="card flat" style="padding:4px 14px">
            {[...done].reverse().slice(0, 12).map((l) => (
              <div key={l.id} class="lesson-row">
                <div class="row between"><b>{cls(l.classId)}</b><span class="tiny muted">{formatShort(l.date)}</span></div>
                {l.intention && <div class="small">{lessonName(l)}</div>}
                <div class="tiny muted">{HAPPY[l.happy!]} · {PLAN[l.planDone!]}{l.attentionPct !== undefined ? ` · attention ${l.attentionPct}%` : ''}{l.homeworkSet ? ' · homework set' : ''}</div>
                {l.note && <div class="small" style="margin-top:2px">“{l.note}”</div>}
                {data.brainBreaks.filter((b) => b.lessonId === l.id).map((b) => <div key={b.id} class="tiny muted">{brainBreakText(b)}</div>)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
