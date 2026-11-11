-- Migration 0063: an optional description on an uploaded document (owner's request, 2026-11-11; D53,
-- .grill/upload-description-progress-decisions.md).
--
-- Typed by the uploader on Upload (optional), shown on Verify, the record panel, My Uploads and Submission
-- Monitoring, searched and exported. The uploader may change it until the record is approved or rejected; the
-- server checks that and writes an audit entry. A bill cut out of a multi-bill PDF takes the PDF's description.
-- No browser write grant is added: documents stay server-written (D1).

alter table public.documents
  add column description text
    constraint documents_description_length check (description is null or char_length(description) between 1 and 500);

comment on column public.documents.description is
  'Optional free text from the uploader (at most 500 characters); null when none was given.';
