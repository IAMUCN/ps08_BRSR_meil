-- Phase 14: BRSR mapping as configuration (.grill/phase-14-brsr-mapping-decisions.md, PRD §27, TRD §26).
-- Source: SEBI's BRSR reporting format, Annexure I (ps_documents/provided_docs). Codes follow its numbering
-- (Section A question 18 → A-18; Principle 6 Essential Indicator 3 → P6-E3) and question text is quoted from
-- it. Only the indicators today's metrics feed are seeded; more are added as metrics arrive.

-- The App Flow's "mark a mapping's applicability" (SCHEMA_DEVIATIONS.md D15): an Admin can switch a mapping
-- off without deleting it; readiness ignores it.
alter table public.brsr_metric_mappings
  add column is_applicable boolean not null default true;

insert into public.brsr_sections (code, name) values
  ('A', 'General Disclosures'),
  ('B', 'Management and Process Disclosures'),
  ('C', 'Principle Wise Performance Disclosure');

insert into public.brsr_indicators (section_id, code, question_text, indicator_type, description)
select s.id, i.code, i.question_text, i.indicator_type::public.brsr_indicator_type, i.description
from (values
  ('A', 'A-18', 'Details as at the end of Financial Year: Employees and workers (including differently abled).',
   null, 'Section A, IV Employees, question 18 — counts by gender (Total, Male, Female).'),
  ('A', 'A-22', 'Whether CSR is applicable as per section 135 of Companies Act, 2013; Turnover; Net worth.',
   null, 'Section A, VI CSR Details, question 22.'),
  ('C', 'P1-E2', 'Details of fines / penalties / punishment / award / compounding fees / settlement amount paid in proceedings with regulators / law enforcement agencies / judicial institutions, in the financial year.',
   'essential', 'Principle 1, Essential Indicator 2.'),
  ('C', 'P3-E8', 'Details of training given to employees and workers.',
   'essential', 'Principle 3, Essential Indicator 8 — on health and safety measures and on skill upgradation.'),
  ('C', 'P6-E3', 'Provide details of the following disclosures related to water: water withdrawal by source, total volume of water withdrawal and total volume of water consumption (in kilolitres).',
   'essential', 'Principle 6, Essential Indicator 3. Annexure II: consumption = withdrawal − discharge.'),
  ('C', 'P6-E6', 'Provide details of greenhouse gas emissions (Scope 1 and Scope 2 emissions) & its intensity.',
   'essential', 'Principle 6, Essential Indicator 6 — in metric tonnes of CO2 equivalent.'),
  ('C', 'P6-E8', 'Provide details related to waste management by the entity (total waste generated, recovered and disposed, in metric tonnes).',
   'essential', 'Principle 6, Essential Indicator 8.'),
  ('C', 'P6-L4', 'Please provide details of total Scope 3 emissions & its intensity.',
   'leadership', 'Principle 6, Leadership Indicator 4.'),
  ('C', 'P8-E4', 'Percentage of input material (inputs to total inputs by value) sourced from suppliers: directly sourced from MSMEs / small producers.',
   'essential', 'Principle 8, Essential Indicator 4.')
) as i (section_code, code, question_text, indicator_type, description)
join public.brsr_sections s on s.code = i.section_code;

insert into public.brsr_metric_mappings (esg_metric_id, brsr_indicator_id, mapping_notes)
select m.id, i.id, v.notes
from (values
  ('DIESEL_CONSUMPTION', 'P6-E6', 'Scope 1.'),
  ('PETROL_CONSUMPTION', 'P6-E6', 'Scope 1.'),
  ('CNG_CONSUMPTION', 'P6-E6', 'Scope 1.'),
  ('LPG_CONSUMPTION', 'P6-E6', 'Scope 1.'),
  ('GRID_ELECTRICITY', 'P6-E6', 'Scope 2.'),
  ('RENEWABLE_ELECTRICITY', 'P6-E6', 'Scope 2, market-based.'),
  ('WASTE_DISPOSED', 'P6-E8', 'Waste disposed, by disposal method; kilograms reported as metric tonnes.'),
  ('WASTE_DISPOSED', 'P6-L4', 'Scope 3 category: waste generated in operations.'),
  ('BUSINESS_TRAVEL_SPEND', 'P6-L4', 'Scope 3 category: business travel (spend-based).'),
  ('WORKFORCE_GENDER', 'A-18', 'Total, male and female counts come from the verified headcount statement.'),
  ('WORKFORCE_TRAINING', 'P3-E8', 'Employees trained against total employees.'),
  ('WATER_CONSUMPTION', 'P6-E3', 'Withdrawal and consumption; withdrawal by source is the recorded water source.'),
  ('MSME_PROCUREMENT', 'P8-E4', 'Share of procurement by value placed with MSMEs.'),
  ('CSR_EXPENDITURE', 'A-22', 'BRSR asks whether CSR applies, with turnover and net worth; the spend is supporting context, not a BRSR field.'),
  ('FINES_PENALTIES', 'P1-E2', 'Monetary fines and penalties paid.')
) as v (metric_code, indicator_code, notes)
join public.esg_metrics m on m.code = v.metric_code
join public.brsr_indicators i on i.code = v.indicator_code;
