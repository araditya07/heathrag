# HealthRAG: building a measurable AI health companion

> A product-led case study on shipping a RAG system in a high-stakes domain,
> with three-layer evaluation, deliberate safety guardrails, and an honest
> account of where the numbers fell short and why.

**Live demo:** https://heathrag.vercel.app · **Source:** https://github.com/araditya07/heathrag

---

## TL;DR

I built an AI health-information companion that answers user questions
about symptoms, medications, nutrition, and lab values — and personalizes
its answers when users upload a lab-report PDF. The system makes a strong
stance on safety: it refuses to diagnose, always shows a medical
disclaimer, flags critical lab values prominently, and says
"I don't have information on this" rather than fabricating.

The interesting part is not the demo. It's the **eval framework** that
sits behind it: three independent dashboards (retrieval quality,
generation quality, guardrail compliance) measuring whether the system
actually does what it claims. Over the course of building it I made a
1-line URL-matching bug fix that lifted retrieval Precision@5 by **6.1×**
(0.04 → 0.244). I only knew the lift was real because the eval framework
told me.

Total cost: **$0/month**. Total time: **~3 days** of focused work.

---

## Why I built it

I want an applied-AI PM role at a Series B startup. The interview
question that comes up is some flavor of:

> "Tell me about an AI system you shipped. What did you measure?
> How did you know it was working?"

