// Product metrics dashboard with date range selector + bar chart for volume.
const { useState: useStateMetrics } = React;

function MetricsPage() {
  const D = window.RAG_DATA;
  const [range, setRange] = useStateMetrics('30d');
  const data = D.METRICS_SERIES[range];

  return (
    <div className="page">
      <PageHeader
        title="Product metrics"
        subtitle="How users actually use the system, day to day."
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, marginTop: -8 }}>
        <div className="range-selector">
          {[
            { id: '7d',  label: 'Last 7 days' },
            { id: '30d', label: 'Last 30 days' },
            { id: 'all', label: 'All time' },
          ].map(r => (
            <button key={r.id} className={range === r.id ? 'active' : ''} onClick={() => setRange(r.id)}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="metric-grid">
        <MetricCard label="Total queries"        mono value={data.totals.queries} delta={{ kind: 'success', value: '18%' }} desc={range === 'all' ? 'all-time' : (range === '7d' ? 'last 7 days' : 'last 30 days')} />
        <MetricCard label="% personalized"       mono value="34%"                 delta={{ kind: 'success', value: '8%' }}  desc="queries with uploaded report" />
        <MetricCard label="Disclaimer (live)"    mono value="100%"                delta={{ kind: 'neutral' }}                desc="production answers compliant" />
        <MetricCard label="Avg latency"          mono value={data.totals.lat}     delta={{ kind: 'success', value: '12%' }} desc="P50 across all queries" />
      </div>

      <Panel title="Daily query volume" subtitle={rangeLabel(range)}>
        <BarChart values={data.volume} labels={data.labels} unit="queries" />
      </Panel>

      <Panel title="Satisfaction trend" subtitle={`Daily thumbs-up rate · target 80%`}>
        <TrendChartWithTarget
          points={data.satisfaction}
          xLabels={data.labels}
          yMin={0.60} yMax={0.95}
          target={0.80}
          format={v => `${Math.round(v*100)}%`}
        />
      </Panel>

      <Panel title="Latency trend" subtitle={`Daily P50 · target 2.0s`}>
        <TrendChartWithTarget
          points={data.latency}
          xLabels={data.labels}
          yMin={1.5} yMax={Math.max(...data.latency) * 1.1}
          target={2.0}
          targetInverse
          format={v => `${v.toFixed(1)}s`}
        />
      </Panel>
    </div>
  );
}

function rangeLabel(range) {
  if (range === '7d') return 'Last 7 days';
  if (range === '30d') return 'Last 30 days';
  return 'All time';
}

// Simple bar chart for daily volume
function BarChart({ values, labels, unit }) {
  const max = Math.max(...values);
  const accent = 'var(--accent)';
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140, padding: '0 6px' }}>
        {values.map((v, i) => {
          const h = (v / max) * 100;
          return (
            <div
              key={i}
              title={`${labels[i] || ''}: ${v} ${unit}`}
              style={{
                flex: 1,
                height: `${h}%`,
                background: accent,
                borderRadius: '4px 4px 0 0',
                animation: 'barGrow 400ms ease-out both',
                transformOrigin: 'bottom',
                animationDelay: `${i * 12}ms`,
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 4, padding: '8px 6px 0', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
        {labels.map((l, i) => (
          <span key={i} style={{ flex: 1, textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

// Trend chart with a horizontal target reference line
function TrendChartWithTarget({ points, xLabels, yMin, yMax, target, targetInverse, format }) {
  const W = 600, H = 130;
  const margin = { l: 30, r: 20, t: 10, b: 10 };
  const innerW = W - margin.l - margin.r;
  const innerH = H - margin.t - margin.b;
  const x = (i) => margin.l + (i / (points.length - 1)) * innerW;
  const y = (v) => margin.t + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const pathLine = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(' ');
  const pathFill = `${pathLine} L ${x(points.length - 1).toFixed(1)} ${H} L ${x(0).toFixed(1)} ${H} Z`;

  const last = points[points.length - 1];
  const hitsTarget = targetInverse ? last <= target : last >= target;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0F6E56';
  const lineColor = hitsTarget ? accent : (getComputedStyle(document.documentElement).getPropertyValue('--warning').trim() || '#BA7517');

  return (
    <div style={{ height: 170 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%">
        <defs>
          <linearGradient id="metric-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.16" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[yMax, (yMax+yMin)/2, yMin].map((g, i) => (
          <line key={i} x1={margin.l} x2={W - margin.r} y1={y(g)} y2={y(g)} stroke="var(--border-light)" />
        ))}
        {/* Target reference line */}
        <line
          x1={margin.l} x2={W - margin.r}
          y1={y(target)} y2={y(target)}
          stroke="var(--text-tertiary)"
          strokeDasharray="3 3"
          opacity="0.6"
        />
        <text x={W - margin.r} y={y(target) - 4} textAnchor="end" fontSize="9" fill="var(--text-tertiary)" fontFamily="var(--font-mono)">
          target {format(target)}
        </text>
        <path d={pathFill} fill="url(#metric-grad)" />
        <path d={pathLine} stroke={lineColor} strokeWidth="2" fill="none" />
        {points.map((p, i) => {
          if (i !== points.length - 1 && i % Math.max(1, Math.floor(points.length / 7)) !== 0) return null;
          return <circle key={i} cx={x(i)} cy={y(p)} r={i === points.length - 1 ? 5 : 3} fill={lineColor} stroke="var(--bg-card)" strokeWidth="2" />;
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, padding: `0 ${margin.r}px 0 ${margin.l}px`, fontSize: 11, color: 'var(--text-tertiary)' }}>
        {xLabels.filter((l, i) => l).map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </div>
  );
}

window.MetricsPage = MetricsPage;
