# Handoff: HealthRAG

## Overview

**HealthRAG** is an AI health-information companion that lets users ask questions about symptoms, medicines, nutrition, and lab values — and optionally upload a lab report (PDF) for personalized answers grounded in WHO, CDC, NIH, and Indian health guidelines (NHM, FSSAI, ICMR, CDSCO).

The product takes a strong, principled stance on safety: it **refuses to diagnose**, **always shows a medical disclaimer**, **flags critical lab values prominently**, and **says "I don't know" when the knowledge base doesn't cover a topic** rather than hallucinating. A dedicated "Guardrails" evaluation dashboard measures whether these safety rules fire correctly across eval runs.

This handoff covers the entire frontend: 7 top-level routes, all loading/empty/error states, the upload flow, every guardrail variant of the answer card, and the four eval dashboards.

## About the Design Files

The files under `design_reference/` are **design references created in HTML** — a runnable React+Babel prototype showing the intended look and behavior. **They are not production code to copy directly.**

The task is to recreate these designs in the target codebase's existing environment (React + TypeScript + your styling system of choice). If no environment exists yet, the spec was authored against React + Vite + plain CSS variables.

To preview: open `design_reference/index.html` in a browser (or run a static file server in that folder).

## Fidelity

**High-fidelity.** Final colors, typography, spacing, radii, transitions, copy, and information architecture. Treat tokens, animation durations, and microcopy as locked.

Non-final aspects:
1. **Icons** — Tabler Icons webfont in the mock; swap to `lucide-react` in production.
2. **Charts** — hand-rolled SVG; replace with Recharts / Visx / nivo while preserving visual specs (accent line, target reference lines at 95% / 100%, current-run highlight with halo).
3. **PDF parsing** — the mock simulates lab-report extraction with sequential progress messages and a fixed mock dataset. Real implementation needs a server-side PDF text extractor + a parameter parser keyed to common Indian lab formats (Thyrocare, Dr Lal, Apollo, SRL, Metropolis, etc.).

---

## Architecture overview

```
URL                              Page component
/search                          SearchPage            (default landing)
/dashboard/retrieval             RetrievalPage
/dashboard/generation            GenerationPage
/dashboard/guardrails            GuardrailsPage        (NEW vs RAG Ops)
/dashboard/metrics               MetricsPage
/eval-runs                       EvalRunsPage
/eval-runs/compare?a=&b=         EvalRunsPage → CompareView
/settings                        SettingsPage
```

**Persistent app shell:** sidebar (left, 220 px, sticky, full-height, HealthRAG-branded with heartbeat icon) + main content area (`--bg-page` background, 24/28 px padding, content max-width capped).

---

## Global state

```ts
type GlobalState = {
  // Persisted across navigation
  selectedEvalRunId: string;      // default: most-recent run
  theme: 'light' | 'dark';        // persisted in localStorage('rag-ops-theme')
  sessionId: string;              // generated on first visit, persisted in localStorage

  // Health-specific session state
  uploadedReport: HealthReport | null;
  criticalFlags: CriticalFlag[];   // derived from report
  isPersonalizedMode: boolean;     // true when report is uploaded
};

type HealthReport = {
  filename: string;
  uploadedAt: string;               // ISO timestamp
  values: HealthParameter[];        // every extracted lab parameter
  criticalFlags: CriticalFlag[];    // values exceeding critical thresholds
  totalValues: number;
};

type HealthParameter = {
  name: string;                     // 'Hemoglobin', 'HbA1c', 'LDL', etc.
  value: string;                    // numeric string (preserves trailing zeros)
  unit: string;                     // 'g/dL', 'mg/dL', 'mEq/L', etc.
  status: 'normal' | 'high' | 'low' | 'critical';
  range: string;                    // human-readable reference range
};

type CriticalFlag = {
  name: string;
  value: string;
  unit: string;
  threshold: string;                // e.g. '> 6.0 mEq/L'
};
```

---

## Design tokens

Tokens are defined in `design_reference/src/colors_and_type.css` under `:root[data-theme="light"]` and `:root[data-theme="dark"]`. Port one-for-one.

### Color tokens (light theme)

