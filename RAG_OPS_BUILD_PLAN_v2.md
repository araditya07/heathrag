# RAG Ops: internal knowledge base with observable AI quality

## What this project is

A production-grade RAG (retrieval-augmented generation) system that ingests public company documentation, answers user questions with cited sources, and — critically — includes a full eval framework with a visual dashboard that independently measures retrieval quality and generation quality.

This is not a chatbot demo. This is an AI system with observability, evaluation, and iteration built in from day one.

## Why this project exists

This project demonstrates deep AI product management and engineering skills for applied AI roles at Series B startups. It shows:

- System architecture thinking (not just "call an API")
- Two-layer eval design (retrieval evals separate from generation evals)
- Understanding of RAG failure modes (hallucination, retrieval misses, confidence calibration)
- Iteration based on measurement (not vibes)
- Product metrics that connect offline quality to real user behavior

---

## Tech stack (100% free)

| Component | Tool | Why |
|---|---|---|
| Backend database | Supabase free tier (PostgreSQL + pgvector) | Vector storage + relational data in one place, free tier gives 500MB and 50K rows |
| Embeddings | HuggingFace sentence-transformers `all-MiniLM-L6-v2` (local) | Runs on CPU, no API key needed, zero cost, 384 dimensions |
| Reranker | HuggingFace cross-encoder `ms-marco-MiniLM-L-6-v2` (local) | Purpose-built for passage reranking, runs on CPU, zero cost |
| LLM for generation | Google Gemini 2.5 Flash (free tier) | 1,500 requests/day free, no credit card required, strong instruction following |
| LLM for evals (judge) | Google Gemini 2.5 Flash (free tier) | Same free tier, shares the 1,500/day budget with generation |
| Local LLM fallback | Ollama with llama3.1:8b | Fully offline, unlimited, for when you hit rate limits or want zero dependency |
| Frontend | React (Next.js or Vite) | Build with Claude Code, deploy to Vercel |
| Frontend hosting | Vercel free tier | Free deployment with custom domain |
| Language | Python (backend scripts), TypeScript (frontend) | Python for ML/data pipelines, TS for UI |

### Cost breakdown

```
Embeddings: $0 (local model)
Reranker: $0 (local model)
Generation LLM: $0 (Gemini 2.5 Flash free tier)
Eval judge LLM: $0 (Gemini 2.5 Flash free tier)
Supabase: $0 (free tier)
Vercel: $0 (free tier)
Total: $0
```

### Rate limit budget (Gemini 2.5 Flash free tier)

```
Daily limit: ~1,500 requests/day
Per-minute limit: ~15 requests/minute
Token limit: 250,000 tokens/minute

Typical daily usage:
- Manual testing: ~50 queries = 50 calls
- One full eval suite: 100 questions x (1 generation + 3 judge runs) = 400 calls
- Buffer for debugging: ~50 calls
- Total: ~500 calls/day (well within 1,500 limit)

Constraint: don't run more than 3 full eval suites in one day.
This is fine — you wouldn't do that anyway.
```

### Free tier data privacy note

Gemini free tier data may be used by Google to improve their products. This is acceptable
for this project because all data is public (GitLab handbook, Stripe docs). Do NOT send
private or sensitive data through the free tier. If this matters for a future use case,
either upgrade to paid tier or use Ollama locally.

---

## Project structure

