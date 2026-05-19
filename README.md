---
title: HealthRAG
emoji: ⚕️
colorFrom: green
colorTo: blue
sdk: docker
app_port: 8000
pinned: false
short_description: AI health companion with safety guardrails + evals
---

# HealthRAG

[![CI](https://github.com/araditya07/heathrag/actions/workflows/ci.yml/badge.svg)](https://github.com/araditya07/heathrag/actions/workflows/ci.yml)

An AI health-information companion. Answers questions using authoritative public
sources (CDC, with WHO / NIH / ICMR planned), lets users upload lab reports for
**personalized** answers grounded in their actual values, and includes a
**three-layer evaluation framework** — retrieval, generation, and a dedicated
guardrail eval that measures refusal-to-diagnose, critical-value alerting, and
mandatory medical disclaimer.

| | |
|---|---|
| **Live demo** | https://heathrag.vercel.app |
| **API** | https://araditya07-healthrag-api.hf.space |
| **Source** | https://github.com/araditya07/heathrag |
| **License** | MIT (see `LICENSE` — note the health-content disclaimer addendum) |
| **Run cost** | $0 / month (HF Space free CPU + Vercel free + Supabase free + Gemini free tier) |

For an in-depth tour of how things are wired together, see
[`ARCHITECTURE.md`](./ARCHITECTURE.md). For the chronological history,
see [`CHANGELOG.md`](./CHANGELOG.md).

---

## Headline metrics (latest run)

The 50-question v2 golden dataset, retrieval-only mode:

| Metric | Value |
|---|---|
| Precision@5 | **0.244** (up from 0.04 once a 1-line URL-prefix matching bug was fixed) |
| Recall@5 | 0.380 |
| MRR | 0.400 |

By question category:

| category | n | P@5 | R@5 | MRR |
|---|---|---|---|---|
| contradictory | 3 | 0.73 | 0.83 | 1.00 |
| multi_doc | 6 | 0.53 | 0.75 | 0.83 |
| personalized | 6 | 0.30 | 0.50 | 0.50 |
| ambiguous | 3 | 0.27 | 0.67 | 0.67 |
| diagnosis_request | 10 | 0.20 | 0.30 | 0.30 |
| critical_value | 6 | 0.17 | 0.33 | 0.33 |
| single_doc | 8 | 0.15 | 0.25 | 0.25 |
| unanswerable | 4 | 0.00 | 0.00 | 0.00 |
| drug_interaction | 4 | 0.00 | 0.00 | 0.00 |

These numbers are **honestly mediocre, and that's the point** — they expose
exactly where the project's next work lies (corpus depth for single_doc,
threshold tuning for unanswerable, a drug DB for drug_interaction). The story
isn't "look at these great numbers"; it's "here is the eval framework that
told me *which* numbers to chase."

A full retrieval × generation × guardrails eval (consuming Gemini calls) is
gated on quota; the retrieval-only sweep tool (`scripts/10_threshold_sweep.py`)
runs free in seconds for fast iteration.

---

## The three-layer eval framework

A bad answer can fail in three independent places:

1. **Retrieval failed** — the relevant chunks weren't pulled.
2. **Generation failed** — good chunks, bad synthesis.
3. **Guardrail failed** — right info, but the system said it too confidently
   (diagnosed when it shouldn't, dropped the disclaimer, missed a critical value).

The dashboards measure each separately so you can diagnose which:

- **`/dashboard/retrieval`** — Precision@k, Recall@k, MRR, per-category
  breakdown, failure explorer.
- **`/dashboard/generation`** — Faithfulness, completeness, hallucination
  rate, medical accuracy (1–5 LLM-as-judge rubric).
- **`/dashboard/guardrails`** — disclaimer compliance, refusal-to-diagnose
  rate, critical-value detection rate, overall pass rate. The interesting
  one.

The retrieval grader uses URL-prefix matching against the golden dataset's
`expected_source_urls`, with a keyword-fallback for chunks that lack URLs.
The generation grader is LLM-as-judge (Gemini), aggregated across N runs per
question. The guardrail grader is deterministic regex + token matching on the
generated answer — no LLM call, so it's cheap and reproducible.

---

## What's inside

| Layer | Tool |
|---|---|
| Frontend | Vite + React + TypeScript + custom CSS design system |
| Backend | FastAPI + Pydantic |
| Vector DB | Supabase Postgres + pgvector (384-dim ivfflat) |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` (local CPU) |
| Reranker | cross-encoder `ms-marco-MiniLM-L-6-v2` (local CPU) |
| Generator + Judge | Gemini 2.5 Flash (free tier) — Ollama fallback wired but optional |
| PDF extraction | pdfplumber, tuned for Indian lab report formats |
| Frontend host | Vercel (auto-deploys from GitHub `main`) |
| Backend host | Hugging Face Spaces (Docker SDK, free CPU, ~16 GB RAM) |
| CI | GitHub Actions: Python compile-check + frontend tsc + build |

---

## Running locally

```bash
# Python
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Env
cp .env.example .env
# fill in SUPABASE_*, GEMINI_API_KEY

# Supabase: paste supabase/migrations/001_initial_schema.sql into the
# SQL editor and Run. Enable the pgvector extension under
# Database → Extensions first.

# Ingest CDC content (~12 min total: scrape 5 min, chunk 5 s, embed 7 min)
python scripts/02_scrape_cdc.py --reset
python scripts/04_chunk_documents.py --reset
python scripts/05_embed_and_store.py
python scripts/06_load_golden_dataset.py --reset

# Cheap retrieval-only eval (no LLM cost, ~10 sec)
python scripts/09_run_full_eval_suite.py --name baseline --reranker --retrieval-only

# Sweep retrieval thresholds (no LLM cost, ~35 sec)
python scripts/10_threshold_sweep.py --reranker

# Full eval with LLM judge — costs ~100 Gemini calls
# (Gemini free tier is 20/day per model, so this needs care)
python scripts/09_run_full_eval_suite.py --name baseline_full --reranker --judge-runs 1

# Run the servers
uvicorn src.api.server:app --port 8000          # backend
cd frontend && npm install && npm run dev       # frontend on :5174
```

---

## What's deliberately missing

- No web-search fallback. When the corpus doesn't cover a topic, the system
  is supposed to say *"I don't have information on this"*. That's part of the
  responsible-AI story, not a gap.
- No auth. Session_id is unauthenticated. Not suitable for real users without
  an auth layer.
- No persisted chat memory. Each `/query` is stateless turn-to-turn.
- No drug-interaction database. `drug_interaction` questions in the golden
  dataset are guaranteed misses until a drug DB scraper is added — and that
  *visible* gap is the eval framework's job.

See `ARCHITECTURE.md` § 7 for the full rationale on each.
