# RAG Ops — Frontend design system and build instructions

## Reference and design direction

Study https://easehealth.com/ before building. Extract these design patterns:
warm white surfaces, deep green accent used sparingly, generous whitespace, confident
typography with large stat numbers, soft rounded corners (12-16px), card-based layouts
on tinted page backgrounds, and a clean SaaS feel that communicates "this is a real
product built by someone who cares about craft."

This is an AI observability dashboard for a RAG system. The vibe is:
clean, professional, warm — like a well-designed internal tool at a Series B startup.
Think Linear's clarity meets EaseHealth's warmth.

The design ships with two themes: a light theme (primary, EaseHealth-inspired) and a
dark theme (alternative). Both use the same component structure with swapped color tokens.

---

## 1. Color system

### Light theme (primary)

```css
:root[data-theme="light"], :root {
  /* ── Surfaces ── */
  --bg-page: #F7F7F5;              /* Page background — warm off-white, NOT pure white */
  --bg-card: #FFFFFF;              /* Cards, panels, elevated surfaces */
  --bg-surface: #F1EFE8;           /* Metric cards, input fields, inset areas */
  --bg-hover: #ECEAE3;             /* Hover states on surfaces */

  /* ── Text ── */
  --text-primary: #1A1A1A;         /* Headings, values, primary content */
  --text-secondary: #5F5E5A;       /* Body text, descriptions */
  --text-tertiary: #9B97A0;        /* Labels, placeholders, metadata */

  /* ── Primary accent (EaseHealth green) ── */
  --accent: #0F6E56;               /* Primary buttons, active states, positive indicators */
  --accent-hover: #085041;         /* Button hover, deeper emphasis */
  --accent-surface: #E1F5EE;       /* Active nav background, badge backgrounds */
  --accent-text: #085041;          /* Text on accent-surface backgrounds */
  --accent-text-light: #0F6E56;    /* Links, subtle accent text */

  /* ── Semantic: success ── */
  --success: #0F6E56;
  --success-surface: #E1F5EE;
  --success-text: #085041;

  /* ── Semantic: warning ── */
  --warning: #BA7517;
  --warning-surface: #FAEEDA;
  --warning-text: #633806;

  /* ── Semantic: danger ── */
  --danger: #A32D2D;
  --danger-surface: #FCEBEB;
  --danger-text: #791F1F;

  /* ── Semantic: info ── */
  --info: #185FA5;
  --info-surface: #E6F1FB;
  --info-text: #0C447C;

  /* ── Semantic: purple (for contradictory category) ── */
  --purple: #534AB7;
  --purple-surface: #EEEDFE;
  --purple-text: #3C3489;

  /* ── Borders ── */
  --border-light: rgba(0, 0, 0, 0.06);   /* Default card borders */
  --border-medium: rgba(0, 0, 0, 0.10);  /* Hover state borders */
  --border-active: #0F6E56;              /* Focused inputs, active source cards */

  /* ── Layout ── */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-pill: 999px;

  --sidebar-width: 240px;
  --content-max-width: 920px;
}
```

### Dark theme (alternative)

```css
:root[data-theme="dark"] {
  --bg-page: #0A0A0F;
  --bg-card: #12121A;
  --bg-surface: #1A1A25;
  --bg-hover: #22222E;

  --text-primary: #F0EDE6;
  --text-secondary: #9B97A0;
  --text-tertiary: #65616B;

  --accent: #2DD4A8;
  --accent-hover: #26B890;
  --accent-surface: rgba(45, 212, 168, 0.12);
  --accent-text: #2DD4A8;
  --accent-text-light: #2DD4A8;

  --success: #2DD4A8;
  --success-surface: rgba(45, 212, 168, 0.12);
  --success-text: #2DD4A8;

  --warning: #F5A623;
  --warning-surface: rgba(245, 166, 35, 0.12);
  --warning-text: #F5A623;

  --danger: #EF5A5A;
  --danger-surface: rgba(239, 90, 90, 0.12);
  --danger-text: #EF5A5A;

  --info: #5B8DEF;
  --info-surface: rgba(91, 141, 239, 0.12);
  --info-text: #5B8DEF;

  --purple: #7F77DD;
  --purple-surface: rgba(127, 119, 221, 0.12);
  --purple-text: #AFA9EC;

  --border-light: rgba(255, 255, 255, 0.06);
  --border-medium: rgba(255, 255, 255, 0.10);
  --border-active: #2DD4A8;
}
```

### Color usage rules