```
rag-ops/
├── README.md
├── .env.example
├── requirements.txt
├── package.json
│
├── data/
│   ├── sources/
│   │   ├── gitlab-handbook/
│   │   └── stripe-docs/
│   ├── golden_eval_dataset.json
│   └── synthetic_edge_cases.json
│
├── scripts/
│   ├── 01_scrape_gitlab.py
│   ├── 02_scrape_stripe.py
│   ├── 03_chunk_documents.py
│   ├── 04_embed_and_store.py
│   ├── 05_run_retrieval_evals.py
│   ├── 06_run_generation_evals.py
│   └── 07_run_full_eval_suite.py
│
├── src/
│   ├── ingestion/
│   │   ├── scraper.py
│   │   ├── chunker.py
│   │   └── embedder.py
│   ├── retrieval/
│   │   ├── retriever.py
│   │   └── reranker.py
│   ├── generation/
│   │   ├── generator.py
│   │   └── prompt_templates.py
│   ├── evals/
│   │   ├── retrieval_eval.py
│   │   ├── generation_eval.py
│   │   ├── eval_rubrics.py
│   │   └── eval_runner.py
│   └── api/
│       ├── query_endpoint.py
│       └── eval_endpoint.py
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── SearchPage.tsx
│   │   │   └── EvalDashboard.tsx
│   │   ├── components/
│   │   │   ├── SearchBar.tsx
│   │   │   ├── AnswerCard.tsx
│   │   │   ├── SourceCitations.tsx
│   │   │   ├── FeedbackButtons.tsx
│   │   │   ├── RetrievalQualityPanel.tsx
│   │   │   ├── GenerationQualityPanel.tsx
│   │   │   ├── FailureExplorer.tsx
│   │   │   └── MetricCard.tsx
│   │   └── lib/
│   │       └── supabase.ts
│   └── package.json
│
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql
```

---

## Supabase database schema

Create these tables in order. This is the foundation everything else builds on.

### Migration: 001_initial_schema.sql

```sql
-- Enable the pgvector extension
create extension if not exists vector;

-- TABLE 1: documents
create table documents (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_url text not null,
  title text not null,
  raw_content text not null,
  last_updated timestamp,
  created_at timestamp default now()
);

-- TABLE 2: chunks (384 dims for all-MiniLM-L6-v2)
create table chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer not null,
  embedding vector(384) not null,
  metadata jsonb default '{}',
  created_at timestamp default now()
);

create index on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- TABLE 3: queries (observability backbone)
create table queries (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  retrieved_chunk_ids uuid[] not null,
  retrieved_scores float[] not null,
  generated_answer text not null,
  citations jsonb default '[]',
  model_used text not null,
  latency_ms integer not null,
  user_feedback text check (user_feedback in ('positive', 'negative', null)),
  feedback_comment text,
  created_at timestamp default now()
);

-- TABLE 4: eval_golden_dataset
create table eval_golden_dataset (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  category text not null check (category in (
    'single_doc', 'multi_doc', 'unanswerable', 'ambiguous', 'contradictory'
  )),
  expected_answer text not null,
  expected_chunk_ids uuid[] default '{}',
  expected_chunk_contents text[] default '{}',
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  notes text
);

-- TABLE 5: eval_runs
create table eval_runs (
  id uuid primary key default gen_random_uuid(),
  run_name text not null,
  config jsonb not null,
  retrieval_precision_at_k float,
  retrieval_recall_at_k float,
  retrieval_mrr float,
  generation_faithfulness float,
  generation_completeness float,
  generation_hallucination_rate float,
  generation_relevance float,
  total_questions integer,
  run_duration_seconds float,
  created_at timestamp default now()
);

-- TABLE 6: eval_results (powers the failure explorer)
create table eval_results (
  id uuid primary key default gen_random_uuid(),
  eval_run_id uuid references eval_runs(id) on delete cascade,
  question_id uuid references eval_golden_dataset(id),
  question_text text not null,
  category text not null,
  retrieved_chunk_ids uuid[],
  expected_chunk_ids uuid[],
  precision_at_k float,
  recall_at_k float,
  mrr float,
  generated_answer text,
  faithfulness_score float,
  completeness_score float,
  hallucination_detected boolean,
  relevance_score float,
  judge_reasoning text,
  failure_type text check (failure_type in (
    'retrieval_miss', 'retrieval_noise', 'generation_hallucination',
    'generation_incomplete', 'generation_off_topic', 'none'
  )),
  created_at timestamp default now()
);

-- TABLE 7: product_metrics
create table product_metrics (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  total_queries integer default 0,
  positive_feedback_count integer default 0,
  negative_feedback_count integer default 0,
  avg_latency_ms float,
  followup_rate float,
  copy_rate float,
  created_at timestamp default now()
);
```

