-- Migration 0054: Increase absolute session limit from 12 hours (720 min) to 72 hours (4320 min)

insert into public.org_settings (key, value)
values ('session_limits', '{"idle_minutes": 180, "absolute_minutes": 4320}'::jsonb)
on conflict (key) do update
set value = jsonb_set(public.org_settings.value, '{absolute_minutes}', '4320');

create or replace function public.session_limits(out idle_minutes int, out absolute_minutes int)
language plpgsql
stable
set search_path = ''
as $$
declare
  setting jsonb;
begin
  select value into setting from public.org_settings where key = 'session_limits';
  begin
    idle_minutes := (setting ->> 'idle_minutes')::int;
    absolute_minutes := (setting ->> 'absolute_minutes')::int;
  exception when others then
    idle_minutes := null;
    absolute_minutes := null;
  end;
  if idle_minutes is null or idle_minutes < 1 or idle_minutes > 1440 then
    idle_minutes := 180;
  end if;
  if absolute_minutes is null or absolute_minutes < idle_minutes or absolute_minutes > 10080 then
    absolute_minutes := greatest(4320, idle_minutes);
  end if;
end;
$$;
