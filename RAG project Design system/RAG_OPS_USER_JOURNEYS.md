# RAG Ops — Complete user journey and screen flows

This document maps every user journey through the application. Each journey describes
the screens, states, transitions, interactions, edge cases, and exact copy/content
that should appear. Use this alongside RAG_OPS_DESIGN_SYSTEM.md for visual specs.

---

## Sitemap

```
/search                          ← Default landing page
/dashboard/retrieval             ← Retrieval quality dashboard
/dashboard/generation            ← Generation quality dashboard
/dashboard/metrics               ← Product metrics dashboard
/eval-runs                       ← Eval runs list and comparison
/eval-runs/:id                   ← Single eval run detail
/settings                        ← Configuration and theme toggle
```

---

## Journey 1: First-time search (happy path)

This is the most common journey. A user arrives, asks a question, gets an answer.

### Screen 1.1: Search — empty state

```
URL: /search
WHEN: User first lands on the app, or navigates to Search from sidebar

WHAT THEY SEE:
┌─ Sidebar ─┬──────────────────────────────────────────────┐
│            │                                              │
│  ◈ RAG Ops │       [centered vertically in viewport]      │
│            │                                              │
│  MAIN      │    Ask your knowledge base anything.         │
│  ● Search  │    Search across GitLab handbook and         │
│            │    Stripe documentation                      │
│  EVAL      │                                              │
│  ○ Retrieval│   ┌─ 🔍 ─────────────────── [Search] ─┐   │
│  ○ Generation│  └────────────────────────────────────┘   │
│  ○ Metrics │                                              │
│            │    ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐     │
│  SYSTEM    │    │pill 1│ │pill 2│ │pill 3│ │pill 4│     │
│  ○ Eval runs│   └──────┘ └──────┘ └──────┘ └──────┘     │
│  ○ Settings│                                              │
└────────────┴──────────────────────────────────────────────┘

STATES:
- Search bar: empty, placeholder text visible, auto-focused on page load
- Sidebar: Search nav item is active (accent background)
- Example pills visible below search bar

EXAMPLE PILL CONTENT (4 pills):
  "What is GitLab's PTO policy?"
  "How does Stripe handle webhooks?"
  "Team transfer process at GitLab"
  "Stripe API rate limits"

INTERACTIONS:
- User can type in search bar
- User can click an example pill → fills search bar AND auto-submits
- User can click sidebar nav items to navigate
- Search bar focuses on page load (autofocus)
- Pressing Enter in search bar submits the query
- Clicking the Search button submits the query

EDGE CASES:
- Empty submit (user presses Enter with no text): do nothing, no error
- Very long query (>500 chars): allow it, truncate display if needed
```

### Screen 1.2: Search — loading state

```
WHEN: User submits a query (Enter key or Search button or pill click)

TRANSITION FROM 1.1:
- Search bar moves from center to top of content area (300ms ease animation)
- Example pills fade out and disappear (200ms)
- Heading and subheading fade out (200ms)
- Loading skeleton appears below search bar (fade in 200ms)

WHAT THEY SEE:
┌─ Sidebar ─┬──────────────────────────────────────────────┐
│            │  ┌─ 🔍 What is GitLab's PTO policy? ─────┐ │
│            │  └────────────────────────────────────────┘ │
│            │                                              │
│            │  ┌─ Answer ─────────────────────────────┐   │
│            │  │  ░░░░░░░░░░░░░░░░░░░░░░░ (shimmer)  │   │
│            │  │  ░░░░░░░░░░░░░░░░░░░                 │   │
│            │  │  ░░░░░░░░░░░░░░░░░░░░░░░░░           │   │
│            │  └──────────────────────────────────────┘   │
│            │                                              │
│            │  ┌─░░░░░─┐  ┌─░░░░░─┐  ┌─░░░░░─┐         │
│            │  │shimmer │  │shimmer │  │shimmer │         │
│            │  └────────┘  └────────┘  └────────┘         │
└────────────┴──────────────────────────────────────────────┘

LOADING SKELETON STRUCTURE:
Answer card skeleton:
  - Header: one small rect (40px wide) for "Answer" label
  - Body: 3 rects of varying width (100%, 80%, 90%) for text lines
  - Footer: one small rect for source count
  Shimmer animation: 1.5s infinite

Source card skeletons (3 cards):
  - Small rect for label
  - Thin full-width rect for score bar
  - Two medium rects for text lines

DURATION:
- Typical: 1.5-2.5 seconds
- Maximum before timeout: 15 seconds
- If timeout: show error state (see Edge Cases below)

INTERACTIONS DURING LOADING:
- User can type a new query in the search bar (cancels current request)
- Sidebar navigation still works (navigates away)
- Search button shows a subtle spinner (Loader2 icon, spinning)
```

