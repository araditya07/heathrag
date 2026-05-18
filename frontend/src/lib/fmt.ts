/**
 * Null-aware formatters for eval metrics.
 * The eval_runs table has many nullable columns — runs in flight or runs
 * that crashed will have nulls. Render those as "—", not "0.00".
 */

export function fmtScore(x: number | null | undefined, digits = 2): string {
  if (x == null || Number.isNaN(x)) return "—";
  return x.toFixed(digits);
}

export function fmtScoreOf5(x: number | null | undefined, digits = 2): string {
  if (x == null || Number.isNaN(x)) return "—";
  return `${x.toFixed(digits)} / 5`;
}

export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (x == null || Number.isNaN(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtInt(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  return String(Math.round(x));
}
