-- Multi-bill PDFs (schema deviation D24; .grill/multi-bill-pdf-decisions.md): one PDF holding several
-- bills of different activities. The OCR worker reads every page and *proposes* how the pages split
-- into bills and which activity each is; the uploader confirms, and each bill then becomes an ordinary
-- document + record + OCR job (its own PDF), so verification, validation and calculation are unchanged.

-- The uploaded multi-bill PDF is a document of its own (it keeps the original as evidence) with no record.
-- Each bill cut from it points back at it.
alter table public.documents
  add column is_bundle boolean not null default false,
  add column bundle_document_id uuid references public.documents (id);
create index documents_bundle_document_id_idx
  on public.documents (bundle_document_id) where bundle_document_id is not null;

-- The proposed split. `page_from`/`page_to` (1-based, inclusive) and `proposed_metric_id` are what the
-- uploader may edit before confirming; the confirmation (and the original proposal) is in the audit log.
create table public.document_bundle_parts (
  id uuid primary key default gen_random_uuid(),
  bundle_document_id uuid not null references public.documents (id),
  part_number int not null check (part_number >= 1),
  page_from int not null check (page_from >= 1),
  page_to int not null,
  proposed_document_type_id uuid references public.document_types (id),
  proposed_metric_id uuid references public.esg_metrics (id),
  status text not null default 'proposed' check (status in ('proposed', 'created', 'skipped')),
  created_document_id uuid references public.documents (id),
  created_at timestamptz not null default now(),
  unique (bundle_document_id, part_number),
  check (page_to >= page_from)
);
create index document_bundle_parts_created_document_id_idx
  on public.document_bundle_parts (created_document_id) where created_document_id is not null;

-- Server-only, like rate_limit_events: RLS on, no policies, no browser grants. The app reads and writes
-- it through procedures that check the uploader's session and scope.
alter table public.document_bundle_parts enable row level security;
revoke all on public.document_bundle_parts from anon, authenticated;
