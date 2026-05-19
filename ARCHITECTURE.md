# HealthRAG architecture

A short tour of how the system is wired together, why each piece exists, and where the boundaries are.

## 1. The big picture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Browser (Vercel)                             │
│                                                                         │
│  Search page          /dashboard/{retrieval,generation,guardrails,…}    │
│  ChatPanel (right)    EvalRunsPage   SettingsPage                       │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │  HTTPS · CORS allow-list
                                     │  Bearer-style: session_id in body
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       FastAPI (Hugging Face Space)                      │
│                                                                         │
│  POST  /query           POST  /upload         GET   /eval/runs          │
│  GET   /upload/latest   DELETE /upload         GET   /eval/runs/{id}/…  │
│  POST  /feedback        GET   /health                                   │
│                                                                         │
│  Orchestrator                                                           │
│    1. fetch user's health context by session_id                         │
│    2. retrieve   (sentence-transformers, local)                         │
│    3. rerank     (cross-encoder, local)                                 │
│    4. guardrails pre-check    (regex intent detection)                  │
│    5. generate              (Gemini 2.5 Flash via google-genai SDK)     │
│    6. guardrails post-check (disclaimer / refusal / critical-flag)      │
│    7. log → queries table                                               │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │  Postgres
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Supabase (free tier)                           │
│                                                                         │
│  documents   chunks (pgvector 384-dim, ivfflat cosine)   queries        │
│  uploaded_health_reports (24-hour TTL via Postgres job)                 │
│  eval_golden_dataset   eval_runs   eval_results   product_metrics       │
│                                                                         │
│  RPC: match_chunks(query_embedding, match_count, threshold)             │
└─────────────────────────────────────────────────────────────────────────┘
```

## 2. Why these specific layers

| Layer | Tool | Why |
|---|---|---|
| Frontend hosting | Vercel | One-click GitHub deploys, free, fast edge CDN. SPA-only — no server-side logic. |
| Backend hosting | Hugging Face Spaces (Docker SDK) | The only no-credit-card host I could find that gives 16 GB RAM. Torch + sentence-transformers + cross-encoder need ~700 MB resident; Render free (512 MB) would OOM. |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` (local CPU) | Free, deterministic, fast on CPU. 384-dim — small enough that Supabase free-tier disk holds 2 K+ chunks comfortably. |
| Reranker | cross-encoder `ms-marco-MiniLM-L-6-v2` (local CPU) | Purpose-built for relevance scoring. ~10 ms per pair on CPU vs. ~500 ms per LLM API call. **The interview talking point**: I refuse to burn LLM tokens on a task that doesn't need generative capability. |
| Generator + Judge | Gemini 2.5 Flash via free tier | 20 requests/day per model (real measured cap — the "1500/day" figure in old Google docs is gone). We work within the cap by using `--retrieval-only` mode for iteration. |
| Vector DB | Supabase Postgres + pgvector | Vector + relational in one place. The eval_results and uploaded_health_reports tables sit alongside chunks — no syncing across stores. Free tier covers 500 MB / 50 K rows; we use ~2 K chunks. |
| PDF extraction | pdfplumber | Local Python, no API. Tested specifically against Indian lab report formats (Thyrocare, Dr Lal PathLabs, SRL, Sterling Accuris, Metropolis). Heuristics in the parser handle inline H/L flags, multi-column layouts, and units glued to values. |

## 3. The three eval layers (and why they're separate)

```
┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│   Retrieval eval   │  │  Generation eval   │  │  Guardrails eval   │
│                    │  │                    │  │                    │
│  Did the retriever │  │  Was the generated │  │  Did the system    │
│  find the right    │  │  answer faithful,  │  │  follow its safety │
│  chunks?           │  │  complete, etc.?   │  │  rules?            │
│                    │  │                    │  │                    │
│  • Precision@k     │  │  • Faithfulness    │  │  • Disclaimer rate │
│  • Recall@k        │  │  • Completeness    │  │  • Refusal rate    │
│  • MRR             │  │  • Hallucination   │  │  • Critical flag   │
│                    │  │  • Medical accuracy│  │    detection rate  │
│                    │  │                    │  │  • Overall pass    │
│  Method:           │  │  Method:           │  │                    │
│   vector + rerank  │  │   LLM-as-judge     │  │  Method:           │
│   + URL-prefix     │  │   (Gemini)         │  │   regex + token    │
│   ground truth     │  │                    │  │   checks (no LLM)  │
│                    │  │                    │  │                    │
│  Cost: $0          │  │  Cost: ~1 call/Q   │  │  Cost: $0          │
│                    │  │  (judge can run    │  │                    │
│                    │  │   1-3× per Q)      │  │                    │
└────────────────────┘  └────────────────────┘  └────────────────────┘
```

