-- Phase 12: Scope 3 is configuration (migration 0019) — categories are child rows under SCOPE_3, only the
-- ones with usable evidence are active, and each active category's evidence belongs to a role.
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

select is(
  (select count(*)::int from public.scopes child
     join public.scopes parent on parent.id = child.parent_scope_id
    where parent.code = 'SCOPE_3'),
  10,
  'the candidate categories from Master Approach §17 are seeded');

select is(
  (select count(*)::int from public.scopes where parent_scope_id is null),
  3,
  'Scope 1, 2 and 3 remain the only top-level scopes — categories needed no schema change');

select is(
  (select count(*)::int from public.scopes child
     join public.scopes parent on parent.id = child.parent_scope_id
    where parent.code = 'SCOPE_3' and child.is_active
      and not exists (select 1 from public.esg_metrics m
                       where m.scope_id = child.id and m.deleted_at is null)),
  0,
  'every active category has at least one configured activity');

select is(
  (select count(*)::int from public.esg_metrics m
     join public.scopes s on s.id = m.scope_id
     join public.scopes p on p.id = s.parent_scope_id
     join public.esg_categories c on c.id = m.category_id
    where p.code = 'SCOPE_3' and c.owning_role_id is null),
  0,
  'Scope 3 evidence belongs to the role that owns it');

select is(
  (select count(*)::int from public.esg_metrics m
     join public.scopes s on s.id = m.scope_id
     join public.scopes p on p.id = s.parent_scope_id
    where p.code = 'SCOPE_3'
      and (not exists (select 1 from public.calculation_formulas f
                        where f.metric_id = m.id and f.status = 'active')
           or not exists (select 1 from public.document_type_metric_mappings map
                           where map.metric_id = m.id)
           or not exists (select 1 from public.metric_field_requirements r
                           where r.metric_id = m.id and r.is_required))),
  0,
  'each Scope 3 activity has a formula, an evidence type and required fields');

select ok(
  (select count(*) from public.scopes child
     join public.scopes parent on parent.id = child.parent_scope_id
    where parent.code = 'SCOPE_3' and not child.is_active) >= 5,
  'the categories without evidence stay listed but inactive, so coverage is never implied');

select * from finish();
rollback;
