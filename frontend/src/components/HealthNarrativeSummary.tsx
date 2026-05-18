import { AlertTriangle, ArrowDown, ArrowUp, Check, Stethoscope } from "lucide-react";
import type { LatestReport, ParsedParameter } from "../lib/api";

/**
 * Deterministic, no-LLM narrative summary of an uploaded lab report.
 * Renders right after upload so the user gets an immediate at-a-glance read
 * before asking any questions. Uses the structured data the parser produced.
 */

function prettyName(name: string): string {
  const overrides: Record<string, string> = {
    hba1c: "HbA1c",
    ldl: "LDL Cholesterol",
    hdl: "HDL Cholesterol",
    tsh: "TSH",
    wbc: "WBC",
    rbc: "RBC",
    inr: "INR",
  };
  if (overrides[name]) return overrides[name];
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusInterpretation(p: ParsedParameter): string {
  const name = prettyName(p.canonical_name);
  switch (p.status) {
    case "high":
      return `${name} of ${p.value} ${p.unit} is above the reference range (${p.ref_range})`;
    case "low":
      return `${name} of ${p.value} ${p.unit} is below the reference range (${p.ref_range})`;
    case "critical_high":
      return `${name} of ${p.value} ${p.unit} is in the critical high range`;
    case "critical_low":
      return `${name} of ${p.value} ${p.unit} is in the critical low range`;
    default:
      return `${name}: ${p.value} ${p.unit}`;
  }
}

export default function HealthNarrativeSummary({ report }: { report: LatestReport }) {
  const params = Object.values(report.extracted_values ?? {});
  if (!params.length) return null;

  const critical = params.filter(
    (p) => p.status === "critical_high" || p.status === "critical_low"
  );
  const abnormal = params.filter((p) => p.status === "high" || p.status === "low");
  const normal = params.filter((p) => p.status === "normal");

  return (
    <section
      className="panel"
      role="region"
      aria-label="Health summary"
      style={{ marginTop: 0 }}
    >
      <header className="panel-header">
        <div className="title-row">
          <Stethoscope size={16} strokeWidth={2} style={{ color: "var(--accent)" }} />
          <h3>Summary of your health</h3>
          <span className="subtitle">
            Generated from your uploaded report — no AI inference
          </span>
        </div>
      </header>
      <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.7 }}>
          Your report covers <strong style={{ color: "var(--text-primary)" }}>{params.length}</strong> parameter
          {params.length === 1 ? "" : "s"}.{" "}
          <span style={{ color: "var(--success-text)" }}>{normal.length} within normal range</span>
          {abnormal.length > 0 && (
            <>
              {", "}
              <span style={{ color: "var(--warning-text)" }}>
                {abnormal.length} outside normal
              </span>
            </>
          )}
          {critical.length > 0 && (
            <>
              {", "}
              <span style={{ color: "var(--danger-text)", fontWeight: 500 }}>
                {critical.length} critical
              </span>
            </>
          )}
          .
        </p>

        {critical.length > 0 && (
          <SummarySection
            color="var(--danger-text)"
            bg="var(--danger-surface)"
            Icon={AlertTriangle}
            title="Critical — needs medical attention"
            items={critical.map(statusInterpretation)}
          />
        )}

        {abnormal.length > 0 && (
          <SummarySection
            color="var(--warning-text)"
            bg="var(--warning-surface)"
            Icon={abnormal[0].status === "high" ? ArrowUp : ArrowDown}
            title="Outside normal range"
            items={abnormal.map(statusInterpretation)}
          />
        )}

        {abnormal.length === 0 && critical.length === 0 && normal.length > 0 && (
          <SummarySection
            color="var(--success-text)"
            bg="var(--success-surface)"
            Icon={Check}
            title="All parameters within normal range"
            items={normal.slice(0, 6).map(statusInterpretation)}
          />
        )}

        <p
          style={{
            margin: 0,
            color: "var(--text-tertiary)",
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          This overview is computed directly from your uploaded values and standard reference
          ranges. It is not a diagnosis. Ask a follow-up question below to discuss specific
          values, or consult a qualified healthcare professional for full assessment.
        </p>
      </div>
    </section>
  );
}

function SummarySection({
  color,
  bg,
  Icon,
  title,
  items,
}: {
  color: string;
  bg: string;
  Icon: any;
  title: string;
  items: string[];
}) {
  return (
    <div
      style={{
        background: bg,
        borderRadius: "var(--radius-md)",
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          fontSize: 12,
          fontWeight: 500,
          color,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        <Icon size={14} strokeWidth={2} />
        {title}
      </div>
      <ul
        style={{
          margin: 0,
          paddingLeft: 22,
          color,
          fontSize: 13,
          lineHeight: 1.7,
        }}
      >
        {items.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
