-- Second audit (2026-10-08; .grill/audit-2-decisions.md): what the KT session and SEBI's Principle 6 tables
-- name and the app still lacked. Mostly configuration in the pattern of 0035; two small columns and one guard.
--
--   Scope 1  process emissions (CO2 stated on a process statement).
--   Scope 2  purchased steam; purchased heat / cooling.
--   Scope 3  road freight by vehicle class and distance, upstream and downstream (downstream becomes active,
--            6 of 10); employee commuting by bus in passenger-km. The spend-based activities stay.
--   P6-E6    air emissions other than greenhouse gases (NOx, SOx, particulate matter), as recorded amounts.
--   P6-E9    the waste category on each certificate, so the report can fill SEBI's categories A to H.
--   Report   which gases a factor covers (the break-up by gas) and how a Scope 1 activity emits
--            (combustion, process or fugitive).

-- Which greenhouse gases a factor's value covers ("CO2", "CO2, CH4, N2O", "HFCs", "SF6"). Stated by whoever
-- enters the factor, from its source; the report's break-up by gas is grouped on it. Not part of what a
-- calculation freezes, so it may be added to a version already in use.
alter table public.conversion_factor_versions
  add column gases text constraint conversion_factor_versions_gases_length check (char_length(gases) <= 60);

-- How a Scope 1 activity emits. Combustion is split into stationary and mobile per record, from the
-- "Used in" field; process and fugitive follow from the activity itself.
alter table public.esg_metrics
  add column emission_source text
  constraint esg_metrics_emission_source_check check (emission_source in ('combustion', 'process', 'fugitive'));

update public.esg_metrics m set emission_source = 'combustion'
from public.esg_categories c, public.scopes s
where c.id = m.category_id and s.id = m.scope_id and s.code = 'SCOPE_1' and c.name = 'Fuel & Energy';
update public.esg_metrics m set emission_source = 'fugitive'
from public.esg_categories c
where c.id = m.category_id and c.name = 'Refrigerants & Gases';

insert into public.esg_categories (name, owning_role_id, description)
select 'Process & Air Emissions', r.id,
       'Process emission statements and stack monitoring reports (Scope 1 process emissions; air emissions).'
from public.roles r where r.code = 'ehs';

update public.scopes set is_active = true where code = 'SCOPE_3_DOWNSTREAM_TRANSPORT';

create temporary table new_activities (
  category_name text, scope_code text, code text, name text, unit text, document_type text,
  quantity_label text, allowed_units jsonb, units_message text, brsr_indicator text, description text
);