### Screen 1.3: Search — results displayed

```
WHEN: API returns a successful response with retrieved chunks and generated answer

TRANSITION FROM 1.2:
- Skeleton fades out (150ms)
- Answer card fades in + slides up from 10px below (300ms ease)
- Source cards fade in staggered: 50ms delay between each (300ms each)

WHAT THEY SEE:
┌─ Sidebar ─┬──────────────────────────────────────────────┐
│            │  ┌─ 🔍 What is GitLab's PTO policy?──────┐ │
│            │  └────────────────────────────────────────┘ │
│            │                                              │
│            │  ┌─ Answer ──────────────── 1.8s  ◉ ────┐  │
│            │  │─────────────────────────────────────── │  │
│            │  │                                        │  │
│            │  │  GitLab offers unlimited paid time off  │  │
│            │  │  (PTO) for all team members [Source 1]. │  │
│            │  │  There is no accrual system — team      │  │
│            │  │  members are encouraged to take at      │  │
│            │  │  least 25 days per year [Source 2]...   │  │
│            │  │                                        │  │
│            │  │─────────────────────────────────────── │  │
│            │  │  5 chunks from 3 docs    👍 👎 📋     │  │
│            │  └────────────────────────────────────────┘  │
│            │                                              │
│            │  ┌─Source 1─┐ ┌─Source 2─┐ ┌─Source 3─┐    │
│            │  │  0.82    │ │  0.71    │ │  0.58    │    │
│            │  │  ████░░░ │ │  ███░░░░ │ │  ██░░░░░ │    │
│            │  │  handbook/│ │  handbook/│ │  handbook/│    │
│            │  │  ...      │ │  ...      │ │  ...      │    │
│            │  └──────────┘ └──────────┘ └──────────┘    │
└────────────┴──────────────────────────────────────────────┘

CONTENT IN ANSWER CARD:
- Header left: "Answer" (14px / 500)
- Header right: latency badge (e.g., "1.8s" in mono) + green confidence dot
- Body: generated answer text with inline citation pills [Source 1], [Source 2], etc.
- Footer left: "5 chunks from 3 documents"
- Footer right: thumbs up, thumbs down, copy buttons

SOURCE CARDS:
- Display top 5 retrieved chunks in a 3-column grid (3 top row, 2 bottom row)
- Each card shows: source label, similarity score, score bar, file path, chunk preview, link

INTERACTIONS:
a) Click [Source N] citation in answer:
   → Corresponding source card gets highlighted border (--accent, 1.5px)
   → Page smooth-scrolls to that card if below viewport
   → All other source cards return to default border
   → Clicking same citation again removes highlight

b) Click thumbs up:
   → Button icon turns green, background turns --success-surface
   → Sends PATCH to /api/queries/{id} with user_feedback: "positive"
   → Brief toast appears: "Thanks for your feedback" (auto-dismiss 2s)
   → Button stays green (feedback persists)
   → Thumbs down becomes disabled/dimmed

c) Click thumbs down:
   → Button icon turns red, background turns --danger-surface
   → Shows optional text input below the footer: "What went wrong? (optional)"
   → Input has a small "Submit" button
   → Sends PATCH with user_feedback: "negative" and optional feedback_comment
   → Toast: "Thanks for your feedback"
   → Thumbs up becomes disabled/dimmed

d) Click copy button:
   → Copies the generated answer text to clipboard (without citation markup)
   → Button briefly shows checkmark icon (ti-check, 1s, then reverts to ti-copy)
   → Toast: "Answer copied to clipboard"

e) Click "View original" link on source card:
   → Opens the original URL (handbook.gitlab.com/... or docs.stripe.com/...)
   → Opens in a new tab

f) Submit a new query:
   → Clears current results
   → Returns to loading state (Screen 1.2)
   → Maintains search bar at top (doesn't re-center)

METADATA SHOWN:
- Latency: total query-to-answer time in seconds (1 decimal)
- Confidence dot: green if highest similarity score > threshold, amber if borderline
- Source count: "N chunks from M documents"
- Each source card: similarity score (2 decimals), file path, chunk preview (3 lines max)
```

---

## Journey 2: Search — "I don't know" response

User asks a question the knowledge base cannot answer.

