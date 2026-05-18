import { MessageSquareText, Send, Stethoscope } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { postQuery, type QueryResponse } from "../lib/api";

/**
 * Sticky right-side chat panel for asking follow-up questions.
 *
 * Each turn calls /query independently (stateless on the backend; the user's
 * uploaded report is still applied via session_id). Messages stack in a
 * scrollable thread. Compact rendering — citations as inline pills, no full
 * source cards.
 */

type ChatMessage =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      text: string;
      latency_ms: number;
      sources: number;
      refused: boolean;
      flagged: boolean;
    };

const SUGGESTIONS_PERSONALIZED = [
  "What lifestyle changes should I make?",
  "Which of my values is most concerning?",
  "What does a high HbA1c mean?",
];

const SUGGESTIONS_GENERIC = [
  "How is high blood pressure diagnosed?",
  "What are early signs of diabetes?",
  "How much physical activity per week?",
];

function trimCitations(text: string): string {
  // Strip [Source N] tokens — the chat panel renders compact answers and we
  // don't show the source cards inline.
  return text.replace(/\[Source\s+\d+\]/g, "").replace(/\s+/g, " ").trim();
}

function stripMarkdownBold(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1");
}

// Trim the LLM's own disclaimer line (we already have a site-wide DemoNotice
// and a per-answer Disclaimer; the chat version stays clean).
function stripTrailingDisclaimer(text: string): string {
  return text
    .replace(/⚕️\s*This information is for educational[\s\S]*$/i, "")
    .trim();
}

function formatForChat(text: string): string {
  return stripTrailingDisclaimer(stripMarkdownBold(trimCitations(text)));
}

export default function ChatPanel({ personalized }: { personalized: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

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
          sources: r.sources?.length ?? 0,
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

  const suggestions = personalized ? SUGGESTIONS_PERSONALIZED : SUGGESTIONS_GENERIC;
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
            Grounded in retrieved sources{personalized ? " + your uploaded report" : ""}
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
              gap: 8,
              alignItems: "center",
            }}
          >
            <Stethoscope size={20} strokeWidth={1.5} />
            <div>Ask a follow-up about your report or any health topic.</div>
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
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
      <div>{message.text}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 10,
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        <span>{message.latency_ms}ms</span>
        <span>· {message.sources} sources</span>
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
    </div>
  );
}
