// Shared extras: skeleton loaders, toast stack, empty state, comparison view,
// expandable generation-failure row. All attached to window for Babel sharing.

const { useState: useStateX, useEffect: useEffectX, useRef: useRefX, useCallback: useCallbackX } = React;

// ── Skeleton primitives ─────────────────────────────────────────────
function Skel({ w = '100%', h = 12, style }) {
  return <span className="skel" style={{ width: w, height: h, ...style }} />;
}
function SkeletonLines({ widths }) {
  return (
    <div>
      {widths.map((w, i) => <Skel key={i} w={w} h={12} style={{ marginBottom: 10, display: 'block' }} />)}
    </div>
  );
}

// Search loading state — answer card + 3 source skeletons
function SearchSkeleton() {
  return (
    <div>
      <div className="panel fade-up" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <div className="title-row"><Skel w={50} h={12} /></div>
          <Skel w={40} h={10} />
        </div>
        <div className="panel-body" style={{ paddingTop: 22 }}>
          <Skel w={'100%'} h={12} style={{ marginBottom: 10, display: 'block' }} />
          <Skel w={'88%'}  h={12} style={{ marginBottom: 10, display: 'block' }} />
          <Skel w={'94%'}  h={12} style={{ marginBottom: 10, display: 'block' }} />
          <Skel w={'72%'}  h={12} style={{ display: 'block' }} />
        </div>
        <div style={{ padding: '14px 20px', borderTop: '0.5px solid var(--border-light)', display: 'flex', justifyContent: 'space-between' }}>
          <Skel w={120} h={10} />
          <Skel w={80} h={10} />
        </div>
      </div>
      <div className="source-grid">
        {[0,1,2].map(i => (
          <div className="source-card" key={i} style={{ animationDelay: `${50*i}ms` }}>
            <div className="row1"><Skel w={48} h={10} /><Skel w={32} h={10} /></div>
            <Skel w={'100%'} h={4} style={{ marginBottom: 10 }} />
            <Skel w={'70%'} h={10} style={{ marginBottom: 8, display: 'block' }} />
            <Skel w={'95%'} h={10} style={{ marginBottom: 6, display: 'block' }} />
            <Skel w={'85%'} h={10} style={{ display: 'block' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Dashboard skeleton for metric grid
function MetricGridSkeleton() {
  return (
    <div className="metric-grid">
      {[0,1,2,3].map(i => (
        <div className="metric-card" key={i}>
          <div className="top"><Skel w={64} h={10} /><Skel w={36} h={14} /></div>
          <Skel w={'60%'} h={26} style={{ marginTop: 4, marginBottom: 10, display: 'block' }} />
          <Skel w={'80%'} h={10} />
        </div>
      ))}
    </div>
  );
}

// ── Toast stack ─────────────────────────────────────────────────────
const ToastCtx = React.createContext({ push: () => {} });

function ToastProvider({ children }) {
  const [items, setItems] = useStateX([]);
  const push = useCallbackX((message, kind = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setItems(prev => [...prev, { id, message, kind, exiting: false }]);
    setTimeout(() => setItems(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t)), 2000);
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 2300);
  }, []);
  function iconFor(kind) {
    if (kind === 'success') return 'ti-circle-check';
    if (kind === 'danger')  return 'ti-alert-triangle';
    if (kind === 'info')    return 'ti-info-circle';
    return 'ti-circle-check';
  }
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toast-stack">
        {items.map(t => (
          <div key={t.id} className={'toast ' + t.kind + (t.exiting ? ' exiting' : '')}
               onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))}>
            <i className={'ti ' + iconFor(t.kind)} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
function useToast() { return React.useContext(ToastCtx); }

// ── Empty state ─────────────────────────────────────────────────────
function EmptyState({ icon = 'ti-chart-bar', title, body, code }) {
  return (
    <div className="empty-state">
      <div className="icon-circle"><i className={'ti ' + icon} /></div>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {code && <code>{code}</code>}
    </div>
  );
}

// ── Confidence dot ──────────────────────────────────────────────────
function ConfidenceDot({ score }) {
  const kind = score >= 0.70 ? 'success' : 'warning';
  return <span className={'conf-dot ' + kind} title={'Confidence ' + score.toFixed(2)} />;
}

// ── Comparison view ─────────────────────────────────────────────────
function CompareView({ runA, runB, onBack }) {
  const metrics = [
    { key: 'p5',  label: 'Precision@5',     fmt: v => v.toFixed(2), better: 'up' },
    { key: 'r5',  label: 'Recall@5',        fmt: v => v.toFixed(2), better: 'up' },
    { key: 'mrr', label: 'MRR',             fmt: v => v.toFixed(2), better: 'up' },
    { key: 'faithfulness', label: 'Faithfulness', fmt: v => v.toFixed(1), better: 'up' },
    { key: 'hallucination', label: 'Halluc. rate', fmt: v => `${Math.round(v*100)}%`, better: 'down' },
  ];

  // Build trend data for both runs across all eval runs
  const allRuns = window.RAG_DATA.EVAL_RUNS;

  return (
    <div className="page">
      <button className="back-link" onClick={onBack}><i className="ti ti-arrow-left" style={{ fontSize: 13 }} /> Back to eval runs</button>
      <PageHeader
        title={`Comparing: ${runA.name} vs ${runB.name}`}
        subtitle={`${runA.date} · ${runA.config} → ${runB.date} · ${runB.config}`}
      />

      {/* Side-by-side metric cards */}
      <div className="compare-grid">
        <div className="compare-card">
          <div className="head"><span className="name">{runA.name}</span><span className="tag">{runA.date}</span></div>
        </div>
        <div className="compare-card">
          <div className="head"><span className="name">{runB.name}</span><span className="tag">{runB.date}</span></div>
        </div>
      </div>
      <Panel title="Metric deltas" subtitle="How runB compares to runA">
        {metrics.map(m => {
          const a = runA[m.key], b = runB[m.key];
          const diff = b - a;
          const isImprovement = (m.better === 'up') ? diff > 0 : diff < 0;
          const isRegression  = (m.better === 'up') ? diff < 0 : diff > 0;
          const cls = Math.abs(diff) < (m.key === 'hallucination' ? 0.005 : 0.01)
            ? 'neutral'
            : (isImprovement ? 'up' : 'down');
          const sign = diff > 0 ? '+' : '';
          const deltaText = m.key === 'hallucination'
            ? `${sign}${Math.round(diff*100)}%`
            : `${sign}${diff.toFixed(m.key === 'faithfulness' ? 1 : 2)}`;
          return (
            <div key={m.key} className="compare-row">
              <span className="label">{m.label}</span>
              <span style={{ display: 'flex', gap: 24, alignItems: 'baseline' }}>
                <span className="val">{m.fmt(a)}</span>
                <i className="ti ti-arrow-right" style={{ fontSize: 13, color: 'var(--text-tertiary)' }} />
                <span className="val">{m.fmt(b)}</span>
              </span>
              <span className={'delta ' + cls}>{cls === 'neutral' ? '—' : deltaText}</span>
            </div>
          );
        })}
      </Panel>

      {/* Config diff */}
      <div className="config-diff">
        <div className="head">What changed</div>
        <div className="body">
          <div className="diff-line">
            <span className="key">reranker_enabled</span>
            <span className="from">{runA.id === 'r1' ? 'false' : 'true'}</span>
            <span className="arrow">→</span>
            <span className="to">{runB.id === 'r1' ? 'false' : 'true'}</span>
          </div>
          <div className="diff-line">
            <span className="key">retriever</span>
            <span className="from">bm25</span>
            <span className="arrow">→</span>
            <span className="to">hybrid (bm25 + cohere-rerank-3.5)</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6, paddingTop: 6 }}>
            All other config values identical.
          </div>
        </div>
      </div>

      {/* Overlaid trend */}
      <Panel title="Precision@5 across all runs" subtitle="Both runs highlighted on the timeline">
        <OverlayTrendChart
          allRuns={allRuns}
          highlightA={runA.id}
          highlightB={runB.id}
        />
      </Panel>

      {/* Failure comparison */}
      <Panel title="Where they differ most" subtitle="Per-question P@5 delta — biggest swings first">
        <table className="fail-compare">
          <thead>
            <tr>
              <th>Question</th>
              <th style={{ textAlign: 'right' }}>{runA.name}</th>
              <th style={{ textAlign: 'right' }}>{runB.name}</th>
              <th style={{ textAlign: 'right' }}>Δ</th>
            </tr>
          </thead>
          <tbody>
            {[
              { q: 'What is the home office stipend at GitLab?', a: 0.40, b: 0.80 },
              { q: 'How do Stripe radius rules interact with manual review queues for cards issued in Brazil?', a: 0.20, b: 0.60 },
              { q: 'How is on-call compensation paid?', a: 0.60, b: 0.40 },
              { q: 'What is GitLab’s PTO policy?', a: 0.80, b: 1.00 },
              { q: 'How are conference travel expenses reimbursed?', a: 0.20, b: 0.40 },
              { q: 'What is the team-transfer process when no role is posted?', a: 0.40, b: 0.20 },
            ].sort((x,y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a)).map((row, i) => {
              const d = row.b - row.a;
              const cls = d > 0 ? 'up' : d < 0 ? 'down' : '';
              return (
                <tr key={i}>
                  <td className="q">"{row.q}"</td>
                  <td className="num">{row.a.toFixed(2)}</td>
                  <td className="num">{row.b.toFixed(2)}</td>
                  <td className={'delta ' + cls}>{d > 0 ? '+' : ''}{d.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// Overlay trend with two highlighted runs
function OverlayTrendChart({ allRuns, highlightA, highlightB }) {
  const W = 600, H = 130;
  const margin = { l: 30, r: 20, t: 10, b: 10 };
  const innerW = W - margin.l - margin.r;
  const innerH = H - margin.t - margin.b;
  const reversed = [...allRuns].reverse();
  const points = reversed.map(r => r.p5);
  const labels = reversed.map(r => r.name);
  const yMin = 0.55, yMax = 0.85;
  const x = (i) => margin.l + (i / (points.length - 1)) * innerW;
  const y = (v) => margin.t + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const path = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(' ');
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0F6E56';

  return (
    <div style={{ height: 160 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%">
        {[yMax, (yMax+yMin)/2, yMin].map((g, i) => (
          <line key={i} x1={margin.l} x2={W - margin.r} y1={y(g)} y2={y(g)} stroke="var(--border-light)" />
        ))}
        <path d={path} stroke={accent} strokeWidth="2" fill="none" opacity="0.4" />
        {reversed.map((r, i) => {
          const isA = r.id === highlightA;
          const isB = r.id === highlightB;
          const highlight = isA || isB;
          return (
            <g key={r.id}>
              {highlight && <circle cx={x(i)} cy={y(points[i])} r="11" fill={accent} opacity="0.12" />}
              <circle cx={x(i)} cy={y(points[i])}
                      r={highlight ? 6 : 3.5}
                      fill={highlight ? accent : 'var(--bg-card)'}
                      stroke={accent} strokeWidth={highlight ? 0 : 1.5} />
              {highlight && (
                <text x={x(i)} y={y(points[i]) - 14}
                      fontSize="10" textAnchor="middle"
                      fontFamily="var(--font-mono)"
                      fill="var(--text-primary)">
                  {isA ? 'A' : 'B'}: {points[i].toFixed(2)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, padding: `0 ${margin.r}px 0 ${margin.l}px`, fontSize: 11, color: 'var(--text-tertiary)' }}>
        {labels.map((l, i) => <span key={i} style={{ opacity: i % 2 === 0 ? 1 : 0.6 }}>{l}</span>)}
      </div>
    </div>
  );
}

// ── Expandable generation-failure row ───────────────────────────────
function GenFailureRow({ g, expanded, onToggle }) {
  return (
    <div className={'gen-failure expandable' + (expanded ? ' expanded' : '')} onClick={onToggle}>
      <div className="head-row">
        <div className="pills">
          <Pill kind={g.pill}>{g.category}</Pill>
          {g.hallucinated && <Pill kind="danger">hallucination detected</Pill>}
        </div>
        <div className="scores">
          <span>Faith {g.scores.faith.toFixed(1)}</span>
          <span>Comp  {g.scores.comp.toFixed(1)}</span>
          <span>Rel   {g.scores.rel.toFixed(1)}</span>
        </div>
        <i className="ti ti-chevron-right chev" style={{ fontSize: 14 }} />
      </div>
      <div className="question">"{g.question}"</div>
      {expanded && (
        <div style={{ marginTop: 14 }}>
          <div className="answer-block">
            <div className="label">Generated answer</div>
            <div className="answer">{renderAnswerWithMarks(g.answer, g.halluc)}</div>
          </div>
          <div className="judge-block">
            <div className="label">Judge reasoning</div>
            <div className="text">{g.judge}</div>
          </div>
          <div>
            <div className="label" style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>Retrieved context</div>
            <div className="retrieved-list">
              {g.retrieved.map((r, i) => (
                <div key={i} className="chunk-ref relevant">
                  <span className="path">{r.path}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>{r.score.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function renderAnswerWithMarks(text, marks) {
  let parts = [text];
  (marks || []).forEach(h => {
    const next = [];
    for (const part of parts) {
      if (typeof part === 'string') {
        const idx = part.indexOf(h);
        if (idx >= 0) {
          next.push(part.slice(0, idx));
          next.push(<mark key={h + idx}>{h}</mark>);
          next.push(part.slice(idx + h.length));
        } else next.push(part);
      } else next.push(part);
    }
    parts = next;
  });
  return parts.map((p, i) => typeof p === 'string' ? <span key={i}>{p}</span> : p);
}

// ── Highlighted trend chart (current run gets larger dot + accent ring) ──
function HighlightedTrendChart({ runs, currentRunId, metric = 'p5', yMin = 0.55, yMax = 0.85 }) {
  const W = 600, H = 130;
  const margin = { l: 30, r: 20, t: 10, b: 10 };
  const innerW = W - margin.l - margin.r;
  const innerH = H - margin.t - margin.b;
  const reversed = [...runs].reverse();
  const points = reversed.map(r => r[metric]);
  const x = (i) => margin.l + (i / (points.length - 1)) * innerW;
  const y = (v) => margin.t + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const pathLine = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(' ');
  const pathFill = `${pathLine} L ${x(points.length - 1).toFixed(1)} ${H} L ${x(0).toFixed(1)} ${H} Z`;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0F6E56';
  const [hover, setHover] = useStateX(null);
  const wrapRef = useRefX(null);

  return (
    <div className="trend-wrap" ref={wrapRef} style={{ height: 180 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%">
        <defs>
          <linearGradient id="hl-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.18" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[yMax, (yMax+yMin)/2, yMin].map((g, i) => (
          <line key={i} x1={margin.l} x2={W - margin.r} y1={y(g)} y2={y(g)} stroke="var(--border-light)" />
        ))}
        <path d={pathFill} fill="url(#hl-grad)" />
        <path d={pathLine} stroke={accent} strokeWidth="2" fill="none" />
        {reversed.map((r, i) => {
          const isCurrent = r.id === currentRunId;
          return (
            <g key={r.id}
               onMouseEnter={() => setHover({ run: r, x: x(i), y: y(points[i]) })}
               onMouseLeave={() => setHover(null)}
               style={{ cursor: 'pointer' }}>
              {isCurrent && <circle cx={x(i)} cy={y(points[i])} r="10" fill={accent} opacity="0.14" />}
              <circle cx={x(i)} cy={y(points[i])}
                      r={isCurrent ? 7 : 4.5}
                      fill={isCurrent ? accent : 'var(--bg-card)'}
                      stroke={accent} strokeWidth="2" />
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, padding: `0 ${margin.r}px 0 ${margin.l}px`, fontSize: 11, color: 'var(--text-tertiary)' }}>
        {reversed.map((r, i) => (
          <span key={i} style={{ color: r.id === currentRunId ? 'var(--accent-text)' : 'inherit', fontWeight: r.id === currentRunId ? 500 : 400 }}>
            {r.name}
          </span>
        ))}
      </div>
      {hover && wrapRef.current && (
        <div className="trend-tooltip" style={{
          left:  `calc(${(hover.x / W) * 100}% + 0px)`,
          top:   `calc(${(hover.y / H) * 100}% - 0px)`,
        }}>
          {hover.run.name} · {hover.run[metric].toFixed(2)}
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  Skel, SearchSkeleton, MetricGridSkeleton,
  ToastProvider, useToast,
  EmptyState, ConfidenceDot,
  CompareView, OverlayTrendChart,
  GenFailureRow, renderAnswerWithMarks,
  HighlightedTrendChart,
});
