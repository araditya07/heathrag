// Retrieval quality dashboard.
const { useState: useStateRetrieval } = React;

function RetrievalPage({ runs, runId, setRunId }) {
  const D = window.RAG_DATA;
  const current = runs.find(r => r.id === runId);
  const prev = runs[runs.findIndex(r => r.id === runId) + 1] || runs[runs.length - 1];
  const dP5  = (current.p5 - prev.p5);
  const dR5  = (current.r5 - prev.r5);
  const dMrr = (current.mrr - prev.mrr);

  const [failTab, setFailTab] = useStateRetrieval('p5');
  const [expanded, setExpanded] = useStateRetrieval('f1');

  const trendPts = [...runs].reverse().map(r => r.p5);
  const trendLabels = [...runs].reverse().map(r => r.name);

  return (
    <div className="page">
      <PageHeader
        title="Retrieval quality"
        subtitle="How well the retriever surfaces relevant chunks for each query."
        runs={runs} runId={runId} setRunId={setRunId}
      />

      <div className="metric-grid">
        <MetricCard label="Precision@5"  mono value={current.p5.toFixed(2)} delta={ deltaPill(dP5) } desc={`${signed(dP5)} from ${prev.name}`} />
        <MetricCard label="Recall@5"     mono value={current.r5.toFixed(2)} delta={ deltaPill(dR5) } desc={`${signed(dR5)} from ${prev.name}`} />
        <MetricCard label="MRR"          mono value={current.mrr.toFixed(2)} delta={ deltaPill(dMrr) } desc={`${signed(dMrr)} from ${prev.name}`} />
        <MetricCard label="Eval queries" mono value="100" delta={{ kind: 'neutral' }} desc="across 5 categories" />
      </div>

      <Panel title="Precision@5 across runs" subtitle={`Last ${runs.length} eval runs · current run highlighted`}
        right={<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: 'var(--accent)', display: 'inline-block' }} />
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>P@5</span>
        </div>}
      >
        <HighlightedTrendChart runs={runs} currentRunId={runId} metric="p5" yMin={0.55} yMax={0.85} />
      </Panel>

      <Panel title="Category breakdown" subtitle="Precision@5 by query type">
        {window.HEALTH_DATA.HEALTH_CATEGORIES.map(c => <BarRow key={c.id} label={c.label} value={c.p5} />)}
      </Panel>

      <Panel title="Failure explorer" subtitle="Lowest-scoring queries in this run"
        right={<div className="tabs">
          {[
            { id: 'p5',  label: 'Worst P@5' },
            { id: 'r5',  label: 'Worst R@5' },
            { id: 'una', label: 'Unanswerable' },
          ].map(t => (
            <button key={t.id} className={'tab' + (failTab === t.id ? ' active' : '')} onClick={() => setFailTab(t.id)}>{t.label}</button>
          ))}
        </div>}
      >
        {D.FAILURES
          .filter(f => failTab === 'una' ? f.category === 'unanswerable' : true)
          .sort((a, b) => failTab === 'r5' ? a.r5 - b.r5 : a.p5 - b.p5)
          .map(f => (
            <FailureRow
              key={f.id}
              failure={f}
              expanded={expanded === f.id}
              onToggle={() => setExpanded(expanded === f.id ? null : f.id)}
            />
        ))}
      </Panel>
    </div>
  );
}

function signed(n) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}`;
}
function deltaPill(diff) {
  if (Math.abs(diff) < 0.005) return { kind: 'neutral' };
  return { kind: diff >= 0 ? 'success' : 'danger', value: `${Math.round(Math.abs(diff) * 100)}%` };
}

window.RetrievalPage = RetrievalPage;
