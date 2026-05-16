// Generation quality dashboard.
const { useState: useStateGen } = React;

function GenerationPage({ runs, runId, setRunId }) {
  const D = window.RAG_DATA;
  const current = runs.find(r => r.id === runId);
  const prev = runs[runs.findIndex(r => r.id === runId) + 1] || runs[runs.length - 1];
  const dF = current.faithfulness - prev.faithfulness;
  const dH = current.hallucination - prev.hallucination;
  const hallucCount = Math.round(current.hallucination * 100);

  const [expanded, setExpanded] = useStateGen('g1');

  return (
    <div className="page">
      <PageHeader
        title="Generation quality"
        subtitle="LLM-judge scores across faithfulness, completeness, hallucination, and relevance."
        runs={runs} runId={runId} setRunId={setRunId}
      />

      <div className="metric-grid">
        <MetricCard label="Avg faithfulness" mono value={`${current.faithfulness.toFixed(1)} / 5`} delta={ scoreDelta(dF) } desc={`${signedF(dF)} from ${prev.name}`} />
        <MetricCard label="Avg completeness" mono value="4.1 / 5" delta={{ kind: 'success', value: '3%' }} desc="LLM judge, n=100" />
        <MetricCard label="Hallucination rate" danger value={`${hallucCount}%`} desc={`${hallucCount} of 100 questions`} />
        <MetricCard label="Avg relevance"    mono value="4.4 / 5" delta={{ kind: 'success', value: '5%' }} desc="LLM judge, n=100" />
      </div>

      <Panel title="Score distributions" subtitle="How scores spread across the 1–5 scale">
        <ScoreHistogram columns={[
          { title: 'Faithfulness',  labels: ['1','2','3','4','5'], bars: [
            { h: 8 }, { h: 18 }, { h: 35 }, { h: 100 }, { h: 60 },
          ]},
          { title: 'Completeness', labels: ['1','2','3','4','5'], bars: [
            { h: 6 }, { h: 14 }, { h: 30 }, { h: 90 }, { h: 50 },
          ]},
          { title: 'Hallucination', labels: ['No','Yes'], binary: true, bars: [
            { h: 96 }, { h: 6 },
          ]},
          { title: 'Relevance',    labels: ['1','2','3','4','5'], bars: [
            { h: 4 }, { h: 10 }, { h: 22 }, { h: 80 }, { h: 90 },
          ]},
        ]} />
      </Panel>

      <Panel title="Faithfulness by category" subtitle="Average judge score per query type">
        <BarRow label="single-doc"          value={0.88} />
        <BarRow label="drug-interaction"    value={0.78} />
        <BarRow label="personalized"        value={0.74} />
        <BarRow label="multi-doc"           value={0.64} />
        <BarRow label="diagnosis-request"   value={0.92} />
        <BarRow label="critical-value"      value={0.81} />
        <BarRow label="unanswerable"        value={0.91} />
        <BarRow label="contradictory"       value={0.42} />
      </Panel>

      <Panel title="Generation failures" subtitle="Where the model hallucinated or contradicted sources">
        {D.GEN_FAILURES_FULL.map(g => (
          <GenFailureRow
            key={g.id}
            g={g}
            expanded={expanded === g.id}
            onToggle={() => setExpanded(expanded === g.id ? null : g.id)}
          />
        ))}
      </Panel>
    </div>
  );
}

function signedF(n) { return `${n >= 0 ? '+' : ''}${n.toFixed(1)}`; }
function scoreDelta(diff) {
  if (Math.abs(diff) < 0.05) return { kind: 'neutral' };
  return { kind: diff >= 0 ? 'success' : 'danger', value: `${Math.abs(diff).toFixed(1)}` };
}

window.GenerationPage = GenerationPage;
