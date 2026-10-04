-- Phase 19: the user's theme (migration 0028, deviation D20) — three values, Theme 1 by default, readable by
-- the user's own session and changed only by the server (profile.setTheme, audited).
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

-- Theme 2 (Corporate) since migration 0031 / D23; the column's three allowed values are unchanged.
select col_default_is('public', 'users', 'theme', 'theme-2', 'Theme 2 is the default (D23)');
select col_not_null('public', 'users', 'theme', 'every user has a theme');
select throws_ok(
  $$update public.users set theme = 'neon' where id = (select id from public.users limit 1)$$,
  '23514', null, 'only the three themes are accepted');
select ok(has_column_privilege('authenticated', 'public.users', 'theme', 'SELECT'),
  'a session can read its own theme');
select ok(not has_column_privilege('authenticated', 'public.users', 'theme', 'UPDATE'),
  'but not change it directly — only the server can (audited)');

select * from finish();
rollback;