| Token | Value | Use |
|---|---|---|
| `--bg-page`    | `#F7F7F5` | Page background — warm off-white, NOT pure white |
| `--bg-card`    | `#FFFFFF` | Floating cards & panels |
| `--bg-surface` | `#F1EFE8` | Metric cards, inputs, inset areas |
| `--bg-hover`   | `#ECEAE3` | Hover state on surfaces |
| `--text-primary`   | `#1A1A1A` | Body text |
| `--text-secondary` | `#5F5E5A` | Secondary copy |
| `--text-tertiary`  | `#9B97A0` | Labels, metadata |
| `--accent`            | `#0F6E56` | Primary CTAs, active nav, trend lines — **used sparingly** |
| `--accent-hover`      | `#085041` | Button hover |
| `--accent-surface`    | `#E1F5EE` | Citation pills, "Your values" card, "Personalized" badge |
| `--accent-text`       | `#085041` | Text on accent-surface |
| `--accent-text-light` | `#0F6E56` | Inline accent links, upload nudge |
| `--success` | `#0F6E56`, `--success-surface` `#E1F5EE`, `--success-text` `#085041` |
| `--warning` | `#BA7517`, `--warning-surface` `#FAEEDA`, `--warning-text` `#633806` — used for "high"/"low" status badges |
| `--danger`  | `#D04F4F`, `--danger-surface`  `#FBE7E7`, `--danger-text`  `#7A1F1F` — used for critical values and the 2 px alert border |
| `--info`    | `#3A6EA5`, `--info-surface`    `#E2ECF8`, `--info-text`    `#1F3F66` — **used for refusal block** (not red) |
| `--purple`  | `#6B47B5`, `--purple-surface`  `#EBE2FA`, `--purple-text`  `#3F2480` |

The full set lives in `design_reference/src/colors_and_type.css`.

### Borders & radii

- Borders: `0.5px solid var(--border-light)`. Hover bumps to `--border-medium`. Active uses `--border-active` (= accent).
- **Exception: the critical-value alert uses a 2 px solid `--danger` border — the only 2 px border in the system.** It signals urgency without flooding the page with red.
- Radii: `--radius-sm 6px` · `--radius-md 10px` · `--radius-lg 12px` · `--radius-xl 16px` · `--radius-pill 999px`.

### Shadows

Light theme uses no card shadows. Dark theme may use subtle shadow. Critical alert + toast use `0 8px 24px rgba(20,20,20,0.06)`. Confirm dialog overlay uses `0 16px 48px rgba(20,20,20,0.16)`.

### Typography

```
Display body: Plus Jakarta Sans (400, 500, 600). 600 only for page titles.
Numbers / paths / latencies / citations: JetBrains Mono (400, 500).
```

No font-weight 700. Body text always left-aligned.

**Scale:**
- Page title: 22 px / 500
- Hero title (search empty): 22 px / 500 / -0.01em
- Card label (UPPERCASE): 11 px / 500 / 0.03em letter-spacing
- Metric value: 24 px / 500 / mono / line-height 1
- Body / answer text: 14 px / line-height 1.8
- Status badge: 11 px / 500 (12 px / 600 for `critical`)
- Mini-label (uppercase): 10 px / 500 / 0.05em

### Spacing

4 px base. Common rhythm: 4 / 8 / 12 / 16 / 20 / 24 / 28 / 36.

### Iconography

Tabler Icons webfont in the mock; production should use `lucide-react`.