insert into new_activities values
  ('Process & Air Emissions', 'SCOPE_1', 'PROCESS_CO2', 'Process emissions — CO2', 'kg',
   'PROCESS_EMISSION_STATEMENT', 'CO2 emitted',
   '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms", "MT", "Tonne", "Tonnes"]',
   'Unit must be a weight unit for process emissions.', 'P6-E7',
   'CO2 released by a chemical or physical process the company runs (not by burning fuel), as stated on a mass-balance or monitoring statement.'),

  ('Fuel & Energy', 'SCOPE_2', 'PURCHASED_STEAM', 'Purchased steam', 'kg', 'STEAM_HEAT_INVOICE', 'Quantity',
   '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms", "MT", "Tonne", "Tonnes"]',
   'Unit must be a weight unit for steam.', 'P6-E7',
   'Steam bought from another party. The factor is the supplier''s own.'),
  ('Fuel & Energy', 'SCOPE_2', 'PURCHASED_HEAT_COOLING', 'Purchased heat / cooling', 'kWh',
   'STEAM_HEAT_INVOICE', 'Energy supplied', '["kWh", "KWH", "Kwh", "MWh", "MWH"]',
   'Unit must be kWh or MWh.', 'P6-E7',
   'Heat or cooling bought from another party (district energy, chilled water). The factor is the supplier''s own.'),

  ('Purchased Goods & Logistics', 'SCOPE_3_UPSTREAM_TRANSPORT', 'FREIGHT_IN_LDV',
   'Supplier logistics — light truck (under 3.5 t)', 'km', 'FREIGHT_INVOICE', 'Distance (vehicle-km)',
   '["km", "Km", "KM", "Kms", "Kilometre", "Kilometres", "Kilometer", "Kilometers"]',
   'Distance must be in kilometres.', 'P6-L2',
   'Purchased materials moved by a third party''s light goods vehicle; by the distance driven.'),
  ('Purchased Goods & Logistics', 'SCOPE_3_UPSTREAM_TRANSPORT', 'FREIGHT_IN_MDV',
   'Supplier logistics — medium truck (under 12 t)', 'km', 'FREIGHT_INVOICE', 'Distance (vehicle-km)',
   '["km", "Km", "KM", "Kms", "Kilometre", "Kilometres", "Kilometer", "Kilometers"]',
   'Distance must be in kilometres.', 'P6-L2',
   'Purchased materials moved by a third party''s medium goods vehicle; by the distance driven.'),
  ('Purchased Goods & Logistics', 'SCOPE_3_UPSTREAM_TRANSPORT', 'FREIGHT_IN_HDV',
   'Supplier logistics — heavy truck (over 12 t)', 'km', 'FREIGHT_INVOICE', 'Distance (vehicle-km)',
   '["km", "Km", "KM", "Kms", "Kilometre", "Kilometres", "Kilometer", "Kilometers"]',
   'Distance must be in kilometres.', 'P6-L2',
   'Purchased materials moved by a third party''s heavy goods vehicle; by the distance driven.'),
  ('Purchased Goods & Logistics', 'SCOPE_3_DOWNSTREAM_TRANSPORT', 'FREIGHT_OUT_LDV',
   'Downstream logistics — light truck (under 3.5 t)', 'km', 'FREIGHT_INVOICE', 'Distance (vehicle-km)',
   '["km", "Km", "KM", "Kms", "Kilometre", "Kilometres", "Kilometer", "Kilometers"]',
   'Distance must be in kilometres.', 'P6-L2',
   'Goods sent onward by a third party''s light goods vehicle; by the distance driven.'),
  ('Purchased Goods & Logistics', 'SCOPE_3_DOWNSTREAM_TRANSPORT', 'FREIGHT_OUT_MDV',
   'Downstream logistics — medium truck (under 12 t)', 'km', 'FREIGHT_INVOICE', 'Distance (vehicle-km)',
   '["km", "Km", "KM", "Kms", "Kilometre", "Kilometres", "Kilometer", "Kilometers"]',
   'Distance must be in kilometres.', 'P6-L2',
   'Goods sent onward by a third party''s medium goods vehicle; by the distance driven.'),
  ('Purchased Goods & Logistics', 'SCOPE_3_DOWNSTREAM_TRANSPORT', 'FREIGHT_OUT_HDV',
   'Downstream logistics — heavy truck (over 12 t)', 'km', 'FREIGHT_INVOICE', 'Distance (vehicle-km)',
   '["km", "Km", "KM", "Kms", "Kilometre", "Kilometres", "Kilometer", "Kilometers"]',
   'Distance must be in kilometres.', 'P6-L2',
   'Goods sent onward by a third party''s heavy goods vehicle; by the distance driven.'),

  ('Employee Commuting', 'SCOPE_3_COMMUTING', 'COMMUTING_BUS', 'Employee commuting — bus (distance)', 'km',
   'EMPLOYEE_TRANSPORT_INVOICE', 'Distance travelled (passenger-km)',
   '["km", "Km", "KM", "Kms", "Kilometre", "Kilometres", "Kilometer", "Kilometers", "pkm"]',
   'Distance must be in kilometres.', 'P6-L2',
   'Staff buses and shuttles, as passenger-kilometres: the route distance times the employees carried.');

insert into public.esg_metrics (
  category_id, code, name, unit, scope_id,
  requires_conversion_factor, requires_calculation, frequency, description
)
select c.id, a.code, a.name, a.unit, s.id, true, true, 'monthly', a.description
from new_activities a
join public.esg_categories c on c.name = a.category_name
join public.scopes s on s.code = a.scope_code;

update public.esg_metrics set emission_source = 'process' where code = 'PROCESS_CO2';

-- Air emissions other than greenhouse gases: quantities read from a stack monitoring report and reported as
-- they are (no factor, no calculation), like the Phase 13 recorded amounts.
insert into public.esg_metrics (
  category_id, code, name, unit, scope_id,
  requires_conversion_factor, requires_calculation, frequency, description
)
select c.id, v.code, v.name, 'kg', null, false, false, 'monthly', v.description
from (values
  ('NOX_EMISSIONS', 'Air emissions — NOx', 'Oxides of nitrogen released to air, from stack monitoring reports.'),
  ('SOX_EMISSIONS', 'Air emissions — SOx', 'Oxides of sulphur released to air, from stack monitoring reports.'),
  ('PM_EMISSIONS', 'Air emissions — Particulate matter',
   'Particulate matter released to air, from stack monitoring reports.')
) as v (code, name, description)
join public.esg_categories c on c.name = 'Process & Air Emissions';

insert into new_activities (category_name, code, name, unit, document_type, quantity_label, allowed_units,
                            units_message, brsr_indicator)
select 'Process & Air Emissions', m.code, m.name, 'kg', 'STACK_MONITORING_REPORT', 'Quantity emitted',
       '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms", "MT", "Tonne", "Tonnes"]'::jsonb,
       'Unit must be a weight unit for air emissions.', 'P6-E6'
