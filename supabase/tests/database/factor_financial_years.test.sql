-- Migration 0064: conversion factor versions cover whole financial years (owner's decision, 2026-11-11).
begin;
select plan(6);

insert into public.conversion_factors (id, activity_type, name)
values ('00000000-0000-4000-8000-0000000064f1', 'FY_TEST_FACTOR', 'FY test factor');
-- A version written straight to the table, as fixtures and scripts do: active needs an approver (0060).
insert into public.conversion_factor_versions
  (id, conversion_factor_id, version_number, value, input_unit, output_unit, source_reference,
   effective_from, status, created_by, approved_by, approved_at, self_approved)
select '00000000-0000-4000-8000-0000000064a1', '00000000-0000-4000-8000-0000000064f1', 1, 1, 'L', 'kgCO2e',
       'test', date '2026-08-15', 'active', u.id, u.id, now(), true
from public.users u limit 1;

select is(
  (select effective_from from public.conversion_factor_versions where id = '00000000-0000-4000-8000-0000000064a1'),
  date '2026-04-01',
  'a start in the middle of a year moves to 1 April of that financial year'
);
select is(
  (select effective_to from public.conversion_factor_versions where id = '00000000-0000-4000-8000-0000000064a1'),
  date '2027-03-31',
  'no end means one financial year: 31 March of the start year'
);

update public.conversion_factor_versions set effective_to = date '2029-01-10'
where id = '00000000-0000-4000-8000-0000000064a1';
select is(
  (select effective_to from public.conversion_factor_versions where id = '00000000-0000-4000-8000-0000000064a1'),
  date '2029-03-31',
  'an end moves to 31 March of its financial year'
);

update public.conversion_factor_versions set effective_to = date '2025-06-01'
where id = '00000000-0000-4000-8000-0000000064a1';
select is(
  (select effective_to from public.conversion_factor_versions where id = '00000000-0000-4000-8000-0000000064a1'),
  date '2027-03-31',
  'an end before the start becomes the start year'
);

select ok(
  not exists (select 1 from public.conversion_factor_versions
              where extract(month from effective_from) <> 4 or extract(day from effective_from) <> 1
                 or effective_to is null
                 or extract(month from effective_to) <> 3 or extract(day from effective_to) <> 31),
  'every version starts on 1 April and ends on 31 March'
);
select col_not_null('public', 'conversion_factor_versions', 'effective_to', 'every version has a last year');

select * from finish();
rollback;
