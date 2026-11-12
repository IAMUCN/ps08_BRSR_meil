-- Emission threshold alerts (feature_enhancement.md Phase 7, requirement 34; SCHEMA_DEVIATIONS D51;
-- .grill/feature-enhancement-roadmap-decisions.md, "Phase 7 decisions").
--
--   * `org_settings.emission_alert_settings`: whether the daily check runs, the percentage above the expected
--     average that raises an alert (per scope), how many earlier years' figures the expected average needs, and
--     how far back a closed period is still checked. A Super Admin changes them on Carbon Analytics.
--   * `emission_alerts`: one row per org unit, reporting period and scope whose approved emissions came out above
--     the expected average (the same period in up to three earlier financial years) by more than the threshold.
--     It keeps the measured figure, the expected average, the threshold used and the periods behind the average,
--     so the alert still says why after later corrections. Unique per unit, period and scope: found once.
--     An Administrator of the unit (or a Super Admin) may acknowledge it with a note.
--   * `emission_alert_sends`: one row per alert, person and channel, claimed before sending (as reminder_sends),
--     so a second run sends nothing again; a failed email is tried once more.
--
-- Additive: one setting, two server-only tables. Undo:
--   drop table public.emission_alert_sends; drop table public.emission_alerts;
--   delete from public.org_settings where key = 'emission_alert_settings'.

insert into public.org_settings (key, value)
values ('emission_alert_settings', '{
  "enabled": true,
  "thresholdPct": {"SCOPE_1": 20, "SCOPE_2": 20, "SCOPE_3": 20},
  "minBaselineYears": 2,
  "minIncreaseTco2e": 0.5,
  "lookbackDays": 180
}'::jsonb)
on conflict (key) do nothing;

create table public.emission_alerts (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units (id),
  reporting_period_id uuid not null references public.reporting_periods (id),
  scope_code text not null check (scope_code in ('SCOPE_1', 'SCOPE_2', 'SCOPE_3')),
  measured_tco2e numeric not null check (measured_tco2e >= 0),
  baseline_tco2e numeric not null check (baseline_tco2e > 0),
  threshold_pct numeric not null check (threshold_pct > 0 and threshold_pct <= 1000),
  -- [{periodId, label, tco2e}] — the earlier periods averaged into the baseline.
  baseline_periods jsonb not null check (jsonb_typeof(baseline_periods) = 'array'),
  status text not null default 'open' check (status in ('open', 'acknowledged')),
  acknowledged_by uuid references public.users (id),
  acknowledged_at timestamptz,
  acknowledged_note text check (char_length(acknowledged_note) between 3 and 1000),
  created_at timestamptz not null default now(),
  unique (org_unit_id, reporting_period_id, scope_code),
  check (measured_tco2e > baseline_tco2e),
  check (
    (status = 'open' and acknowledged_by is null and acknowledged_at is null and acknowledged_note is null)
    or (status = 'acknowledged' and acknowledged_by is not null and acknowledged_at is not null
        and acknowledged_note is not null)
  )
);
create index emission_alerts_created_idx on public.emission_alerts (created_at desc);
create index emission_alerts_unit_idx on public.emission_alerts (org_unit_id, status);

-- The figures of an alert are what it was raised on: only the acknowledgement may change, once.
create function public.guard_emission_alert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.org_unit_id is distinct from old.org_unit_id
     or new.reporting_period_id is distinct from old.reporting_period_id
     or new.scope_code is distinct from old.scope_code
     or new.measured_tco2e is distinct from old.measured_tco2e
     or new.baseline_tco2e is distinct from old.baseline_tco2e
     or new.threshold_pct is distinct from old.threshold_pct
     or new.baseline_periods is distinct from old.baseline_periods
     or new.created_at is distinct from old.created_at then
    raise exception 'An emission alert''s figures cannot be changed' using errcode = '42501';
  end if;
  if old.status = 'acknowledged' then
    raise exception 'This alert has already been acknowledged' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_emission_alert() from public, anon, authenticated;

create trigger emission_alerts_guard
before update on public.emission_alerts
for each row execute function public.guard_emission_alert();

create table public.emission_alert_sends (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.emission_alerts (id),
  recipient_id uuid not null references public.users (id),
  channel text not null check (channel in ('in_app', 'email')),
  status text not null check (status in ('sending', 'sent', 'failed')),
  error text check (char_length(error) <= 500),
  attempts integer not null default 1 check (attempts between 1 and 5),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (alert_id, recipient_id, channel)
);
create index emission_alert_sends_recipient_idx on public.emission_alert_sends (recipient_id, created_at desc);

-- Server-only: RLS on, no policies, no browser grants.
alter table public.emission_alerts enable row level security;
alter table public.emission_alert_sends enable row level security;
revoke all on public.emission_alerts from anon, authenticated;
revoke all on public.emission_alert_sends from anon, authenticated;
