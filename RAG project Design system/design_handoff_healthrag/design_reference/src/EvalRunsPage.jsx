// Eval runs table — with compare mode + comparison view.
const { useState: useStateRuns } = React;

function EvalRunsPage({ runs }) {
  const D = window.RAG_DATA;
  const [compareMode, setCompareMode] = useStateRuns(false);
  const [selected, setSelected] = useStateRuns(new Set());
  const [comparing, setComparing] = useStateRuns(null);
  const [openConfig, setOpenConfig] = useStateRuns(null);

  function toggle(id) {
    if (!compareMode) return;
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else if (s.size < 2) s.add(id);
    setSelected(s);
  }

  function startCompare() {
    const ids = Array.from(selected);
    const a = runs.find(r => r.id === ids[0]);
    const b = runs.find(r => r.id === ids[1]);
    // Order chronologically — earlier as A
    const [A, B] = (new Date(a.date) <= new Date(b.date)) ? [a, b] : [b, a];
    setComparing({ a: A, b: B });
  }

  if (comparing) {
    return <CompareView runA={comparing.a} runB={comparing.b} onBack={() => setComparing(null)} />;
  }

  return (
    <div className="page">
      <PageHeader
        title="Eval runs"
        subtitle={compareMode
          ? `Select 2 runs to compare · ${selected.size} of 2 selected`
          : `${runs.length} runs · history of every evaluation suite execution`}
      />

      <Panel title="All runs"
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            {compareMode && (
              <>
                <button
                  className="example-pill"
                  onClick={() => { setCompareMode(false); setSelected(new Set()); }}
                >Cancel</button>
                <button
                  className="btn-primary"
                  disabled={selected.size !== 2}
                  style={selected.size !== 2 ? { opacity: 0.5, pointerEvents: 'none' } : null}
                  onClick={startCompare}
                >Compare {selected.size}/2</button>
              </>
            )}
            {!compareMode && (
              <button className="example-pill" onClick={() => setCompareMode(true)}>
                <i className="ti ti-git-compare" style={{ fontSize: 13, marginRight: 6 }} />Compare runs
              </button>
            )}
          </div>
        }
      >
        <table className="runs-table">
          <thead>
            <tr>
              {compareMode && <th style={{ width: 36 }}></th>}
              <th>Run name</th>
              <th>Date</th>
              <th>P@5</th>
              <th>R@5</th>
              <th>Faith.</th>
              <th>Halluc.</th>
              <th>Guardrail%</th>
              <th>Status</th>
              <th>Config</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, idx) => {
              const grVal = window.HEALTH_DATA.GUARDRAIL_RUNS[idx]
                ? window.HEALTH_DATA.GUARDRAIL_RUNS[idx].overall
                : 0.74;
              return (
              <tr key={r.id} style={{ cursor: compareMode ? 'pointer' : 'default' }} onClick={() => toggle(r.id)}>
                {compareMode && (
                  <td onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      disabled={!selected.has(r.id) && selected.size >= 2}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                )}
                <td>
                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                  {r.current && <span style={{ marginLeft: 8 }}><Pill kind="accent">current</Pill></span>}
                </td>
                <td className="mono">{r.date}</td>
                <td className="mono">{r.p5.toFixed(2)}</td>
                <td className="mono">{r.r5.toFixed(2)}</td>
                <td className="mono">{r.faithfulness.toFixed(1)}</td>
                <td><Pill kind={r.hallucination <= 0.03 ? 'success' : r.hallucination <= 0.06 ? 'warning' : 'danger'} mono>{Math.round(r.hallucination * 100)}%</Pill></td>
                <td><Pill kind={grVal >= 0.95 ? 'success' : grVal >= 0.80 ? 'warning' : 'danger'} mono>{Math.round(grVal * 100)}%</Pill></td>
                <td>
                  <Pill kind="success"><span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--success)', display: 'inline-block', marginRight: 2 }} />completed</Pill>
                </td>
                <td onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
                  <button
                    className="btn-icon"
                    style={{ width: 26, height: 26 }}
                    onClick={() => setOpenConfig(openConfig === r.id ? null : r.id)}
                    aria-label="Show run config"
                  >
                    <i className="ti ti-code" style={{ fontSize: 13 }} />
                  </button>
                  {openConfig === r.id && (
                    <ConfigPopover run={r} onClose={() => setOpenConfig(null)} />
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function ConfigPopover({ run, onClose }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    function close(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    setTimeout(() => document.addEventListener('mousedown', close), 0);
    return () => document.removeEventListener('mousedown', close);
  }, [onClose]);
  return (
    <div ref={ref} style={{
      position: 'absolute', right: 0, top: 'calc(100% + 4px)',
      background: 'var(--bg-card)',
      border: '0.5px solid var(--border-medium)',
      borderRadius: 'var(--radius-lg)',
      padding: 14,
      minWidth: 280,
      zIndex: 30,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--text-secondary)',
      lineHeight: 1.8,
      textAlign: 'left',
      whiteSpace: 'normal',
      boxShadow: '0 8px 24px rgba(20,20,20,0.06)',
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8 }}>
        {run.name} config
      </div>
      <div>chunk_size:       <span style={{ color: 'var(--text-primary)' }}>1024</span></div>
      <div>chunk_overlap:    <span style={{ color: 'var(--text-primary)' }}>128</span></div>
      <div>embedding_model:  <span style={{ color: 'var(--text-primary)' }}>text-embedding-3-large</span></div>
      <div>retriever_k:      <span style={{ color: 'var(--text-primary)' }}>5</span></div>
      <div>reranker_enabled: <span style={{ color: 'var(--text-primary)' }}>{run.id === 'r1' ? 'false' : 'true'}</span></div>
      <div>threshold:        <span style={{ color: 'var(--text-primary)' }}>0.45</span></div>
      <div>judge_model:      <span style={{ color: 'var(--text-primary)' }}>claude-3.7-sonnet</span></div>
    </div>
  );
}

window.EvalRunsPage = EvalRunsPage;
