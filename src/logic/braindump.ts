// Brain dump: split free text into short chunks and find the students each one mentions, by
// matching first, preferred and last names against the teacher's rosters. On the device only
// (no AI, no internet). Pure functions, so they are easy to test.

import type { Student } from '../types';

export interface ChunkMatch {
  /** Students this chunk is about. */
  studentIds: string[];
  /** A name that fits more than one student: the teacher picks which. */
  ambiguous: { token: string; options: string[] }[];
}
export interface Chunk extends ChunkMatch { id: string; text: string }

/** Sentences or short chunks: split on new lines, sentence ends and semicolons. */
export function splitChunks(text: string): string[] {
  return text
    .split(/\r?\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+|;\s*/))
    .map((s) => s.trim())
    .filter((s) => /[A-Za-z]/.test(s));
}

const norm = (s?: string) => (s ?? '').trim().toLowerCase();
const names = (s: Student) => [norm(s.firstName), norm(s.preferredName), norm(s.lastName)].filter((n) => n.length > 1);

/**
 * Students named in one chunk. Full names ("Ava Patel") settle it; a single name that fits one
 * student is a match; one that fits several is ambiguous (unless the chunk already named one of
 * them, or only one is in the class the dump was started from). Only capitalised words count, so
 * everyday words ("will", "grace") don't match.
 */
export function findStudents(chunk: string, students: Student[], preferClassId?: string): ChunkMatch {
  const live = students.filter((s) => !s.archived);
  const words = [...chunk.matchAll(/[A-Za-z][A-Za-z'’-]*/g)].map((m) => m[0].replace(/['’]s$/i, ''));
  const used = new Set<number>();
  const found = new Set<string>();
  // Full names first.
  for (let i = 0; i < words.length - 1; i++) {
    const a = norm(words[i]), b = norm(words[i + 1]);
    const hit = live.filter((s) => (norm(s.firstName) === a || norm(s.preferredName) === a) && norm(s.lastName) === b);
    if (hit.length === 1) { found.add(hit[0].id); used.add(i); used.add(i + 1); }
  }
  const ambiguous: ChunkMatch['ambiguous'] = [];
  words.forEach((w, i) => {
    if (used.has(i) || !/^[A-Z]/.test(w)) return;
    const t = norm(w);
    let options = live.filter((s) => names(s).includes(t));
    if (!options.length) return;
    if (options.some((s) => found.has(s.id))) return; // already named in full
    if (options.length > 1 && preferClassId) {
      const here = options.filter((s) => s.classId === preferClassId);
      if (here.length === 1) options = here;
    }
    if (options.length === 1) found.add(options[0].id);
    else if (!ambiguous.some((a) => a.token === t)) ambiguous.push({ token: w, options: options.map((s) => s.id) });
  });
  return { studentIds: [...found], ambiguous };
}

export function sortDump(text: string, students: Student[], preferClassId?: string): Chunk[] {
  return splitChunks(text).map((t, i) => ({ id: `c${i}`, text: t, ...findStudents(t, students, preferClassId) }));
}