### Screen 2.1: Unanswerable result

```
WHEN: Retriever returns no chunks above the similarity threshold, or all chunks
score below 0.45. Generator returns "I don't have information" response.

WHAT THEY SEE:
┌─ Sidebar ─┬──────────────────────────────────────────────┐
│            │  ┌─ 🔍 Does GitLab sponsor work visas?───┐ │
│            │  └────────────────────────────────────────┘ │
│            │                                              │
│            │  ┌─ Answer ──────────────── 0.9s  ◎ ────┐  │
│            │  │─────────────────────────────────────── │  │
│            │  │                                        │  │
│            │  │  ┌─ ⚠ ─────────────────────────────┐  │  │
│            │  │  │ I don't have enough information  │  │  │
│            │  │  │ in the knowledge base to answer  │  │  │
│            │  │  │ this question. This topic may    │  │  │
│            │  │  │ not be covered in the current    │  │  │
│            │  │  │ documentation.                   │  │  │
│            │  │  └─────────────────────────────────┘  │  │
│            │  │                                        │  │
│            │  │─────────────────────────────────────── │  │
│            │  │  0 relevant chunks found  👍 👎 📋    │  │
│            │  └────────────────────────────────────────┘  │
│            │                                              │
│            │  No source cards displayed.                  │
│            │                                              │
│            │  ┌────────────────────────────────────────┐ │
│            │  │  Try rephrasing your question, or      │ │
│            │  │  browse these related topics:           │ │
│            │  │  ┌──────────┐ ┌──────────┐            │ │
│            │  │  │ Relocation│ │ Employment│            │ │
│            │  │  │ policy    │ │ agreements│            │ │
│            │  │  └──────────┘ └──────────┘            │ │
│            │  └────────────────────────────────────────┘ │
└────────────┴──────────────────────────────────────────────┘

KEY DIFFERENCES FROM HAPPY PATH:
- Confidence dot is AMBER (◎) not green, indicating low confidence
- Warning block inside the answer body:
  Background: --warning-surface
  Border-radius: var(--radius-md)
  Padding: 14px 16px
  Icon: ti-alert-circle, 18px, --warning-text (left of text)
  Text: 13px / --warning-text / line-height: 1.6
- Footer shows "0 relevant chunks found" instead of "5 chunks from 3 docs"
- NO source cards are displayed
- Below the answer card: a "suggestions" section with related topic pills
  These are generated from the closest tangential chunks that WERE retrieved
  but fell below the similarity threshold

SUGGESTION PILLS:
- Extract the section_title from top 3 tangential chunks
- Display as clickable pills (same style as example pills)
- Clicking a pill: fills the search bar with a reformulated question and auto-submits

WHY THIS MATTERS:
This screen is one of the most impressive things in your project.
Most RAG demos hallucinate an answer when they don't have the information.
Your system explicitly says "I don't know" and shows it proudly.
This is a design decision you should highlight in interviews.
```

---

## Journey 3: Navigating to the eval dashboard

### Screen 3.1: Sidebar navigation

```
INTERACTION: User clicks "Retrieval quality" in the sidebar

TRANSITION:
- Active state moves from "Search" to "Retrieval quality"
  Old active: background fades from accent-surface to transparent (200ms)
  New active: background fades to accent-surface (200ms)
- Main content area crossfades (old page fades out 150ms, new page fades in 200ms)
- URL updates to /dashboard/retrieval

NAVIGATION RULES:
- Sidebar is always visible on desktop
- Active nav item has accent-surface background and accent-text color
- Only ONE nav item is active at a time
- Clicking the active nav item does nothing (no refresh)
- Browser back/forward updates sidebar active state to match URL
```

### Screen 3.2: Retrieval dashboard — first load

