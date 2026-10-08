-- The UN Sustainable Development Goals each BRSR indicator relates to (owner's request, 2026-10-09;
-- .grill/audit-2-decisions.md). SEBI's format does not prescribe this mapping: it is an indicative tag,
-- configuration like the indicators themselves, printed on the report and labelled as such.
alter table public.brsr_indicators
  add column sdg_goals smallint[] not null default '{}'
  constraint brsr_indicators_sdg_goals_range check (sdg_goals <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]::smallint[]);

update public.brsr_indicators i set sdg_goals = v.goals::smallint[]
from (values
  ('A-20', '{5,8}'),      -- employees by gender
  ('A-24', '{11}'),       -- CSR
  ('P1-E2', '{16}'),      -- fines and penalties
  ('P3-E8', '{8}'),       -- training
  ('P6-E3', '{6}'),       -- water
  ('P6-E6', '{3,11}'),    -- air emissions
  ('P6-E7', '{7,9,13}'),  -- Scope 1 and 2
  ('P6-E9', '{11,12}'),   -- waste
  ('P6-L2', '{12,13,17}'),-- Scope 3 (value chain)
  ('P8-E4', '{8}')        -- MSME sourcing
) as v (code, goals)
where i.code = v.code;
