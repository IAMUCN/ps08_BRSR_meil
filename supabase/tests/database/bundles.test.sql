-- D24: multi-bill PDFs. The proposed split is server-only, a bill points back at its PDF, and the
-- constraints keep a split well-formed.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

select has_column('public', 'documents', 'is_bundle', 'documents says whether it is a multi-bill PDF');
select has_column('public', 'documents', 'bundle_document_id', 'a bill points back at its PDF');
select col_default_is('public', 'documents', 'is_bundle', 'false', 'ordinary uploads are not bundles');
select is((select relrowsecurity from pg_class where oid = 'public.document_bundle_parts'::regclass), true,
  'document_bundle_parts has RLS');
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'document_bundle_parts'
     and grantee in ('anon', 'authenticated')),
  0, 'the browser roles have no grant on document_bundle_parts');

insert into auth.users (id, email, aud, role) values
  ('72111111-1111-4111-8111-111111111111', 'bundle.test@example.test', 'authenticated', 'authenticated');
insert into public.users (id, display_name, email) values
  ('72111111-1111-4111-8111-111111111111', 'Bundle Test', 'bundle.test@example.test');
insert into public.documents (id, org_unit_id, reporting_period_id, storage_path, file_name, mime_type,
  file_size_bytes, file_hash, uploaded_by, is_bundle)
select '72222222-2222-4222-8222-222222222222', ou.id, rp.id, 'p', 'bundle.pdf', 'application/pdf', 1, 'h',
  '72111111-1111-4111-8111-111111111111', true
from public.org_units ou, public.reporting_periods rp
where ou.code = 'PRJ-X' and rp.status = 'open' limit 1;

select lives_ok(
  $$insert into public.document_bundle_parts (bundle_document_id, part_number, page_from, page_to)
    values ('72222222-2222-4222-8222-222222222222', 1, 1, 2)$$,
  'a bill of pages 1-2 is stored');
select throws_ok(
  $$insert into public.document_bundle_parts (bundle_document_id, part_number, page_from, page_to)
    values ('72222222-2222-4222-8222-222222222222', 2, 3, 2)$$,
  '23514', null, 'the last page cannot come before the first');
select throws_ok(
  $$insert into public.document_bundle_parts (bundle_document_id, part_number, page_from, page_to)
    values ('72222222-2222-4222-8222-222222222222', 1, 3, 3)$$,
  '23505', null, 'a part number is used once per PDF');
select throws_ok(
  $$insert into public.document_bundle_parts (bundle_document_id, part_number, page_from, page_to, status)
    values ('72222222-2222-4222-8222-222222222222', 3, 3, 3, 'maybe')$$,
  '23514', null, 'status is proposed, created or skipped');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "72111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
select throws_ok(
  $$select * from public.document_bundle_parts$$, '42501', null,
  'a signed-in user cannot read the proposed splits directly');

select * from finish();
rollback;