Most portfolio RAG projects answer the first half ("here's the
architecture") and not the second ("here's how I measured quality").
For the kinds of roles I want, the second half is the *signal*.

So the project's central design idea is: **don't just build a RAG system,
build the eval framework that measures it**, and let the act of building
the framework discipline the engineering.

---

## The high-stakes domain choice

I chose health information *because* the stakes are high. A hallucinated
drug dosage could harm someone. A missed critical lab value could delay
emergency care. A confident diagnosis could trigger panic.

These failure modes don't go away if you ignore them. The point of the
guardrail layer is to **measure** whether the system has them under
control. The point of the design system's deliberate redundancy
(critical-value warnings appear in the standalone alert card AND in
the answer body AND in the value-row tint) is that a potentially
life-threatening lab value should be impossible to miss.

I will not be deploying this to real users. The site banner says so
explicitly. But the design has to be defensible *as if* it were going
to production, because that's the actual job.

---

## The architecture, one paragraph

A Vite/React SPA talks to a FastAPI backend hosted on Hugging Face Spaces
(free CPU, 16 GB RAM — the only no-credit-card host I could find that
would hold torch + sentence-transformers + cross-encoder in memory
without OOM). The backend embeds queries locally with `all-MiniLM-L6-v2`
(384-dim), retrieves from a Supabase Postgres + pgvector store, reranks
with a CPU cross-encoder, applies a regex-based pre-generation guardrail
check, calls Gemini 2.5 Flash on the free tier for generation, and does
a regex-based post-generation guardrail check before returning. Uploaded
lab-report PDFs are parsed locally with pdfplumber and stored as
structured values keyed to the user's session_id (TTL 24 h).

Why these choices over the obvious ones: see
[`ARCHITECTURE.md`](../ARCHITECTURE.md) — short version, the entire stack
is constrained by "no credit card", and the cross-encoder reranker
replaces what the original plan had as an LLM-based reranker (~50× cost
reduction, same intent).

---

## The three-layer eval framework

The project's central design decision is to **separate** retrieval evals
from generation evals from guardrail evals. A bad answer can fail in
three independent places:

1. **Retrieval failed** — the relevant chunks were never pulled.
2. **Generation failed** — good chunks were pulled but the model
   synthesized them poorly.
3. **Guardrail failed** — the answer was technically correct but the
   system over-stated it (diagnosed when it shouldn't, dropped the
   disclaimer, missed a critical value).

If you only have one "answer quality" score, you can't tell which layer
broke. With three separate dashboards, you can.

### Retrieval eval

Metrics: Precision@5, Recall@5, MRR, plus a per-question-category
breakdown.

Method: a 50-question golden dataset where each question carries
`expected_source_urls` (URL prefixes from the authoritative source),
`expected_chunk_keywords`, and `mock_health_context` (for personalized
questions). The grader runs the live retriever, gets the top-5 chunks,
and checks whether their source URLs start with any of the expected
prefixes. URL match is the primary signal; keyword overlap is the
fallback.

Cost: **$0**. No LLM calls. A 50-question retrieval-only sweep runs in
~10 seconds.

### Generation eval

Metrics: faithfulness, completeness, relevance, medical accuracy (all
1–5), and a binary hallucination flag.

Method: LLM-as-judge. For each question, the judge sees the user
question, the expected answer, the system's generated answer, and the
retrieved chunks. It scores each dimension with a specific 1–5 rubric
(documented in `src/evals/eval_rubrics.py`). For variance control I
run the judge N times and average; N=3 is the spec, N=1 is the
quota-aware default.

Cost: 1–3 LLM calls per question per judge dimension. The Gemini free
tier is **20 calls/day per model**, which is the binding constraint —
the most consequential thing I learned about the "free tier" of any
LLM provider.

### Guardrail eval

Metrics: disclaimer compliance rate, refusal-to-diagnose rate, critical-
value detection rate, overall pass rate.

Method: deterministic regex + string matching on the generated answer.
Was the disclaimer present? Did the answer contain refusal language
("I cannot diagnose")? Did it contain definitive diagnostic statements
("you are diabetic")? Did it lead with the critical-value alert when
one was applicable?

Cost: **$0**. No LLM calls. The guardrail layer is the one I'm proudest
of because it produces interview-grade artifacts ("our system refuses to
diagnose 100% of the time, measured across 30 adversarial questions")
without spending tokens.

---

## The bug that mattered

The first time I ran the full eval against the 50-question dataset,
Precision@5 came back as **0.04**. That's not "bad", it's "broken".
A 50-question system that gets 2% precision at the top 5 isn't doing
RAG; it's doing random retrieval.

I assumed the corpus was the problem. I considered scraping more pages,
lowering the threshold, swapping the embedding model — typical RAG
debugging.

Then I looked at the grader's source code:

```python
url = (chunk.metadata or {}).get("source_url", "")
if url and url in expected_source_urls:  # ← exact match on a list
    return True
```

`expected_source_urls` was a list of URL **prefixes** like
`https://www.cdc.gov/diabetes/`. The retrieved chunks carry **full URLs**
like `https://www.cdc.gov/diabetes/about/index.html`. The `in` operator
does exact string membership in the list. It would literally never
return True. Not for any chunk in any query.

The fix:

```python
def _url_prefix_match(chunk_url, expected_urls):
    return any(chunk_url.startswith(prefix) for prefix in expected_urls)
```

One function. After: P@5 = **0.244** (6.1× lift), R@5 = 0.38, MRR = 0.40.
Per-category, `contradictory` and `multi_doc` jumped to 0.73 and 0.53
respectively.

**The takeaway is not the bug, it's that I noticed.** Without the eval
framework producing a single visible "0.04" number, I would have spent
hours scraping more pages, tuning thresholds, and trying different
embedding models — all of which would have changed *nothing* because
the grader itself was lying to me.

---

## What the metrics tell me to fix next

The current per-category breakdown:

| category | n | P@5 | story |
|---|---|---|---|
| contradictory | 3 | 0.73 | Best — multiple URL prefixes give multiple match chances |
| multi_doc | 6 | 0.53 | Strong, same reason |
| personalized | 6 | 0.30 | OK — mock context isn't biasing retrieval enough |
| diagnosis_request | 10 | 0.20 | Mediocre — emergency questions don't surface relevant pages |
| single_doc | 8 | 0.15 | **Weakest answerable category** — corpus depth issue |
| unanswerable | 4 | 0.00 | **By design failure** — threshold too permissive at 0.20 |
| drug_interaction | 4 | 0.00 | **Structural gap** — no drug DB scraped yet |

The point of this framing is that *I know what to do next* because the
framework named the problem.

- **single_doc is weak** → CDC scrape's per-topic cap is 40 pages, which
  misses specific fact pages. Raise the cap, re-embed, re-run.
  Cost: $0, ~15 min compute.
- **unanswerable is failing at any threshold I tested** → corpus has
  too much "anything matches" content, OR threshold needs to be much
  higher than 0.30. The threshold sweep tool
  (`scripts/10_threshold_sweep.py`) is for exactly this question.
- **drug_interaction is structurally 0** → no drug DB scraped. The
  metric will stay at 0 until I scrape MedlinePlus drugs or CDSCO.
  That's a corpus problem, not a retrieval problem.

This is the iteration loop: change something, run the cheap retrieval
eval, check the dashboard, decide if it's worth running the expensive
LLM eval. Most iteration never touches the LLM.

---

## The frontend, briefly

I built against a supplied design system handoff (Plus Jakarta Sans
body, JetBrains Mono for numbers, accent green used sparingly). The
interesting frontend details, briefly:

- The **refusal block uses info-blue, not red**. Refusal is a feature
  of the system working correctly, not a failure. Red would signal
  "something went wrong"; blue says "I'm being responsible by not
  overstepping."
- The **critical-value warning appears in three places** when relevant
  (standalone alert card with a 2px danger border, opening line of the
  generated answer in a red callout, and the status badge in the
  values card). Deliberate redundancy. A potentially life-threatening
  lab value should be impossible to miss.
- **Inline user-value marks** in answer bodies — when the LLM mentions
  the user's HbA1c of 7.1%, that exact span is rendered with an accent
  background, mono font, 4px radius. Surfaces the personalization
  visibly.
- **Right-side chat panel** for follow-up questions. Personalized
  suggestion pills generated from the user's actual abnormal values
  ("What lifestyle changes can lower my HbA1c (7.1 %)?"). Each turn
  calls the LLM with the user's report still in scope via session_id.

---

## What I'd do differently

1. **Calibrate the LLM judge with human ratings.** The current system
   uses Gemini for both generation and judging — same-model bias is
   real. For a production system I'd want either (a) a different model
   family for judging, or (b) a small human-labeled calibration set
   that the judge gets benchmarked against.

2. **Stop fighting the Gemini free tier.** Spending two days working
   around the 20-call/day cap (`--judge-runs 0`, `--retrieval-only`,
   `--limit 18`, model-switching between flash and flash-lite) was
   instructive but not high-leverage. If I were doing this again I'd
   either pay for one month of Gemini production tier or use Groq's
   free Llama 3 endpoint (much higher limits).

3. **Build the eval framework FIRST.** I built the retrieval/generation
   pipeline before the eval framework, and shipped about 2 days of code
   I would have written differently if I had the numbers in front of me
   from day one.

4. **Pick a domain with denser open data.** The drug-interaction
   category is structurally 0% because there's no easy-to-scrape
   structured drug-interaction database. I knew this going in but
   under-weighted it.

---

## What this project says about me as a candidate

If you want to know how I think about applied AI products, look at:

- `src/evals/` for the eval framework design and rubrics
- `ARCHITECTURE.md` for the "what's deliberately missing and why" section
- `CHANGELOG.md` for the per-day delivery cadence
- The headline numbers (P@5 = 0.244 not 0.95) for the willingness to
  ship and report mediocre numbers honestly

I'd rather hand you a project where the metrics tell a real story —
including the parts where they're bad — than one where everything
looks perfect because the eval framework was tuned to flatter the
system. The framework here is calibrated to *find problems*, and the
problems it finds are exactly the work I'd do next.
