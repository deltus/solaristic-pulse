import type { Student } from '../types';

export function fullName(s: Pick<Student, 'firstName' | 'lastName' | 'preferredName'>): string {
  return `${s.preferredName || s.firstName} ${s.lastName}`.trim();
}

/** Stable pseudonyms (Student 001, 002 …) ordered by surname, first name, id. */
export function pseudonymMap(students: Student[]): Map<string, string> {
  const sorted = [...students].sort(
    (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || a.id.localeCompare(b.id)
  );
  const width = Math.max(3, String(sorted.length).length);
  return new Map(sorted.map((s, i) => [s.id, `Student ${String(i + 1).padStart(width, '0')}`]));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (term: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}(?![\\p{L}\\p{N}])`, 'giu');

export interface Scrubber {
  (text: string | undefined): string;
}

/**
 * Builds a function that replaces student names (full names first, then individual
 * first/last/preferred names and school IDs) with pseudonyms. A name shared by several
 * students becomes "[name]". `extraTerms` (e.g. teacher or school name) become "[redacted]".
 */
export function makeScrubber(students: Student[], pseudonyms: Map<string, string>, extraTerms: string[] = []): Scrubber {
  const replacements: { re: RegExp; to: string; len: number }[] = [];
  const single = new Map<string, Set<string>>();

  for (const s of students) {
    const p = pseudonyms.get(s.id) ?? '[student]';
    const fulls = new Set([`${s.firstName} ${s.lastName}`, s.preferredName ? `${s.preferredName} ${s.lastName}` : '']);
    for (const f of fulls) if (f.trim().length > 2) replacements.push({ re: wordRe(f), to: p, len: f.length });
    for (const t of [s.firstName, s.lastName, s.preferredName, s.externalId]) {
      if (!t || t.trim().length < 2) continue;
      const k = t.trim().toLowerCase();
      if (!single.has(k)) single.set(k, new Set());
      single.get(k)!.add(p);
    }
  }
  for (const [term, ps] of single) {
    replacements.push({ re: wordRe(term), to: ps.size === 1 ? [...ps][0] : '[name]', len: term.length });
  }
  for (const t of extraTerms) if (t && t.trim().length > 2) replacements.push({ re: wordRe(t.trim()), to: '[redacted]', len: t.length });
  // Longest first so "Ethan Taylor" is replaced before "Ethan".
  replacements.sort((a, b) => b.len - a.len);

  return (text) => {
    if (!text) return '';
    let out = text;
    for (const r of replacements) out = out.replace(r.re, r.to);
    return out;
  };
}
