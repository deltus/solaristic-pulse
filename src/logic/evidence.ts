// When to ask for ICP evidence (for learning support meetings).

import type { EvidenceInterval, EvidenceItem, EvidenceKind, IcpAdjustment } from '../types';
import { addDays, daysBetween, formatShort } from '../lib/dates';

export const EVIDENCE_INTERVALS: { value: EvidenceInterval; label: string; days: number }[] = [
  { value: 'weekly', label: 'Weekly', days: 7 },
  { value: 'fortnightly', label: 'Fortnightly', days: 14 },
  { value: 'monthly', label: 'Monthly', days: 30 },
  { value: 'termly', label: 'Once a term', days: 70 },
  { value: 'date', label: 'Before a meeting', days: 0 }
];

export const EVIDENCE_KINDS: { value: EvidenceKind; label: string }[] = [
  { value: 'photo', label: 'Photo' },
  { value: 'file', label: 'File' },
  { value: 'note', label: 'Note' },
  { value: 'voice', label: 'Voice memo' }
];

/** For a meeting date, the prompt shows from this many days before. */
export const MEETING_LEAD_DAYS = 7;

export interface EvidenceDue {
  due: boolean;
  /** e.g. "Due", "Next 12 Nov", "Meeting Fri 7 Nov". */
  label: string;
  last?: string;
}

export function evidenceDue(adj: IcpAdjustment, items: Pick<EvidenceItem, 'adjustmentId' | 'date'>[], today: string): EvidenceDue {
  const plan = adj.evidence;
  if (!plan?.enabled || !adj.active || adj.startDate > today || (adj.endDate && adj.endDate < today)) return { due: false, label: '' };
  const last = items.filter((i) => i.adjustmentId === adj.id).map((i) => i.date).sort().pop();
  const snoozed = !!plan.snoozedUntil && plan.snoozedUntil > today;

  if (plan.interval === 'date') {
    if (!plan.dueDate) return { due: false, label: '', last };
    const from = addDays(plan.dueDate, -MEETING_LEAD_DAYS);
    const collected = !!last && last >= from;
    const inWindow = today >= from && today <= plan.dueDate;
    const label = today > plan.dueDate ? `Meeting was ${formatShort(plan.dueDate)}` : `Meeting ${formatShort(plan.dueDate)}`;
    return { due: inWindow && !collected && !snoozed, label: collected ? `${label} · collected` : label, last };
  }

  const days = EVIDENCE_INTERVALS.find((x) => x.value === plan.interval)!.days;
  const nextDate = last ? addDays(last, days) : adj.startDate;
  const due = daysBetween(nextDate, today) >= 0 && !snoozed;
  return { due, label: due ? 'Due' : `Next ${formatShort(snoozed && plan.snoozedUntil! > nextDate ? plan.snoozedUntil! : nextDate)}`, last };
}
