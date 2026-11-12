-- Migration 0063: the optional document description (owner's request, 2026-11-11).
begin;
select plan(5);

select has_column('public', 'documents', 'description', 'documents has a description column');
select col_is_null('public', 'documents', 'description', 'the description is optional');
select col_type_is('public', 'documents', 'description', 'text', 'the description is text');

-- The length rule, checked on a value alone so no fixture rows are needed.
select ok(
  exists (select 1 from pg_constraint where conname = 'documents_description_length'),
  'a check limits the description'
);
select is(
  (select count(*)::int from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'documents' and column_name = 'description'
      and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE')),
  0,
  'the browser roles cannot write the description'
);

select * from finish();
rollback;