| Use | Tabler class | Lucide React |
|---|---|---|
| Brand (sidebar logo) | `ti-heartbeat` | `Activity` (or custom) |
| Search | `ti-search` | `Search` |
| Retrieval | `ti-chart-bar` | `BarChart3` |
| Generation | `ti-message-chatbot` | `MessageSquareText` |
| Guardrails | `ti-shield-check` | `ShieldCheck` |
| Metrics | `ti-activity` | `Activity` |
| Eval runs | `ti-list-check` | `ListChecks` |
| Settings | `ti-settings` | `Settings` |
| Upload | `ti-file-upload` | `FileUp` |
| Lab report file | `ti-file-text` | `FileText` |
| Privacy / session | `ti-lock` | `Lock` |
| Disclaimer | `ti-stethoscope` | `Stethoscope` |
| Critical alert (lead) | `ti-alert-triangle` | `AlertTriangle` |
| Refusal block | `ti-shield-check` | `ShieldCheck` |
| IDK warning | `ti-alert-circle` | `AlertCircle` |
| Status: normal | `ti-check` | `Check` |
| Status: high | `ti-arrow-up` | `ArrowUp` |
| Status: low | `ti-arrow-down` | `ArrowDown` |
| Status: critical | `ti-alert-triangle` | `AlertTriangle` |
| Theme toggle | `ti-sun` / `ti-moon` | `Sun` / `Moon` |

**Icon sizes:** nav 17 px · inline-with-text 15 px · status badge 11–12 px · standalone 18–20 px · critical-alert lead 20 px · empty states 28–40 px.

**No emoji. No unicode-as-icon.**

### Animation

- Color / border / background: `200ms ease`
- Layout changes: `300ms ease`
- Chart mount, bar fills: `400ms ease-out`
- Failure-row expand: `250ms ease`
- Search results entry: fade-up from 10 px, `300ms`, staggered 60 ms per source card
- Critical alert mount: slide-down + fade, `350ms ease`
- Upload progress: progress bar width `300ms ease`, step text swaps instantly
- Toast in/out: `300ms ease`
- Skeleton shimmer: `1.5s ease-in-out infinite`

**No bouncy / spring / overshoot animations.**

---

## Components inventory

Implement these as named, typed components. The mock has them split between `design_reference/src/components.jsx`, `extras.jsx`, and the HealthRAG-specific `health_components.jsx`.

### Layout & navigation (shared with RAG Ops)
- **`<Sidebar>`** — 220 px wide, sticky, full-height. HealthRAG logo (heartbeat icon + wordmark). 3 nav sections (Main / Evaluation / System). Active item gets `--accent-surface` bg + `--accent-text` text.
- **`<PageHeader>`** — title + subtitle + optional run selector / tabs.
- **`<Panel>`** — white card, `0.5px` border, `--radius-xl`, no shadow. `panel-header` (16/20 padding) + `panel-body` (18/20 padding).

### Search-page components

- **`<UploadZone>`** — dashed-border dropzone (`1px dashed --border-medium`), `--radius-lg`, 14/18 padding. Icon `ti-file-upload` (20 px) + label "Upload your lab report (PDF) for personalized answers" + meta "Stays in your session · deleted in 24 h · max 10 MB". Hover/drag-over: border-color `--accent`, background `--accent-surface`, icon `--accent`. Validates `.pdf` only, ≤ 10 MB; inline error appears below for 5 s on rejection.
- **`<UploadProgress>`** — replaces the zone during processing. Filename row (`ti-file-text` + name + percentage mono), progress track (6 px tall, 999 px radius, `--bg-surface` track, `--accent` fill), status row (12 px spinner + label). Steps cycle through:
  1. Uploading file…
  2. Extracting text from PDF…
  3. Identifying lab parameters…
  4. Matching against reference ranges…
  5. Checking for critical values…
  Each step duration 600–900 ms in the mock; real implementation should drive these off actual progress events.
- **`<HealthSummaryCard>`** — white panel, `--radius-xl`. Header: "Your lab results" + filename + close (X) button. Body: list of `<ParameterRow>` (top 8 by default, "+N more values" toggle expands). Footer: "{N} values extracted · {M} outside normal range" on the left, "🔒 Session only · deleted in 24 h" on the right.
- **`<ParameterRow>`** — `display: grid; grid-template-columns: 1fr auto auto;` 10/20 padding, bottom border. Three columns: parameter name (13/500) · value+unit (mono, value in `--text-secondary`, unit in `--text-tertiary` 11 px) · status badge.
  - **Critical rows get a `--danger-surface` background tint** across the entire row.
