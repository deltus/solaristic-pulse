// A card you can swipe: towards "good" (right by default), towards "issue" (the other side),
// or up to skip. Buttons and arrow keys do the same through `control.fling`.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { SWIPE } from '../config/checkin';
import { decideSwipe, SWIPE_DISTANCE } from '../logic/swipe';

export type SwipeAction = 'good' | 'issue' | 'up';
export interface SwipeControl { fling: (a: SwipeAction) => void }

const FLY_MS = 200;
/** Movement before a press becomes a drag (smaller than this is a tap). */
const DRAG_START = 8;

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
  const start = useRef<{ x: number; y: number; t: number; dragging: boolean } | null>(null);
  const moved = useRef(false);
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

  const release = (e: PointerEvent) => {
    const st = start.current;
    if (!st) return;
    start.current = null;
    setDrag(false);
    if (!st.dragging) return;
    const dir = decideSwipe(e.clientX - st.x, e.clientY - st.y, performance.now() - st.t);
    const a = dir === 'up' ? 'up' : dir ? actionFor(dir) : null;
    if (a && allow.includes(a)) return fling(a);
    setD({ x: 0, y: 0 });
  };

  const outX = out === 'good' || out === 'issue' ? (sideOf(out) === 'right' ? 1 : -1) * 520 : 0;
  const style = out
    ? { transform: `translate(${outX}px, ${out === 'up' ? -600 : 0}px) rotate(${outX / 40}deg)`, opacity: 0, transition: `transform ${FLY_MS}ms ease-in, opacity ${FLY_MS}ms ease-in` }
    : { transform: `translate(${d.x}px, ${Math.min(0, d.y)}px) rotate(${d.x / 24}deg)`, transition: drag ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)' };
  const hint = Math.abs(d.x) > 24 ? actionFor(d.x > 0 ? 'right' : 'left') : d.y < -24 ? 'up' : null;
  const strength = Math.min(1, Math.max(Math.abs(d.x), -d.y) / SWIPE_DISTANCE);

  return (
    <div
      class={`swipe-card ${cls}`}
      style={style}
      // A drag can start anywhere on the card, buttons and chips included (a press that doesn't
      // move is still a tap). Only text fields are left alone.
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
        start.current = { x: e.clientX, y: e.clientY, t: performance.now(), dragging: false };
        moved.current = false;
      }}
      onPointerMove={(e) => {
        const st = start.current;
        if (!st) return;
        const x = e.clientX - st.x, y = e.clientY - st.y;
        if (!st.dragging) {
          if (Math.hypot(x, y) < DRAG_START) return;
          st.dragging = true;
          moved.current = true;
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          setDrag(true);
        }
        setD({ x, y });
      }}
      onPointerUp={release}
      onPointerCancel={() => { start.current = null; setDrag(false); setD({ x: 0, y: 0 }); }}
      // After a drag, don't let the button it started on register a tap.
      onClickCapture={(e) => { if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false; } }}
    >
      {hint && allow.includes(hint) && labels?.[hint] && (
        <span class={`swipe-stamp ${hint}`} style={{ opacity: strength }} aria-hidden="true">{labels[hint]}</span>
      )}
      {children}
    </div>
  );
}
