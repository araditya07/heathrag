"""HealthRAG orchestrator: retrieve → rerank → guardrail-check → generate → validate → log.

Pipeline:
1. If a session_id is provided and the user has uploaded a report, build a HealthContext.
2. Run the retriever + reranker as before.
3. PRE-GENERATION: ask Guardrails what intent applies and what instructions to inject.
4. Generate with the health context + guardrail directives in the system prompt.
5. POST-GENERATION: validate that the answer actually followed the guardrails.
6. Log everything (including safety outcomes) to the queries table.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

from src.config import supabase_admin
from src.generation.generator import GeneratedAnswer, Generator
from src.generation.guardrails import GuardrailCheck, GuardrailResult, Guardrails
from src.retrieval.reranker import Reranker
from src.retrieval.retriever import DEFAULT_THRESHOLD, RetrievedChunk, Retriever
from src.upload.health_context import HealthContext, HealthContextResult


@dataclass
class QueryResponse:
    query_id: str
    answer: str
    citations: list[dict]
    sources: list[dict]
    latency_ms: int
    model_used: str
    backend: str = "gemini"
    retrieval_threshold_hit: bool = True

    has_health_context: bool = False
    health_context_parameters: list[str] = field(default_factory=list)
    critical_flags: list[dict] = field(default_factory=list)

    guardrail_intent: str = "none"
    guardrail_passed: bool = True
    guardrail_failure_reason: Optional[str] = None
    disclaimer_present: bool = False
    refused_diagnosis: bool = False
    flagged_critical: bool = False


class Orchestrator:
    def __init__(
        self,
        *,
        k_retrieve: int = 10,
        k_final: int = 5,
        similarity_threshold: float = DEFAULT_THRESHOLD,
        use_reranker: bool = True,
        generator_backend: str = "gemini",
        retriever: Retriever | None = None,
        reranker: Reranker | None = None,
        generator: Generator | None = None,
        guardrails: Guardrails | None = None,
    ):
        self.k_retrieve = k_retrieve
        self.k_final = k_final
        self.similarity_threshold = similarity_threshold
        self.use_reranker = use_reranker
        self.retriever = retriever or Retriever(k=k_retrieve, similarity_threshold=similarity_threshold)
        self.reranker = reranker if reranker is not None else (Reranker() if use_reranker else None)
        self.generator = generator or Generator(backend=generator_backend)
        self.guardrails = guardrails or Guardrails()
        self.sb = supabase_admin()

    def handle_query(
        self,
        question: str,
        *,
        session_id: Optional[str] = None,
        mock_health_context: Optional[dict] = None,
        log: bool = True,
    ) -> QueryResponse:
        """Run the full pipeline.

        `mock_health_context` is a dict that mimics an uploaded report — used by
        eval runs that need health-context-dependent questions without actually
        uploading PDFs.
        """
        start = time.time()

        # ---- Health context ----
        hctx: HealthContextResult
        if mock_health_context is not None:
            hctx = self._mock_context_from_dict(question, mock_health_context)
        elif session_id:
            hctx = HealthContext(session_id=session_id, supabase=self.sb).context_for_query(question)
        else:
            hctx = HealthContextResult(has_context=False)

        # ---- Retrieve + rerank ----
        raw_chunks = self.retriever.retrieve_with_threshold(
            question, threshold=self.similarity_threshold, k=self.k_retrieve
        )
        threshold_hit = len(raw_chunks) > 0

        if self.use_reranker and self.reranker and raw_chunks:
            ranked = self.reranker.rerank(question, raw_chunks)
        else:
            ranked = raw_chunks

        top_chunks: list[RetrievedChunk] = ranked[: self.k_final]

        # ---- Pre-generation guardrail ----
        gr: GuardrailResult = self.guardrails.check(
            question=question,
            chunks=top_chunks,
            critical_flags=hctx.critical_flags or None,
        )

        # ---- Generate ----
        answer: GeneratedAnswer = self.generator.generate(
            question,
            top_chunks,
            guardrail_instructions=gr.instructions,
            health_context=hctx.formatted_context,
        )

        # ---- Post-generation validation ----
        check: GuardrailCheck = self.guardrails.validate_output(answer.text, gr)

        latency_ms = int((time.time() - start) * 1000)

        sources = [
            {
                "chunk_id": c.id,
                "content": c.content,
                "similarity_score": c.similarity_score,
                "reranker_score": c.reranker_score,
                "source_url": (c.metadata or {}).get("source_url", ""),
                "document_title": (c.metadata or {}).get("document_title", ""),
                "section_title": (c.metadata or {}).get("section_title", ""),
            }
            for c in top_chunks
        ]

        record = {
            "question": question,
            "session_id": session_id,
            "has_health_context": hctx.has_context,
            "health_context_summary": {
                "parameters_used": hctx.parameters_used,
                "critical_count": len(hctx.critical_flags or []),
            } if hctx.has_context else None,
            "retrieved_chunk_ids": [c.id for c in top_chunks],
            "retrieved_scores": [float(c.similarity_score) for c in top_chunks],
            "generated_answer": answer.text,
            "citations": answer.citations,
            "model_used": answer.model_used,
            "latency_ms": latency_ms,
            "disclaimer_present": check.disclaimer_present,
            "refused_to_diagnose": check.refused_diagnosis,
            "critical_value_flagged": check.flagged_critical,
            "guardrail_triggered": check.triggered_guardrail,
        }

        query_id = ""
        if log:
            res = self.sb.table("queries").insert(record).execute()
            if res.data:
                query_id = res.data[0]["id"]

        return QueryResponse(
            query_id=query_id,
            answer=answer.text,
            citations=answer.citations,
            sources=sources,
            latency_ms=latency_ms,
            model_used=answer.model_used,
            backend=answer.backend,
            retrieval_threshold_hit=threshold_hit,
            has_health_context=hctx.has_context,
            health_context_parameters=hctx.parameters_used,
            critical_flags=[f.__dict__ for f in (hctx.critical_flags or [])],
            guardrail_intent=gr.intent,
            guardrail_passed=check.passed,
            guardrail_failure_reason=check.failure_reason,
            disclaimer_present=check.disclaimer_present,
            refused_diagnosis=check.refused_diagnosis,
            flagged_critical=check.flagged_critical,
        )

    def _mock_context_from_dict(self, question: str, mock: dict) -> HealthContextResult:
        """Build a HealthContextResult from an eval-dataset mock_health_context payload.

        The payload mirrors the shape of `extracted_values` written by the lab parser:
          {"hba1c": {"value": 6.4, "unit": "%", "status": "high"}, ...}
        """
        from src.upload.lab_report_parser import CriticalFlag
        from src.upload.health_context import HealthContext as _HC, TOPIC_KEYWORDS

        # Reuse HealthContext's relevance selection by treating params like a row.
        relevant = _HC._select_relevant_parameters(question, mock)
        critical_flags: list[CriticalFlag] = []
        for name, p in mock.items():
            status = (p.get("status") or "").lower()
            if status.startswith("critical"):
                critical_flags.append(
                    CriticalFlag(
                        parameter=name,
                        value=float(p.get("value", 0.0)),
                        unit=p.get("unit", ""),
                        threshold=float(p.get("threshold", 0.0)),
                        threshold_kind="high" if status == "critical_high" else "low",
                        severity="critical",
                        action=p.get("action", "Seek medical attention promptly."),
                    )
                )
        formatted = _HC._format(relevant, critical_flags)
        return HealthContextResult(
            has_context=bool(relevant or critical_flags),
            formatted_context=formatted,
            parameters_used=list(relevant.keys()),
            critical_flags=critical_flags,
        )
