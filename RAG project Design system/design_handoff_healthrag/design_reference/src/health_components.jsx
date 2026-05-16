// HealthRAG components: UploadZone, UploadProgress, HealthSummary, CriticalAlert,
// Disclaimer, UploadNudge, YourValuesCard, RefusalBlock, ConfirmDialog,
// GuardrailFailureRow, source card with org tag.

const { useState: useStateH, useEffect: useEffectH, useRef: useRefH } = React;

// ── Upload zone ─────────────────────────────────────────────────────
function UploadZone({ onFile }) {
  const inputRef = useRefH(null);
  const [drag, setDrag] = useStateH(false);
  const [err, setErr] = useStateH('');

  function handle(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setErr('Only PDF files are supported. Most Indian labs provide reports as PDF.');
      setTimeout(() => setErr(''), 5000);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErr('File too large. Maximum 10 MB.');
      setTimeout(() => setErr(''), 5000);
      return;
    }
    setErr('');
    onFile(file);
  }
  return (
    <div>
      <button
        type="button"
        className={'upload-zone' + (drag ? ' drag-over' : '')}
        onClick={() => inputRef.current && inputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => {
          e.preventDefault(); setDrag(false);
          const f = e.dataTransfer.files && e.dataTransfer.files[0];
          handle(f);
        }}
        aria-label="Upload your lab report PDF for personalized answers"
      >
        <i className="ti ti-file-upload" />
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span>Upload your lab report (PDF) for personalized answers</span>
          <span className="meta">Stays in your session · deleted in 24 h · max 10 MB</span>
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          style={{ display: 'none' }}
          onChange={e => handle(e.target.files && e.target.files[0])}
        />
      </button>
      {err && <div className="upload-error"><i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{err}</div>}
    </div>
  );
}

// ── Upload progress (sequential processing steps) ───────────────────
function UploadProgress({ filename, onDone, mode = 'normal' }) {
  const steps = [
    { label: 'Uploading file…',               duration: 700 },
    { label: 'Extracting text from PDF…',     duration: 900 },
    { label: 'Identifying lab parameters…',   duration: 800 },
    { label: 'Matching against reference ranges…', duration: 700 },
    { label: 'Checking for critical values…', duration: 600 },
  ];
  const [stepIdx, setStepIdx] = useStateH(0);
  const [pct, setPct] = useStateH(0);

  useEffectH(() => {
    let cancelled = false;
    async function run() {
      let cumPct = 0;
      for (let i = 0; i < steps.length; i++) {
        if (cancelled) return;
        setStepIdx(i);
        const target = Math.round(((i + 1) / steps.length) * 100);
        const start = cumPct;
        const stepDur = steps[i].duration;
        const t0 = performance.now();
        await new Promise(res => {
          function tick() {
            const dt = (performance.now() - t0) / stepDur;
            const v = start + (target - start) * Math.min(dt, 1);
            setPct(Math.round(v));
            if (dt >= 1) res(); else requestAnimationFrame(tick);
          }
          tick();
        });
        cumPct = target;
      }
      if (!cancelled) {
        setTimeout(onDone, 250);
      }
    }
    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="upload-progress">
      <div className="filename">
        <i className="ti ti-file-text" />
        <span>{filename}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)' }}>{pct}%</span>
      </div>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
      <div className="status"><span className="spin" /><span>{steps[stepIdx].label}</span></div>
    </div>
  );
}

