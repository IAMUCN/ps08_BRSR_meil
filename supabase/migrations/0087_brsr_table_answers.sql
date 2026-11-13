-- SEBI's tables that no source document carries, typed (or imported from Excel) once per financial year (owner's
-- decision, 2026-11-13; .grill/brsr-gaps-decisions.md): workforce, women's representation, turnover rate,
-- locations, markets, complaints, payable days, related-party concentration, well-being, retirement benefits,
-- parental leave, training, wages. The table layouts are code (apps/web/lib/brsr-tables/definitions.ts); this keeps
-- the values. Totals and percentages are worked out when shown, never stored.
--
-- Additive: one new server-only table. Who may write a table follows the written answers' rule (Super Admins,
-- and HR / Finance for the questions migration 0081 gives them).

create table public.brsr_table_answers (
  id uuid primary key default gen_random_uuid(),
  brsr_indicator_id uuid not null references public.brsr_indicators (id),
  financial_year integer not null check (financial_year between 2000 and 2100),
  -- "<part>.<row>" -> column -> number or text, as typed.
  cells jsonb not null check (jsonb_typeof(cells) = 'object'),
  -- A note printed under the table (definitions of permanent / other than permanent, restatements ...).
  notes text check (notes is null or length(notes) <= 2000),
  updated_by uuid not null references public.users (id),
  updated_at timestamptz not null default now(),
  unique (brsr_indicator_id, financial_year)
);

alter table public.brsr_table_answers enable row level security;
revoke all on public.brsr_table_answers from anon, authenticated;

-- Undo: drop table public.brsr_table_answers;
