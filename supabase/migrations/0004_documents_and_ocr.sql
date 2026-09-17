-- Documents and OCR tables (05_BACKEND_SCHEMA.md §8).

-- §8.1 — file bytes live in private Storage; this row is the source of truth for metadata
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units (id),
  reporting_period_id uuid not null references public.reporting_periods (id),
  -- null until OCR or the user identifies the document type
  document_type_id uuid references public.document_types (id),
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  -- SHA-256, for duplicate detection
  file_hash text not null,
  uploaded_by uuid not null references public.users (id),
  upload_status public.document_upload_status not null default 'uploaded',
  related_document_id uuid references public.documents (id),
  created_at timestamptz not null default now(),
  -- soft-delete only: documents are evidence
  deleted_at timestamptz
);

create index documents_org_unit_id_idx on public.documents (org_unit_id);
create index documents_reporting_period_id_idx on public.documents (reporting_period_id);
create index documents_document_type_id_idx on public.documents (document_type_id);
create index documents_uploaded_by_idx on public.documents (uploaded_by);
create index documents_file_hash_idx on public.documents (file_hash);
create index documents_created_at_idx on public.documents (created_at);

-- §8.2 — job queue polled by the Python OCR worker (TRD §11 `document_jobs`)
create table public.ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id),
  status public.ocr_job_status not null default 'pending',
  model_version text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  retry_count integer not null default 0
);

create index ocr_jobs_status_idx on public.ocr_jobs (status);
create index ocr_jobs_document_id_idx on public.ocr_jobs (document_id);

-- §8.3 — append-only, one row per completed job
create table public.ocr_extractions (
  id uuid primary key default gen_random_uuid(),
  ocr_job_id uuid not null unique references public.ocr_jobs (id),
  document_id uuid not null references public.documents (id),
  raw_output jsonb not null,
  extracted_at timestamptz not null default now()
);

create index ocr_extractions_document_id_idx on public.ocr_extractions (document_id);

-- §8.4 — per-field extraction + verification; edit history lives in audit_logs
create table public.ocr_fields (
  id uuid primary key default gen_random_uuid(),
  ocr_extraction_id uuid not null references public.ocr_extractions (id),
  field_key text not null,
  field_label text not null,
  -- null if the field wasn't found; a missing field is never invented
  extracted_value text,
  confidence numeric(5, 2),
  verified_value text,
  verification_status public.ocr_field_verification_status not null default 'pending',
  verified_by uuid references public.users (id),
  verified_at timestamptz,
  unique (ocr_extraction_id, field_key)
);

create index ocr_fields_ocr_extraction_id_idx on public.ocr_fields (ocr_extraction_id);
create index ocr_fields_confidence_idx on public.ocr_fields (confidence);
