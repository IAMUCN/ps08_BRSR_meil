-- Conversion-factor sources, a review step for factors, and carbon-credit links (feature_enhancement.md Phase 6,
-- requirements 7, 17 and 35; SCHEMA_DEVIATIONS D50; .grill/feature-enhancement-roadmap-decisions.md, "Phase 6
-- decisions").
--
--   * `conversion_factor_versions` gains where its value came from (link, publisher, the financial year it is for,
--     the date it was read, and whether it was typed or taken from the fetched page) and who approved it. A new or
--     corrected version is saved as a draft; calculations never use a draft (the engine already reads only active
--     and superseded versions). A Super Admin other than the one who entered it approves it; while only one Super
--     Admin exists they may approve their own, and that is marked.
--   * `org_settings.factor_source_hosts`: the official sites a factor link may be fetched from. Anything else is
--     stored as a link only.
--   * `carbon_credit_links`: outside sites where credits are explored or traded, kept by a Super Admin, each with
--     the date its address was last checked. EmeilSG does not sell, certify or guarantee credits.
--
-- Additive. Versions that are active today stay active (approved_by stays empty: they predate the review step).
-- Undo: drop table public.carbon_credit_links; delete from public.org_settings where key = 'factor_source_hosts';
--   drop trigger trg_factor_version_approval on public.conversion_factor_versions;
--   drop function public.guard_factor_version_approval();
--   alter table public.conversion_factor_versions drop column source_url, drop column source_publisher,
--     drop column financial_year, drop column source_retrieved_on, drop column value_origin,
--     drop column source_content_sha256, drop column approved_by, drop column approved_at,
--     drop column self_approved, drop column review_note;

alter table public.conversion_factor_versions
  add column source_url text
    constraint conversion_factor_versions_source_url_check
      check (source_url is null or (char_length(source_url) <= 500 and source_url ~ '^https://')),
  add column source_publisher text
    constraint conversion_factor_versions_source_publisher_check check (char_length(source_publisher) <= 160),
  -- Indian financial year the value is for, "2025-26".
  add column financial_year text
    constraint conversion_factor_versions_financial_year_check
      check (financial_year is null or financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
  add column source_retrieved_on date,
  -- 'manual': typed; 'fetched': chosen from the values read off the linked page (and checked by the person).
  add column value_origin text not null default 'manual'
    constraint conversion_factor_versions_value_origin_check check (value_origin in ('manual', 'fetched')),
  add column source_content_sha256 text
    constraint conversion_factor_versions_source_sha_check
      check (source_content_sha256 is null or source_content_sha256 ~ '^[0-9a-f]{64}$'),
  add column approved_by uuid references public.users (id),
  add column approved_at timestamptz,
  add column self_approved boolean not null default false,
  -- Why a draft was turned down, or a note left on approval.
  add column review_note text
    constraint conversion_factor_versions_review_note_check check (char_length(review_note) <= 500),
  add constraint conversion_factor_versions_approval_check check (
    (approved_by is null) = (approved_at is null)
    and (not self_approved or approved_by = created_by)
    and (self_approved or approved_by is null or approved_by <> created_by)
  );

-- The review step held by the database too: a version enters use (inserted active, or a draft made active) only
-- with an approver recorded. Rows active before this migration are untouched.
create or replace function public.guard_factor_version_approval() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' and new.approved_by is null
     and (tg_op = 'INSERT' or old.status = 'draft') then
    raise exception 'A conversion factor version needs an approval before it is used'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.approved_by is not null
     and (new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at) then
    raise exception 'An approval cannot be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_factor_version_approval before insert or update on public.conversion_factor_versions
  for each row execute function public.guard_factor_version_approval();
revoke execute on function public.guard_factor_version_approval() from public, anon, authenticated;

-- Official sites a factor link may be fetched from (host or a parent domain of it).
insert into public.org_settings (key, value)
values ('factor_source_hosts', '{
  "hosts": [
    {"host": "cea.nic.in", "publisher": "Central Electricity Authority"},
    {"host": "beeindia.gov.in", "publisher": "Bureau of Energy Efficiency"},
    {"host": "moef.gov.in", "publisher": "Ministry of Environment, Forest and Climate Change"},
    {"host": "steel.gov.in", "publisher": "Ministry of Steel"},
    {"host": "niti.gov.in", "publisher": "NITI Aayog"},
    {"host": "ipcc-nggip.iges.or.jp", "publisher": "IPCC National Greenhouse Gas Inventories Programme"},
    {"host": "ipcc.ch", "publisher": "Intergovernmental Panel on Climate Change"},
    {"host": "ghgprotocol.org", "publisher": "GHG Protocol"},
    {"host": "indiaghgp.org", "publisher": "India GHG Program"}
  ]
}'::jsonb)
on conflict (key) do nothing;

create table public.carbon_credit_links (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  url text not null check (char_length(url) <= 500 and url ~ '^https://'),
  description text not null check (char_length(description) between 2 and 500),
  -- 'india_official': the Indian scheme's own sites; 'exchange': where certificates trade; 'registry': an
  -- international registry of voluntary credits.
  kind text not null check (kind in ('india_official', 'exchange', 'registry')),
  position integer not null default 0,
  active boolean not null default true,
  -- The last check of the address: when, the HTTP status, and the address it ended at.
  checked_at timestamptz,
  check_status integer,
  check_final_url text check (char_length(check_final_url) <= 500),
  created_by uuid references public.users (id),
  updated_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (url)
);

-- Addresses fetched and read on 2026-11-08 (decision log). PXIL's site refused connections that day and Grid-India's
-- page did not show its registry role, so neither is preset; a Super Admin can add them.
insert into public.carbon_credit_links (name, url, description, kind, position) values
  ('Indian Carbon Market (BEE)', 'https://indiancarbonmarket.gov.in/',
   'The Bureau of Energy Efficiency''s portal for India''s carbon market: the compliance and offset mechanisms, '
   'notified targets and procedures.', 'india_official', 10),
  ('Bureau of Energy Efficiency', 'https://beeindia.gov.in/',
   'The administrator of India''s Carbon Credit Trading Scheme (Ministry of Power).', 'india_official', 20),
  ('Indian Energy Exchange (IEX)', 'https://www.iexindia.com/',
   'A power exchange. Check on its site whether carbon credit certificates are open for trading.', 'exchange', 30),
  ('Hindustan Power Exchange (HPX)', 'https://www.hpxindia.com/',
   'A power exchange. Check on its site whether carbon credit certificates are open for trading.', 'exchange', 40),
  ('Verra Registry', 'https://registry.verra.org/',
   'Public registry of Verified Carbon Standard (VCS) projects and credits.', 'registry', 50),
  ('Gold Standard Registry', 'https://registry.goldstandard.org/',
   'Public registry of Gold Standard projects and credits.', 'registry', 60);

-- Server-only: RLS on, no policies, no browser grants.
alter table public.carbon_credit_links enable row level security;
revoke all on public.carbon_credit_links from anon, authenticated;