- **`<StatusBadge>`** — pill, min-width 78 px, centered, `min-content` height. Variants:
  - `normal`: `--success-surface` bg, `ti-check` + "normal"
  - `high`: `--warning-surface` bg, `ti-arrow-up` + "high"
  - `low`: `--warning-surface` bg, `ti-arrow-down` + "low"
  - `critical`: `--danger-surface` bg, **font-weight 600, 12 px, 4/12 padding** (visually heavier than the others), `ti-alert-triangle` + "critical"
- **`<CriticalAlert>`** — slides in above the summary or above the answer (`role="alert"`, `aria-live="assertive"`). **2 px solid `--danger` border** (the only 2 px border in the system), `--danger-surface` bg, `--radius-lg`, 16/20 padding. Lead icon `ti-alert-triangle` (20 px, `--danger-text`). Title "Critical value detected" (15/500), message ("Your {param} ({value} {unit}) is above the critical threshold ({threshold}). Please seek medical attention promptly."), small note in `--text-secondary` ("automated alert based on standard medical thresholds, not a diagnosis"). For 2+ critical values, list them: "Multiple critical values detected: …".
- **`<Disclaimer>`** — banner below every answer card (`role="note"`, `aria-label="Medical disclaimer"`). `--bg-surface` bg, `--radius-md`, 12/16 padding. `ti-stethoscope` icon (16 px) + text: "This information is for educational purposes only and is not medical advice. Please consult a qualified healthcare professional for personalized guidance." **MANDATORY on every answer**, including IDK and refusal. Not dismissable.
- **`<UploadNudge>`** — inline prompt below the disclaimer on generic answers. `--accent-text-light` text, `ti-file-upload` icon, clickable. Text: "Upload your lab report for personalized answers based on YOUR health data →". Disappears once a report is uploaded.
- **`<YourValuesCard>`** — mint context card above the answer in personalized/refusal modes. `--accent-surface` bg, `--radius-lg`, 12/18 padding. Label "YOUR VALUES" (11/500 uppercase, `--accent-text`). Grid of parameter rows (mono 12 px, name + value + status badge). **Only shows parameters relevant to the question** (passed via `names` prop).
- **`<RefusalBlock>`** — info-blue card inside the answer body, shown at the top when the system refuses to diagnose. `--info-surface` bg, `--radius-md`, 14/16 padding. `ti-shield-check` icon (18 px, `--info-text`) + text in `--info-text`. **NOT red** — refusal is a feature, not an error.
- **`<HealthAnswerBody>`** — renders the answer with three special inline elements:
  - **Citation pills** (`<span class="cite">Source N</span>`) — same as RAG Ops, click to toggle source-card highlight.
  - **User-value marks** (`<mark class="user-value">215 mg/dL</mark>`) — `--accent-surface` bg, `--accent-text` color, mono 500, 4 px radius. Surfaces the user's actual values inline.
  - **Critical lead-in** (`<div class="crit-callout">`) — if a critical value is involved, prepend a red callout box ("IMPORTANT: Your potassium level of 6.2 mEq/L…").
- **`<HealthSourceCard>`** — same as RAG Ops `<SourceCard>` plus an **org tag** (top-right corner): `WHO` / `CDC` / `NIH` / `CDSCO` / `ICMR`, each with its own semantic surface color. Drug-interaction queries also get a **drug tag** at the bottom: `Metformin` / `Aspirin` / `Interaction`.
- **Search bar `Personalized` badge** — when a report is uploaded, a mint pill appears inside the search bar to the left of the input: `ti-stethoscope` icon + "Personalized" + small `X` to exit personalized mode. Removes the report on click (after confirm dialog).
- **`<ConfirmDialog>`** — modal overlay (`rgba(20,20,20,0.32)` bg). Card: white, `--radius-xl`, 22/24 padding, 380 px wide, soft shadow. Title (15/500) + body (13 px secondary) + actions (Cancel pill + primary CTA).

### Eval-dashboard primitives (shared with RAG Ops, see RAG Ops handoff for details)

`<MetricCard>` · `<BarRow>` · `<HighlightedTrendChart>` · `<ScoreHistogram>` · `<FailureRow>` · `<GenFailureRow>` · `<RunSelector>` · `<BarChart>` · `<TrendChartWithTarget>` · `<CompareView>` · `<OverlayTrendChart>` · `<Toast>` · `<EmptyState>` · `<ConfidenceDot>` · `<Skel>` family.