### Supabase RPC function for similarity search

```sql
create or replace function match_chunks(
  query_embedding vector(384),
  match_count int default 5,
  similarity_threshold float default 0.3
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    chunks.id,
    chunks.document_id,
    chunks.content,
    chunks.metadata,
    1 - (chunks.embedding <=> query_embedding) as similarity
  from chunks
  where 1 - (chunks.embedding <=> query_embedding) > similarity_threshold
  order by chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;
```

---

## Phase 1: Data acquisition and ingestion

### Step 1.1: Scrape GitLab handbook

**File: scripts/01_scrape_gitlab.py**

```
TASK:
1. Clone (shallow) the GitLab handbook repo:
   git clone --depth 1 https://gitlab.com/gitlab-com/content-sites/handbook.git data/sources/gitlab-handbook
2. Walk the directory tree and find all .md files
3. For each markdown file:
   - Read the content
   - Extract the title from the first H1 heading (or filename if no H1)
   - Construct the source_url: https://handbook.gitlab.com/ + relative path (replace .md with empty)
   - Insert into the documents table with source='gitlab-handbook'
4. Log: total files found, total files ingested, any errors

TARGET: ~2000-4000 markdown files

EDGE CASES:
- Skip files under 50 characters (empty or stub pages)
- Strip YAML frontmatter (between --- delimiters) before storing raw_content
- Store the relative file path in metadata for debugging
```

### Step 1.2: Scrape Stripe documentation

**File: scripts/02_scrape_stripe.py**

```
TASK:
1. Use the Stripe docs sitemap: https://docs.stripe.com/sitemap.xml
2. Parse the sitemap to get all page URLs
3. For each URL:
   - Fetch the page content using requests + BeautifulSoup
   - Extract the main content area (the <main> or <article> tag)
   - Convert HTML to clean markdown using markdownify or html2text
   - Extract the page title from the <h1> or <title> tag
   - Insert into the documents table with source='stripe-docs'
4. Respect rate limits: add a 1-second delay between requests
5. Log: total URLs in sitemap, total pages ingested, failures

TARGET: ~500-1000 documentation pages

EDGE CASES:
- Some pages may be JavaScript-rendered. If content is empty after fetch, skip and log.
- Strip navigation, footer, sidebar — only keep the main content body
- If sitemap fails, crawl from main docs page with depth limit = 3
```

### Step 1.3: Chunk documents

**File: scripts/03_chunk_documents.py**

```
TASK:
1. Fetch all documents from the documents table
2. For each document, split raw_content into chunks using recursive character splitting:
   - chunk_size: 512 tokens (measure using tiktoken with cl100k_base encoding)
   - Overlap: 50 tokens
   - Split hierarchy: "\n\n" first, then "\n", then ". ", then " "
3. For each chunk:
   - Count tokens using tiktoken
   - Extract metadata: section_title, heading_path, source
   - Store in the chunks table (leave embedding column null for now)
4. Log: total documents processed, total chunks created, average chunks per document

DESIGN DECISIONS TO DOCUMENT:
- Why 512 tokens: balances specificity with context
- Why 50-token overlap: prevents info loss at chunk boundaries
- Why recursive splitting: preserves paragraph structure

IMPORTANT: Store chunk_size and overlap in a config dict at the top.
Later experiments will change these values. The eval framework compares across configs.
```

### Step 1.4: Generate embeddings and store

**File: scripts/04_embed_and_store.py**

