import { describe, expect, it } from 'vitest';
import type { Checkin, HomeworkCheck, IssueTag, Observation, Student } from '../src/types';
import { buildAllGood, buildIssue, lessonIdFor, openFollow, recentSummaries, streakDue, summaryText } from '../src/logic/checkin';
import { lessonsSinceSeen, lessonOrder, needWords, rankByNeed } from '../src/logic/need';
import { addDays } from '../src/lib/dates';

/** Seeded random (mulberry32), so simulations give the same result every run. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const student = (i: number): Student => ({ id: `s${String(i).padStart(2, '0')}`, classId: 'c1', firstName: `Student${i}`, lastName: 'Test', archived: false, priorityAdjust: 0, createdAt: 0 });

/** A class in memory: log check-ins lesson by lesson and rank with the real ranking. */
function sim(n: number) {
  const students = Array.from({ length: n }, (_, i) => student(i));
  const checkins: Checkin[] = [], observations: Observation[] = [], tags: IssueTag[] = [], homework: HomeworkCheck[] = [];
  const save = (r: { checkin: Checkin; observations: Observation[]; tags: IssueTag[] }) => { checkins.push(r.checkin); observations.push(...r.observations); tags.push(...r.tags); };
  const rank = (date: string, exclude = new Set<string>()) =>
    rankByNeed({ students, checkins, observations, tags, homework, lessonId: lessonIdFor(date, 'c1'), today: date, excludeIds: exclude });
  return { students, checkins, observations, tags, save, rank };
}

describe('saving a swipe check-in', () => {
  const t = { studentId: 's1', classId: 'c1', date: '2026-10-26', lessonId: lessonIdFor('2026-10-26', 'c1'), now: 1 };

  it('All good: every area meets, marked implied, no sub-option rows', () => {
    const r = buildAllGood(t);
    expect(r.checkin).toMatchObject({ result: 'good', status: 'complete', lessonId: t.lessonId });
    expect(r.observations.map((o) => [o.categoryId, o.level, o.source])).toEqual([['behaviour', 0, 'implied'], ['focus', 0, 'implied'], ['coping', 0, 'implied']]);
    expect(r.tags).toEqual([]);
  });

  it('Issue: tapped areas observed as needs support, untapped implied meets, one row per ticked sub-option', () => {
    const r = buildIssue(t, { areas: { behaviour: ['disruptive', 'tech_misuse'], coping: [] }, note: 'Upset after lunch' });
    expect(r.checkin).toMatchObject({ result: 'issue', followUp: true, note: 'Upset after lunch' });
    expect(r.observations.map((o) => [o.categoryId, o.level, o.source])).toEqual([['behaviour', 1, 'observed'], ['focus', 0, 'implied'], ['coping', 1, 'observed']]);
    expect(r.tags.map((x) => `${x.areaId}:${x.tagId}:${x.source}`)).toEqual(['behaviour:disruptive:observed', 'behaviour:tech_misuse:observed']);
    // Unticked sub-options are never saved, so nothing says "not following instructions" needs support.
    expect(r.tags.some((x) => x.tagId === 'not_following')).toBe(false);
    expect(() => buildIssue(t, { areas: {} })).toThrow();
  });

  it('summarises the last results and open follow-up, including older question-by-question check-ins', () => {
    const s = sim(1);
    const old: Checkin = { id: '2026-10-19|c1|s00', studentId: 's00', classId: 'c1', date: '2026-10-19', createdAt: 1, status: 'complete', source: 'daily' };
    s.checkins.push(old);
    s.observations.push({ id: `${old.id}|q-focus`, checkinId: old.id, studentId: 's00', classId: 'c1', date: old.date, createdAt: 1, questionId: 'q-focus', categoryId: 'focus', response: 'Needs support', level: 1 });
    s.save(buildIssue({ studentId: 's00', classId: 'c1', date: '2026-10-22', lessonId: lessonIdFor('2026-10-22', 'c1'), now: 2 }, { areas: { behaviour: ['disruptive'] } }));
    const recent = recentSummaries(s.checkins, s.observations, s.tags);
    expect(recent.map(summaryText)).toEqual(['Behaviour: disruptive', 'Attention']);
    expect(openFollow(s.checkins, s.observations, s.tags)?.text).toBe('Behaviour: disruptive');
    s.save(buildAllGood({ studentId: 's00', classId: 'c1', date: '2026-10-26', lessonId: lessonIdFor('2026-10-26', 'c1'), now: 3 }));
    expect(openFollow(s.checkins, s.observations, s.tags)).toBeNull();
  });

  it('asks about a positive streak after 3 All goods, then not again for 2 weeks', () => {
    const s = sim(1);
    for (const d of ['2026-10-20', '2026-10-22', '2026-10-26']) s.save(buildAllGood({ studentId: 's00', classId: 'c1', date: d, lessonId: lessonIdFor(d, 'c1') }));
    expect(streakDue({}, s.checkins, s.observations, s.tags, '2026-10-27')).toBe(true);
    expect(streakDue({ streakAskedAt: '2026-10-20' }, s.checkins, s.observations, s.tags, '2026-10-27')).toBe(false);
    expect(streakDue({ streakAskedAt: '2026-10-10' }, s.checkins, s.observations, s.tags, '2026-10-27')).toBe(true);
  });
});

