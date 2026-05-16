// HealthRAG — Guardrails dashboard.
const { useState: useStateGR } = React;

function GuardrailsPage({ runs, runId, setRunId }) {
  const H = window.HEALTH_DATA;
  // Use guardrail-specific runs, but pretend the runId selector applies (display only)
  const grRuns = H.GUARDRAIL_RUNS;
  const current = grRuns[0];
  const prev    = grRuns[1];

  const [tab, setTab] = useStateGR('all');
  const [expanded, setExpanded] = useStateGR('gf1');

  const overallDelta = current.overall - prev.overall;
  const overallPct = Math.round(current.overall * 100);

  return (
    <div className="page">
      <PageHeader
        title="Guardrail quality"
        subtitle="Measuring whether safety guardrails fire correctly in a health domain"
        runs={runs} runId={runId} setRunId={setRunId}
      />

      <div className="metric-grid">
        <div className={'metric-card ' + (current.disclaimer === 1 ? 'guardrail-100' : 'guardrail-bad')}>
          <div className="top">
            <span className="label">Disclaimer compliance</span>
            {current.disclaimer === 1
              ? <span className="pill success"><i className="ti ti-check" style={{ fontSize: 11 }} />pass</span>
              : <span className="pill danger">{Math.round(current.disclaimer * 100)}%</span>}
          </div>
          <div className="value">{Math.round(current.disclaimer * 100)}%</div>
          <div className="desc">{Math.round(current.disclaimer * 120)}/120 answers</div>
        </div>

        <div className="metric-card">
          <div className="top">
            <span className="label">Refusal to diagnose</span>
            <span className={'pill ' + (current.refusal >= 0.95 ? 'success' : current.refusal >= 0.85 ? 'warning' : 'danger')}>
              {Math.round(current.refusal * 100)}%
            </span>
          </div>
          <div className="value">{Math.round(current.refusal * 100)}%</div>
          <div className="desc">{Math.round(current.refusal * 20)}/20 requests refused</div>
        </div>

        <div className="metric-card">
          <div className="top">
            <span className="label">Critical detection</span>
            <span className={'pill ' + (current.critical >= 0.95 ? 'success' : current.critical >= 0.80 ? 'warning' : 'danger')}>
              {Math.round(current.critical * 100)}%
            </span>
          </div>
          <div className="value">{Math.round(current.critical * 100)}%</div>
          <div className="desc">{Math.round(current.critical * 10)}/10 critical values</div>
        </div>

        <div className="metric-card">
          <div className="top">
            <span className="label">Overall pass rate</span>
            <span className={'pill ' + (overallDelta >= 0 ? 'success' : 'danger')}>
              <i className={'ti ' + (overallDelta >= 0 ? 'ti-trending-up' : 'ti-trending-down')} style={{ fontSize: 11 }} />
              {overallDelta >= 0 ? '+' : ''}{Math.round(overallDelta * 100)}%
            </span>
          </div>
          <div className="value">{overallPct}%</div>
          <div className="desc">+{Math.round((current.overall - grRuns[grRuns.length-1].overall)*100)}% from baseline</div>
        </div>
      </div>

      <Panel title="Guardrail pass rate over eval runs"
        subtitle={`${grRuns.length} runs · each x-axis label describes the change`}
        right={<span className="bar-legend">
          <span className="swatch" style={{ background: 'var(--accent)' }} />
          <span>Overall pass</span>
        </span>}
      >
        <GuardrailTrendChart runs={grRuns} currentId={current.id} />
      </Panel>

      <Panel title="Per-guardrail breakdown" subtitle="Current run compliance by rule">
        <GuardrailBars cats={H.GUARDRAIL_CATEGORIES} />
      </Panel>

      <Panel title="Guardrail failures" subtitle="Specific questions where guardrails failed in this run"
        right={<div className="tabs">
          {[
            { id: 'all',         label: 'All failures' },
            { id: 'refusal',     label: 'Missed refusals' },
            { id: 'critical',    label: 'Missed critical' },
            { id: 'disclaimer',  label: 'Missing disclaimer' },
          ].map(t => (
            <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>}
      >
        {H.GUARDRAIL_FAILURES
          .filter(f => tab === 'all' ? true : f.failedGuardrail === tab)
          .map(f => (
            <GuardrailFailureRow
              key={f.id}
              f={f}
              expanded={expanded === f.id}
              onToggle={() => setExpanded(expanded === f.id ? null : f.id)}
            />
          ))}
        {H.GUARDRAIL_FAILURES.filter(f => tab === 'all' ? true : f.failedGuardrail === tab).length === 0 && (
          <div style={{ padding: '40px 12px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            No failures of this type in this run. <span style={{ color: 'var(--success-text)' }}>That's the goal.</span>
          </div>
        )}
      </Panel>
    </div>
  );
}

// Special guardrail bars (color by absolute %, not threshold)
function GuardrailBars({ cats }) {
  return (
    <div>
      {cats.map(c => (
        <div className="bar-row" key={c.label}>
          <div className="row-label">{c.label}</div>
          <div className="track">
            <div className="fill" style={{
              width: `${c.value * 100}%`,
              background: c.value >= 0.95 ? 'var(--success)' : c.value >= 0.80 ? 'var(--warning)' : 'var(--danger)'
            }} />
          </div>
          <div className="row-value">{Math.round(c.value * 100)}%</div>
        </div>
      ))}
    </div>
  );
}

// Trend chart with run-name labels on x-axis
function GuardrailTrendChart({ runs, currentId }) {
  const W = 600, H = 130;
  const margin = { l: 30, r: 20, t: 10, b: 10 };
  const innerW = W - margin.l - margin.r;
  const innerH = H - margin.t - margin.b;
  const reversed = [...runs].reverse();
  const points = reversed.map(r => r.overall);
  const yMin = 0.7, yMax = 1.0;
  const x = (i) => margin.l + (i / (points.length - 1)) * innerW;
  const y = (v) => margin.t + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const pathLine = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(' ');
  const pathFill = `${pathLine} L ${x(points.length - 1).toFixed(1)} ${H} L ${x(0).toFixed(1)} ${H} Z`;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0F6E56';

  return (
    <div style={{ height: 180 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%">
        <defs>
          <linearGradient id="gr-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.16" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[1.0, 0.85, 0.7].map((g, i) => (
          <line key={i} x1={margin.l} x2={W - margin.r} y1={y(g)} y2={y(g)} stroke="var(--border-light)" />
        ))}
        {/* 95% target */}
        <line x1={margin.l} x2={W - margin.r} y1={y(0.95)} y2={y(0.95)} stroke="var(--text-tertiary)" strokeDasharray="3 3" opacity="0.6" />
        <text x={W - margin.r} y={y(0.95) - 4} textAnchor="end" fontSize="9" fill="var(--text-tertiary)" fontFamily="var(--font-mono)">target 95%</text>
        <path d={pathFill} fill="url(#gr-grad)" />
        <path d={pathLine} stroke={accent} strokeWidth="2" fill="none" />
        {reversed.map((r, i) => {
          const isCurrent = r.id === currentId;
          return (
            <g key={r.id}>
              {isCurrent && <circle cx={x(i)} cy={y(points[i])} r="10" fill={accent} opacity="0.14" />}
              <circle cx={x(i)} cy={y(points[i])} r={isCurrent ? 7 : 4.5}
                      fill={isCurrent ? accent : 'var(--bg-card)'} stroke={accent} strokeWidth="2" />
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, padding: `0 ${margin.r}px 0 ${margin.l}px`, fontSize: 11, color: 'var(--text-tertiary)' }}>
        {reversed.map((r, i) => (
          <span key={i} style={{ color: r.id === currentId ? 'var(--accent-text)' : 'inherit', fontWeight: r.id === currentId ? 500 : 400, textAlign: 'center', flex: 1 }}>
            {r.name}
          </span>
        ))}
      </div>
    </div>
  );
}

window.GuardrailsPage = GuardrailsPage;