```
TASK:
Generate embeddings using the LOCAL sentence-transformers model. No API calls.

1. Load the model once:
   from sentence_transformers import SentenceTransformer
   model = SentenceTransformer('all-MiniLM-L6-v2')

2. Fetch all chunks where embedding is null
3. Batch into groups of 256 (local model handles large batches easily)
4. For each batch:
   - embeddings = model.encode([chunk.content for chunk in batch])
   - Returns numpy arrays of shape (batch_size, 384)
   - Update each chunk row with the embedding vector
5. Log: total chunks embedded, time elapsed, chunks per second

PERFORMANCE:
- all-MiniLM-L6-v2 on CPU: ~500-1000 chunks per second
- 10,000 chunks takes 10-20 seconds
- No rate limits, no API keys, no cost
- Model auto-downloads on first run (~80MB)

IMPORTANT:
- Produces 384-dimensional vectors (NOT 1536 like OpenAI)
- pgvector column must be vector(384)
- Store model name in metadata: {"embedding_model": "all-MiniLM-L6-v2"}
```

---

## Phase 2: RAG query pipeline

### Step 2.1: Retriever

**File: src/retrieval/retriever.py**

```
TASK:
Build a retriever that embeds queries using the SAME local model used for chunks.

class Retriever:
    def __init__(self, supabase_client, k=5):
        from sentence_transformers import SentenceTransformer
        self.model = SentenceTransformer('all-MiniLM-L6-v2')  # Load ONCE
        self.supabase = supabase_client
        self.k = k

    def retrieve(self, query: str) -> list[RetrievedChunk]:
        # 1. Embed query locally: query_embedding = self.model.encode(query).tolist()
        # 2. Call match_chunks RPC in Supabase
        # 3. Return top-k chunks with similarity scores

    def retrieve_with_threshold(self, query: str, threshold: float = 0.45) -> list[RetrievedChunk]:
        # Same but filters below threshold
        # NOTE: all-MiniLM-L6-v2 scores are lower than OpenAI's
        # Threshold 0.45 here ~ 0.65 with OpenAI embeddings
        # Evals will help tune this. Start at 0.45 and adjust.

CRITICAL: Must use same model for queries as for chunks. Mixing models = meaningless scores.
Load model ONCE at init (~2s), not per query (~5ms per encode).
```

### Step 2.2: Reranker

**File: src/retrieval/reranker.py**

```
TASK:
Build a reranker using a LOCAL cross-encoder model. No API calls.

class Reranker:
    def __init__(self):
        from sentence_transformers import CrossEncoder
        self.model = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')

    def rerank(self, query: str, chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
        # 1. pairs = [(query, chunk.content) for chunk in chunks]
        # 2. scores = self.model.predict(pairs)
        # 3. Attach reranker_score to each chunk
        # 4. Sort by reranker_score descending
        # 5. Return reranked list

WHY LOCAL CROSS-ENCODER INSTEAD OF LLM:
- Purpose-built for relevance scoring (not general text generation)
- ~10ms per pair on CPU vs ~500ms per LLM API call
- Free: no API costs, no rate limits, deterministic scores
- Interview talking point: "I used a dedicated cross-encoder instead of
  burning LLM tokens on a task that doesn't need generative capability."

PERFORMANCE: Scoring 10 pairs takes ~50-100ms on CPU. Model auto-downloads (~80MB).
```

### Step 2.3: Generator

**File: src/generation/generator.py**

```
TASK:
Build a generator using Gemini 2.5 Flash (free tier) with Ollama fallback.

import google.generativeai as genai

class Generator:
    def __init__(self, use_ollama_fallback=False):
        if use_ollama_fallback:
            self.backend = "ollama"  # Local, no API key, unlimited
        else:
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            self.model = genai.GenerativeModel("gemini-2.5-flash")
            self.backend = "gemini"

    def generate(self, query, chunks) -> GeneratedAnswer:
        # 1. If chunks empty → return "I don't have enough information..."
        # 2. Construct prompt from template
        # 3. Call LLM:
        #    Gemini: response = self.model.generate_content(prompt)
        #    Ollama: POST to http://localhost:11434/api/generate
        # 4. Parse response → answer_text, citations
        # 5. Return GeneratedAnswer

    def _handle_rate_limit(self, error):
        # If 429 from Gemini: log, fall back to Ollama if available, else wait 60s

GEMINI SETUP:
1. Go to https://aistudio.google.com → "Get API Key" (no credit card)
2. pip install google-generativeai
3. Add GEMINI_API_KEY to .env

OLLAMA SETUP (optional):
1. brew install ollama (macOS)
2. ollama pull llama3.1:8b (~4.7GB download)
3. Runs on localhost:11434, no API key needed
```