describe('ranking by need', () => {
  it('a new class of 25 cycles through everyone before anyone repeats (10 lessons of 8)', () => {
    const s = sim(25);
    const random = rng(42);
    const order: string[] = [];
    let date = '2026-10-01';
    for (let lesson = 0; lesson < 10; lesson++) {
      const logged = new Set<string>();
      for (let k = 0; k < 8; k++) {
        const next = s.rank(date, logged)[0];
        order.push(next.studentId);
        logged.add(next.studentId);
        const t = { studentId: next.studentId, classId: 'c1', date, lessonId: lessonIdFor(date, 'c1') };
        s.save(random() < 0.3 ? buildIssue(t, { areas: { focus: ['distracted'] } }) : buildAllGood(t));
      }
      date = addDays(date, 2);
    }
    expect(new Set(order.slice(0, 25)).size).toBe(25);
    // Within a lesson nobody is logged twice.
    for (let l = 0; l < 10; l++) expect(new Set(order.slice(l * 8, l * 8 + 8)).size).toBe(8);
  });

  it('students with recent issues come up about twice as often as students who are consistently fine', () => {
    const s = sim(25);
    const prone = new Set(s.students.slice(0, 5).map((x) => x.id));
    const picks = new Map<string, number>();
    let date = '2026-08-03';
    for (let lesson = 0; lesson < 60; lesson++) {
      const logged = new Set<string>();
      for (let k = 0; k < 8; k++) {
        const next = s.rank(date, logged)[0];
        logged.add(next.studentId);
        if (lesson >= 10) picks.set(next.studentId, (picks.get(next.studentId) ?? 0) + 1);
        const t = { studentId: next.studentId, classId: 'c1', date, lessonId: lessonIdFor(date, 'c1') };
        s.save(prone.has(next.studentId) ? buildIssue(t, { areas: { behaviour: ['disruptive'] } }) : buildAllGood(t));
      }
      date = addDays(date, 2);
    }
    const avg = (ids: string[]) => ids.reduce((sum, id) => sum + (picks.get(id) ?? 0), 0) / ids.length;
    const ratio = avg([...prone]) / avg(s.students.map((x) => x.id).filter((id) => !prone.has(id)));
    expect(ratio).toBeGreaterThan(1.6);
    expect(ratio).toBeLessThan(2.6);
  });

  it('a student with a recent issue ranks above one who is always fine, and the order updates after each swipe', () => {
    const s = sim(3);
    const [a, b, c] = s.students.map((x) => x.id);
    const d1 = '2026-10-20', d2 = '2026-10-22';
    for (const id of [a, c]) s.save(buildAllGood({ studentId: id, classId: 'c1', date: d1, lessonId: lessonIdFor(d1, 'c1') }));
    s.save(buildIssue({ studentId: b, classId: 'c1', date: d1, lessonId: lessonIdFor(d1, 'c1') }, { areas: { focus: [] } }));
    const first = s.rank(d2);
    expect(first[0].studentId).toBe(b);
    expect(needWords(first[0])).toMatch(/^Recent concerns: 1\.\d+ · Last seen: 1 lesson ago$/);
    // Log b in this lesson: b leaves the queue and the rest re-rank.
    s.save(buildAllGood({ studentId: b, classId: 'c1', date: d2, lessonId: lessonIdFor(d2, 'c1') }));
    const after = s.rank(d2, new Set([b]));
    expect(after.map((r) => r.studentId)).not.toContain(b);
    expect(after).toHaveLength(2);
  });

  it('counts lessons since last seen from this class’s lessons, not calendar days', () => {
    const s = sim(2);
    const dates = ['2026-10-01', '2026-10-15', '2026-10-16'];
    s.save(buildAllGood({ studentId: 's00', classId: 'c1', date: dates[0], lessonId: lessonIdFor(dates[0], 'c1') }));
    s.save(buildAllGood({ studentId: 's01', classId: 'c1', date: dates[1], lessonId: lessonIdFor(dates[1], 'c1') }));
    const current = lessonIdFor(dates[2], 'c1');
    const order = lessonOrder(s.checkins, [], current);
    expect(lessonsSinceSeen('s00', s.checkins, order, current)).toBe(2);
    expect(lessonsSinceSeen('s01', s.checkins, order, current)).toBe(1);
  });
});
