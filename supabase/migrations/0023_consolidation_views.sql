-- Phase 15: consolidation as a query layer, never a stored aggregate (schema §13, TRD §29,
-- .grill/phase-15-consolidation-decisions.md). The scope dashboards and consolidation.query both read these,
-- so there is one definition of what a roll-up counts.

-- Every org unit paired with itself and each descendant, however many levels the tree has (audit C3).
-- ponytail: recomputed per query; materialise a closure table if the tree reaches tens of thousands of nodes.
create view public.org_unit_tree with (security_invoker = true) as
with recursive tree as (
  select id as ancestor_id, id as descendant_id, 0 as depth from public.org_units
  union all
  select t.ancestor_id, o.id, t.depth + 1
  from tree t join public.org_units o on o.parent_id = t.descendant_id
)
select ancestor_id, descendant_id, depth from tree;

-- What a roll-up counts: each verified, non-rejected record once per ancestor of its org unit, with the
-- value it contributes — the current calculation's result, or the verified amount for metrics that need no
-- calculation. A record that needs a calculation but has none carries value null ("not calculated").
create view public.consolidation_records with (security_invoker = true) as
select t.ancestor_id as org_unit_id,
       r.id as esg_record_id,
       r.org_unit_id as source_org_unit_id,
       r.reporting_period_id,
       r.metric_id,
       m.scope_id,
       r.approval_status,
       c.id as calculation_id,
       case when m.requires_calculation then c.result_value else r.activity_value_verified end as value,
       case when m.requires_calculation then c.result_unit else r.activity_unit end as value_unit,
       m.requires_calculation and c.id is null as not_calculated
from public.esg_records r
join public.esg_metrics m on m.id = r.metric_id
join public.org_unit_tree t on t.descendant_id = r.org_unit_id
left join public.calculations c on c.esg_record_id = r.id and c.is_current
where r.verification_status = 'user_verified'
  and r.data_quality_state <> 'rejected';

-- The browser never reads these directly (D1); the server does, and checks org scope itself.
revoke all on public.org_unit_tree, public.consolidation_records from anon, authenticated;
