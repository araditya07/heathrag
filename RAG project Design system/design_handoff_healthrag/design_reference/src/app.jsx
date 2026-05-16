// Top-level app shell — Sidebar + content area, theme persistence, tweaks panel.
const { useState: useStateApp, useEffect: useEffectApp } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "comfortable",
  "accent": "#0F6E56"
}/*EDITMODE-END*/;

function App() {
  const D = window.RAG_DATA;
  const [page, setPage] = useStateApp(() => {
    const url = new URL(window.location.href);
    return url.searchParams.get('page') || 'search';
  });
  const [runId, setRunId] = useStateApp(D.EVAL_RUNS[0].id);
  const [theme, setTheme] = useStateApp(localStorage.getItem('rag-ops-theme') || 'light');
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffectApp(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('rag-ops-theme', theme);
  }, [theme]);

  // Apply accent tweak by overriding CSS variables across the accent palette
  useEffectApp(() => {
    const PALETTES = {
      '#0F6E56': { accent: '#0F6E56', hover: '#085041', surface: '#E1F5EE', text: '#085041', light: '#0F6E56' },
      '#2A6FDB': { accent: '#2A6FDB', hover: '#1F54A8', surface: '#E3EEFB', text: '#1F54A8', light: '#2A6FDB' },
      '#7C3AED': { accent: '#7C3AED', hover: '#5B21B6', surface: '#EDE4FD', text: '#5B21B6', light: '#7C3AED' },
      '#D97757': { accent: '#D97757', hover: '#A8512F', surface: '#FBE9DF', text: '#8C4225', light: '#D97757' },
    };
    const p = PALETTES[t.accent] || PALETTES['#0F6E56'];
    const r = document.documentElement.style;
    r.setProperty('--accent',            p.accent);
    r.setProperty('--accent-hover',      p.hover);
    r.setProperty('--accent-surface',    p.surface);
    r.setProperty('--accent-text',       p.text);
    r.setProperty('--accent-text-light', p.light);
  }, [t.accent]);

  return (
    <ToastProvider>
      <div className="app" data-density={t.density}>
        <Sidebar page={page} setPage={setPage} theme={theme} setTheme={setTheme} />
        <main className="main">
          <div key={page} className="fade-up" style={{ animation: 'fadeUp 220ms ease both' }}>
            {page === 'search'     && <SearchPage />}
            {page === 'retrieval'  && <RetrievalPage  runs={D.EVAL_RUNS} runId={runId} setRunId={setRunId} />}
            {page === 'generation' && <GenerationPage runs={D.EVAL_RUNS} runId={runId} setRunId={setRunId} />}
            {page === 'guardrails' && <GuardrailsPage runs={D.EVAL_RUNS} runId={runId} setRunId={setRunId} />}
            {page === 'metrics'    && <MetricsPage    runs={D.EVAL_RUNS} runId={runId} setRunId={setRunId} />}
            {page === 'runs'       && <EvalRunsPage   runs={D.EVAL_RUNS} />}
            {page === 'settings'   && <SettingsPage   theme={theme} setTheme={setTheme} />}
          </div>
        </main>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Density">
          <TweakRadio
            label="Density"
            value={t.density}
            options={['comfortable', 'compact']}
            onChange={v => setTweak('density', v)}
          />
        </TweakSection>
        <TweakSection label="Accent">
          <TweakColor
            label="Accent"
            value={t.accent}
            options={['#0F6E56', '#2A6FDB', '#7C3AED', '#D97757']}
            onChange={v => setTweak('accent', v)}
          />
        </TweakSection>
      </TweaksPanel>
    </ToastProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
