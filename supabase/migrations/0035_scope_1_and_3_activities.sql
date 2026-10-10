-- Audit fixes P1 (AUDIT_FIXES.md; .grill/audit-p1-decisions.md): the Scope 1 and Scope 3 activities the KT
-- session and PRD §20/§22 name but the app did not offer. Configuration only, in the pattern of migrations
-- 0017 and 0019 — one activity per thing that needs its own factor, so the engine never picks a factor from a
-- value a person typed (.grill/phase-11-scope-2-decisions.md). Factor values are still never seeded.
--
--   Scope 1  coal by grade, LNG, PNG; refrigerant and SF6 top-ups by gas (fugitive emissions).
--   Scope 3  business travel by mode and distance; cement and steel purchased by weight; freight and
--            employee transport by spend. Three more categories become active (5 of 10).

-- A refrigerant top-up is EHS evidence, not a fuel bill.
insert into public.esg_categories (name, owning_role_id, description)
select 'Refrigerants & Gases', r.id,
       'Refrigerant and SF6 purchase or service records (Scope 1 fugitive emissions).'
from public.roles r where r.code = 'ehs';

-- Like Business Travel in 0019, each new Scope 3 category is its own upload category owned by the role that
-- holds its evidence. The Procurement and Workforce categories stay non-emission modules (Phase 13).
insert into public.esg_categories (name, owning_role_id, description)
select v.name, r.id, v.description
from (values
  ('Purchased Goods & Logistics', 'procurement',
   'Material purchase and freight invoices (Scope 3 purchased goods, upstream transport).'),
  ('Employee Commuting', 'hr', 'Employee transport contractor invoices (Scope 3 commuting).')
) as v (name, role_code, description)
join public.roles r on r.code = v.role_code;

update public.scopes set is_active = true
where code in ('SCOPE_3_PURCHASED_GOODS', 'SCOPE_3_UPSTREAM_TRANSPORT', 'SCOPE_3_COMMUTING');

-- The single spend-based travel activity cannot tell a flight from a train. It stays for the records
-- already made and for modes with no activity of their own.
update public.esg_metrics
set name = 'Business Travel — other modes (spend)',
    description = 'Travel billed to the company where the mode or distance is not known; calculated from the invoice amount.'
where code = 'BUSINESS_TRAVEL_SPEND';

create temporary table new_activities (
  category_name text, scope_code text, code text, name text, unit text, document_type text,
  quantity_label text, allowed_units jsonb, units_message text, brsr_indicator text, description text
);

