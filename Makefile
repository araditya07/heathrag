# HealthRAG — common dev + eval commands
#
# Run `make` (or `make help`) for the menu.
# Most targets assume a populated .env and a Python venv at .venv/.

PY := .venv/bin/python
PIP := .venv/bin/pip
UVICORN := .venv/bin/uvicorn

.PHONY: help install venv ingest-cdc ingest-medlineplus chunk embed dataset \
        eval-retrieval eval-sweep eval-full backend frontend type-check \
        clean-pycache fmt

# ---- default ----

help:  ## Show this help
	@awk 'BEGIN { FS = ":.*##"; print "HealthRAG · make targets\n" } \
	      /^[a-zA-Z_-]+:.*##/ { printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2 }' \
	      $(MAKEFILE_LIST)

# ---- setup ----

venv:  ## Create .venv and install requirements
	python3 -m venv .venv
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt

install: venv  ## Alias for venv

# ---- ingestion ----

ingest-cdc:  ## Scrape CDC health topics (~5-10 min, $0)
	$(PY) scripts/02_scrape_cdc.py --reset

ingest-medlineplus:  ## Scrape NIH MedlinePlus health topics (~10-15 min, $0)
	$(PY) scripts/03_scrape_medlineplus.py --reset

chunk:  ## Recursive chunking of documents → chunks (~5 s, $0)
	$(PY) scripts/04_chunk_documents.py --reset

embed:  ## Embed chunks locally with sentence-transformers (~10 min for 2k chunks, $0)
	$(PY) scripts/05_embed_and_store.py

dataset:  ## Load the v2 golden dataset (50 entries)
	$(PY) scripts/06_load_golden_dataset.py --reset

# ---- evaluation ----

eval-retrieval:  ## Retrieval-only eval (no LLM cost; ~10 s for 50 Qs)
	$(PY) scripts/09_run_full_eval_suite.py --name retrieval_$$(date +%H%M) --reranker --retrieval-only

eval-sweep:  ## Threshold sweep 0.18-0.50, 8 points (no LLM cost; ~35 s)
	$(PY) scripts/10_threshold_sweep.py --reranker

eval-full:  ## Full eval — generation + judge + guardrails (BURNS ~100 Gemini calls; runs once per day on free tier)
	$(PY) scripts/09_run_full_eval_suite.py --name full_$$(date +%H%M) --reranker --judge-runs 1

# ---- dev servers ----

backend:  ## Run uvicorn locally on :8000
	$(UVICORN) src.api.server:app --port 8000 --reload

frontend:  ## Run Vite dev server (frontend/, defaults to :5173 or :5174 if taken)
	cd frontend && npm run dev

# ---- quality ----

type-check:  ## Frontend tsc --noEmit
	cd frontend && npx tsc --noEmit

# ---- housekeeping ----

clean-pycache:  ## Remove all __pycache__ dirs
	find . -name "__pycache__" -type d -prune -exec rm -rf {} +
