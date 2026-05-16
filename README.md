# RAG Ops

Production-grade RAG system with a two-layer eval framework (retrieval quality + generation quality) and an observable dashboard. Ingests GitLab handbook + Stripe docs. **Total runtime cost: $0** — local sentence-transformers embeddings, local cross-encoder reranker, Gemini 2.5 Flash on the free tier.

## Setup

```bash
# 1. Python deps (first install pulls torch ~750MB; one-time)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Env
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_*_KEY, GEMINI_API_KEY

# 3. Run migration in Supabase SQL editor
cat supabase/migrations/001_initial_schema.sql
# (paste into Supabase → SQL Editor → Run; ensure pgvector extension is enabled)

# 4. Ingest data (HF models auto-download on first use, ~80MB each)
python scripts/01_scrape_gitlab.py
python scripts/02_scrape_stripe.py
python scripts/03_chunk_documents.py
python scripts/04_embed_and_store.py    # local, ~500-1000 chunks/sec on CPU

# 5. Load golden eval set
python scripts/05_load_golden_dataset.py

# 6. Run evals (rate-limited to ~27 min by Gemini 15 RPM)
python scripts/07_run_full_eval_suite.py --name baseline

# 7. Run the app
uvicorn src.api.server:app --reload          # backend on :8000
cd frontend && npm install && npm run dev    # frontend on :5173
```

## Tech stack (all free)

| Layer | Tool |
|---|---|
| Vector DB | Supabase (pgvector, 384 dims) |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` (local) |
| Reranker | cross-encoder `ms-marco-MiniLM-L-6-v2` (local) |
| Generator | Google Gemini 2.5 Flash (free tier) |
| Eval judge | Google Gemini 2.5 Flash (free tier) |
| Optional fallback | Ollama llama3.1:8b (local, unlimited) |
| Frontend | Vite + React + Tailwind + Recharts |

See `RAG_OPS_BUILD_PLAN_v2.md` for the full design.
