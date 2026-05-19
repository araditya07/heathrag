"""Sweep the retriever's similarity threshold and report the precision-recall
tradeoff curve across the golden dataset.

Runs retrieval-only evaluations (no LLM calls, no Gemini quota burn) at a set
of thresholds, then prints a comparison table and writes a JSON summary.

Usage::

    python scripts/10_threshold_sweep.py
    python scripts/10_threshold_sweep.py --thresholds 0.18,0.22,0.25,0.28,0.30
    python scripts/10_threshold_sweep.py --reranker --output sweep.json

Why this exists
---------------

Retrieval threshold is the single most consequential knob for two metrics
that pull in opposite directions:

* **Precision / recall** — lowering the threshold lets more chunks through,
  hurting precision; raising it cuts noise but starves the LLM of context.
* **Unanswerable handling** — we *want* retrieval to return nothing for
  out-of-scope questions ("Ayurvedic cure for cancer"). Too-low threshold
  means we surface unrelated chunks and the system answers when it shouldn't.

There is no single "right" answer — only a curve. This script plots it.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from tqdm import tqdm

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.config import supabase_admin  # noqa: E402
from src.evals.retrieval_eval import aggregate, evaluate_question  # noqa: E402
from src.retrieval.retriever import Retriever  # noqa: E402


DEFAULT_THRESHOLDS = [0.18, 0.20, 0.22, 0.25, 0.28, 0.30]


def parse_thresholds(s: str) -> list[float]:
    return [float(x.strip()) for x in s.split(",") if x.strip()]


def main():
    p = argparse.ArgumentParser()
    p.add_argument(
        "--thresholds",
        type=parse_thresholds,
        default=DEFAULT_THRESHOLDS,
        help="Comma-separated list of similarity thresholds to test.",
    )
    p.add_argument("--k", type=int, default=5)
    p.add_argument("--k-retrieve", type=int, default=10)
    p.add_argument("--reranker", action="store_true")
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--output", type=str, default=None, help="Optional JSON output path.")
    args = p.parse_args()

    sb = supabase_admin()
    golden = sb.table("eval_golden_dataset").select("*").execute().data or []
    if args.limit:
        golden = golden[: args.limit]
    if not golden:
        print("No golden dataset rows. Run scripts/06_load_golden_dataset.py first.")
        return

    print(f"Sweeping {len(args.thresholds)} thresholds over {len(golden)} questions.")
    print(f"Settings: k={args.k}, k_retrieve={args.k_retrieve}, reranker={args.reranker}\n")

    rows: list[dict] = []

    for threshold in args.thresholds:
        retriever = Retriever(k=args.k_retrieve, similarity_threshold=threshold)
        per_q = []
        start = time.time()
        for q in tqdm(golden, desc=f"thr={threshold:.2f}", leave=False):
            ret = evaluate_question(
                retriever, q, k=args.k, use_threshold=True, threshold=threshold
            )
            per_q.append(ret)
        agg = aggregate(per_q)
        duration = time.time() - start

        # Specifically inspect unanswerable handling: how many of those Qs
        # got *correctly* nothing (1.0) vs. surfaced something (0.0).
        unanswerable = [r for r in per_q if r.category == "unanswerable"]
        unanswerable_correct = sum(1 for r in unanswerable if r.precision_at_k == 1.0)

        rows.append({
            "threshold": threshold,
            "precision_at_k": agg.precision_at_k,
            "recall_at_k": agg.recall_at_k,
            "mrr": agg.mrr,
            "unanswerable_correct": unanswerable_correct,
            "unanswerable_total": len(unanswerable),
            "duration_s": duration,
            "by_category": agg.by_category,
        })

    # Pretty-print a compact comparison table.
    print()
    print(f"{'threshold':>10}  {'P@k':>6}  {'R@k':>6}  {'MRR':>6}  "
          f"{'unans correct':>14}  {'time':>6}")
    print("-" * 64)
    for r in rows:
        print(
            f"{r['threshold']:>10.2f}  "
            f"{r['precision_at_k']:>6.3f}  "
            f"{r['recall_at_k']:>6.3f}  "
            f"{r['mrr']:>6.3f}  "
            f"{r['unanswerable_correct']:>5}/{r['unanswerable_total']:<8}  "
            f"{r['duration_s']:>5.1f}s"
        )

    # Highlight the threshold with best F1 (precision + recall harmonic mean).
    def f1(r):
        p, q = r["precision_at_k"], r["recall_at_k"]
        return 2 * p * q / (p + q) if (p + q) > 0 else 0.0

    best = max(rows, key=f1)
    print(f"\nBest F1: {f1(best):.3f} at threshold = {best['threshold']:.2f}")

    if args.output:
        Path(args.output).write_text(json.dumps(rows, indent=2))
        print(f"Saved sweep JSON to {args.output}")


if __name__ == "__main__":
    main()
