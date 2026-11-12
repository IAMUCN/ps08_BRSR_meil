-- Migration 0069: CSR beneficiaries, within-India procurement, compliance certificates
-- (.grill/role-dashboard-decisions.md). Written without a database to run it on: verify before merging.
begin;
select plan(9);

select is(
  (select is_required from public.metric_field_requirements r join public.esg_metrics m on m.id = r.metric_id
    where m.code = 'CSR_EXPENDITURE' and r.field_key = 'beneficiaries'),
  false, 'CSR beneficiaries is an optional field');
select is(
  (select is_required from public.metric_field_requirements r join public.esg_metrics m on m.id = r.metric_id
    where m.code = 'MSME_PROCUREMENT' and r.field_key = 'india_spend'),
  false, 'within-India spend is an optional field');
-- The verification screen needs exactly one required number field per activity: neither addition changes that.
select is(
  (select count(*)::int from public.metric_field_requirements r join public.esg_metrics m on m.id = r.metric_id
    where m.code in ('CSR_EXPENDITURE', 'MSME_PROCUREMENT') and r.data_type = 'number' and r.is_required),
  3, 'CSR keeps one required number (amount) and MSME its two (total and MSME spend)');

select is(
  (select c.name from public.esg_metrics m join public.esg_categories c on c.id = m.category_id
    where m.code = 'COMPLIANCE_CERTIFICATE'),
  'Environmental Compliance', 'certificates are an Environmental Compliance activity');
select is(
  (select ro.code from public.esg_metrics m join public.esg_categories c on c.id = m.category_id
    join public.roles ro on ro.id = c.owning_role_id where m.code = 'COMPLIANCE_CERTIFICATE'),
  'ehs', 'owned by EHS');
select is(
  (select count(*)::int from public.metric_field_requirements r join public.esg_metrics m on m.id = r.metric_id
    where m.code = 'COMPLIANCE_CERTIFICATE' and r.data_type = 'number' and r.is_required),
  1, 'exactly one required number field (validity in months), as verification needs');
select is(
  (select count(*)::int from public.document_type_metric_mappings x
    join public.esg_metrics m on m.id = x.metric_id where m.code = 'COMPLIANCE_CERTIFICATE'),
  6, 'six document types map to the certificate activity');
select is(
  (select requires_calculation or requires_conversion_factor from public.esg_metrics
    where code = 'COMPLIANCE_CERTIFICATE'),
  false, 'a certificate is never calculated');
select is(
  (select is_applicable from public.brsr_metric_mappings x join public.esg_metrics m on m.id = x.esg_metric_id
    where m.code = 'COMPLIANCE_CERTIFICATE'),
  false, 'its BRSR mapping is evidence only and not reported');

select * from finish();
rollback;
