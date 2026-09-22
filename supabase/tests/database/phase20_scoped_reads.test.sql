-- Phase 20: RLS read scope for every table that hangs off a record or document (06_IMPLEMENTATION_PLAN.md
-- Phase 20, "user X cannot read record Y outside their scope" per table category). phase2_smoke covers the
-- global posture (RLS everywhere, no browser writes, no anonymous reads) and records/documents themselves;
-- this adds OCR, verification, validation, approval, calculation and reporting rows. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

-- Fixtures (as postgres): PM A at Project X, PM B at a sibling project, an Admin; one row in every
-- dependent table for a Project X document and record.
insert into auth.users (id, email, aud, role) values
  ('20202020-0000-4000-8000-00000000000a', 'p20.a@example.test', 'authenticated', 'authenticated'),
  ('20202020-0000-4000-8000-00000000000b', 'p20.b@example.test', 'authenticated', 'authenticated'),
  ('20202020-0000-4000-8000-00000000000c', 'p20.admin@example.test', 'authenticated', 'authenticated');
insert into public.users (id, display_name, email) values
  ('20202020-0000-4000-8000-00000000000a', 'P20 PM A', 'p20.a@example.test'),
  ('20202020-0000-4000-8000-00000000000b', 'P20 PM B', 'p20.b@example.test'),
  ('20202020-0000-4000-8000-00000000000c', 'P20 Admin', 'p20.admin@example.test');
insert into public.org_units (parent_id, unit_type, name, code)
select id, 'project', 'Project Q', 'P20-Q' from public.org_units where code = 'SUB-A';
insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
select a.u::uuid, o.id, r.id, '20202020-0000-4000-8000-00000000000c'
from (values ('20202020-0000-4000-8000-00000000000a', 'PRJ-X', 'project_manager'),
             ('20202020-0000-4000-8000-00000000000b', 'P20-Q', 'project_manager'),
             ('20202020-0000-4000-8000-00000000000c', 'MEIL', 'admin')) as a (u, org, role)
join public.org_units o on o.code = a.org join public.roles r on r.code = a.role;

insert into public.documents (id, org_unit_id, reporting_period_id, storage_path, file_name, mime_type,
  file_size_bytes, file_hash, uploaded_by)
select '20202020-0000-4000-8000-0000000000d1', o.id, p.id, 'p20/doc.pdf', 'p20.pdf', 'application/pdf', 1,
  'p20-hash', '20202020-0000-4000-8000-00000000000a'
from public.org_units o, public.reporting_periods p where o.code = 'PRJ-X' and p.status = 'open';
insert into public.esg_records (id, org_unit_id, reporting_period_id, metric_id, scope_id, submitted_by)
select '20202020-0000-4000-8000-0000000000e1', o.id, p.id, m.id, m.scope_id, '20202020-0000-4000-8000-00000000000a'
from public.org_units o, public.reporting_periods p, public.esg_metrics m
where o.code = 'PRJ-X' and p.status = 'open' and m.code = 'DIESEL_CONSUMPTION';
insert into public.esg_record_documents (esg_record_id, document_id, added_by) values
  ('20202020-0000-4000-8000-0000000000e1', '20202020-0000-4000-8000-0000000000d1', '20202020-0000-4000-8000-00000000000a');
insert into public.ocr_jobs (id, document_id) values
  ('20202020-0000-4000-8000-0000000000f1', '20202020-0000-4000-8000-0000000000d1');
insert into public.ocr_extractions (id, ocr_job_id, document_id, raw_output) values
  ('20202020-0000-4000-8000-0000000000f2', '20202020-0000-4000-8000-0000000000f1', '20202020-0000-4000-8000-0000000000d1', '{}');
insert into public.ocr_fields (ocr_extraction_id, field_key, field_label) values
  ('20202020-0000-4000-8000-0000000000f2', 'quantity', 'Quantity');
insert into public.verifications (esg_record_id, verified_by) values
  ('20202020-0000-4000-8000-0000000000e1', '20202020-0000-4000-8000-00000000000a');
insert into public.validation_results (esg_record_id, rule_type, result) values
  ('20202020-0000-4000-8000-0000000000e1', 'format', 'pass');
insert into public.approvals (esg_record_id, action) values
  ('20202020-0000-4000-8000-0000000000e1', 'submitted');
