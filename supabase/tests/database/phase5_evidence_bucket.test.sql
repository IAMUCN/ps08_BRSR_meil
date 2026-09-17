-- Phase 5 / D3: the evidence bucket is private and clients cannot read, list or write its objects.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

select is((select public from storage.buckets where id = 'evidence'), false, 'evidence bucket is private');
select is((select file_size_limit from storage.buckets where id = 'evidence'), 52428800::bigint,
  'evidence bucket limits files to 50 MB');
select is((select allowed_mime_types from storage.buckets where id = 'evidence'),
  array['application/pdf', 'image/jpeg', 'image/png'], 'evidence bucket accepts PDF, JPG and PNG only');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'), 0,
  'no client policies on storage.objects');

insert into auth.users (id, email, aud, role) values
  ('71111111-1111-4111-8111-111111111111', 'pm.bucket@example.test', 'authenticated', 'authenticated');
insert into public.users (id, display_name, email) values
  ('71111111-1111-4111-8111-111111111111', 'PM Bucket Test', 'pm.bucket@example.test');
insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
select '71111111-1111-4111-8111-111111111111', ou.id, r.id, '71111111-1111-4111-8111-111111111111'
from public.org_units ou, public.roles r
where ou.code = 'PRJ-X' and r.code = 'project_manager';

-- An object in the uploader's own project path, stored the way the server stores it.
insert into storage.objects (bucket_id, name)
select 'evidence', ou.id || '/period/doc/original.pdf' from public.org_units ou where ou.code = 'PRJ-X';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "71111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);

select is((select count(*)::int from storage.objects where bucket_id = 'evidence'), 0,
  'uploader cannot see evidence objects, even in their own project');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('evidence', 'x/y/z/original.pdf')$$,
  '42501', null, 'uploader cannot write evidence objects directly');
select throws_ok(
  $$insert into public.documents (org_unit_id, reporting_period_id, storage_path, file_name, mime_type,
      file_size_bytes, file_hash, uploaded_by)
    select ou.id, rp.id, 'p', 'f.pdf', 'application/pdf', 1, 'h', '71111111-1111-4111-8111-111111111111'
    from public.org_units ou, public.reporting_periods rp where ou.code = 'PRJ-X' and rp.status = 'open'$$,
  '42501', null, 'uploader cannot insert documents rows directly');
select throws_ok(
  $$insert into public.ocr_jobs (document_id) values (gen_random_uuid())$$,
  '42501', null, 'uploader cannot create OCR jobs directly');

select * from finish();
rollback;
