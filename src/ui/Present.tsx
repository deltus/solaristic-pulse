// Present: a clean, full-screen page for the classroom board. A big title, an optional body and an
// optional countdown. Seating uses it now; exit tickets and brain breaks can use it later.
// Only put things students may see here: no needs, levels, tags or reasons.

import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Icon } from './components';

/** A phone or small tablet (touch screen, narrow): Present opens in place, full screen. */
export const isPhone = () => !!window.matchMedia?.('(pointer: coarse)').matches && Math.min(window.innerWidth, window.innerHeight) < 820;

const canFullScreen = () => !!document.documentElement.requestFullscreen;
export function enterFullScreen() {
  if (canFullScreen() && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => undefined);
}

/**
 * Opens a Present page. On a computer: a new browser window (to drag onto the board).
 * On a phone: the same tab, full screen. Call from a tap so the browser allows it.
 */
export function openPresent(hash: string) {
  if (!isPhone()) {
    const w = window.open(`${location.pathname}${location.search}${hash}`, '_blank', 'popup,width=1280,height=800');
    if (w) return;
  }
  enterFullScreen();
  location.hash = hash;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function Present({ title, body, countdown, children, closeHref, footer }: {
  title: string;
  body?: ComponentChildren;
  /** Seconds to count down from. */
  countdown?: number;
  children?: ComponentChildren;
  /** Where Close goes. In a window Present opened, Close closes the window instead. */
  closeHref: string;
  /** Small text under the page (e.g. how to show it on the board), shown only on this device. */
  footer?: ComponentChildren;
}) {
  const [left, setLeft] = useState(countdown);
  const [full, setFull] = useState(!!document.fullscreenElement);
  useEffect(() => { document.body.classList.add('projector-mode'); return () => document.body.classList.remove('projector-mode'); }, []);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  useEffect(() => {
    if (countdown === undefined) return;
    setLeft(countdown);
    const t = setInterval(() => setLeft((x) => (x === undefined || x <= 0 ? 0 : x - 1)), 1000);
    return () => clearInterval(t);
  }, [countdown]);
  const popup = !!window.opener;
  function close(e: Event) {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    if (popup) { e.preventDefault(); window.close(); }
  }
  return (
    <div class="present">
      <div class="present-head">
        <h1 class="present-title">{title}</h1>
        {left !== undefined && <span class={`present-count ${left === 0 ? 'done' : ''}`} role="timer">{mmss(left)}</span>}
        <span class="present-tools">
          {canFullScreen() && <button class="btn small" onClick={() => (full ? document.exitFullscreen() : enterFullScreen())}>{full ? 'Exit full screen' : 'Full screen'}</button>}
          <a class="btn small" href={closeHref} onClick={close}><Icon name="x" /> Close</a>
        </span>
      </div>
      {body && <div class="present-body">{body}</div>}
      {children}
      {footer && <div class="present-foot tiny muted">{footer}</div>}
    </div>
  );
}
