---
title: HealthRAG
emoji: ⚕️
colorFrom: green
colorTo: blue
sdk: docker
app_port: 8000
pinned: false
short_description: AI health companion with safety guardrails, evals, and uploads
---

# HealthRAG

An AI health-information companion that answers questions using public sources (CDC,
and planned: WHO, NIH, ICMR), with safety guardrails (refusal to diagnose, critical-value
alerting, mandatory medical disclaimer), an upload pipeline for lab reports, and a
**three-layer eval framework** (retrieval, generation, guardrails).

- **Live frontend:** https://heathrag.vercel.app
- **Live backend (this Space):** depends on `huggingface.co/spaces/<user>/healthrag-api`
- **Source:** https://github.com/araditya07/heathrag
- **Cost:** $0 — local sentence-transformers embeddings, local cross-encoder reranker,
  Gemini Flash on the free tier, Supabase free tier, Vercel free tier, HF Spaces free CPU.

## Architecture

```
Browser
  │
  ▼ HTTPS
Vercel (Vite/React/TS frontend)
  │
  ▼ /api → VITE_API_BASE
HF Spaces (this) — FastAPI:
  - Retriever: sentence-transformers/all-MiniLM-L6-v2 (384-dim, local CPU)
  - Reranker:  cross-encoder/ms-marco-MiniLM-L-6-v2 (local CPU)
  - Generator + Judge: gemini-2.5-flash via google-generativeai
  - Guardrails: pre-gen intent detection + post-gen validation
  - Upload pipeline: pdfplumber → lab-report parser → critical-value classifier
  │
  ▼
Supabase Postgres + pgvector (documents, chunks, queries, eval_runs, eval_results,
                              uploaded_health_reports, eval_golden_dataset, product_metrics)
```

## Local development

```bash
# Python
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Env
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_*_KEY, GEMINI_API_KEY

# Supabase: paste supabase/migrations/001_initial_schema.sql into the SQL editor and Run.
# Enable the pgvector extension under Database → Extensions first.

# Ingest CDC content
python scripts/02_scrape_cdc.py --reset
python scripts/04_chunk_documents.py --reset
python scripts/05_embed_and_store.py
python scripts/06_load_golden_dataset.py

# Run eval (lean: 30 LLM calls — fits Gemini's free-tier daily budget)
python scripts/09_run_full_eval_suite.py --name baseline --reranker --judge-runs 0

# Servers
uvicorn src.api.server:app --port 8000          # backend
cd frontend && npm install && npm run dev       # frontend on :5174
```

## What's inside

| Layer | Tool |
|---|---|
| Vector DB | Supabase (pgvector, 384 dims) |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` (local) |
| Reranker | cross-encoder `ms-marco-MiniLM-L-6-v2` (local) |
| Generator + Judge | Gemini 2.5 Flash (free tier) |
| PDF extraction | pdfplumber |
| Frontend | Vite + React + TypeScript + custom CSS design system |
| Charts | Hand-rolled SVG (no chart lib dependency) |

See `HEALTHRAG_BUILD_PLAN.md` for the full design.

## The guardrail layer

Three safety rules are enforced in code, not just in the prompt:

1. **Disclaimer compliance** — every answer must include the medical disclaimer, checked
   post-generation against a fuzzy-match list of phrases. Logged to `queries.disclaimer_present`.
2. **Refusal to diagnose** — diagnosis-pattern detection runs pre-generation, the prompt
   gets an explicit "do not diagnose" instruction, and the answer is post-checked for
   both refusal language AND the absence of definitive diagnostic claims.
3. **Critical-value alerting** — when uploaded lab data crosses a critical threshold, the
   prompt is instructed to lead with a "⚠️ IMPORTANT" callout, and the post-check verifies
   the answer mentioned both the parameter and "seek medical attention" phrasing.

The **Guardrails dashboard** (`/dashboard/guardrails`) measures each independently,
plus an overall pass rate, across eval runs.
