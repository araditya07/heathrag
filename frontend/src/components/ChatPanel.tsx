import { ChevronDown, ChevronUp, ExternalLink, MessageSquareText, Send, Stethoscope } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { postQuery, type LatestReport, type ParsedParameter, type QueryResponse, type Source } from "../lib/api";

/**
 * Sticky right-side chat panel for follow-up questions.
 *
 * Each turn calls /query independently (the backend is stateless turn-to-turn;
 * the user's uploaded report is preserved via session_id in localStorage so
 * follow-ups remain personalized). Compact rendering — citations stripped
 * from the bubble text, but the underlying sources are kept and revealed via
 * an expander so the user can see what the LLM was grounded in.
 */

type AssistantMsg = {
  role: "assistant";
  text: string;
  latency_ms: number;
  sources: Source[];
  refused: boolean;
  flagged: boolean;
};

type UserMsg = { role: "user"; text: string };
type ChatMessage = UserMsg | AssistantMsg;

const GENERIC_SUGGESTIONS = [
  "How is high blood pressure diagnosed?",
  "What are early signs of diabetes?",
  "How much physical activity per week?",
];

const HEALTHY_SUGGESTIONS = [
  "What habits help keep blood sugar in range?",
  "What screenings are appropriate for my age?",
  "How do I maintain healthy cholesterol?",
];

function prettyName(name: string): string {
  const overrides: Record<string, string> = {
    hba1c: "HbA1c",
    ldl: "LDL cholesterol",
    hdl: "HDL cholesterol",
    tsh: "TSH",
    wbc: "WBC",
    rbc: "RBC",
    inr: "INR",
    fasting_glucose: "fasting glucose",
    total_cholesterol: "total cholesterol",
  };
  if (overrides[name]) return overrides[name];
  return name.replace(/_/g, " ");
}

/** Clinical priority order. Critical first, then "high" (usually more
 *  actionable than "low" in our corpus), then "low". */
function priorityScore(p: ParsedParameter): number {
  if (p.status === "critical_high" || p.status === "critical_low") return 0;
  // Bias toward the well-known cardio-metabolic markers when sorting ties.
  const cardio = new Set([
    "hba1c", "fasting_glucose", "total_cholesterol", "ldl", "hdl",
    "triglycerides", "tsh",
  ]);
  if (p.status === "high") return cardio.has(p.canonical_name) ? 1 : 2;
  if (p.status === "low") return cardio.has(p.canonical_name) ? 3 : 4;
  return 5;
}

function suggestionsFor(report: LatestReport | null): string[] {
  if (!report) return GENERIC_SUGGESTIONS;
  const params: ParsedParameter[] = Object.values(report.extracted_values ?? {});
  if (params.length === 0) return GENERIC_SUGGESTIONS;

  const abnormal = params.filter(
    (p) => p.status !== "normal" && p.status !== "unknown"
  );

  // All-normal: ask maintenance questions instead.
  if (abnormal.length === 0) return HEALTHY_SUGGESTIONS;

  abnormal.sort((a, b) => priorityScore(a) - priorityScore(b));
  const out: string[] = [];
  for (const p of abnormal.slice(0, 3)) {
    const name = prettyName(p.canonical_name);
    const val = `${p.value} ${p.unit}`;
    if (p.status === "critical_high" || p.status === "critical_low") {
      out.push(`What should I do about my ${name} (${val})?`);
    } else if (p.status === "high") {
      out.push(`What lifestyle changes can lower my ${name} (${val})?`);
    } else if (p.status === "low") {
      out.push(`What can I do about my low ${name} (${val})?`);
    }
  }
  // Always close with a holistic question if there's room.
  if (out.length < 3) out.push("Which of my values is most concerning?");
  return out;
}

function trimCitations(text: string): string {
  return text.replace(/\[Source\s+\d+\]/g, "").replace(/\s+/g, " ").trim();
}
function stripMarkdownBold(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1");
}
function stripTrailingDisclaimer(text: string): string {
  return text.replace(/⚕️\s*This information is for educational[\s\S]*$/i, "").trim();
}
function formatForChat(text: string): string {
  return stripTrailingDisclaimer(stripMarkdownBold(trimCitations(text)));
}