### Guardrails-page-specific

- **`<GuardrailFailureRow>`** — expandable row showing **Expected behavior → Actual response → Why it failed**, with the problematic text inside Actual highlighted by `<mark>` (`--danger-surface` bg, `--danger-text`). Each row has a category pill + a danger "guardrail failed: {name}" pill.
- **`<GuardrailBars>`** — horizontal bars colored by absolute pass rate (≥ 95% success, ≥ 80% warning, < 80% danger). One bar per guardrail rule.
- **`<GuardrailTrendChart>`** — overall pass rate across eval runs, with **dashed 95% target line** and the current run highlighted (r=7 + accent halo).

---

## Screens (every state)

### 1. Search (`/search`)

#### 1.1 Empty / idle
- Vertically centered hero. Title: "Understand your health, backed by real guidelines." Subtitle: "Search WHO, CDC, NIH and Indian health guidelines — or upload your lab report for personalized answers."
- 580 px-wide search bar (52 px tall, accent focus ring) with placeholder "Ask about symptoms, medicines, nutrition, lab values…".
- **`<UploadZone>`** 16 px below the search bar.
- Example pills below the upload zone (generic set when no report; personalized set when report exists).
- "Press `/` to focus search" hint at the bottom.

#### 1.2 Upload triggered → processing
- File picker opens on click or drag. Validation: `.pdf` only, ≤ 10 MB. Inline error appears red below the zone for 5 s on rejection.
- On valid file: `<UploadZone>` is replaced by `<UploadProgress>` (300 ms swap). Progress bar fills as steps cycle. Total typical duration 3–8 s.
- On extraction failure: error state — "We couldn't extract health data from this PDF. This might happen if…" with [Try again] [Search without upload] buttons. (Implement; mock simulates success only.)

#### 1.3 Upload complete (no criticals)
- `<UploadProgress>` is replaced by `<HealthSummaryCard>` (300 ms fade).
- Search bar gains the **`Personalized` mint badge** (inside the input, left of the text).
- Example pills swap from generic to personalized set.
- Toast: "Lab report loaded · personalized mode on".

#### 1.4 Upload complete (with criticals)
- `<CriticalAlert>` slides in **above** the `<HealthSummaryCard>` (350 ms slide-down + fade).
- The critical parameter row inside the summary gets a `--danger-surface` tinted row background.

#### 1.5 Loading (after submit)
- Search bar moves to top, hero + dropzone + pills fade out (200 ms).
- `<SearchSkeleton>` fades in.
- Search button label → "Searching" + inline spinner.

#### 1.6 Generic answer (no report uploaded)
- Order: `<AnswerCard>` → `<Disclaimer>` → `<UploadNudge>` → source grid.
- Each source card carries an org tag (WHO/CDC/NIH/etc.).

#### 1.7 Personalized answer (report uploaded, question maps to extracted values)
- Order: `<YourValuesCard>` → `<AnswerCard>` (with user-value marks inline) → `<Disclaimer>` → source grid.
- Answer references user's specific values: "Your total cholesterol of **215 mg/dL** is above…".

#### 1.8 Personalized answer with critical context
- Order: `<CriticalAlert>` (top of page, stays visible) → `<YourValuesCard>` → `<AnswerCard>` (begins with a red `<div class="crit-callout">` inside the body: "IMPORTANT: Your potassium level of 6.2 mEq/L is above the critical threshold. Please seek medical attention promptly.") → `<Disclaimer>` → sources.
- The critical signal appears in three places: the standalone alert, the answer's lead-in callout, and the status badge in `<YourValuesCard>`. This redundancy is intentional.

#### 1.9 Diagnosis refusal
- Triggered by patterns like /am i (diabetic|hypertensive|prediabetic)/, /do i have/.
- Order: `<YourValuesCard>` (if applicable) → `<AnswerCard>` with `<RefusalBlock>` **at the start of the body** (info-blue, not red) followed by factual range information ("Your HbA1c of 6.4% falls in the prediabetic range…") → `<Disclaimer>` → sources.
- The refusal block reads: "I cannot diagnose medical conditions. Only a qualified healthcare professional can provide a diagnosis after proper clinical evaluation."

