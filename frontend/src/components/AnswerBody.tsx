import { AlertTriangle } from "lucide-react";
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
    if (!p.value && p.value !== (0 as any)) continue;
    const val = String(p.value);
    const unit = p.unit ? `\\s*${escape(p.unit)}` : "";
    patterns.push(`${escape(val)}${unit}`);
  }
  if (!patterns.length) return null;
  return new RegExp(`\\b(${patterns.join("|")})\\b`, "g");
}

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
  // Build a tokenizer that splits on [Source N] AND on user-value matches.
  const citeRe = /\[Source\s+(\d+)\]/g;
  const userRe = buildUserValueRegex(yourValues);
  const nodes: React.ReactNode[] = [];
  let key = 0;

  const renderText = (text: string) => {
    if (!userRe) return text;
    const out: React.ReactNode[] = [];
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    userRe.lastIndex = 0;
    while ((m = userRe.exec(text)) !== null) {
      if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index));
      out.push(
        <mark className="user-value" key={`m-${key++}`}>
          {m[0]}
        </mark>
      );
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < text.length) out.push(text.slice(lastIdx));
    return out;
  };

  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = citeRe.exec(answer)) !== null) {
    const before = answer.slice(lastIdx, m.index);
    if (before) nodes.push(<span key={`t-${key++}`}>{renderText(before)}</span>);
    const n = parseInt(m[1], 10);
    nodes.push(
      <span
        key={`c-${key++}`}
        className="cite"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onCitationClick?.(n);
        }}
        style={{
          outline:
            activeCitation === n ? "2px solid var(--accent)" : undefined,
        }}
      >
        Source {n}
      </span>
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < answer.length) {
    nodes.push(<span key={`t-${key++}`}>{renderText(answer.slice(lastIdx))}</span>);
  }

  return (
    <div className="answer-body" style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text-primary)" }}>
      {criticalFlags && criticalFlags.length > 0 && (
        <div className="crit-callout">
          <AlertTriangle size={16} strokeWidth={2} />
          <div className="text">
            IMPORTANT: Your {pretty(criticalFlags[0].parameter)} level of {criticalFlags[0].value}{" "}
            {criticalFlags[0].unit} is in the critical range. Please seek medical attention promptly.
          </div>
        </div>
      )}
      {refusal && <RefusalBlock />}
      <div>{nodes}</div>
    </div>
  );
}
