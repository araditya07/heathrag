# HealthRAG — 5-minute Loom walkthrough script

A scene-by-scene script for recording a Loom (or any screen-capture) demo.
The goal: a recruiter or hiring manager can watch this once and understand
what was built, what's measurable about it, and why each design choice
was deliberate.

**Total target time: 5:00. Aim for 4:30 of content + 30 sec buffer.**

Before you record, open these in tabs in a single browser window:

1. https://heathrag.vercel.app/search
2. https://heathrag.vercel.app/dashboard/retrieval
3. https://heathrag.vercel.app/dashboard/generation
4. https://heathrag.vercel.app/dashboard/guardrails
5. https://github.com/araditya07/heathrag (for the source pointer at the end)

Have the sample lab-report PDF ready to drag in (the Sterling Accuris file).

---

## 0:00 – 0:25 · The pitch (text-only, voice-over)

> **Open on Search page idle state.**
>
> "This is HealthRAG. It's an AI health-information companion built around
> three deliberate constraints: it has to refuse to diagnose, always show
> a medical disclaimer, and flag critical lab values prominently. The
> whole stack runs on $0 a month — Vercel, Hugging Face Spaces, Supabase
> free tiers — and the entire eval framework is the thing I'm most proud
> of, so I'll spend most of this video on that."

Visual cues:
- The DemoNotice banner is visible at the top → mention "this is a portfolio
  demonstration, not a real medical tool"
- Hero text "Understand your health, backed by real guidelines"

---

## 0:25 – 1:00 · Generic search

> **Type into the search bar**: `What are the symptoms of Type 2 diabetes?`
>
> "First, a generic question with no uploaded report. The system embeds
> the query locally with sentence-transformers, retrieves top chunks from
> Supabase pgvector, reranks with a CPU cross-encoder, and only THEN
> calls Gemini for generation. The answer comes back with cited sources
> and the mandatory disclaimer."

Pause briefly on:
- The `[Source N]` citation pills (clickable, scroll to source cards)
- The grey/amber/green similarity-score bar on each source card
- The disclaimer banner below the answer
- The footer showing `gemini-2.5-flash` and latency

---

## 1:00 – 1:45 · Upload + personalized answer

> **Drag the sample lab report PDF onto the upload zone.**
>
> "Now I upload a real lab report — Sterling Accuris format. pdfplumber
> extracts the text, our parser hits 20 parameters from this PDF. Notice
> the 'Personalized' badge appears inside the search bar. The 'Your
> values' card shows the user's actual lab data. The narrative summary —
> this one's generated deterministically, no LLM call — tells the user
> at a glance what's outside normal range."