**File: src/generation/prompt_templates.py**

```
SYSTEM_PROMPT = """You are a helpful knowledge base assistant. Answer the user's question
using ONLY the information provided in the context below. Follow these rules strictly:

1. Only use information from the provided context. Do not use your training data.
2. If the context does not contain enough information, say so explicitly. Do not guess.
3. Cite your sources using [Source N] notation.
4. If sources contain contradictory information, acknowledge and present both with sources.
5. Be concise but complete.

Context:
{context}

Each context chunk is formatted as:
[Source N] (from: {source_url})
{chunk_content}
---
"""

USER_PROMPT = """Question: {query}

Answer using only the context provided above. Cite sources with [Source N]."""
```

### Step 2.4: Query orchestrator

**File: src/api/query_endpoint.py**

```
TASK:
Tie retriever + reranker + generator together. Log everything.

async def handle_query(question: str) -> QueryResponse:
    start_time = time.time()

    # Step 1: Retrieve (local embedding + Supabase)
    raw_chunks = retriever.retrieve(question, k=10)

    # Step 2: Rerank with local cross-encoder (top 10 → top 5)
    reranked_chunks = reranker.rerank(question, raw_chunks)
    top_chunks = reranked_chunks[:5]

    # Step 3: Generate with Gemini 2.5 Flash (or Ollama fallback)
    answer = generator.generate(question, top_chunks)

    # Step 4: Calculate latency
    latency_ms = int((time.time() - start_time) * 1000)

    # Step 5: Log to queries table (observability)
    # Step 6: Return response with answer, citations, sources, latency, query_id

LATENCY BREAKDOWN (approximate on CPU):
- Query embedding (local): ~5ms
- Supabase vector search: ~50-100ms
- Cross-encoder reranking (10 chunks): ~50-100ms
- Gemini 2.5 Flash generation: ~1000-2000ms
- Total: ~1200-2300ms per query

Bottleneck is the Gemini API call. Everything local is fast.
With Ollama: generation takes ~3000-8000ms (slower but no rate limits).
```

---

## Phase 3: Evaluation framework

This is the heart of the project.

### Step 3.1: Build the golden evaluation dataset

**File: data/golden_eval_dataset.json**

```
TASK:
Manually create 100 question-answer pairs. Budget 4-6 hours. Do not auto-generate.

DISTRIBUTION:
- 50 single-doc (answer in one chunk)
- 20 multi-doc (answer requires 2-3 chunks)
- 15 unanswerable (NOT in the knowledge base)
- 10 ambiguous (could mean multiple things)
- 5 contradictory (different docs say different things)

FORMAT:
{
  "question": "What is GitLab's policy on expense reimbursement for home office equipment?",
  "category": "single_doc",
  "expected_answer": "GitLab provides a one-time $1,500 stipend...",
  "expected_source_urls": ["https://handbook.gitlab.com/handbook/finance/expenses/"],
  "expected_chunk_keywords": ["home office", "stipend", "$1,500", "equipment"],
  "difficulty": "easy",
  "notes": "Tests basic single-document retrieval from the finance section"
}

HOW TO BUILD:
1. Skim 30-40 GitLab handbook pages and 20 Stripe doc pages
2. For each page, write 1-2 questions a real employee might ask
3. For unanswerable: think about what the docs DON'T cover
4. For contradictory: look for overlapping or updated policies
5. Record exact source URL and relevant text for each expected answer

THIS IS NOT OPTIONAL. It's the single highest-value artifact in the project.
```

### Step 3.2: Retrieval evaluation

**File: src/evals/retrieval_eval.py**

