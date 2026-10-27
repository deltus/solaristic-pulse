// A card you can swipe: towards "good" (right by default), towards "issue" (the other side),
// or up to skip. Buttons and arrow keys do the same through `control.fling`.
//
// Saves never wait for the animation: the swipe is reported straight away and a copy of the card
// (a "ghost") flies off on top with a colour wash and icon, so a second swipe during the animation
// simply starts its own.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { SWIPE } from '../config/checkin';
import { decideSwipe, flyPlan, SWIPE_DISTANCE } from '../logic/swipe';
import { useSettings } from './hooks';

export type SwipeAction = 'good' | 'issue' | 'up';
export interface SwipeControl { fling: (a: SwipeAction) => void }

/** Movement before a press becomes a drag (smaller than this is a tap). */
const DRAG_START = 8;
const WASH_ICON: Record<SwipeAction, string> = { good: '✓', issue: '⚑', up: '↑' };

/** Screen side for an action ("good" is on SWIPE.goodDirection). */
export const sideOf = (a: 'good' | 'issue'): 'left' | 'right' => (a === 'good') === (SWIPE.goodDirection === 'right') ? 'right' : 'left';
const actionFor = (side: 'left' | 'right'): 'good' | 'issue' => (side === sideOf('good') ? 'good' : 'issue');

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A light tap on phones that support it (Android). */
export function haptic(ms = 10) {
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
}

/** Copies the card where it is and animates the copy away; the real card is free straight away. */
function flyGhost(el: HTMLElement, a: SwipeAction, animate: boolean) {
  const plan = flyPlan(a, a === 'up' ? null : sideOf(a), { animate, reduceMotion: reducedMotion() });
  const held = el.style.transform;
  el.style.transform = 'none';
  const r = el.getBoundingClientRect();
  el.style.transform = held;
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.classList.add('swipe-ghost');
  Object.assign(ghost.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', transition: 'none' });
  const wash = document.createElement('div');
  wash.className = `swipe-wash ${plan.wash}`;
  wash.innerHTML = `<span>${WASH_ICON[a]}</span>`;
  ghost.appendChild(wash);
  document.body.appendChild(ghost);
  const from = held || 'none';
  const to = plan.style === 'fly'
    ? `translate(${plan.dx * (window.innerWidth + r.width) * 0.75}px, ${plan.dy * (r.bottom + 40)}px) rotate(${plan.rotate}deg)`
    : from;
  const anim = ghost.animate?.(
    [{ transform: from, opacity: 1 }, { transform: from, opacity: 1, offset: plan.style === 'fly' ? 0.15 : 0.5 }, { transform: to, opacity: 0 }],
    { duration: plan.ms * (plan.style === 'fly' ? 1 : 2), easing: 'ease-out', fill: 'forwards' }
  );
  const remove = () => ghost.remove();
  if (anim) anim.onfinish = remove;
  setTimeout(remove, plan.ms * 2 + 200); // in case the animation never reports finishing
}

export function SwipeCard({ onSwipe, children, labels, allow = ['good', 'issue', 'up'], keyboard = true, control, class: cls = '' }: {
  onSwipe: (a: SwipeAction) => void;
  children: ComponentChildren;
  labels?: Partial<Record<SwipeAction, string>>;
  allow?: SwipeAction[];
  keyboard?: boolean;
  control?: { current: SwipeControl | null };
  class?: string;
}) {
  const settings = useSettings();
  const [d, setD] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; t: number; dragging: boolean } | null>(null);
  const moved = useRef(false);

  function fling(a: SwipeAction) {
    if (!allow.includes(a)) return;
    if (ref.current) flyGhost(ref.current, a, settings?.swipeAnimations !== false);
    haptic(a === 'good' ? 12 : 10);
    // The card is back in the middle at once; the parent usually shows the next one.
    setD({ x: 0, y: 0 });
    setDrag(false);
    onSwipe(a);
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
    setD({ x: 0, y: 0 }); // under the threshold: spring back to the centre
  };

  const style = { transform: `translate(${d.x}px, ${Math.min(0, d.y)}px) rotate(${d.x / 24}deg)`, transition: drag ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)' };
  const hint = Math.abs(d.x) > 24 ? actionFor(d.x > 0 ? 'right' : 'left') : d.y < -24 ? 'up' : null;
  const strength = Math.min(1, Math.max(Math.abs(d.x), -d.y) / SWIPE_DISTANCE);

  return (
    <div
      ref={ref}
      class={`swipe-card card-enter ${cls}`}
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