```
URL: /dashboard/retrieval
WHEN: User navigates here for the first time (or data is loading)

LOADING SEQUENCE (progressive, not blocking):
1. Page header and tab navigation appear immediately (no loading)
2. Eval run selector shows "Loading runs..." with skeleton
3. Metric cards show skeleton loading (4 skeleton cards)
4. As data arrives from Supabase:
   a. Metric cards populate first (they're the fastest query)
   b. Trend chart populates (requires all eval_runs)
   c. Category breakdown populates
   d. Failure explorer populates last (most data)

Each section transitions from skeleton to content independently.
The user sees progressive data arrival, not a single blocking load.

FIRST LOAD WITH NO DATA:
If no eval runs exist yet (eval_runs table is empty):

┌─────────────────────────────────────────────────────┐
│  Retrieval quality                                  │
│  ──────────────────────────────────────────         │
│                                                      │
│         ┌─────────────────────────────┐             │
│         │     📊                       │             │
│         │                             │             │
│         │  No eval runs yet           │             │
│         │                             │             │
│         │  Run your first evaluation  │             │
│         │  suite to see retrieval     │             │
│         │  quality metrics here.      │             │
│         │                             │             │
│         │  python scripts/07_run...   │             │
│         │                             │             │
│         └─────────────────────────────┘             │
│                                                      │
└─────────────────────────────────────────────────────┘

EMPTY STATE SPECS:
- Centered in the content area
- Icon: ti-chart-bar, 40px, --text-tertiary
- Title: "No eval runs yet" (15px / 500 / --text-secondary)
- Description: "Run your first evaluation suite..." (13px / --text-tertiary)
- Code hint: mono font, 12px, --text-tertiary, shows the CLI command
```

### Screen 3.3: Retrieval dashboard — populated

```
WHEN: At least one eval run exists

WHAT THEY SEE:
(See the mockup we built earlier — this describes the exact data flow)

PAGE HEADER:
- Left side:
  Title: "Retrieval quality" (22px / 500)
  Subtitle: "Measuring whether the right chunks are found for each query" (13px / --text-tertiary)
- Right side:
  Tab navigation: [Retrieval] [Generation] [Metrics]
  Eval run selector: dropdown showing current run name

EVAL RUN SELECTOR BEHAVIOR:
- Shows the MOST RECENT eval run by default
- Dropdown lists all runs, newest first
- Each option shows: run_name, date, and a mini P@5 value
- Selecting a run refreshes ALL panels with that run's data
- Transition: panels fade out (100ms), data swaps, panels fade in (200ms)

METRIC CARDS ROW:
- Card 1: Precision@5 — value from eval_runs.retrieval_precision_at_k
  Delta: compared to the PREVIOUS run (if exists). Shows percentage change.
- Card 2: Recall@5 — value from eval_runs.retrieval_recall_at_k
- Card 3: MRR — value from eval_runs.retrieval_mrr
- Card 4: Eval queries — count from eval_runs.total_questions
  Delta badge: shows number of categories (e.g., "5 categories")

TREND CHART:
- Data: all eval_runs, x-axis = run_name, y-axis = retrieval_precision_at_k
- The SELECTED run is highlighted with a larger dot (r: 7 instead of 5)
- Hovering any dot shows tooltip with: run_name, P@5 value, date
- Y-axis range: auto-fit with 10% padding above and below data range
- If only 1 run exists: show a single dot (no line)

CATEGORY BREAKDOWN:
- Data: from eval_results, grouped by category for the selected run
- Calculate average precision_at_k per category
- 5 bars: single_doc, multi_doc, unanswerable, ambiguous, contradictory
- Bars are sorted by value (highest first) — NOT by category name
- Each bar color is set by the score threshold rules

FAILURE EXPLORER:
- Data: eval_results for selected run, sorted by precision_at_k ascending
- Shows the 10 worst-performing questions
- Sub-tab toggles filter the list:
  "Worst P@5": sort by precision_at_k ascending (default)
  "Worst R@5": sort by recall_at_k ascending
  "Unanswerable": filter to category = 'unanswerable' only

INTERACTIONS:
a) Click a metric card:
   → No action (cards are display-only)

b) Hover over trend chart dot:
   → Tooltip appears with run details

c) Click a trend chart dot:
   → Switches the eval run selector to that run
   → All panels update with that run's data

d) Click a failure explorer row:
   → Row expands to show expected vs retrieved chunks
   → Other rows remain collapsed
   → Clicking the expanded row again collapses it
   → Only one row can be expanded at a time

e) Switch sub-tab in failure explorer:
   → List re-sorts/filters
   → Smooth transition (list items fade-swap, 200ms)

f) Click "Retrieval" / "Generation" / "Metrics" tab:
   → Navigates to corresponding dashboard page
   → Eval run selection persists across tabs
```

---

## Journey 4: Generation quality dashboard

### Screen 4.1: Generation dashboard — populated

