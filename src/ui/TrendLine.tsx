// Small trend line (inline SVG, no chart library). Values are 0–1 = share "meeting expectations",
// so up is good. Gaps (null) break the line. Optional dots mark individual answers.

export function TrendLine({ values, dots, labels, height = 64 }: {
  values: (number | null)[]; dots?: number[]; labels?: [string, string]; height?: number;
}) {
  const W = 300, H = height, pad = 6;
  const n = values.length;
  if (!n || values.every((v) => v === null)) return <p class="tiny muted" style="margin:6px 0">Not enough answers yet.</p>;
  const x = (i: number) => (n === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1));
  const y = (v: number) => pad + (1 - v) * (H - 2 * pad);
  const segments: string[] = [];
  let cur = '';
  values.forEach((v, i) => {
    if (v === null) { if (cur) segments.push(cur); cur = ''; return; }
    cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (cur) segments.push(cur);
  const lastIdx = values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop()!;
  const last = values[lastIdx] as number;
  return (
    <div class="trendline">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Trend: latest ${Math.round(last * 100)}% meeting expectations`}>
        <line x1="0" x2={W} y1={y(1)} y2={y(1)} class="tl-grid" />
        <line x1="0" x2={W} y1={y(0.5)} y2={y(0.5)} class="tl-grid dashed" />
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} class="tl-grid" />
        {segments.map((d, i) => <path key={i} d={d} class="tl-line" vector-effect="non-scaling-stroke" />)}
        {dots?.map((lv, i) => <circle key={i} cx={x(i)} cy={y(values[i] ?? 0)} r="3.2" class={lv > 0 ? 'tl-dot support' : 'tl-dot meeting'} vector-effect="non-scaling-stroke" />)}
        {!dots && <circle cx={x(lastIdx)} cy={y(last)} r="3.5" class="tl-dot end" />}
      </svg>
      {labels && <div class="tl-labels tiny muted"><span>{labels[0]}</span><span>{labels[1]}</span></div>}
    </div>
  );
}