insert into public.calculations (id, esg_record_id, input_value, input_unit, normalized_value, normalized_unit,
  result_value, result_unit, engine_version) values
  ('20202020-0000-4000-8000-0000000000c1', '20202020-0000-4000-8000-0000000000e1', 1, 'L', 1, 'L', 1, 'kgCO2e', 'p20');
insert into public.calculation_inputs (calculation_id, input_key, input_value, input_unit) values
  ('20202020-0000-4000-8000-0000000000c1', 'quantity', 1, 'L');
insert into public.report_runs (requested_by, org_unit_id, report_type, financial_year)
select '20202020-0000-4000-8000-00000000000c', id, 'brsr', 2026 from public.org_units where code = 'PRJ-X';

-- What a session can read of the fixture, one row per table.
create function pg_temp.visible() returns table (tbl text, n int) language sql as $$
  select 'ocr_jobs', count(*)::int from public.ocr_jobs where document_id = '20202020-0000-4000-8000-0000000000d1'
  union all select 'ocr_extractions', count(*)::int from public.ocr_extractions where document_id = '20202020-0000-4000-8000-0000000000d1'
  union all select 'ocr_fields', count(*)::int from public.ocr_fields where ocr_extraction_id = '20202020-0000-4000-8000-0000000000f2'
  union all select 'esg_record_documents', count(*)::int from public.esg_record_documents where esg_record_id = '20202020-0000-4000-8000-0000000000e1'
  union all select 'verifications', count(*)::int from public.verifications where esg_record_id = '20202020-0000-4000-8000-0000000000e1'
  union all select 'validation_results', count(*)::int from public.validation_results where esg_record_id = '20202020-0000-4000-8000-0000000000e1'
  union all select 'approvals', count(*)::int from public.approvals where esg_record_id = '20202020-0000-4000-8000-0000000000e1'
  union all select 'calculations', count(*)::int from public.calculations where esg_record_id = '20202020-0000-4000-8000-0000000000e1'
  union all select 'calculation_inputs', count(*)::int from public.calculation_inputs where calculation_id = '20202020-0000-4000-8000-0000000000c1'
  union all select 'report_runs', count(*)::int from public.report_runs where requested_by = '20202020-0000-4000-8000-00000000000c'
$$;
grant execute on function pg_temp.visible() to authenticated;

set local role authenticated;

select set_config('request.jwt.claims', '{"sub": "20202020-0000-4000-8000-00000000000a", "role": "authenticated"}', true);
select results_eq('select * from pg_temp.visible() order by 1',
  $$values ('approvals', 1), ('calculation_inputs', 1), ('calculations', 1), ('esg_record_documents', 1),
           ('ocr_extractions', 1), ('ocr_fields', 1), ('ocr_jobs', 1), ('report_runs', 1),
           ('validation_results', 1), ('verifications', 1)$$,
  'PM A reads every OCR, verification, validation, approval, calculation and report row of their project');

select set_config('request.jwt.claims', '{"sub": "20202020-0000-4000-8000-00000000000b", "role": "authenticated"}', true);
select results_eq('select * from pg_temp.visible() order by 1',
  $$values ('approvals', 0), ('calculation_inputs', 0), ('calculations', 0), ('esg_record_documents', 0),
           ('ocr_extractions', 0), ('ocr_fields', 0), ('ocr_jobs', 0), ('report_runs', 0),
           ('validation_results', 0), ('verifications', 0)$$,
  'PM B, on a sibling project, reads none of them');

select set_config('request.jwt.claims', '{"sub": "20202020-0000-4000-8000-00000000000c", "role": "authenticated"}', true);
select results_eq('select * from pg_temp.visible() order by 1',
  $$values ('approvals', 1), ('calculation_inputs', 1), ('calculations', 1), ('esg_record_documents', 1),
           ('ocr_extractions', 1), ('ocr_fields', 1), ('ocr_jobs', 1), ('report_runs', 1),
           ('validation_results', 1), ('verifications', 1)$$,
  'the Admin reads all of them');

select set_config('request.jwt.claims', '{"sub": "20202020-0000-4000-8000-00000000000a", "role": "authenticated"}', true);
select throws_ok(
  $$update public.calculations set result_value = 999 where id = '20202020-0000-4000-8000-0000000000c1'$$,
  '42501', null, 'and not even the owner can change a stored calculation directly');

reset role;
select * from finish();
rollback;
