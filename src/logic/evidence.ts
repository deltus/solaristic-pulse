// When to ask for ICP evidence (for learning support meetings).
// Each adjustment a student has is its own evidence type: ask the first time it's recorded,
// then again once a month has passed since the last evidence for it.

import type { EvidenceItem, EvidenceKind, IcpAdjustment, IcpCheck } from '../types';
import { daysBetween, formatShort, parseISODate, toISODate } from '../lib/dates';

export const EVIDENCE_KINDS: { value: EvidenceKind; label: string }[] = [
  { value: 'photo', label: 'Photo' },
  { value: 'file', label: 'File' },
  { value: 'note', label: 'Note' },
  { value: 'voice', label: 'Voice memo' }
];

export function addMonths(s: string, n: number): string {
  const d = parseISODate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toISODate(d);
}

export interface EvidenceDue {
  due: boolean;
  /** Why we're asking, e.g. "No evidence yet" or "5 weeks since the last evidence". */
  reason: string;
  /** Short status for the student's ICP page, e.g. "Next 24 Nov". */
  label: string;
  last?: string;
}

function since(last: string, today: string): string {
  const n = daysBetween(last, today);
  if (n < 14) return `${n} day${n === 1 ? '' : 's'}`;
  if (n < 60) return `${Math.round(n / 7)} weeks`;
  return `${Math.round(n / 30)} months`;
}

/** On unless turned off for this adjustment. */
export const evidenceOn = (adj: IcpAdjustment) => adj.evidence?.enabled !== false;

export function evidenceDue(
  adj: IcpAdjustment, items: Pick<EvidenceItem, 'adjustmentId' | 'date'>[], checks: Pick<IcpCheck, 'adjustmentId'>[], today: string
): EvidenceDue {
  const last = items.filter((i) => i.adjustmentId === adj.id).map((i) => i.date).sort().pop();
  if (!evidenceOn(adj) || !adj.active || adj.startDate > today || (adj.endDate && adj.endDate < today)) return { due: false, reason: '', label: '', last };
  // Not until the adjustment has been recorded at least once.
  if (!checks.some((c) => c.adjustmentId === adj.id)) return { due: false, reason: '', label: last ? '' : 'No evidence yet', last };
  const snoozed = !!adj.evidence?.snoozedUntil && adj.evidence.snoozedUntil > today;
  const next = last ? addMonths(last, 1) : today;
  const due = next <= today && !snoozed;
  const reason = last ? `It's been ${since(last, today)} since evidence for this was added.` : 'You have no evidence for this yet.';
  const label = due ? (last ? `${since(last, today)} since last` : 'No evidence yet') : `Next ${formatShort(snoozed && adj.evidence!.snoozedUntil! > next ? adj.evidence!.snoozedUntil! : next)}`;
  return { due, reason, label, last };
}

