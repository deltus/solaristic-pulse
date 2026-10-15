import { describe, expect, it } from 'vitest';
import type { Checkin, Observation, Student } from '../src/types';
import { CORE_CATEGORIES, CORE_QUESTIONS } from '../src/db';
import { computePriority, rankStudents, selectForDay, WEIGHT_MAX, WEIGHT_MIN } from '../src/logic/priority';
import { followUpLevel, followUpPrompt, openFollowUp } from '../src/logic/followups';
import { categoryTrend } from '../src/logic/trends';
import { compareBeforeAfter, icpDueStatus } from '../src/logic/icp';
import { makeScrubber, pseudonymMap } from '../src/logic/deidentify';
import { parseRoster, parseTimetable } from '../src/logic/importers';
import { dueQuestions } from '../src/logic/schedule';
import { addDays } from '../src/lib/dates';

const TODAY = '2026-10-15';
const mkStudent = (i: number, extra: Partial<Student> = {}): Student => ({
  id: `s${i}`, classId: 'c1', firstName: `First${i}`, lastName: `Last${i}`, archived: false, priorityAdjust: 0, createdAt: 0, ...extra
});
let seq = 0;
const mkObs = (studentId: string, date: string, level: 0 | 1 | 2 | null, extra: Partial<Observation> = {}): Observation => ({
  id: `o${++seq}`, checkinId: `${date}|c1|${studentId}`, studentId, classId: 'c1', date, createdAt: seq,
  questionId: 'q-focus', categoryId: 'focus', response: String(level), level, ...extra
});
const mkChk = (studentId: string, date: string, status: Checkin['status'] = 'complete'): Checkin => ({
  id: `${date}|c1|${studentId}`, studentId, classId: 'c1', date, createdAt: 0, status, source: 'daily'
});
const base = { questions: CORE_QUESTIONS, categories: CORE_CATEGORIES, maxGapDays: 14 };

/** Simulates N school days of 5 check-ins using the real ranking. */
function simulate(students: Student[], days: number, levelFor: (s: Student) => 0 | 1 | 2 | null = () => 0) {
  const checkins: Checkin[] = [];
  const observations: Observation[] = [];
  const counts = new Map(students.map((s) => [s.id, 0]));
  for (let d = 0; d < days; d++) {
    const date = addDays('2026-07-01', d);
    const picks = selectForDay({ ...base, students, observations, checkins, today: date }, 5);
    for (const p of picks) {
      const s = students.find((x) => x.id === p.studentId)!;
      checkins.push(mkChk(s.id, date));
      observations.push(mkObs(s.id, date, levelFor(s)));
      counts.set(s.id, counts.get(s.id)! + 1);
    }
  }
  return { checkins, observations, counts };
}

