"""Full HealthRAG eval suite: retrieval + generation + guardrails over the golden dataset.

Examples:
    python scripts/09_run_full_eval_suite.py --name baseline
    python scripts/09_run_full_eval_suite.py --name "+reranker" --reranker
    python scripts/09_run_full_eval_suite.py --name "guardrails_strong" --reranker
    python scripts/09_run_full_eval_suite.py --name "threshold_0.55" --threshold 0.55

Each question makes ~4 Gemini calls (1 generation + 3 judge). On the free tier (~15 RPM)
a 30-question run takes ~8 min; 120 questions takes ~32 min.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path

from tqdm import tqdm

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.api.orchestrator import Orchestrator  # noqa: E402
from src.config import (  # noqa: E402
    EMBEDDING_MODEL,
    GEMINI_MODEL,
    RERANKER_MODEL,
    supabase_admin,
)
from src.evals.eval_rubrics import JUDGE_RUNS_PER_QUESTION, classify_failure  # noqa: E402
from src.evals.generation_eval import GenerationEvaluator  # noqa: E402
from src.evals.guardrail_eval import aggregate as guardrail_aggregate  # noqa: E402
from src.evals.guardrail_eval import per_question_result  # noqa: E402
from src.evals.retrieval_eval import aggregate as retrieval_aggregate  # noqa: E402
from src.evals.retrieval_eval import evaluate_question  # noqa: E402
from src.generation.guardrails import GuardrailCheck, Guardrails  # noqa: E402
from src.retrieval.retriever import DEFAULT_THRESHOLD, Retriever  # noqa: E402


def load_golden(sb) -> list[dict]:
    res = sb.table("eval_golden_dataset").select("*").execute()
    return res.data or []


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--name", required=True)
    p.add_argument("--k", type=int, default=5)
    p.add_argument("--k-retrieve", type=int, default=10)
    p.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD)
    p.add_argument("--reranker", action="store_true")
    p.add_argument("--chunk-size", type=int, default=512)
    p.add_argument("--chunk-overlap", type=int, default=50)
    p.add_argument("--judge-runs", type=int, default=JUDGE_RUNS_PER_QUESTION)
    p.add_argument("--backend", choices=["gemini", "ollama", "auto"], default="gemini")
    p.add_argument("--limit", type=int, default=None)
    args = p.parse_args()

    sb = supabase_admin()

    golden = load_golden(sb)
    if args.limit:
        golden = golden[: args.limit]
    if not golden:
        print("No golden dataset rows. Run scripts/06_load_golden_dataset.py first.")
        return

    estimated_calls = len(golden) * (1 + args.judge_runs)
    est_minutes = estimated_calls * 4 / 60 if args.backend == "gemini" else estimated_calls * 5 / 60
    print(
        f"Running eval over {len(golden)} questions. name={args.name} backend={args.backend}\n"
        f"≈ {estimated_calls} LLM calls, est. ~{est_minutes:.0f} min."
    )

    retriever = Retriever(k=args.k_retrieve, similarity_threshold=args.threshold)
    orch = Orchestrator(
        k_retrieve=args.k_retrieve,
        k_final=args.k,
        similarity_threshold=args.threshold,
        use_reranker=args.reranker,
        generator_backend=args.backend,
        retriever=retriever,
    )
    judge = GenerationEvaluator(n_runs=args.judge_runs, backend=args.backend)

    config = {
        "chunk_size": args.chunk_size,
        "chunk_overlap": args.chunk_overlap,
        "embedding_model": EMBEDDING_MODEL,
        "retriever_k": args.k,
        "retriever_k_retrieve": args.k_retrieve,
        "similarity_threshold": args.threshold,
        "reranker_enabled": args.reranker,
        "reranker_model": RERANKER_MODEL if args.reranker else None,
        "generator_model": GEMINI_MODEL,
        "generator_backend": args.backend,
        "judge_model": GEMINI_MODEL,
        "judge_runs_per_question": args.judge_runs,
        "guardrails_enabled": True,
        "timestamp": dt.datetime.utcnow().isoformat() + "Z",
    }

    run_insert = sb.table("eval_runs").insert(
        {
            "run_name": args.name,
            "config": config,
            "total_questions": len(golden),
        }
    ).execute()
    run_id = run_insert.data[0]["id"]

    start = time.time()
    retrieval_results = []
    per_q_records = []
    guardrail_per_q = []

    for q in tqdm(golden, desc="Evaluating"):
        # Retrieval-only eval
        ret = evaluate_question(
            retriever, q, k=args.k, use_threshold=True, threshold=args.threshold
        )
        retrieval_results.append(ret)

        # Full pipeline (with mock health context for personalized/critical/diagnosis questions)
        mock = q.get("mock_health_context")
        resp = orch.handle_query(q["question"], mock_health_context=mock, log=False)

        from src.retrieval.retriever import RetrievedChunk

        chunk_objs = [
            RetrievedChunk(
                id=s["chunk_id"],
                document_id="",
                content=s["content"],
                similarity_score=s["similarity_score"],
                metadata={
                    "source_url": s.get("source_url", ""),
                    "section_title": s.get("section_title", ""),
                },
                reranker_score=s.get("reranker_score"),
            )
            for s in resp.sources
        ]

        gen = judge.evaluate(
            question=q["question"],
            expected_answer=q.get("expected_answer", ""),
            generated_answer=resp.answer,
            retrieved_chunks=chunk_objs,
        )

        # Reconstruct a GuardrailCheck from the orchestrator response for the per-Q row.
        check = GuardrailCheck(
            disclaimer_present=resp.disclaimer_present,
            refused_diagnosis=resp.refused_diagnosis,
            flagged_critical=resp.flagged_critical,
            triggered_guardrail=resp.guardrail_intent if resp.guardrail_intent != "none" else None,
            passed=resp.guardrail_passed,
            failure_reason=resp.guardrail_failure_reason,
            contains_definitive_diagnosis=Guardrails()._has_definitive_diagnosis(resp.answer),
        )
        gq = per_question_result(question_row=q, check=check)
        guardrail_per_q.append(gq)

        failure = classify_failure(
            precision_at_k=ret.precision_at_k,
            recall_at_k=ret.recall_at_k,
            mrr=ret.mrr,
            faithfulness=gen.faithfulness,
            completeness=gen.completeness,
            relevance=gen.relevance,
            hallucination_detected=gen.hallucination_detected,
            expected_guardrail=q.get("expected_guardrail"),
            disclaimer_present=check.disclaimer_present,
            refused_diagnosis=check.refused_diagnosis,
            flagged_critical=check.flagged_critical,
            contains_definitive_diagnosis=check.contains_definitive_diagnosis,
        )

        per_q_records.append(
            {
                "eval_run_id": run_id,
                "question_id": q["id"],
                "question_text": q["question"],
                "category": q["category"],
                "retrieved_chunk_ids": ret.retrieved_chunk_ids,
                "expected_chunk_ids": ret.expected_chunk_ids,
                "precision_at_k": ret.precision_at_k,
                "recall_at_k": ret.recall_at_k,
                "mrr": ret.mrr,
                "generated_answer": resp.answer,
                "faithfulness_score": gen.faithfulness,
                "completeness_score": gen.completeness,
                "hallucination_detected": gen.hallucination_detected,
                "relevance_score": gen.relevance,
                "medical_accuracy_score": gen.medical_accuracy,
                "judge_reasoning": gen.judge_reasoning,
                "disclaimer_present": check.disclaimer_present,
                "expected_guardrail": q.get("expected_guardrail"),
                "actual_guardrail_triggered": check.triggered_guardrail,
                "guardrail_passed": check.passed,
                "guardrail_failure_reason": check.failure_reason,
                "failure_type": failure,
            }
        )

    BATCH = 50
    for i in range(0, len(per_q_records), BATCH):
        sb.table("eval_results").insert(per_q_records[i : i + BATCH]).execute()

    ret_agg = retrieval_aggregate(retrieval_results)
    n = len(per_q_records) or 1
    faith = sum(r["faithfulness_score"] for r in per_q_records) / n
    comp = sum(r["completeness_score"] for r in per_q_records) / n
    rel = sum(r["relevance_score"] for r in per_q_records) / n
    med = sum(r["medical_accuracy_score"] for r in per_q_records) / n
    hall_rate = sum(1 for r in per_q_records if r["hallucination_detected"]) / n

    gr_agg = guardrail_aggregate(guardrail_per_q)
    duration = time.time() - start

    sb.table("eval_runs").update(
        {
            "retrieval_precision_at_k": ret_agg.precision_at_k,
            "retrieval_recall_at_k": ret_agg.recall_at_k,
            "retrieval_mrr": ret_agg.mrr,
            "generation_faithfulness": faith,
            "generation_completeness": comp,
            "generation_hallucination_rate": hall_rate,
            "generation_relevance": rel,
            "generation_medical_accuracy": med,
            "guardrail_disclaimer_rate": gr_agg.disclaimer_rate,
            "guardrail_refusal_rate": gr_agg.refusal_rate,
            "guardrail_critical_detection_rate": gr_agg.critical_detection_rate,
            "guardrail_overall_pass_rate": gr_agg.overall_pass_rate,
            "run_duration_seconds": duration,
        }
    ).eq("id", run_id).execute()

    print("\n" + "=" * 60)
    print(f"Eval run: {args.name}  (id={run_id})")
    print("=" * 60)
    print(f"Duration: {duration:.1f}s   Questions: {len(per_q_records)}")
    print(f"\nRetrieval:")
    print(f"  Precision@{args.k}: {ret_agg.precision_at_k:.3f}")
    print(f"  Recall@{args.k}:    {ret_agg.recall_at_k:.3f}")
    print(f"  MRR:               {ret_agg.mrr:.3f}")
    print(f"\nGeneration:")
    print(f"  Faithfulness:      {faith:.2f} / 5")
    print(f"  Completeness:      {comp:.2f} / 5")
    print(f"  Relevance:         {rel:.2f} / 5")
    print(f"  Medical accuracy:  {med:.2f} / 5")
    print(f"  Hallucination rate: {hall_rate * 100:.1f}%")
    print(f"\nGuardrails:")
    print(f"  Disclaimer compliance:   {gr_agg.disclaimer_rate * 100:.1f}%")
    print(f"  Diagnosis refusal:       {gr_agg.refusal_rate * 100:.1f}%  ({gr_agg.refusal_pass}/{gr_agg.refusal_total})")
    print(f"  Critical value flagging: {gr_agg.critical_detection_rate * 100:.1f}%  ({gr_agg.critical_pass}/{gr_agg.critical_total})")
    print(f"  Overall pass rate:       {gr_agg.overall_pass_rate * 100:.1f}%  ({gr_agg.overall_pass}/{gr_agg.overall_total})")
    print(f"\nBy category (retrieval):")
    print(json.dumps(ret_agg.by_category, indent=2))


if __name__ == "__main__":
    main()
