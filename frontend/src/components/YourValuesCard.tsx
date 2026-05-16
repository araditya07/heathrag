import type { ParsedParameter } from "../lib/api";
import StatusBadge from "./StatusBadge";

function pretty(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function YourValuesCard({ params }: { params: ParsedParameter[] }) {
  if (!params || params.length === 0) return null;
  return (
    <div className="your-values" aria-label="Your relevant lab values for this question">
      <div className="label">Your values</div>
      <div className="rows">
        {params.map((p) => (
          <div key={p.canonical_name} className="row">
            <span>{pretty(p.canonical_name)}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className="v">
                {p.value} <span style={{ color: "var(--text-tertiary)" }}>{p.unit}</span>
              </span>
              <StatusBadge status={p.status} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
