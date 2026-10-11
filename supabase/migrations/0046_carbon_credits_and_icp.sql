-- Migration 0046: Carbon Credits Registry Ledger, Double-Counting Prevention, and Internal Carbon Pricing (ICP)
-- Supports Scope 1/2/3 net emissions reconciliation and shadow carbon pricing on capital expenditure.

-- 1. Enum Types
do $$
begin
  if not exists (select 1 from pg_type where typname = 'carbon_registry_type') then
    create type public.carbon_registry_type as enum (
      'CCTS_INDIA',
      'VERRA_VCS',
      'GOLD_STANDARD',
      'I_REC',
      'BEE_ESCERT',
      'INTERNAL_SHADOW'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'carbon_credit_status') then
    create type public.carbon_credit_status as enum (
      'MINTED',
      'HELD',
      'TRANSFERRED',
      'RETIRED'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'carbon_price_type') then
    create type public.carbon_price_type as enum (
      'SHADOW_PRICE',
      'INTERNAL_FEE',
      'IMPLICIT_PRICE'
    );
  end if;
end $$;

-- 2. Carbon Credits Inventory Table
create table if not exists public.carbon_credits (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units(id),
  project_name text not null,
  registry public.carbon_registry_type not null,
  registry_project_id text not null,
  serial_number_start text not null,
  serial_number_end text not null,
  quantity_tco2e numeric(14, 4) not null check (quantity_tco2e > 0),
  vintage_year int not null check (vintage_year >= 2015 and vintage_year <= 2050),
  methodology_code text not null,
  credit_type text not null default 'AVOIDANCE',
  status public.carbon_credit_status not null default 'MINTED',
  issuance_date date not null,
  verifier_name text not null,
  evidence_document_id uuid references public.documents(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists carbon_credits_org_unit_idx on public.carbon_credits (org_unit_id);
create index if not exists carbon_credits_status_idx on public.carbon_credits (status);
create index if not exists carbon_credits_registry_idx on public.carbon_credits (registry, registry_project_id);

-- 3. Carbon Credit Transactions / Retirement Log (Append-Only)
create table if not exists public.carbon_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references public.carbon_credits(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('TRANSFER', 'RETIREMENT')),
  quantity_tco2e numeric(14, 4) not null check (quantity_tco2e > 0),
  reporting_period_id uuid references public.reporting_periods(id),
  beneficiary_org_unit_id uuid references public.org_units(id),
  counterparty_name text,
  counterparty_registry_account text,
  retirement_reason text,
  target_scope text check (target_scope in ('SCOPE_1', 'SCOPE_2', 'SCOPE_3')),
  evidence_document_id uuid references public.documents(id),
  transaction_date date not null default current_date,
  executed_by uuid not null references public.users(id),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists carbon_credit_tx_credit_idx on public.carbon_credit_transactions (credit_id);
create index if not exists carbon_credit_tx_period_idx on public.carbon_credit_transactions (reporting_period_id);
create index if not exists carbon_credit_tx_beneficiary_idx on public.carbon_credit_transactions (beneficiary_org_unit_id);

-- Append-only trigger for transactions
create or replace function public.prevent_carbon_transactions_change() returns trigger
language plpgsql as $$
begin
  raise exception 'carbon_credit_transactions is append-only: % is not allowed', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;
revoke execute on function public.prevent_carbon_transactions_change() from public, anon, authenticated;

drop trigger if exists trg_carbon_credit_transactions_append_only on public.carbon_credit_transactions;
create trigger trg_carbon_credit_transactions_append_only
  before update or delete on public.carbon_credit_transactions
  for each row execute function public.prevent_carbon_transactions_change();

drop trigger if exists trg_carbon_credit_transactions_no_truncate on public.carbon_credit_transactions;
create trigger trg_carbon_credit_transactions_no_truncate
  before truncate on public.carbon_credit_transactions
  for each statement execute function public.prevent_carbon_transactions_change();

-- 4. Internal Carbon Pricing (ICP) Table
create table if not exists public.internal_carbon_prices (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units(id),
  effective_from date not null,
  effective_to date,
  shadow_price_per_tco2e numeric(10, 2) not null check (shadow_price_per_tco2e >= 0),
  currency varchar(3) not null default 'INR',
  price_type public.carbon_price_type not null default 'SHADOW_PRICE',
  applies_to_scopes text[] not null default '{"SCOPE_1","SCOPE_2"}',
  source_rational text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists internal_carbon_prices_org_unit_idx on public.internal_carbon_prices (org_unit_id, is_active);

-- 5. CapEx Carbon Evaluation Table
create table if not exists public.capex_carbon_evaluations (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units(id),
  project_name text not null,
  baseline_annual_emissions_tco2e numeric(12, 4) not null,
  projected_annual_emissions_tco2e numeric(12, 4) not null,
  capex_amount numeric(14, 2) not null check (capex_amount > 0),
  operational_annual_savings numeric(14, 2) not null default 0,
  project_lifespan_years int not null check (project_lifespan_years > 0),
  carbon_price_id uuid not null references public.internal_carbon_prices(id),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists capex_carbon_evaluations_org_unit_idx on public.capex_carbon_evaluations (org_unit_id);

-- 6. Permissions and Role Grants
insert into public.permissions (code, description) values
  ('carbon_credit.view', 'View carbon credit inventory, retirement logs and internal carbon pricing.'),
  ('carbon_credit.manage', 'Mint new carbon credits, log external transfers, and execute retirements.'),
  ('icp.manage', 'Configure shadow carbon prices and evaluate CapEx investments with carbon pricing.')
on conflict (code) do nothing;

-- Grant to Admin
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'admin' and p.code in ('carbon_credit.view', 'carbon_credit.manage', 'icp.manage')
on conflict do nothing;

-- Grant to Corporate ESG
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'corporate_esg' and p.code in ('carbon_credit.view', 'carbon_credit.manage', 'icp.manage')
on conflict do nothing;

-- Grant to Finance / CSR
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'finance_csr' and p.code in ('carbon_credit.view', 'icp.manage')
on conflict do nothing;

-- Grant to Project Manager
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'project_manager' and p.code in ('carbon_credit.view')
on conflict do nothing;

-- 7. RLS Configuration (Server handles writes, browser direct writes revoked)
alter table public.carbon_credits enable row level security;
alter table public.carbon_credit_transactions enable row level security;
alter table public.internal_carbon_prices enable row level security;
alter table public.capex_carbon_evaluations enable row level security;

revoke all on public.carbon_credits, public.carbon_credit_transactions,
               public.internal_carbon_prices, public.capex_carbon_evaluations
from anon, authenticated;

-- Allow chat_reader role read-only access if present
do $$
begin
  if exists (select from pg_roles where rolname = 'chat_reader') then
    grant select on public.carbon_credits, public.carbon_credit_transactions,
                    public.internal_carbon_prices, public.capex_carbon_evaluations
    to chat_reader;

    create policy chat_reader_select_cc on public.carbon_credits for select to chat_reader using (true);
    create policy chat_reader_select_cct on public.carbon_credit_transactions for select to chat_reader using (true);
    create policy chat_reader_select_icp on public.internal_carbon_prices for select to chat_reader using (true);
    create policy chat_reader_select_capex on public.capex_carbon_evaluations for select to chat_reader using (true);
  end if;
exception when others then
  null;
end $$;

-- 8. Seed Baseline Corporate Internal Carbon Price for Root Entity
insert into public.internal_carbon_prices (
  org_unit_id,
  effective_from,
  shadow_price_per_tco2e,
  currency,
  price_type,
  applies_to_scopes,
  source_rational
)
select
  id,
  '2024-04-01'::date,
  2500.00,
  'INR',
  'SHADOW_PRICE',
  array['SCOPE_1', 'SCOPE_2'],
  'MEIL Corporate Sustainability Committee guideline (aligned with High-Level Commission on Carbon Prices benchmark: ₹2,500/tCO2e)'
from public.org_units
where parent_id is null
limit 1
on conflict do nothing;