```
URL: /dashboard/generation
WHEN: User clicks "Generation" tab or sidebar nav

WHAT THEY SEE:

PAGE HEADER: Same structure as retrieval dashboard
TAB NAVIGATION: "Generation" tab is now active

METRIC CARDS:
- Card 1: Avg Faithfulness
  Value: "3.8 / 5" — the "/ 5" part is smaller (16px) and --text-tertiary
  Delta: compared to previous run
- Card 2: Avg Completeness
  Value: "4.1 / 5"
- Card 3: Hallucination Rate
  Value: "18%" — ALWAYS in --danger color, no delta badge
  Description: "18 of 100 questions"
- Card 4: Avg Relevance
  Value: "4.3 / 5"

SCORE DISTRIBUTIONS PANEL:
- Title: "Score distributions"
- Subtitle: "How scores are spread across the 1-5 scale"
- 4-column grid inside the panel body
- Each column: title + histogram
- Histograms show count of questions at each score level
- Special case: Hallucination column shows binary No/Yes bars instead of 1-5

CATEGORY BREAKDOWN:
- Same horizontal bar structure as retrieval
- Metric: average faithfulness_score per category
- Expected pattern: single_doc ~4.2, multi_doc ~3.1, unanswerable ~2.5

GENERATION FAILURE EXPLORER:
- Shows worst generation results (lowest faithfulness_score)
- Each expanded row shows:

  ┌──────────────────────────────────────────────────────┐
  │ "What is the approval threshold for travel expenses?"│
  │ [Contradictory]  Faith: 2.3  Comp: 4.0  Rel: 4.2   │
  │ [Hallucination detected]                             │
  │ ──────────────────────────────────────────────────── │
  │                                                      │
  │ GENERATED ANSWER                                     │
  │ ┌────────────────────────────────────────────────┐  │
  │ │ Travel expenses above $500 require manager      │  │
  │ │ approval. For international travel, VP-level    │  │
  │ │ approval is needed regardless of amount.        │  │
  │ │           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^      │  │
  │ │           (highlighted in danger-surface bg)     │  │
  │ └────────────────────────────────────────────────┘  │
  │                                                      │
  │ JUDGE REASONING                                      │
  │ ┌────────────────────────────────────────────────┐  │
  │ │ The $500 threshold appears in the context,      │  │
  │ │ but the claim about "VP-level approval for      │  │
  │ │ international travel" has no supporting evidence │  │
  │ │ in any retrieved chunk. The model appears to    │  │
  │ │ have generated this from parametric memory.     │  │
  │ └────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────┘

HALLUCINATION HIGHLIGHT:
- The specific hallucinated text is wrapped in a <span> with:
  Background: --danger-surface
  Color: --danger-text
  Padding: 1px 4px
  Border-radius: 4px
- This visual callout is the most compelling feature of the generation dashboard
- It shows exactly WHAT the model fabricated, not just that it did

JUDGE REASONING BLOCK:
- Background: --bg-surface
- Border-radius: var(--radius-md)
- Padding: 14px 16px
- Header: "Judge reasoning" (10px / 500 / uppercase / --text-tertiary)
- Text: 13px / --text-secondary / line-height: 1.6
```

---

## Journey 5: Comparing eval runs

### Screen 5.1: Eval runs list

```
URL: /eval-runs
WHEN: User clicks "Eval runs" in sidebar

WHAT THEY SEE:

PAGE HEADER:
- Title: "Eval runs" (22px / 500)
- Subtitle: "History of all evaluation suite executions"
- Right side: "Compare runs" toggle button (outlined button style)

TABLE:
┌──────────────┬───────────┬──────┬──────┬───────┬──────────┬─────────┐
│ Run name     │ Date      │ P@5  │ R@5  │ Faith.│ Halluc.  │ Config  │
├──────────────┼───────────┼──────┼──────┼───────┼──────────┼─────────┤
│ tuned        │ 2 hrs ago │ 0.74 │ 0.81 │ 3.8   │ 18%      │ 🔍      │
│ hybrid       │ yesterday │ 0.73 │ 0.80 │ 3.7   │ 20%      │ 🔍      │
│ chunk_1024   │ 2 days ago│ 0.71 │ 0.79 │ 3.5   │ 22%      │ 🔍      │
│ +reranker    │ 3 days ago│ 0.74 │ 0.81 │ 3.8   │ 18%      │ 🔍      │
│ baseline     │ 5 days ago│ 0.68 │ 0.78 │ 3.5   │ 24%      │ 🔍      │
└──────────────┴───────────┴──────┴──────┴───────┴──────────┴─────────┘

TABLE SPECS:
- Header row: 11px / 500 / uppercase / --text-tertiary / --bg-surface background
- Data rows: 13px / 400 / --text-primary
- Alternating row backgrounds: transparent and --bg-surface (subtle)
- Numeric values in --font-mono
- Hallucination column always in --danger color
- Config column: clickable icon that shows a popover with the full config JSON
- Rows are clickable → navigates to /dashboard/retrieval?run={id}

COMPARE MODE:
When user clicks "Compare runs" button:
- Table gets a checkbox column on the left
- User can select exactly 2 runs
- When 2 are selected, a "Compare" button appears at top
- Clicking "Compare" navigates to a comparison view

INTERACTIONS:
a) Click a row:
   → Navigate to /dashboard/retrieval?run={run_id}
   → Dashboard shows data for that specific run

b) Click config icon:
   → Popover appears showing the full config JSON for that run
   → Shows: chunk_size, overlap, embedding_model, retriever_k, etc.
   → Popover dismisses on click outside

c) Compare mode:
   → Check 2 runs → "Compare" button activates
   → Navigate to comparison view (see Screen 5.2)
```