- Page background is ALWAYS --bg-page. Sidebar uses --bg-card.
- The dashboard content area (right of sidebar) uses --bg-page.
  Cards and panels on the dashboard use --bg-card with a 0.5px --border-light border.
  This creates the layered depth EaseHealth uses — tinted page, white cards floating on top.
- Metric cards use --bg-surface (the slightly tinted surface) — NOT --bg-card.
  This matches EaseHealth's stat blocks which sit on a subtle surface, not pure white.
- The accent color (#0F6E56 in light, #2DD4A8 in dark) is used ONLY for:
  primary CTA buttons, active nav items, positive metric deltas, chart primary line,
  relevant chunk indicators, and citation pills.
  If everything is green, nothing is. The accent should feel special.
- Badge/pill backgrounds always use the semantic *-surface color.
  Badge text always uses the semantic *-text color.
  NEVER use the raw accent color as a badge background.
- Score thresholds for color coding:
  green (success): value >= 0.70
  amber (warning): value 0.50 to 0.69
  red (danger): value < 0.50
- Never use pure black (#000000) for text. Darkest text is --text-primary (#1A1A1A in light).
- Never use pure white (#FFFFFF) for the page background. Page background is --bg-page (#F7F7F5 in light).

---

## 2. Typography

Use TWO font families. One for display and body, one for code and technical values.

```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --font-display: 'Plus Jakarta Sans', -apple-system, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}
```

### Type scale

```
Page title:           22px / 500 / -0.01em / line-height: 1.2
Section heading:      18px / 500 / normal  / line-height: 1.3
Panel heading:        14px / 500 / normal  / line-height: 1.4
Card label:           11px / 500 / 0.03em  / line-height: 1.4 / uppercase
Body text:            14px / 400 / normal  / line-height: 1.8
Small text:           13px / 500 / normal  / line-height: 1.4
Caption / metadata:   12px / 400 / normal  / line-height: 1.4
Metric value (large): 24px / 500 / -0.01em / line-height: 1.0
Metric value (small): 13px / 500 / normal  / line-height: 1.0
Code / scores:        11px / 500 / normal  / line-height: 1.5 / font-mono
Nav item:             13px / 500 / normal  / line-height: 1.4
```

### Typography rules

- All headings use --text-primary.
- Body text and descriptions use --text-secondary.
- Labels, metadata, and placeholders use --text-tertiary.
- Metric values use --text-primary. They should feel large and confident.
- Score values (0.74, 0.81) use --font-mono for alignment and technical credibility.
- Similarity scores in source cards use the semantic color matching their threshold
  (green for >= 0.70, amber for 0.50-0.69, red for < 0.50) in --font-mono.
- Use only three font weights: 400 (regular), 500 (medium), 600 (semibold, headings only).
  Do NOT use 700. This keeps the typographic texture light and modern.
- All uppercase labels have letter-spacing of 0.03em-0.06em.
- NEVER center-align body text. Left-align everything.

---

## 3. Spacing system

Base unit: 4px. All spacing is multiples of 4.

```
4px   — tight gaps (icon to text inside a badge)
8px   — compact spacing (label to value in a metric card)
10px  — nav item vertical padding
12px  — gaps between grid items, internal badge padding
14px  — gap between bar chart rows
16px  — standard component padding, panel header padding
18px  — panel body padding
20px  — content padding inside panels and cards
24px  — gap between major sections on the dashboard
28px  — page content padding (left/right and top)
32px  — gap between sidebar sections
36px  — space below the logo in the sidebar
```

### Layout spacing

- Sidebar internal horizontal padding: 16px
- Main content area padding: 24px horizontally, 24px top
- Gap between metric card grid and first panel: 20px
- Gap between panels: 20px
- Metric card grid gap: 12px
- Failure explorer rows gap: 10px

---

## 4. Component library

### 4.1 App shell layout

```
┌─────────────────────────────────────────────────────────────┐
│ SIDEBAR (240px)       │  MAIN CONTENT (--bg-page)           │
│ (--bg-card)           │                                      │
│ border-right: 0.5px   │  Page title + subtitle               │
│                       │  Tab nav + run selector               │
│  Logo                 │                                      │
│  Nav sections         │  Metric cards grid (4-col)           │
│  Nav items            │  Trend chart panel                   │
│                       │  Category breakdown panel            │
│                       │  Failure explorer panel              │
└─────────────────────────────────────────────────────────────┘

SPECS:
- Sidebar: fixed left, width: var(--sidebar-width), full height
  Background: --bg-card
  Border-right: 0.5px solid --border-light
  Padding: 20px 16px

- Main content area:
  Margin-left: var(--sidebar-width)
  Background: --bg-page
  Padding: 24px 28px
  Content max-width: var(--content-max-width)
```

### 4.2 Navigation sidebar

```
STRUCTURE:
┌───────────────────────┐
│  ◈ RAG Ops            │  ← Logo area (36px margin-bottom)
│                       │
│  MAIN                 │  ← Section label (uppercase, 11px)
│  ▪ Search             │  ← Nav item
│                       │
│  EVALUATION           │
│  ▪ Retrieval quality  │  ← Active state: accent-surface bg
│  ▪ Generation quality │
│  ▪ Product metrics    │
│                       │
│  SYSTEM               │
│  ▪ Eval runs          │
│  ▪ Settings           │
└───────────────────────┘

LOGO AREA:
- Icon container: 30x30px, border-radius: var(--radius-md)
  Background: --accent-surface
  Icon: 17px Tabler ti-cube, color: --accent
- Wordmark: 15px / 500 / --text-primary
- Gap between icon and wordmark: 8px

SECTION LABELS:
- Font: 11px / 500 / uppercase / letter-spacing: 0.06em
- Color: --text-tertiary
- Margin-top: 28px (between sections), margin-bottom: 10px

NAV ITEMS:
- Display: flex, align-items: center, gap: 10px
- Padding: 9px 14px
- Border-radius: var(--radius-md)
- Font: 13px / 500
- Default state:
  Background: transparent
  Text: --text-secondary
  Icon: 17px, --text-tertiary
- Hover state:
  Background: --bg-surface
- Active state:
  Background: --accent-surface (#E1F5EE in light, rgba teal in dark)
  Text: --accent-text (#085041 in light, #2DD4A8 in dark)
  Icon: --accent (#0F6E56 in light, #2DD4A8 in dark)
  Font-weight: 500
- Margin-bottom: 2px between items

USE THESE TABLER ICONS:
- Search: ti-search
- Retrieval quality: ti-chart-bar
- Generation quality: ti-message-chatbot
- Product metrics: ti-activity
- Eval runs: ti-list-check
- Settings: ti-settings
```

### 4.3 Metric card

The most important component. Displays a key metric number.
Reference: EaseHealth's "$2.5B+" and "11M+" stat blocks.

```
STRUCTURE:
┌─────────────────────────────┐
│  PRECISION@5       ↑ 12%    │   ← label + delta badge
│  0.74                       │   ← value
│  +0.06 from baseline        │   ← description
└─────────────────────────────┘

SPECS:
- Background: --bg-surface (NOT --bg-card — metric cards sit on the tinted surface)
- Border: none (the surface tint provides enough separation from the page)
- Border-radius: var(--radius-lg)
- Padding: 18px 20px
- Grid: 4 columns, gap: 12px. On mobile: 2x2.

LABEL ROW:
- Display: flex, justify-content: space-between, align-items: center
- Label: 11px / 500 / uppercase / letter-spacing: 0.03em / --text-tertiary
- Margin-bottom: 10px

DELTA BADGE:
- Font: 11px / 500
- Padding: 3px 8px
- Border-radius: --radius-pill
- Positive: color --success-text, bg --success-surface
  Include ↑ icon: ti-trending-up at 11px
- Negative: color --danger-text, bg --danger-surface
  Include ↓ icon: ti-trending-down at 11px
- Neutral: color --text-tertiary, bg --bg-card

VALUE:
- Font: 24px / 500 / letter-spacing: -0.01em
- Color: --text-primary
- Margin-bottom: 4px

DESCRIPTION:
- Font: 12px / 400
- Color: --text-tertiary

SPECIAL CASE — HALLUCINATION RATE:
- Value is rendered in --danger color regardless of value
- No delta badge (every hallucination is bad)
- Description shows "N of 100 questions"
```

### 4.4 Panel / card container

Generic container for dashboard sections (charts, breakdowns, failure explorer).

```
SPECS:
- Background: --bg-card
- Border: 0.5px solid --border-light
- Border-radius: var(--radius-xl) (16px)
- Margin-bottom: 20px
- No shadow in light theme. In dark theme: subtle shadow optional.

HEADER:
- Padding: 16px 20px
- Border-bottom: 0.5px solid --border-light
- Title: 14px / 500 / --text-primary
- Optional subtitle: 12px / 400 / --text-tertiary / margin-left: 12px
- Optional controls (tab toggles, selectors) float right

BODY:
- Padding: 18px 20px
```

### 4.5 Horizontal bar chart (category breakdown)

```
STRUCTURE:
  Single-doc    ████████████████████████████  0.88
  Multi-doc     █████████████████             0.62
  Unanswerable  ████████████                  0.41

SPECS:
- Each row: display flex, align-items center, gap 10px
- Margin between rows: 12px (last row: margin 0)
- Label: 100px fixed width, 12px / 500, --text-secondary, text-align right
- Track: flex:1, height 8px, --bg-surface, border-radius 4px, overflow hidden
- Fill: height 8px, border-radius 4px
  Color by threshold:
    >= 0.70: --success (#0F6E56 light, #2DD4A8 dark)
    0.50-0.69: --warning (#BA7517 light, #F5A623 dark)
    < 0.50: --danger (#A32D2D light, #EF5A5A dark)
- Value: 40px fixed width, 13px / 500, --text-primary, text-align right
- Animate fill width from 0 on mount: 400ms ease-out
```

### 4.6 Trend line chart (Recharts or Chart.js)

```
SPECS:
- Chart height: 160px
- Background: transparent
- Line: 2px stroke, --accent
- Fill area: --accent at 6% opacity (light) or 10% opacity (dark)
- Dots: radius 5, fill --accent, stroke --bg-card (2px border)
- Grid lines: horizontal only, --border-light, no vertical grid
- Axis ticks: 11px, --text-tertiary
- Axis lines: hidden (drawBorder: false)
- Tooltip:
  Background: --bg-card
  Border: 0.5px --border-medium
  Border-radius: var(--radius-md)
  Padding: 12px
  Title: --text-primary
  Body: --text-secondary
- No legend (single line chart)

X-AXIS LABELS:
Each label should be the eval run_name: "Baseline", "+Reranker", "Chunk 1024", etc.
These labels tell the iteration story — what changed at each experiment.
```

### 4.7 Badge / pill

Reusable across category labels, status indicators, score tags, relevance markers.

```
SPECS:
- Padding: 3px 10px
- Border-radius: --radius-pill
- Font: 11px / 500
- No border (colored bg provides enough separation)

VARIANTS (name: text-color, bg-color):

Query categories:
  single-doc:     --info-text,     --info-surface
  multi-doc:      --warning-text,  --warning-surface
  unanswerable:   --danger-text,   --danger-surface
  ambiguous:      --accent-text,   --accent-surface
  contradictory:  --purple-text,   --purple-surface

Relevance tags:
  relevant:       --success-text,  --success-surface
  irrelevant:     --danger-text,   --danger-surface
  tangential:     --warning-text,  --warning-surface

Score indicators:
  good (>= 0.70): --success-text,  --success-surface
  mid (0.50-0.69): --warning-text, --warning-surface
  bad (< 0.50):   --danger-text,   --danger-surface

Failure types:
  hallucination:  --danger-text,   --danger-surface
  incomplete:     --warning-text,  --warning-surface
```

### 4.8 Failure explorer row

```
STRUCTURE (collapsed):
┌──────────────────────────────────────────────────────────────┐
│ "What is the process for requesting a team transfer..."      │
│ [Multi-doc]  P@5: 0.20  R@5: 0.33  MRR: 0.14              │
└──────────────────────────────────────────────────────────────┘

STRUCTURE (expanded, adds expected vs retrieved chunks):

CONTAINER:
- Border: 0.5px solid --border-light
- Border-radius: var(--radius-lg)
- Padding: 16px 20px
- Margin-bottom: 10px
- No background (transparent, inherits from panel body)

QUESTION TEXT:
- Font: 13px / 500 / --text-primary
- Line-height: 1.4
- Margin-bottom: 10px

METADATA ROW:
- Display: flex, gap: 8px, align-items: center, flex-wrap: wrap
- Category badge: pill style (see 4.7)
- Score values: 11px / font-mono / --text-tertiary
- Margin-bottom: 14px (before chunk sections)

SECTION HEADERS (Expected chunks, Retrieved chunks):
- Font: 10px / 500 / uppercase / letter-spacing: 0.05em / --text-tertiary
- Margin-bottom: 6px

CHUNK REFERENCES:
- Font: 12px / font-mono / --text-secondary
- Line-height: 1.5
- Padding-left: 10px
- Border-radius: 0 (single-sided border)
- Expected/relevant: border-left: 2px solid --success
- Retrieved irrelevant: border-left: 2px solid --danger
- Margin-bottom: 4px

RELEVANCE BADGES (next to retrieved chunks):
- Same pill style as relevance tags in 4.7
- Flex-shrink: 0 so they don't wrap

EXPAND/COLLAPSE:
- Smooth height animation: 250ms ease
- Chevron icon rotates 90deg on expand
```

### 4.9 Tab navigation

```
STRUCTURE:
  [ Retrieval ]  [ Generation ]  [ Metrics ]

CONTAINER:
- Background: --bg-surface
- Border-radius: var(--radius-md)
- Padding: 3px
- Display: flex, gap: 2px

EACH TAB:
- Padding: 6px 14px
- Border-radius: var(--radius-sm)
- Font: 12px / 500 / font-display
- Cursor: pointer

ACTIVE TAB:
- Background: --bg-card
- Color: --text-primary
- Border: 0.5px solid --border-light

INACTIVE TAB:
- Background: transparent
- Color: --text-tertiary
- No border
- Hover: color --text-secondary
```

### 4.10 Eval run selector dropdown

```
TRIGGER:
- Background: --bg-card
- Border: 0.5px solid --border-light
- Border-radius: var(--radius-md)
- Padding: 8px 14px
- Display: flex, align-items: center, gap: 6px
- Text: 12px / 500 / --text-primary
- Chevron: ti-chevron-down, 14px, --text-tertiary

DROPDOWN PANEL:
- Background: --bg-card
- Border: 0.5px solid --border-medium
- Border-radius: var(--radius-lg)
- Padding: 6px
- Max-height: 280px, overflow-y: auto

EACH OPTION:
- Padding: 10px 14px
- Border-radius: var(--radius-sm)
- Hover: bg --bg-surface
- Active: bg --accent-surface, text --accent-text
- Run name: 13px / 500 / --text-primary
- Run date: 11px / --text-tertiary
```

### 4.11 Search bar

```
STRUCTURE:
┌─ 🔍 ────────────────────────────── [Search] ─┐
└───────────────────────────────────────────────┘

SPECS:
- Max-width: 580px, centered
- Height: 52px
- Background: --bg-card
- Border: 0.5px solid --border-light
- Border-radius: 14px
- Padding: 0 6px 0 18px
- Display: flex, align-items: center

SEARCH ICON:
- Tabler ti-search, 18px, --text-tertiary
- Margin-right: 12px

INPUT:
- Font: 15px / 400 / font-display / --text-primary
- Placeholder: --text-tertiary
- Background: transparent, no border, no outline
- Flex: 1

SUBMIT BUTTON:
- Background: --accent
- Color: #FFFFFF
- Padding: 9px 20px
- Border-radius: var(--radius-md)
- Font: 13px / 500
- Hover: --accent-hover
- No border

FOCUS STATE (on container):
- Border: 0.5px solid --accent
- Box-shadow: 0 0 0 3px rgba(15, 110, 86, 0.08) in light
  or 0 0 0 3px rgba(45, 212, 168, 0.08) in dark
```

### 4.12 Answer card

```
STRUCTURE:
┌──────────────────────────────────────────────────────────┐
│  Answer                                        1.8s  ◉  │
│ ──────────────────────────────────────────────────────── │
│  GitLab provides a one-time stipend... [Source 1]        │
│  ...under the general office supplies [Source 2].        │
│ ──────────────────────────────────────────────────────── │
│  5 chunks from 3 documents         👍 👎 📋             │
└──────────────────────────────────────────────────────────┘

CONTAINER:
- Background: --bg-card
- Border: 0.5px solid --border-light
- Border-radius: var(--radius-xl)
- Margin-bottom: 20px

HEADER:
- Padding: 16px 20px
- Border-bottom: 0.5px solid --border-light
- Label: 14px / 500 / --text-primary
- Latency: 12px / font-mono / --text-tertiary
- Confidence dot: 8px circle, --success (if above threshold)

BODY:
- Padding: 18px 20px
- Text: 14px / 400 / --text-primary / line-height: 1.8
- Citation pills [Source N]:
  Display: inline-block
  Background: --accent-surface
  Color: --accent-text
  Font: 11px / 500 / font-mono
  Padding: 2px 8px
  Border-radius: 6px
  Cursor: pointer
  Hover: darker accent-surface (e.g., #9FE1CB in light)

FOOTER:
- Padding: 14px 20px
- Border-top: 0.5px solid --border-light
- Source count: 12px / --text-tertiary (left)
- Feedback buttons (right): flex row, gap 6px
  Each button: 30x30px, border-radius var(--radius-sm)
  Background: --bg-surface
  Border: 0.5px solid --border-light
  Icon: 15px / --text-secondary
  On positive click: icon --success, bg --success-surface, border --success
  On negative click: icon --danger, bg --danger-surface, border --danger
  Include: ti-thumb-up, ti-thumb-down, ti-copy

"I DON'T KNOW" STATE:
- Same card structure
- Body contains a warning block:
  Background: --warning-surface
  Border-radius: var(--radius-md)
  Padding: 14px 16px
  Icon: ti-alert-circle, 18px, --warning-text
  Text: 13px / --warning-text
  Message: "I don't have enough information in the knowledge base to answer
  this question. This topic may not be covered in the current documentation."
```

### 4.13 Source chunk card

```
STRUCTURE:
┌──────────────────────────────────────────────┐
│  Source 1                              0.82  │
│  ████████████████████████████████░░░░░░░░░░░ │
│  handbook/finance/expenses.md                │
│  "GitLab provides a one-time $1,500..."      │
│  🔗 View original                            │
└──────────────────────────────────────────────┘

SPECS:
- Background: --bg-card
- Border: 0.5px solid --border-light
- Border-radius: var(--radius-lg)
- Padding: 14px 16px
- Grid: 3 columns, gap: 12px

SOURCE LABEL:
- Font: 12px / 500 / --text-secondary

SCORE:
- Font: 11px / 500 / font-mono
- Color: semantic color based on threshold

SCORE BAR:
- Height: 4px
- Track: --bg-surface, border-radius: --radius-pill
- Fill: semantic color, border-radius: --radius-pill
- Animate width on mount

SOURCE PATH:
- Font: 11px / font-mono / --text-tertiary
- Margin-bottom: 6px

CHUNK CONTENT:
- Font: 12px / 400 / --text-secondary / line-height: 1.5
- Max 3 lines, truncated with -webkit-line-clamp: 3

LINK:
- Font: 11px / --accent-text-light
- Icon: ti-external-link at 12px
- No underline default, underline on hover

ACTIVE STATE (when user clicks citation in answer):
- Border: 1.5px solid --accent
- In light theme: subtle box-shadow 0 0 0 3px rgba(15, 110, 86, 0.06)
- Smooth scroll into view
```

### 4.14 Score distribution histogram

Used on the generation quality dashboard to show how scores spread across 1-5.

```
STRUCTURE:
  Faithfulness         Completeness         Hallucination        Relevance
   █                    █                   ██████████           ██████████
  ██                   ██                                        ████████
  ████████████         ██████████                                ████
  ███████              ██████████████████   ████                 ██
  ██                   ████                                      █
  1  2  3  4  5        1  2  3  4  5        No    Yes            1  2  3  4  5

SPECS:
- Grid: 4 columns, gap: 20px
- Title per column: 12px / 500 / --text-secondary / text-align center / margin-bottom 12px
- Bars: display flex, align-items flex-end, justify-content center, gap 4px, height 80px
- Each bar:
  Width: 20px (or 36px for binary hallucination)
  Border-radius: 3px
  Color by score:
    Score 1-2: --danger
    Score 3: --warning
    Score 4-5: --success
    Hallucination No: --success
    Hallucination Yes: --danger
- Labels below bars: 10px / --text-tertiary
```

### 4.15 Loading and empty states

```
LOADING SKELETON:
- Background: --bg-surface
- Animated shimmer:
  Background-image: linear-gradient(90deg,
    --bg-surface 0%,
    rgba(0,0,0,0.02) 50%,     /* light theme */
    --bg-surface 100%
  )
  In dark theme: rgba(255,255,255,0.03) at 50%
  Background-size: 200% 100%
  Animation: shimmer 1.5s ease-in-out infinite
- Skeleton shapes match the component they replace
- For metric cards: small rect (label) + large rect (value)
- For charts: one large rect filling chart area
- For failure explorer: 3 stacked rows of varying width

EMPTY STATE:
- Centered in the panel
- Icon: 40px, --text-tertiary (use relevant Tabler icon)
- Title: 15px / 500 / --text-secondary
- Description: 13px / 400 / --text-tertiary
- Optional CTA: styled as link in --accent-text-light
```

---

## 5. Page specifications

### Page 1: Search (/search)

```
BEFORE SEARCH:
- Search bar centered vertically: flex, align-center, min-height 60vh
- Above search bar:
  Heading: 22px / 500 / --text-primary / "Ask your knowledge base anything."
  Subheading: 14px / 400 / --text-tertiary / "Search across GitLab handbook and Stripe documentation"
  Gap: 6px between heading and subheading, 32px below subheading
- Below search bar (28px gap):
  Example question pills in a flex-wrap row, gap 8px, centered
  Each pill:
    Background: --bg-surface
    Border: 0.5px solid --border-light
    Border-radius: --radius-pill
    Padding: 8px 16px
    Font: 12px / 500 / --text-secondary
    Hover: border --border-medium, color --text-primary
    On click: fill search bar and submit

AFTER SEARCH:
- Search bar moves to top of content area (no longer centered vertically)
- Below: answer card (full width, max-width content area)
- Below answer: source cards in 3-column grid, gap 12px
- Results animate in: fade up 300ms staggered
- Source cards highlight when their [Source N] is clicked in the answer
- Feedback submission shows brief toast: "Thanks for your feedback"
```

### Page 2: Retrieval quality (/dashboard/retrieval)

```
HEADER:
- Left: Page title (22px / 500) + subtitle (13px / --text-tertiary)
- Right: Tab navigation + Eval run selector dropdown
- Margin-bottom: 24px

ROW 1: Metric cards
- 4-column grid, gap 12px
- Cards: Precision@5, Recall@5, MRR, Eval queries
- Margin-bottom: 20px

ROW 2: Trend chart panel
- Full width panel with header and chart body
- Chart height: 160px
- X-axis: eval run names
- Margin-bottom: 20px

ROW 3: Category breakdown panel
- Full width panel
- 5 horizontal bar rows: single-doc, multi-doc, unanswerable, ambiguous, contradictory

ROW 4: Failure explorer panel
- Header with sub-tab toggles: "Worst P@5" | "Worst R@5" | "Unanswerable"
- Body: expandable failure rows, worst-scoring first
```

### Page 3: Generation quality (/dashboard/generation)

```
ROW 1: Metric cards
- 4 cards: Avg Faithfulness, Avg Completeness, Hallucination Rate, Avg Relevance
- Faithfulness/completeness/relevance show as "X.X / 5"
- Hallucination rate shows as percentage in --danger color

ROW 2: Score distributions panel
- 4-column grid of mini histograms (see component 4.14)
- Shows how scores are spread across the 1-5 scale

ROW 3: Category breakdown panel
- Average faithfulness by query category (horizontal bars)

ROW 4: Generation failure explorer
- Expanded view shows:
  Question text + generated answer side by side
  Hallucinated text highlighted with --danger-surface background + --danger-text color
  Judge reasoning in a separate block (bg --bg-surface, border-radius var(--radius-md))
```

### Page 4: Product metrics (/dashboard/metrics)

```
ROW 1: Metric cards
- 4 cards: Total queries, Satisfaction rate, Avg latency, Follow-up rate

ROW 2: Daily query volume (line chart, full width)
ROW 3: Satisfaction trend (line chart, full width)
ROW 4: Latency trend (line chart, full width)
```

### Page 5: Eval runs (/eval-runs)

```
Table showing all eval runs with columns:
Run name | Date | P@5 | R@5 | Faithfulness | Hallucination Rate | Config | Actions

- Table rows are clickable → navigate to dashboard filtered by that run
- "Compare" checkbox allows selecting 2 runs for side-by-side
- Compact table: 13px font, 12px vertical padding per row
- Alternating row backgrounds: transparent and --bg-surface
```

---

## 6. Animations and interactions

```
DEFAULT TRANSITIONS:
- Color, border, background: 200ms ease
- Layout changes (position, size): 300ms ease
- Chart mount animations: 400ms ease-out

BAR FILL ANIMATION:
- On mount, bars animate from width 0 to target width
- Duration: 400ms ease-out
- Use CSS: animation: barGrow 400ms ease-out forwards; transform-origin: left;

METRIC VALUE COUNT-UP:
- On mount, values animate from 0 to target number over 500ms
- Use a React hook or requestAnimationFrame

SKELETON SHIMMER:
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
Duration: 1.5s ease-in-out infinite

FAILURE EXPLORER EXPAND/COLLAPSE:
- max-height transition: 250ms ease
- Chevron rotation: 90deg, 200ms ease

SEARCH RESULTS:
- Fade up from 10px below, opacity 0 → 1
- Duration: 300ms, staggered 50ms per element

PAGE TRANSITIONS:
- Subtle opacity fade: 150ms

HOVER STATES:
- Cards: border-color transitions to --border-medium (200ms)
- Nav items: background transitions to --bg-surface (150ms)
- Buttons: background transitions to --accent-hover (150ms)
- Pills: no hover animation (they're labels, not interactive)
```

---

## 7. Responsive breakpoints

```
Desktop:  >= 1024px — Sidebar visible, 4-column metric grid, 3-column source grid
Tablet:   768-1023px — Sidebar collapses to 64px (icons only), 2-column metric grid
Mobile:   < 768px — No sidebar (hamburger), single column, stacked layouts
```

This is a desktop-first dashboard. Mobile is nice-to-have, not critical.

---

## 8. Recharts chart configuration

```jsx
const CHART_THEME_LIGHT = {
  line: '#0F6E56',
  fill: 'rgba(15, 110, 86, 0.06)',
  dot: { fill: '#0F6E56', stroke: '#FFFFFF', strokeWidth: 2, r: 5 },
  grid: 'rgba(0, 0, 0, 0.05)',
  tick: { fill: '#9B97A0', fontSize: 11, fontFamily: 'Plus Jakarta Sans' },
  tooltip: {
    bg: '#FFFFFF',
    border: 'rgba(0, 0, 0, 0.08)',
    title: '#1A1A1A',
    body: '#5F5E5A',
    radius: 10,
    padding: 12,
  },
};

const CHART_THEME_DARK = {
  line: '#2DD4A8',
  fill: 'rgba(45, 212, 168, 0.10)',
  dot: { fill: '#2DD4A8', stroke: '#12121A', strokeWidth: 2, r: 5 },
  grid: 'rgba(255, 255, 255, 0.06)',
  tick: { fill: '#65616B', fontSize: 11, fontFamily: 'Plus Jakarta Sans' },
  tooltip: {
    bg: '#1A1A25',
    border: 'rgba(255, 255, 255, 0.10)',
    title: '#F0EDE6',
    body: '#9B97A0',
    radius: 10,
    padding: 12,
  },
};
```

---

## 9. Iconography (Lucide React)

Install: `npm install lucide-react`

```
Navigation icons:
  Search:             Search
  Retrieval quality:  BarChart3
  Generation quality: MessageSquareText
  Product metrics:    Activity
  Eval runs:          ListChecks
  Settings:           Settings

Metric and status:
  Positive delta:     TrendingUp
  Negative delta:     TrendingDown
  Confidence dot:     (CSS circle, not an icon)

Answer card:
  Loading:            Loader2 (with spin animation)
  Copy:               Copy
  Thumbs up:          ThumbsUp
  Thumbs down:        ThumbsDown
  "I don't know":     AlertCircle

Source cards:
  External link:      ExternalLink

Failure explorer:
  Expand:             ChevronRight (rotates 90deg)
  Relevant chunk:     CheckCircle2
  Irrelevant chunk:   XCircle

Icon sizes:
  Nav items: 17px
  Inline with text: 15px
  Standalone: 18-20px
  Empty states: 40px
  Badge/pill icons: 11px
```

---

## 10. Theme toggle

```
IMPLEMENTATION:
- Store theme preference in localStorage key: "rag-ops-theme"
- Default: "light"
- Toggle button in sidebar bottom or settings page
- On toggle: set data-theme attribute on <html>
- All components use CSS variables — theme switch is instant

TOGGLE BUTTON (sidebar bottom):
- Icon: ti-sun (light active) or ti-moon (dark active)
- 30x30px, border-radius var(--radius-sm)
- Background: --bg-surface
- Positioned at bottom of sidebar above run info section
```

---

## 11. Do NOT do

- Do not use Inter, Roboto, Arial, or system-ui as primary fonts.
  Only Plus Jakarta Sans and JetBrains Mono.
- Do not use purple gradients or blue-purple palettes.
  The accent is green (#0F6E56 light, #2DD4A8 dark).
- Do not add drop shadows to cards in light theme.
  The border + page tint provides enough depth.
- Do not use border-radius larger than 16px.
- Do not use decorative illustrations, mascots, or stock art.
- Do not make the sidebar collapsible by default on desktop.
- Do not stack more than 4 metric cards in a row.
- Do not use loading spinners. Use skeleton loading only.
- Do not make the trend chart zoomable or interactive beyond tooltips.
- Do not use any color outside the defined palette.
- Do not put text in all-caps except for section labels and metric card labels.
- Do not use font-weight 700. Maximum is 600, and only for page titles if needed.
- Do not show toasts except for feedback submission.
- Do not center-align body text anywhere.
