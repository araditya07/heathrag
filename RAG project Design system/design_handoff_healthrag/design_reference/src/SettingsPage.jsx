// Settings page — appearance, data sources, eval config, about.
function SettingsPage({ theme, setTheme }) {
  const config = `{
  "chunk_size":       1024,
  "chunk_overlap":    128,
  "embedding_model":  "text-embedding-3-large",
  "retriever":        "hybrid (bm25 + cohere-rerank-3.5)",
  "retriever_k":      5,
  "reranker_enabled": true,
  "threshold":        0.45,
  "judge_model":      "claude-3.7-sonnet",
  "eval_queries":     100
}`;
  const toast = useToast();
  function copyConfig() {
    try { navigator.clipboard.writeText(config); } catch (e) {}
    toast.push('Config copied to clipboard', 'success');
  }

  return (
    <div className="page">
      <PageHeader title="Settings" subtitle="Appearance, sources, eval configuration." />

      <Panel title="Appearance" subtitle="Theme is persisted per browser">
        <div className="settings-section">
          <div className="theme-segment">
            <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
              <i className="ti ti-sun" />Light
            </button>
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
              <i className="ti ti-moon" />Dark
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="Data sources" subtitle="Indexed corpora">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SourceRow name="WHO Health Topics"           stats="524 documents · 3,210 chunks"   lastSync="last sync 2 hours ago" />
          <SourceRow name="CDC Health Topics"           stats="687 documents · 4,102 chunks"   lastSync="last sync 4 hours ago" />
          <SourceRow name="NIH MedlinePlus"             stats="1,034 documents · 6,445 chunks" lastSync="last sync 5 hours ago" />
          <SourceRow name="Indian Health (NHM + FSSAI + ICMR)" stats="412 documents · 2,380 chunks" lastSync="last sync 1 day ago" />
          <SourceRow name="Drug Database (CDSCO + NIH)" stats="1,523 drug entries"                  lastSync="last sync 12 hours ago" />
          <button className="example-pill" style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <i className="ti ti-refresh" style={{ fontSize: 13, marginRight: 6 }} />Re-ingest sources
          </button>
        </div>
      </Panel>

      <Panel title="Privacy" subtitle="How HealthRAG handles your uploaded health data">
        <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.75 }}>
          <li>Health data uploaded via lab reports is stored in your browser session only.</li>
          <li>Session data is automatically deleted after 24 hours.</li>
          <li>No health data is used for training or evaluation purposes.</li>
          <li>Evaluation uses only synthetic mock health data.</li>
        </ul>
      </Panel>

      <Panel title="Guardrail configuration" subtitle="Set via CLI — read-only here">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SettingsRow label="Disclaimer text"
            value={'"' + window.HEALTH_DATA.DISCLAIMER_TEXT.slice(0, 80) + '…"'} />
          <SettingsRow label="Diagnosis refusal patterns"
            value="22 regex triggers" desc='e.g. "am i (diabetic|hypertensive|prediabetic)"' />
          <SettingsRow label="Critical thresholds"
            value="38 parameters" desc="potassium > 6.0, sodium < 120, glucose > 400, …" />
        </div>
      </Panel>

      <Panel title="Eval configuration" subtitle="Set via CLI — read-only here"
        right={
          <button className="example-pill" onClick={copyConfig}>
            <i className="ti ti-copy" style={{ fontSize: 13, marginRight: 6 }} />Copy config
          </button>
        }
      >
        <div className="config-block">{config}</div>
      </Panel>

      <Panel title="About">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>HealthRAG</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>v1.0.0 · AI health information companion with safety guardrails</div>
            </div>
            <span className="pill neutral mono">build 1834</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="example-pill"><i className="ti ti-brand-github" style={{ fontSize: 13, marginRight: 6 }} />GitHub</button>
            <button className="example-pill"><i className="ti ti-file-text" style={{ fontSize: 13, marginRight: 6 }} />Case study</button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function SourceRow({ name, stats, lastSync }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '14px 16px', background: 'var(--bg-surface)',
      borderRadius: 'var(--radius-md)',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{stats}</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{lastSync}</div>
      </div>
      <Pill kind="success"><i className="ti ti-circle-check" style={{ fontSize: 11, marginRight: 2 }} />connected</Pill>
    </div>
  );
}

function SettingsRow({ label, value, desc }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, paddingBottom: 12, borderBottom: '0.5px solid var(--border-light)' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{desc}</div>}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right', maxWidth: 380 }}>{value}</div>
    </div>
  );
}

window.SettingsPage = SettingsPage;