insert into new_activities values
  ('Fuel & Energy', 'SCOPE_1', 'COAL_ANTHRACITE', 'Coal — Anthracite', 'kg', 'FUEL_INVOICE', 'Quantity',
   '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms", "MT", "Tonne", "Tonnes"]',
   'Unit must be a weight unit for coal.', 'P6-E7', 'Anthracite coal burnt in owned/controlled equipment.'),
  ('Fuel & Energy', 'SCOPE_1', 'COAL_BITUMINOUS', 'Coal — Bituminous', 'kg', 'FUEL_INVOICE', 'Quantity',
   '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms", "MT", "Tonne", "Tonnes"]',
   'Unit must be a weight unit for coal.', 'P6-E7', 'Bituminous coal burnt in owned/controlled equipment.'),
  ('Fuel & Energy', 'SCOPE_1', 'COAL_SUB_BITUMINOUS', 'Coal — Sub-bituminous', 'kg', 'FUEL_INVOICE', 'Quantity',
   '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms", "MT", "Tonne", "Tonnes"]',
   'Unit must be a weight unit for coal.', 'P6-E7', 'Sub-bituminous coal burnt in owned/controlled equipment.'),
  ('Fuel & Energy', 'SCOPE_1', 'COAL_LIGNITE', 'Coal — Lignite', 'kg', 'FUEL_INVOICE', 'Quantity',
   '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms", "MT", "Tonne", "Tonnes"]',
   'Unit must be a weight unit for coal.', 'P6-E7', 'Lignite burnt in owned/controlled equipment.'),
  ('Fuel & Energy', 'SCOPE_1', 'LNG_CONSUMPTION', 'LNG Consumption', 'kg', 'FUEL_INVOICE', 'Quantity',
   '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms", "MT", "Tonne", "Tonnes"]',
   'Unit must be a weight unit for LNG.', 'P6-E7',
   'Liquefied natural gas consumed in owned/controlled vehicles and equipment.'),
  ('Fuel & Energy', 'SCOPE_1', 'PNG_CONSUMPTION', 'PNG Consumption', 'SCM', 'FUEL_INVOICE', 'Quantity',
   '["SCM", "scm", "Scm"]',
   'Unit must be standard cubic metres (SCM) for piped natural gas.', 'P6-E7',
   'Piped natural gas consumed in owned/controlled equipment and facilities.'),

  ('Refrigerants & Gases', 'SCOPE_1', 'REFRIGERANT_R22', 'Refrigerant top-up — R-22', 'kg',
   'REFRIGERANT_RECORD', 'Quantity charged',
   '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms"]', 'Unit must be kilograms for a refrigerant.',
   'P6-E7', 'R-22 added to owned/controlled cooling equipment: what was topped up is what leaked.'),
  ('Refrigerants & Gases', 'SCOPE_1', 'REFRIGERANT_R32', 'Refrigerant top-up — R-32', 'kg',
   'REFRIGERANT_RECORD', 'Quantity charged',
   '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms"]', 'Unit must be kilograms for a refrigerant.',
   'P6-E7', 'R-32 added to owned/controlled cooling equipment.'),
  ('Refrigerants & Gases', 'SCOPE_1', 'REFRIGERANT_R410A', 'Refrigerant top-up — R-410A', 'kg',
   'REFRIGERANT_RECORD', 'Quantity charged',
   '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms"]', 'Unit must be kilograms for a refrigerant.',
   'P6-E7', 'R-410A added to owned/controlled cooling equipment.'),
  ('Refrigerants & Gases', 'SCOPE_1', 'REFRIGERANT_R134A', 'Refrigerant top-up — R-134a', 'kg',
   'REFRIGERANT_RECORD', 'Quantity charged',
   '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms"]', 'Unit must be kilograms for a refrigerant.',
   'P6-E7', 'R-134a added to owned/controlled cooling equipment and vehicles.'),
  ('Refrigerants & Gases', 'SCOPE_1', 'SF6_TOPUP', 'SF6 top-up', 'kg',
   'REFRIGERANT_RECORD', 'Quantity charged',
   '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms"]', 'Unit must be kilograms for SF6.',
   'P6-E7', 'Sulphur hexafluoride added to owned/controlled switchgear.'),

  ('Business Travel', 'SCOPE_3_BUSINESS_TRAVEL', 'BUSINESS_TRAVEL_AIR', 'Business Travel — Air', 'km',
   'TRAVEL_INVOICE', 'Distance travelled (passenger-km)',
   '["km", "Km", "KM", "Kms", "Kilometre", "Kilometres", "Kilometer", "Kilometers", "pkm"]',
   'Distance must be in kilometres.', 'P6-L2',
   'Flights billed to the company, as passenger-kilometres: the distance of the journey times the passengers on the ticket.'),
  ('Business Travel', 'SCOPE_3_BUSINESS_TRAVEL', 'BUSINESS_TRAVEL_RAIL', 'Business Travel — Rail', 'km',
   'TRAVEL_INVOICE', 'Distance travelled (passenger-km)',
   '["km", "Km", "KM", "Kms", "Kilometre", "Kilometres", "Kilometer", "Kilometers", "pkm"]',
   'Distance must be in kilometres.', 'P6-L2',
   'Train journeys billed to the company, as passenger-kilometres.'),
  ('Business Travel', 'SCOPE_3_BUSINESS_TRAVEL', 'BUSINESS_TRAVEL_ROAD', 'Business Travel — Bus / Road', 'km',
   'TRAVEL_INVOICE', 'Distance travelled (passenger-km)',
   '["km", "Km", "KM", "Kms", "Kilometre", "Kilometres", "Kilometer", "Kilometers", "pkm"]',
   'Distance must be in kilometres.', 'P6-L2',
   'Bus and hired-car journeys billed to the company, as passenger-kilometres.'),

  ('Purchased Goods & Logistics', 'SCOPE_3_PURCHASED_GOODS', 'CEMENT_PURCHASED', 'Cement purchased', 'kg',
   'MATERIAL_INVOICE', 'Quantity',
   '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms", "MT", "Tonne", "Tonnes"]',
   'Unit must be a weight unit for cement.', 'P6-L2', 'Cement bought, by the weight on the supplier''s invoice.'),
  ('Purchased Goods & Logistics', 'SCOPE_3_PURCHASED_GOODS', 'STEEL_PURCHASED', 'Steel purchased', 'kg',
   'MATERIAL_INVOICE', 'Quantity',
   '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms", "MT", "Tonne", "Tonnes"]',
   'Unit must be a weight unit for steel.', 'P6-L2', 'Steel bought, by the weight on the supplier''s invoice.'),
  ('Purchased Goods & Logistics', 'SCOPE_3_UPSTREAM_TRANSPORT', 'FREIGHT_SPEND', 'Supplier logistics (spend)', 'INR',
   'FREIGHT_INVOICE', 'Invoice amount', '["INR", "Rs", "INR.", "Rupees"]',
   'Amount must be in rupees.', 'P6-L2',
   'Freight and transport of purchased materials by third parties; calculated from the invoice amount.'),
  ('Employee Commuting', 'SCOPE_3_COMMUTING', 'COMMUTING_SPEND', 'Employee commuting (spend)', 'INR',
   'EMPLOYEE_TRANSPORT_INVOICE', 'Invoice amount', '["INR", "Rs", "INR.", "Rupees"]',
   'Amount must be in rupees.', 'P6-L2',
   'Employee transport run by contractors (staff buses, shuttles); calculated from the invoice amount.');