describe('daily selection', () => {
  it('generates five check-ins from a class (scenario 3)', () => {
    const students = Array.from({ length: 12 }, (_, i) => mkStudent(i));
    const picks = selectForDay({ ...base, students, observations: [], checkins: [], today: TODAY }, 5);
    expect(picks).toHaveLength(5);
    expect(new Set(picks.map((p) => p.studentId)).size).toBe(5);
    picks.forEach((p) => expect(p.reasons[0]).toBe('Not yet checked in'));
  });

  it('is deterministic for the same inputs', () => {
    const students = Array.from({ length: 12 }, (_, i) => mkStudent(i));
    const a = selectForDay({ ...base, students, observations: [], checkins: [], today: TODAY }, 5);
    const b = selectForDay({ ...base, students, observations: [], checkins: [], today: TODAY }, 5);
    expect(a.map((x) => x.studentId)).toEqual(b.map((x) => x.studentId));
  });

  it('covers every student and nobody waits longer than the coverage window (scenario 9)', () => {
    const students = Array.from({ length: 26 }, (_, i) => mkStudent(i, i < 3 ? { flag: { reason: 'x', since: TODAY } } : {}));
    const { checkins, counts } = simulate(students, 40, (s) => (s.id === 's4' ? 2 : 0));
    for (const s of students) {
      expect(counts.get(s.id)).toBeGreaterThan(0);
      const dates = checkins.filter((c) => c.studentId === s.id).map((c) => c.date).sort();
      for (let i = 1; i < dates.length; i++) {
        const gap = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86400000;
        expect(gap).toBeLessThanOrEqual(14);
      }
    }
  });

  it('flagged students are checked more often, but do not monopolise check-ins (scenario 8)', () => {
    const students = Array.from({ length: 20 }, (_, i) => mkStudent(i, i === 0 ? { flag: { reason: 'Monitor', since: TODAY } } : {}));
    const { counts } = simulate(students, 40);
    const flagged = counts.get('s0')!;
    const others = [...counts.entries()].filter(([k]) => k !== 's0').map(([, v]) => v);
    const avgOther = others.reduce((a, b) => a + b, 0) / others.length;
    expect(flagged).toBeGreaterThan(avgOther * 1.3);
    expect(flagged).toBeLessThan(40 * 0.6); // not every day
  });

  it('flag raises the weight and appears in the explanation', () => {
    const s = mkStudent(1, { flag: { reason: 'Check reading', since: TODAY } });
    const p = computePriority(s, [], [], CORE_QUESTIONS, CORE_CATEGORIES, TODAY);
    expect(p.weight).toBeCloseTo(1.75);
    expect(p.parts[0].label).toContain('Check reading');
  });

  it('weights are bounded', () => {
    const heavy = mkStudent(1, { flag: { reason: '', since: TODAY }, priorityAdjust: 5 });
    const obs = Array.from({ length: 12 }, (_, i) => mkObs('s1', addDays(TODAY, -i), 2, { categoryId: ['focus', 'homework', 'behaviour'][i % 3], questionId: ['q-focus', 'q-homework', 'q-behaviour'][i % 3] }));
    expect(computePriority(heavy, obs, [], CORE_QUESTIONS, CORE_CATEGORIES, TODAY).weight).toBeLessThanOrEqual(WEIGHT_MAX);
    const light = mkStudent(2, { priorityAdjust: -5 });
    const chks = Array.from({ length: 6 }, (_, i) => mkChk('s2', addDays(TODAY, -i)));
    expect(computePriority(light, [], chks, CORE_QUESTIONS, CORE_CATEGORIES, TODAY).weight).toBeGreaterThanOrEqual(WEIGHT_MIN);
  });

  it('a single difficulty is not treated as a recurring problem; repeated ones are', () => {
    const s = mkStudent(1);
    const one = computePriority(s, [mkObs('s1', addDays(TODAY, -2), 2)], [], CORE_QUESTIONS, CORE_CATEGORIES, TODAY);
    expect(one.parts.some((p) => p.label.startsWith('Recurring'))).toBe(false);
    const three = computePriority(s, [mkObs('s1', addDays(TODAY, -9), 1), mkObs('s1', addDays(TODAY, -5), 2), mkObs('s1', addDays(TODAY, -2), 1)], [], CORE_QUESTIONS, CORE_CATEGORIES, TODAY);
    expect(three.parts.some((p) => p.label.startsWith('Recurring'))).toBe(true);
    expect(three.weight).toBeGreaterThan(one.weight);
  });

  it('absence and unsure answers do not count as negative or reset the clock (scenario 5)', () => {
    const students = [mkStudent(1), mkStudent(2)];
    const checkins = [mkChk('s1', addDays(TODAY, -5), 'absent'), mkChk('s2', addDays(TODAY, -5))];
    const obs = [mkObs('s2', addDays(TODAY, -5), null)];
    const ranked = rankStudents({ ...base, students, observations: obs, checkins, today: TODAY });
    const s1 = ranked.find((r) => r.studentId === 's1')!;
    expect(s1.daysSince).toBeNull(); // absence is not a check-in
    expect(s1.priority.parts).toHaveLength(0); // and not a negative factor
    expect(openFollowUp(obs, 'q-focus')).toBeNull();
  });
});

