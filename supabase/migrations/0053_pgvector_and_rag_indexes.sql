-- Migration 0053: pgvector setup and RAG Knowledge Base (Milestone 2)
-- Enables:
-- 1. pgvector extension for high-performance vector similarity search (cosine distance).
-- 2. rag_knowledge_chunks table for hybrid search across verified records, evidence documents, and BRSR indicators.
-- 3. HNSW vector index & GIN full-text search index.
-- 4. Permission-aware retrieval function with org_unit_id filtering.

-- Enable pgvector extension
create extension if not exists vector;

-- RAG Knowledge Chunks table
create table if not exists public.rag_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('esg_record', 'document', 'brsr_indicator', 'calculation', 'decision_rule')),
  source_id text not null,
  org_unit_id uuid references public.org_units(id) on delete cascade,
  reporting_period_id uuid references public.reporting_periods(id) on delete cascade,
  data_classification text not null check (data_classification in (
    'PUBLIC_BRSR_GUIDELINES',
    'SYNTHETIC_ESG_DATA',
    'AGGREGATED_ESG_METRICS',
    'CONFIDENTIAL_INVOICES',
    'EMPLOYEE_INFORMATION',
    'FINANCIAL_RECORDS'
  )),
  title text not null,
  content text not null,
  tsv tsvector generated always as (to_tsvector('english', title || ' ' || content)) stored,
  embedding vector(768),
  metadata jsonb not null default '{}'::jsonb,
  citation_label text not null,
  is_verified boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (source_type, source_id)
);

-- Full-text GIN index for keyword search
create index if not exists rag_chunks_tsv_idx 
  on public.rag_knowledge_chunks using gin (tsv);

-- HNSW Index for ultra-fast vector similarity search (<=> cosine distance)
create index if not exists rag_chunks_embedding_hnsw_idx 
  on public.rag_knowledge_chunks using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- B-Tree indexes for permission and metadata filtering
create index if not exists rag_chunks_org_unit_idx 
  on public.rag_knowledge_chunks (org_unit_id);
create index if not exists rag_chunks_source_type_idx 
  on public.rag_knowledge_chunks (source_type);
create index if not exists rag_chunks_classification_idx 
  on public.rag_knowledge_chunks (data_classification);

-- Row Level Security
alter table public.rag_knowledge_chunks enable row level security;

create policy rag_chunks_read on public.rag_knowledge_chunks
  for select to authenticated using (true);

revoke insert, update, delete on public.rag_knowledge_chunks from anon, public;

-- Hybrid search stored procedure (Vector Cosine + Text Rank + Permission Filter)
create or replace function public.hybrid_search_rag_chunks(
  query_text text,
  query_embedding vector(768),
  match_count int,
  authorized_org_units uuid[] default null,
  allowed_classifications text[] default null,
  min_similarity float default 0.25
)
returns table (
  id uuid,
  source_type text,
  source_id text,
  org_unit_id uuid,
  reporting_period_id uuid,
  data_classification text,
  title text,
  content text,
  citation_label text,
  metadata jsonb,
  is_verified boolean,
  similarity float,
  text_rank float,
  combined_score float
)
language sql stable
as $$
  with vector_matches as (
    select
      c.id,
      c.source_type,
      c.source_id,
      c.org_unit_id,
      c.reporting_period_id,
      c.data_classification,
      c.title,
      c.content,
      c.citation_label,
      c.metadata,
      c.is_verified,
      case 
        when query_embedding is not null and c.embedding is not null
        then 1 - (c.embedding <=> query_embedding)
        else 0
      end as similarity,
      case 
        when query_text is not null and length(trim(query_text)) > 0
        then ts_rank_cd(c.tsv, plainto_tsquery('english', query_text))
        else 0
      end as text_rank
    from public.rag_knowledge_chunks c
    where
      -- Permission-aware filter: match if org_unit_id is null (public BRSR) or in authorized set
      (authorized_org_units is null or c.org_unit_id is null or c.org_unit_id = any(authorized_org_units))
      -- Classification filter
      and (allowed_classifications is null or c.data_classification = any(allowed_classifications))
  )
  select
    v.id,
    v.source_type,
    v.source_id,
    v.org_unit_id,
    v.reporting_period_id,
    v.data_classification,
    v.title,
    v.content,
    v.citation_label,
    v.metadata,
    v.is_verified,
    v.similarity,
    v.text_rank,
    -- Hybrid Reciprocal Score: 60% dense vector + 40% full-text rank
    ((v.similarity * 0.6) + (least(v.text_rank, 1.0) * 0.4)) as combined_score
  from vector_matches v
  where (v.similarity >= min_similarity or v.text_rank > 0.05)
  order by combined_score desc
  limit match_count;
$$;