// ── Health summary card ─────────────────────────────────────────────
function HealthSummaryCard({ report, onClose }) {
  const [expanded, setExpanded] = useStateH(false);
  const shown = expanded ? report.values : report.values.slice(0, report.shownByDefault);
  const aboveNormal = report.values.filter(v => v.status !== 'normal').length;
  return (
    <div className="health-summary">
      <div className="head">
        <div>
          <h3>Your lab results</h3>
          <div className="meta">uploaded {report.uploadedAt} · {report.filename}</div>
        </div>
        <button className="icon-close" onClick={onClose} aria-label="Remove uploaded report">
          <i className="ti ti-x" style={{ fontSize: 16 }} />
        </button>
      </div>
      <div className="body">
        {shown.map((v, i) => (
          <div key={i} className={'param-row' + (v.status === 'critical' ? ' critical' : '')}>
            <span className="name">{v.name}</span>
            <span className="value">{v.value}<span className="unit">{v.unit}</span></span>
            <span className={'status-badge ' + v.status}>
              {v.status === 'normal'   && <><i className="ti ti-check"            style={{ fontSize: 11 }} />normal</>}
              {v.status === 'high'     && <><i className="ti ti-arrow-up"         style={{ fontSize: 11 }} />high</>}
              {v.status === 'low'      && <><i className="ti ti-arrow-down"       style={{ fontSize: 11 }} />low</>}
              {v.status === 'critical' && <><i className="ti ti-alert-triangle"   style={{ fontSize: 12 }} />critical</>}
            </span>
          </div>
        ))}
      </div>
      {report.values.length > report.shownByDefault && (
        <button className="expand-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded ? '↑ Show fewer values' : `+ ${report.values.length - report.shownByDefault} more values`}
        </button>
      )}
      <div className="footer">
        <span>{report.values.length} values extracted · {aboveNormal} outside normal range</span>
        <span className="privacy"><i className="ti ti-lock" style={{ fontSize: 12 }} />Session only · deleted in 24 h</span>
      </div>
    </div>
  );
}

// ── Critical alert ──────────────────────────────────────────────────
function CriticalAlert({ flags }) {
  if (!flags || flags.length === 0) return null;
  return (
    <div className="critical-alert" role="alert" aria-live="assertive">
      <i className="ti ti-alert-triangle lead" />
      <div className="body">
        <div className="title">Critical value detected</div>
        <div className="msg">
          {flags.length === 1
            ? <>Your {flags[0].name.toLowerCase()} ({flags[0].value} {flags[0].unit}) is above the critical threshold ({flags[0].threshold}). Please seek medical attention promptly.</>
            : <>Multiple critical values detected: {flags.map(f => `${f.name} (${f.value})`).join(', ')}. Please seek medical attention promptly.</>}
        </div>
        <div className="note">This is an automated alert based on standard medical thresholds, not a diagnosis. Please consult your doctor.</div>
      </div>
    </div>
  );
}

// ── Disclaimer banner ───────────────────────────────────────────────
function Disclaimer() {
  return (
    <div className="disclaimer" role="note" aria-label="Medical disclaimer: this is not medical advice">
      <i className="ti ti-stethoscope" />
      <span>{window.HEALTH_DATA.DISCLAIMER_TEXT}</span>
    </div>
  );
}

// ── Upload nudge ────────────────────────────────────────────────────
function UploadNudge({ onClick }) {
  return (
    <button className="upload-nudge" onClick={onClick}>
      <i className="ti ti-file-upload" />
      <span>Upload your lab report for personalized answers based on YOUR health data →</span>
    </button>
  );
}

