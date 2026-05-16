// Shared RAG Ops UI primitives.
// All components attached to window for cross-script sharing under Babel standalone.

const { useState, useEffect, useRef } = React;

// ── Helpers ─────────────────────────────────────────────────────────────
function thresholdClass(score) {
  if (score >= 0.70) return 'success';
  if (score >= 0.50) return 'warning';
  return 'danger';
}
function fmtPct(n) { return `${Math.round(n * 100)}%`; }

// ── Sidebar ─────────────────────────────────────────────────────────────
function Sidebar({ page, setPage, theme, setTheme }) {
  const NAV = [
    { section: 'Main', items: [
      { id: 'search', icon: 'ti-search', label: 'Search' },
    ]},
    { section: 'Evaluation', items: [
      { id: 'retrieval',  icon: 'ti-chart-bar',        label: 'Retrieval quality' },
      { id: 'generation', icon: 'ti-message-chatbot',  label: 'Generation quality' },
      { id: 'guardrails', icon: 'ti-shield-check',     label: 'Guardrails' },
      { id: 'metrics',    icon: 'ti-activity',         label: 'Product metrics' },
    ]},
    { section: 'System', items: [
      { id: 'runs',     icon: 'ti-list-check', label: 'Eval runs' },
      { id: 'settings', icon: 'ti-settings',   label: 'Settings' },
    ]},
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-logo health">
        <div className="icon"><i className="ti ti-heartbeat" /></div>
        <div className="wordmark">HealthRAG</div>
      </div>
      {NAV.map(s => (
        <React.Fragment key={s.section}>
          <div className="section-label">{s.section}</div>
          {s.items.map(it => (
            <button
              key={it.id}
              className={'nav-item' + (page === it.id ? ' active' : '')}
              onClick={() => setPage(it.id)}
            >
              <i className={'ti ' + it.icon} />
              <span>{it.label}</span>
            </button>
          ))}
        </React.Fragment>
      ))}
      <div className="sidebar-bottom">
        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
        >
          <i className={'ti ' + (theme === 'light' ? 'ti-moon' : 'ti-sun')} style={{ fontSize: 15 }} />
        </button>
        <div className="run-info">v1.0.0 · build 2031</div>
      </div>
    </aside>
  );
}

