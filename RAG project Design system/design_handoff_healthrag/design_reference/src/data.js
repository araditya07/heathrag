// Mock data for RAG Ops dashboard.
// All numbers are inventions, but proportions are chosen to make charts read clearly.

const EVAL_RUNS = [
  { id: 'r6', name: 'Run 18',     date: '2026-05-12', p5: 0.81, r5: 0.86, mrr: 0.88, faithfulness: 4.3, hallucination: 0.02, config: 'production', current: true },
  { id: 'r5', name: '+ Filter',   date: '2026-05-04', p5: 0.78, r5: 0.84, mrr: 0.86, faithfulness: 4.2, hallucination: 0.03, config: 'production' },
  { id: 'r4', name: '+HyDE',      date: '2026-04-28', p5: 0.74, r5: 0.81, mrr: 0.82, faithfulness: 4.1, hallucination: 0.04, config: 'experiment' },
  { id: 'r3', name: 'Chunk 1024', date: '2026-04-22', p5: 0.70, r5: 0.77, mrr: 0.78, faithfulness: 3.9, hallucination: 0.06, config: 'experiment' },
  { id: 'r2', name: '+Reranker',  date: '2026-04-14', p5: 0.66, r5: 0.74, mrr: 0.72, faithfulness: 3.8, hallucination: 0.07, config: 'experiment' },
  { id: 'r1', name: 'Baseline',   date: '2026-04-02', p5: 0.62, r5: 0.71, mrr: 0.68, faithfulness: 3.6, hallucination: 0.09, config: 'baseline' },
];

const CATEGORIES = [
  { id: 'single-doc',    label: 'single-doc',    pill: 'info',    p5: 0.88 },
  { id: 'ambiguous',     label: 'ambiguous',     pill: 'accent',  p5: 0.74 },
  { id: 'multi-doc',     label: 'multi-doc',     pill: 'warning', p5: 0.62 },
  { id: 'unanswerable',  label: 'unanswerable',  pill: 'danger',  p5: 0.41 },
  { id: 'contradictory', label: 'contradictory', pill: 'purple',  p5: 0.35 },
];

const FAILURES = [
  {
    id: 'f1',
    category: 'multi-doc',
    pill: 'warning',
    question: 'What is the process for requesting a team transfer when the receiving manager has not yet posted the role?',
    p5: 0.20, r5: 0.33, mrr: 0.14,
    expected: [
      'handbook/people/transfers.md#process',
      'handbook/people/internal-mobility.md#L42',
    ],
    retrieved: [
      { path: 'handbook/people/onboarding.md',   rel: 'irrelevant' },
      { path: 'handbook/people/promotions.md',   rel: 'tangential' },
      { path: 'handbook/people/peer-reviews.md', rel: 'irrelevant' },
    ],
  },
  {
    id: 'f2',
    category: 'unanswerable',
    pill: 'danger',
    question: 'How many people work at our largest customer’s European subsidiary?',
    p5: 0.00, r5: 0.00, mrr: 0.00,
    expected: ['(no relevant chunks — this is unanswerable)'],
    retrieved: [
      { path: 'handbook/sales/accounts.md',       rel: 'tangential' },
      { path: 'handbook/legal/eu-data.md',        rel: 'irrelevant' },
    ],
  },
  {
    id: 'f3',
    category: 'multi-doc',
    pill: 'warning',
    question: 'How do Stripe radius rules interact with manual review queues for cards issued in Brazil?',
    p5: 0.20, r5: 0.40, mrr: 0.25,
    expected: [
      'stripe-docs/radar/rules.md#manual-review',
      'stripe-docs/issuing/brazil.md#L88',
    ],
    retrieved: [
      { path: 'stripe-docs/radar/overview.md', rel: 'tangential' },
      { path: 'stripe-docs/issuing/cards.md',  rel: 'tangential' },
      { path: 'stripe-docs/disputes/intro.md', rel: 'irrelevant' },
    ],
  },
  {
    id: 'f4',
    category: 'contradictory',
    pill: 'purple',
    question: 'Is on-call compensation paid hourly or as a flat weekly stipend?',
    p5: 0.40, r5: 0.50, mrr: 0.40,
    expected: [
      'handbook/engineering/on-call.md#L120',
      'handbook/finance/compensation.md#oncall',
    ],
    retrieved: [
      { path: 'handbook/engineering/on-call.md',  rel: 'relevant' },
      { path: 'handbook/finance/compensation-2024.md', rel: 'irrelevant' },
      { path: 'handbook/engineering/incident-response.md', rel: 'tangential' },
    ],
  },
];

