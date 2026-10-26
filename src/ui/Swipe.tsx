// A card you can swipe: towards "good" (right by default), towards "issue" (the other side),
// or up to skip. Buttons and arrow keys do the same through `control.fling`.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { SWIPE } from '../config/checkin';

export type SwipeAction = 'good' | 'issue' | 'up';
export interface SwipeControl { fling: (a: SwipeAction) => void }

const THRESHOLD_X = 90;
const THRESHOLD_UP = 80;
const FLY_MS = 200;

/** Screen side for an action ("good" is on SWIPE.goodDirection). */
export const sideOf = (a: 'good' | 'issue'): 'left' | 'right' => (a === 'good') === (SWIPE.goodDirection === 'right') ? 'right' : 'left';
const actionFor = (side: 'left' | 'right'): 'good' | 'issue' => (side === sideOf('good') ? 'good' : 'issue');

export function SwipeCard({ onSwipe, children, labels, allow = ['good', 'issue', 'up'], keyboard = true, control, class: cls = '' }: {
  onSwipe: (a: SwipeAction) => void;
  children: ComponentChildren;
  labels?: Partial<Record<SwipeAction, string>>;
  allow?: SwipeAction[];
  keyboard?: boolean;
  control?: { current: SwipeControl | null };
  class?: string;
}) {
  const [d, setD] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(false);
  const [out, setOut] = useState<SwipeAction | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const done = useRef(false);

  function fling(a: SwipeAction) {
    if (done.current || !allow.includes(a)) return;
    done.current = true;
    setOut(a);
    navigator.vibrate?.(a === 'good' ? 12 : 8);
    setTimeout(() => onSwipe(a), FLY_MS);
  }
  if (control) control.current = { fling };

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;
      const a = e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowRight' ? actionFor('right') : e.key === 'ArrowLeft' ? actionFor('left') : null;
      if (a) { e.preventDefault(); fling(a); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const release = () => {
    if (!start.current) return;
    start.current = null;
    setDrag(false);
    if (d.y < -THRESHOLD_UP && Math.abs(d.y) > Math.abs(d.x) && allow.includes('up')) return fling('up');
    if (Math.abs(d.x) > THRESHOLD_X) {
      const a = actionFor(d.x > 0 ? 'right' : 'left');
      if (allow.includes(a)) return fling(a);
    }
    setD({ x: 0, y: 0 });
  };

  const outX = out === 'good' || out === 'issue' ? (sideOf(out) === 'right' ? 1 : -1) * 520 : 0;
  const style = out
    ? { transform: `translate(${outX}px, ${out === 'up' ? -600 : 0}px) rotate(${outX / 40}deg)`, opacity: 0, transition: `transform ${FLY_MS}ms ease-in, opacity ${FLY_MS}ms ease-in` }
    : { transform: `translate(${d.x}px, ${Math.min(0, d.y)}px) rotate(${d.x / 24}deg)`, transition: drag ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)' };
  const hint = Math.abs(d.x) > 24 ? actionFor(d.x > 0 ? 'right' : 'left') : d.y < -24 ? 'up' : null;
  const strength = Math.min(1, Math.max(Math.abs(d.x) / THRESHOLD_X, -d.y / THRESHOLD_UP));

  return (
    <div
      class={`swipe-card ${cls}`}
      style={style}
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, textarea, select, label')) return;
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        setDrag(true);
      }}
      onPointerMove={(e) => start.current && setD({ x: e.clientX - start.current.x, y: e.clientY - start.current.y })}
      onPointerUp={release}
      onPointerCancel={release}
    >
      {hint && allow.includes(hint) && labels?.[hint] && (
        <span class={`swipe-stamp ${hint}`} style={{ opacity: strength }} aria-hidden="true">{labels[hint]}</span>
      )}
      {children}
    </div>
  );
}
