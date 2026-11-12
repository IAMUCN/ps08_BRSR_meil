// Phase 5 of feature_enhancement.md: deadline reminders on a schedule (migration 0059). One run a day (Vercel
// Cron, or a Super Admin's "Run now"); owners get their own missing submissions, Administrators a summary of
// their units, the Super Admins a summary on email days only; nothing goes out twice. Local stack only.
import {
  APP,
  RUN,
  Session,
  check,
  ensureInvited,
  env,
  finish,
  ok,
  one,
  section,
  setup,
  sql,
} from "./lib.mjs";

const MAIL = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:55324";
const { sessions } = await setup();
const { admin, pm } = sessions;

const signIn = async (account) => {
  const who = await ensureInvited(admin, account);
  const session = new Session();
  await session.login(who, { takeover: true });
  return {
    session,
    email: who.email,
    id: (await one(sql`select id from public.users where email = ${who.email}`)).id,
  };
};
const prjAdmin = await signIn({
  email: "e2e.prjx.admin@traceesg.test",
  role: "org_admin",
  org: "PRJ-X",
  name: "E2E Project X Administrator",
});
const pmId = (await one(sql`select id from public.users where email = 'e2e.pm@traceesg.test'`))?.id;
const superIds = (
  await sql`
    select distinct a.user_id from public.user_org_assignments a
    join public.roles r on r.id = a.role_id and r.code = 'admin' where a.revoked_at is null`
).map((r) => r.user_id);

// A period of its own, due in three days (an email day in the default schedule); nothing is uploaded to it,
// so every expected submission of Project X and Project W is missing.
const { today } = await one(sql`select public.reporting_period_today()::text as today`);
const plus = (n) => sql`(${today}::date + ${n}::int)`;
const period = await one(sql`
  insert into public.reporting_periods
    (label, period_type, start_date, end_date, status, opened_at, submission_closes_on, late_uploads_until)
  values (${`E2E Reminders ${RUN}`}, 'monthly', '2031-01-01', '2031-01-31', 'open', now(), ${plus(3)}, ${plus(40)})
  returning id`);
const sends = (where = sql`true`) => sql`
  select s.kind, s.recipient_id, s.days_before, s.channel, s.status, s.attempts, s.missing_count
  from public.reminder_sends s where s.reporting_period_id = ${period.id} and ${where}`;

// ============================================================================================================
section("Who may do what");
// ============================================================================================================
const schedule = await admin.query("deadlines.schedule");
check(
  "the default schedule is 7 to 0 days, email on 7, 5, 3 and the due day",
  ok(schedule) &&
    schedule.data.days.map((d) => `${d.before}${d.email ? "e" : ""}`).join(",") ===
      "7e,6,5e,4,3e,2,1,0e",
  JSON.stringify(schedule.data),
);
check(
  "a Project Manager cannot run reminders",
  (await pm.mutate("deadlines.runReminders")).status === 403,
);
check(
  "an Administrator cannot run them either (Super Admin only)",
  (await prjAdmin.session.mutate("deadlines.runReminders")).status === 403,
);
check(
  "an Administrator cannot change the schedule",
  (await prjAdmin.session.mutate("deadlines.setSchedule", { days: [{ before: 1, email: true }] }))
    .status === 403,
);
check(
  "a Project Manager cannot read the reminder log",
  (await pm.query("deadlines.reminderLog")).status === 403,
);
check(
  "an Administrator opens Reporting Deadlines",
  (await prjAdmin.session.get("/admin/deadlines")).status === 200,
);

