-- Two of SEBI's questions move from typed text to evidence-backed figures (owner's request, 2026-10-09;
-- .grill/safety-and-water-discharge-decisions.md, SCHEMA_DEVIATIONS.md D33).
--   P3-E11  Details of safety related incidents — from a safety incident statement.
--   P6-E4   Water discharged, by destination and level of treatment — from the water record.
-- Both are configuration in the shape the earlier activities used; the engine gains one optional
-- parameter (a rate's scale) and nothing else.

-- ── Safety incidents ────────────────────────────────────────────────────────────────────────────────────
insert into public.esg_categories (name, owning_role_id, description)
select 'Health & Safety', r.id, 'Safety incident statements: hours worked, injuries and fatalities.'
from public.roles r where r.code = 'ehs';

-- SEBI asks for employees and workers separately, so each is its own activity (no free text to classify).
-- The calculated result is the lost time injury frequency rate; the counts on the statement feed the rest
-- of SEBI's table.
insert into public.esg_metrics (
  category_id, code, name, unit, scope_id,
  requires_conversion_factor, requires_calculation, frequency, description
)
select c.id, v.code, v.name, 'per million person-hours', null, false, true, 'monthly', v.description
from (values
  ('SAFETY_EMPLOYEES', 'Safety incidents — employees',
   'Hours worked, injuries and fatalities among employees, from a safety incident statement. Result: lost time injury frequency rate.'),
  ('SAFETY_WORKERS', 'Safety incidents — workers',
   'Hours worked, injuries and fatalities among workers (including contract workers), from a safety incident statement. Result: lost time injury frequency rate.')
) as v (code, name, description)
join public.esg_categories c on c.name = 'Health & Safety';

insert into public.metric_field_requirements (metric_id, field_key, field_label, data_type, is_required)
select m.id, f.field_key, f.field_label, f.data_type::public.field_data_type, true
from public.esg_metrics m
cross join (values
  ('person_hours', 'Person-hours worked', 'number'),
  ('lost_time_injuries', 'Lost time injuries', 'number'),
  ('recordable_injuries', 'Total recordable work-related injuries', 'number'),
  ('fatalities', 'Fatalities', 'number'),
  ('high_consequence_injuries', 'High consequence work-related injuries or ill-health (excluding fatalities)',
   'number'),
  ('billing_period', 'Statement period', 'text')
) as f (field_key, field_label, data_type)
where m.code in ('SAFETY_EMPLOYEES', 'SAFETY_WORKERS');

insert into public.document_types (code, name, description) values
  ('SAFETY_INCIDENT_STATEMENT', 'Safety Incident Statement',
   'EHS statement for the period: person-hours worked, lost time and recordable injuries, fatalities.');

insert into public.document_type_metric_mappings (document_type_id, metric_id)
select dt.id, m.id
from public.document_types dt
join public.esg_metrics m on m.code in ('SAFETY_EMPLOYEES', 'SAFETY_WORKERS')
where dt.code = 'SAFETY_INCIDENT_STATEMENT';

-- Lost time injuries per one million person-hours worked (SEBI's definition of LTIFR): the percentage
-- formula with its scale stated. Roll-ups re-derive the rate from summed injuries and summed hours.
insert into public.calculation_formulas
  (metric_id, version, formula_type, formula_definition, effective_from, status)
select m.id, 1, 'percentage',
       '{"part": "lost_time_injuries", "whole": "person_hours", "scale": 1000000}'::jsonb,
       date '2000-01-01', 'active'
from public.esg_metrics m where m.code in ('SAFETY_EMPLOYEES', 'SAFETY_WORKERS');

-- A lost time injury is a recordable injury. A fatality usually is too, but registers differ: a flag.
insert into public.validation_rules (metric_id, rule_type, rule_definition, severity, description)
select m.id, 'logical',
       jsonb_build_object('check', 'not_greater_than', 'field', v.part, 'than', 'recordable_injuries'),
       v.severity::public.validation_severity, v.description
from public.esg_metrics m
cross join (values
  ('lost_time_injuries', 'hard_fail', 'Lost time injuries cannot exceed total recordable injuries.'),
  ('fatalities', 'flag', 'Fatalities above total recordable injuries need a reviewer to confirm.')
) as v (part, severity, description)
where m.code in ('SAFETY_EMPLOYEES', 'SAFETY_WORKERS');

insert into public.validation_rules (metric_id, rule_type, rule_definition, severity, description)
select m.id, 'period', '{"check": "duplicate_period"}', 'flag',
       'Another record of this kind is already in this project and period.'
from public.esg_metrics m where m.code in ('SAFETY_EMPLOYEES', 'SAFETY_WORKERS');

-- ── Water discharge ─────────────────────────────────────────────────────────────────────────────────────
-- Where the discharged water went and whether it was treated. Optional, typed by the person who verifies
-- the record (a water bill does not say): a record that does not state them is reported as "not stated".
insert into public.metric_field_requirements (metric_id, field_key, field_label, data_type, is_required)
select m.id, f.field_key, f.field_label, 'text', false
from public.esg_metrics m
cross join (values
  ('discharge_destination',
   'Discharged to (surface water / groundwater / seawater / third party / other)'),
  ('discharge_treatment', 'Treatment before discharge (none, or the level of treatment)')
) as f (field_key, field_label)
where m.code = 'WATER_CONSUMPTION';

-- ── Both questions are now answered from records ────────────────────────────────────────────────────────
update public.brsr_indicators set answer_kind = 'data' where code in ('P3-E11', 'P6-E4');

insert into public.brsr_metric_mappings (esg_metric_id, brsr_indicator_id, mapping_notes)
select m.id, i.id, v.notes
from (values
  ('SAFETY_EMPLOYEES', 'P3-E11', 'Employees. The figure is the lost time injury frequency rate.'),
  ('SAFETY_WORKERS', 'P3-E11', 'Workers. The figure is the lost time injury frequency rate.'),
  ('WATER_CONSUMPTION', 'P6-E4',
   'The figure beside this activity is water consumed; the water discharged is in the table above.')
) as v (metric_code, indicator_code, notes)
join public.esg_metrics m on m.code = v.metric_code
join public.brsr_indicators i on i.code = v.indicator_code;