#### 1.10 IDK
- Triggered by topics outside the knowledge base (e.g. "Can homeopathy treat diabetes?", "Ayurvedic cure for cancer").
- Confidence dot is amber (with pulse).
- Order: `<AnswerCard>` with `<IdkWarning>` block (`--warning-surface` bg, `ti-alert-circle`) → `<Disclaimer>` → suggestions panel ("Try related topics" + pills) → no source cards.

#### 1.11 Drug interaction
- Triggered by patterns like /metformin.*with.*aspirin/, /interact/.
- Order: `<AnswerCard>` → `<Disclaimer>` → source grid where each source card carries a `drug-tag` pill at the bottom ("Metformin", "Aspirin", "Interaction").

#### 1.12 Edge cases
- **Non-lab-report PDF**: extraction succeeds but parameter parser finds no health values. Show: "We couldn't find lab test results in this PDF. Please upload a blood test report, lipid panel, CBC, or similar diagnostic report." with [Try another file] [Search without upload].
- **Partially readable report**: show extracted values with a "partial extraction" badge on the summary card, plus note: "We extracted 8 of approximately 15 values from your report."
- **Question outside report scope**: no `<YourValuesCard>` shown; generic answer; closing line: "Your uploaded report doesn't include cholesterol values. If you have a lipid panel report, you can upload it for personalized answers."
- **Rate-limit on generation**: fall back to Ollama if available; otherwise: "I'm currently unable to generate a response. Please try again in a moment. If you have urgent health concerns, please contact your healthcare provider directly." Never show a generic error for health queries.
- **Remove report**: clicking the X on the summary card (or the badge inside the search bar) opens `<ConfirmDialog>`: "Remove your uploaded report? You'll lose personalized answers. You can upload again any time."

### 2. Retrieval dashboard (`/dashboard/retrieval`)

Same layout as RAG Ops, but the category breakdown now lists 9 health-specific categories: single-doc · drug-interaction · personalized · multi-doc · ambiguous · critical-value · diagnosis-request · unanswerable · contradictory.

### 3. Generation dashboard (`/dashboard/generation`)

Same layout, with the category list updated to include diagnosis-request, critical-value, drug-interaction, personalized.

### 4. Guardrails dashboard (`/dashboard/guardrails`) — NEW

- **4 metric cards**:
  - **Disclaimer compliance** — green ONLY at 100%, RED at anything less. Non-negotiable.
  - **Refusal to diagnose** — green ≥ 95%, amber 85–94%, red < 85%.
  - **Critical detection** — green ≥ 95%, amber 80–94%, red < 80%.
  - **Overall pass rate** — green > 95%, amber 80–95%, red < 80%. Delta vs baseline.
- **Pass-rate trend chart** — overall pass rate across runs, dashed 95% target line, current run highlighted. X-axis labels describe what changed in each run: Baseline → +Few-shot examples → +Prompt reinforcement → +Post-gen check → +Retry logic.
- **Per-guardrail breakdown** — horizontal bars (one per rule), color-coded by absolute pass rate.
- **Failure explorer** — sub-tabs (All / Missed refusals / Missed critical / Missing disclaimer). Each `<GuardrailFailureRow>` expands to show Expected · Actual (with `<mark>` on the problematic text) · Why it failed.

### 5. Product metrics (`/dashboard/metrics`)

- **4 metric cards** specific to a health product:
  - Total queries
  - % personalized (queries with uploaded report)
  - Disclaimer (live) — % of production answers that rendered the disclaimer; always 100%
  - Avg latency
- **Daily query volume** bar chart with `Last 7 days / 30 days / All time` range selector. Production should split bars: generic queries (`--accent`) vs personalized queries (`--info`).
- **Satisfaction trend** line chart, dashed 80% target line. Optionally split by generic/personalized in production.
- **Latency trend** line chart, dashed 2.0 s target line.
- (Recommended additional panels for production: Guardrail compliance trend at 100% — any dip is a problem; Upload adoption % per day.)

### 6. Eval runs (`/eval-runs`)

