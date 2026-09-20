-- Phase 12: Scope 3 as configuration (.grill/phase-12-scope-3-decisions.md, PRD §22, TRD §29/§42).
-- The candidate categories from Master_Approach.md §17 are seeded as child rows under SCOPE_3, inactive
-- by default, so the dashboard can say "X of Y categories active" honestly and enabling another category
-- is a configuration change rather than a code change. Only the categories with a plausible document —
-- business travel and waste generated in operations — are activated and given a metric here.

insert into public.scopes (code, parent_scope_id, name, is_active, sort_order)
select c.code, parent.id, c.name, c.is_active, c.sort_order
from public.scopes parent
cross join (values
  ('SCOPE_3_PURCHASED_GOODS', 'Purchased goods and services', false, 1),
  ('SCOPE_3_CAPITAL_GOODS', 'Capital goods', false, 2),
  ('SCOPE_3_FUEL_ENERGY', 'Fuel- and energy-related activities', false, 3),
  ('SCOPE_3_UPSTREAM_TRANSPORT', 'Upstream transportation and distribution', false, 4),
  ('SCOPE_3_WASTE', 'Waste generated in operations', true, 5),
  ('SCOPE_3_BUSINESS_TRAVEL', 'Business travel', true, 6),
  ('SCOPE_3_COMMUTING', 'Employee commuting', false, 7),
  ('SCOPE_3_LEASED_ASSETS', 'Upstream and downstream leased assets', false, 8),
  ('SCOPE_3_DOWNSTREAM_TRANSPORT', 'Downstream transportation and distribution', false, 9),
  ('SCOPE_3_END_OF_LIFE', 'Processing, use and end-of-life treatment', false, 10)
) as c (code, name, is_active, sort_order)
where parent.code = 'SCOPE_3';

-- Each category's evidence belongs to the role that owns it (responsibility model, PRD §7).
insert into public.esg_categories (name, owning_role_id, description)
select 'Waste & Effluents', r.id,
       'Waste disposal certificates and related environmental evidence (Scope 3 waste).'
from public.roles r where r.code = 'ehs';

insert into public.esg_categories (name, owning_role_id, description)
select 'Business Travel', r.id,
       'Air and rail travel invoices raised to the company (Scope 3 business travel).'
from public.roles r where r.code = 'finance_csr';

insert into public.esg_metrics (
  category_id, code, name, unit, scope_id,
  requires_conversion_factor, requires_calculation, frequency, description
)
select c.id, m.code, m.name, m.unit, s.id, true, true, 'monthly', m.description
from (values
  ('Waste & Effluents', 'SCOPE_3_WASTE', 'WASTE_DISPOSED', 'Waste Disposed', 'kg',
   'Waste sent for disposal, evidenced by a disposal certificate; the treatment route is recorded with it.'),
  ('Business Travel', 'SCOPE_3_BUSINESS_TRAVEL', 'BUSINESS_TRAVEL_SPEND', 'Business Travel (spend)', 'INR',
   'Air and rail travel billed to the company; calculated from the invoice amount (spend-based).')
) as m (category_name, scope_code, code, name, unit, description)
join public.esg_categories c on c.name = m.category_name
join public.scopes s on s.code = m.scope_code;

insert into public.metric_field_requirements (metric_id, field_key, field_label, data_type, is_required)
select m.id, f.field_key, f.field_label, f.data_type::public.field_data_type, f.is_required
from public.esg_metrics m
join (values
  ('WASTE_DISPOSED', 'quantity', 'Quantity', 'number', true),
  ('WASTE_DISPOSED', 'unit', 'Unit', 'unit', true),
  ('WASTE_DISPOSED', 'invoice_number', 'Certificate number', 'text', true),
  ('WASTE_DISPOSED', 'billing_period', 'Disposal date', 'text', true),
  -- Landfill, incineration, recycling: recorded for the reviewer and for future per-route factors.
  ('WASTE_DISPOSED', 'source_classification', 'Treatment route', 'text', false),
  ('BUSINESS_TRAVEL_SPEND', 'quantity', 'Invoice amount', 'number', true),
  ('BUSINESS_TRAVEL_SPEND', 'unit', 'Currency', 'unit', true),
  ('BUSINESS_TRAVEL_SPEND', 'invoice_number', 'Invoice number', 'text', true),
  ('BUSINESS_TRAVEL_SPEND', 'billing_period', 'Invoice date', 'text', true),
  ('BUSINESS_TRAVEL_SPEND', 'source_classification', 'Mode (air / rail)', 'text', false)
) as f (metric_code, field_key, field_label, data_type, is_required) on f.metric_code = m.code;

insert into public.document_types (code, name, description) values
  ('WASTE_DISPOSAL_CERTIFICATE', 'Waste Disposal Certificate',
   'Certificate or manifest from an authorised waste handler.'),
  ('TRAVEL_INVOICE', 'Travel Invoice', 'Airline, rail or travel-agency invoice raised to the company.');

insert into public.document_type_metric_mappings (document_type_id, metric_id)
select dt.id, m.id
from (values
  ('WASTE_DISPOSAL_CERTIFICATE', 'WASTE_DISPOSED'),
  ('TRAVEL_INVOICE', 'BUSINESS_TRAVEL_SPEND')
) as map (type_code, metric_code)
join public.document_types dt on dt.code = map.type_code
join public.esg_metrics m on m.code = map.metric_code;

insert into public.calculation_formulas
  (metric_id, version, formula_type, formula_definition, effective_from, status)
select m.id, 1, 'direct_multiply',
       '{"inputs": ["activity_value"], "op": "multiply_by_factor"}'::jsonb,
       date '2000-01-01', 'active'
from public.esg_metrics m
where m.code in ('WASTE_DISPOSED', 'BUSINESS_TRAVEL_SPEND');

insert into public.validation_rules (metric_id, rule_type, rule_definition, severity, description)
select m.id, 'logical',
       jsonb_build_object('check', 'allowed_units', 'field', 'unit', 'units', v.units),
       'hard_fail', v.description
from (values
  ('WASTE_DISPOSED',
   '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms", "MT", "Tonne", "Tonnes"]'::jsonb,
   'Unit must be a weight unit for waste.'),
  ('BUSINESS_TRAVEL_SPEND', '["INR", "Rs", "INR.", "Rupees"]'::jsonb,
   'Amount must be in rupees.')
) as v (code, units, description)
join public.esg_metrics m on m.code = v.code;
