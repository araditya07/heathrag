import { useMemo } from "react";
import BarRow from "../components/BarRow";
import EmptyState from "../components/EmptyState";
import MetricCard from "../components/MetricCard";
import PageHeader from "../components/PageHeader";
import { Panel, PanelBody, PanelHeader } from "../components/Panel";
import RunSelector from "../components/RunSelector";
import TrendChart from "../components/TrendChart";
import { useEvalData } from "../lib/useEvalData";

const HEALTH_CATEGORIES = [
  "single_doc",
  "drug_interaction",
  "personalized",
  "multi_doc",
  "ambiguous",
  "critical_value",
  "diagnosis_request",
  "unanswerable",
  "contradictory",
];

export default function RetrievalPage() {
  const { runs, selectedId, setSelectedId, current, previous, trend, currentIndex, results, loading } =
    useEvalData();

  const trendData = useMemo(
    () => trend.map((r) => ({ name: r.run_name, value: r.retrieval_precision_at_k })),
    [trend]
  );

  const byCategory = useMemo(() => {
    const map: Record<string, { n: number; sum: number }> = {};
    for (const r of results) {
      const c = r.category;
      map[c] = map[c] ?? { n: 0, sum: 0 };
      map[c].n += 1;
      map[c].sum += r.precision_at_k ?? 0;
    }
    return HEALTH_CATEGORIES.map((cat) => ({
      category: cat,
      precision: map[cat] ? map[cat].sum / map[cat].n : null,
      n: map[cat]?.n ?? 0,
    }));
  }, [results]);

  const worst = [...results]
    .sort((a, b) => (a.precision_at_k ?? 0) - (b.precision_at_k ?? 0))
    .slice(0, 8);

  const delta = (k: any): number | null =>
    previous && current && (current as any)[k] != null && (previous as any)[k] != null
      ? ((current as any)[k] as number) - ((previous as any)[k] as number)
      : null;

  if (loading) return null;
  if (!current) {
    return (
      <div className="page">
        <PageHeader title="Retrieval quality" subtitle="Did we find the right chunks?" />
        <EmptyState
          title="No eval runs yet"
          body="Run scripts/09_run_full_eval_suite.py --name baseline to generate the first run."
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Retrieval quality" subtitle="Did we find the right chunks?">
        <RunSelector runs={runs} selectedId={selectedId} onSelect={setSelectedId} />
      </PageHeader>

      <div className="metric-grid">
        <MetricCard
          label="Precision@5"
          value={(current.retrieval_precision_at_k ?? 0).toFixed(2)}
          delta={delta("retrieval_precision_at_k")}
        />
        <MetricCard
          label="Recall@5"
          value={(current.retrieval_recall_at_k ?? 0).toFixed(2)}
          delta={delta("retrieval_recall_at_k")}
        />
        <MetricCard label="MRR" value={(current.retrieval_mrr ?? 0).toFixed(2)} delta={delta("retrieval_mrr")} />
        <MetricCard
          label="Questions"
          value={String(current.total_questions ?? 0)}
          hint={`${current.run_duration_seconds?.toFixed(0) ?? "—"}s`}
        />
      </div>

      <Panel>
        <PanelHeader title="Precision@5 across runs" />
        <PanelBody>
          <TrendChart data={trendData} currentIndex={currentIndex} domain={[0, 1]} />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="By question category" subtitle={`Precision@5 across ${results.length} questions`} />
        <PanelBody>
          {byCategory.map((row) => (
            <BarRow
              key={row.category}
              label={row.category.replace(/_/g, " ")}
              value={row.precision ?? 0}
              display={row.precision == null ? "—" : row.precision.toFixed(2)}
              thresholds={{ good: 0.7, warn: 0.5 }}
            />
          ))}
        </PanelBody>
      </Panel>

      {worst.length > 0 && (
        <Panel>
          <PanelHeader title="Worst-performing questions" />
          <PanelBody>
            {worst.map((r) => (
              <div key={r.id} className="failure-row">
                <div className="question">{r.question_text}</div>
                <div className="meta">
                  <span className="pill neutral">{r.category.replace(/_/g, " ")}</span>
                  <div className="scores">
                    <span>P@5 {r.precision_at_k?.toFixed(2)}</span>
                    <span>R@5 {r.recall_at_k?.toFixed(2)}</span>
                    <span>MRR {r.mrr?.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
