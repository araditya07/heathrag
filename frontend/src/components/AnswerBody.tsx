import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import type { CriticalFlag, ParsedParameter } from "../lib/api";
import RefusalBlock from "./RefusalBlock";

function pretty(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildUserValueRegex(values: ParsedParameter[]): RegExp | null {
  if (!values.length) return null;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns: string[] = [];
  for (const p of values) {
    if (p.value === undefined || p.value === null) continue;
    const val = String(p.value);
    const unit = p.unit ? `\\s*${escape(p.unit)}` : "";
    patterns.push(`${escape(val)}${unit}`);
  }
  if (!patterns.length) return null;
  return new RegExp(`\\b(${patterns.join("|")})\\b`, "g");
}

// ---------- inline tokenizer (handles **bold**, [Source N], user-value marks) ----------

type Match =
  | { start: number; end: number; type: "bold"; value: string }
  | { start: number; end: number; type: "cite"; value: number }
  | { start: number; end: number; type: "usermark"; value: string };

function tokenize(text: string, userRe: RegExp | null): (Match | { type: "text"; value: string })[] {
  const matches: Match[] = [];

  // **bold** — non-greedy, no inner asterisks
  const boldRe = /\*\*([^*]+)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = boldRe.exec(text)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, type: "bold", value: m[1] });
  }

  // [Source N]
  const citeRe = /\[Source\s+(\d+)\]/g;
  while ((m = citeRe.exec(text)) !== null) {
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      type: "cite",
      value: parseInt(m[1], 10),
    });
  }

  // user-value marks
  if (userRe) {
    userRe.lastIndex = 0;
    while ((m = userRe.exec(text)) !== null) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        type: "usermark",
        value: m[0],
      });
    }
  }

  // Sort, drop overlaps (keep first)
  matches.sort((a, b) => a.start - b.start);
  const out: (Match | { type: "text"; value: string })[] = [];
  let pos = 0;
  let lastEnd = 0;
  for (const match of matches) {
    if (match.start < lastEnd) continue; // overlap
    if (match.start > pos) {
      out.push({ type: "text", value: text.slice(pos, match.start) });
    }
    out.push(match);
    pos = match.end;
    lastEnd = match.end;
  }
  if (pos < text.length) {
    out.push({ type: "text", value: text.slice(pos) });
  }
  return out;
}

function renderInline(
  text: string,
  userRe: RegExp | null,
  onCite: ((n: number) => void) | undefined,
  activeCite: number | null | undefined,
  keyPrefix: string
): ReactNode[] {
  const tokens = tokenize(text, userRe);
  return tokens.map((t, i) => {
    const k = `${keyPrefix}-${i}`;
    if (t.type === "text") return <span key={k}>{t.value}</span>;
    if (t.type === "bold") return <strong key={k}>{t.value}</strong>;
    if (t.type === "usermark") {
      return (
        <mark key={k} className="user-value">
          {t.value}
        </mark>
      );
    }
    // cite
    const n = t.value;
    return (
      <span
        key={k}
        className="cite"
        role="button"
        tabIndex={0}
        style={{
          outline: activeCite === n ? "2px solid var(--accent)" : undefined,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onCite?.(n);
        }}
      >
        Source {n}
      </span>
    );
  });
}

// ---------- block renderer (paragraphs + bullet lists + headers) ----------

function renderBlocks(
  answer: string,
  userRe: RegExp | null,
  onCite?: (n: number) => void,
  activeCite?: number | null
): ReactNode {
  const lines = answer.split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let blockIdx = 0;

  const flushList = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul
        key={`ul-${blockIdx++}`}
        style={{ margin: "8px 0", paddingLeft: 22, color: "var(--text-primary)" }}
      >
        {bullets.map((b, i) => (
          <li key={i} style={{ marginBottom: 6, lineHeight: 1.7 }}>
            {renderInline(b, userRe, onCite, activeCite, `li-${blockIdx}-${i}`)}
          </li>
        ))}
      </ul>
    );
    bullets = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) {
      flushList();
      continue;
    }
    // bullet: starts with * or - followed by space
    const bulletMatch = /^[\s]*[*\-]\s+(.+)$/.exec(line);
    if (bulletMatch) {
      bullets.push(bulletMatch[1]);
      continue;
    }
    flushList();
    blocks.push(
      <p
        key={`p-${blockIdx++}`}
        style={{ margin: "0 0 10px", lineHeight: 1.7, color: "var(--text-primary)" }}
      >
        {renderInline(line, userRe, onCite, activeCite, `p-${blockIdx}`)}
      </p>
    );
  }
  flushList();
  return blocks;
}

// ---------- main component ----------

interface Props {
  answer: string;
  onCitationClick?: (n: number) => void;
  activeCitation?: number | null;
  refusal?: boolean;
  criticalFlags?: CriticalFlag[];
  yourValues?: ParsedParameter[];
}

export default function AnswerBody({
  answer,
  onCitationClick,
  activeCitation,
  refusal,
  criticalFlags,
  yourValues = [],
}: Props) {
  const userRe = buildUserValueRegex(yourValues);

  return (
    <div
      className="answer-body"
      style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-primary)" }}
    >
      {criticalFlags && criticalFlags.length > 0 && (
        <div className="crit-callout">
          <AlertTriangle size={16} strokeWidth={2} />
          <div className="text">
            IMPORTANT: Your {pretty(criticalFlags[0].parameter)} level of{" "}
            {criticalFlags[0].value} {criticalFlags[0].unit} is in the critical range. Please
            seek medical attention promptly.
          </div>
        </div>
      )}
      {refusal && <RefusalBlock />}
      {renderBlocks(answer, userRe, onCitationClick, activeCitation)}
    </div>
  );
}
