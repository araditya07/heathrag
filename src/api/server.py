"""HealthRAG FastAPI server: query, upload, feedback, dashboard reads.

Run with:
    uvicorn src.api.server:app --reload --port 8000
"""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.api.orchestrator import Orchestrator
from src.config import supabase_admin
from src.upload.health_context import parse_and_store

app = FastAPI(title="HealthRAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_orch: Optional[Orchestrator] = None


def orch() -> Orchestrator:
    global _orch
    if _orch is None:
        _orch = Orchestrator()
    return _orch


# ----- request schemas -----


class QueryIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    session_id: Optional[str] = None
    use_reranker: bool = True


class FeedbackIn(BaseModel):
    query_id: str
    rating: Literal["positive", "negative"]
    comment: Optional[str] = None


# ----- endpoints -----


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/query")
def query(payload: QueryIn):
    o = orch()
    o.use_reranker = payload.use_reranker
    if payload.use_reranker and o.reranker is None:
        from src.retrieval.reranker import Reranker
        o.reranker = Reranker()
    resp = o.handle_query(payload.question, session_id=payload.session_id)
    return {
        "query_id": resp.query_id,
        "answer": resp.answer,
        "citations": resp.citations,
        "sources": resp.sources,
        "latency_ms": resp.latency_ms,
        "model_used": resp.model_used,
        "backend": resp.backend,
        "retrieval_threshold_hit": resp.retrieval_threshold_hit,
        "has_health_context": resp.has_health_context,
        "health_context_parameters": resp.health_context_parameters,
        "critical_flags": resp.critical_flags,
        "guardrail": {
            "intent": resp.guardrail_intent,
            "passed": resp.guardrail_passed,
            "failure_reason": resp.guardrail_failure_reason,
            "disclaimer_present": resp.disclaimer_present,
            "refused_diagnosis": resp.refused_diagnosis,
            "flagged_critical": resp.flagged_critical,
        },
    }


@app.post("/upload")
async def upload(
    session_id: str = Form(...),
    file: UploadFile = File(...),
):
    """Accept a lab-report PDF, parse it, store extracted values for this session."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted in the MVP.")
    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(400, "Empty file.")
    if len(pdf_bytes) > 10_000_000:
        raise HTTPException(413, "PDF too large (10 MB max).")
    try:
        result = parse_and_store(pdf_bytes, session_id=session_id, filename=file.filename)
    except Exception as e:
        raise HTTPException(500, f"Failed to parse PDF: {e}") from e
    return result


@app.get("/upload/latest")
def latest_upload(session_id: str):
    """Return the most-recent uploaded report for this session, if any."""
    sb = supabase_admin()
    res = (
        sb.table("uploaded_health_reports")
        .select("*")
        .eq("session_id", session_id)
        .order("uploaded_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


@app.delete("/upload")
def delete_uploads(session_id: str):
    """Clear all uploaded reports for the session (user-initiated)."""
    sb = supabase_admin()
    sb.table("uploaded_health_reports").delete().eq("session_id", session_id).execute()
    return {"ok": True}


@app.post("/feedback")
def feedback(payload: FeedbackIn):
    sb = supabase_admin()
    update: dict = {"user_feedback": payload.rating}
    if payload.comment:
        update["feedback_comment"] = payload.comment[:2000]
    res = sb.table("queries").update(update).eq("id", payload.query_id).execute()
    if not res.data:
        raise HTTPException(404, "query_id not found")
    return {"ok": True}


@app.get("/eval/runs")
def eval_runs():
    sb = supabase_admin()
    res = (
        sb.table("eval_runs")
        .select("*")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return res.data or []


@app.get("/eval/runs/{run_id}/results")
def eval_results(run_id: str):
    sb = supabase_admin()
    res = (
        sb.table("eval_results")
        .select("*")
        .eq("eval_run_id", run_id)
        .order("created_at", desc=False)
        .execute()
    )
    return res.data or []
