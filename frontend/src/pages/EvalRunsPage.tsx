import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import { Panel, PanelBody } from "../components/Panel";
import { useEvalData } from "../lib/useEvalData";

function pct(x: number | null | undefined): string {
  if (x == null) return "—";
  return `${(x * 100).toFixed(0)}%`;
}

export default function EvalRunsPage() {
  const { runs, loading } = useEvalData();

  if (loading) return null;
  if (!runs.length) {
    return (
      <div className="page">
        <PageHeader title="Eval runs" subtitle="History of every evaluation suite." />
        <EmptyState
          title="No eval runs yet"
          body="Run scripts/09_run_full_eval_suite.py --name baseline to create the first run."
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Eval runs" subtitle={`${runs.length} runs`} />
      <Panel>
        <PanelBody>
          <table className="runs-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Date</th>
                <th>Questions</th>
                <th>P@5</th>
                <th>Faith</th>
                <th>Hallu</th>
                <th>Guardrail%</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.run_name}</td>
                  <td className="mono">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="mono">{r.total_questions ?? "—"}</td>
                  <td className="mono">
                    {r.retrieval_precision_at_k != null
                      ? r.retrieval_precision_at_k.toFixed(2)
                      : "—"}
                  </td>
                  <td className="mono">
                    {r.generation_faithfulness != null
                      ? r.generation_faithfulness.toFixed(2)
                      : "—"}
                  </td>
                  <td className="mono">{pct(r.generation_hallucination_rate)}</td>
                  <td className="mono">{pct(r.guardrail_overall_pass_rate)}</td>
                  <td className="mono">
                    {r.run_duration_seconds != null
                      ? `${r.run_duration_seconds.toFixed(0)}s`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PanelBody>
      </Panel>
    </div>
  );
}