```
TASK:
Evaluate retriever only (no generation, no Gemini calls). 100% local and free.

class RetrievalEvaluator:
    def evaluate(self, k=5) -> RetrievalEvalResults:
        # For each golden question:
        # 1. Run retriever (local model + Supabase) → top-k chunks
        # 2. Compare retrieved vs expected chunk IDs
        # 3. Calculate per-question:
        #    precision_at_k = |relevant in top-k| / k
        #    recall_at_k = |relevant in top-k| / |total relevant|
        #    mrr = 1 / rank_of_first_relevant (0 if none)
        # 4. For UNANSWERABLE: precision = 1.0 if no chunk above threshold
        # 5. Aggregate: overall + breakdown by category
        # 6. Store in eval_results and eval_runs tables

    def diagnose_failures(self, results):
        # For each question where precision_at_k < 0.5:
        # Classify: 'retrieval_miss' (chunks not in index) vs 'retrieval_noise' (ranked too low)

COST: $0 — embedding is local, Supabase search is free tier.
You can run retrieval evals unlimited times per day.
```

### Step 3.3: Generation evaluation (LLM-as-judge)

**File: src/evals/generation_eval.py**

```
TASK:
Score generated answers using Gemini 2.5 Flash as judge.

class GenerationEvaluator:
    def __init__(self):
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
        self.judge = genai.GenerativeModel("gemini-2.5-flash")

    def evaluate(self, question, expected_answer, generated_answer, chunks) -> GenEvalScores:
        # Call judge with structured rubric. Score each dimension 1-5:

        # FAITHFULNESS:
        #   5 = Every claim maps to a specific sentence in context
        #   4 = All major claims supported; minor connecting phrases inferred
        #   3 = Most claims supported but 1-2 have no source in context
        #   2 = Multiple unsupported claims
        #   1 = Mostly fabricated or contradicts context

        # COMPLETENESS:
        #   5 = All aspects addressed with appropriate detail
        #   4 = Main question answered; minor aspects briefly mentioned
        #   3 = Main question answered but sub-questions missed
        #   2 = Partially answers; significant gaps
        #   1 = Fails to address core question

        # HALLUCINATION DETECTION (binary + severity):
        #   Check for ANY claim not in retrieved context
        #   Severity: 'minor' vs 'major'

        # RELEVANCE:
        #   5 = Directly and concisely answers
        #   4 = Answers with minor tangential info
        #   3 = Answers but notable off-topic content
        #   2 = Partially on topic, drifts significantly
        #   1 = Does not address the question

        # Judge returns JSON:
        # {"faithfulness": {"score": 4, "reasoning": "..."},
        #  "completeness": {"score": 5, "reasoning": "..."},
        #  "hallucination": {"detected": false, "severity": null, "examples": []},
        #  "relevance": {"score": 5, "reasoning": "..."}}

SAME-MODEL JUDGE BIAS NOTE:
Using Gemini for both generation AND judging = same-model bias (rates own output higher).
Acceptable here because you're measuring RELATIVE improvement across experiments.
DOCUMENT THIS in your case study: "In production, I'd use a different model family
for judging, or calibrate with human evaluation on a subset."

GEMINI BUDGET:
- 100 questions x 3 judge runs = 300 requests per eval suite
- Plus 100 generation calls = 400 total
- Daily limit 1,500 → can run ~3 eval suites per day

RATE LIMIT HANDLING:
- 4-second delay between calls (15 RPM = 1 per 4 seconds)
- Full eval suite takes ~27 minutes at this rate
- If 429 error: back off 60 seconds and retry
```

### Step 3.4: Eval rubrics

**File: src/evals/eval_rubrics.py**

```
TASK:
Centralize all rubric definitions and judge prompt templates.

Include:
1. RETRIEVAL_EVAL_CONFIG: k, similarity_threshold, match criteria
2. GENERATION_RUBRIC: full 1-5 scale definitions for each dimension
3. JUDGE_SYSTEM_PROMPT: complete prompt template for LLM judge
4. JUDGE_SCORE_AGGREGATION: how to combine 3 judge runs (mean)
5. FAILURE_CLASSIFICATION_RULES: how to assign failure_type from scores

This is your "eval spec." The precision of these definitions IS the signal of depth.
```

