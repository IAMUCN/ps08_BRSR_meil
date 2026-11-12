-- Grid Electricity records its bill number (feature_enhancement.md Phase 3; agent's decision of 2026-11-08 in
-- .grill/feature-enhancement-roadmap-decisions.md, to confirm; SCHEMA_DEVIATIONS D47).
--
-- Until now an electricity bill captured no bill number, so the "same bill" check (Phase 2) and the Bill no.
-- column could not work for the most common bill. The field is optional: a bill that prints none is still
-- confirmed, and nothing is guessed. The OCR worker already reads it ("Bill No", "Bill Number"); from rules-14
-- it is simply asked for on electricity bills too. The utility the bill already records (Source
-- classification) stands in for the supplier.
--
-- Additive: one configuration row. Records already confirmed keep their values.
-- Undo: delete from public.metric_field_requirements where field_key = 'invoice_number'
--         and metric_id = (select id from public.esg_metrics where code = 'GRID_ELECTRICITY');

insert into public.metric_field_requirements (metric_id, field_key, field_label, data_type, is_required)
select m.id, 'invoice_number', 'Bill number', 'text'::public.field_data_type, false
from public.esg_metrics m
where m.code = 'GRID_ELECTRICITY'
on conflict (metric_id, field_key) do nothing;