Visual cues to land on:
- HealthNarrativeSummary card with counts (e.g. "20 parameters · 5 outside
  normal · 0 critical")
- HealthSummaryCard table with status badges (high / low / normal)
- "Personalized" mint pill in the search bar

> **Type**: `Summarize my report`
>
> "Now the same question, but with the report in scope. The answer cites
> specific numbers — Your HbA1c of 7.1%, Your fasting glucose of 141 mg/dL
> — and references the standard ranges via [Source N]. Those numbers in
> the answer body get a mint highlight because they came from the user's
> own data."

---

## 1:45 – 2:15 · The diagnosis-refusal guardrail

> **In the chat panel on the right**, type: `Am I diabetic?`
>
> "The interesting part. With a report uploaded showing HbA1c=7.1%, the
> system has every reason to say 'yes, your numbers indicate diabetes' —
> and that's exactly what it must NOT do. Watch the blue refusal block
> at the top of the answer."

Pause on:
- The blue refusal block ("I cannot diagnose medical conditions…")
- The factual range information that follows ("Your HbA1c falls in the
  diabetic range")
- The distinction between "you have diabetes" (diagnosis — never) and
  "your HbA1c falls in the diabetic range" (factual — always allowed)

> "The refusal block is intentionally **blue, not red**. Red would
> communicate 'something went wrong'; but the system declining to diagnose
> is the system **working correctly**. Blue says: I'm being responsible
> by not overstepping."

---

## 2:15 – 3:30 · The eval dashboards

> **Navigate to `/dashboard/retrieval`.**
>
> "This is the part that's different from most portfolio RAG projects.
> The system has a three-layer eval framework — retrieval, generation,
> guardrails — and each has its own dashboard."

### 2:30 – 3:00 · Retrieval

> "Headline metrics: Precision@5, Recall@5, MRR, on a 50-question golden
> dataset. Each question carries expected URL prefixes and keywords for
> the ground-truth match.
>
> The most interesting thing here is in the by-category breakdown.
> `contradictory` and `multi_doc` are high because their expected URLs
> are broad — many chunks match. `single_doc` is weak because exact-fact
> questions need the corpus to actually contain the page. `unanswerable`
> is **zero on purpose** — we want the system to return *nothing* for
> these queries, but at threshold 0.20 chunks still slip through.
>
> I built a separate tool that sweeps thresholds 0.18 to 0.50 — at 0.50,
> unanswerable handling jumps from 0/4 to 4/4, but precision drops 26%.
> That's the precision/recall/safety tradeoff curve, visible and
> actionable."

### 3:00 – 3:30 · Generation + Guardrails (briefly)

> **Click /dashboard/generation, then /dashboard/guardrails.**
>
> "Generation eval is LLM-as-judge — faithfulness, completeness, medical
> accuracy, hallucination rate. Guardrails is the differentiator:
> disclaimer compliance, refusal-to-diagnose rate, critical-value
> detection rate. The guardrail grader is deterministic regex matching
> on the generated answer — no LLM call, so it's reproducible and cheap.
>
> Each dashboard has a failure explorer. For guardrails, the failure
> rows show *expected behavior vs actual response* with the problematic
> text highlighted. That's the artifact I'd point at in an interview
> when someone asks 'how do you know this system is safe?'"

---

## 3:30 – 4:00 · The bug that proved the framework was worth building

> **Switch to the GitHub repo, scroll to the commit `Fix eval dashboards`.**
>
> "Quick story. First time I ran the full eval, Precision@5 came back as
> 0.04. That's broken. I assumed the corpus was bad — was going to scrape
> more pages, tune the model. Then I looked at the grader. It was doing
> exact-string membership on URL prefixes. So a chunk URL like
> `cdc.gov/diabetes/about/index.html` could never match the expected
> prefix `cdc.gov/diabetes/`. Literally would never return True.
>
> One-line fix: `startswith()` instead of `in`. After: Precision@5 = 0.244.
> A 6.1× lift from one line of code — but I only knew the lift was real
> because the eval framework produced a *visible*, comparable number.
> That's the whole argument for building the framework first."

---

## 4:00 – 4:45 · Tour the responsible-AI choices

> **Back to the Search page. Type:** `What is the Ayurvedic cure for cancer?`
>
> "An adversarial question. The corpus doesn't cover this. The system
> says 'I don't have information on this topic' rather than making
> something up. No retrieved sources, no hallucinated answer."

> **Now upload a synthetic critical-value report** *(if you have one;
> otherwise skip)*.
>
> "When a critical lab value is present, the warning appears in three
> places — a standalone alert card with a 2-pixel red border, the opening
> line of the answer in a red callout, and the status badge in the values
> card. Deliberate redundancy. A potentially life-threatening lab value
> should be impossible to miss."

---

## 4:45 – 5:00 · Close + links

> **Show the GitHub repo and the live URL in the address bar.**
>
> "The code's at github.com/araditya07/heathrag. The case study writeup
> is in docs/CASE_STUDY.md. Everything I just showed runs on $0 a month
> of cloud spend, and the eval framework — three layers, 50 golden
> questions, deterministic guardrail checks plus LLM-as-judge for
> generation — is the thing I'd want a hiring manager to look at first."

End on the README open in a tab with the metrics table visible.

---

## Recording tips

- **Speak slower than feels natural.** Aim for ~150 words per minute.
- **Don't read the script verbatim.** It's a structure, not a teleprompter.
- **One take, accept imperfections.** Demos are forgiving; over-polished
  videos look fake.
- **Keep the cursor moving.** Static screens lose attention fast.
- **Resolution: at least 1080p**. Loom defaults are fine.
- **Audio matters more than video.** Use headphones with a mic if you
  can; built-in laptop mics are noisier than people realize.

## After recording

- Upload to Loom (or YouTube unlisted)
- Update README.md with the video link in the top table
- Update docs/CASE_STUDY.md with a "Watch the demo" section at the top
- Add to your resume's "AI/ML projects" section: just the title, one
  sentence, and the link.

## What NOT to demo

- The Eval Runs page — it's a stub and would weaken the story.
- The Metrics page — same.
- Deep dives into the upload pipeline or PDF parser — interesting
  technically but doesn't tell the high-level story.
- Code reading — the case study writeup does that better.