### Step 3.5: Full eval runner

**File: scripts/07_run_full_eval_suite.py**

```
TASK:
Orchestrate: retrieval evals + generation evals + store results.

def run_full_eval(run_name: str, config: dict):
    # 1. Load golden dataset
    # 2. Create eval_runs row with config snapshot
    # 3. For each question:
    #    a. Run full pipeline (retrieve → rerank → generate)
    #    b. Run retrieval eval (compare retrieved vs expected)
    #    c. Run generation eval (Gemini judge, 3 runs)
    #    d. Classify failure type
    #    e. Store in eval_results
    #    f. Sleep 4 seconds between Gemini calls
    # 4. Calculate aggregates
    # 5. Update eval_runs row
    # 6. Print summary

CONFIG SNAPSHOT:
{
  "chunk_size": 512,
  "chunk_overlap": 50,
  "embedding_model": "all-MiniLM-L6-v2",
  "retriever_k": 5,
  "similarity_threshold": 0.45,
  "reranker_enabled": true,
  "reranker_model": "cross-encoder/ms-marco-MiniLM-L-6-v2",
  "generator_model": "gemini-2.5-flash",
  "judge_model": "gemini-2.5-flash",
  "judge_runs_per_question": 3
}

TIMING: ~27 minutes per full eval suite (rate-limited by Gemini 15 RPM)

USAGE:
  python scripts/07_run_full_eval_suite.py --name "baseline" --chunk-size 512 --k 5
  python scripts/07_run_full_eval_suite.py --name "+reranker" --chunk-size 512 --k 5 --reranker
  python scripts/07_run_full_eval_suite.py --name "chunk_1024" --chunk-size 1024 --k 5 --reranker
```

---

## Phase 4: Frontend

### Step 4.1: Main search page

**File: frontend/src/pages/SearchPage.tsx**

```
LAYOUT:
1. Search bar (centered, prominent)
   - Placeholder: "Ask about GitLab or Stripe documentation..."
2. Answer card with [Source N] citations as clickable links
   - Loading skeleton with "Searching documents..."
3. Source panel: each chunk with content, source URL, similarity score bar
   - Color thresholds for MiniLM: green > 0.6, yellow 0.4-0.6, red < 0.4
4. Feedback buttons: thumbs up/down → PATCH query record
5. Metadata: "Answered in {latency_ms}ms using {model_used}"

Show "I don't have information on this" prominently when retrieval returns empty.
```

### Step 4.2: Eval dashboard

**File: frontend/src/pages/EvalDashboard.tsx**

```
Three tabs: "Retrieval Quality" | "Generation Quality" | "Product Metrics"

RETRIEVAL QUALITY PANEL:
- MetricCard grid: P@5, R@5, MRR, query count (with deltas from previous run)
- Trend chart: P@5 across eval runs (x-axis = run_name)
- Category breakdown: horizontal bars per category (color-coded)
- Failure explorer: worst questions with expected vs retrieved chunks

GENERATION QUALITY PANEL:
- MetricCard grid: Avg Faithfulness, Completeness, Hallucination Rate, Relevance
- Score distribution histograms per dimension
- Category breakdown: faithfulness by category
- Failure explorer: worst answers with judge reasoning

PRODUCT METRICS PANEL:
- Daily query volume trend
- Satisfaction rate (positive / total feedback)
- Average latency trend

Data source: eval_runs, eval_results, product_metrics tables via Supabase.
Dropdown to select eval run. Compare toggle for overlaying two runs.
```

---

## Phase 5: Experimentation

### Experiment 1: Baseline
- chunk_size: 512, no reranker, k=5, threshold: 0.45, Gemini 2.5 Flash
- Expected: P@5 ~0.50-0.65, Faithfulness ~3.0-3.8

