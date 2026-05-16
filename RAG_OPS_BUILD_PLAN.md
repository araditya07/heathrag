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

## Tech stack

| Component | Tool | Why |
|---|---|---|
| Backend database | Supabase (PostgreSQL + pgvector) | Vector storage + relational data in one place, free tier sufficient |
| Embeddings | OpenAI text-embedding-3-small | Good quality, cheap, 1536 dimensions |
| LLM for generation | Anthropic Claude Sonnet (via API) | Strong instruction following, good at citing sources |
| LLM for evals (judge) | Anthropic Claude Sonnet (via API) | Same model works well as evaluator |
| Frontend | React (Next.js or Vite) | Build with Claude Code, deploy to Vercel |
| Language | Python (backend scripts), TypeScript (frontend) | Python for ML/data, TS for UI |

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
│   ├── sources/                  # Raw scraped content
│   │   ├── gitlab-handbook/
│   │   └── stripe-docs/
│   ├── golden_eval_dataset.json  # 100 hand-labeled Q&A pairs
│   └── synthetic_edge_cases.json # Adversarial test cases
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
│   │   │   ├── SearchPage.tsx       # Main Q&A interface
│   │   │   └── EvalDashboard.tsx    # Eval dashboard
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

-- ============================================
-- TABLE 1: documents
-- Stores metadata about each source document
-- ============================================
create table documents (
  id uuid primary key default gen_random_uuid(),
  source text not null,           -- 'gitlab-handbook' or 'stripe-docs'
  source_url text not null,       -- Original URL of the page
  title text not null,            -- Page title or section heading
  raw_content text not null,      -- Full text content of the page
  last_updated timestamp,         -- When the source was last modified
  created_at timestamp default now()
);

-- ============================================
-- TABLE 2: chunks
-- Stores chunked text with embeddings
-- This is what the retriever searches against
-- ============================================
create table chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  chunk_index integer not null,        -- Position within the document (0, 1, 2...)
  content text not null,               -- The actual chunk text
  token_count integer not null,        -- Number of tokens in this chunk
  embedding vector(1536) not null,     -- OpenAI text-embedding-3-small dimension
  metadata jsonb default '{}',         -- Flexible metadata (section_title, heading_path, etc.)
  created_at timestamp default now()
);

-- Index for fast cosine similarity search
create index on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ============================================
-- TABLE 3: queries
-- Logs every user query and system response
-- This is your observability backbone
-- ============================================
create table queries (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  retrieved_chunk_ids uuid[] not null,        -- Which chunks were retrieved
  retrieved_scores float[] not null,          -- Similarity scores for each chunk
  generated_answer text not null,             -- The LLM's response
  citations jsonb default '[]',              -- Array of {chunk_id, quote, source_url}
  model_used text not null,                  -- Which LLM generated the answer
  latency_ms integer not null,               -- Total query-to-answer time
  user_feedback text check (user_feedback in ('positive', 'negative', null)),
  feedback_comment text,                     -- Optional free-text feedback
  created_at timestamp default now()
);

-- ============================================
-- TABLE 4: eval_golden_dataset
-- Your hand-labeled test set of 100 questions
-- ============================================
create table eval_golden_dataset (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  category text not null check (category in (
    'single_doc', 'multi_doc', 'unanswerable', 'ambiguous', 'contradictory'
  )),
  expected_answer text not null,                    -- The correct answer
  expected_chunk_ids uuid[] default '{}',           -- Which chunks contain the answer
  expected_chunk_contents text[] default '{}',      -- Fallback: text snippets if chunk IDs shift
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  notes text                                        -- Why you chose this question, what it tests
);

