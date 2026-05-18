import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import BarRow from "../components/BarRow";
import EmptyState from "../components/EmptyState";
import MetricCard from "../components/MetricCard";
import PageHeader from "../components/PageHeader";
import { Panel, PanelBody, PanelHeader } from "../components/Panel";
import RunSelector from "../components/RunSelector";
import TrendChart from "../components/TrendChart";
import { fmtPct as pct } from "../lib/fmt";
import { useEvalData } from "../lib/useEvalData";
import type { EvalResult } from "../lib/api";

type SubTab = "all" | "missed_refusals" | "missed_critical" | "missing_disclaimer";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "all", label: "All failures" },
  { key: "missed_refusals", label: "Missed refusals" },
  { key: "missed_critical", label: "Missed critical" },
  { key: "missing_disclaimer", label: "Missing disclaimer" },
];

function filterFailures(results: EvalResult[], sub: SubTab): EvalResult[] {
  const fails = results.filter((r) => !r.guardrail_passed);
  if (sub === "all") return fails;
  if (sub === "missed_refusals") return fails.filter((r) => r.failure_type === "guardrail_failed_to_refuse");
  if (sub === "missed_critical")
    return fails.filter((r) => r.failure_type === "guardrail_missed_critical_value");
  if (sub === "missing_disclaimer")
    return fails.filter((r) => r.failure_type === "guardrail_missing_disclaimer");
  return fails;
}

function GuardrailFailureRow({ row }: { row: EvalResult }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`guard-failure${open ? " expanded" : ""}`}
      onClick={() => setOpen((v) => !v)}
    >
      <div className="head">
        <div className="pills">
          <span className="pill neutral">{row.category.replace(/_/g, " ")}</span>
          <span className="pill danger failed-tag">
            guardrail failed: {row.failure_type.replace("guardrail_", "").replace(/_/g, " ")}
          </span>
        </div>
        <ChevronRight size={16} className="chev" />
      </div>
      <div className="question">{row.question_text}</div>
      {open && (
        <div className="expanded-body">
          <div className="block">
            <div className="label">Expected behavior</div>
            <div className="text">
              {row.expected_guardrail
                ? `Trigger guardrail: ${row.expected_guardrail.replace(/_/g, " ")}`
                : "Pass all default guardrails."}
            </div>
          </div>
          <div className="block">
            <div className="label">Actual response</div>
            <div className="text">{row.generated_answer}</div>
          </div>
          {row.guardrail_failure_reason && (
            <div className="block">
              <div className="label">Why it failed</div>
              <div className="text">{row.guardrail_failure_reason}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GuardrailsPage() {
  const { runs, selectedId, setSelectedId, current, previous, trend, currentIndex, results, loading } =
    useEvalData();
  const [sub, setSub] = useState<SubTab>("all");

  const trendOverall = useMemo(
    () => trend.map((r) => ({ name: r.run_name, value: r.guardrail_overall_pass_rate })),
    [trend]
  );

  const delta = (k: any): number | null =>
    previous && current && (current as any)[k] != null && (previous as any)[k] != null
      ? ((current as any)[k] as number) - ((previous as any)[k] as number)
      : null;

  const failures = useMemo(() => filterFailures(results, sub), [results, sub]);

  if (loading) return null;
  if (!current) {
    return (
      <div className="page">
        <PageHeader
          title="Guardrails"
          subtitle="Disclaimer compliance, refusal-to-diagnose, critical-value detection."
        />
        <EmptyState
          title="No eval runs yet"
          body="Run scripts/09_run_full_eval_suite.py --name baseline to populate the guardrail dashboard."
        />
      </div>
    );
  }

  const disclaimerRate = current.guardrail_disclaimer_rate;
  const disclaimerTone =
    disclaimerRate == null ? "default" : disclaimerRate === 1 ? "default" : "danger";

  return (
    <div className="page">
      <PageHeader
        title="Guardrails"
        subtitle="Did the system follow its safety rules — disclaimer, refusal, critical alerts?"
      >
        <RunSelector runs={runs} selectedId={selectedId} onSelect={setSelectedId} />
      </PageHeader>

      <div className="metric-grid">
        <MetricCard
          label="Disclaimer compliance"
          value={pct(disclaimerRate)}
          tone={disclaimerTone}
          delta={delta("guardrail_disclaimer_rate")}
          hint="target: 100%"
        />
        <MetricCard
          label="Refusal to diagnose"
          value={pct(current.guardrail_refusal_rate)}
          delta={delta("guardrail_refusal_rate")}
          hint="target: 100%"
        />
        <MetricCard
          label="Critical detection"
          value={pct(current.guardrail_critical_detection_rate)}
          delta={delta("guardrail_critical_detection_rate")}
          hint="target: 100%"
        />
        <MetricCard
          label="Overall pass rate"
          value={pct(current.guardrail_overall_pass_rate)}
          delta={delta("guardrail_overall_pass_rate")}
          hint="all applicable guardrails passed"
        />
      </div>

      <Panel>
        <PanelHeader title="Guardrail pass rate across runs" />
        <PanelBody>
          <TrendChart
            data={trendOverall}
            currentIndex={currentIndex}
            domain={[0, 1]}
            target={0.95}
          />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Per-guardrail pass rate" />
        <PanelBody>
          <BarRow
            label="Disclaimer"
            value={current.guardrail_disclaimer_rate ?? 0}
            display={pct(current.guardrail_disclaimer_rate)}
            thresholds={{ good: 1.0, warn: 1.0 }}
          />
          <BarRow
            label="Refuse to diagnose"
            value={current.guardrail_refusal_rate ?? 0}
            display={pct(current.guardrail_refusal_rate)}
            thresholds={{ good: 0.95, warn: 0.8 }}
          />
          <BarRow
            label="Flag critical"
            value={current.guardrail_critical_detection_rate ?? 0}
            display={pct(current.guardrail_critical_detection_rate)}
            thresholds={{ good: 0.95, warn: 0.8 }}
          />
          <BarRow
            label="Overall pass"
            value={current.guardrail_overall_pass_rate ?? 0}
            display={pct(current.guardrail_overall_pass_rate)}
            thresholds={{ good: 0.95, warn: 0.8 }}
          />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Failure explorer">
          <div className="tabs" role="tablist">
            {SUB_TABS.map((t) => (
              <button
                key={t.key}
                className={`tab${sub === t.key ? " active" : ""}`}
                onClick={() => setSub(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </PanelHeader>
        <PanelBody>
          {failures.length === 0 ? (
            <div className="ds-caption" style={{ padding: 12 }}>
              ✓ No guardrail failures in this category.
            </div>
          ) : (
            failures.map((row) => <GuardrailFailureRow key={row.id} row={row} />)
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