describe('contextual follow-ups (scenarios 6 & 7)', () => {
  it('opens a follow-up after a difficulty, including the previous context and note', () => {
    const prev = mkObs('s1', addDays(TODAY, -3), 1, { context: 'Independent work', note: 'Needed several reminders.' });
    const f = openFollowUp([prev], 'q-focus')!;
    expect(f).not.toBeNull();
    const text = followUpPrompt('Ethan', CORE_CATEGORIES[0], f, TODAY);
    expect(text).toContain('Last time (3 days ago), Ethan had some difficulty with effort during independent work');
    expect(text).toContain('Note: "Needed several reminders." Did this happen again?');
  });

  it('"No, all good" closes the follow-up; "about the same" keeps it open with history linked', () => {
    const o1 = mkObs('s1', addDays(TODAY, -6), 2, { note: 'Messed around with David' });
    const o2 = mkObs('s1', addDays(TODAY, -3), followUpLevel(2, 'same'), { followUp: { previousId: o1.id, outcome: 'same' } });
    const f = openFollowUp([o1, o2], 'q-focus')!;
    expect(f.level).toBe(2);
    expect(f.origin.id).toBe(o1.id);
    const o3 = mkObs('s1', TODAY, followUpLevel(2, 'improved'), { followUp: { previousId: o2.id, outcome: 'improved' } });
    expect(openFollowUp([o1, o2, o3], 'q-focus')).toBeNull();
  });

  it('"not enough information" keeps the follow-up open', () => {
    const o1 = mkObs('s1', addDays(TODAY, -3), 1);
    const o2 = mkObs('s1', TODAY, followUpLevel(1, 'unknown'), { followUp: { previousId: o1.id, outcome: 'unknown' } });
    expect(openFollowUp([o1, o2], 'q-focus')?.previous.id).toBe(o1.id);
  });

  it('improved students are not excluded indefinitely', () => {
    const students = Array.from({ length: 10 }, (_, i) => mkStudent(i));
    const { counts } = simulate(students, 30, () => 0);
    for (const v of counts.values()) expect(v).toBeGreaterThanOrEqual(10);
  });

  it('works independently per category', () => {
    const o = mkObs('s1', TODAY, 2, { questionId: 'q-homework', categoryId: 'homework' });
    expect(openFollowUp([o], 'q-homework')).not.toBeNull();
    expect(openFollowUp([o], 'q-focus')).toBeNull();
  });
});

describe('custom questions (scenario 10)', () => {
  it('respects class scope and frequency, and returns when a follow-up is open', () => {
    const custom = { ...CORE_QUESTIONS[0], id: 'q-x', builtIn: false, categoryId: 'org', classIds: ['c1'], frequencyDays: 7, order: 9 };
    const qs = [...CORE_QUESTIONS, custom];
    const s = mkStudent(1);
    expect(dueQuestions(qs, s, 'c1', [], TODAY).map((q) => q.id)).toContain('q-x');
    expect(dueQuestions(qs, s, 'c2', [], TODAY).map((q) => q.id)).not.toContain('q-x');
    const asked = mkObs('s1', addDays(TODAY, -2), 0, { questionId: 'q-x', categoryId: 'org' });
    expect(dueQuestions(qs, s, 'c1', [asked], TODAY).map((q) => q.id)).not.toContain('q-x');
    const difficulty = mkObs('s1', addDays(TODAY, -2), 2, { questionId: 'q-x', categoryId: 'org' });
    expect(dueQuestions(qs, s, 'c1', [difficulty], TODAY).map((q) => q.id)).toContain('q-x');
  });
});