### Screen 5.2: Eval run comparison

```
URL: /eval-runs/compare?a={id1}&b={id2}
WHEN: User selects 2 runs and clicks "Compare"

WHAT THEY SEE:

PAGE HEADER:
- Title: "Comparing: baseline vs +reranker"
- Back link: "← Back to eval runs"

SIDE-BY-SIDE METRIC CARDS:
┌────────────────────────────────────────────────┐
│              baseline    │    +reranker         │
├────────────────────────────────────────────────┤
│ Precision@5    0.68      │      0.74  (+0.06)  │
│ Recall@5       0.78      │      0.81  (+0.03)  │
│ MRR            0.71      │      0.69  (-0.02)  │
│ Faithfulness   3.5       │      3.8   (+0.3)   │
│ Halluc. rate   24%       │      18%   (-6%)    │
└────────────────────────────────────────────────┘

Config differences highlighted:
┌────────────────────────────────────────────────┐
│ WHAT CHANGED:                                  │
│ reranker_enabled: false → true                 │
│ (all other config values identical)            │
└────────────────────────────────────────────────┘

OVERLAID TREND CHART:
- Both runs shown on the same chart as separate lines
- Run A: solid line, --accent color
- Run B: dashed line, --info color
- Legend shows both run names

CATEGORY COMPARISON:
- Side-by-side horizontal bars for each category
- Run A bar on top, Run B bar below, within each category row
- Shows which categories improved and which regressed

FAILURE COMPARISON:
- Table of questions where the two runs differ most
- Columns: Question, P@5 (Run A), P@5 (Run B), Delta
- Sorted by absolute delta (biggest improvements and regressions first)
- Green highlight for improvements, red for regressions
```

---

## Journey 6: Product metrics dashboard

### Screen 6.1: Product metrics — populated

```
URL: /dashboard/metrics
WHEN: User clicks "Metrics" tab or sidebar nav

METRIC CARDS:
- Total queries (count from queries table for selected date range)
- Satisfaction rate (positive / (positive + negative) × 100)
- Avg latency (average latency_ms from queries table)
- Follow-up rate (% of queries followed by another query within 60s)

DATE RANGE SELECTOR:
- Positioned in the page header, right side
- Options: "Last 7 days", "Last 30 days", "All time"
- Styled as a segmented control (same as tab navigation)

CHARTS:
Panel 1: Daily query volume
  - Bar chart (not line) — each bar is one day
  - X-axis: dates, Y-axis: query count
  - Bar color: --accent

Panel 2: Satisfaction trend
  - Line chart: daily satisfaction rate %
  - Y-axis: 0-100%
  - Line color: --accent
  - Show a horizontal reference line at 80% (target) in --border-light with label

Panel 3: Average latency trend
  - Line chart: daily average latency in ms
  - Y-axis: auto-scaled
  - Line color: --warning if above target, --accent if below
  - Reference line at 2000ms (target)

EMPTY STATE (no queries logged yet):
- Same empty state pattern as retrieval dashboard
- Message: "No queries logged yet. Ask some questions on the Search page
  to start seeing product metrics."
```

---

## Journey 7: Settings

### Screen 7.1: Settings page

