-- Report templates (migration 0062; feature_enhancement.md Phase 8.1, D52).
begin;
select plan(6);

create function pg_temp.err(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return '';
exception when others then
  return sqlerrm;
end;
$$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000062a1', 'report.templates@db.test');
insert into public.users (id, display_name, email)
values ('00000000-0000-4000-8000-0000000062a1', 'Report Templates', 'report.templates@db.test');

insert into public.report_runs (id, requested_by, org_unit_id, financial_year, report_type)
values ('00000000-0000-4000-8000-0000000062b1', '00000000-0000-4000-8000-0000000062a1',
        (select id from public.org_units where parent_id is null order by created_at limit 1), 2032, 'brsr');

select is(
  (select template from public.report_runs where id = '00000000-0000-4000-8000-0000000062b1'),
  'brsr',
  'a run that names no template is the full BRSR format, as every earlier run was');
select is(
  pg_temp.err($$update public.report_runs set template = 'ghg', workbook_path = '00000000-0000-4000-8000-0000000062b1.xlsx'
                where id = '00000000-0000-4000-8000-0000000062b1'$$),
  '',
  'a GHG inventory run records its workbook');
select matches(
  pg_temp.err($$update public.report_runs set template = 'esg_glossy'
                where id = '00000000-0000-4000-8000-0000000062b1'$$),
  'check constraint',
  'only the four templates are accepted');
select matches(
  pg_temp.err($$update public.report_runs set workbook_path = '../other/file.xlsx'
                where id = '00000000-0000-4000-8000-0000000062b1'$$),
  'check constraint',
  'a workbook path is a run id with .xlsx, never another path');
select ok(
  (select 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' = any(allowed_mime_types)
          and 'application/pdf' = any(allowed_mime_types) and not public
   from storage.buckets where id = 'reports'),
  'the reports bucket takes PDFs and workbooks and stays private');
select ok(
  not has_table_privilege('authenticated', 'public.report_runs', 'UPDATE'),
  'the browser roles still cannot change a run');

select * from finish();
rollback;
