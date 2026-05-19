# Changelog

All notable changes to this project. Format roughly follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 2026-05-18

### Added
- **`--retrieval-only` mode** for the eval suite. Skips the LLM judge and
  the orchestrator's generation step entirely. Retrieval-only runs take
  ~10 seconds for 50 questions and consume zero Gemini tokens — enables
  unlimited iteration on the retriever, chunker, threshold, and corpus
  without daily quota concerns.
- **Personalized chat suggestions** in the right-side `<ChatPanel>`.
  Empty-state suggestion pills are now generated from the user's actual
  abnormal lab values (critical → high → low priority, cardio-metabolic
  weighted). Each suggestion phrases the question with the value + unit
  inline so retrieval can grip it precisely.
- **Expandable sources** under chat-bubble assistant messages. The
  bubble stays clean by default but exposes a "N sources" affordance
  that reveals the underlying source-URL list, so users can verify what
  the model was grounded in without leaving the chat thread.
- **`HealthNarrativeSummary` card** rendered right after a successful
  upload. Deterministic, no LLM call — generated purely from the
  structured values + reference ranges. Surfaces counts (normal /
  outside-normal / critical) and per-parameter interpretation in plain
  language.
- **Site-wide `<DemoNotice>` banner** stating the project is for
  educational / portfolio purposes only.
- **`ARCHITECTURE.md`** documenting layers, eval-layer separation, data
  flow, and deliberately-excluded scope.
- **MIT `LICENSE`** with health-content disclaimer addendum.

### Fixed
- **URL matching in retrieval grader** (`src/evals/retrieval_eval.py`).
  The old `_is_relevant()` did exact-string membership against
  `expected_source_urls`, but the v2 golden dataset stores URL prefixes
  like `https://www.cdc.gov/diabetes/`, while retrieved chunks carry
  full URLs like `https://www.cdc.gov/diabetes/about/index.html`.
  Exact equality would literally never match. Replaced with
  `startswith()`-based prefix matching. Validated 6.1× lift on
  Precision@5 (0.04 → 0.244) against the 50-Q dataset.
- **Null-aware metric rendering** on every dashboard. Old code did
  `(x ?? 0).toFixed(2)` which painted in-flight or crashed runs as
  "0.00". New `src/lib/fmt.ts` provides `fmtScore`, `fmtScoreOf5`,
  `fmtPct`, `fmtInt` — all return `—` when the value is null.
- **Default selected run** in `useEvalData`. Was just `runs[0]`
  (most recent), which meant an orphan row from a crashed eval became
  the default and made the dashboards look empty. Now prefers the
  most-recent run with at least one populated metric.
- **Disclaimer card tone** on Guardrails dashboard. Used to flash red
  when the rate was null; now treats null as "no data" rather than
  "< 100%".
- **Lab-report PDF parsing** for Indian lab formats. Old text-fallback
  regex required ≥ 2 spaces between fields, which matched 0 rows on
  Sterling Accuris / Dr Lal PathLabs / Thyrocare reports that render
  each parameter on a single line. New regex handles single-line
  layouts with H/L flags either space-separated or glued to the value
  ("H10570"). Tightened `normalize_parameter_name` to word-boundary
  alias matching to kill false positives like "k" matching "peak"
  (was producing fake potassium readings).

### Changed
- **Generator prompt template** (`src/generation/prompt_templates.py`).
  Rule 4 rewritten to require integrating two sources of truth
  (retrieved guideline chunks + user's uploaded values) with specific
  numbers cited inline. Added explicit "summarize my report" guidance.
  Clarified that user values don't need `[Source N]` citations.
- **Answer rendering** (`src/components/AnswerBody.tsx`). Now parses
  markdown bold (`**`) and bullet lists (`*`) so multi-parameter
  summaries render as readable structured prose instead of one wall of
  literal asterisks.
- **CDC scraper** (`scripts/02_scrape_cdc.py`). Rewrote to walk the
  `wcms-auto-sitemap-index.xml` (the previous sitemap URL no longer
  exists), apply a curated topic allowlist, cap each topic at 40 pages,
  and round-robin interleave URLs so a single huge topic
  (salmonella had 519+ URLs) can't crowd out the diversity of the
  corpus. After: 28 topics × ~30 pages = 686 docs covering diabetes,
  cholesterol, heart disease, kidney disease, etc.

## 2026-05-17 (pivot to HealthRAG)

### Added
- Initial HealthRAG schema (8 tables + `match_chunks` RPC).
- CDC scraper, pdfplumber-based lab-report parser, sentence-transformers
  embedder, cross-encoder reranker, Gemini generator with Ollama fallback.
- Two-layer + guardrail eval framework
  (`src/evals/{retrieval_eval,generation_eval,guardrail_eval}.py`).
- 30-question v1 golden dataset across 9 categories.
- Frontend rebuilt against the supplied design system: sidebar nav,
  search page with all answer variants (generic / personalized /
  critical / refusal / IDK / drug-interaction), retrieval + generation +
  guardrails + metrics + eval-runs dashboards, settings page.

### Removed
- Original RAG-Ops project (GitLab handbook + Stripe docs). The pivot
  to a health-information domain preserved the eval-framework and most
  of the retrieval/generation pipeline but replaced data sources,
  prompts, and the safety layer.

## 2026-05-16 (initial)

### Added
- Initial repository scaffold.
- Supabase project + pgvector enabled.
- Vercel + Hugging Face Spaces deployment configured.
