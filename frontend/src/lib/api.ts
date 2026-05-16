const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

// ===== session id (persisted in localStorage) =====

const SESSION_KEY = "healthrag.session_id";

export function getSessionId(): string {
  let sid = localStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

export function resetSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ===== domain types =====

export interface Source {
  chunk_id: string;
  content: string;
  similarity_score: number;
  reranker_score: number | null;
  source_url: string;
  document_title: string;
  section_title: string;
}

export interface CriticalFlag {
  parameter: string;
  value: number;
  unit: string;
  threshold: number;
  threshold_kind: "high" | "low";
  severity: string;
  action: string;
}

export interface GuardrailInfo {
  intent: string;
  passed: boolean;
  failure_reason: string | null;
  disclaimer_present: boolean;
  refused_diagnosis: boolean;
  flagged_critical: boolean;
}

export interface QueryResponse {
  query_id: string;
  answer: string;
  citations: { source_number: number; chunk_id: string; source_url: string; quote: string }[];
  sources: Source[];
  latency_ms: number;
  model_used: string;
  backend: string;
  retrieval_threshold_hit: boolean;
  has_health_context: boolean;
  health_context_parameters: string[];
  critical_flags: CriticalFlag[];
  guardrail: GuardrailInfo;
}

export interface ParsedParameter {
  canonical_name: string;
  value: number;
  unit: string;
  status: "normal" | "low" | "high" | "critical_low" | "critical_high" | "unknown";
  ref_range: string;
  raw_name: string;
}

export interface UploadResponse {
  report_id: string;
  report_type: string;
  summary: string;
  patient_info: Record<string, any>;
  parameters: Record<string, ParsedParameter>;
  critical_flags: CriticalFlag[];
}

export interface LatestReport {
  id: string;
  session_id: string;
  report_type: string;
  extracted_values: Record<string, ParsedParameter>;
  critical_flags: CriticalFlag[];
  filename: string;
  uploaded_at: string;
}

// ===== API calls =====

export async function postQuery(question: string, useReranker = true): Promise<QueryResponse> {
  const res = await fetch(`${API_BASE}/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      question,
      use_reranker: useReranker,
      session_id: getSessionId(),
    }),
  });
  if (!res.ok) throw new Error(`query failed: ${res.status}`);
  return res.json();
}

export async function uploadLabReport(file: File): Promise<UploadResponse> {
  const fd = new FormData();
  fd.append("session_id", getSessionId());
  fd.append("file", file);
  const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: fd });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`upload failed: ${res.status} ${txt}`);
  }
  return res.json();
}

export async function fetchLatestReport(): Promise<LatestReport | null> {
  const res = await fetch(`${API_BASE}/upload/latest?session_id=${getSessionId()}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json && json.id ? json : null;
}

export async function clearUploads(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/upload?session_id=${getSessionId()}`, {
    method: "DELETE",
  });
  return res.ok;
}

export async function postFeedback(
  query_id: string,
  rating: "positive" | "negative",
  comment?: string
) {
  const res = await fetch(`${API_BASE}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query_id, rating, comment }),
  });
  return res.ok;
}

// ===== eval dashboard =====

export interface EvalRun {
  id: string;
  run_name: string;
  config: any;
  retrieval_precision_at_k: number | null;
  retrieval_recall_at_k: number | null;
  retrieval_mrr: number | null;
  generation_faithfulness: number | null;
  generation_completeness: number | null;
  generation_hallucination_rate: number | null;
  generation_relevance: number | null;
  generation_medical_accuracy: number | null;
  guardrail_disclaimer_rate: number | null;
  guardrail_refusal_rate: number | null;
  guardrail_critical_detection_rate: number | null;
  guardrail_overall_pass_rate: number | null;
  total_questions: number | null;
  run_duration_seconds: number | null;
  created_at: string;
}

export interface EvalResult {
  id: string;
  eval_run_id: string;
  question_text: string;
  category: string;
  retrieved_chunk_ids: string[];
  expected_chunk_ids: string[] | null;
  precision_at_k: number;
  recall_at_k: number;
  mrr: number;
  generated_answer: string;
  faithfulness_score: number;
  completeness_score: number;
  hallucination_detected: boolean;
  relevance_score: number;
  medical_accuracy_score: number;
  judge_reasoning: string | null;
  disclaimer_present: boolean;
  expected_guardrail: string | null;
  actual_guardrail_triggered: string | null;
  guardrail_passed: boolean;
  guardrail_failure_reason: string | null;
  failure_type: string;
}

export async function getEvalRuns(): Promise<EvalRun[]> {
  const res = await fetch(`${API_BASE}/eval/runs`);
  if (!res.ok) throw new Error("failed to load eval runs");
  return res.json();
}

export async function getEvalResults(runId: string): Promise<EvalResult[]> {
  const res = await fetch(`${API_BASE}/eval/runs/${runId}/results`);
  if (!res.ok) throw new Error("failed to load eval results");
  return res.json();
}
