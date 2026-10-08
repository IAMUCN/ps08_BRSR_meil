-- Phase 17 (SCHEMA_DEVIATIONS.md D18): what a mapped metric contributes to its BRSR indicator — the calculated
-- result (emissions, water consumed, a percentage) or the verified quantity itself. BRSR P6-E8 asks for the
-- waste quantity in metric tonnes, not the emissions that quantity causes (which P6-L4 reports).
alter table public.brsr_metric_mappings
  add column reported_value text not null default 'result'
  constraint brsr_metric_mappings_reported_value check (reported_value in ('result', 'activity'));

update public.brsr_metric_mappings x
set reported_value = 'activity',
    mapping_notes = 'Waste disposed, by disposal method: the verified quantity (kilograms, with metric tonnes).'
from public.esg_metrics m, public.brsr_indicators i
where m.id = x.esg_metric_id and i.id = x.brsr_indicator_id
  and m.code = 'WASTE_DISPOSED' and i.code = 'P6-E8';