Separating these is the project's central design idea. A bad answer can mean retrieval failed (no relevant chunks), generation failed (good chunks, bad synthesis), OR a guardrail failed (right info, but the system shouldn't have said it that confidently). Three separate dashboards let you diagnose which.

## 4. Data flow on a single `/query`

1. Browser POSTs `{question, session_id}` to FastAPI.
2. Orchestrator calls `HealthContext.context_for_query(session_id)` → reads the most recent `uploaded_health_reports` row, picks relevant parameters for the question, formats them as text.
3. Retriever: encodes the query (5 ms on CPU), calls `match_chunks` RPC with `match_count=10` and the threshold. RPC returns chunks ordered by cosine similarity.
4. Reranker: scores each (query, chunk) pair, sorts by reranker score, keeps top 5.
5. Guardrails pre-check: regex on the question detects diagnosis intent, drug-interaction intent, etc. Returns instructions to inject into the prompt.
6. Generator: builds the system prompt with (a) the health context, (b) the guardrail instructions, (c) the 6 numbered safety rules, (d) the context block of 5 chunks. Calls Gemini 2.5 Flash.
7. Guardrails post-check: regex + string-match on the answer. Checks: disclaimer present? Refusal language present? Critical alert language present? Sets `disclaimer_present`, `refused_diagnosis`, `flagged_critical`, `guardrail_passed`.
8. Logs everything to the `queries` table (`session_id`, `has_health_context`, the four guardrail booleans, latency, citations, etc.).
9. Returns the response. ~5-8 seconds end-to-end on a cold HF Space; ~2-3 s once warm.

## 5. Where things can fail

| Failure mode | Detected by | Caught by |
|---|---|---|
| Retrieval miss | `recall@k == 0` in eval | RetrievalPage failure explorer |
| Retrieval noise (right chunk exists but ranked below k) | `recall>0 && mrr<1/k` | same |
| Hallucination | LLM-judge flags `hallucination_detected` | GenerationPage worst-scoring list |
| Definitive diagnosis on diagnosis_request | Regex in `Guardrails._has_definitive_diagnosis` | GuardrailsPage failure explorer (`guardrail_failed_to_refuse`) |
| Missing disclaimer | Regex in `Guardrails._has_disclaimer` | GuardrailsPage (`guardrail_missing_disclaimer`) |
| Critical value not flagged | Regex over answer | GuardrailsPage (`guardrail_missed_critical_value`) |
| PDF parse fails | Empty `extracted_values` written to `uploaded_health_reports` | UI shows "no extracted values"; downstream queries don't see health context |

## 6. Iteration loop

```
        ┌──────────────────────┐
        │   Change something:  │
        │   chunk_size,        │
        │   threshold,         │
        │   prompt,            │
        │   reranker_top_k,    │
        │   corpus, etc.       │
        └──────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────┐         Free: $0, 10 sec for 50 Qs
        │  Run retrieval eval  │ ◄──────  No LLM tokens consumed
        │  --retrieval-only    │
        └──────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │  Inspect dashboard:  │
        │  metric deltas,      │
        │  per-category        │
        │  breakdown,          │
        │  failure explorer    │
        └──────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────┐         Costly: ~100 LLM calls
        │  Run full eval       │ ◄──────  Only when retrieval looks good
        │  (gen + guardrails)  │
        └──────────────────────┘
```

This gating is intentional. Most iteration is on retrieval/chunking/prompts. Generation evals are expensive on the free tier (20 calls/day per model), so we lock retrieval first, then spend the LLM budget once we're confident the inputs are right.

## 7. What's deliberately NOT here

- **No vector DB sidecar** (Pinecone / Weaviate / Qdrant). Supabase pgvector is enough at this scale. Avoids one more service to manage.
- **No web search fallback**. The system is supposed to say "I don't have information on this" when the corpus is sparse — that's a feature for the demonstration narrative, not a gap.
- **No reranking by LLM** for live queries (we use a cross-encoder). Saves tokens. The original plan called for LLM reranking; the cross-encoder ships the same intent for ~50× less cost.
- **No persisted chat memory**. Each `/query` is stateless turn-to-turn. The user's report is the only persistent context, scoped to their `session_id` and TTL'd at 24 h. Multi-turn chat in the right panel works because each follow-up still has access to the report — not because we resend the prior turn's text.
- **No auth**. This is a portfolio demo. The session_id is unauthenticated; uploaded reports are isolated only by random UUID. Not suitable for real users without an auth layer.
- **No PII storage**. The `uploaded_health_reports.raw_text` field is optional and left empty by default — we store only the parsed structured values.
