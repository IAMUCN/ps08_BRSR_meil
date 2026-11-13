-- Overdue submissions climb the hierarchy step by step (owner's decision of 2026-11-13;
-- .grill/deadline-escalation-decisions.md).
--
--   * `reminder_sends.days_before` may be negative: -3 is "3 days after the due date". Overdue owners are reminded
--     daily (in-app) and the escalation steps are sent once each, all claimed in this table like every reminder.
--   * `reminder_sends.kind` gains 'escalation': the message to an Administrator (or the Super Admins) about overdue
--     submissions in their units.
--   * `org_settings.reminder_schedule` gains `escalation` (days after the due date on which the unit's Administrator,
--     the next Administrator up and the Super Admins are told: 1, 3, 7). A schedule still on the previous default
--     (in-app 7 to 0, email on 7, 5, 3 and 0) moves to the new one (14, 10, 7, 5, 3, 2, 1, 0; email on 14, 7, 3, 0);
--     a schedule an owner changed keeps its days.
--
-- Additive: two relaxed checks and one setting. Undo: restore the two checks as in 0059 (no negative days, only
-- 'owner' and 'digest'; delete the 'escalation' and negative rows first) and remove `escalation` from the setting.

alter table public.reminder_sends drop constraint reminder_sends_kind_check;
alter table public.reminder_sends
  add constraint reminder_sends_kind_check check (kind in ('owner', 'digest', 'escalation'));

alter table public.reminder_sends drop constraint reminder_sends_days_before_check;
alter table public.reminder_sends
  add constraint reminder_sends_days_before_check check (days_before between -60 and 60);

update public.org_settings
set value = jsonb_set(
      case when value = '{
  "days": [
    {"before": 7, "email": true}, {"before": 6, "email": false}, {"before": 5, "email": true},
    {"before": 4, "email": false}, {"before": 3, "email": true}, {"before": 2, "email": false},
    {"before": 1, "email": false}, {"before": 0, "email": true}
  ],
  "timezone": "Asia/Kolkata"
}'::jsonb
        then jsonb_set(value, '{days}', '[
    {"before": 14, "email": true}, {"before": 10, "email": false}, {"before": 7, "email": true},
    {"before": 5, "email": false}, {"before": 3, "email": true}, {"before": 2, "email": false},
    {"before": 1, "email": false}, {"before": 0, "email": true}
  ]'::jsonb)
        else value end,
      '{escalation}',
      coalesce(value -> 'escalation',
               '{"unitAdminAfter": 1, "parentAdminAfter": 3, "superAdminAfter": 7}'::jsonb))
where key = 'reminder_schedule';
