import { useMemo } from "react";
import BarRow from "../components/BarRow";
import EmptyState from "../components/EmptyState";
import MetricCard from "../components/MetricCard";
import PageHeader from "../components/PageHeader";
import { Panel, PanelBody, PanelHeader } from "../components/Panel";
import RunSelector from "../components/RunSelector";
import TrendChart from "../components/TrendChart";
import { fmtPct, fmtScoreOf5 } from "../lib/fmt";
import { useEvalData } from "../lib/useEvalData";

export default function GenerationPage() {
  const { runs, selectedId, setSelectedId, current, previous, trend, currentIndex, results, loading } =
    useEvalData();

  const trendFaith = useMemo(
    () => trend.map((r) => ({ name: r.run_name, value: r.generation_faithfulness })),
    [trend]
  );

  const worst = [...results]
    .sort((a, b) => {
      const sa = (a.faithfulness_score ?? 0) + (a.completeness_score ?? 0) + (a.relevance_score ?? 0);
      const sb = (b.faithfulness_score ?? 0) + (b.completeness_score ?? 0) + (b.relevance_score ?? 0);
      return sa - sb;
    })
    .slice(0, 8);

  const delta = (k: any): number | null =>
    previous && current && (current as any)[k] != null && (previous as any)[k] != null
      ? ((current as any)[k] as number) - ((previous as any)[k] as number)
      : null;

  if (loading) return null;
  if (!current) {
    return (
      <div className="page">
        <PageHeader title="Generation quality" subtitle="Was the answer faithful, complete, on-topic?" />
        <EmptyState
          title="No eval runs yet"
          body="Run scripts/09_run_full_eval_suite.py --name baseline to generate the first run."
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Generation quality" subtitle="Was the answer faithful, complete, on-topic?">
        <RunSelector runs={runs} selectedId={selectedId} onSelect={setSelectedId} />
      </PageHeader>

      <div className="metric-grid">
        <MetricCard
          label="Faithfulness"
          value={fmtScoreOf5(current.generation_faithfulness)}
          delta={delta("generation_faithfulness")}
        />
        <MetricCard
          label="Completeness"
          value={fmtScoreOf5(current.generation_completeness)}
          delta={delta("generation_completeness")}
        />
        <MetricCard
          label="Medical accuracy"
          value={fmtScoreOf5(current.generation_medical_accuracy)}
          delta={delta("generation_medical_accuracy")}
        />
        <MetricCard
          label="Hallucination rate"
          value={fmtPct(current.generation_hallucination_rate)}
          delta={delta("generation_hallucination_rate")}
          tone="danger"
        />
      </div>

      <Panel>
        <PanelHeader title="Faithfulness across runs" />
        <PanelBody>
          <TrendChart
            data={trendFaith}
            currentIndex={currentIndex}
            domain={[0, 5]}
            yFormat={(v) => v.toFixed(0)}
          />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Faithfulness by category" />
        <PanelBody>
          {Object.entries(
            results.reduce<Record<string, { sum: number; n: number }>>((acc, r) => {
              acc[r.category] = acc[r.category] ?? { sum: 0, n: 0 };
              acc[r.category].sum += r.faithfulness_score ?? 0;
              acc[r.category].n += 1;
              return acc;
            }, {})
          ).map(([cat, v]) => (
            <BarRow
              key={cat}
              label={cat.replace(/_/g, " ")}
              value={v.sum / v.n / 5}
              display={(v.sum / v.n).toFixed(2)}
              thresholds={{ good: 0.8, warn: 0.6 }}
            />
          ))}
        </PanelBody>
      </Panel>

      {worst.length > 0 && (
        <Panel>
          <PanelHeader title="Worst-scoring answers" />
          <PanelBody>
            {worst.map((r) => (
              <div key={r.id} className="gen-failure">
                <div className="question">{r.question_text}</div>
                <div className="answer">{r.generated_answer}</div>
                {r.judge_reasoning && <div className="judge">{r.judge_reasoning}</div>}
              </div>
            ))}
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
