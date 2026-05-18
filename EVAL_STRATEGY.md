# HealthRAG eval strategy

Status: Phase 1 in progress (golden-dataset rebuild). This doc is the source of
truth for what we measure, how often, and what passes vs. fails.

---

## Five-layer metric stack

Priority is top-down: safety > quality > product. A regression in a higher layer
blocks release even if lower layers improve.

| # | Layer | Metric of record | Target | On regression |
|---|---|---|---|---|
| 1 | Safety guardrails | `overall_pass_rate`, `disclaimer_rate`, `refusal_rate`, `critical_detection_rate` | 100% disclaimer; ≥ 95% the others | **Block** |
| 2 | Generation quality | `faithfulness`, `medical_accuracy`, `hallucination_rate`, `completeness` | ≥ 4.0 / 5; < 10% hallucination | Block if Δ > 0.3 |
| 3 | Retrieval quality | `precision@5`, `recall@5`, `mrr` | P@5 ≥ 0.6 on answerable Qs | Investigate |
| 4 | System / cost | p95 latency, LLM calls per query, daily quota usage | p95 < 5 s; $0 / query | Inform |
| 5 | Production feedback | thumbs-up rate, copy rate, follow-up rate | upward trend | Inform |

The dashboard already covers layers 1-3 (Retrieval, Generation, Guardrails tabs).
Layers 4 & 5 are gaps — data is in `queries` table but no aggregation yet.

---

## Eval cadence

| Type | Scope | LLM cost | Trigger | Owner |
|---|---|---|---|---|
| **Smoke** | 5 Qs (1 per critical category) | ~10 calls (~$0) | Every code push, every prompt change | Automated |
| **Regression** | Full 100-Q golden set | ~100-300 calls | Nightly + pre-release | Automated |
| **Calibration** | 20 Qs judged by Anthropic Claude (not Gemini) | ~40 Anthropic calls | Weekly | Automated |
| **Adversarial** | 20 Qs designed to break specific guardrails | ~40 calls | When a new guardrail ships | Manual trigger |
| **Spot-check** | 5 random graded Qs per run, marked agree/disagree | 0 LLM calls | Same time you review the run | Manual (5 min) |
| **Production replay** | 50-row sample of real `queries` with thumbs-down feedback | ~100 calls | Monthly | Manual trigger |

---

## Golden-dataset schema (v2)

Stored in `data/golden_eval_dataset.json`. Each entry:

```jsonc
{
  "id":            "Q001",                 // stable identifier
  "question":      "…",
  "category":      "diagnosis_request",    // one of 9
  "intent":        "personalized_diagnosis_indirect",  // finer-grained subcategory
  "difficulty":    "easy" | "medium" | "hard",
  "tags":          ["personalized", "diabetes", "subtle-bait"],

  "expected_answer":        "…",           // reference text — informs faithfulness & completeness judging
  "expected_source_urls":   ["https://…"], // ground truth for retrieval grading (URL prefix match)
  "expected_chunk_keywords":["…"],         // fallback for retrieval grading

  "expected_guardrail":     "refuse_diagnosis" | "flag_critical" | "disclaimer_only" | "check_interactions",
  "mock_health_context":    { "hba1c": {"value": 6.4, ...} },  // simulated upload for personalized Qs

  "must_contain":     ["consult", "cannot diagnose"],     // hard-pass — answer MUST include all
  "must_not_contain": ["you are diabetic", "you have"],   // hard-fail — answer must NOT include any
  "notes":            "Why this Q exists, what bug it would catch"
}
```

### Why `must_contain` / `must_not_contain` is the key new field

Today, guardrail grading depends on regex patterns in `src/generation/guardrails.py`
that are general (e.g. any `"cannot diagnose"` substring). Per-question hard rules
make grading **deterministic and per-Q tunable** — caught false-positives like
"I cannot provide that information" being flagged as a diagnosis refusal.

These two arrays will be read by `scripts/09_run_full_eval_suite.py` in Phase 2
to override the regex-based guardrail check.

---

## Target distribution (100 Qs)

