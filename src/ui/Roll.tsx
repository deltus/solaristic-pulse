// A prize-wheel style roll: items roll past, slow down and land on one that was chosen beforehand.
// Tap anywhere on it to jump straight to the landed item. Used by Cold call (and brain breaks).
// Big text and a clear landing highlight, so it works on a projector.

import { useEffect, useRef, useState } from 'preact/hooks';
import { rollResult, type RollPlan } from '../logic/coldcall';
import { haptic } from './Swipe';

const ROW = 76;

export function Roll({ plan, onLanded, skip = 0, label = 'Tap to show now' }: { plan: RollPlan; onLanded: (item: string) => void; /** Change this to jump to the landed item (a tap elsewhere on the screen). */ skip?: number; label?: string }) {
  const [moving, setMoving] = useState(false);
  const [landed, setLanded] = useState(plan.total === 0);
  const fired = useRef(false);
  // The landed row sits in the middle of three visible rows.
  const end = -(plan.landIndex - 1) * ROW;

  function land() {
    if (fired.current) return;
    fired.current = true;
    setLanded(true);
    haptic(15);
    onLanded(rollResult(plan));
  }
  useEffect(() => {
    if (plan.total === 0) { land(); return; }
    // Start on the next frame so the transition runs from the top of the reel.
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setMoving(true)));
    const t = setTimeout(land, plan.total + 50);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [plan]);
  useEffect(() => { if (skip) land(); }, [skip]);

  const style = landed
    ? { transform: `translateY(${end}px)`, transition: 'none' }
    : { transform: `translateY(${moving ? end : ROW}px)`, transition: moving ? `transform ${plan.total}ms cubic-bezier(0.12, 0.75, 0.15, 1)` : 'none' };
  return (
    <div class={`roll ${landed ? 'landed' : ''}`} role="button" aria-live="polite" aria-label={landed ? rollResult(plan) : label} onClick={land}>
      <div class="roll-window" style={{ height: `${ROW * 3}px` }}>
        <div class="roll-strip" style={style}>
          {plan.reel.map((n, i) => <div key={i} class={`roll-item ${landed && i === plan.landIndex ? 'hit' : ''}`} style={{ height: `${ROW}px` }}>{n}</div>)}
        </div>
        <div class="roll-marker" style={{ top: `${ROW}px`, height: `${ROW}px` }} aria-hidden="true" />
      </div>
      {!landed && <span class="tiny muted roll-skip">{label}</span>}
    </div>
  );
}
