// Brain break picking: which group a class starts on, the year-level filter, and a fair random
// pick that avoids breaks used in this class's last 3 lessons (unless every one has been used)
// and never repeats the break just shown.

import type { BrainBreakLog, Lesson } from '../types';
import { BRAIN_BREAKS, BREAK_GROUPS, CALM_RULE, SUBJECT_WORDS, type BrainBreak } from '../config/brainBreaks';

export const RECENT_LESSONS = 3;

/** Built-in breaks plus the teacher's own, minus hidden ones. */
export function availableBreaks(custom: BrainBreak[] = [], hidden: string[] = []): BrainBreak[] {
  return [...BRAIN_BREAKS, ...custom.map((c) => ({ ...c, custom: true }))].filter((b) => !hidden.includes(b.id));
}

export const slug = (s: string) => s.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Subject groups (not Calm), including any new subject a custom break added. */
export function subjectGroups(breaks: BrainBreak[]): { id: string; label: string }[] {
  const known = BREAK_GROUPS.filter((g) => g.id !== 'calm');
  const extra = [...new Set(breaks.map((b) => b.group))].filter((g) => g !== 'calm' && !known.some((k) => k.id === g))
    .map((g) => ({ id: g, label: breaks.find((b) => b.group === g && b.custom)?.group.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) ?? g }));
  return [...known, ...extra];
}

/** The group that matches a class's subject field ("Year 9 Geography" → geography), if any. */
export function groupForSubject(subject: string | undefined, groups: { id: string; label: string }[]): string | undefined {
  if (!subject?.trim()) return undefined;
  const s = subject.toLowerCase();
  const words = s.split(/[^a-z]+/).filter(Boolean);
  for (const g of groups) {
    const names = [...(SUBJECT_WORDS[g.id] ?? []), g.label.toLowerCase(), g.id.replace(/-/g, ' ')];
    if (names.some((n) => (n.includes(' ') ? s.includes(n) : words.includes(n)))) return g.id;
  }
  return undefined;
}

/** "Year 9" / "9" / "Yr 9" → 9. */
export function yearNumber(yearLevel?: string): number | null {
  const m = yearLevel?.match(/(\d{1,2})/);
  return m ? Number(m[1]) : null;
}

/** Does "7–10" (or "7-10", "8", "Any") include this year? */
export function yearsInclude(years: string, year: number): boolean {
  const m = years.match(/(\d{1,2})\s*[–-]\s*(\d{1,2})/);
  if (m) return year >= Number(m[1]) && year <= Number(m[2]);
  const one = years.match(/^\s*(\d{1,2})\s*$/);
  return one ? Number(one[1]) === year : true;
}

/** Breaks in a group, filtered to the class's year level; all of the group if none match. */
export function breaksFor(breaks: BrainBreak[], group: string, yearLevel?: string): BrainBreak[] {
  const inGroup = breaks.filter((b) => b.group === group);
  const y = yearNumber(yearLevel);
  if (y === null) return inGroup;
  const fit = inGroup.filter((b) => yearsInclude(b.years, y));
  return fit.length ? fit : inGroup;
}

/** Break ids this class used in its last few lessons (the current one included). */
export function recentBreakIds(logs: BrainBreakLog[], lessons: Lesson[], classId: string, n = RECENT_LESSONS): Set<string> {
  const used = new Set(logs.filter((l) => l.classId === classId).map((l) => l.lessonId));
  const last = lessons.filter((l) => l.classId === classId && used.has(l.id)).sort((a, b) => b.openedAt - a.openedAt).slice(0, n).map((l) => l.id);
  // Logs whose lesson record is missing still count by date order.
  const orphan = logs.filter((l) => l.classId === classId && !lessons.some((x) => x.id === l.lessonId)).sort((a, b) => b.at - a.at);
  const ids = new Set([...last, ...orphan.map((l) => l.lessonId)].slice(0, n));
  return new Set(logs.filter((l) => ids.has(l.lessonId)).map((l) => l.breakId));
}

/**
 * Random pick: never the break just shown (if there's another), and not one used in the last
 * 3 lessons unless every break in the list has been.
 */
export function pickBreak(list: BrainBreak[], recent: Set<string>, lastShown: string | undefined, random: () => number): BrainBreak | undefined {
  const notLast = list.length > 1 ? list.filter((b) => b.id !== lastShown) : list;
  const fresh = notLast.filter((b) => !recent.has(b.id));
  const pool = fresh.length ? fresh : notLast;
  return pool.length ? pool[Math.floor(random() * pool.length)] : undefined;
}

/** "Brain break: Long-exhale breathing (calm) 👍" */
export function brainBreakText(l: Pick<BrainBreakLog, 'name' | 'type' | 'helped'>): string {
  return `Brain break: ${l.name} (${l.type === 'calm' ? 'calm' : 'perk up'})${l.helped === 'yes' ? ' 👍' : l.helped === 'no' ? ' 👎' : ''}`;
}

/** "Say:" lines are words to read aloud: split them out so they can be styled. */
export function splitSay(step: string): { before: string; say: string | null } {
  const i = step.indexOf('Say: ');
  return i < 0 ? { before: step, say: null } : { before: step.slice(0, i), say: step.slice(i + 5) };
}

/** What the instructions screen shows for a break. */
export function instructionParts(b: BrainBreak, all: BrainBreak[]) {
  const from = b.stepsFrom ? all.find((x) => x.id === b.stepsFrom) : undefined;
  return {
    needs: b.resources.length ? `You'll need: ${b.resources.join('; ')}` : 'Nothing needed',
    optional: b.resourcesOptional,
    steps: [...b.steps, ...(from?.steps ?? [])].map(splitSay),
    openGame: b.link,
    calmRule: b.type === 'calm' ? CALM_RULE : undefined
  };
}
