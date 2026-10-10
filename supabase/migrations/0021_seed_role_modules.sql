-- Phase 13: role-specific modules as configuration (.grill/phase-13-role-modules-decisions.md, PRD §23–§26,
-- Master Approach §18–§21). Each module is a category owned by its role, metrics, field requirements,
-- document types, formulas and validation rules — the same shape Scope 1/2/3 used. Derived metrics read
-- all their inputs from the one document; nothing needs a conversion factor.

insert into public.esg_categories (name, owning_role_id, description)
select v.name, r.id, v.description
from (values
  ('Workforce', 'hr', 'Headcount statements and training records (BRSR HR indicators).'),
  ('Water', 'ehs', 'Water bills and meter records: withdrawal and discharge.'),
  ('Procurement', 'procurement', 'Procurement statements with MSME / local sourcing breakdowns.'),
  ('CSR & Compliance', 'finance_csr', 'CSR payment records, fines and penalty orders.')
) as v (name, role_code, description)
join public.roles r on r.code = v.role_code;

insert into public.esg_metrics (
  category_id, code, name, unit, scope_id,
  requires_conversion_factor, requires_calculation, frequency, description
)
select c.id, m.code, m.name, m.unit, null, false, m.requires_calculation,
       m.frequency::public.metric_frequency, m.description
from (values
  ('Workforce', 'WORKFORCE_GENDER', 'Employees by gender', '%', true, 'annual',
   'Share of women among employees, derived from the counts on a headcount statement.'),
  ('Workforce', 'WORKFORCE_TRAINING', 'Employees trained', '%', true, 'annual',
   'Share of employees who received training, derived from a training record.'),
  ('Water', 'WATER_CONSUMPTION', 'Water consumption', 'KL', true, 'monthly',
   'Water consumed = withdrawal − discharge, from a water bill or meter record.'),
  ('Procurement', 'MSME_PROCUREMENT', 'MSME share of procurement', '%', true, 'annual',
   'Share of procurement spend placed with MSMEs, from a procurement statement.'),
  ('CSR & Compliance', 'CSR_EXPENDITURE', 'CSR expenditure', 'INR', false, 'annual',
   'Amount spent on CSR, evidenced by a payment record.'),
  ('CSR & Compliance', 'FINES_PENALTIES', 'Fines and penalties', 'INR', false, 'annual',
   'Fines or penalties paid, evidenced by the order or payment record.')
) as m (category_name, code, name, unit, requires_calculation, frequency, description)
join public.esg_categories c on c.name = m.category_name;

-- billing_period is the key the period-overlap rule reads, whatever the document calls its date.
insert into public.metric_field_requirements (metric_id, field_key, field_label, data_type, is_required)
select m.id, f.field_key, f.field_label, f.data_type::public.field_data_type, f.is_required
from public.esg_metrics m
join (values
  ('WORKFORCE_GENDER', 'total_employees', 'Total employees', 'number', true),
  ('WORKFORCE_GENDER', 'female_employees', 'Women', 'number', true),
  ('WORKFORCE_GENDER', 'male_employees', 'Men', 'number', true),
  ('WORKFORCE_GENDER', 'billing_period', 'Statement date', 'text', true),
  ('WORKFORCE_TRAINING', 'total_employees', 'Total employees', 'number', true),
  ('WORKFORCE_TRAINING', 'trained_employees', 'Employees trained', 'number', true),
  ('WORKFORCE_TRAINING', 'billing_period', 'Training period', 'text', true),
  ('WATER_CONSUMPTION', 'withdrawal', 'Water withdrawn', 'number', true),
  ('WATER_CONSUMPTION', 'discharge', 'Water discharged', 'number', true),
  ('WATER_CONSUMPTION', 'unit', 'Unit', 'unit', true),
  ('WATER_CONSUMPTION', 'invoice_number', 'Bill number', 'text', true),
  ('WATER_CONSUMPTION', 'billing_period', 'Billing period', 'text', true),
  -- Groundwater, municipal, tanker: withdrawal by source, recorded for the reviewer.
  ('WATER_CONSUMPTION', 'source_classification', 'Water source', 'text', false),
  ('MSME_PROCUREMENT', 'total_spend', 'Total procurement', 'number', true),
  ('MSME_PROCUREMENT', 'msme_spend', 'Procured from MSMEs', 'number', true),
  ('MSME_PROCUREMENT', 'unit', 'Currency', 'unit', true),
  ('MSME_PROCUREMENT', 'billing_period', 'Statement period', 'text', true),
  ('CSR_EXPENDITURE', 'amount', 'Amount spent', 'number', true),
  ('CSR_EXPENDITURE', 'unit', 'Currency', 'unit', true),
  ('CSR_EXPENDITURE', 'invoice_number', 'Payment reference', 'text', true),
  ('CSR_EXPENDITURE', 'billing_period', 'Payment date', 'text', true),
  ('CSR_EXPENDITURE', 'source_classification', 'CSR project', 'text', false),
  ('FINES_PENALTIES', 'amount', 'Amount', 'number', true),
  ('FINES_PENALTIES', 'unit', 'Currency', 'unit', true),
  ('FINES_PENALTIES', 'invoice_number', 'Order number', 'text', true),
  ('FINES_PENALTIES', 'billing_period', 'Order date', 'text', true),
  ('FINES_PENALTIES', 'source_classification', 'Authority', 'text', false)
) as f (metric_code, field_key, field_label, data_type, is_required) on f.metric_code = m.code;