Same as RAG Ops handoff, plus an extra column: **Guardrail%** — colored by threshold (green ≥ 95, amber ≥ 80, red < 80). Clickable to navigate to `/dashboard/guardrails?run={id}`.

### 7. Settings (`/settings`)

- **Appearance**: light/dark segmented toggle.
- **Data sources**: WHO Health Topics (524 docs · 3,210 chunks) · CDC Health Topics · NIH MedlinePlus · Indian Health (NHM + FSSAI + ICMR) · Drug Database (CDSCO + NIH). Last-sync timestamps + connected pill. Re-ingest button.
- **Privacy** — calls out the safety promises:
  - "Health data uploaded via lab reports is stored in your browser session only."
  - "Session data is automatically deleted after 24 hours."
  - "No health data is used for training or evaluation purposes."
  - "Evaluation uses only synthetic mock health data."
- **Eval configuration**: chunk_size, retriever, judge model, etc. (`<pre>`-style mono block, "Copy config" button).
- **Guardrail configuration**: disclaimer text preview · diagnosis-refusal pattern count · critical-value threshold count.
- **About**: HealthRAG v1.0 · build number · GitHub + case-study link pills.

---

## Mode-decision logic (Search)

The mock dispatches answer modes via regex on the query text. Real implementation should drive this from server-side classification + guardrail signals, not the client.

| Mode | Triggers (regex) | UI |
|---|---|---|
| `idk` | `/homeopath|ayurvedic cure|broken arm at home|miracle/i` | IDK warning + suggestion pills, no sources |
| `refusal` | `/am i (diabetic|hypertensive|prediabetic|sick)|do i have/i` | Refusal block inside answer + factual range info |
| `drug` | `/(metformin|aspirin|crocin|paracetamol|azithromycin).*(with|and|combined)|interact/i` | Source cards carry drug tags |
| `personalized_critical` | `report has criticalFlags && query mentions the critical parameter` | Standalone alert + critical lead-in inside answer body |
| `personalized` | `report uploaded && query mentions cholesterol/HDL/LDL/HbA1c/etc.` | `<YourValuesCard>` + user-value marks in answer |
| `generic` | default | Generic answer + upload nudge |

---

## Interactions & behavior

### Search

| Trigger | Behavior |
|---|---|
| Type + Enter / Search button | Submit query |
| Click example pill | Fill search bar + auto-submit |
| Press `/` anywhere | Focus search bar |
| Drag PDF onto upload zone | Validate + start processing |
| Click upload zone | Open file picker |
| Click `[Source N]` citation | Toggle source-card highlight |
| Click `X` in `Personalized` badge or summary card | Open confirm dialog → on confirm, remove report, exit personalized mode, toast info |
| Click thumbs up/down | Same as RAG Ops — disable opposite, comment input on thumbs-down, toast |
| Click copy | Copy answer text (excluding disclaimer), check icon for 1.1 s, toast |

### Logging (server-side contract)

```
ON SEARCH SUBMIT → INSERT INTO queries:
  question, has_health_context, health_context_summary,
  retrieved_chunk_ids, retrieved_scores, generated_answer, citations,
  model_used, latency_ms,
  disclaimer_present, refused_to_diagnose, critical_value_flagged,
  guardrail_triggered

ON UPLOAD → INSERT INTO uploaded_health_reports:
  session_id, report_type, extracted_values, critical_flags, raw_text, filename
(no query log for the upload itself)

ON FEEDBACK → UPDATE queries:
  user_feedback, feedback_comment

DAILY CLEANUP JOB:
  DELETE FROM uploaded_health_reports
  WHERE uploaded_at < NOW() - INTERVAL '24 hours'
```

---

## Accessibility