export default function ChatPanel({
  personalized,
  report,
}: {
  personalized: boolean;
  report: LatestReport | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => suggestionsFor(report), [report]);

  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  const submit = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setErr(null);
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    try {
      const r: QueryResponse = await postQuery(q, true);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: formatForChat(r.answer),
          latency_ms: r.latency_ms,
          sources: r.sources ?? [],
          refused: !!r.guardrail?.refused_diagnosis,
          flagged: !!r.guardrail?.flagged_critical,
        },
      ]);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to send");
    } finally {
      setBusy(false);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <aside
      className="chat-panel"
      role="region"
      aria-label="Follow-up chat"
      style={{
        background: "var(--bg-card)",
        border: "0.5px solid var(--border-light)",
        borderRadius: "var(--radius-xl)",
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 80px)",
        position: "sticky",
        top: 24,
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: "14px 18px",
          borderBottom: "0.5px solid var(--border-light)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <MessageSquareText size={16} strokeWidth={2} style={{ color: "var(--accent)" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
            Follow-up chat
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {personalized
              ? "Personalized to your report + retrieved guidelines"
              : "Grounded in retrieved guidelines"}
          </div>
        </div>
      </header>

      <div
        ref={threadRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {isEmpty && (
          <div
            style={{
              textAlign: "center",
              color: "var(--text-tertiary)",
              fontSize: 12,
              padding: "16px 8px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              alignItems: "center",
            }}
          >
            <Stethoscope size={20} strokeWidth={1.5} />
            <div>
              {personalized
                ? "Suggested follow-ups for your report:"
                : "Try a question about your health:"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  disabled={busy}
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    border: "0.5px solid var(--border-light)",
                    background: "var(--bg-card)",
                    borderRadius: "var(--radius-md)",
                    cursor: busy ? "not-allowed" : "pointer",
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    fontFamily: "inherit",
                    lineHeight: 1.4,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--accent-surface)";
                    e.currentTarget.style.color = "var(--accent-text)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--bg-card)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <ChatBubble key={i} message={m} />
        ))}

        {busy && (
          <div
            style={{
              alignSelf: "flex-start",
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-md)",
              padding: "10px 12px",
              fontSize: 12,
              color: "var(--text-tertiary)",
              maxWidth: "85%",
            }}
          >
            <span className="skel skel-line" style={{ width: 140, marginBottom: 4 }} />
            <span className="skel skel-line" style={{ width: 200, marginBottom: 0 }} />
          </div>
        )}

        {err && (
          <div
            role="alert"
            style={{
              fontSize: 12,
              color: "var(--danger-text)",
              background: "var(--danger-surface)",
              padding: "8px 10px",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {err}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        style={{
          display: "flex",
          gap: 8,
          padding: "12px 14px",
          borderTop: "0.5px solid var(--border-light)",
        }}
      >
        <input
          aria-label="Type a follow-up question"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={busy ? "Thinking…" : "Ask a follow-up…"}
          disabled={busy}
          style={{
            flex: 1,
            padding: "9px 12px",
            border: "0.5px solid var(--border-light)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-page)",
            fontSize: 13,
            fontFamily: "var(--font-display)",
            color: "var(--text-primary)",
            outline: "none",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border-light)")}
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={busy || !input.trim()}
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-md)",
            padding: "0 12px",
            cursor: busy || !input.trim() ? "not-allowed" : "pointer",
            opacity: busy || !input.trim() ? 0.6 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Send size={14} strokeWidth={2} />
        </button>
      </form>
    </aside>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const [open, setOpen] = useState(false);
  if (message.role === "user") {
    return (
      <div
        style={{
          alignSelf: "flex-end",
          background: "var(--accent-surface)",
          color: "var(--accent-text)",
          borderRadius: "var(--radius-md)",
          padding: "9px 12px",
          fontSize: 13,
          lineHeight: 1.5,
          maxWidth: "85%",
        }}
      >
        {message.text}
      </div>
    );
  }
  return (
    <div
      style={{
        alignSelf: "flex-start",
        background: "var(--bg-surface)",
        color: "var(--text-primary)",
        borderRadius: "var(--radius-md)",
        padding: "10px 12px",
        fontSize: 13,
        lineHeight: 1.6,
        maxWidth: "92%",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ whiteSpace: "pre-wrap" }}>{message.text}</div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 10,
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-mono)",
          flexWrap: "wrap",
        }}
      >
        <span>{message.latency_ms}ms</span>
        {message.sources.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--accent-text-light)",
              fontFamily: "inherit",
              fontSize: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            · {message.sources.length} source{message.sources.length === 1 ? "" : "s"}
            {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        )}
        {message.refused && (
          <span className="pill info" style={{ fontSize: 9, padding: "1px 6px" }}>
            refused diagnosis
          </span>
        )}
        {message.flagged && (
          <span className="pill danger" style={{ fontSize: 9, padding: "1px 6px" }}>
            critical flagged
          </span>
        )}
      </div>

      {open && message.sources.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            borderTop: "0.5px solid var(--border-light)",
            paddingTop: 6,
          }}
        >
          {message.sources.slice(0, 5).map((s, i) => (
            <a
              key={s.chunk_id}
              href={s.source_url}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 11,
                color: "var(--accent-text-light)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                lineHeight: 1.4,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  background: "var(--accent-surface)",
                  padding: "1px 5px",
                  borderRadius: 4,
                  color: "var(--accent-text)",
                }}
              >
                Source {i + 1}
              </span>
              <span
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 220,
                }}
              >
                {s.section_title || s.document_title || s.source_url}
              </span>
              <ExternalLink size={10} strokeWidth={2} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