```
URL: /settings
WHEN: User clicks "Settings" in sidebar

SECTIONS:

1. APPEARANCE
   - Theme toggle: "Light" / "Dark" segmented control
   - On toggle: all CSS variables swap instantly via data-theme attribute
   - Current theme shown as active

2. DATA SOURCES
   - Read-only list showing:
     "GitLab Handbook — 2,847 documents, 12,340 chunks"
     "Stripe Documentation — 683 documents, 4,201 chunks"
   - Last ingested timestamp
   - "Re-ingest" button (triggers the ingestion pipeline)

3. EVAL CONFIGURATION
   - Current config displayed as a formatted JSON block:
     chunk_size, overlap, embedding_model, retriever_k, threshold, etc.
   - Read-only (config is set via CLI, not UI)
   - "Copy config" button

4. ABOUT
   - "RAG Ops v1.0"
   - "Built as an AI product management portfolio project"
   - Link to GitHub repo
   - Link to case study blog post
```

---

## Journey 8: Edge cases and error states

### 8.1: API error on search

```
WHEN: The query endpoint returns a 500 error or times out (>15s)

WHAT THEY SEE:
Answer card appears with error state:
  ┌─ Answer ──────────────────────────────────┐
  │                                            │
  │  ┌─ ⚠ ──────────────────────────────────┐ │
  │  │ Something went wrong while searching. │ │
  │  │ Please try again in a moment.         │ │
  │  └──────────────────────────────────────┘ │
  │                                            │
  │  [Try again]                              │
  └────────────────────────────────────────────┘

ERROR BLOCK:
- Background: --danger-surface
- Text: --danger-text
- "Try again" button: outlined style, --danger border

BEHAVIOR:
- "Try again" re-submits the same query
- Error is logged to console for debugging
- No source cards are shown
```

### 8.2: Supabase connection error on dashboard

```
WHEN: Dashboard can't fetch data from Supabase

WHAT THEY SEE:
- Metric cards show "--" instead of values
- Charts show empty state with message:
  "Unable to load data. Check your Supabase connection."
- A retry button appears in the page header

BEHAVIOR:
- Auto-retry once after 3 seconds
- If still failing: show the error state with manual retry button
- Sidebar navigation still works
```

### 8.3: Gemini rate limit during eval run

```
This happens server-side, not in the UI. But the eval run table should show:

STATUS COLUMN in eval runs table:
  "completed" — green badge
  "running" — amber badge with animated dot
  "failed" — red badge
  "rate_limited" — amber badge with message

If a run is in progress: show a progress indicator in the dashboard
"Eval run in progress: 47 / 100 questions evaluated (estimated 12 min remaining)"
```

### 8.4: Long answer overflow

```
WHEN: Generated answer is very long (>500 words)

BEHAVIOR:
- Answer card body shows first 300 words
- "Show full answer" link at the bottom of the truncated text
- Clicking expands to full answer with smooth height animation
- "Show less" link appears when expanded
- Citation pills work the same whether collapsed or expanded
```

### 8.5: No matching source for citation

```
WHEN: A [Source N] citation doesn't map to any retrieved chunk (data inconsistency)

BEHAVIOR:
- Citation pill renders in --text-tertiary with --bg-surface background
- Clicking it does nothing (no highlight, no scroll)
- Tooltip on hover: "Source not available"
```

---

## Journey 9: Keyboard navigation and accessibility

```
TAB ORDER:
1. Sidebar nav items (top to bottom)
2. Search bar input
3. Search button
4. Example pills (left to right)
5. Answer card feedback buttons
6. Source card "View original" links
7. Dashboard controls (tab nav, run selector)

KEYBOARD SHORTCUTS:
- / (forward slash): focus the search bar from anywhere
- Escape: clear search bar focus, close expanded failure rows
- Enter: submit search, expand/collapse failure row if focused
- Arrow keys in eval run dropdown: navigate options
- Enter in dropdown: select option

ARIA LABELS:
- Search bar: aria-label="Search the knowledge base"
- Feedback buttons: aria-label="Rate this answer as helpful" / "...unhelpful"
- Copy button: aria-label="Copy answer to clipboard"
- Metric cards: aria-label="Precision at 5: 0.74, up 12% from baseline"
- Chart canvas: aria-label describing the chart content
- Source cards: aria-label="Source 1, similarity score 0.82, from handbook finance expenses"
- Failure explorer rows: aria-expanded="true/false"

SCREEN READER:
- All metric values have sr-only context (e.g., "0.74 out of 1.0")
- Charts have fallback text descriptions
- Color-coded elements have text equivalents (don't rely on color alone)
```

---

## State management summary

