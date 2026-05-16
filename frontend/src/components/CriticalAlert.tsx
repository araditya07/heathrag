import { AlertTriangle } from "lucide-react";
import type { CriticalFlag } from "../lib/api";

function pretty(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CriticalAlert({ flags }: { flags: CriticalFlag[] }) {
  if (!flags || flags.length === 0) return null;
  const multi = flags.length > 1;
  return (
    <div className="critical-alert" role="alert" aria-live="assertive">
      <AlertTriangle size={20} strokeWidth={2} className="lead" />
      <div className="body">
        <div className="title">{multi ? "Multiple critical values detected" : "Critical value detected"}</div>
        <div className="msg">
          {multi ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {flags.map((f) => (
                <li key={f.parameter}>
                  {pretty(f.parameter)} ({f.value} {f.unit}) — {f.threshold_kind} threshold {f.threshold}.
                </li>
              ))}
            </ul>
          ) : (
            <>
              Your {pretty(flags[0].parameter)} ({flags[0].value} {flags[0].unit}) is{" "}
              {flags[0].threshold_kind === "high" ? "above" : "below"} the critical threshold (
              {flags[0].threshold_kind} {flags[0].threshold}). Please seek medical attention promptly.
            </>
          )}
        </div>
        <div className="note">
          Automated alert based on standard medical thresholds, not a diagnosis.
        </div>
      </div>
    </div>
  );
}
