import type { EvalRun } from "../lib/api";

export default function RunSelector({
  runs,
  selectedId,
  onSelect,
}: {
  runs: EvalRun[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <select
      className="dropdown-trigger"
      style={{ minWidth: 220 }}
      value={selectedId ?? ""}
      onChange={(e) => onSelect(e.target.value)}
    >
      {runs.length === 0 && <option value="">No runs yet</option>}
      {runs.map((r) => (
        <option key={r.id} value={r.id}>
          {r.run_name} — {new Date(r.created_at).toLocaleDateString()}
        </option>
      ))}
    </select>
  );
}
