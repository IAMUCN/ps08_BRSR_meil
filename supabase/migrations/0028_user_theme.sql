-- Phase 19: the user's chosen UI theme (UI brief §4, App Flow §2.3 Profile — "persisted per-user … synced to
-- the profile record"; schema deviation D20). Changed only by the server (profile.setTheme, audited); the
-- browser keeps a copy in localStorage so the first paint is already in the right theme.
alter table public.users
  add column theme text not null default 'theme-1'
    constraint users_theme_check check (theme in ('theme-1', 'theme-2', 'theme-3'));
