// Half-dial from 0% (left) to 100% (right) in three zones, on an uneven scale: 0 at the far left,
// 50 a quarter of the way round, 75 at the top, 90 three quarters round, 100 at the far right
// (see DIAL_STOPS). No needle until the teacher taps or drags; arrow keys work too.

import { useRef, useState } from 'preact/hooks';
import { clampPct, dialToPct, DIAL_TICKS, pctToDial, ZONES, zoneFor } from '../logic/checkout';

const CX = 130, CY = 128, R = 100, W = 20;
export const ZONE_COLOUR = { low: 'var(--sig)', mixed: 'var(--some)', focused: 'var(--ok)' };
/** Where the arrow keys start from when nothing is set yet. */
const KEY_START = 75;

const point = (pct: number, r = R) => {
  const t = Math.PI * (1 - pctToDial(pct));
  return [CX + r * Math.cos(t), CY - r * Math.sin(t)];
};
const arc = (from: number, to: number) => {
  const [x1, y1] = point(from), [x2, y2] = point(to);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
};

export function Speedometer({ value, onChange, label }: { value: number | null; onChange: (v: number) => void; label: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const zone = value === null ? null : zoneFor(value);

  function fromPointer(e: PointerEvent) {
    const box = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 260;
    const y = ((e.clientY - box.top) / box.height) * 142;
    if (y > CY) return onChange(x < CX ? 0 : 100);
    onChange(dialToPct(1 - Math.atan2(CY - y, x - CX) / Math.PI));
  }

  return (
    <svg
      ref={svg}
      class={`speedo ${dragging ? 'dragging' : ''} ${value === null ? 'unset' : ''}`}
      viewBox="0 0 260 142"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      aria-valuetext={value === null ? 'Not set: tap the dial' : `${value}%, ${zone!.label}`}
      onPointerDown={(e) => { try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* not a capturable pointer */ } setDragging(true); fromPointer(e); }}
      onPointerMove={(e) => dragging && fromPointer(e)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(e) => {
        const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key];
        if (step) { e.preventDefault(); onChange(value === null ? KEY_START : clampPct(value + step)); }
      }}
    >
      {ZONES.map((z) => (
        <path key={z.zone} d={arc(z.from, z.to === 100 ? 100 : z.to + 1)} fill="none" stroke={ZONE_COLOUR[z.zone]} stroke-width={W}
          opacity={zone === null ? 0.45 : z.zone === zone.zone ? 1 : 0.22} class="speedo-zone" />
      ))}
      {DIAL_TICKS.map((p) => {
        const [x, y] = point(p, R + W / 2 + 10);
        return <text key={p} x={x} y={y + 4} text-anchor="middle" class="speedo-tick">{p}</text>;
      })}
      {value !== null && (
        <g class="speedo-needle" style={{ transform: `rotate(${pctToDial(value) * 180}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
          <line x1={CX} y1={CY} x2={CX - R + 14} y2={CY} stroke="var(--ink)" stroke-width="4" stroke-linecap="round" />
        </g>
      )}
      <circle cx={CX} cy={CY} r="9" fill={value === null ? 'var(--line-strong)' : 'var(--ink)'} />
    </svg>
  );
}
