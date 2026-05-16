// HealthRAG Search page — empty → upload OR search loading → answer (generic, personalized,
// drug-interaction, IDK, refusal, critical). Disclaimer always present on answers.

const { useState: useStateSearch, useEffect: useEffectSearch, useRef: useRefSearch } = React;

function SearchPage() {
  const H = window.HEALTH_DATA;
  const toast = useToast();

  // Upload state
  const [report, setReport]   = useStateSearch(null);          // parsed health report
  const [uploadFile, setUploadFile] = useStateSearch(null);    // mid-processing
  const [pendingCriticalMode, setPendingCriticalMode] = useStateSearch(false);

  // Search state
  const [query, setQuery] = useStateSearch('');
  const [phase, setPhase] = useStateSearch('idle');             // idle | loading | answer
  const [answerMode, setAnswerMode] = useStateSearch(null);     // generic | personalized | drug | idk | refusal
  const [activeCite, setActiveCite] = useStateSearch(null);
  const [feedback, setFeedback] = useStateSearch(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useStateSearch(false);

  const inputRef = useRefSearch(null);

  // ── Helpers ──────────────────────────────────────────────────────────
  function decideMode(text) {
    const lower = text.toLowerCase();
    // IDK triggers
    if (/homeopath|ayurvedic cure|broken arm at home|miracle/i.test(text)) return 'idk';
    // Diagnosis-refusal triggers
    if (/am i (diabetic|hypertensive|prediabetic|sick)|do i have|am i .*diabet/i.test(text)) return 'refusal';
    // Drug interaction triggers
    if (/(metformin|aspirin|crocin|paracetamol|azithromycin).*(with|and|combined)|interact/i.test(text)) return 'drug';
    // Personalized triggers (require an uploaded report + cholesterol/lipid context)
    if (report && /(cholesterol|hdl|ldl|lipid|my numbers|my report|hba1c|sugar|glucose)/i.test(text)) {
      // Critical pathway if user asks about potassium and report has it critical
      if (/potassium/i.test(text) && report.criticalFlags.length > 0) return 'personalized_critical';
      return 'personalized';
    }
    return 'generic';
  }

  function submit(q) {
    const text = (q || query).trim();
    if (!text) return;
    setQuery(text);
    setActiveCite(null);
    setFeedback(null);
    const mode = decideMode(text);
    setAnswerMode(mode);
    setPhase('loading');
    const delay = mode === 'idk' ? 800 : (mode === 'drug' ? 1600 : 1300) + Math.random() * 500;
    setTimeout(() => setPhase('answer'), delay);
  }

  // ── Upload handlers ──────────────────────────────────────────────────
  function onFile(file) {
    // For demo, decide if this is the critical-value variant
    setUploadFile(file);
    setPendingCriticalMode(/critic|6\.2/i.test(file.name));
  }
  function onProcessingDone() {
    const r = pendingCriticalMode ? H.MOCK_LAB_REPORT_CRITICAL : H.MOCK_LAB_REPORT;
    setReport(r);
    setUploadFile(null);
    setPendingCriticalMode(false);
    toast.push('Lab report loaded · personalized mode on', 'success');
  }
  function removeReport() {
    setShowRemoveConfirm(false);
    setReport(null);
    setAnswerMode(null);
    setPhase('idle');
    setQuery('');
    toast.push('Report removed · back to generic mode', 'info');
  }

  // ── Keyboard shortcut ───────────────────────────────────────────────
  useEffectSearch(() => {
    function onKey(e) {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && inputRef.current) {
        e.preventDefault(); inputRef.current.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ──────────────────────────────────────────────────────────────────────
  // IDLE STATE
  // ──────────────────────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <div className="page">
        <div className="search-empty">
          <h1>Understand your health, backed by real guidelines.</h1>
          <div className="sub">Search WHO, CDC, NIH and Indian health guidelines — or upload your lab report for personalized answers.</div>
          <div className="bar-wrap">
            <SearchBarRow
              query={query} setQuery={setQuery} submit={submit}
              inputRef={inputRef} placeholder="Ask about symptoms, medicines, nutrition, lab values…"
              report={report} onClearReport={() => setShowRemoveConfirm(true)}
              phase={phase}
            />

            {/* Upload zone OR health summary card */}
            <div style={{ marginTop: 16 }}>
              {!uploadFile && !report && <UploadZone onFile={onFile} />}
              {uploadFile && <UploadProgress filename={uploadFile.name} onDone={onProcessingDone} />}
              {report && (
                <>
                  {report.criticalFlags.length > 0 && <CriticalAlert flags={report.criticalFlags} />}
                  <HealthSummaryCard report={report} onClose={() => setShowRemoveConfirm(true)} />
                </>
              )}
            </div>

            {/* Example pills */}
            <div className="example-pills">
              {(report ? H.PERSONALIZED_PILLS : H.GENERIC_PILLS).map(q => (
                <button key={q} className="example-pill" onClick={() => submit(q)}>{q}</button>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--text-tertiary)' }}>
              Press <kbd style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: 4, border: '0.5px solid var(--border-light)' }}>/</kbd> to focus search from anywhere
            </div>
          </div>
        </div>

        <ConfirmDialog
          open={showRemoveConfirm}
          title="Remove your uploaded report?"
          message="You'll lose personalized answers. You can upload again any time."
          confirmLabel="Remove"
          cancelLabel="Keep it"
          onConfirm={removeReport}
          onCancel={() => setShowRemoveConfirm(false)}
        />
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // POST-SUBMIT
  // ──────────────────────────────────────────────────────────────────────
  const showCritical = report && report.criticalFlags.length > 0 && (answerMode === 'personalized_critical' || answerMode === 'personalized');

  return (
    <div className="page">
      <SearchBarRow
        query={query} setQuery={setQuery} submit={submit}
        inputRef={inputRef} placeholder="Ask about symptoms, medicines, nutrition, lab values…"
        report={report} onClearReport={() => setShowRemoveConfirm(true)}
        phase={phase} compact
      />

      {/* Critical alert at the top, always visible while report has criticals */}
      {showCritical && <CriticalAlert flags={report.criticalFlags} />}

      {phase === 'loading' && <SearchSkeleton />}

      {phase === 'answer' && (
        <AnswerArea
          mode={answerMode}
          report={report}
          activeCite={activeCite}
          setActiveCite={setActiveCite}
          feedback={feedback}
          setFeedback={setFeedback}
          toast={toast}
          submit={submit}
        />
      )}

      <ConfirmDialog
        open={showRemoveConfirm}
        title="Remove your uploaded report?"
        message="You'll lose personalized answers. You can upload again any time."
        confirmLabel="Remove"
        cancelLabel="Keep it"
        onConfirm={removeReport}
        onCancel={() => setShowRemoveConfirm(false)}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Search bar with optional Personalized badge
// ──────────────────────────────────────────────────────────────────────
function SearchBarRow({ query, setQuery, submit, inputRef, placeholder, report, onClearReport, phase, compact }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: compact ? 16 : 0 }}>
      <div className="search-bar" style={{ flex: 1 }}>
        <i className="ti ti-search" style={{ fontSize: 18, color: 'var(--text-tertiary)' }} />
        {report && (
          <span className="personalized-badge">
            <i className="ti ti-stethoscope" />
            Personalized
            <button onClick={onClearReport} aria-label="Exit personalized mode">
              <i className="ti ti-x" style={{ fontSize: 11 }} />
            </button>
          </span>
        )}
        <input
          ref={inputRef}
          placeholder={placeholder}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          aria-label="Search health guidelines"
          autoFocus
        />
        <button
          className={'btn-primary' + (phase === 'loading' ? ' loading' : '')}
          onClick={() => submit()}
        >{phase === 'loading' ? 'Searching' : 'Search'}</button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Answer area — switches based on mode
// ──────────────────────────────────────────────────────────────────────
function AnswerArea({ mode, report, activeCite, setActiveCite, feedback, setFeedback, toast, submit }) {
  const H = window.HEALTH_DATA;

  if (mode === 'idk') {
    return (
      <>
        <div className="panel fade-up" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <div className="title-row"><h3>Answer</h3><ConfidenceDot score={0.30} /></div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)' }}>0.8s</span>
          </div>
          <div className="panel-body">
            <div className="idk-warn">
              <i className="ti ti-alert-circle" />
              <div className="msg">{H.SAMPLE_IDK.body}</div>
            </div>
          </div>
          <AnswerFooter chunkCount="0 relevant sources" feedback={feedback} setFeedback={setFeedback} onCopy={() => copyAnswer(toast, H.SAMPLE_IDK.body)} />
        </div>
        <Disclaimer />
        <div className="suggestions-panel" style={{ marginTop: 0, opacity: 1, animation: 'fadeUp 350ms ease-out both' }}>
          <div className="label">Try related topics</div>
          <div className="row">
            {H.SAMPLE_IDK.suggestions.map(s => (
              <button key={s} className="example-pill" onClick={() => submit(s)}>{s}</button>
            ))}
          </div>
        </div>
      </>
    );
  }

  if (mode === 'refusal') {
    const ans = H.SAMPLE_REFUSAL;
    return (
      <>
        <YourValuesCard report={report} names={ans.yourValues} />
        <div className="panel fade-up" style={{ marginBottom: 0 }}>
          <PanelAnswerHeader latency={ans.latency} confidence={0.78} />
          <div className="panel-body">
            <RefusalBlock text={ans.refusalText} />
            <HealthAnswerBody body={ans.body} activeCite={activeCite} setActiveCite={setActiveCite} sources={ans.sources} />
          </div>
          <AnswerFooter chunkCount={ans.count} feedback={feedback} setFeedback={setFeedback} onCopy={() => copyAnswer(toast, ans)} />
        </div>
        <Disclaimer />
        <SourceGrid sources={ans.sources} activeCite={activeCite} setActiveCite={setActiveCite} />
      </>
    );
  }

  if (mode === 'drug') {
    const ans = H.SAMPLE_DRUG_INTERACTION;
    return (
      <>
        <div className="panel fade-up" style={{ marginBottom: 0 }}>
          <PanelAnswerHeader latency={ans.latency} confidence={0.82} />
          <div className="panel-body">
            <HealthAnswerBody body={ans.body} activeCite={activeCite} setActiveCite={setActiveCite} sources={ans.sources} />
          </div>
          <AnswerFooter chunkCount={ans.count} feedback={feedback} setFeedback={setFeedback} onCopy={() => copyAnswer(toast, ans)} />
        </div>
        <Disclaimer />
        <SourceGrid sources={ans.sources} activeCite={activeCite} setActiveCite={setActiveCite} />
      </>
    );
  }

  if (mode === 'personalized' || mode === 'personalized_critical') {
    const ans = H.SAMPLE_PERSONALIZED;
    const crit = mode === 'personalized_critical' && report.criticalFlags.length > 0;
    const leadCritical = crit
      ? `IMPORTANT: Your potassium level of ${report.criticalFlags[0].value} mEq/L is above the critical threshold. Please seek medical attention promptly.`
      : null;
    return (
      <>
        <YourValuesCard report={report} names={ans.yourValues} />
        <div className="panel fade-up" style={{ marginBottom: 0 }}>
          <PanelAnswerHeader latency={ans.latency} confidence={0.84} />
          <div className="panel-body">
            <HealthAnswerBody
              body={ans.body}
              activeCite={activeCite} setActiveCite={setActiveCite}
              sources={ans.sources}
              leadCritical={leadCritical}
            />
          </div>
          <AnswerFooter chunkCount={ans.count} feedback={feedback} setFeedback={setFeedback} onCopy={() => copyAnswer(toast, ans)} />
        </div>
        <Disclaimer />
        <SourceGrid sources={ans.sources} activeCite={activeCite} setActiveCite={setActiveCite} />
      </>
    );
  }

  // Generic
  const ans = H.SAMPLE_GENERIC;
  return (
    <>
      <div className="panel fade-up" style={{ marginBottom: 0 }}>
        <PanelAnswerHeader latency={ans.latency} confidence={0.80} />
        <div className="panel-body">
          <HealthAnswerBody body={ans.body} activeCite={activeCite} setActiveCite={setActiveCite} sources={ans.sources} />
        </div>
        <AnswerFooter chunkCount={ans.count} feedback={feedback} setFeedback={setFeedback} onCopy={() => copyAnswer(toast, ans)} />
      </div>
      <Disclaimer />
      {!report && <UploadNudge onClick={() => document.querySelector('.upload-zone')?.click()} />}
      <SourceGrid sources={ans.sources} activeCite={activeCite} setActiveCite={setActiveCite} />
    </>
  );
}

function PanelAnswerHeader({ latency, confidence }) {
  return (
    <div className="panel-header">
      <div className="title-row"><h3>Answer</h3><ConfidenceDot score={confidence} /></div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)' }}>{latency}</span>
    </div>
  );
}

function AnswerFooter({ chunkCount, feedback, setFeedback, onCopy }) {
  const [copied, setCopied] = useStateSearch(false);
  function handleCopy() { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1100); }
  function fb(kind) { setFeedback(kind); }
  return (
    <div style={{ padding: '14px 20px', borderTop: '0.5px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{chunkCount}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className={'btn-icon' + (feedback === 'up' ? ' active-up' : '')} disabled={feedback === 'down'}
                style={feedback === 'down' ? { opacity: 0.4 } : null}
                onClick={() => fb('up')} aria-label="Helpful">
          <i className="ti ti-thumb-up" style={{ fontSize: 15 }} />
        </button>
        <button className={'btn-icon' + (feedback === 'down' ? ' active-down' : '')} disabled={feedback === 'up'}
                style={feedback === 'up' ? { opacity: 0.4 } : null}
                onClick={() => fb('down')} aria-label="Unhelpful">
          <i className="ti ti-thumb-down" style={{ fontSize: 15 }} />
        </button>
        <button className="btn-icon" onClick={handleCopy} aria-label="Copy answer to clipboard">
          <i className={'ti ' + (copied ? 'ti-check' : 'ti-copy')} style={{ fontSize: 15, color: copied ? 'var(--success)' : undefined }} />
        </button>
      </div>
    </div>
  );
}

function SourceGrid({ sources, activeCite, setActiveCite }) {
  return (
    <div className="source-grid">
      {sources.map((s, i) => (
        <div className="fade-up" key={s.id} style={{ animationDelay: `${i * 60}ms` }}>
          <HealthSourceCard
            src={s}
            active={activeCite === s.id}
            onClick={() => setActiveCite(activeCite === s.id ? null : s.id)}
          />
        </div>
      ))}
    </div>
  );
}

function copyAnswer(toast, ans) {
  try {
    const text = typeof ans === 'string'
      ? ans
      : (ans.body || []).map(s => s.text || (s.mark ? s.mark : '')).join('');
    navigator.clipboard.writeText(text);
  } catch (e) {}
  toast.push('Answer copied to clipboard', 'success');
}

window.SearchPage = SearchPage;
