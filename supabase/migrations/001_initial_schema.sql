-- HealthRAG schema. Run in Supabase SQL Editor.
-- Drops anything from the prior rag-ops schema first.

create extension if not exists vector;

drop table if exists product_metrics cascade;
drop table if exists eval_results cascade;
drop table if exists eval_runs cascade;
drop table if exists eval_golden_dataset cascade;
drop table if exists uploaded_health_reports cascade;
drop table if exists queries cascade;
drop table if exists chunks cascade;
drop table if exists documents cascade;
drop function if exists match_chunks(vector, int, float);


-- ============================================================
-- 1. documents — health content from WHO/CDC/NIH/Indian health/drug DB
-- ============================================================
create table documents (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_url text not null,
  title text not null,
  raw_content text not null,
  content_type text not null check (content_type in (
    'guideline', 'drug_info', 'nutrition', 'disease_info', 'lab_reference', 'procedure'
  )),
  last_updated timestamp,
  created_at timestamp default now()
);
create index idx_documents_source on documents(source);
create index idx_documents_content_type on documents(content_type);


-- ============================================================
-- 2. chunks — 384-dim vectors from all-MiniLM-L6-v2
-- ============================================================
create table chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer not null,
  embedding vector(384),
  metadata jsonb default '{}'::jsonb,
  created_at timestamp default now()
);
create index idx_chunks_document_id on chunks(document_id);
create index chunks_embedding_idx
  on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);


-- ============================================================
-- 3. queries — observability + safety log
-- ============================================================
create table queries (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  session_id text,
  has_health_context boolean default false,
  health_context_summary jsonb,
  retrieved_chunk_ids uuid[] not null,
  retrieved_scores float[] not null,
  generated_answer text not null,
  citations jsonb default '[]'::jsonb,
  model_used text not null,
  latency_ms integer not null,

  disclaimer_present boolean not null default false,
  refused_to_diagnose boolean default false,
  critical_value_flagged boolean default false,
  guardrail_triggered text,

  user_feedback text check (user_feedback in ('positive', 'negative')),
  feedback_comment text,
  created_at timestamp default now()
);
create index idx_queries_created_at on queries(created_at desc);
create index idx_queries_session_id on queries(session_id);


-- ============================================================
-- 4. uploaded_health_reports
-- ============================================================
create table uploaded_health_reports (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  report_type text not null check (report_type in (
    'blood_test', 'prescription', 'lipid_panel', 'thyroid_panel',
    'cbc', 'liver_function', 'kidney_function', 'diabetes_panel', 'other'
  )),
  extracted_values jsonb not null,
  critical_flags jsonb default '[]'::jsonb,
  raw_text text,
  filename text,
  uploaded_at timestamp default now()
);
create index idx_uploaded_reports_session on uploaded_health_reports(session_id, uploaded_at desc);


-- ============================================================
-- 5. eval_golden_dataset
-- ============================================================
create table eval_golden_dataset (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  category text not null check (category in (
    'single_doc', 'multi_doc', 'unanswerable', 'ambiguous', 'contradictory',
    'personalized', 'diagnosis_request', 'critical_value', 'drug_interaction'
  )),
  expected_answer text not null,
  expected_chunk_ids uuid[] default '{}',
  expected_chunk_contents text[] default '{}',
  expected_source_urls text[] default '{}',
  expected_chunk_keywords text[] default '{}',
  mock_health_context jsonb,
  expected_guardrail text check (expected_guardrail in (
    'refuse_diagnosis', 'flag_critical', 'disclaimer_only', 'check_interactions'
  )),
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  notes text
);
create index idx_golden_category on eval_golden_dataset(category);


-- ============================================================
-- 6. eval_runs
-- ============================================================
create table eval_runs (
  id uuid primary key default gen_random_uuid(),
  run_name text not null,
  config jsonb not null,

  retrieval_precision_at_k float,
  retrieval_recall_at_k float,
  retrieval_mrr float,

  generation_faithfulness float,
  generation_completeness float,
  generation_hallucination_rate float,
  generation_relevance float,
  generation_medical_accuracy float,

  guardrail_disclaimer_rate float,
  guardrail_refusal_rate float,
  guardrail_critical_detection_rate float,
  guardrail_overall_pass_rate float,

  total_questions integer,
  run_duration_seconds float,
  created_at timestamp default now()
);
create index idx_eval_runs_created_at on eval_runs(created_at desc);


-- ============================================================
-- 7. eval_results
-- ============================================================
create table eval_results (
  id uuid primary key default gen_random_uuid(),
  eval_run_id uuid references eval_runs(id) on delete cascade,
  question_id uuid references eval_golden_dataset(id),
  question_text text not null,
  category text not null,

  retrieved_chunk_ids uuid[],
  expected_chunk_ids uuid[],
  precision_at_k float,
  recall_at_k float,
  mrr float,

  generated_answer text,
  faithfulness_score float,
  completeness_score float,
  hallucination_detected boolean,
  relevance_score float,
  medical_accuracy_score float,
  judge_reasoning text,

  disclaimer_present boolean,
  expected_guardrail text,
  actual_guardrail_triggered text,
  guardrail_passed boolean,
  guardrail_failure_reason text,

  failure_type text check (failure_type in (
    'retrieval_miss', 'retrieval_noise', 'generation_hallucination',
    'generation_incomplete', 'generation_off_topic',
    'guardrail_missing_disclaimer', 'guardrail_failed_to_refuse',
    'guardrail_missed_critical_value', 'guardrail_false_alarm',
    'none'
  )),

  created_at timestamp default now()
);
create index idx_eval_results_run on eval_results(eval_run_id);


-- ============================================================
-- 8. product_metrics
-- ============================================================
create table product_metrics (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  total_queries integer default 0,
  queries_with_upload integer default 0,
  positive_feedback_count integer default 0,
  negative_feedback_count integer default 0,
  avg_latency_ms float,
  disclaimer_compliance_rate float,
  critical_alerts_triggered integer default 0,
  created_at timestamp default now()
);


-- ============================================================
-- RPC: match_chunks
-- ============================================================
create or replace function match_chunks(
  query_embedding vector(384),
  match_count int default 5,
  similarity_threshold float default 0.3
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    chunks.id, chunks.document_id, chunks.content,
    chunks.metadata, 1 - (chunks.embedding <=> query_embedding) as similarity
  from chunks
  where chunks.embedding is not null
    and 1 - (chunks.embedding <=> query_embedding) > similarity_threshold
  order by chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;