insert into public.document_types (code, name, description) values
  ('WORKFORCE_STATEMENT', 'Workforce Statement', 'Certified headcount statement or HR system export.'),
  ('TRAINING_RECORD', 'Training Record', 'Training attendance summary for the period.'),
  ('WATER_BILL', 'Water Bill', 'Water utility bill or meter record showing withdrawal and discharge.'),
  ('PROCUREMENT_STATEMENT', 'Procurement Statement', 'Procurement spend summary with MSME breakdown.'),
  ('CSR_PAYMENT_RECORD', 'CSR Payment Record', 'Payment advice or receipt for CSR spend.'),
  ('PENALTY_ORDER', 'Penalty Order', 'Order or receipt for a fine or penalty paid.');

insert into public.document_type_metric_mappings (document_type_id, metric_id)
select dt.id, m.id
from (values
  ('WORKFORCE_STATEMENT', 'WORKFORCE_GENDER'),
  ('TRAINING_RECORD', 'WORKFORCE_TRAINING'),
  ('WATER_BILL', 'WATER_CONSUMPTION'),
  ('PROCUREMENT_STATEMENT', 'MSME_PROCUREMENT'),
  ('CSR_PAYMENT_RECORD', 'CSR_EXPENDITURE'),
  ('PENALTY_ORDER', 'FINES_PENALTIES')
) as map (type_code, metric_code)
join public.document_types dt on dt.code = map.type_code
join public.esg_metrics m on m.code = map.metric_code;

insert into public.calculation_formulas
  (metric_id, version, formula_type, formula_definition, effective_from, status)
select m.id, 1, f.formula_type::public.formula_type, f.definition::jsonb, date '2000-01-01', 'active'
from (values
  ('WORKFORCE_GENDER', 'percentage', '{"part": "female_employees", "whole": "total_employees"}'),
  ('WORKFORCE_TRAINING', 'percentage', '{"part": "trained_employees", "whole": "total_employees"}'),
  ('WATER_CONSUMPTION', 'subtract', '{"inputs": ["withdrawal", "discharge"], "op": "subtract"}'),
  ('MSME_PROCUREMENT', 'percentage', '{"part": "msme_spend", "whole": "total_spend"}')
) as f (metric_code, formula_type, definition)
join public.esg_metrics m on m.code = f.metric_code;

-- A part can't exceed its whole. Discharge above withdrawal can happen (stored water), so it is a flag.
insert into public.validation_rules (metric_id, rule_type, rule_definition, severity, description)
select m.id, 'logical',
       jsonb_build_object('check', 'not_greater_than', 'field', v.part, 'than', v.whole),
       v.severity::public.validation_severity, v.description
from (values
  ('WORKFORCE_GENDER', 'female_employees', 'total_employees', 'hard_fail',
   'Women cannot exceed total employees.'),
  ('WORKFORCE_GENDER', 'male_employees', 'total_employees', 'hard_fail',
   'Men cannot exceed total employees.'),
  ('WORKFORCE_TRAINING', 'trained_employees', 'total_employees', 'hard_fail',
   'Employees trained cannot exceed total employees.'),
  ('WATER_CONSUMPTION', 'discharge', 'withdrawal', 'flag',
   'Discharge above withdrawal needs a reviewer to confirm.'),
  ('MSME_PROCUREMENT', 'msme_spend', 'total_spend', 'hard_fail',
   'MSME spend cannot exceed total procurement.')
) as v (code, part, whole, severity, description)
join public.esg_metrics m on m.code = v.code;

insert into public.validation_rules (metric_id, rule_type, rule_definition, severity, description)
select m.id, 'logical',
       jsonb_build_object('check', 'allowed_units', 'field', 'unit', 'units', v.units),
       'hard_fail', v.description
from (values
  ('WATER_CONSUMPTION', '["KL", "Kilolitre", "Kilolitres", "m3", "m³", "Cubic metres"]'::jsonb,
   'Unit must be kilolitres or cubic metres for water.'),
  ('MSME_PROCUREMENT', '["INR", "Rs", "INR.", "Rupees"]'::jsonb, 'Amounts must be in rupees.'),
  ('CSR_EXPENDITURE', '["INR", "Rs", "INR.", "Rupees"]'::jsonb, 'Amount must be in rupees.'),
  ('FINES_PENALTIES', '["INR", "Rs", "INR.", "Rupees"]'::jsonb, 'Amount must be in rupees.')
) as v (code, units, description)
join public.esg_metrics m on m.code = v.code;

-- One headcount, training record and water bill per project and period is expected.
insert into public.validation_rules (metric_id, rule_type, rule_definition, severity, description)
select m.id, 'period', '{"check": "duplicate_period"}', 'flag',
       'Another record of this kind is already in this project and period.'
from public.esg_metrics m
where m.code in ('WORKFORCE_GENDER', 'WORKFORCE_TRAINING', 'WATER_CONSUMPTION', 'MSME_PROCUREMENT');
