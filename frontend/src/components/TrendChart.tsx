interface Point {
  name: string;
  value: number | null;
}

interface Props {
  data: Point[];
  /** y-axis domain (default 0..1) */
  domain?: [number, number];
  /** dashed target line (e.g. 0.95) — omit to hide */
  target?: number;
  /** index of the currently highlighted run */
  currentIndex?: number;
  height?: number;
  yFormat?: (v: number) => string;
}

export default function TrendChart({
  data,
  domain = [0, 1],
  target,
  currentIndex,
  height = 220,
  yFormat = (v) => `${(v * 100).toFixed(0)}%`,
}: Props) {
  const W = 760;
  const H = height;
  const padX = 48;
  const padY = 28;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  if (!data.length) {
    return (
      <div className="ds-caption" style={{ padding: 24, textAlign: "center" }}>
        No eval runs yet.
      </div>
    );
  }

  const [yMin, yMax] = domain;
  const xStep = data.length > 1 ? innerW / (data.length - 1) : 0;
  const yScale = (v: number) =>
    padY + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const pts = data.map((p, i) => {
    const v = p.value ?? null;
    const x = padX + i * xStep;
    return { x, y: v == null ? null : yScale(v), v, name: p.name };
  });

  const linePath = pts
    .filter((p) => p.y !== null)
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
    .join(" ");

  const yTicks = 5;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = yMin + ((yMax - yMin) * i) / yTicks;
    return v;
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Trend chart">
      {/* y-axis grid + labels */}
      {ticks.map((t) => {
        const y = yScale(t);
        return (
          <g key={t}>
            <line
              x1={padX}
              x2={W - padX}
              y1={y}
              y2={y}
              stroke="var(--border-light)"
              strokeWidth={0.5}
            />
            <text
              x={padX - 8}
              y={y + 4}
              textAnchor="end"
              fontFamily="JetBrains Mono"
              fontSize={10}
              fill="var(--text-tertiary)"
            >
              {yFormat(t)}
            </text>
          </g>
        );
      })}

      {target != null && (
        <g>
          <line
            x1={padX}
            x2={W - padX}
            y1={yScale(target)}
            y2={yScale(target)}
            stroke="var(--success)"
            strokeWidth={1}
            strokeDasharray="6 4"
            opacity={0.6}
          />
          <text
            x={W - padX}
            y={yScale(target) - 6}
            textAnchor="end"
            fontFamily="JetBrains Mono"
            fontSize={10}
            fill="var(--success-text)"
          >
            target {yFormat(target)}
          </text>
        </g>
      )}

      <path d={linePath} stroke="var(--accent)" strokeWidth={2} fill="none" />

      {pts.map((p, i) => {
        if (p.y === null) return null;
        const highlighted = currentIndex === i;
        return (
          <g key={i}>
            {highlighted && (
              <circle cx={p.x} cy={p.y} r={9} fill="var(--accent)" opacity={0.18} />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={highlighted ? 5 : 3.5}
              fill="var(--accent)"
            />
          </g>
        );
      })}

      {/* x-axis labels */}
      {pts.map((p, i) => (
        <text
          key={i}
          x={p.x}
          y={H - 6}
          textAnchor="middle"
          fontFamily="Plus Jakarta Sans"
          fontSize={11}
          fill="var(--text-tertiary)"
        >
          {p.name.length > 14 ? p.name.slice(0, 12) + "…" : p.name}
        </text>
      ))}
    </svg>
  );
}
