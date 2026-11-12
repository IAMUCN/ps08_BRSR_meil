-- Migration 0065: remember whether a person shows where values were read on documents (owner's request,
-- 2026-11-11; D55, .grill/extraction-boxes-toggle-decisions.md).
--
-- The eye button under the document on Verify Extraction draws every extracted value's place on the page,
-- coloured by confidence. The choice is saved on the account (like the theme, D20), so it holds for every
-- document and on every device. Written by the server only (profile.setShowExtractionBoxes), audited.
--
-- Undo: alter table public.users drop column show_extraction_boxes;

alter table public.users
  add column show_extraction_boxes boolean not null default false;

comment on column public.users.show_extraction_boxes is
  'Verify Extraction draws where each value was read, coloured by confidence (the eye button).';
