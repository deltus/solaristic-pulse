// "My teaching": gentle patterns from the teacher's own close-of-lesson answers over the last
// four weeks. Private to the teacher: never part of shared or de-identified exports.
// Wording rules: every insight is an observation or a question, never a judgement, and at
// least one positive pattern is shown whenever one exists.

import type { HomeworkCheck, Lesson, Observation, SchoolClass } from '../types';
import { daysBetween } from '../lib/dates';

export const MIN_CLOSED_LESSONS = 5;
export const WINDOW_DAYS = 28;

export interface Insight { text: string; tone: 'positive' | 'observation' | 'question' }

const pct = (a: number, b: number) => Math.round((a / b) * 100);

/** Closed lessons with both teacher-check answers, within the window. */
export function reflectedLessons(lessons: Lesson[], today: string): Lesson[] {
  return lessons
    .filter((l) => l.status === 'closed' && !l.historical && l.happy && l.planDone)
    .filter((l) => { const d = daysBetween(l.date, today); return d >= 0 && d <= WINDOW_DAYS; })
    .sort((a, b) => a.openedAt - b.openedAt);
}

export function reflectionInsights(input: {
  lessons: Lesson[]; classes: SchoolClass[]; observations: Observation[]; homework: HomeworkCheck[]; checkinLesson: Map<string, string>; today: string;
}): Insight[] {
  const { classes, observations, homework, checkinLesson, today } = input;
  const done = reflectedLessons(input.lessons, today);
  if (done.length < MIN_CLOSED_LESSONS) return [];
  const out: Insight[] = [];
  const name = (id: string) => classes.find((c) => c.id === id)?.name ?? 'this class';

  // Attention logged in the daily check-in for a set of lessons (share meeting expectations).
  const attentionShare = (ids: Set<string>) => {
    const rows = observations.filter((o) => o.categoryId === 'focus' && o.level !== null && !o.blitz && ids.has(o.lessonId ?? checkinLesson.get(o.checkinId) ?? ''));
    return rows.length >= 3 ? rows.filter((o) => o.level === 0).length / rows.length : null;
  };

  // 1. A class where several recent lessons felt unhappy.
  for (const classId of new Set(done.map((l) => l.classId))) {
    const last = done.filter((l) => l.classId === classId).slice(-5);
    const unhappy = last.filter((l) => l.happy === 'no').length;
    if (last.length >= 3 && unhappy >= 3) {
      const share = attentionShare(new Set(last.map((l) => l.id)));
      out.push(share !== null && share >= 0.7
        ? { tone: 'question', text: `You've said you were unhappy with ${unhappy} of your last ${last.length} lessons with ${name(classId)}, but students were mostly logged as attentive. What's making these lessons feel off?` }
        : { tone: 'question', text: `You've said you were unhappy with ${unhappy} of your last ${last.length} lessons with ${name(classId)}. Is there something these lessons have in common?` });
    } else if (last.length >= 3 && last.every((l) => l.happy !== 'no')) {
      out.push({ tone: 'positive', text: `Lessons with ${name(classId)} have been going well: you were happy or mostly happy with all of the last ${last.length}.` });
    }
  }

  // 2. Getting through the plan, by class attention.
  const withAtt = done.filter((l) => l.attentionPct !== undefined);
  const hi = withAtt.filter((l) => l.attentionPct! > 70), lo = withAtt.filter((l) => l.attentionPct! <= 70);
  const hiDone = hi.filter((l) => l.planDone === 'yes').length, loDone = lo.filter((l) => l.planDone === 'yes').length;
  if (hi.length >= 3 && hiDone / hi.length >= 0.6) {
    out.push({ tone: 'positive', text: `You got through your plan in most lessons where the class attention was above 70% (${hiDone} of ${hi.length})${lo.length >= 2 ? `, compared with ${loDone} of ${lo.length} when it was lower` : ''}.` });
  } else if (lo.length >= 3 && loDone / lo.length < 0.4) {
    out.push({ tone: 'observation', text: `In lessons where class attention was 70% or lower, you got through your plan in ${loDone} of ${lo.length}.` });
  }

  // 3. Homework completion with and without a written description.
  const rate = (ls: Lesson[]) => {
    const checks = homework.filter((h) => ls.some((l) => l.id === h.forLessonId));
    return { n: ls.filter((l) => checks.some((h) => h.forLessonId === l.id)).length, pct: checks.length ? pct(checks.filter((h) => h.done).length, checks.length) : null };
  };
  const setHw = input.lessons.filter((l) => l.status === 'closed' && l.homeworkSet && daysBetween(l.date, today) <= WINDOW_DAYS);
  const described = rate(setHw.filter((l) => l.homeworkText?.trim())), bare = rate(setHw.filter((l) => !l.homeworkText?.trim()));
  if (described.n >= 2 && bare.n >= 2 && described.pct !== null && bare.pct !== null && Math.abs(described.pct - bare.pct) >= 10) {
    out.push(described.pct > bare.pct
      ? { tone: 'positive', text: `Homework completion is higher when homework was set with a written description (${described.pct}% compared with ${bare.pct}%).` }
      : { tone: 'observation', text: `Homework completion has been higher when no written description was added (${bare.pct}% compared with ${described.pct}%). Is that what you'd expect?` });
  }

  // 4. Overall feel.
  const good = done.filter((l) => l.happy !== 'no').length;
  if (good / done.length >= 0.6) out.push({ tone: 'positive', text: `You were happy or mostly happy with ${good} of your last ${done.length} lessons.` });
  else out.push({ tone: 'question', text: `You were happy or mostly happy with ${good} of your last ${done.length} lessons. Is anything in particular making lessons harder at the moment?` });

  const plan = done.filter((l) => l.planDone === 'yes').length;
  if (plan / done.length >= 0.6 && !out.some((i) => i.text.includes('through your plan'))) {
    out.push({ tone: 'positive', text: `You got through what you planned in ${plan} of your last ${done.length} lessons.` });
  }

  // A positive pattern first (if there is one), then the rest.
  const firstPositive = out.findIndex((i) => i.tone === 'positive');
  return firstPositive > 0 ? [out[firstPositive], ...out.filter((_, i) => i !== firstPositive)] : out;
}
