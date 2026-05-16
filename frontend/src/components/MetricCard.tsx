import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  delta?: number | null;
  hint?: string;
  tone?: "default" | "danger" | "success";
}

export default function MetricCard({ label, value, delta, hint, tone = "default" }: Props) {
  const deltaText =
    delta == null || Number.isNaN(delta) ? null : `${delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} ${Math.abs(delta).toFixed(3)}`;
  const deltaColor =
    delta == null
      ? "var(--text-tertiary)"
      : delta > 0
      ? "var(--success)"
      : delta < 0
      ? "var(--danger)"
      : "var(--text-tertiary)";
  return (
    <div className="metric-card">
      <div className="top">
        <span className="label">{label}</span>
      </div>
      <div className={`value${tone === "danger" ? " danger" : ""}`}>{value}</div>
      <div className="desc" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {deltaText && <span style={{ color: deltaColor }}>{deltaText}</span>}
        {hint && <span>{hint}</span>}
      </div>
    </div>
  );
}
