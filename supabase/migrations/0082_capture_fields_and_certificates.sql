-- Migration 0069: role-wise dashboard, capture - CSR beneficiaries, within-India procurement, compliance
-- certificates with an expiry date (.grill/role-dashboard-decisions.md). Written on a machine with no
-- database, so it has NOT been run: see ROLE_DASHBOARD_VERIFY.md.
--
-- Configuration only, in the pattern of 0021 and 0035. No factor, formula or existing field changes.
-- Safe to run twice is NOT guaranteed for the inserts without a natural key; run once.
-- Undo: delete the rows inserted here (metric, category, document types, mappings, field requirements).

-------------------------------------------------------------------------------------------------
-- 1. Two optional fields on documents that already exist. Optional, so no existing record or upload changes:
--    a record verifies with them empty, and the dashboard shows "not captured" until a statement carries them.
--    They are extra figures on the same document; the activity value stays the one required number field.
--    No part-of-whole rule is added for india_spend: the rule fails when the field is empty (checks.ts).
-------------------------------------------------------------------------------------------------
insert into public.metric_field_requirements (metric_id, field_key, field_label, data_type, is_required)
select m.id, f.field_key, f.field_label, f.data_type::public.field_data_type, f.is_required
from public.esg_metrics m
join (values
  ('CSR_EXPENDITURE', 'beneficiaries', 'Number of beneficiaries', 'number', false),
  ('MSME_PROCUREMENT', 'india_spend', 'Procured from within India', 'number', false)
) as f (metric_code, field_key, field_label, data_type, is_required) on f.metric_code = m.code
where not exists (
  select 1 from public.metric_field_requirements x
  where x.metric_id = m.id and x.field_key = f.field_key);

-------------------------------------------------------------------------------------------------
-- 2. Compliance certificates with an expiry date (EHS). One activity, several document types, so the
--    classifier and an Admin's type correction have something to choose between.
--    The verification screen needs exactly one required number field, so "Validity (months)" is it: the
--    person types it from the dates (a certificate rarely prints it). Nothing is calculated.
-------------------------------------------------------------------------------------------------
insert into public.esg_categories (name, owning_role_id, description)
select 'Environmental Compliance', r.id,
       'Consents, authorizations and certificates with an expiry date (pollution control board consents, hazardous waste authorization, fire NOC, ISO certificates).'
from public.roles r where r.code = 'ehs'
  and not exists (select 1 from public.esg_categories where name = 'Environmental Compliance');

insert into public.esg_metrics (
  category_id, code, name, unit, scope_id,
  requires_conversion_factor, requires_calculation, frequency, description
)
select c.id, 'COMPLIANCE_CERTIFICATE', 'Compliance certificates', 'months', null,
       false, false, 'annual'::public.metric_frequency,
       'A consent, authorization or certificate and the date it expires; feeds the certificates-due tile.'
from public.esg_categories c
where c.name = 'Environmental Compliance'
  and not exists (select 1 from public.esg_metrics where code = 'COMPLIANCE_CERTIFICATE');

insert into public.metric_field_requirements (metric_id, field_key, field_label, data_type, is_required)
select m.id, f.field_key, f.field_label, f.data_type::public.field_data_type, f.is_required
from public.esg_metrics m
join (values
  ('COMPLIANCE_CERTIFICATE', 'certificate_number', 'Certificate / consent number', 'text', true),
  ('COMPLIANCE_CERTIFICATE', 'issuing_authority', 'Issuing authority', 'text', true),
  ('COMPLIANCE_CERTIFICATE', 'valid_from', 'Valid from', 'date', false),
  ('COMPLIANCE_CERTIFICATE', 'valid_to', 'Valid until', 'date', true),
  ('COMPLIANCE_CERTIFICATE', 'validity_months', 'Validity (months)', 'number', true)
) as f (metric_code, field_key, field_label, data_type, is_required) on f.metric_code = m.code
where not exists (
  select 1 from public.metric_field_requirements x
  where x.metric_id = m.id and x.field_key = f.field_key);

insert into public.document_types (code, name, description)
select v.code, v.name, v.description
from (values
  ('CERTIFICATE_EXPIRY', 'Certificate with expiry date', 'Any certificate, licence or authorization that states a validity period.'),
  ('CONSENT_TO_OPERATE', 'Consent to Operate', 'State pollution control board consent to operate (CTO).'),
  ('CONSENT_TO_ESTABLISH', 'Consent to Establish', 'State pollution control board consent to establish (CTE).'),
  ('HAZARDOUS_WASTE_AUTH', 'Hazardous Waste Authorization', 'Authorization under the hazardous and other wastes rules.'),
  ('FIRE_NOC', 'Fire NOC', 'Fire department no-objection certificate.'),
  ('ISO_CERTIFICATE', 'ISO Certificate', 'ISO 14001 or ISO 45001 certificate of registration.')
) as v (code, name, description)
where not exists (select 1 from public.document_types d where d.code = v.code);

insert into public.document_type_metric_mappings (document_type_id, metric_id)
select dt.id, m.id
from public.document_types dt
join public.esg_metrics m on m.code = 'COMPLIANCE_CERTIFICATE'
where dt.code in ('CERTIFICATE_EXPIRY', 'CONSENT_TO_OPERATE', 'CONSENT_TO_ESTABLISH',
                  'HAZARDOUS_WASTE_AUTH', 'FIRE_NOC', 'ISO_CERTIFICATE')
  and not exists (
    select 1 from public.document_type_metric_mappings x
    where x.document_type_id = dt.id and x.metric_id = m.id);

-------------------------------------------------------------------------------------------------
-- 3. Every activity maps to a BRSR indicator (tests/database/audit_2: no metric without a mapping).
--    Certificates evidence compliance with environmental law (Principle 6, Essential Indicator 13) but are
--    not a reported figure, so the mapping is marked not applicable: it keeps the invariant without putting
--    a number of months into the report or into BRSR readiness.
-------------------------------------------------------------------------------------------------
insert into public.brsr_metric_mappings (esg_metric_id, brsr_indicator_id, mapping_notes, is_applicable)
select m.id, i.id,
       'Evidence only: certificates are tracked for the certificates-due tile and are not reported as a figure.',
       false
from public.esg_metrics m
join public.brsr_indicators i on i.code = 'P6-E13'
where m.code = 'COMPLIANCE_CERTIFICATE'
  and not exists (
    select 1 from public.brsr_metric_mappings x
    where x.esg_metric_id = m.id and x.brsr_indicator_id = i.id);