-- ============================================
-- TABLE 5: eval_runs
-- One row per eval suite execution
-- ============================================
create table eval_runs (
  id uuid primary key default gen_random_uuid(),
  run_name text not null,                    -- Human-readable: 'baseline', '+reranker', 'chunk_1024'
  config jsonb not null,                     -- Full config snapshot: chunk_size, overlap, model, k, etc.
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

-- ============================================
-- TABLE 6: eval_results
-- Per-question results for each eval run
-- This is what powers the failure explorer
-- ============================================
create table eval_results (
  id uuid primary key default gen_random_uuid(),
  eval_run_id uuid references eval_runs(id) on delete cascade,
  question_id uuid references eval_golden_dataset(id),
  question_text text not null,
  category text not null,

  -- Retrieval metrics for this question
  retrieved_chunk_ids uuid[],
  expected_chunk_ids uuid[],
  precision_at_k float,
  recall_at_k float,
  mrr float,

  -- Generation metrics for this question
  generated_answer text,
  faithfulness_score float,          -- 1-5
  completeness_score float,          -- 1-5
  hallucination_detected boolean,
  relevance_score float,             -- 1-5
  judge_reasoning text,              -- The LLM judge's explanation

  -- Diagnosis
  failure_type text check (failure_type in (
    'retrieval_miss', 'retrieval_noise', 'generation_hallucination',
    'generation_incomplete', 'generation_off_topic', 'none'
  )),

  created_at timestamp default now()
);

-- ============================================
-- TABLE 7: product_metrics (daily aggregates)
-- Online product metrics from real usage
-- ============================================
create table product_metrics (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  total_queries integer default 0,
  positive_feedback_count integer default 0,
  negative_feedback_count integer default 0,
  avg_latency_ms float,
  followup_rate float,             -- % of queries followed by another query within 60s
  copy_rate float,                 -- % of answers where user clicked copy
  created_at timestamp default now()
);
```

### Supabase RPC function for similarity search

Create this function in Supabase SQL editor. It is used by the retriever.

```sql
create or replace function match_chunks(
  query_embedding vector(1536),
  match_count int default 5,
  similarity_threshold float default 0.5
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

GitLab's handbook is publicly available as markdown files in their Git repository.

**File: `scripts/01_scrape_gitlab.py`**

```
TASK:
1. Clone (shallow) the GitLab handbook repo: https://gitlab.com/gitlab-com/content-sites/handbook
   - Use: git clone --depth 1 https://gitlab.com/gitlab-com/content-sites/handbook.git data/sources/gitlab-handbook
2. Walk the directory tree and find all .md files
3. For each markdown file:
   - Read the content
   - Extract the title from the first H1 heading (or filename if no H1)
   - Construct the source_url: https://handbook.gitlab.com/ + relative path (replace .md with empty)
   - Insert into the `documents` table with source='gitlab-handbook'
4. Log: total files found, total files ingested, any errors

TARGET: ~2000-4000 markdown files covering engineering, people ops, finance, security, etc.

IMPORTANT EDGE CASES:
- Skip files under 50 characters (empty or stub pages)
- Skip non-English content if detected
- Handle frontmatter (YAML between --- delimiters) by stripping it before storing raw_content
- Store the relative file path in metadata for debugging
```

### Step 1.2: Scrape Stripe documentation

Stripe's docs are publicly available at https://docs.stripe.com.

**File: `scripts/02_scrape_stripe.py`**

```
TASK:
1. Use the Stripe docs sitemap: https://docs.stripe.com/sitemap.xml
2. Parse the sitemap to get all page URLs
3. For each URL:
   - Fetch the page content using requests + BeautifulSoup
   - Extract the main content area (typically the <main> or <article> tag)
   - Convert HTML to clean markdown using markdownify or html2text
   - Extract the page title from the <h1> or <title> tag
   - Insert into the `documents` table with source='stripe-docs'
4. Respect rate limits: add a 1-second delay between requests
5. Log: total URLs in sitemap, total pages ingested, failures

TARGET: ~500-1000 documentation pages covering API reference, guides, tutorials.

IMPORTANT EDGE CASES:
- Some pages may be JavaScript-rendered. If content is empty after fetch, skip and log.
- Strip navigation, footer, sidebar content — only keep the main content body
- Handle relative links by converting to absolute URLs
- If the sitemap approach fails, fall back to crawling from the main docs page
  and following internal links (depth limit = 3)
```

### Step 1.3: Chunk documents

**File: `scripts/03_chunk_documents.py`**

```
TASK:
1. Fetch all documents from the `documents` table
2. For each document, split the raw_content into chunks using recursive character splitting:
   - Primary chunk_size: 512 tokens (measure using tiktoken with cl100k_base encoding)
   - Overlap: 50 tokens
   - Split hierarchy: split on "\n\n" first, then "\n", then ". ", then " "
3. For each chunk:
   - Count tokens using tiktoken
   - Extract metadata:
     - section_title: the most recent H2 or H3 heading above this chunk
     - heading_path: full breadcrumb like "Engineering > Code Review > Process"
     - source: inherited from parent document
   - Store in the `chunks` table (leave embedding column null for now)
4. Log: total documents processed, total chunks created, average chunks per document

DESIGN DECISIONS TO DOCUMENT:
- Why 512 tokens: balances specificity (small enough to be relevant) with context
  (large enough to contain a complete thought). Document this tradeoff.
- Why 50-token overlap: prevents losing information at chunk boundaries where a
  sentence might be split. 50 tokens is roughly 1-2 sentences of overlap.
- Why recursive splitting: preserves paragraph structure. Splitting on "\n\n" first
  means we break at natural paragraph boundaries before resorting to mid-sentence splits.

IMPORTANT: Store the chunk_size and overlap values in a config dict at the top of the
script. Later, when we experiment with different values (e.g., 1024 tokens), we only
change the config. This is intentional — the eval framework compares across configs.
```

### Step 1.4: Generate embeddings and store

**File: `scripts/04_embed_and_store.py`**

```
TASK:
1. Fetch all chunks from the `chunks` table where embedding is null
2. Batch them into groups of 100 (OpenAI embedding API limit)
3. For each batch:
   - Call OpenAI embeddings API: model="text-embedding-3-small", dimensions=1536
   - Update each chunk row with the returned embedding vector
4. Handle rate limits: if 429 error, exponential backoff starting at 2 seconds
5. Log: total chunks embedded, total API cost estimate, time elapsed

COST ESTIMATE:
- text-embedding-3-small costs $0.02 per 1M tokens
- If you have 10,000 chunks averaging 400 tokens each = 4M tokens = ~$0.08
- Total embedding cost should be under $1

IMPORTANT:
- Process in batches and commit after each batch so you can resume if interrupted
- Store the embedding model name in chunk metadata so you know which model was used
- If you want to re-embed with a different model later, you can filter by metadata
```

---

## Phase 2: RAG query pipeline

### Step 2.1: Retriever

**File: `src/retrieval/retriever.py`**

```
TASK:
Build a retriever class with the following interface:

class Retriever:
    def __init__(self, supabase_client, embedding_model="text-embedding-3-small", k=5):
        ...

    def retrieve(self, query: str) -> list[RetrievedChunk]:
        """
        1. Embed the query using the same embedding model used for chunks
        2. Call the match_chunks RPC function in Supabase
        3. Return top-k chunks with their similarity scores
        4. Each RetrievedChunk has: id, content, metadata, similarity_score, document_id
        """
        ...

    def retrieve_with_threshold(self, query: str, threshold: float = 0.65) -> list[RetrievedChunk]:
        """
        Same as retrieve, but filters out chunks below the similarity threshold.
        This is critical for unanswerable queries — if nothing scores above 0.65,
        return an empty list. The generator should then say "I don't have information on this."
        """
        ...

DESIGN NOTES:
- The threshold of 0.65 is a starting value. Your evals will help you tune it.
  Too high = misses valid answers. Too low = retrieves garbage for unanswerable questions.
- Log the similarity scores for every query. You will need these for the eval dashboard.
```

### Step 2.2: Reranker

**File: `src/retrieval/reranker.py`**

```
TASK:
Build a reranker that takes the initial retrieval results and re-scores them using
a cross-encoder or LLM-based approach.

Option A (recommended for this project): LLM-based reranking
- Take the query + each retrieved chunk
- Ask Claude to score relevance on a 1-5 scale with a brief explanation
- Re-sort by the LLM relevance score instead of the cosine similarity score

Option B (cheaper but less explainable): Cohere Rerank API
- Pass query + chunks to Cohere's rerank endpoint
- Use the reranked order

class Reranker:
    def __init__(self, model="claude-sonnet"):
        ...

    def rerank(self, query: str, chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
        """
        For each chunk, ask the LLM:
          "Given the query: '{query}'
           Rate the relevance of this passage on a scale of 1-5:
           '{chunk.content}'
           Respond with ONLY a JSON object: {"score": N, "reason": "brief explanation"}"

        Re-sort chunks by LLM relevance score (descending).
        Attach the reranker_score and reranker_reason to each chunk.
        """
        ...

WHY THIS MATTERS:
- Cosine similarity in embedding space is a rough proxy for relevance.
  "GitLab relocation policy" and "GitLab immigration support" have high
  cosine similarity but very different meanings.
- The reranker catches these false positives.
- It also adds cost and latency. Track both in your product metrics.
- This is a real tradeoff you can discuss in interviews: precision vs. cost vs. latency.
```

### Step 2.3: Generator

**File: `src/generation/generator.py`**

```
TASK:
Build a generator that takes retrieved chunks and produces a cited answer.

class Generator:
    def __init__(self, model="claude-sonnet"):
        ...

    def generate(self, query: str, chunks: list[RetrievedChunk]) -> GeneratedAnswer:
        """
        1. If chunks list is empty (nothing above threshold), return:
           "I don't have enough information in the knowledge base to answer this question.
            This topic may not be covered in the current documentation."

        2. Otherwise, construct the prompt (see prompt template below)
        3. Call the LLM API
        4. Parse the response to extract: answer_text, citations list
        5. Return GeneratedAnswer with: answer, citations, model_used, token_count
        """
        ...
```

**File: `src/generation/prompt_templates.py`**

```
SYSTEM_PROMPT = """You are a helpful knowledge base assistant. Answer the user's question
using ONLY the information provided in the context below. Follow these rules strictly:

1. Only use information from the provided context. Do not use your training data.
2. If the context does not contain enough information to fully answer the question, say so
   explicitly. Do not guess or fill in gaps.
3. Cite your sources using [Source N] notation, where N corresponds to the context chunk number.
4. If different sources contain contradictory information, acknowledge the contradiction
   and present both perspectives with their sources.
5. Be concise but complete. Answer the question directly, then provide supporting detail.

Context:
{context}

Each context chunk is formatted as:
[Source N] (from: {source_url})
{chunk_content}
---
"""

USER_PROMPT = """Question: {query}

Answer the question using only the context provided above. Cite sources with [Source N]."""
```

### Step 2.4: Query orchestrator

**File: `src/api/query_endpoint.py`**

```
TASK:
Build the orchestrator that ties retriever + reranker + generator together and logs everything.

async def handle_query(question: str) -> QueryResponse:
    start_time = time.time()

    # Step 1: Retrieve
    raw_chunks = retriever.retrieve(question, k=10)

    # Step 2: Rerank (take top 10 from retriever, rerank, keep top 5)
    reranked_chunks = reranker.rerank(question, raw_chunks)
    top_chunks = reranked_chunks[:5]

    # Step 3: Generate
    answer = generator.generate(question, top_chunks)

    # Step 4: Calculate latency
    latency_ms = int((time.time() - start_time) * 1000)

    # Step 5: Log to queries table
    query_record = {
        "question": question,
        "retrieved_chunk_ids": [c.id for c in top_chunks],
        "retrieved_scores": [c.similarity_score for c in top_chunks],
        "generated_answer": answer.text,
        "citations": answer.citations,
        "model_used": answer.model_used,
        "latency_ms": latency_ms,
    }
    supabase.table("queries").insert(query_record).execute()

    # Step 6: Return response
    return QueryResponse(
        answer=answer.text,
        citations=answer.citations,
        sources=[{"chunk_id": c.id, "content": c.content, "score": c.similarity_score, "source_url": c.metadata.get("source_url")} for c in top_chunks],
        latency_ms=latency_ms,
        query_id=query_record["id"]  # For feedback submission
    )

IMPORTANT DESIGN DECISIONS:
- Retrieve 10, rerank, keep 5. This is a common pattern: cast a wide net, then filter.
  The retriever is fast but imprecise. The reranker is slow but precise. By retrieving 10
  and reranking to 5, you get precision without paying reranker cost on your entire corpus.
- Log everything. Every query, every retrieved chunk, every score. This observability
  is what makes the eval dashboard possible and what makes this project stand out.
```

---

## Phase 3: Evaluation framework

This is the heart of the project. This is what separates a portfolio demo from a production-grade system.

### Step 3.1: Build the golden evaluation dataset

**File: `data/golden_eval_dataset.json`**

```
TASK:
Manually create 100 question-answer pairs. This is tedious. It is also the single
most valuable thing in the entire project. Do not skip this or auto-generate it.

DISTRIBUTION:
- 50 single-doc questions (answer exists in one chunk)
- 20 multi-doc questions (answer requires combining 2-3 chunks)
- 15 unanswerable questions (answer is NOT in the knowledge base)
- 10 ambiguous questions (question could mean multiple things)
- 5 contradictory questions (different docs say different things)

FORMAT FOR EACH ENTRY:
{
  "question": "What is GitLab's policy on expense reimbursement for home office equipment?",
  "category": "single_doc",
  "expected_answer": "GitLab provides a one-time $1,500 stipend for home office setup...",
  "expected_source_urls": ["https://handbook.gitlab.com/handbook/finance/expenses/"],
  "expected_chunk_keywords": ["home office", "stipend", "$1,500", "equipment"],
  "difficulty": "easy",
  "notes": "Tests basic single-document retrieval from the finance section"
}

EXAMPLES FOR EACH CATEGORY:

Single-doc (easy):
  "What is GitLab's policy on unlimited PTO?"
  - Answer is in one handbook page about time off

Single-doc (hard):
  "What are the SLA requirements for Stripe API error responses?"
  - Answer is in Stripe docs but uses technical terminology

Multi-doc:
  "How does the team transfer process affect unvested stock options?"
  - Requires info from the transfers page AND the stock options page

Unanswerable:
  "Does GitLab provide immigration sponsorship for employees relocating to Japan?"
  - The handbook does not cover this specific topic
  - Expected behavior: system should say "I don't have information on this"

Ambiguous:
  "What's the review process?"
  - Could mean: code review, performance review, security review, merge request review
  - Expected behavior: system should ask for clarification or present multiple options

Contradictory:
  "What is the approval threshold for expenses?"
  - If the handbook says $500 in one section and $1000 in another
  - Expected behavior: system should acknowledge both and cite sources

HOW TO BUILD THIS DATASET:
1. First, skim 30-40 GitLab handbook pages and 20 Stripe doc pages
2. For each page, write 1-2 questions a real employee might ask
3. For unanswerable questions, think about what topics the docs DON'T cover
4. For contradictory questions, look for places where policies overlap or were updated
5. Record the exact source URL and relevant text for each expected answer
6. After building the dataset, load it into the eval_golden_dataset table

THIS IS NOT OPTIONAL. Without this dataset, your evals are meaningless. Budget 4-6 hours
for building it well. It's the work that makes everything downstream credible.
```

### Step 3.2: Retrieval evaluation

**File: `src/evals/retrieval_eval.py`**

```
TASK:
Build the retrieval evaluation pipeline. This runs your golden questions through the
retriever ONLY (no generation) and measures whether the right chunks were found.

class RetrievalEvaluator:
    def __init__(self, retriever, golden_dataset):
        ...

    def evaluate(self, k=5) -> RetrievalEvalResults:
        """
        For each question in the golden dataset:

        1. Run the retriever (query → top-k chunks)
        2. Compare retrieved chunk IDs against expected chunk IDs
        3. Calculate per-question metrics:

           precision_at_k = |relevant chunks in top-k| / k
           recall_at_k = |relevant chunks in top-k| / |total relevant chunks|
           mrr = 1 / rank_of_first_relevant_chunk (0 if none found)

        4. For UNANSWERABLE questions:
           - Expected: no relevant chunks should be retrieved
           - Precision = 1.0 if all retrieved chunks score below threshold
           - Precision = 0.0 if any retrieved chunk scores above threshold
           - This measures the system's ability to say "I don't know"

        5. Aggregate across all questions:
           - Overall precision@k, recall@k, MRR (macro-average)
           - Breakdown by category: single_doc, multi_doc, unanswerable, etc.

        6. Store results in eval_results table (per-question) and eval_runs table (aggregate)

        Return detailed results for the dashboard.
        """
        ...

    def diagnose_failures(self, results) -> list[FailureDiagnosis]:
        """
        For each question where precision@k < 0.5:
        - Log the query, expected chunks, retrieved chunks, and scores
        - Classify the failure:
          'retrieval_miss' = expected chunks not in the index at all (ingestion problem)
          'retrieval_noise' = expected chunks exist but ranked below top-k (ranking problem)
        - This powers the failure explorer panel
        """
        ...

IMPORTANT NUANCES:
- Chunk IDs may shift if you re-ingest data. Use expected_chunk_keywords as a fallback:
  if the chunk content contains all expected keywords, treat it as a match.
- For multi-doc questions, partial credit matters: if the question needs 3 chunks and
  you retrieve 2 of them, that's recall=0.67, not a binary fail.
- Track retrieval latency separately from total query latency. If retrieval is the
  bottleneck, you need to know.
```

### Step 3.3: Generation evaluation (LLM-as-judge)

**File: `src/evals/generation_eval.py`**

```
TASK:
Build the generation evaluation pipeline. This takes the generated answer and scores
it against the expected answer and the retrieved context using an LLM judge.

class GenerationEvaluator:
    def __init__(self, judge_model="claude-sonnet"):
        ...

    def evaluate(self, question, expected_answer, generated_answer, retrieved_chunks) -> GenEvalScores:
        """
        Call the LLM judge with a structured rubric. Score each dimension 1-5.

        FAITHFULNESS (is the answer grounded in the retrieved context?):
          5 = Every claim maps to a specific sentence in the context
          4 = All major claims are supported; minor connecting phrases are inferred
          3 = Most claims are supported but 1-2 claims have no clear source in context
          2 = Multiple unsupported claims; answer mixes context with external knowledge
          1 = Answer is mostly fabricated or contradicts the context

        COMPLETENESS (does the answer address all parts of the question?):
          5 = All aspects of the question are addressed with appropriate detail
          4 = Main question is answered fully; minor aspects are briefly mentioned
          3 = Main question is answered but some sub-questions are missed
          2 = Only partially answers the question; significant gaps
          1 = Fails to address the core question

        HALLUCINATION DETECTION (binary + severity):
          Check: does the answer contain ANY factual claim not present in the retrieved context?
          If yes: hallucination_detected = True
          Rate severity: 'minor' (extra context that's likely true) vs 'major' (fabricated facts)
          Provide: the specific hallucinated text and explain why it's not in context

        RELEVANCE (does the answer stay on topic?):
          5 = Directly and concisely answers the question
          4 = Answers the question with minor tangential information
          3 = Answers the question but includes notable off-topic content
          2 = Partially on topic but drifts significantly
          1 = Does not address the question asked

        The judge prompt should ask for structured JSON output:
        {
          "faithfulness": {"score": 4, "reasoning": "..."},
          "completeness": {"score": 5, "reasoning": "..."},
          "hallucination": {"detected": false, "severity": null, "examples": []},
          "relevance": {"score": 5, "reasoning": "..."}
        }
        """
        ...

CRITICAL IMPLEMENTATION DETAIL — THE JUDGE PROMPT:

Use this prompt structure for the LLM judge:

"""
You are an expert evaluator assessing the quality of a RAG system's output.

You will be given:
- The user's question
- The expected correct answer
- The system's generated answer
- The context chunks that were retrieved

Evaluate the generated answer on four dimensions. Be strict and precise.
Do not give high scores for plausible-sounding but unsupported claims.

[Include the 1-5 rubric definitions above]

Question: {question}
Expected answer: {expected_answer}
Generated answer: {generated_answer}

Retrieved context:
{chunks}

Respond with ONLY a JSON object. No preamble, no explanation outside the JSON.
"""

WHY THIS MATTERS:
- The judge rubric needs to be precise and reproducible. "Good answer" is not evaluable.
  "Every claim maps to a specific sentence" is.
- Run the judge 3 times per question and average the scores. LLM judges have variance.
  If score variance > 1.5 on any dimension, flag it as an unreliable judgment.
- Log the judge's reasoning. You'll need it for the failure explorer.
- Cost: each judge call uses ~1000-1500 tokens. 100 questions x 3 runs x $0.003/1k tokens
  = ~$0.90 per full eval suite. Very cheap.
```

### Step 3.4: Eval rubrics (centralized)

**File: `src/evals/eval_rubrics.py`**

```
TASK:
Store all eval rubric definitions and judge prompt templates in one file.
This makes it easy to version, iterate on, and discuss your rubric design decisions.

Include:
1. RETRIEVAL_EVAL_CONFIG: k value, similarity threshold, match criteria
2. GENERATION_RUBRIC: the full 1-5 scale for each dimension (faithfulness, completeness,
   hallucination, relevance) with precise definitions for each score level
3. JUDGE_SYSTEM_PROMPT: the full prompt template for the LLM judge
4. JUDGE_SCORE_AGGREGATION: how to combine multiple judge runs (mean, median, mode)
5. FAILURE_CLASSIFICATION_RULES: how to classify failure types from the scores

This file is your "eval spec document." In interviews, this is the artifact you point to
when someone asks "how did you evaluate quality?" The precision of these definitions
IS the signal of depth.
```

### Step 3.5: Full eval runner

**File: `scripts/07_run_full_eval_suite.py`**

```
TASK:
Orchestrate a complete eval run: retrieval evals + generation evals + store results.

def run_full_eval(run_name: str, config: dict):
    """
    1. Load the golden dataset from eval_golden_dataset table
    2. Create a new eval_runs row with run_name and config snapshot
    3. For each question in the golden dataset:
       a. Run the full query pipeline (retrieve → rerank → generate)
       b. Run retrieval evaluation (compare retrieved vs expected chunks)
       c. Run generation evaluation (LLM judge scores)
       d. Classify failure type
       e. Store per-question results in eval_results table
    4. Calculate aggregate metrics
    5. Update the eval_runs row with aggregate scores
    6. Print a summary report to the terminal

    CONFIG SNAPSHOT should include:
    {
      "chunk_size": 512,
      "chunk_overlap": 50,
      "embedding_model": "text-embedding-3-small",
      "retriever_k": 5,
      "similarity_threshold": 0.65,
      "reranker_enabled": true,
      "reranker_model": "claude-sonnet",
      "generator_model": "claude-sonnet",
      "judge_model": "claude-sonnet",
      "judge_runs_per_question": 3,
      "timestamp": "2025-01-15T10:30:00Z"
    }

    This config is stored with the eval run so you can compare across experiments.
    When you change chunk_size from 512 to 1024 and re-run, the config diff shows
    exactly what changed, and the dashboard shows the impact.
    """
    ...

USAGE:
  python scripts/07_run_full_eval_suite.py --name "baseline" --chunk-size 512 --k 5
  python scripts/07_run_full_eval_suite.py --name "+reranker" --chunk-size 512 --k 5 --reranker
  python scripts/07_run_full_eval_suite.py --name "chunk_1024" --chunk-size 1024 --k 5 --reranker
```

---

## Phase 4: Frontend

### Step 4.1: Main search page

**File: `frontend/src/pages/SearchPage.tsx`**

```
TASK:
Build the main search interface. Keep it clean and functional — this is a tool, not a marketing page.

LAYOUT:
1. Search bar at top (centered, prominent)
   - Placeholder: "Ask a question about GitLab or Stripe documentation..."
   - Submit on Enter or button click

2. Answer card below the search bar:
   - The generated answer text with [Source N] citations rendered as clickable links
   - When you click [Source 1], it scrolls to or highlights the corresponding source chunk
   - Loading state: show a skeleton loader with "Searching documents..." text

3. Source panel (right side or below):
   - Show each retrieved chunk with:
     - Source label: "Source 1", "Source 2", etc.
     - Chunk content (truncated to 200 chars with expand option)
     - Source URL (clickable link to original GitLab/Stripe page)
     - Similarity score displayed as a colored bar (green > 0.8, yellow 0.6-0.8, red < 0.6)

4. Feedback buttons:
   - Thumbs up / thumbs down below the answer
   - On click: send PATCH request to update the query record's user_feedback field
   - Optional: show a text input for feedback_comment on thumbs down

5. Metadata footer:
   - "Answered in {latency_ms}ms using {model_used}"
   - "Retrieved {n} sources from {source_count} documents"

IMPORTANT UX DECISIONS:
- The similarity score bar is not just decoration. It's a trust signal.
  Users should be able to see that the system is more or less confident.
- Show the "I don't have information on this" response clearly when retrieval
  returns nothing above threshold. Don't hide the failure — display it proudly.
  It shows the system knows its limits.
```

### Step 4.2: Eval dashboard

**File: `frontend/src/pages/EvalDashboard.tsx`**

```
TASK:
Build the eval dashboard. This is the centerpiece that differentiates your project.
It has two main panels plus a failure explorer.

USE a charting library: Recharts (already available in React) or Chart.js.

PANEL 1: RETRIEVAL QUALITY
(See the detailed mockup we designed — replicate this panel)

Components:
- MetricCard grid: Precision@5, Recall@5, MRR, Eval queries count
  Each card shows current value + delta from previous run (green up arrow or red down arrow)
- Trend line chart: Precision@5 across eval runs
  X-axis labels should show run_name from eval_runs table ("baseline", "+reranker", etc.)
- Category breakdown: horizontal bar chart showing Precision@5 per query category
  Color code: green > 0.7, amber 0.5-0.7, red < 0.5
- Failure explorer: sortable table of worst-performing questions with:
  - Question text
  - Category badge
  - P@5 and R@5 scores
  - Expandable row showing expected vs. retrieved chunks with relevance tags

Data source: query eval_runs and eval_results tables from Supabase.
Add a dropdown to select which eval run to display.
Add a "Compare runs" toggle that overlays two runs on the trend chart.

PANEL 2: GENERATION QUALITY

Components:
- MetricCard grid: Avg Faithfulness, Avg Completeness, Hallucination Rate, Avg Relevance
  - Hallucination Rate = % of questions where hallucination_detected = true
  - Show this as red text regardless of value — any hallucination is bad
- Score distribution: for each dimension, show a histogram of scores (1-5)
  This reveals whether scores cluster (all 4s = good) or spread (mix of 1s and 5s = inconsistent)
- Category breakdown: average faithfulness by query category
  - You will likely see: single_doc faithfulness ~4.2, multi_doc ~3.1, unanswerable ~2.5
  - This pattern tells a story about where the system struggles
- Failure explorer: worst-scoring answers with:
  - Question + generated answer side by side
  - Judge reasoning for each dimension
  - Highlighted hallucinated text (if any)
  - The retrieved chunks so you can see if the failure was retrieval or generation

PANEL 3: PRODUCT METRICS (if time allows)

Components:
- Daily query volume line chart (from product_metrics table)
- Satisfaction rate: positive_feedback / (positive + negative) as a percentage
- Average latency trend
- Feedback word cloud (optional, from feedback_comments)

NAVIGATION:
- Tab bar at the top: "Retrieval Quality" | "Generation Quality" | "Product Metrics"
- Each tab loads the corresponding panel
- URL should reflect the active tab (/dashboard/retrieval, /dashboard/generation, etc.)
```

---

## Phase 5: Experimentation and iteration

This is where the project becomes a story, not just a system.

### Experiment 1: Baseline

```
Run the full eval suite with default config:
- chunk_size: 512, overlap: 50
- No reranker
- k=5
- Similarity threshold: 0.65

Record results. This is your starting point.
Expected baseline: Precision@5 ~0.60-0.70, Faithfulness ~3.5-4.0
```

### Experiment 2: Add reranker

```
Same config but enable the LLM reranker.

Hypothesis: precision should improve because the reranker catches
false-positive retrievals that have high cosine similarity but low relevance.

Tradeoff: latency will increase by 500-1000ms per query.
Record the latency delta alongside the quality delta.
```

### Experiment 3: Larger chunks (1024 tokens)

```
Re-chunk all documents at 1024 tokens with 100-token overlap.
Re-embed. Re-run evals.

Hypothesis: multi-doc questions should improve (more context per chunk)
but single-doc precision might drop (chunks are less specific).

This is a real architectural tradeoff. Document the result either way.
```

### Experiment 4: Tune similarity threshold

```
Run retrieval evals at thresholds: 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80

Plot precision vs. recall at each threshold.
Find the threshold where unanswerable question handling is best
(system correctly returns empty results) without hurting answerable questions.

This is a precision-recall tradeoff curve. Create a visualization for it.
```

### Experiment 5: Hybrid search (keyword + semantic)

```
Add BM25 keyword search alongside vector search.
Combine scores: final_score = 0.7 * semantic_score + 0.3 * bm25_score

Hypothesis: hybrid search should improve recall for queries with specific
terminology (e.g., "SLA requirements" where the exact term matters)
while maintaining semantic flexibility for paraphrased queries.

Supabase supports full-text search natively. Use ts_rank for BM25 scoring.
```

### After each experiment:

```
1. Run the full eval suite with a descriptive run_name
2. Check the dashboard — did the metric you expected to improve actually improve?
3. Check for regressions — did anything get worse?
4. Write a 2-3 sentence summary of what you learned
5. The dashboard's trend chart will automatically show the progression

THIS ITERATION STORY IS YOUR INTERVIEW NARRATIVE:
"I started with a baseline of 0.68 precision. Adding a reranker improved it to 0.72
but increased latency by 800ms. Switching to 1024-token chunks helped multi-doc
queries but hurt single-doc precision. Hybrid search gave the best overall
balance at 0.74 precision with only 200ms additional latency."

That paragraph, backed by real data on your dashboard, is worth more than any
certification or course completion.
```

---

## Phase 6: Documentation and case study

### README.md

```
Write a README that covers:
1. One-paragraph project summary
2. Live demo link (deploy frontend to Vercel)
3. Architecture diagram (include the SVG from our earlier conversation)
4. How to run locally (env vars, setup steps)
5. Eval framework overview (2 paragraphs explaining the two-layer approach)
6. Key findings (3-4 bullet points of what you learned from the experiments)
7. What you would do next with more time
```

### Case study blog post

```
Write a 1500-2000 word case study covering:
1. Problem: teams waste hours searching for answers in scattered docs
2. Approach: built a RAG system with retrieval, generation, and citation
3. The eval framework: why two layers, what each measures, how the rubric works
4. Key findings: include specific numbers from your eval runs
5. Failure analysis: the most interesting failure modes you discovered
6. Iteration: how you used evals to improve the system
7. Tradeoffs: latency vs. quality, chunk size vs. precision, threshold tuning
8. What you'd do differently: lessons learned, what you'd add with more time

This case study is what you link in your resume and share in interviews.
It should read like a product retrospective, not a tutorial.
```

### Loom video walkthrough

```
Record a 5-minute screen recording:
- 0:00-1:00 — show the search interface, ask 2-3 questions, show citations
- 1:00-1:30 — show an unanswerable query and the system's "I don't know" response
- 1:30-3:00 — walk through the eval dashboard: retrieval panel, generation panel,
               failure explorer, trend chart showing improvement over experiments
- 3:00-4:00 — explain one interesting failure case from the failure explorer
- 4:00-5:00 — summarize the architecture and what you learned

Speak like a PM presenting to a stakeholder, not a developer explaining code.
Focus on decisions and outcomes, not implementation details.
```

---

## Environment setup

### .env.example

```
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
```

### requirements.txt

```
supabase>=2.0.0
openai>=1.0.0
anthropic>=0.20.0
tiktoken>=0.5.0
beautifulsoup4>=4.12.0
markdownify>=0.11.0
requests>=2.31.0
python-dotenv>=1.0.0
pyyaml>=6.0.0
```

### Estimated costs

```
Embeddings (OpenAI text-embedding-3-small): ~$0.10 for initial ingestion
Reranker LLM calls: ~$0.50 per full eval run
Generation LLM calls: ~$0.50 per full eval run
Judge LLM calls: ~$1.50 per full eval run (3 judge runs per question)
Supabase: free tier is sufficient
Vercel: free tier for hosting

Total estimated cost for complete project: $15-30
```

---

## What "done" looks like

When you finish, you should have:

1. A working search interface where you can type a question and get a cited answer
2. An eval dashboard showing retrieval quality, generation quality, and failure cases
3. At least 3-5 eval runs visible on the trend chart showing systematic improvement
4. A golden dataset of 100 hand-labeled question-answer pairs
5. A README and case study documenting your architecture, findings, and tradeoffs
6. A 5-minute video walkthrough
7. The whole thing deployed and accessible via a public URL

This is not a toy demo. This is a system that a real company could adopt and extend.
That is exactly the signal you want to send.
