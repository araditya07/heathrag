# Adding NIH MedlinePlus: corpus-expansion impact

> *Does adding a second authoritative source — written in a different
> voice — actually lift retrieval, and if so, where?*

A controlled BEFORE/AFTER experiment. Same golden dataset (50 questions),
same retriever (`all-MiniLM-L6-v2` + `ms-marco-MiniLM-L-6-v2` reranker),
same threshold sweep, same eval grader. Only one variable changed.

Run date: 2026-05-22 / 23. Branch: `main`.

---

## What changed

| | Before | After | Delta |
|---|---|---|---|
| Sources | CDC only | CDC + NIH MedlinePlus | +1 source |
| Documents | 686 | 883 | +197 (+29%) |
| Chunks | 2,195 | 2,484 | +289 (+13%) |
| Embedding time | 6:33 | 8:26 | +1:53 |
| Cost | $0 | $0 | $0 |

The new source: 197 plain-language consumer-facing topic pages from
NIH MedlinePlus. The CDC corpus is policy- and clinician-oriented;
MedlinePlus is written for patients — short, FAQ-structured, voice
calibrated to "what does this mean for me".

---

## Headline metrics @ threshold = 0.20

| metric | Before | After | Δ |
|---|---|---|---|
| Precision@5 | 0.244 | **0.252** | +3.3% |
| Recall@5 | 0.380 | **0.400** | +5.3% |
| MRR | 0.400 | **0.410** | +2.5% |
| Best F1 (sweep) | 0.297 | **0.309** | +4.0% |

**Modest aggregate lift.** That alone wouldn't justify a writeup. But the
breakdown is the interesting part.

---

## Per-category P@5 lift

| category | n | Before P@5 | After P@5 | Δ |
|---|---|---|---|---|
| **diagnosis_request** | 10 | 0.200 | **0.240** | **+20.0%** |
| single_doc | 8 | 0.150 | 0.150 | 0.0% |
| multi_doc | 6 | 0.533 | 0.533 | 0.0% |
| ambiguous | 3 | 0.267 | 0.267 | 0.0% |
| contradictory | 3 | 0.733 | 0.733 | 0.0% |
| personalized | 6 | 0.300 | 0.300 | 0.0% |
| critical_value | 6 | 0.167 | 0.167 | 0.0% |
| unanswerable | 4 | 0.000 | 0.000 | 0.0% |
| drug_interaction | 4 | 0.000 | 0.000 | 0.0% |

**The entire 3.3% aggregate lift comes from a single category:
`diagnosis_request` improved 20%.** Every other category stayed
exactly flat.

This is the experiment's most interesting finding. It means:

- The 197 new MedlinePlus docs are doing real work, but only on questions
  whose phrasing matches their voice ("Am I diabetic?" → MedlinePlus has
  patient-FAQ pages on diabetes; CDC has clinical-screening guidelines
  that don't use that vocabulary).
- The other categories are bottlenecked by something **other than
  corpus**: `single_doc` weakness is about topic-coverage depth, not
  source diversity. `contradictory` is already near its ceiling.
  `unanswerable` is a threshold problem. `drug_interaction` is a missing-
  source problem (no drug DB scraped).

The dashboard-level metric of "+3.3% Precision@5" is almost the wrong
number to look at. The honest framing is **"+20% on the category the
new source was designed to help; no change on the categories where it
wasn't structurally relevant."**

---

## Unanswerable handling — still broken at any threshold

Adding more docs did **not** help unanswerable. Across the full sweep
(0.20 → 0.50), unanswerable correctness stayed at the BEFORE numbers:
0/4 at threshold 0.20, 4/4 at 0.50. Adding sources cannot fix this —
the only levers are threshold tuning, intent classification, or moving
to a sparser retrieval method (BM25 fallback).

---

## What I'd try next

1. **Per-source bias on the reranker** — when the query intent
   classifier says "consumer phrasing" (e.g. starts with "what is",
   "how do I know if"), upweight NIH chunks at the rerank stage. The
   diagnosis_request lift suggests this would compound.
2. **More MedlinePlus** — current cap is 200 pages (out of ~1000 the
   index lists). Could grow the NIH side another 4× cheaply (no LLM
   cost). Diminishing returns are likely but unmeasured.
3. **A drug-interaction source** for the `drug_interaction` category,
   which sits at 0% and can't move without it. MedlinePlus also has a
   drug-information subsection at `/druginformation.html` worth its own
   scraper.

---

## Reproducing

```bash
# Before snapshot
make eval-sweep | tee /tmp/before.txt

# Add the source
make ingest-medlineplus
make chunk
make embed

# After snapshot
make eval-sweep | tee /tmp/after.txt

# Compare
diff /tmp/before.txt /tmp/after.txt
```

Total wall-clock: ~12 minutes (scrape 1 min + chunk 8 s + embed 8 min +
sweep 35 s + sweep 35 s). Total LLM tokens consumed: 0.