insert into public.esg_metrics (
  category_id, code, name, unit, scope_id,
  requires_conversion_factor, requires_calculation, frequency, description
)
select c.id, a.code, a.name, a.unit, s.id, true, true, 'monthly', a.description
from new_activities a
join public.esg_categories c on c.name = a.category_name
join public.scopes s on s.code = a.scope_code;

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

-- Stationary or mobile combustion (KT session): recorded with every fuel, old and new, for the reviewer.
-- Optional, and it does not change the factor.
insert into public.metric_field_requirements (metric_id, field_key, field_label, data_type, is_required)
select m.id, 'source_classification', 'Used in (generator / vehicle / equipment)', 'text', false
from public.esg_metrics m
join public.esg_categories c on c.id = m.category_id
join public.scopes s on s.id = m.scope_id
where c.name = 'Fuel & Energy' and s.code = 'SCOPE_1'
  and not exists (select 1 from public.metric_field_requirements r
                   where r.metric_id = m.id and r.field_key = 'source_classification');

update public.document_types
set description = 'Invoice or delivery note evidencing purchase/consumption of petrol, CNG, LPG, LNG, PNG or coal.'
where code = 'FUEL_INVOICE';

insert into public.document_types (code, name, description) values
  ('REFRIGERANT_RECORD', 'Refrigerant / Gas Record',
   'Purchase invoice or service report showing the refrigerant or SF6 charged into equipment.'),
  ('MATERIAL_INVOICE', 'Material Purchase Invoice', 'Supplier invoice for cement or steel, showing the weight.'),
  ('FREIGHT_INVOICE', 'Freight Invoice', 'Transporter or logistics invoice for moving purchased materials.'),
  ('EMPLOYEE_TRANSPORT_INVOICE', 'Employee Transport Invoice',
   'Contractor invoice for staff buses or shuttles.');

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
from new_activities a join public.esg_metrics m on m.code = a.code;

insert into public.validation_rules (metric_id, rule_type, rule_definition, severity, description)
select m.id, 'logical',
       jsonb_build_object('check', 'allowed_units', 'field', 'unit', 'units', a.allowed_units),
       'hard_fail', a.units_message
from new_activities a join public.esg_metrics m on m.code = a.code;

insert into public.brsr_metric_mappings (esg_metric_id, brsr_indicator_id, mapping_notes)
select m.id, i.id,
       case when a.scope_code = 'SCOPE_1' then 'Scope 1.' else 'Scope 3 category: ' || lower(s.name) || '.' end
from new_activities a
join public.esg_metrics m on m.code = a.code
join public.scopes s on s.code = a.scope_code
join public.brsr_indicators i on i.code = a.brsr_indicator;

drop table new_activities;
