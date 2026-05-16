"""LLM-as-judge generation eval using Gemini 2.5 Flash.

Calls are paced by the shared llm_client to stay under the free-tier 15 RPM cap.
Each question is judged `n_runs` times and scores are mean-aggregated.
"""

from __future__ import annotations

import json
import re
import statistics
from dataclasses import dataclass, field

from src.config import GEMINI_MODEL
from src.evals.eval_rubrics import (
    JUDGE_RUNS_PER_QUESTION,
    JUDGE_SYSTEM_PROMPT,
    JUDGE_USER_TEMPLATE,
    JUDGE_VARIANCE_FLAG_THRESHOLD,
)
from src.generation.llm_client import llm_generate
from src.generation.prompt_templates import build_context_block
from src.retrieval.retriever import RetrievedChunk


@dataclass
class GenerationEvalScore:
    faithfulness: float
    completeness: float
    relevance: float
    medical_accuracy: float
    hallucination_detected: bool
    hallucination_severity: str
    hallucination_examples: list[str] = field(default_factory=list)
    judge_reasoning: str = ""
    variance_flag: bool = False
    n_runs: int = 0


_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)


def _parse_judge_response(text: str) -> dict | None:
    m = _JSON_RE.search(text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


class GenerationEvaluator:
    def __init__(self, n_runs: int = JUDGE_RUNS_PER_QUESTION, backend: str = "gemini"):
        # Allow n_runs=0 to skip the judge entirely (saves LLM calls; useful when
        # only the deterministic guardrail metrics matter).
        self.n_runs = max(0, n_runs)
        self.backend = backend

    def _judge_once(
        self, question: str, expected_answer: str, generated_answer: str, context: str
    ) -> dict | None:
        user = JUDGE_USER_TEMPLATE.format(
            question=question,
            expected_answer=expected_answer,
            generated_answer=generated_answer,
            context=context,
        )
        # Slight temperature so multiple runs don't collapse to identical output.
        resp = llm_generate(
            user,
            backend=self.backend,
            system=JUDGE_SYSTEM_PROMPT,
            max_tokens=600,
            temperature=0.3,
        )
        return _parse_judge_response(resp.text)

    def evaluate(
        self,
        *,
        question: str,
        expected_answer: str,
        generated_answer: str,
        retrieved_chunks: list[RetrievedChunk],
    ) -> GenerationEvalScore:
        if self.n_runs == 0:
            return GenerationEvalScore(
                faithfulness=0,
                completeness=0,
                relevance=0,
                medical_accuracy=0,
                hallucination_detected=False,
                hallucination_severity="none",
                judge_reasoning="judge_skipped",
                n_runs=0,
            )

        context = build_context_block(retrieved_chunks) if retrieved_chunks else "(no context retrieved)"

        runs = []
        reasonings = []
        for _ in range(self.n_runs):
            r = self._judge_once(question, expected_answer, generated_answer, context)
            if r:
                runs.append(r)
                reasonings.append(self._extract_reasoning(r))

        if not runs:
            return GenerationEvalScore(
                faithfulness=0,
                completeness=0,
                relevance=0,
                medical_accuracy=0,
                hallucination_detected=False,
                hallucination_severity="none",
                judge_reasoning="judge_parse_failed",
                n_runs=0,
            )

        faith = [self._score(r, "faithfulness") for r in runs]
        comp = [self._score(r, "completeness") for r in runs]
        rel = [self._score(r, "relevance") for r in runs]
        med = [self._score(r, "medical_accuracy") for r in runs]

        hall_flags = [bool((r.get("hallucination") or {}).get("detected", False)) for r in runs]
        detected = sum(hall_flags) > (len(hall_flags) / 2)
        severities = [(r.get("hallucination") or {}).get("severity", "none") for r in runs]
        severity = _worst_severity(severities)
        examples = []
        for r in runs:
            ex = (r.get("hallucination") or {}).get("examples") or []
            examples.extend([str(e)[:300] for e in ex])

        variance_flag = any(
            (statistics.pstdev(xs) > JUDGE_VARIANCE_FLAG_THRESHOLD) if len(xs) > 1 else False
            for xs in [faith, comp, rel, med]
        )

        return GenerationEvalScore(
            faithfulness=statistics.mean(faith),
            completeness=statistics.mean(comp),
            relevance=statistics.mean(rel),
            medical_accuracy=statistics.mean(med) if med else 0.0,
            hallucination_detected=detected,
            hallucination_severity=severity,
            hallucination_examples=list(dict.fromkeys(examples))[:5],
            judge_reasoning=" | ".join(reasonings)[:2000],
            variance_flag=variance_flag,
            n_runs=len(runs),
        )

    @staticmethod
    def _score(run: dict, key: str) -> float:
        node = run.get(key) or {}
        s = node.get("score", 0)
        try:
            return float(s)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _extract_reasoning(run: dict) -> str:
        parts = []
        for k in ("faithfulness", "completeness", "relevance", "medical_accuracy"):
            node = run.get(k) or {}
            r = node.get("reasoning")
            if r:
                parts.append(f"[{k}] {r}")
        return " ".join(parts)


_SEVERITY_RANK = {"none": 0, "minor": 1, "major": 2}


def _worst_severity(severities: list[str]) -> str:
    if not severities:
        return "none"
    return max(severities, key=lambda s: _SEVERITY_RANK.get(s, 0))


# Re-exported for readers who want to log which model judged.
JUDGE_MODEL_NAME = GEMINI_MODEL
