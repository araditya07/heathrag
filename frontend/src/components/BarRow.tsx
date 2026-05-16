interface Props {
  label: string;
  /** value in 0..1 */
  value: number;
  /** rendered text on the right (defaults to value.toFixed(2)) */
  display?: string;
  /** auto-color thresholds (defaults: green ≥ 0.95, amber ≥ 0.80, red < 0.80) */
  thresholds?: { good: number; warn: number };
}

function colorFor(v: number, t = { good: 0.95, warn: 0.8 }): string {
  if (v >= t.good) return "var(--success)";
  if (v >= t.warn) return "var(--warning)";
  return "var(--danger)";
}

export default function BarRow({ label, value, display, thresholds }: Props) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className="bar-row">
      <div className="row-label">{label}</div>
      <div className="track">
        <div
          className="fill"
          style={{ width: `${v * 100}%`, background: colorFor(v, thresholds) }}
        />
      </div>
      <div className="row-value">{display ?? `${(v * 100).toFixed(0)}%`}</div>
    </div>
  );
}