### Experiment 2: Add reranker
- Enable cross-encoder. Hypothesis: precision improves, latency +50-100ms

### Experiment 3: Larger chunks (1024 tokens)
- Re-chunk at 1024/100 overlap, re-embed (free, fast). Hypothesis: multi-doc improves

### Experiment 4: Tune similarity threshold
- Test: 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60
- MiniLM scores lower than OpenAI. Explore 0.30-0.60 range.
- Plot precision-recall curve. Find optimal for unanswerable handling.

### Experiment 5: Hybrid search
- Add BM25 via Supabase tsvector + GIN index
- final_score = 0.7 * semantic + 0.3 * bm25
- Hypothesis: helps exact terminology queries

### Experiment 6 (bonus): Compare embedding models
- Re-embed with all-mpnet-base-v2 (768 dims, higher quality, slower)
- Update pgvector column dimension, re-run evals, compare

### After each experiment:
1. Run full eval suite with descriptive run_name
2. Check dashboard — did expected metric improve?
3. Check for regressions
4. Write 2-3 sentence summary
5. Dashboard trend chart shows progression automatically

---

## Phase 6: Documentation

### README.md
1. One-paragraph summary
2. Live demo link (Vercel)
3. Architecture diagram
4. Tech stack table — highlight $0 total cost
5. Local setup instructions
6. Eval framework overview
7. Key findings with numbers
8. What you'd do next

### Case study (1500-2000 words)
1. Problem definition
2. Architecture and free-tier tradeoffs
3. Eval framework design
4. Key findings with real numbers
5. Failure analysis
6. Iteration story
7. Same-model judge bias acknowledgment
8. Lessons learned

### Loom video (5 minutes)
- 0:00-1:00 — Search interface, 2-3 queries, citations
- 1:00-1:30 — Unanswerable query, "I don't know" response
- 1:30-3:00 — Eval dashboard walkthrough
- 3:00-4:00 — Interesting failure case
- 4:00-5:00 — Summary: built at $0, here's what I learned

---

## Environment setup

### .env.example
```
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GEMINI_API_KEY=your_gemini_api_key
OLLAMA_BASE_URL=http://localhost:11434
```

### requirements.txt
```
supabase>=2.0.0
sentence-transformers>=2.2.0
google-generativeai>=0.5.0
tiktoken>=0.5.0
beautifulsoup4>=4.12.0
markdownify>=0.11.0
requests>=2.31.0
python-dotenv>=1.0.0
pyyaml>=6.0.0
numpy>=1.24.0
torch>=2.0.0
```

### Setup commands
```bash
# 1. Clone and setup
git clone <your-repo-url> && cd rag-ops
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 2. Models auto-download on first use:
#    all-MiniLM-L6-v2 (~80MB) and cross-encoder/ms-marco-MiniLM-L-6-v2 (~80MB)

# 3. Configure environment
cp .env.example .env
# Fill in: Supabase URL + keys, Gemini API key

# 4. Supabase: create project at supabase.com, run migration SQL

# 5. Gemini: get key at aistudio.google.com (no credit card)

# 6. Optional: brew install ollama && ollama pull llama3.1:8b

# 7. Run ingestion
python scripts/01_scrape_gitlab.py
python scripts/02_scrape_stripe.py
python scripts/03_chunk_documents.py
python scripts/04_embed_and_store.py

# 8. Build golden dataset (manual, 4-6 hours)

# 9. First eval run
python scripts/07_run_full_eval_suite.py --name "baseline"

# 10. Frontend
cd frontend && npm install && npm run dev
```

---

## What "done" looks like

1. Working search interface with cited answers
2. Eval dashboard with retrieval quality, generation quality, failure explorer
3. 3-5 eval runs on trend chart showing systematic improvement
4. 100 hand-labeled golden questions
5. README + case study documenting architecture, findings, tradeoffs
6. 5-minute video walkthrough
7. Deployed to a public URL
8. Total cost: $0
