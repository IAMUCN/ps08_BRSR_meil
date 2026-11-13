-- The fields SEBI's tables are built from become required (owner's request, 2026-11-13; .grill/brsr-gaps-decisions.md).
-- Left empty, a record lands in "not stated" rows of the report (P6-E3 water by source, P6-E9 waste by category
-- and by operation, P8-E4 purchases within India). Required now, the person fills them on Verify (OCR still reads
-- them where the document prints them). Validation also flags text that matches none of SEBI's groups.
--
-- Existing records are not touched: a record verified before this keeps its values. Code from before this
-- migration simply asks for the fields as well.

update public.metric_field_requirements r
set is_required = true,
    field_label = 'Water source (surface water / groundwater / third party / seawater / other)'
from public.esg_metrics m
where r.metric_id = m.id and m.code = 'WATER_CONSUMPTION' and r.field_key = 'source_classification';

update public.metric_field_requirements r
set field_label = 'Treatment before discharge (none, or primary / secondary / tertiary)'
from public.esg_metrics m
where r.metric_id = m.id and m.code = 'WATER_CONSUMPTION' and r.field_key = 'discharge_treatment';

update public.metric_field_requirements r
set is_required = true,
    field_label = 'Treatment route (recycled / re-used / other recovery / incineration / landfilling / other disposal)'
from public.esg_metrics m
where r.metric_id = m.id and m.code = 'WASTE_DISPOSED' and r.field_key = 'source_classification';

update public.metric_field_requirements r
set is_required = true
from public.esg_metrics m
where r.metric_id = m.id and m.code = 'WASTE_DISPOSED' and r.field_key = 'waste_category';

update public.metric_field_requirements r
set is_required = true
from public.esg_metrics m
where r.metric_id = m.id and m.code = 'MSME_PROCUREMENT' and r.field_key = 'india_spend';

-- Undo: set is_required = false on the five fields above (labels may stay).