// ============================================================================================================
section("Three days before: owners, Administrators and the Super Admins, in the app and by email");
// ============================================================================================================
await fetch(`${MAIL}/api/v1/messages`, { method: "DELETE" });
const first = await admin.mutate("deadlines.runReminders");
check("the Super Admin runs today's reminders", ok(first), first.error);
const day3 = await sends();
const pmRows = day3.filter((r) => r.recipient_id === pmId && r.kind === "owner");
check(
  "the Project Manager gets one reminder per channel, listing every missing submission",
  pmRows.length === 2 &&
    pmRows.every((r) => r.days_before === 3 && r.status === "sent" && r.missing_count >= 2),
  JSON.stringify(pmRows),
);
const adminDigest = day3.filter((r) => r.recipient_id === prjAdmin.id && r.kind === "digest");
check(
  "the Project X Administrator gets a summary in the app and by email",
  adminDigest.length === 2 && adminDigest.every((r) => r.status === "sent"),
  JSON.stringify(adminDigest),
);
const superDigest = day3.filter((r) => superIds.includes(r.recipient_id) && r.kind === "digest");
check(
  "each Super Admin gets a summary of everything",
  superDigest.length === superIds.length * 2,
  `${superDigest.length} rows for ${superIds.length} Super Admins`,
);
check(
  "the Project X Administrator's summary covers Project X only",
  adminDigest[0]?.missing_count <
    day3.find((r) => superIds.includes(r.recipient_id) && r.kind === "digest")?.missing_count,
);
const note = await one(sql`
  select title, deep_link_path from public.notifications
  where user_id = ${pmId} and type = 'deadline_approaching' and related_entity_id = ${period.id}`);
check(
  "the in-app reminder says how many and when, and links to Upload",
  /submissions? due in 3 days for E2E Reminders/.test(note?.title ?? "") &&
    note?.deep_link_path === "/app/upload",
  JSON.stringify(note),
);
const mail = await fetch(
  `${MAIL}/api/v1/search?query=${encodeURIComponent('to:"e2e.pm@traceesg.test"')}`,
).then((r) => r.json());
check(
  "the Project Manager's email arrives",
  mail.messages?.some((m) => /due in 3 days/.test(m.Subject)),
  JSON.stringify(mail.messages?.map((m) => m.Subject)),
);
check(
  "the run is audited",
  (
    await one(sql`
      select count(*)::int as n from public.audit_logs
      where event_type = 'reminders.run' and created_at > now() - interval '2 minutes'`)
  ).n >= 1,
);

// ============================================================================================================
section("Nothing twice");
// ============================================================================================================
const second = await admin.mutate("deadlines.runReminders");
check(
  "a second run the same day sends nothing new",
  ok(second) &&
    second.data.sent.inApp === 0 &&
    second.data.sent.email === 0 &&
    second.data.skipped > 0,
  JSON.stringify(second.data),
);
const notes = await one(sql`
  select count(*)::int as n from public.notifications
  where user_id = ${pmId} and type = 'deadline_approaching' and related_entity_id = ${period.id}`);
check("the Project Manager still has one in-app reminder", notes.n === 1, `${notes.n}`);

// A failed email is tried once more, never a third time.
await sql`
  update public.reminder_sends set status = 'failed', error = 'test failure'
  where reporting_period_id = ${period.id} and recipient_id = ${pmId} and channel = 'email'`;
const retry = await admin.mutate("deadlines.runReminders");
const retried = await one(sends(sql`s.recipient_id = ${pmId} and s.channel = 'email'`));
check(
  "a failed email is sent again on the next run",
  ok(retry) && retry.data.sent.email === 1 && retried.status === "sent" && retried.attempts === 2,
  JSON.stringify(retried),
);
await sql`
  update public.reminder_sends set status = 'failed', error = 'test failure'
  where reporting_period_id = ${period.id} and recipient_id = ${pmId} and channel = 'email'`;
const third = await admin.mutate("deadlines.runReminders");
check(
  "after two attempts it is left as failed",
  ok(third) &&
    third.data.sent.email === 0 &&
    (await one(sends(sql`s.recipient_id = ${pmId} and s.channel = 'email'`))).status === "failed",
);

// ============================================================================================================
section("Six days before: in the app only, and no Super Admin summary");
// ============================================================================================================
await sql`update public.reporting_periods set submission_closes_on = ${plus(6)} where id = ${period.id}`;
const day6run = await admin.mutate("deadlines.runReminders");
const day6 = await sends(sql`s.days_before = 6`);
check(
  "owners and Administrators are reminded in the app",
  ok(day6run) &&
    day6.some((r) => r.recipient_id === pmId && r.channel === "in_app") &&
    day6.some((r) => r.recipient_id === prjAdmin.id && r.channel === "in_app"),
  JSON.stringify(day6run.data),
);
check(
  "no email goes out on an in-app day",
  day6.every((r) => r.channel === "in_app"),
);
check(
  "the Super Admins are not sent a summary on an in-app day",
  !day6.some((r) => superIds.includes(r.recipient_id)),
);