const GEN_FAILURES = [
  {
    id: 'g1',
    question: 'What is GitLab’s home office stipend amount?',
    answer: 'GitLab provides a one-time $2,000 home office stipend to set up your workspace, plus a monthly $200 internet reimbursement for remote workers.',
    halluc: '$2,000', halluc2: 'monthly $200 internet reimbursement',
    judge: 'Faithfulness 2/5. The stipend is $1,500 not $2,000, and there is no monthly internet reimbursement in the source documents.',
  },
  {
    id: 'g2',
    question: 'How does the company handle parental leave for adoptive parents?',
    answer: 'Adoptive parents receive 16 weeks of paid leave, identical to birth parents. Documentation must be submitted within 30 days of the placement.',
    halluc: 'within 30 days of the placement',
    judge: 'Faithfulness 3/5. The 16-week figure is correct, but the 30-day submission window is not documented in the handbook.',
  },
];

const EXAMPLE_QUESTIONS = [
  'How do I request a team transfer?',
  "What’s the WFH stipend at GitLab?",
  'How does Stripe handle disputed chargebacks?',
  'What is our parental leave policy?',
];

// Example search result for the search page
const SAMPLE_ANSWER = {
  question: 'What is the home office stipend at GitLab?',
  latency: '1.8s',
  body: [
    { text: 'GitLab provides a one-time $1,500 home-office stipend for ergonomic equipment and monitors ' },
    { cite: 1 },
    { text: '. Standard office supplies (paper, pens, basic accessories) fall under the general expense-reimbursement policy ' },
    { cite: 2 },
    { text: '.' },
  ],
  sources: [
    { id: 1, score: 0.82, path: 'handbook/finance/expenses.md', content: '"GitLab provides a one-time $1,500 home office stipend to set up your workspace. The stipend covers ergonomic equipment, monitors, and standard office supplies up to the cap. Reimbursement is processed via Expensify within 14 days."' },
    { id: 2, score: 0.71, path: 'handbook/finance/general.md', content: '"Office supplies are reimbursable under the general expense policy. Submit via Expensify; manager approval required for items over $250. Receipts must be itemized."' },
    { id: 3, score: 0.58, path: 'handbook/people/remote-work.md', content: '"Remote employees should consult their manager about workspace setup. The home-office stipend is a one-time benefit and does not recur annually."' },
  ],
  count: '5 chunks from 3 documents',
};

const SAMPLE_IDK = {
  question: 'How many people work at our largest customer’s European subsidiary?',
  body: "I don't have enough information in the knowledge base to answer this question. This topic may not be covered in the current documentation.",
  suggestions: [
    'How is account ownership transferred between AEs?',
    'What is the customer-tier definition for ELC?',
    'Where are EU customer-data residency rules documented?',
  ],
};

const IDK_TRIGGERS = [
  /largest customer/i, /european subsidiary/i, /how many people work/i,
  /sponsor.*work.*visa/i, /work visa/i, /visa sponsor/i,
];

