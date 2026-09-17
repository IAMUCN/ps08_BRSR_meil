-- OCR field requirements for the two Phase 5-11 critical-path metrics (05_BACKEND_SCHEMA.md §6.3).
-- Pulled forward from Phases 10-11 so the OCR worker reads *which* fields to extract from configuration
-- (.grill/phase-2b-ocr-worker-decisions.md). Field keys are the ones named in 06_IMPLEMENTATION_PLAN.md
-- Phases 10-11. `is_critical` stays false here; Phases 10-11 decide criticality.

insert into public.metric_field_requirements (metric_id, field_key, field_label, data_type, is_required)
select m.id, f.field_key, f.field_label, f.data_type::public.field_data_type, f.is_required
from public.esg_metrics m
join (values
  ('DIESEL_CONSUMPTION', 'quantity', 'Quantity', 'number', true),
  ('DIESEL_CONSUMPTION', 'unit', 'Unit', 'unit', true),
  ('DIESEL_CONSUMPTION', 'invoice_number', 'Invoice number', 'text', true),
  ('DIESEL_CONSUMPTION', 'billing_period', 'Billing period / invoice date', 'text', true),
  ('GRID_ELECTRICITY', 'consumption', 'Consumption', 'number', true),
  ('GRID_ELECTRICITY', 'unit', 'Unit', 'unit', true),
  ('GRID_ELECTRICITY', 'billing_period', 'Billing period', 'text', true),
  -- Most utility bills don't print a source; the user supplies it at verification when needed.
  ('GRID_ELECTRICITY', 'source_classification', 'Source classification', 'text', false)
) as f (metric_code, field_key, field_label, data_type, is_required)
  on f.metric_code = m.code;
