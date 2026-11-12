-- The pages of a bill typed on the Upload page (owner's request, 2026-11-13; .grill/row-upload-decisions.md, D59).
-- When a file holds several bills, each bill line says which pages it is ("pages 1 to 2"); the upload is then cut
-- where the person said, without waiting for the OCR's guess. Additive: two nullable columns, safe under code from
-- before it. Numbered across the row's files in the order they were attached.

alter table public.upload_declarations
  add column page_from int,
  add column page_to int,
  add constraint upload_declarations_pages_check
    check ((page_from is null and page_to is null)
           or (page_from >= 1 and page_to >= page_from));

-- The pages are part of what was typed, so they cannot change afterwards either.
create or replace function public.upload_declarations_immutable() returns trigger
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
     or new.bundle_document_id is distinct from old.bundle_document_id
     or new.page_from is distinct from old.page_from
     or new.page_to is distinct from old.page_to then
    raise exception 'Typed values are kept as they were typed' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.upload_declarations_immutable() from public, anon, authenticated;

-- Undo:
--   alter table public.upload_declarations drop constraint upload_declarations_pages_check,
--     drop column page_from, drop column page_to;
--   (and re-create the trigger function without the page columns, as in 0077)
