import 'fake-indexeddb/auto';
import { readFileSync } from 'fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BrainBreakLog, Lesson } from '../src/types';
import { PulseDB, useDatabase, db } from '../src/db';
import * as svc from '../src/services';
import { BRAIN_BREAKS, BREAK_GROUPS, GENERAL_GROUP, type BrainBreak } from '../src/config/brainBreaks';
import { availableBreaks, brainBreakText, breaksFor, groupForSubject, instructionParts, pickBreak, recentBreakIds, startGroup, subjectGroups, yearsInclude } from '../src/logic/brainBreaks';
import { planRoll, rollResult } from '../src/logic/coldcall';
import { studentTimeline } from '../src/logic/timeline';
import { buildSqlScript } from '../src/sqlExport';
import { buildExport } from '../src/exporting';
import { today } from '../src/lib/dates';

let n = 0;
beforeEach(async () => {
  const instance = new PulseDB(`round5-${++n}`);
  useDatabase(instance);
  await instance.open();
});

/** The vetted list: each "### Name ✅/⬜/❌" block with its numbered (or one-line) steps. */
function vetted() {
  const md = readFileSync(new URL('../docs/brain-breaks.md', import.meta.url), 'utf8');
  const blocks = md.split(/^### /m).slice(1);
  return blocks.map((b) => {
    const [head, ...lines] = b.split(/\r?\n/);
    const mark = head.match(/(✅|⬜|❌)\s*$/)?.[1] ?? '';
    const name = head.replace(/(✅|⬜|❌)\s*$/, '').trim();
    const one = lines.find((l) => l.startsWith('- **Steps:** '))?.replace('- **Steps:** ', '');
    const steps = one ? [one] : lines.filter((l) => /^\s+\d+\. /.test(l)).map((l) => l.replace(/^\s+\d+\. /, ''));
    return { name, mark, steps };
  });
}

describe('brain break content', () => {
  it('loads every vetted break not marked ❌ (⬜ counts as included), with the steps word for word', () => {
    const list = vetted();
    expect(list.length).toBe(37);
    const wanted = list.filter((b) => b.mark !== '❌');
    expect(BRAIN_BREAKS.map((b) => b.name)).toEqual(wanted.map((b) => b.name));
    for (const w of wanted) {
      const b = BRAIN_BREAKS.find((x) => x.name === w.name)!;
      expect(b.steps).toEqual(w.steps);
    }
    expect(list.filter((b) => b.mark === '❌').every((x) => !BRAIN_BREAKS.some((b) => b.name === x.name))).toBe(true);
  });

  it('gives every subject and any-subject break numbered steps with words to say, and a label for every link', () => {
    for (const b of BRAIN_BREAKS.filter((x) => x.type === 'perk')) {
      expect(b.steps.length, b.id).toBeGreaterThanOrEqual(3);
      expect(b.steps.some((st) => st.includes('Say: ')), b.id).toBe(true);
    }
    expect(BRAIN_BREAKS.filter((b) => b.link).every((b) => b.linkLabel)).toBe(true);
    expect(BRAIN_BREAKS.filter((b) => b.group === GENERAL_GROUP).length).toBeGreaterThanOrEqual(5);
  });

  it('uses the six groups and two types', () => {
    const groups = new Set(BREAK_GROUPS.map((g) => g.id));
    expect(BRAIN_BREAKS.every((b) => groups.has(b.group))).toBe(true);
    expect(BRAIN_BREAKS.filter((b) => b.group === 'calm').every((b) => b.type === 'calm')).toBe(true);
    expect(BRAIN_BREAKS.filter((b) => b.group !== 'calm').every((b) => b.type === 'perk')).toBe(true);
  });
});

describe('picking a break', () => {
  const all = availableBreaks();
  const groups = subjectGroups(all);

  it('opens the class subject by default', () => {
    expect(groupForSubject('Geography', groups)).toBe('geography');
    expect(groupForSubject('Year 9 History', groups)).toBe('history');
    expect(groupForSubject('Economics', groups)).toBe('economics-business');
    expect(groupForSubject('Civics and Citizenship', groups)).toBe('civics');
    expect(groupForSubject('Maths', groups)).toBeUndefined();
    expect(groupForSubject(undefined, groups)).toBeUndefined();
  });

  it('sends a subject with no breaks of its own straight to an any-subject break', () => {
    expect(startGroup('Geography', groups)).toBe('geography');
    expect(startGroup('Year 8 Maths', groups)).toBe(GENERAL_GROUP);
    expect(startGroup(undefined, groups)).toBe(GENERAL_GROUP);
    const noGeneral = availableBreaks([], BRAIN_BREAKS.filter((b) => b.group === GENERAL_GROUP).map((b) => b.id));
    const left = subjectGroups(noGeneral).filter((g) => noGeneral.some((b) => b.group === g.id));
    expect(startGroup('Maths', left)).toBeUndefined();
  });

  it('filters by year level and falls back to the whole subject when nothing matches', () => {
    expect(yearsInclude('7–10', 8)).toBe(true);
    expect(yearsInclude('8–12', 7)).toBe(false);
    expect(yearsInclude('Any', 3)).toBe(true);
    const y11 = breaksFor(all, 'geography', 'Year 11').map((b) => b.id);
    expect(y11).toContain('worldle');
    expect(y11).not.toContain('globle');
    expect(breaksFor(all, 'civics', 'Year 12').map((b) => b.id)).toEqual(['agree-disagree-line', 'mini-parliament']);
    expect(breaksFor(all, 'civics', 'Year 5')).toHaveLength(5);
    expect(breaksFor(all, 'geography', undefined)).toHaveLength(6);
  });

  it('the roll lands on a break in the group, and tap-to-skip shows that same break', () => {
    const list = breaksFor(all, 'calm');
    const chosen = pickBreak(list, new Set(), undefined, () => 0.5)!;
    expect(chosen.group).toBe('calm');
    const plan = planRoll(list.map((b) => b.name), chosen.name, { animate: true }, Math.random);
    expect(rollResult(plan)).toBe(chosen.name);
    expect(plan.reel.every((name) => list.some((b) => b.name === name))).toBe(true);
  });

  it('shows a tap-to-open link for breaks with a website, and the calm rule for calm breaks', () => {
    const globle = all.find((b) => b.id === 'globle')!;
    expect(instructionParts(globle, all).openGame).toBe('https://globle-game.com/');
    expect(instructionParts(globle, all).openLabel).toBe('Open Globle');
    expect(instructionParts({ ...globle, linkLabel: undefined }, all).openLabel).toBe('Open game');
    expect(instructionParts(all.find((b) => b.id === 'country-chain')!, all).openGame).toBeUndefined();
    const calm = instructionParts(all.find((b) => b.id === 'long-exhale')!, all);
    expect(calm.calmRule).toBe('Joining in is invited, never forced. Eyes closed is optional. No touching.');
    expect(calm.needs).toBe('Nothing needed');
    expect(calm.steps[0].say).toBe('"Feet flat, hands in your lap. Close your eyes, or look down at your desk."');
    // "Same as another break" brings that break's steps with it (used by custom breaks).
    expect(instructionParts({ ...globle, steps: ['Same as TimeGuessr.'], stepsFrom: 'timeguessr' }, all).steps).toHaveLength(6);
  });

  it('Spin again never repeats the break just shown', () => {
    const list = breaksFor(all, 'calm');
    for (let i = 0; i < 50; i++) {
      const r = (i % 10) / 10;
      expect(pickBreak(list, new Set(), 'box-breathing', () => r)!.id).not.toBe('box-breathing');
    }
  });

  it('avoids breaks from the last 3 lessons, unless every break has been used', () => {
    const lessons: Lesson[] = [1, 2, 3, 4].map((i) => ({ id: `L${i}`, classId: 'c', date: `2026-10-0${i}`, openedAt: i, status: 'closed', createdAt: i }));
    const log = (lessonId: string, breakId: string): BrainBreakLog => ({ id: `${lessonId}-${breakId}`, classId: 'c', lessonId, date: '2026-10-01', breakId, name: breakId, type: 'calm', group: 'calm', at: 0 });
    const logs = [log('L1', 'long-exhale'), log('L2', 'box-breathing'), log('L3', 'five-finger'), log('L4', 'grounding-54321')];
    const recent = recentBreakIds(logs, lessons, 'c');
    expect([...recent].sort()).toEqual(['box-breathing', 'five-finger', 'grounding-54321']);
    const list = breaksFor(all, 'calm');
    for (const r of [0, 0.3, 0.6, 0.99]) expect(recent.has(pickBreak(list, recent, undefined, () => r)!.id)).toBe(false);
    // All used: any of them (still not the one just shown).
    const every = new Set(list.map((b) => b.id));
    expect(pickBreak(list, every, 'long-exhale', () => 0)!.id).not.toBe('long-exhale');
  });

  it('never shows hidden breaks, and includes the teacher\'s own', () => {
    const mine: BrainBreak = { id: 'custom-1', name: 'Word ladder', group: 'english', type: 'perk', years: '7–8', minutes: '3', resources: [], steps: ['Say: "Go!"'] };
    const list = availableBreaks([mine], ['globle', 'worldle']);
    expect(list.some((b) => b.id === 'globle' || b.id === 'worldle')).toBe(false);
    expect(list.find((b) => b.id === 'custom-1')?.custom).toBe(true);
    expect(subjectGroups(list).map((g) => g.id)).toContain('english');
    expect(groupForSubject('English', subjectGroups(list))).toBe('english');
  });
});

describe('saving', () => {
  it('saves with the lesson, shows in the timeline and in the exports', async () => {
    const c = await svc.createClass({ name: '9 Geography', subject: 'Geography', yearLevel: 'Year 9' });
    const s = await svc.addStudent(c.id, { firstName: 'Ava', lastName: 'Test' });
    const l = await svc.openLesson(c.id);
    await svc.logAllGood({ studentId: s.id, classId: c.id, date: today(), lessonId: l.id });
    const b = BRAIN_BREAKS.find((x) => x.id === 'long-exhale')!;
    const row = await svc.logBrainBreak(l, b);
    await svc.setBreakHelped(row.id, 'yes');
    expect(await db.brainBreaks.get(row.id)).toMatchObject({ lessonId: l.id, classId: c.id, breakId: 'long-exhale', type: 'calm', helped: 'yes' });
    const t = studentTimeline({ lessons: await db.lessons.toArray(), checkins: await db.checkins.toArray(), observations: [], tags: [], homework: [], coldCalls: [], brainBreaks: await db.brainBreaks.toArray(), studentId: s.id });
    expect(t[0].text).toContain('Brain break: Long-exhale breathing (calm) 👍');
    expect(brainBreakText({ name: 'Globle', type: 'perk' })).toBe('Brain break: Globle (perk up)');
    const r = await buildExport({ kind: 'class', classIds: [c.id], categoryIds: [], includeNotes: true, includeIcp: true, deidentify: false, hideClassNames: false });
    expect(r.sheets.find((x) => x.name === 'Brain breaks')!.rows[1]).toMatchObject(['9 Geography', 'Year 9', expect.any(String), expect.any(String), 'Long-exhale breathing', 'Calm', 'calm', 'Yes']);
    expect(await buildSqlScript({ deidentify: false })).toContain('long-exhale');
  });
});
