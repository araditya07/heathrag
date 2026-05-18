import { Info } from "lucide-react";

export default function DemoNotice() {
  return (
    <div
      role="note"
      aria-label="Demonstration notice"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        margin: "0 0 16px",
        background: "var(--warning-surface)",
        border: "0.5px solid var(--warning)",
        borderRadius: "var(--radius-md)",
        fontSize: 12,
        color: "var(--warning-text)",
        lineHeight: 1.5,
      }}
    >
      <Info size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
      <span>
        <strong>Demonstration only.</strong> This website is for educational and
        portfolio purposes. It is not medical advice and should not be used for
        clinical decisions. Please consult a qualified healthcare professional for
        assessment.
      </span>
    </div>
  );
}