from public.esg_metrics m where m.code in ('NOX_EMISSIONS', 'SOX_EMISSIONS', 'PM_EMISSIONS');

insert into public.metric_field_requirements (metric_id, field_key, field_label, data_type, is_required)
select m.id, f.field_key, coalesce(f.field_label, a.quantity_label), f.data_type::public.field_data_type, true
from new_activities a
join public.esg_metrics m on m.code = a.code
cross join (values
  ('quantity', null, 'number'),
  ('unit', 'Unit', 'unit'),
  ('invoice_number', 'Invoice / document number', 'text'),
  ('billing_period', 'Invoice date / period', 'text')
) as f (field_key, field_label, data_type);

-- SEBI's waste table is by category (A to H). Optional: a certificate that does not say is reported as
-- "not categorised", never guessed.
insert into public.metric_field_requirements (metric_id, field_key, field_label, data_type, is_required)
select m.id, 'waste_category',
       'Waste category (plastic / e-waste / bio-medical / construction and demolition / battery / radioactive / other hazardous / other non-hazardous)',
       'text', false
from public.esg_metrics m where m.code = 'WASTE_DISPOSED';

update public.esg_metrics
set description = 'Waste handed over for recovery or disposal, evidenced by a certificate; its category and treatment route are recorded with it.'
where code = 'WASTE_DISPOSED';

insert into public.document_types (code, name, description) values
  ('PROCESS_EMISSION_STATEMENT', 'Process Emission Statement',
   'Mass-balance calculation or monitoring statement giving the CO2 a process released.'),
  ('STEAM_HEAT_INVOICE', 'Steam / Heat Invoice', 'Supplier invoice for purchased steam, heat or cooling.'),
  ('STACK_MONITORING_REPORT', 'Stack Monitoring Report',
   'Laboratory or continuous-monitoring report of NOx, SOx and particulate matter released to air.');

insert into public.document_type_metric_mappings (document_type_id, metric_id)
select dt.id, m.id
from new_activities a
join public.document_types dt on dt.code = a.document_type
join public.esg_metrics m on m.code = a.code;

insert into public.calculation_formulas
  (metric_id, version, formula_type, formula_definition, effective_from, status)
select m.id, 1, 'direct_multiply',
       '{"inputs": ["activity_value"], "op": "multiply_by_factor"}'::jsonb,
       date '2000-01-01', 'active'
from new_activities a join public.esg_metrics m on m.code = a.code
where m.requires_calculation;

insert into public.validation_rules (metric_id, rule_type, rule_definition, severity, description)
select m.id, 'logical',
       jsonb_build_object('check', 'allowed_units', 'field', 'unit', 'units', a.allowed_units),
       'hard_fail', a.units_message
from new_activities a join public.esg_metrics m on m.code = a.code;

-- Piped gas is also billed in normal cubic metres (Master Approach §27).
update public.validation_rules v
set rule_definition = jsonb_set(v.rule_definition, '{units}', '["SCM", "scm", "Scm", "Nm3", "NM3", "Nm³"]'::jsonb),
    description = 'Unit must be standard (SCM) or normal (Nm3) cubic metres for piped natural gas.'
from public.esg_metrics m
where m.id = v.metric_id and m.code = 'PNG_CONSUMPTION' and v.rule_definition->>'check' = 'allowed_units';

insert into public.brsr_indicators (section_id, code, question_text, indicator_type, description)
select s.id, 'P6-E6',
       'Please provide details of air emissions (other than GHG emissions) by the entity.',
       'essential', 'Principle 6, Essential Indicator 6 — NOx, SOx, particulate matter and others.'
from public.brsr_sections s where s.code = 'C';

insert into public.brsr_metric_mappings (esg_metric_id, brsr_indicator_id, mapping_notes)
select m.id, i.id,
       case when a.brsr_indicator = 'P6-E6' then 'From stack monitoring reports.'
            when sc.code = 'SCOPE_1' then 'Scope 1.'
            when sc.code = 'SCOPE_2' then 'Scope 2.'
            else 'Scope 3 category: ' || lower(sc.name) || '.' end
from new_activities a
join public.esg_metrics m on m.code = a.code
left join public.scopes sc on sc.id = m.scope_id
join public.brsr_indicators i on i.code = a.brsr_indicator;

drop table new_activities;

-- A record cannot be confirmed without the document it was read from (Master Approach §3, evidence first).
-- The app always links one in the upload transaction; this holds it for every writer.
create function public.require_record_document() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.verification_status = 'user_verified' and old.verification_status <> 'user_verified'
     and not exists (select 1 from public.esg_record_documents d where d.esg_record_id = new.id) then
    raise exception 'A record cannot be verified without an evidence document'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_require_record_document before update of verification_status on public.esg_records
  for each row execute function public.require_record_document();