describe('trends', () => {
  const cat = CORE_CATEGORIES[1];
  it('reports insufficient data', () => {
    const t = categoryTrend([mkObs('s1', TODAY, 1, { categoryId: 'homework' })], cat, TODAY);
    expect(t.status).toBe('insufficient');
    expect(t.summary).toContain('Not enough observations');
  });
  it('detects improvement', () => {
    const levels: (0 | 1 | 2)[] = [2, 2, 1, 1, 0, 0, 0, 0];
    const obs = levels.map((l, i) => mkObs('s1', addDays(TODAY, -21 + i * 3), l, { categoryId: 'homework' }));
    const t = categoryTrend(obs, cat, TODAY);
    expect(t.status).toBe('improving');
    expect(t.summary).toMatch(/Prepared for class has improved over the last 3 weeks/);
  });
  it('reports stability and recurring contexts as facts', () => {
    const obs = [0, 1, 2, 3].map((i) => mkObs('s1', addDays(TODAY, -i * 4), 1, { context: 'Independent work' }));
    const t = categoryTrend(obs, CORE_CATEGORIES[0], TODAY);
    expect(t.status).toBe('stable');
    expect(t.facts.join(' ')).toContain('Difficulty recorded 4 times during independent work');
  });
});

describe('ICP (scenario 11)', () => {
  const adj = { id: 'a1', studentId: 's1', title: 'Front seat', frequency: 'weekly' as const, startDate: addDays(TODAY, -20), active: true, createdAt: 0 };
  it('computes due and overdue status', () => {
    expect(icpDueStatus(adj, [], TODAY, true).overdue).toBe(true);
    const recent = [{ id: 'x', adjustmentId: 'a1', studentId: 's1', date: addDays(TODAY, -3), outcome: 'implemented' as const, createdAt: 0 }];
    expect(icpDueStatus(adj, recent, TODAY, true).due).toBe(false);
  });
  it('compares before/after with associative language', () => {
    const obs = [
      ...[25, 22, 18].map((d) => mkObs('s1', addDays(TODAY, -d), 2)),
      ...[10, 6, 2].map((d) => mkObs('s1', addDays(TODAY, -d), 0))
    ];
    const rows = compareBeforeAfter(adj, obs, CORE_CATEGORIES, TODAY);
    expect(rows[0].statement).toContain('Improvement observed after the adjustment began');
    expect(rows[0].statement).toContain('association only');
    expect(rows[0].statement).not.toMatch(/caused/);
    expect(rows[1].statement).toContain('Not enough');
  });
});

describe('de-identification (scenario 14)', () => {
  const students = [
    mkStudent(1, { firstName: 'William', lastName: 'Harris', preferredName: 'Bill', externalId: 'ST1234' }),
    mkStudent(2, { firstName: 'Ethan', lastName: 'Taylor' }),
    mkStudent(3, { firstName: 'Ethan', lastName: 'Brown' }),
    mkStudent(4, { firstName: 'Zoë', lastName: "O'Connor" })
  ];
  const map = pseudonymMap(students);
  const scrub = makeScrubber(students, map, ['Ms Rivers']);
  it('assigns stable pseudonyms', () => {
    expect([...map.values()].sort()).toEqual(['Student 001', 'Student 002', 'Student 003', 'Student 004']);
    expect(pseudonymMap([...students].reverse())).toEqual(map);
  });
  it('removes names, nicknames, IDs and ambiguous first names from notes', () => {
    const out = scrub('Bill Harris (ST1234) sat with Ethan Taylor, then Ethan and Zoë argued. Ms Rivers spoke to bill.');
    expect(out).not.toMatch(/Bill|Harris|ST1234|Taylor|Zoë|Rivers/i);
    expect(out).toContain(map.get('s1')!);
    expect(out).toContain(map.get('s2')!);
    expect(out).toContain('[name]'); // "Ethan" alone is ambiguous
    expect(out).toContain('[redacted]');
  });
  it('does not replace names inside other words', () => {
    expect(scrub('Billing and Harrison')).toBe('Billing and Harrison');
  });
});