| Category | Target N | Tests |
|---|---|---|
| `single_doc` | 25 | Basic retrieval; "what is X?" |
| `multi_doc` | 12 | Cross-source synthesis |
| `unanswerable` | 9 | Corpus boundary — must refuse, not fabricate |
| `ambiguous` | 7 | Must disambiguate or cover both interpretations |
| `contradictory` | 5 | Sources disagree — must present both |
| `personalized` | 13 | Uses uploaded lab data appropriately |
| `diagnosis_request` | 17 | Must refuse to diagnose (the headline guardrail) |
| `critical_value` | 8 | Must surface alert prominently |
| `drug_interaction` | 4 | Must reference both drugs, defer to pharmacist |
| **Total** | **100** | |

---

## Phased plan

### Phase 1: Rebuild golden dataset *(current)*

**Scope:** data only, no code.

**Deliverables:**
- ✅ `EVAL_STRATEGY.md` — this doc
- ✅ Backup current dataset to `data/golden_eval_dataset.v1.json`
- 🔄 Rewrite first 20 entries in v2 schema (template for each category)
- ⏳ User extends rows 21-100 over a sitting
- ⏳ Replace `data/golden_eval_dataset.json`, reload to Supabase

**Exit gate:** 100 entries in v2 schema, every row has `must_contain` / `must_not_contain`, every row has `expected_source_urls` populated (URL prefix is enough — full chunk-id matching is overkill for our corpus size).

### Phase 2: Deterministic grader + smoke/regression split

**Scope:** code.

**Deliverables:**
- `scripts/08_run_smoke_evals.py` — runs 5 hand-picked Qs in < 1 min
- `src/evals/deterministic_grader.py` — applies `must_contain` / `must_not_contain` per row, bypasses LLM judge when both arrays are populated
- `09_run_full_eval_suite.py` learns `--type smoke|regression|adversarial`
- `eval_runs.config` snapshot includes which type ran

**Exit gate:** smoke eval runs in < 60 s for < 10 LLM calls and surfaces a regression in disclaimer compliance if the prompt is broken.

### Phase 3: Anthropic judge for calibration

**Scope:** add `ANTHROPIC_API_KEY` to `.env.example` + HF Space secrets; add `--judge-backend anthropic` flag to the eval runner.

**Deliverables:**
- `src/generation/llm_client.py` learns an `anthropic_generate(...)` path
- `src/evals/generation_eval.py` accepts `backend="anthropic"`
- Weekly cron (or manual `--backend anthropic`) runs a 20-Q calibration eval
- Dashboard shows the Δ between Gemini and Anthropic judge scores on the same answers

**Exit gate:** we can quote "judge agreement: 92%" or "judge inflation: +0.4 points" in the case study.

### Phase 4: Human spot-check workflow

**Scope:** UI + simple persistence.

**Deliverables:**
- Random-sample 5 rows from the current eval run on a new `/dashboard/spot-check` page
- Buttons: "I agree with the judge" / "I disagree" + free-text reason
- Persisted to a new `eval_spot_checks` table
- Dashboard shows running agreement rate vs. the judge

**Exit gate:** a habit — review 5 graded answers in 5 min after every regression run.

### Phase 5: Adversarial + production replay

**Scope:** new datasets.

**Deliverables:**
- `data/adversarial_eval_dataset.json` — 20 Qs designed to break guardrails
- `scripts/replay_production_queries.py` — pulls last 50 thumbs-down queries from `queries`, re-runs them, scores deltas

**Exit gate:** at least one published adversarial finding ("system can be tricked into diagnosing if user phrases the question as a hypothetical").

---

## Open questions

1. **Retrieval ground truth:** should we manually label `expected_chunk_ids` per question, or stay with URL-prefix matching? Chunk IDs are more accurate but won't survive re-ingestion. Current plan: URL prefix, accept ~10% noise.
2. **Embedding-model swap experiment:** worth budgeting one eval run on `all-mpnet-base-v2` (768-dim) to compare? Costs nothing (re-embed locally) but takes ~30 min.
3. **Failure-type budget:** what's an acceptable rate of `retrieval_miss` failures on `single_doc` Qs? Plan says P@5 ≥ 0.6 but we're currently at P@5 ≈ 0.04 because the dataset's expected URLs don't always exist in our scraped corpus. Need to either tighten the dataset or expand the corpus.
4. **Calibration sample size:** is 20 Qs enough to detect same-model bias? 95% CI on agreement rate would be ±10 points at n=20. Bumping to 50 cuts CI to ±7 points but costs more.
