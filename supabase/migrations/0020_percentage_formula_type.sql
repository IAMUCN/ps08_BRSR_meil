-- Phase 13 (SCHEMA_DEVIATIONS.md D14): percentage = part ÷ whole × 100 for BRSR shares (% women,
-- % trained, MSME share of spend). Its own migration because a new enum value can't be used in the
-- transaction that adds it.
alter type public.formula_type add value 'percentage';
