// "← Previous" on the swipe screens (check-in, homework, tickets, assessment, cold call): go back to
// the last student answered on this visit, take that answer back, and answer again.

import { useRef, useState } from 'preact/hooks';
import { dropStep, lastStep, pushStep, type PrevStep } from '../logic/previous';
import { Icon } from './components';

export function usePrevious() {
  const [stack, setStack] = useState<PrevStep[]>([]);
  const ref = useRef(stack);
  ref.current = stack;
  const busy = useRef(false);
  return {
    last: lastStep(stack),
    push: (studentId: string, undo: () => Promise<unknown>) => setStack((s) => pushStep(s, { studentId, undo })),
    drop: (studentId: string) => setStack((s) => dropStep(s, studentId)),
    /** Takes back the newest answer; resolves to that student's id (null if there's nothing to go back to). */
    async back(): Promise<string | null> {
      const step = lastStep(ref.current);
      if (!step || busy.current) return null;
      busy.current = true;
      try {
        setStack((s) => dropStep(s, step.studentId));
        await step.undo();
        return step.studentId;
      } finally {
        busy.current = false;
      }
    }
  };
}
export type Previous = ReturnType<typeof usePrevious>;

/** "← Previous: Mia". Hidden until someone has been answered on this visit. */
export function PreviousButton({ prev, name, onBack }: { prev: Previous; name?: (studentId: string) => string; onBack: (studentId: string) => void }) {
  if (!prev.last) return null;
  const who = name?.(prev.last.studentId);
  return (
    <button class="link-btn prev-btn" onClick={async () => { const id = await prev.back(); if (id) onBack(id); }}>
      <Icon name="back" /> Previous{who ? `: ${who}` : ''}
    </button>
  );
}
