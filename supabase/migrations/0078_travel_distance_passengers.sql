-- Travel and staff buses as distance x passengers (owner's decision, 2026-11-12; .grill/row-upload-decisions.md,
-- D59). Split from 0077 on 2026-11-13: it changes what the code reads for these four activities, so it goes to a
-- database only together with (or after) the code that understands it. Code from before it cannot verify a travel
-- bill read under it (two numbers instead of one).

-- Travel and commuting as distance x passengers (owner's decision: air, rail, road and staff buses). The
-- person no longer works out passenger-km: they type the distance and the passengers, OCR reads both where
-- the ticket prints them (the passengers also from the numbered names), and the engine multiplies.
delete from public.metric_field_requirements req
using public.esg_metrics m
where req.metric_id = m.id and req.field_key = 'quantity'
  and m.code in ('BUSINESS_TRAVEL_AIR', 'BUSINESS_TRAVEL_RAIL', 'BUSINESS_TRAVEL_ROAD', 'COMMUTING_BUS');

insert into public.metric_field_requirements (metric_id, field_key, field_label, data_type, is_required)
select m.id, f.field_key, f.field_label, 'number'::public.field_data_type, true
from public.esg_metrics m
cross join (values
  ('distance', 'Distance of the journey (km)'),
  ('passengers', 'Passengers (people carried)')
) as f (field_key, field_label)
where m.code in ('BUSINESS_TRAVEL_AIR', 'BUSINESS_TRAVEL_RAIL', 'BUSINESS_TRAVEL_ROAD', 'COMMUTING_BUS')
  and not exists (select 1 from public.metric_field_requirements r
                  where r.metric_id = m.id and r.field_key = f.field_key);

update public.metric_field_requirements req
set field_label = 'PNR / ticket number'
from public.esg_metrics m
where req.metric_id = m.id and req.field_key = 'invoice_number'
  and m.code in ('BUSINESS_TRAVEL_AIR', 'BUSINESS_TRAVEL_RAIL', 'BUSINESS_TRAVEL_ROAD');

-- Formula version 2: passenger-km = distance x passengers, then the factor. Version 1 (passenger-km typed as
-- one number) is superseded, not deleted: past calculations point at it. Records verified before this change
-- have no distance or passengers and keep their passenger-km (lib/calculation/engine.ts).
update public.calculation_formulas f
set status = 'superseded'
from public.esg_metrics m
where f.metric_id = m.id and f.status = 'active'
  and m.code in ('BUSINESS_TRAVEL_AIR', 'BUSINESS_TRAVEL_RAIL', 'BUSINESS_TRAVEL_ROAD', 'COMMUTING_BUS');

insert into public.calculation_formulas
  (metric_id, version, formula_type, formula_definition, effective_from, status)
select m.id,
       (select coalesce(max(version), 0) + 1 from public.calculation_formulas x where x.metric_id = m.id),
       'direct_multiply',
       '{"op": "multiply_by_factor", "inputs": ["distance", "passengers"]}'::jsonb,
       '2000-01-01', 'active'
from public.esg_metrics m
where m.code in ('BUSINESS_TRAVEL_AIR', 'BUSINESS_TRAVEL_RAIL', 'BUSINESS_TRAVEL_ROAD', 'COMMUTING_BUS');

-- Undo (only if no calculation uses the new formulas):
--   delete from public.calculation_formulas
--     where formula_definition -> 'inputs' = '["distance", "passengers"]'::jsonb;
--   update public.calculation_formulas set status = 'active' where version 1 of the four metrics;
--   delete the distance / passengers requirements; re-insert quantity ('Distance travelled (passenger-km)');
--   restore the PNR label to 'Invoice / document number'.
