-- Zero values are accepted and flagged for review (owner's decision, 2026-11-13; .grill/brsr-gaps-decisions.md).
-- Until now the global range rule refused any activity value that was not above 0 (hard fail), so a month with no
-- usage could not be recorded. Now a value must be at least 0, and a zero goes to the Validation Queue for a person
-- to confirm (`flag_zero`). Negative values are still refused.
--
-- `flag_zero` is an extra key on the existing range check, not a new check type: code from before this migration
-- ignores the key (a zero simply passes there), where an unknown check type would flag every record.

update public.validation_rules
set rule_definition = '{"check": "range", "field": "activity_value", "min": 0, "flag_zero": true}'::jsonb
where metric_id is null
  and rule_definition ->> 'check' = 'range'
  and rule_definition ->> 'field' = 'activity_value'
  and rule_definition -> 'min_exclusive' = '0'::jsonb;

-- Undo:
--   update public.validation_rules
--   set rule_definition = '{"check": "range", "field": "activity_value", "min_exclusive": 0}'::jsonb
--   where metric_id is null and rule_definition ->> 'check' = 'range'
--     and rule_definition ->> 'field' = 'activity_value' and rule_definition ? 'flag_zero';