```
GLOBAL STATE (persists across page navigation):
- selectedEvalRunId: the currently selected eval run (default: most recent)
- theme: "light" or "dark" (persisted in localStorage)

PAGE STATE (resets on navigation):
- searchQuery: current search text
- searchResults: answer + chunks from latest query
- feedbackState: { positive: bool, negative: bool, comment: string }
- expandedFailureId: which failure row is currently expanded

DATA FETCHING:
- Dashboard data is fetched when the page mounts OR when selectedEvalRunId changes
- Search results are fetched on query submit
- Product metrics are fetched when date range changes
- Use SWR or React Query for caching and deduplication
- Stale-while-revalidate: show cached data immediately, fetch fresh in background
```

---

## URL routing and deep linking

```
/search                              → Search page (empty state)
/search?q=what+is+gitlab+pto         → Search page with auto-submitted query
/dashboard/retrieval                  → Retrieval dashboard (latest run)
/dashboard/retrieval?run=abc-123     → Retrieval dashboard for specific run
/dashboard/generation                → Generation dashboard (latest run)
/dashboard/generation?run=abc-123   → Generation dashboard for specific run
/dashboard/metrics                   → Product metrics (default: last 7 days)
/dashboard/metrics?range=30d         → Product metrics with date range
/eval-runs                           → Eval runs list
/eval-runs/compare?a=id1&b=id2     → Comparison view
/settings                            → Settings page

DEEP LINKING:
- All dashboard pages support ?run= parameter for direct linking to a specific eval run
- /search supports ?q= parameter for pre-filled queries
- Sharing a URL should reproduce the exact view
```

---

## Animation and transition summary

```
PAGE TRANSITIONS:
- Navigate between pages: content fade (old 150ms out, new 200ms in)
- Sidebar active state: background color transition 200ms ease

SEARCH FLOW:
- Empty → Loading: search bar slides up 300ms, pills fade 200ms, skeleton fades in 200ms
- Loading → Results: skeleton fades 150ms, answer slides up + fades in 300ms,
  source cards stagger in (50ms delay between each, 300ms per card)

DASHBOARD:
- Run selector change: panels fade out 100ms, data swaps, panels fade in 200ms
- Metric values: count-up animation from 0 to target, 500ms
- Bar chart fills: width from 0 on mount, 400ms ease-out
- Trend chart: line draws from left to right on mount, 600ms
- Failure row expand: max-height + opacity, 250ms ease
- Failure row chevron: rotate 90deg, 200ms ease

MICRO-INTERACTIONS:
- Button hover: background transition 150ms
- Card hover: border-color transition 200ms
- Citation pill hover: background darkens 150ms
- Feedback button click: icon + bg color swap 200ms, then static
- Copy button: icon swaps to checkmark, 1s, then swaps back
- Toast: slides in from bottom-right 300ms, auto-dismiss after 2s with fade 300ms
```

---

## Toast notification system

```
POSITION: bottom-right corner, 24px from edges
STACK: newest on top, max 2 visible at once

STRUCTURE:
┌──────────────────────────────┐
│  ✓  Thanks for your feedback │
└──────────────────────────────┘

SPECS:
- Background: --bg-card
- Border: 0.5px solid --border-light
- Border-radius: var(--radius-lg)
- Padding: 12px 16px
- Font: 13px / 500 / --text-primary
- Icon: 16px, --success for positive, --danger for errors
- Shadow: subtle for visibility against page background

TRIGGERS:
- Feedback submitted: "Thanks for your feedback" (success icon)
- Answer copied: "Answer copied to clipboard" (success icon)
- Error: "Something went wrong" (danger icon)
- Eval run started: "Eval run started" (info icon)

BEHAVIOR:
- Appears: slide up from below + fade in (300ms)
- Auto-dismiss: 2 seconds
- Disappears: fade out (300ms)
- User can click to dismiss early
- No close button (auto-dismiss is sufficient)
```

---

## Data flow: what gets logged

For every user interaction, here is what gets written to Supabase.
This is important because the product metrics dashboard reads from these logs.

```
ON SEARCH SUBMIT:
→ Insert into `queries` table:
  question, retrieved_chunk_ids, retrieved_scores,
  generated_answer, citations, model_used, latency_ms
  (user_feedback is null initially)

ON FEEDBACK (thumbs up/down):
→ Update `queries` row:
  user_feedback = "positive" or "negative"
  feedback_comment = optional text (on thumbs down only)

ON PAGE VIEW (dashboard):
→ No logging (dashboards are read-only views of eval data)

DAILY AGGREGATION (background job or on-demand):
→ Compute and insert into `product_metrics`:
  total_queries, positive_feedback_count, negative_feedback_count,
  avg_latency_ms, followup_rate, copy_rate
  (Aggregated from `queries` table for that date)
```
