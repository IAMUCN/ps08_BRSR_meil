-- Migration 0066: demo requests from the landing page (owner's request, 2026-11-11; D56,
-- .grill/demo-requests-decisions.md).
--
-- "Request a demo" opens a form (name, email, phone). The server stores the request, tells the Super Admins in
-- the app, and only then gives the page the demonstration video to play in its own player. The video is
-- configuration (org_settings 'demo_video'), not code. Requests are listed for Super Admins on Admin -> Demo
-- requests, where one can be marked as contacted. Nothing is emailed.
--
-- The table is written and read by the server only (no browser grants, RLS on with no policy), like every other
-- table holding personal data. A request is not audited when made (no signed-in person); marking it contacted is.
--
-- Undo: drop table public.demo_requests; delete from public.org_settings where key = 'demo_video';

create table public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) between 5 and 254 and email like '%_@_%._%'),
  phone text not null check (char_length(phone) between 7 and 20),
  created_at timestamptz not null default now(),
  contacted_at timestamptz,
  contacted_by uuid references public.users (id),
  check ((contacted_at is null) = (contacted_by is null))
);

create index demo_requests_created_at_idx on public.demo_requests (created_at desc);

alter table public.demo_requests enable row level security;
revoke all on public.demo_requests from anon, authenticated;

comment on table public.demo_requests is
  'Landing-page demo requests (name, email, phone); server-written, listed for Super Admins.';

-- The video shown after a request: a YouTube id, changed here, never sent to the page before the form is sent.
insert into public.org_settings (key, value)
values ('demo_video', '{"youtubeId": "sZqR5HWQZ6Y"}')
on conflict (key) do nothing;
