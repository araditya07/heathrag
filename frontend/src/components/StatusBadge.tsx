import { AlertTriangle, ArrowDown, ArrowUp, Check } from "lucide-react";
import type { ParsedParameter } from "../lib/api";

const ICONS = {
  normal: Check,
  high: ArrowUp,
  low: ArrowDown,
  critical_high: AlertTriangle,
  critical_low: AlertTriangle,
  unknown: Check,
} as const;

const LABELS = {
  normal: "normal",
  high: "high",
  low: "low",
  critical_high: "critical",
  critical_low: "critical",
  unknown: "—",
} as const;

const KIND = {
  normal: "normal",
  high: "high",
  low: "low",
  critical_high: "critical",
  critical_low: "critical",
  unknown: "normal",
} as const;

export default function StatusBadge({ status }: { status: ParsedParameter["status"] }) {
  const Icon = ICONS[status];
  const label = LABELS[status];
  const kind = KIND[status];
  const size = status.startsWith("critical_") ? 12 : 11;
  return (
    <span className={`status-badge ${kind}`} aria-label={`status: ${label}`}>
      <Icon size={size} strokeWidth={2} />
      <span>{label}</span>
    </span>
  );
}
