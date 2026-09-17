-- Private evidence bucket (05_BACKEND_SCHEMA.md §15; .grill/phase-5-document-ingestion-decisions.md).
-- Path: {org_unit_id}/{reporting_period_id}/{document_id}/original.{ext}
--
-- No storage.objects policies are created for anon/authenticated: clients can neither list, read nor
-- write objects directly. Bytes go in through a server-issued signed upload URL and come out through a
-- server-issued short-lived signed URL, each minted only after the server's authorization check (D3).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence',
  'evidence',
  false,
  52428800, -- 50 MB, also enforced in the browser and by the completion procedure
  array['application/pdf', 'image/jpeg', 'image/png']
);