// 14-day product-metrics series, shared by metrics page
const METRICS_SERIES = {
  '7d': {
    volume:        [600, 640, 680, 720, 700, 760, 810],
    satisfaction:  [0.83, 0.85, 0.86, 0.85, 0.87, 0.86, 0.88],
    latency:       [1.9, 1.85, 1.8, 1.85, 1.8, 1.75, 1.8],
    labels:        ['May 5', 'May 6', 'May 7', 'May 8', 'May 9', 'May 10', 'May 11'],
    totals: { queries: '5,310', sat: '86%', lat: '1.8s', followup: '23%' },
  },
  '30d': {
    volume:        [420, 460, 480, 510, 540, 530, 560, 580, 600, 610, 620, 640, 660, 680, 700, 720, 730, 720, 750, 770, 790, 800, 780, 810, 830, 850, 870, 850, 870, 900],
    satisfaction:  [0.74, 0.74, 0.75, 0.76, 0.76, 0.77, 0.78, 0.79, 0.80, 0.80, 0.81, 0.82, 0.82, 0.82, 0.83, 0.83, 0.84, 0.84, 0.84, 0.85, 0.85, 0.86, 0.85, 0.86, 0.86, 0.87, 0.87, 0.87, 0.87, 0.88],
    latency:       [2.4, 2.3, 2.4, 2.3, 2.2, 2.2, 2.2, 2.1, 2.1, 2.0, 2.0, 1.9, 1.9, 1.95, 1.9, 1.9, 1.85, 1.85, 1.8, 1.85, 1.8, 1.8, 1.85, 1.8, 1.75, 1.8, 1.75, 1.75, 1.8, 1.8],
    labels:        ['Apr 12', '', '', '', 'Apr 16', '', '', '', 'Apr 20', '', '', '', 'Apr 24', '', '', '', 'Apr 28', '', '', '', 'May 2', '', '', '', 'May 6', '', '', '', 'May 10', 'May 11'],
    totals: { queries: '14,820', sat: '86%', lat: '1.85s', followup: '23%' },
  },
  'all': {
    volume:        [120, 140, 180, 240, 300, 360, 420, 480, 520, 560, 600, 640, 700, 760, 820, 880],
    satisfaction:  [0.62, 0.66, 0.68, 0.70, 0.72, 0.74, 0.76, 0.78, 0.79, 0.81, 0.83, 0.84, 0.85, 0.86, 0.87, 0.88],
    latency:       [3.2, 3.0, 2.8, 2.6, 2.5, 2.4, 2.3, 2.2, 2.1, 2.0, 1.9, 1.85, 1.8, 1.8, 1.75, 1.8],
    labels:        ['Jan', '', '', 'Feb', '', '', 'Mar', '', '', 'Apr', '', '', 'May', '', '', 'Now'],
    totals: { queries: '78,440', sat: '82%', lat: '2.0s', followup: '24%' },
  },
};

// Expanded generation-failure data with judge reasoning + retrieved context
const GEN_FAILURES_FULL = [
  {
    id: 'g1',
    category: 'single-doc',
    pill: 'info',
    question: 'What is GitLab’s home office stipend amount?',
    scores: { faith: 2.0, comp: 4.0, rel: 4.2 },
    hallucinated: true,
    answer: 'GitLab provides a one-time $2,000 home office stipend to set up your workspace, plus a monthly $200 internet reimbursement for remote workers.',
    halluc: ['$2,000', 'monthly $200 internet reimbursement'],
    judge: 'The amount is documented as $1,500, not $2,000. The "monthly $200 internet reimbursement" has no supporting evidence in any retrieved chunk — the model appears to have generated this from parametric memory rather than the provided context.',
    retrieved: [
      { path: 'handbook/finance/expenses.md#home-office', score: 0.82 },
      { path: 'handbook/people/remote-work.md',          score: 0.71 },
    ],
  },
  {
    id: 'g2',
    category: 'multi-doc',
    pill: 'warning',
    question: 'How does the company handle parental leave for adoptive parents?',
    scores: { faith: 3.0, comp: 3.5, rel: 4.0 },
    hallucinated: true,
    answer: 'Adoptive parents receive 16 weeks of paid leave, identical to birth parents. Documentation must be submitted within 30 days of the placement.',
    halluc: ['within 30 days of the placement'],
    judge: 'The 16-week figure is correctly grounded in handbook/people/parental-leave.md. The "30-day submission window" claim has no supporting evidence in any retrieved chunk — likely fabricated.',
    retrieved: [
      { path: 'handbook/people/parental-leave.md',  score: 0.79 },
      { path: 'handbook/people/adoption.md',        score: 0.68 },
    ],
  },
  {
    id: 'g3',
    category: 'contradictory',
    pill: 'purple',
    question: 'What is the approval threshold for travel expenses?',
    scores: { faith: 2.3, comp: 4.0, rel: 4.2 },
    hallucinated: true,
    answer: 'Travel expenses above $500 require manager approval. For international travel, VP-level approval is needed regardless of amount.',
    halluc: ['VP-level approval is needed regardless of amount'],
    judge: 'The $500 threshold appears in the context, but the claim about "VP-level approval for international travel" has no supporting evidence in any retrieved chunk. The retrieved policy says international travel only requires manager approval like domestic travel.',
    retrieved: [
      { path: 'handbook/finance/travel.md#approval', score: 0.81 },
      { path: 'handbook/finance/expenses.md',        score: 0.67 },
    ],
  },
];

window.RAG_DATA = { EVAL_RUNS, CATEGORIES, FAILURES, GEN_FAILURES, GEN_FAILURES_FULL, EXAMPLE_QUESTIONS, SAMPLE_ANSWER, SAMPLE_IDK, IDK_TRIGGERS, METRICS_SERIES };
