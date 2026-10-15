// Top of a class page: what the class is like right now and what to do next.

import { db, getSettings, sortedCategories } from '../../db';
import { computePriority, lastCheckedDate } from '../../logic/priority';
import { classSuggestions, recentChange, weeklyShare, weekStart } from '../../logic/insights';
import { implementationSummary } from '../../logic/icp';
import { daysBetween, formatShort, today } from '../../lib/dates';
import { useLive } from '../hooks';
import { displayName, Icon } from '../components';
import { TrendLine } from '../TrendLine';
import { WeightBadge } from './Students';

async function load(classId: string) {
  const students = await db.students.where('classId').equals(classId).toArray();
  const ids = students.map((s) => s.id);
  const [observations, checkins, questions, categories, adjustments, icpChecks, settings] = await Promise.all([
    db.observations.where('studentId').anyOf(ids).toArray(), db.checkins.where('studentId').anyOf(ids).toArray(),
    db.questions.filter((q) => q.enabled).toArray(), sortedCategories(),
    db.icpAdjustments.where('studentId').anyOf(ids).toArray(), db.icpChecks.where('studentId').anyOf(ids).toArray(), getSettings()
  ]);
  return { students: students.filter((s) => !s.archived), observations, checkins, questions, categories, adjustments: adjustments.filter((a) => a.active), icpChecks, settings };
}

export function ClassOverview({ classId, onBlitz }: { classId: string; onBlitz: () => void }) {
  const date = today();
  const d = useLive(() => load(classId), [classId, date]);
  if (!d || !d.students.length) return null;
  const { students, observations, checkins, questions, categories, adjustments, icpChecks, settings } = d;

  const wk = weekStart(date);
  const thisWeek = checkins.filter((c) => c.date >= wk && c.date <= date && (c.status === 'complete' || c.status === 'partial')).length;
  const seen = students.filter((s) => { const l = lastCheckedDate(checkins.filter((c) => c.studentId === s.id)); return l && daysBetween(l, date) < 14; }).length;
  const icpRate = implementationSummary(icpChecks.filter((c) => daysBetween(c.date, date) <= 14)).rate;
  const tips = classSuggestions({ students, checkins, observations, categories, adjustments, icpChecks, today: date, maxGapDays: settings.maxGapDays });
  const core = categories.filter((c) => c.builtIn);
  const ranked = students
    .map((s) => ({ s, w: computePriority(s, observations.filter((o) => o.studentId === s.id), checkins.filter((c) => c.studentId === s.id && c.date <= date), questions, categories, date).weight }))
    .sort((a, b) => b.w - a.w)
    .slice(0, 3);

  return (
    <div class="overview">
      <div class="stat-grid">
        <div class="stat"><b>{thisWeek}</b><span>check-ins this week</span></div>
        <div class="stat"><b>{seen}/{students.length}</b><span>seen in 14 days</span></div>
        <div class="stat"><b>{icpRate === null ? '–' : `${icpRate}%`}</b><span>ICP implemented</span></div>
      </div>

      <button class="btn primary block blitz-btn" onClick={onBlitz}><Icon name="bolt" /> Blitz: mark the whole class</button>

      <div class="card">
        <span class="eyebrow">What to do</span>
        <ul class="tips">{tips.map((t) => <li key={t}>{t}</li>)}</ul>
      </div>

      <div class="card">
        <span class="eyebrow">Class trends · last 8 weeks</span>
        {core.map((c) => {
          const weeks = weeklyShare(observations, c.id, date, 8);
          const ch = recentChange(weeks);
          const pct = ch.recent === null ? null : Math.round((1 - ch.recent) * 100);
          const delta = ch.recent !== null && ch.before !== null ? Math.round((ch.before - ch.recent) * 100) : null;
          return (
            <div class="class-trend" key={c.id}>
              <div class="row between">
                <b>{c.name}</b>
                <span class="small">{pct === null ? <span class="muted">No answers yet</span> : <>{pct}% meeting expectations{delta ? <span class={delta > 0 ? 'up' : 'down'}> {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}</span> : null}</>}</span>
              </div>
              <TrendLine values={weeks.map((w) => (w.share === null ? null : 1 - w.share))} height={44} labels={[`w/c ${formatShort(weeks[0].week)}`, 'this week']} />
            </div>
          );
        })}
      </div>

      <div class="card">
        <span class="eyebrow">Highest draw weight</span>
        {ranked.map(({ s, w }) => (
          <a key={s.id} class="mini-row" href={`#/students/${s.id}`} style="text-decoration:none;color:inherit">
            <span class="grow">{displayName(s)}</span><WeightBadge w={w} /><Icon name="chevron" />
          </a>
        ))}
      </div>
    </div>
  );
}
