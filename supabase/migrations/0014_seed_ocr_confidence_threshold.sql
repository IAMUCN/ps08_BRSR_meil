-- Phase 6: the OCR confidence threshold is configuration, seeded once for every environment
-- (SCHEMA_DEVIATIONS D13, .grill/phase-6-ocr-integration-decisions.md). Percent, same 0–100 scale as
-- ocr_fields.confidence. updated_by is null for system-seeded values; every Admin change sets it.
alter table public.org_settings alter column updated_by drop not null;

insert into public.org_settings (key, value, updated_by)
values ('ocr_confidence_threshold', '80'::jsonb, null)
on conflict (key) do nothing;
