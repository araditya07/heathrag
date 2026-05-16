import { Check, Copy, FileUp, ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import AnswerBody from "../components/AnswerBody";
import ConfirmDialog from "../components/ConfirmDialog";
import CriticalAlert from "../components/CriticalAlert";
import Disclaimer from "../components/Disclaimer";
import HealthSourceCard from "../components/HealthSourceCard";
import HealthSummaryCard from "../components/HealthSummaryCard";
import SearchBar from "../components/SearchBar";
import UploadProgress from "../components/UploadProgress";
import UploadZone from "../components/UploadZone";
import YourValuesCard from "../components/YourValuesCard";
import {
  clearUploads,
  fetchLatestReport,
  postFeedback,
  postQuery,
  uploadLabReport,
  type LatestReport,
  type ParsedParameter,
  type QueryResponse,
} from "../lib/api";

const EXAMPLES_GENERIC = [
  "What are the symptoms of Type 2 diabetes?",
  "What's a normal HbA1c level?",
  "Can I take Paracetamol with Ibuprofen?",
  "How much physical activity per week?",
];

const EXAMPLES_PERSONALIZED = [
  "Based on my report, what should I do?",
  "Is my cholesterol level concerning?",
  "Am I diabetic?",
  "What does my potassium level mean?",
];

const REFUSAL_RX = /\b(am i|do i have|am i (?:diabetic|hypertensive|prediabetic|anemic|anaemic|sick))\b/i;
const IDK_RX = /\b(homeopath|ayurvedic cure|miracle|broken arm at home)\b/i;

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [resp, setResp] = useState<QueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [report, setReport] = useState<LatestReport | null>(null);
  const [uploading, setUploading] = useState<{ filename: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<"positive" | "negative" | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchLatestReport().then(setReport).catch(() => {});
  }, []);

  const examples = report ? EXAMPLES_PERSONALIZED : EXAMPLES_GENERIC;
  const isIdk = useMemo(
    () => Boolean(resp && (!resp.sources?.length || IDK_RX.test(q))),
    [resp, q]
  );
  const isRefusal = useMemo(
    () => Boolean(resp?.guardrail?.refused_diagnosis) || REFUSAL_RX.test(q),
    [resp, q]
  );
  const isCritical = Boolean(resp?.critical_flags?.length || report?.critical_flags?.length);

  const relevantValues: ParsedParameter[] = useMemo(() => {
    if (!report || !resp?.health_context_parameters?.length) return [];
    const allow = new Set(resp.health_context_parameters);
    return Object.values(report.extracted_values ?? {}).filter((p) => allow.has(p.canonical_name));
  }, [report, resp]);

  const submitQuery = async (question: string) => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setErr(null);
    setResp(null);
    setFeedback(null);
    setActiveCitation(null);
    try {
      const r = await postQuery(question, true);
      setResp(r);
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    setUploading({ filename: file.name });
    try {
      await uploadLabReport(file);
      const latest = await fetchLatestReport();
      setReport(latest);
    } catch (e: any) {
      setErr(e?.message ?? "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const removeReport = async () => {
    setConfirmRemove(false);
    await clearUploads();
    setReport(null);
  };

  const copyAnswer = async () => {
    if (!resp) return;
    await navigator.clipboard.writeText(resp.answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 1100);
  };

  const sendFeedback = async (rating: "positive" | "negative") => {
    if (!resp?.query_id || feedback) return;
    setFeedback(rating);
    await postFeedback(resp.query_id, rating);
  };

  const showEmpty = !resp && !loading;

  return (
    <div className="page">
      {!resp && !loading && (
        <div className="search-empty">
          <h1>Understand your health, backed by real guidelines.</h1>
          <div className="sub">
            Search WHO, CDC, NIH and Indian health guidelines — or upload your lab report for
            personalized answers.
          </div>
          <div className="bar-wrap">
            <SearchBar
              value={q}
              onChange={setQ}
              onSubmit={() => submitQuery(q)}
              autoFocus
              loading={loading}
              personalized={!!report}
              onRemovePersonalized={() => setConfirmRemove(true)}
            />
            <div style={{ marginTop: 16 }}>
              {!report && !uploading && <UploadZone onFile={handleFile} />}
              {uploading && <UploadProgress filename={uploading.filename} />}
              {report && (
                <>
                  <HealthSummaryCard
                    report={report}
                    onClose={() => setConfirmRemove(true)}
                  />
                  {report.critical_flags?.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <CriticalAlert flags={report.critical_flags} />
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="example-pills">
              {examples.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="example-pill"
                  onClick={() => {
                    setQ(ex);
                    submitQuery(ex);
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
            <div className="ds-caption" style={{ marginTop: 24, textAlign: "center" }}>
              Press <kbd>/</kbd> to focus search
            </div>
          </div>
        </div>
      )}

      {!showEmpty && (
        <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SearchBar
            value={q}
            onChange={setQ}
            onSubmit={() => submitQuery(q)}
            loading={loading}
            personalized={!!report}
            onRemovePersonalized={() => setConfirmRemove(true)}
          />

          {err && (
            <div className="critical-alert" role="alert">
              <span>{err}</span>
            </div>
          )}

          {loading && (
            <div className="panel">
              <div className="panel-body">
                <div className="skel skel-line" style={{ width: "75%" }} />
                <div className="skel skel-line" style={{ width: "90%" }} />
                <div className="skel skel-line" style={{ width: "60%" }} />
                <div className="ds-caption" style={{ marginTop: 8 }}>Searching guidelines…</div>
              </div>
            </div>
          )}

          {resp && (
            <>
              {/* Critical alert sits above everything when present */}
              {isCritical && resp.critical_flags?.length > 0 && (
                <CriticalAlert flags={resp.critical_flags} />
              )}

              {/* Personalized "your values" snippet */}
              {!isIdk && relevantValues.length > 0 && (
                <YourValuesCard params={relevantValues} />
              )}

              <div className="panel">
                <div className="panel-body">
                  {isIdk ? (
                    <div className="idk-warn">
                      <span style={{ marginTop: 1 }} />
                      <div className="msg">
                        I don't have information on this in my current knowledge base.
                        The guidelines I search (WHO, CDC, NIH, ICMR) don't cover this topic.
                      </div>
                    </div>
                  ) : (
                    <AnswerBody
                      answer={resp.answer}
                      refusal={isRefusal && !isCritical}
                      criticalFlags={isCritical ? resp.critical_flags : undefined}
                      yourValues={relevantValues}
                      activeCitation={activeCitation}
                      onCitationClick={(n) => {
                        setActiveCitation((cur) => (cur === n ? null : n));
                        const el = document.getElementById(`source-${n}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                    />
                  )}

                  <div className="ds-caption" style={{ marginTop: 18, display: "flex", gap: 16 }}>
                    <span className="ds-mono">{resp.latency_ms} ms</span>
                    <span>{resp.model_used}</span>
                    {!!resp.sources?.length && (
                      <span>
                        {resp.sources.length} sources ·{" "}
                        {new Set(resp.sources.map((s) => s.source_url)).size} documents
                      </span>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    padding: "12px 20px",
                    borderTop: "0.5px solid var(--border-light)",
                  }}
                >
                  <button
                    className={`btn-icon${feedback === "positive" ? " active-up" : ""}`}
                    aria-label="Mark answer helpful"
                    onClick={() => sendFeedback("positive")}
                  >
                    <ThumbsUp size={14} strokeWidth={2} />
                  </button>
                  <button
                    className={`btn-icon${feedback === "negative" ? " active-down" : ""}`}
                    aria-label="Mark answer not helpful"
                    onClick={() => sendFeedback("negative")}
                  >
                    <ThumbsDown size={14} strokeWidth={2} />
                  </button>
                  <button
                    className="btn-icon"
                    aria-label="Copy answer"
                    onClick={copyAnswer}
                  >
                    {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
                  </button>
                </div>
              </div>

              <Disclaimer />

              {!report && (
                <button
                  className="upload-nudge"
                  onClick={() => {
                    // Focus the upload zone by routing back to empty? In this layout,
                    // simplest UX: open the file picker via a hidden trigger.
                    document
                      .querySelector<HTMLButtonElement>(".upload-zone")
                      ?.click();
                  }}
                >
                  <FileUp size={16} strokeWidth={2} />
                  Upload your lab report for personalized answers based on YOUR health data →
                </button>
              )}

              {!isIdk && resp.sources?.length > 0 && (
                <div className="source-grid">
                  {resp.sources.map((s, i) => (
                    <HealthSourceCard
                      key={s.chunk_id}
                      source={s}
                      index={i + 1}
                      active={activeCitation === i + 1}
                      onClick={() => setActiveCitation((c) => (c === i + 1 ? null : i + 1))}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {confirmRemove && (
        <ConfirmDialog
          title="Remove your uploaded report?"
          body="You'll lose personalized answers. You can upload again any time."
          cancelLabel="Keep report"
          confirmLabel="Remove"
          onCancel={() => setConfirmRemove(false)}
          onConfirm={removeReport}
        />
      )}
    </div>
  );
}
