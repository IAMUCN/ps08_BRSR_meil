-- theme-toggle-decisions.md: the default theme moves from theme-1 (Warm/Special) to theme-2 (Corporate,
-- blue/red/white) — schema deviation D23. Existing rows are left as they are; this only changes what a
-- newly provisioned account gets before anyone chooses for themselves.
alter table public.users alter column theme set default 'theme-2';
