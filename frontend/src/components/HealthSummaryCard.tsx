import { Lock, X } from "lucide-react";
import { useState } from "react";
import type { LatestReport, ParsedParameter } from "../lib/api";
import StatusBadge from "./StatusBadge";

function ParamRow({ p }: { p: ParsedParameter }) {
  const critical = p.status === "critical_high" || p.status === "critical_low";
  return (
    <div className={`param-row${critical ? " critical" : ""}`}>
      <div className="name">{prettifyName(p.canonical_name)}</div>
      <div className="value">
        {p.value}
        <span className="unit">{p.unit}</span>
      </div>
      <StatusBadge status={p.status} />
    </div>
  );
}

function prettifyName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\bhba1c\b/i, "HbA1c")
    .replace(/\bldl\b/i, "LDL")
    .replace(/\bhdl\b/i, "HDL")
    .replace(/\btsh\b/i, "TSH")
    .replace(/\bwbc\b/i, "WBC")
    .replace(/\brbc\b/i, "RBC")
    .replace(/\binr\b/i, "INR")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const DEFAULT_VISIBLE = 8;

export default function HealthSummaryCard({
  report,
  onClose,
}: {
  report: LatestReport;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const params = Object.values(report.extracted_values ?? {});
  const total = params.length;
  const abnormal = params.filter((p) => p.status !== "normal" && p.status !== "unknown").length;
  const visible = expanded ? params : params.slice(0, DEFAULT_VISIBLE);
  const hidden = total - visible.length;

  return (
    <div
      className="health-summary"
      role="region"
      aria-label={`Your extracted lab results: ${total} values, ${abnormal} above normal`}
    >
      <div className="head">
        <div>
          <h3>Your lab results</h3>
          <div className="meta">{report.filename || "Uploaded report"}</div>
        </div>
        <button className="icon-close" aria-label="Remove uploaded report" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="body">
        {visible.map((p) => (
          <ParamRow key={p.canonical_name} p={p} />
        ))}
      </div>

      {hidden > 0 && (
        <button className="expand-toggle" onClick={() => setExpanded(true)}>
          +{hidden} more values
        </button>
      )}

      <div className="footer">
        <span>
          {total} values extracted · {abnormal} outside normal range
        </span>
        <span className="privacy">
          <Lock size={12} strokeWidth={2} />
          Session only · deleted in 24 h
        </span>
      </div>
    </div>
  );
}
