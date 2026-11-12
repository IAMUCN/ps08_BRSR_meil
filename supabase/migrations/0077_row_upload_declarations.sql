-- Upload by rows, typed values checked against the document (owner's request after the mid evaluation,
-- 2026-11-12; .grill/row-upload-decisions.md, D58). The Upload page is a table: each row says what is being
-- submitted (bill type, reporting period, the value typed by the person, the unit) and carries its evidence,
-- which is required. The OCR reading of the evidence is then compared with what was typed.
-- Additive only (new tables, one nullable column), so it is safe under the code deployed before it. Travel as
-- distance x passengers is migration 0078, which must wait for the code that reads it.

-- One row (or one sub-row: a bill inside a file of several) as the person typed it. Kept apart from the OCR
-- fields so the typed value is never overwritten by a reading or a correction. `mode`:
--   bill          one bill: one record (the default, and each sub-row)
--   pages_of_one  several files that are the pages of one bill: one record
--   total         several separate bills; the values are their total: one record per bill, all pointing here
create table public.upload_declarations (
  id uuid primary key default gen_random_uuid(),
  bundle_document_id uuid not null references public.documents (id),
  position int not null check (position >= 1),
  metric_id uuid not null references public.esg_metrics (id),
  reporting_period_id uuid not null references public.reporting_periods (id),
  mode text not null default 'bill' check (mode in ('bill', 'pages_of_one', 'total')),
  -- The typed values by field key, as typed ({"quantity": "850", "unit": "L"}); numbers as text.
  declared_values jsonb not null check (jsonb_typeof(declared_values) = 'object'),
  declared_by uuid not null references public.users (id),
  declared_at timestamptz not null default now(),
  unique (bundle_document_id, position)
);
create index upload_declarations_metric_idx on public.upload_declarations (metric_id);

-- The record a declaration became (several for a total). Null for records from before this change.
alter table public.esg_records
  add column upload_declaration_id uuid references public.upload_declarations (id);
create index esg_records_upload_declaration_idx on public.esg_records (upload_declaration_id)
  where upload_declaration_id is not null;

-- What a person typed is evidence of what they claimed: it never changes after it is recorded.
create function public.upload_declarations_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Typed values are kept with the upload' using errcode = '42501';
  end if;
  if new.declared_values is distinct from old.declared_values
     or new.metric_id is distinct from old.metric_id
     or new.reporting_period_id is distinct from old.reporting_period_id
     or new.mode is distinct from old.mode
     or new.declared_by is distinct from old.declared_by
     or new.bundle_document_id is distinct from old.bundle_document_id then
    raise exception 'Typed values are kept as they were typed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger upload_declarations_immutable
  before update or delete on public.upload_declarations
  for each row execute function public.upload_declarations_immutable();
revoke execute on function public.upload_declarations_immutable() from public, anon, authenticated;

-- An unfinished Upload table, saved as the person types (owner's choice: drafts). One per person; files are
-- not part of a draft (they are attached again).
create table public.upload_drafts (
  user_id uuid primary key references public.users (id),
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  updated_at timestamptz not null default now()
);

-- Server-only, like the other upload tables.
alter table public.upload_declarations enable row level security;
alter table public.upload_drafts enable row level security;
revoke all on public.upload_declarations from anon, authenticated;
revoke all on public.upload_drafts from anon, authenticated;

-- Undo:
--   alter table public.esg_records drop column upload_declaration_id;
--   drop table public.upload_drafts; drop table public.upload_declarations;
--   drop function public.upload_declarations_immutable();