- Search bar: `aria-label="Search health guidelines"`
- Upload zone: `aria-label="Upload your lab report PDF for personalized answers"`
- Health summary card: `aria-label="Your extracted lab results: 15 values, 4 above normal"`
- Critical alert: `role="alert"`, `aria-live="assertive"` — screen readers announce immediately
- Disclaimer: `role="note"`, `aria-label="Medical disclaimer: this is not medical advice"`
- Refusal block: `aria-label="The system cannot diagnose conditions"`
- Status badges: `aria-label="Hemoglobin 12.3, status: normal"`
- Color-coded elements carry text equivalents (don't rely on color alone)
- Critical text in answers uses both color AND `<mark>` semantics

**Keyboard:** Tab order: sidebar → search bar → upload zone → example pills → results. `/` focuses search. `Esc` closes confirm dialog and expanded failure rows.

---

## File index

`design_reference/` contains the runnable mock.

| File | What it is |
|---|---|
| `index.html` | Shell — loads React, Babel, Tabler webfont, scripts in order |
| `src/colors_and_type.css` | Design tokens (light + dark) + base type |
| `src/theme.css` | Component styles inherited from RAG Ops |
| `src/extras.css` | Skeletons, toasts, comparison view, expandable rows |
| `src/health.css` | **HealthRAG-specific** — upload zone, summary card, critical alert, disclaimer, refusal block, your-values card, status badges, source-card org/drug tags, confirm dialog |
| `src/data.js` | Eval-runs / categories / failures mock (shared with RAG Ops) |
| `src/health_data.js` | **HealthRAG-specific** — mock lab report (normal + critical variants), example pills, all sample answers (generic/personalized/refusal/drug/idk), guardrail runs, guardrail failures. **Wrapped in an IIFE** so its top-level consts don't collide with `data.js` |
| `src/components.jsx` | Shared primitives: Sidebar (HealthRAG-branded), PageHeader, MetricCard, Panel, BarRow, etc. |
| `src/extras.jsx` | Additional shared: skeletons, ToastProvider, EmptyState, ConfidenceDot, CompareView, OverlayTrendChart, HighlightedTrendChart, GenFailureRow |
| `src/health_components.jsx` | **HealthRAG-specific** — UploadZone, UploadProgress, HealthSummaryCard, CriticalAlert, Disclaimer, UploadNudge, YourValuesCard, RefusalBlock, ConfirmDialog, HealthSourceCard, HealthAnswerBody, GuardrailFailureRow |
| `src/SearchPage.jsx` | Search journey (idle/upload/answer with all 6 mode variants) |
| `src/RetrievalPage.jsx` | Retrieval dashboard with health categories |
| `src/GenerationPage.jsx` | Generation dashboard with health categories |
| `src/GuardrailsPage.jsx` | **NEW** — guardrail dashboard |
| `src/MetricsPage.jsx` | Product metrics |
| `src/EvalRunsPage.jsx` | Eval runs table (Guardrail% column added) |
| `src/SettingsPage.jsx` | Settings + Privacy panel |
| `src/app.jsx` | App shell — routing, theme persistence, Tweaks panel |
| `src/tweaks-panel.jsx` | (Mock-only design exploration panel) |

---

## Production checklist

- [ ] PDF parsing pipeline (server) — extract text, parse parameters keyed to Indian lab formats, classify status against reference ranges, flag critical values against the critical thresholds table.
- [ ] 24-hour deletion job — `DELETE FROM uploaded_health_reports WHERE uploaded_at < NOW() - INTERVAL '24 hours'`.
- [ ] Disclaimer rule must fire for **100%** of answers in production — implement as a post-generation check, not a prompt-only behavior. The Guardrails dashboard's red treatment of <100% is intentional pressure.
- [ ] Diagnosis-refusal patterns — maintain a versioned regex list (or a small classifier) in source control; surface count in Settings.
- [ ] Critical-value thresholds — maintain a versioned parameter→threshold table; surface count in Settings.
- [ ] Route `/` to `/search`.
- [ ] Theme persistence in `localStorage`.
- [ ] Skeleton loaders on every first paint (no spinners).
- [ ] `/` keyboard shortcut focuses search; ignore when an input is already focused.
- [ ] `aria-live="assertive"` on the critical alert; `role="alert"`.
- [ ] All health values have `sr-only` context ("Hemoglobin 12.3 grams per deciliter, status normal").
- [ ] Toast announcements via `aria-live="polite"`.
- [ ] Privacy promise honored: no health data in training pipelines; no health data in eval sets; eval uses synthetic data only.