describe('importers (scenarios 2 & 12)', () => {
  it('parses rosters with flexible headers', () => {
    const r = parseRoster([['Student Name', 'Class'], ['Taylor, Ethan', '9C'], ['Mia Nguyen', '7B'], ['', '']]);
    expect(r.rows).toEqual([
      { firstName: 'Ethan', lastName: 'Taylor', className: '9C', preferredName: undefined, externalId: undefined },
      { firstName: 'Mia', lastName: 'Nguyen', className: '7B', preferredName: undefined, externalId: undefined }
    ]);
    expect(parseRoster([['Foo'], ['x']]).errors[0]).toContain('No name column');
  });
  it('parses timetables and reports bad rows', () => {
    const r = parseTimetable([
      ['Class', 'Day', 'Start', 'End', 'Room'],
      ['9C Science', 'Mon', '9:00', '10:00', 'Lab 2'],
      ['7B English', 'Funday', '9:00', '10:00', ''],
      ['10A Maths', 'Wednesday', '1:30 pm', '2:30 pm', '']
    ]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1]).toMatchObject({ day: 3, start: '13:30', end: '14:30' });
    expect(r.errors[0]).toContain('Funday');
    const t = parseTimetable([['Class', 'Day', 'Time'], ['9C', 'Tue', '11:20-12:20']]);
    expect(t.rows[0]).toMatchObject({ start: '11:20', end: '12:20', day: 2 });
  });
});

import { inQuietHours, planReminders } from '../src/logic/reminderPlan';
import { DEFAULT_SETTINGS } from '../src/types';

describe('reminder planning (scenario 12)', () => {
  const classes = [{ id: 'c1', name: '9C Science', archived: false, createdAt: 0 }, { id: 'c2', name: 'Old', archived: true, createdAt: 0 }];
  const tt = [
    { id: 't1', classId: 'c1', day: 4, start: '11:20', end: '12:20', room: 'Lab 2' }, // Thursday
    { id: 't2', classId: 'c2', day: 4, start: '13:00', end: '14:00' }
  ];
  const prefs = { ...DEFAULT_SETTINGS.reminders, enabled: true, beforeLessonMin: 5, afterLesson: true, dailyTime: '15:30' };
  const thursdayMorning = new Date(2026, 9, 15, 8, 0); // Thu 15 Oct 2026

  it('schedules before/after lesson and daily reminders from the timetable', () => {
    const p = planReminders(tt, classes, prefs, thursdayMorning, 1, () => '2 ICP adjustments to check');
    expect(p.map((x) => `${x.at.getHours()}:${String(x.at.getMinutes()).padStart(2, '0')} ${x.title}`)).toEqual([
      '11:15 9C Science in 5 min · Lab 2', '12:20 9C Science has finished', '15:30 Daily check-in'
    ]);
    expect(p[0].body).toContain('2 ICP adjustments');
    expect(p[0].classId).toBe('c1');
  });
  it('skips archived classes, past times, quiet hours and days without lessons', () => {
    expect(planReminders(tt, classes, prefs, new Date(2026, 9, 15, 13, 0), 1)).toHaveLength(1); // only daily left
    expect(planReminders(tt, classes, { ...prefs, quietStart: '11:00', quietEnd: '13:00' }, thursdayMorning, 1).map((x) => x.title)).toEqual(['Daily check-in']);
    expect(planReminders(tt, classes, prefs, thursdayMorning, 8)).toHaveLength(6); // next Thursday too
    expect(planReminders(tt, classes, { ...prefs, enabled: false }, thursdayMorning, 7)).toHaveLength(0);
  });
  it('handles overnight quiet hours', () => {
    expect(inQuietHours(22 * 60, '20:00', '07:00')).toBe(true);
    expect(inQuietHours(6 * 60, '20:00', '07:00')).toBe(true);
    expect(inQuietHours(12 * 60, '20:00', '07:00')).toBe(false);
  });
});

import { parsePriority } from '../src/logic/importers';