// ── Page header (title + tabs + run selector) ──────────────────────────
function PageHeader({ title, subtitle, runs, runId, setRunId, tabs, tabValue, setTabValue }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="title">{title}</h1>
        {subtitle && <div className="subtitle">{subtitle}</div>}
      </div>
      <div className="page-controls">
        {tabs && (
          <div className="tabs">
            {tabs.map(t => (
              <button key={t.id} className={'tab' + (tabValue === t.id ? ' active' : '')} onClick={() => setTabValue(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        {runs && <RunSelector runs={runs} value={runId} onChange={setRunId} />}
      </div>
    </div>
  );
}

// ── Run selector dropdown ──────────────────────────────────────────────
function RunSelector({ runs, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const current = runs.find(r => r.id === value) || runs[0];
  return (
    <div className="dropdown" ref={ref}>
      <button className="dropdown-trigger" onClick={() => setOpen(!open)}>
        <span className="label">Run</span>
        <span>{current.name}</span>
        <i className="ti ti-chevron-down" style={{ fontSize: 14, color: 'var(--text-tertiary)' }} />
      </button>
      {open && (
        <div className="dropdown-panel">
          {runs.map(r => (
            <div
              key={r.id}
              className={'dropdown-option' + (r.id === value ? ' active' : '')}
              onClick={() => { onChange(r.id); setOpen(false); }}
            >
              <div>
                <div className="run-name">{r.name}</div>
                <div className="run-date">{r.date} · {r.config}</div>
              </div>
              {r.id === value && <i className="ti ti-check" style={{ fontSize: 14, color: 'var(--accent)' }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Metric card ────────────────────────────────────────────────────────
function MetricCard({ label, value, mono, delta, desc, danger }) {
  return (
    <div className="metric-card">
      <div className="top">
        <span className="label">{label}</span>
        {delta && <Delta {...delta} />}
      </div>
      <div className={'value' + (danger ? ' danger' : '')} style={{ fontFamily: mono ? 'var(--font-mono)' : 'var(--font-display)' }}>{value}</div>
      {desc && <div className="desc">{desc}</div>}
    </div>
  );
}
function Delta({ value, kind = 'success' }) {
  if (kind === 'neutral') return <span className="pill neutral">no change</span>;
  const icon = kind === 'success' ? 'ti-trending-up' : 'ti-trending-down';
  return <span className={'pill ' + kind}><i className={'ti ' + icon} style={{ fontSize: 11 }} />{value}</span>;
}

// ── Panel ──────────────────────────────────────────────────────────────
function Panel({ title, subtitle, right, children }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="title-row">
          <h3>{title}</h3>
          {subtitle && <span className="subtitle">{subtitle}</span>}
        </div>
        {right}
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}

// ── Pill ───────────────────────────────────────────────────────────────
function Pill({ kind = 'neutral', children, mono }) {
  return <span className={'pill ' + kind + (mono ? ' mono' : '')}>{children}</span>;
}

// ── Bar row ────────────────────────────────────────────────────────────
function BarRow({ label, value, max = 1 }) {
  const cls = thresholdClass(value);
  return (
    <div className="bar-row">
      <div className="row-label">{label}</div>
      <div className="track"><div className="fill" style={{ width: `${(value / max) * 100}%`, background: `var(--${cls})` }} /></div>
      <div className="row-value">{value.toFixed(2)}</div>
    </div>
  );
}

// ── Trend line chart (hand-rolled SVG) ─────────────────────────────────
function TrendChart({ points, xLabels, yMin = 0.5, yMax = 0.9, accent = 'var(--accent)' }) {
  const W = 600, H = 130;
  const margin = { l: 30, r: 20, t: 10, b: 10 };
  const innerW = W - margin.l - margin.r;
  const innerH = H - margin.t - margin.b;
  const x = (i) => margin.l + (i / (points.length - 1)) * innerW;
  const y = (v) => margin.t + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const pathLine = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(' ');
  const pathFill = `${pathLine} L ${x(points.length - 1).toFixed(1)} ${H} L ${x(0).toFixed(1)} ${H} Z`;
  const gridY = [yMax, (yMax + yMin) / 2, yMin];
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0F6E56';
  return (
    <div style={{ height: 160, padding: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <linearGradient id={`g-${accentColor}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.16" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridY.map((g, i) => <line key={i} x1={margin.l} x2={W - margin.r} y1={y(g)} y2={y(g)} stroke="var(--border-light)" />)}
        <path d={pathFill} fill={`url(#g-${accentColor})`} />
        <path d={pathLine} stroke={accentColor} strokeWidth="2" fill="none" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p)} r="4" fill={accentColor} stroke="var(--bg-card)" strokeWidth="2" />
        ))}
      </svg>
      {xLabels && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, padding: `0 ${margin.r}px 0 ${margin.l}px`, fontSize: 11, color: 'var(--text-tertiary)' }}>
          {xLabels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      )}
    </div>
  );
}

// ── Score histogram ───────────────────────────────────────────────────
function ScoreHistogram({ columns }) {
  return (
    <div className="hist-grid">
      {columns.map(col => (
        <div className="hist-col" key={col.title}>
          <div className="hist-col-title">{col.title}</div>
          <div className="hist-bars">
            {col.bars.map((b, i) => {
              const color = b.kind ? `var(--${b.kind})` :
                col.binary ? (i === 0 ? 'var(--success)' : 'var(--danger)')
                  : (i <= 1 ? 'var(--danger)' : i === 2 ? 'var(--warning)' : 'var(--success)');
              return <div key={i} className={'hist-bar' + (col.binary ? ' wide' : '')} style={{ height: `${b.h}%`, background: color }} />;
            })}
          </div>
          <div className={'hist-axis' + (col.binary ? ' wide' : '')}>
            {col.labels.map((l, i) => <span key={i}>{l}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Failure row ───────────────────────────────────────────────────────
function FailureRow({ failure, expanded, onToggle }) {
  const f = failure;
  return (
    <div className={'failure-row' + (expanded ? ' expanded' : '')} onClick={onToggle}>
      <div className="question">"{f.question}"</div>
      <div className="meta">
        <Pill kind={f.pill}>{f.category}</Pill>
        <div className="scores">
          <span>P@5 {f.p5.toFixed(2)}</span>
          <span>R@5 {f.r5.toFixed(2)}</span>
          <span>MRR {f.mrr.toFixed(2)}</span>
        </div>
        <i className="ti ti-chevron-right chev" style={{ fontSize: 14 }} />
      </div>
      {expanded && (
        <div className="expanded-body">
          <div>
            <div className="section-mini-label">Expected chunks</div>
            {f.expected.map((e, i) => (
              <div key={i} className="chunk-ref relevant"><span className="path">{e}</span></div>
            ))}
          </div>
          <div>
            <div className="section-mini-label">Retrieved chunks</div>
            {f.retrieved.map((r, i) => (
              <div key={i} className={'chunk-ref ' + r.rel}>
                <span className="path">{r.path}</span>
                <Pill kind={r.rel === 'relevant' ? 'success' : r.rel === 'tangential' ? 'warning' : 'danger'}>{r.rel}</Pill>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Source chunk card ────────────────────────────────────────────────
function SourceCard({ src, active, onClick }) {
  const cls = thresholdClass(src.score);
  return (
    <div className={'source-card' + (active ? ' active' : '')} onClick={onClick}>
      <div className="row1">
        <span className="name">Source {src.id}</span>
        <span className={'score ' + cls}>{src.score.toFixed(2)}</span>
      </div>
      <div className="score-bar"><div className="score-fill" style={{ width: `${src.score * 100}%`, background: `var(--${cls})` }} /></div>
      <div className="path">{src.path}</div>
      <div className="content">{src.content}</div>
      <span className="external"><i className="ti ti-external-link" style={{ fontSize: 12 }} /> View original</span>
    </div>
  );
}

// ── Answer card ──────────────────────────────────────────────────────
function AnswerCard({ answer, activeCite, setActiveCite, onFeedback, feedback }) {
  return (
    <div className="panel fade-up" style={{ marginBottom: 20 }}>
      <div className="panel-header">
        <div className="title-row">
          <h3>Answer</h3>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--success)', display: 'inline-block' }} />
        </div>
        <span className="ds-mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)' }}>{answer.latency}</span>
      </div>
      <div className="panel-body" style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8 }}>
        {answer.body.map((seg, i) => seg.cite
          ? <span key={i} className="cite" style={ activeCite === seg.cite ? { background: '#C7EBDD' } : null } onClick={() => setActiveCite(seg.cite)}>Source {seg.cite}</span>
          : <span key={i}>{seg.text}</span>
        )}
      </div>
      <div style={{ padding: '14px 20px', borderTop: '0.5px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{answer.count}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={'btn-icon' + (feedback === 'up' ? ' active-up' : '')} onClick={() => onFeedback('up')}><i className="ti ti-thumb-up" style={{ fontSize: 15 }} /></button>
          <button className={'btn-icon' + (feedback === 'down' ? ' active-down' : '')} onClick={() => onFeedback('down')}><i className="ti ti-thumb-down" style={{ fontSize: 15 }} /></button>
          <button className="btn-icon"><i className="ti ti-copy" style={{ fontSize: 15 }} /></button>
        </div>
      </div>
    </div>
  );
}

// ── Toast ───────────────────────────────────────────────────────────
function Toast({ message }) {
  if (!message) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--text-primary)', color: 'var(--bg-card)',
      padding: '10px 18px', borderRadius: 'var(--radius-md)',
      fontSize: 13, fontWeight: 500,
      animation: 'fadeUp 200ms ease', zIndex: 100,
    }}>{message}</div>
  );
}

Object.assign(window, {
  Sidebar, PageHeader, RunSelector,
  MetricCard, Delta, Panel, Pill,
  BarRow, TrendChart, ScoreHistogram,
  FailureRow, SourceCard, AnswerCard, Toast,
  thresholdClass, fmtPct,
});
