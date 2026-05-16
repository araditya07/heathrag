import { Lock } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { Panel, PanelBody, PanelHeader } from "../components/Panel";

export default function SettingsPage() {
  const theme = (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme")) || "light";
  const setTheme = (t: "light" | "dark") => {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("healthrag-theme", t);
  };
  return (
    <div className="page">
      <PageHeader title="Settings" subtitle="Appearance, privacy, data sources, guardrail config." />

      <Panel>
        <PanelHeader title="Appearance" />
        <PanelBody>
          <div className="tabs" role="tablist">
            <button
              className={`tab${theme === "light" ? " active" : ""}`}
              onClick={() => setTheme("light")}
            >
              Light
            </button>
            <button
              className={`tab${theme === "dark" ? " active" : ""}`}
              onClick={() => setTheme("dark")}
            >
              Dark
            </button>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Privacy">
          <Lock size={16} strokeWidth={2} style={{ color: "var(--text-tertiary)" }} />
        </PanelHeader>
        <PanelBody>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", lineHeight: 1.8 }}>
            <li>Health data uploaded via lab reports is stored in your browser session only.</li>
            <li>Session data is automatically deleted after 24 hours.</li>
            <li>No health data is used for training or evaluation purposes.</li>
            <li>Evaluation uses only synthetic mock health data.</li>
          </ul>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Data sources" />
        <PanelBody>
          <table className="runs-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Status</th>
                <th>Documents</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>CDC Health Topics</td>
                <td>
                  <span className="pill success">connected</span>
                </td>
                <td className="mono">live</td>
              </tr>
              <tr>
                <td>WHO Health Topics</td>
                <td>
                  <span className="pill neutral">planned</span>
                </td>
                <td className="mono">—</td>
              </tr>
              <tr>
                <td>NIH MedlinePlus</td>
                <td>
                  <span className="pill neutral">planned</span>
                </td>
                <td className="mono">—</td>
              </tr>
              <tr>
                <td>Indian Health (NHM + FSSAI + ICMR)</td>
                <td>
                  <span className="pill neutral">planned</span>
                </td>
                <td className="mono">—</td>
              </tr>
              <tr>
                <td>Drug Database (CDSCO + NIH)</td>
                <td>
                  <span className="pill neutral">planned</span>
                </td>
                <td className="mono">—</td>
              </tr>
            </tbody>
          </table>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Guardrail configuration" />
        <PanelBody>
          <div className="ds-mono" style={{ color: "var(--text-secondary)", lineHeight: 1.8 }}>
            <div>Disclaimer text: "This information is for educational purposes only…"</div>
            <div>Diagnosis-refusal patterns: 18 phrases</div>
            <div>Critical-value thresholds: 11 parameters</div>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Eval configuration" />
        <PanelBody>
          <pre
            className="ds-mono"
            style={{
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-md)",
              padding: 14,
              fontSize: 12,
              lineHeight: 1.7,
              margin: 0,
              color: "var(--text-secondary)",
              whiteSpace: "pre-wrap",
            }}
          >
            {`embedding_model: sentence-transformers/all-MiniLM-L6-v2 (384 dims)
reranker:        cross-encoder/ms-marco-MiniLM-L-6-v2
generator:       gemini-2.5-flash
judge:           gemini-2.5-flash (3 runs / question)
chunk_size:      512 tokens
chunk_overlap:   50 tokens
threshold:       0.45 cosine similarity
k_retrieve:      10
k_final:         5`}
          </pre>
        </PanelBody>
      </Panel>
    </div>
  );
}