// ============================================================================================================
section("Not a schedule day; a period that no longer takes uploads");
// ============================================================================================================
await sql`update public.reporting_periods set submission_closes_on = ${plus(10)} where id = ${period.id}`;
const day10 = await admin.mutate("deadlines.runReminders");
check(
  "ten days before, nothing is sent",
  ok(day10) && day10.data.messages === 0,
  JSON.stringify(day10.data),
);

// ============================================================================================================
section("The schedule is the Super Admin's to change");
// ============================================================================================================
const { since } = await one(sql`select now() as since`);
const saved = await admin.mutate("deadlines.setSchedule", {
  days: [
    { before: 10, email: false },
    { before: 0, email: true },
  ],
});
check("the Super Admin saves a schedule with a ten-day reminder", ok(saved), saved.error);
check(
  "the change is audited",
  (
    await one(sql`
      select count(*)::int as n from public.audit_logs
      where event_type = 'settings.reminder_schedule_changed' and created_at >= ${since}`)
  ).n === 1,
);
const day10b = await admin.mutate("deadlines.runReminders");
check(
  "now ten days before is a reminder day",
  ok(day10b) && day10b.data.sent.inApp > 0 && day10b.data.sent.email === 0,
  JSON.stringify(day10b.data),
);
const restored = await admin.mutate("deadlines.setSchedule", { days: schedule.data.days });
check("the default schedule is put back", ok(restored), restored.error);

// ============================================================================================================
section("The reminder log and the daily trigger");
// ============================================================================================================
const adminLog = await admin.query("deadlines.reminderLog");
const prjLog = await prjAdmin.session.query("deadlines.reminderLog");
check(
  "the Super Admin sees every reminder",
  ok(adminLog) && adminLog.data.some((r) => r.periodLabel === `E2E Reminders ${RUN}`),
);
const ours = (log) => log.data.filter((r) => r.periodLabel === `E2E Reminders ${RUN}`);
check(
  "the Super Admin also sees the other Administrators' summaries",
  ours(adminLog).some((r) => r.kind === "digest" && r.recipient !== "E2E Project X Administrator"),
);
check(
  "the Project X Administrator sees their own summary and owners' reminders",
  ok(prjLog) &&
    ours(prjLog).some(
      (r) => r.kind === "digest" && r.recipient === "E2E Project X Administrator",
    ) &&
    ours(prjLog).some((r) => r.kind === "owner" && r.recipient === "E2E Project Manager"),
);
check(
  "…but no other Administrator's or Super Admin's summary",
  !prjLog.data.some((r) => r.kind === "digest" && r.recipient !== "E2E Project X Administrator"),
  [...new Set(prjLog.data.filter((r) => r.kind === "digest").map((r) => r.recipient))].join(", "),
);

const cron = (auth) =>
  fetch(`${APP}/api/cron/reminders`, auth ? { headers: { authorization: auth } } : {});
check("the daily trigger refuses a request without the secret", (await cron()).status === 401);
check(
  "…and one with the wrong secret",
  (await cron("Bearer not-the-secret-at-all")).status === 401,
);
if (env.CRON_SECRET) {
  const res = await cron(`Bearer ${env.CRON_SECRET}`);
  const body = await res.json().catch(() => ({}));
  check(
    "with the secret it runs, and sends nothing already sent",
    res.status === 200 && body.sent?.inApp === 0 && body.sent?.email === 0,
    `${res.status} ${JSON.stringify(body)}`,
  );
} else {
  check(
    "CRON_SECRET is set for the test app (E2E_ENV_FILE)",
    false,
    "not set: the trigger was not run",
  );
}

// The period stops taking part in later runs.
await sql`update public.reporting_periods set status = 'closed' where id = ${period.id}`;
await finish();