// ── "Your values" card ──────────────────────────────────────────────
function YourValuesCard({ report, names }) {
  if (!report || !names || names.length === 0) return null;
  const rows = report.values.filter(v => names.includes(v.name));
  if (rows.length === 0) return null;
  return (
    <div className="your-values">
      <div className="label">Your values</div>
      <div className="rows">
        {rows.map(v => (
          <div className="row" key={v.name}>
            <span>{v.name}</span>
            <span>
              <span className="v">{v.value} {v.unit}</span>
              <span style={{ marginLeft: 8 }} className={'status-badge ' + v.status}>
                {v.status === 'normal'   && <><i className="ti ti-check"            style={{ fontSize: 11 }} />normal</>}
                {v.status === 'high'     && <><i className="ti ti-arrow-up"         style={{ fontSize: 11 }} />high</>}
                {v.status === 'low'      && <><i className="ti ti-arrow-down"       style={{ fontSize: 11 }} />low</>}
                {v.status === 'critical' && <><i className="ti ti-alert-triangle"   style={{ fontSize: 12 }} />critical</>}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Refusal block (blue/info) ───────────────────────────────────────
function RefusalBlock({ text }) {
  return (
    <div className="refusal-block" aria-label="The system cannot diagnose conditions">
      <i className="ti ti-shield-check" />
      <div className="text">{text}</div>
    </div>
  );
}

// ── Confirm dialog ──────────────────────────────────────────────────
function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="actions">
          <button className="example-pill" onClick={onCancel}>{cancelLabel}</button>
          <button className="btn-primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Source card with org tag (replaces base SourceCard for health) ──
function HealthSourceCard({ src, active, onClick }) {
  const cls = src.score >= 0.70 ? 'success' : src.score >= 0.50 ? 'warning' : 'danger';
  return (
    <div className={'source-card' + (active ? ' active' : '')} onClick={onClick}>
      <span className={'org-tag ' + (src.org || '').toLowerCase()}>{src.org}</span>
      <div className="row1">
        <span className="name">Source {src.id}</span>
        <span className={'score ' + cls}>{src.score.toFixed(2)}</span>
      </div>
      <div className="score-bar"><div className="score-fill" style={{ width: `${src.score * 100}%`, background: `var(--${cls})` }} /></div>
      <div className="path">{src.path}</div>
      <div className="content">{src.content}</div>
      {src.drug && <span className="drug-tag">{src.drug}</span>}
      <span className="external" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: 11 }}>
        <i className="ti ti-external-link" style={{ fontSize: 12 }} /> View original
      </span>
    </div>
  );
}

// ── Render answer body with cite pills + user-value marks + critical callout ──
function HealthAnswerBody({ body, activeCite, setActiveCite, leadCritical, sources }) {
  return (
    <div className="answer-body" style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8 }}>
      {leadCritical && (
        <div className="crit-callout">
          <i className="ti ti-alert-triangle" />
          <div className="text">{leadCritical}</div>
        </div>
      )}
      {body.map((seg, i) => {
        if (seg.cite) {
          const validSource = sources && sources.some(s => s.id === seg.cite);
          return (
            <span
              key={i}
              className={'cite' + (!validSource ? ' dim' : '')}
              style={ activeCite === seg.cite && validSource ? { background: '#C7EBDD' } : null }
              onClick={() => validSource && setActiveCite(activeCite === seg.cite ? null : seg.cite)}
              title={validSource ? '' : 'Source not available'}
            >Source {seg.cite}</span>
          );
        }
        if (seg.mark) {
          return <mark key={i} className="user-value">{seg.mark}</mark>;
        }
        const parts = (seg.text || '').split('\n\n');
        return parts.map((p, j) => (
          <React.Fragment key={`${i}-${j}`}>
            <span>{p}</span>
            {j < parts.length - 1 && <><br /><br /></>}
          </React.Fragment>
        ));
      })}
    </div>
  );
}

// ── Guardrail failure row (expandable) ──────────────────────────────
function GuardrailFailureRow({ f, expanded, onToggle }) {
  return (
    <div className={'guard-failure' + (expanded ? ' expanded' : '')} onClick={onToggle}>
      <div className="head">
        <div className="pills">
          <Pill kind={f.pill}>{f.category}</Pill>
          <Pill kind="danger">guardrail failed: {f.failedGuardrail}</Pill>
        </div>
        <i className="ti ti-chevron-right chev" style={{ fontSize: 14 }} />
      </div>
      <div className="question">"{f.question}"</div>
      {expanded && (
        <div className="expanded-body">
          <div className="block">
            <div className="label">Expected behavior</div>
            <div className="text">{f.expected}</div>
          </div>
          <div className="block">
            <div className="label">Actual response</div>
            <div className="text">{renderWithMarks(f.actual, f.actualHighlight)}</div>
          </div>
          <div className="block">
            <div className="label">Why it failed</div>
            <div className="text">{f.why}</div>
          </div>
        </div>
      )}
    </div>
  );
}
function renderWithMarks(text, marks) {
  if (!marks || marks.length === 0) return text;
  let parts = [text];
  marks.forEach(h => {
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

Object.assign(window, {
  UploadZone, UploadProgress,
  HealthSummaryCard, CriticalAlert,
  Disclaimer, UploadNudge, YourValuesCard,
  RefusalBlock, ConfirmDialog,
  HealthSourceCard, HealthAnswerBody,
  GuardrailFailureRow,
});
