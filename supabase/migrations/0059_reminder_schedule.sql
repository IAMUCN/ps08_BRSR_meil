-- Deadline reminders on a schedule (feature_enhancement.md Phase 5, requirements 10, 16 and 24; SCHEMA_DEVIATIONS
-- D49; .grill/feature-enhancement-roadmap-decisions.md, "Phase 5 decisions").
--
--   * `org_settings.reminder_schedule`: the days before a period's due date on which reminders go out, and on which
--     of them by email too. Owner's default: in-app on days 7 to 0, email on 7, 5, 3 and 0. India time.
--   * `reminder_sends`: one row per reminder per person, period, schedule day and channel. The unique key is what
--     stops a second copy: a run (Vercel Cron, daily; or "Run now") claims the row before sending, and an email's
--     outcome is kept (accepted, or failed with the reason; a failed one is tried once more on the next run).
--     `org_unit_ids` are the units the reminder was about, so an Administrator sees the reminders for their units.
--
-- Additive: one setting, one server-only table. Undo: drop table public.reminder_sends;
--   delete from public.org_settings where key = 'reminder_schedule'.

insert into public.org_settings (key, value)
values ('reminder_schedule', '{
  "days": [
    {"before": 7, "email": true}, {"before": 6, "email": false}, {"before": 5, "email": true},
    {"before": 4, "email": false}, {"before": 3, "email": true}, {"before": 2, "email": false},
    {"before": 1, "email": false}, {"before": 0, "email": true}
  ],
  "timezone": "Asia/Kolkata"
}'::jsonb)
on conflict (key) do nothing;

create table public.reminder_sends (
  id uuid primary key default gen_random_uuid(),
  reporting_period_id uuid not null references public.reporting_periods (id),
  -- 'owner': to someone whose submissions are missing; 'digest': an Administrator's (or Super Admin's) summary.
  kind text not null check (kind in ('owner', 'digest')),
  recipient_id uuid not null references public.users (id),
  days_before integer not null check (days_before between 0 and 60),
  channel text not null check (channel in ('in_app', 'email')),
  status text not null check (status in ('sending', 'sent', 'failed')),
  error text check (char_length(error) <= 500),
  attempts integer not null default 1 check (attempts between 1 and 5),
  missing_count integer not null check (missing_count >= 0),
  org_unit_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (reporting_period_id, kind, recipient_id, days_before, channel)
);
create index reminder_sends_period_idx on public.reminder_sends (reporting_period_id, created_at desc);
create index reminder_sends_units_idx on public.reminder_sends using gin (org_unit_ids);

-- Server-only: RLS on, no policies, no browser grants.
alter table public.reminder_sends enable row level security;
revoke all on public.reminder_sends from anon, authenticated;