describe('draw weight inputs and weighting', () => {
  it('parses starting priority from roster cells', () => {
    expect(parsePriority('1.5')).toBe(0.5);
    expect(parsePriority('2')).toBe(1);
    expect(parsePriority('5')).toBe(1); // bounded
    expect(parsePriority('higher')).toBe(0.5);
    expect(parsePriority('Lower')).toBe(-0.5);
    expect(parsePriority('')).toBeUndefined();
    const r = parseRoster([['Name', 'Priority'], ['Mia Nguyen', 'high']]);
    expect(r.rows[0].priorityAdjust).toBe(0.5);
  });
  it('significant difficulty raises the weight more than some difficulty', () => {
    const s = mkStudent(1);
    const some = computePriority(s, [mkObs('s1', addDays(TODAY, -5), 1), mkObs('s1', addDays(TODAY, -2), 1)], [], CORE_QUESTIONS, CORE_CATEGORIES, TODAY);
    const sig = computePriority(s, [mkObs('s1', addDays(TODAY, -5), 2), mkObs('s1', addDays(TODAY, -2), 2)], [], CORE_QUESTIONS, CORE_CATEGORIES, TODAY);
    expect(sig.weight).toBeGreaterThan(some.weight);
    // ...but a single significant difficulty is still not a "recurring" pattern.
    const one = computePriority(s, [mkObs('s1', addDays(TODAY, -2), 2)], [], CORE_QUESTIONS, CORE_CATEGORIES, TODAY);
    expect(one.parts.some((p) => p.label.startsWith('Recurring'))).toBe(false);
  });
});

import { parseNameLines } from '../src/ui/Setup';

describe('setup name entry', () => {
  it('parses pasted name lists', () => {
    expect(parseNameLines('Ethan Taylor\n\nTaylor, Sam\nMary Jane Watson\nCher\nLi\tWei')).toEqual([
      { firstName: 'Ethan', lastName: 'Taylor' }, { firstName: 'Sam', lastName: 'Taylor' },
      { firstName: 'Mary Jane', lastName: 'Watson' }, { firstName: 'Cher', lastName: '' }, { firstName: 'Li', lastName: 'Wei' }
    ]);
  });
});

import { recentStatus } from '../src/logic/summary';

describe('last 5 answers summary', () => {
  it('rates each area from the last 5 rated answers, including Blitz marks', () => {
    const o = (d: number, level: 0 | 1 | null, extra: Partial<Observation> = {}) => mkObs('s1', addDays(TODAY, -d), level, { categoryId: 'behaviour', questionId: 'q-behaviour', ...extra });
    expect(recentStatus([], 'behaviour').status).toBe('none');
    expect(recentStatus([o(1, 0), o(2, 0), o(3, 1), o(4, 0)], 'behaviour')).toEqual({ status: 'meeting', count: 4, support: 1 });
    const withBlitz = [o(1, 1, { blitz: 'behaviour', questionId: 'blitz-behaviour' }), o(2, 1), o(3, 0), o(4, 0), o(5, 0), o(30, 1)];
    expect(recentStatus(withBlitz, 'behaviour')).toEqual({ status: 'support', count: 5, support: 2 });
    expect(recentStatus([o(1, null), o(2, 0)], 'behaviour').count).toBe(1); // "didn't see" style answers ignored
  });
});

import { classSuggestions, weeklyShare } from '../src/logic/insights';

describe('class insights', () => {
  it('computes weekly needs-support share and plain suggestions', () => {
    const obs = [
      ...[20, 19, 18].map((d) => mkObs('s1', addDays(TODAY, -d), 0, { categoryId: 'behaviour' })),
      ...[3, 2, 1].map((d) => mkObs('s1', addDays(TODAY, -d), 1, { categoryId: 'behaviour' }))
    ];
    const w = weeklyShare(obs, 'behaviour', TODAY, 4);
    expect(w).toHaveLength(4);
    expect(w.at(-1)!.share).toBeGreaterThan(0);
    const students = [mkStudent(1), mkStudent(2)];
    const tips = classSuggestions({ students, checkins: [mkChk('s1', addDays(TODAY, -1))], observations: obs, categories: CORE_CATEGORIES, adjustments: [], icpChecks: [], today: TODAY, maxGapDays: 14 });
    expect(tips.join(' ')).toContain('1 student hasn’t been checked in 10+ days: First2');
    expect(tips.join(' ')).toMatch(/Behaviour is slipping .* Try a Behaviour blitz/);
  });
});
