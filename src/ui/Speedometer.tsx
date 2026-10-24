// Half-dial from 0% (left) to 100% (right) in three zones. Drag the needle, tap the arc,
// or use the arrow keys.

import { useRef, useState } from 'preact/hooks';
import { clampPct, ZONES, zoneFor } from '../logic/checkout';

const CX = 130, CY = 128, R = 100, W = 20;
export const ZONE_COLOUR = { low: 'var(--sig)', mixed: 'var(--some)', focused: 'var(--ok)' };

const point = (pct: number, r = R) => {
  const t = Math.PI * (1 - pct / 100);
  return [CX + r * Math.cos(t), CY - r * Math.sin(t)];
};
const arc = (from: number, to: number) => {
  const [x1, y1] = point(from), [x2, y2] = point(to);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
};

export function Speedometer({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const zone = zoneFor(value);

  function fromPointer(e: PointerEvent) {
    const box = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 260;
    const y = ((e.clientY - box.top) / box.height) * 142;
    if (y > CY) return onChange(x < CX ? 0 : 100);
    onChange(clampPct(100 * (1 - Math.atan2(CY - y, x - CX) / Math.PI)));
  }

  return (
    <svg
      ref={svg}
      class={`speedo ${dragging ? 'dragging' : ''}`}
      viewBox="0 0 260 142"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value}%, ${zone.label}`}
      onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); setDragging(true); fromPointer(e); }}
      onPointerMove={(e) => dragging && fromPointer(e)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(e) => {
        const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
        if (step) { e.preventDefault(); onChange(clampPct(value + step)); }
      }}
    >
      {ZONES.map((z) => (
        <path key={z.zone} d={arc(z.from, z.to === 100 ? 100 : z.to + 1)} fill="none" stroke={ZONE_COLOUR[z.zone]} stroke-width={W}
          opacity={z.zone === zone.zone ? 1 : 0.22} class="speedo-zone" />
      ))}
      {[0, 50, 75, 100].map((p) => {
        const [x, y] = point(p, R + W / 2 + 10);
        return <text key={p} x={x} y={y + 4} text-anchor="middle" class="speedo-tick">{p}</text>;
      })}
      <g class="speedo-needle" style={{ transform: `rotate(${value * 1.8}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
        <line x1={CX} y1={CY} x2={CX - R + 14} y2={CY} stroke="var(--ink)" stroke-width="4" stroke-linecap="round" />
      </g>
      <circle cx={CX} cy={CY} r="9" fill="var(--ink)" />
    </svg>
  );
}
