import { Activity } from "lucide-react";
import type { ReactNode } from "react";

export default function EmptyState({
  title,
  body,
  hint,
}: {
  title: string;
  body: string;
  hint?: ReactNode;
}) {
  return (
    <div className="panel">
      <div
        className="panel-body"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 36 }}
      >
        <Activity size={28} strokeWidth={1.5} style={{ color: "var(--text-tertiary)" }} />
        <h3 style={{ marginTop: 12 }}>{title}</h3>
        <div className="ds-caption" style={{ marginTop: 4, textAlign: "center", maxWidth: 480 }}>
          {body}
        </div>
        {hint && <div style={{ marginTop: 12 }}>{hint}</div>}
      </div>
    </div>
  );
}
