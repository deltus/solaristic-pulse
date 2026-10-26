// Top of a class page: what the class is like right now and what to do next.

import { db, getSettings, sortedCategories } from '../../db';
import { lastCheckedDate } from '../../logic/priority';
import { needByStudent } from '../../logic/need';
import { classSuggestions, recentChange, weeklyShare, weekStart } from '../../logic/insights';
import { implementationSummary } from '../../logic/icp';
import { daysBetween, formatShort, today } from '../../lib/dates';
import { useLive } from '../hooks';
import { displayName, Icon } from '../components';
import { MultiTrendLine, TrendLine } from '../TrendLine';
import { classColdCallRate, successSeries, weeksAgo } from '../../logic/classStats';
import { NeedBadge } from './Students';

async function load(classId: string) {
  const students = await db.students.where('classId').equals(classId).toArray();
  const ids = students.map((s) => s.id);
  const [observations, checkins, questions, categories, adjustments, icpChecks, settings, tags, homework] = await Promise.all([
    db.observations.where('studentId').anyOf(ids).toArray(), db.checkins.where('studentId').anyOf(ids).toArray(),
    db.questions.filter((q) => q.enabled).toArray(), sortedCategories(),
    db.icpAdjustments.where('studentId').anyOf(ids).toArray(), db.icpChecks.where('studentId').anyOf(ids).toArray(), getSettings(),
    db.issueTags.where('classId').equals(classId).toArray(), db.homework.where('classId').equals(classId).toArray()
  ]);
  const lessons = await db.lessons.where('classId').equals(classId).toArray();
  const coldCalls = await db.coldCalls.where('classId').equals(classId).toArray();
  return { students: students.filter((s) => !s.archived), observations, checkins, questions, categories, adjustments: adjustments.filter((a) => a.active), icpChecks, settings, tags, homework, lessons, coldCalls };
}

export function ClassOverview({ classId, onBlitz }: { classId: string; onBlitz: () => void }) {
  const date = today();
  const d = useLive(() => load(classId), [classId, date]);
  if (!d || !d.students.length) return null;
  const { students, observations, checkins, categories, adjustments, icpChecks, settings, tags, homework, lessons, coldCalls } = d;
  const success = successSeries({ observations: observations.filter((o) => o.classId === classId), checkins: checkins.filter((c) => c.classId === classId), lessons, today: date });
  const cc = classColdCallRate(coldCalls, date);
  const latest = (v: (number | null)[]) => { const x = [...v].reverse().find((y) => y !== null); return x === undefined || x === null ? null : Math.round(x * 100); };

  const wk = weekStart(date);
  const thisWeek = checkins.filter((c) => c.date >= wk && c.date <= date && (c.status === 'complete' || c.status === 'partial')).length;
  const seen = students.filter((s) => { const l = lastCheckedDate(checkins.filter((c) => c.studentId === s.id)); return l && daysBetween(l, date) < 14; }).length;
  const icpRate = implementationSummary(icpChecks.filter((c) => daysBetween(c.date, date) <= 14)).rate;
  const tips = classSuggestions({ students, checkins, observations, categories, adjustments, icpChecks, today: date, maxGapDays: settings.maxGapDays });
  const core = categories.filter((c) => c.builtIn);
  const need = needByStudent(students, checkins.filter((c) => c.classId === classId), observations.filter((o) => o.classId === classId), tags, homework, date, lessons);
  const ranked = [...need.values()].filter((r) => r.concern > 0).sort((a, b) => b.concern - a.concern).slice(0, 3)
    .map((r) => ({ s: students.find((x) => x.id === r.studentId)!, r }));

  return (
    <div class="overview">
      <div class="stat-grid">
        <div class="stat"><b>{thisWeek}</b><span>check-ins this week</span></div>
        <div class="stat"><b>{seen}/{students.length}</b><span>seen in 14 days</span></div>
        <div class="stat"><b>{icpRate === null ? '–' : `${icpRate}%`}</b><span>ICP implemented</span></div>
      </div>

      <div class="grid2 overview-actions">
        <a class="btn primary" href={`#/class/${classId}`}><Icon name="today" /> Open class</a>
        <button class="btn" onClick={onBlitz}><Icon name="bolt" /> Blitz</button>
      </div>

      <div class="card">
        <span class="eyebrow">Check-in success rate · % meeting expectations per {success.unit}</span>
        <MultiTrendLine series={success.series} labels={success.labels} />
        <div class="success-latest">
          {success.series.map((s) => { const v = latest(s.values); return <span key={s.id}><i style={{ background: s.colour }} />{s.label}: <b>{v === null ? '–' : `${v}%`}</b></span>; })}
        </div>
      </div>

      <div class="card">
        <span class="eyebrow">Cold calls · % answered well</span>
        <div class="row between" style="margin:4px 0">
          <span class="small">Last 7 days: <b>{cc.last7 === null ? '–' : `${cc.last7}%`}</b></span>
          <span class="small">Overall: <b>{cc.overall === null ? '–' : `${cc.overall}%`}</b> <span class="tiny muted">({cc.total})</span></span>
        </div>
        <TrendLine values={cc.weekly} height={44} labels={[weeksAgo(cc.weeks - 1), 'this week']} />
      </div>

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
        <span class="eyebrow">Most recent concerns</span>
        {!ranked.length && <p class="small muted">No recent concerns.</p>}
        {ranked.map(({ s, r }) => (
          <a key={s.id} class="mini-row" href={`#/students/${s.id}`} style="text-decoration:none;color:inherit">
            <span class="grow">{displayName(s)}</span><NeedBadge r={r} /><Icon name="chevron" />
          </a>
        ))}
      </div>
    </div>
  );
}
