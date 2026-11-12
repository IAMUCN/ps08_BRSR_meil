-- One upload for every bill (owner's request, 2026-11-12; .grill/merged-upload-decisions.md, D57).
-- Every upload is now a "bundle": one or more files (PDFs and photos) whose pages the OCR worker reads and
-- splits into bills; the uploader confirms the split, the activity and the reporting period of each bill.

-- What the worker read on each proposed bill, so the review screen can propose its reporting period and
-- show why; and the reporting period the uploader chose for it (null on a proposal: the batch's period).
alter table public.document_bundle_parts
  add column billing_period text,
  add column bill_number text,
  add column reporting_period_id uuid references public.reporting_periods (id);

-- The original files of one upload, in the order they were dropped. Their pages, one after another, are the
-- pages of the bundle (a single PDF is the bundle itself; several files or a photo are joined into one PDF
-- that is read and cut). A bill that is exactly one whole file is recorded from that file, unchanged.
create table public.document_bundle_sources (
  bundle_document_id uuid not null references public.documents (id),
  position int not null check (position >= 1),
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  file_hash text not null,
  storage_path text not null,
  page_from int not null check (page_from >= 1),
  page_to int not null,
  created_at timestamptz not null default now(),
  primary key (bundle_document_id, position),
  check (page_to >= page_from)
);
create index document_bundle_sources_file_hash_idx on public.document_bundle_sources (file_hash);

-- Server-only, like document_bundle_parts.
alter table public.document_bundle_sources enable row level security;
revoke all on public.document_bundle_sources from anon, authenticated;

-- Undo:
--   drop table public.document_bundle_sources;
--   alter table public.document_bundle_parts drop column reporting_period_id, drop column bill_number,
--     drop column billing_period;
