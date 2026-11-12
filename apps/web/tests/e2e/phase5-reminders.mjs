// Phase 5 of feature_enhancement.md: deadline reminders on a schedule (migration 0059). One run a day (Vercel
// Cron, or a Super Admin's "Run now"); owners get their own missing submissions, Administrators a summary of
// their units, the Super Admins a summary on email days only; nothing goes out twice. Migration 0071: once a
// submission is overdue its owners are reminded daily and the alert climbs one step at a time (unit Administrator,
// the next one up, the Super Admins). Local stack only.
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
const subAdmin = await signIn({
  email: "e2e.suba.admin@traceesg.test",
  role: "org_admin",
  org: "SUB-A",
  name: "E2E Subsidiary Administrator",
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
  "the default schedule is 14 down to 0 days, email on 14, 7, 3 and the due day",
  ok(schedule) &&
    schedule.data.days.map((d) => `${d.before}${d.email ? "e" : ""}`).join(",") ===
      "14e,10,7e,5,3e,2,1,0e",
  JSON.stringify(schedule.data),
);
check(
  "after the due date the climb is 1, 3 and 7 days late",
  ok(schedule) &&
    [
      schedule.data.escalation?.unitAdminAfter,
      schedule.data.escalation?.parentAdminAfter,
      schedule.data.escalation?.superAdminAfter,
    ].join(",") === "1,3,7",
  JSON.stringify(schedule.data.escalation),
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
section("Five days before: in the app only, and no Super Admin summary");
// ============================================================================================================
await sql`update public.reporting_periods set submission_closes_on = ${plus(5)} where id = ${period.id}`;
const day6run = await admin.mutate("deadlines.runReminders");
const day6 = await sends(sql`s.days_before = 5`);
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
section("Not a schedule day");
// ============================================================================================================
await sql`update public.reporting_periods set submission_closes_on = ${plus(12)} where id = ${period.id}`;
const day10 = await admin.mutate("deadlines.runReminders");
check(
  "twelve days before, nothing is sent",
  ok(day10) && day10.data.messages === 0,
  JSON.stringify(day10.data),
);

// ============================================================================================================
section("The schedule is the Super Admin's to change");
// ============================================================================================================
const { since } = await one(sql`select now() as since`);
const saved = await admin.mutate("deadlines.setSchedule", {
  days: [
    { before: 12, email: false },
    { before: 0, email: true },
  ],
});
check("the Super Admin saves a schedule with a twelve-day reminder", ok(saved), saved.error);
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
  "now twelve days before is a reminder day",
  ok(day10b) && day10b.data.sent.inApp > 0 && day10b.data.sent.email === 0,
  JSON.stringify(day10b.data),
);
const outOfOrder = await admin.mutate("deadlines.setSchedule", {
  days: schedule.data.days,
  escalation: { unitAdminAfter: 5, parentAdminAfter: 3, superAdminAfter: 7 },
});
check("a climb that does not climb is refused", !ok(outOfOrder));
const restored = await admin.mutate("deadlines.setSchedule", {
  days: schedule.data.days,
  escalation: schedule.data.escalation,
});
check("the default schedule is put back", ok(restored), restored.error);

// ============================================================================================================
section("Overdue: owners daily, then the alert climbs one step at a time");
// ============================================================================================================
// The period stays open for late uploads (late_uploads_until is 40 days out); only its due date moves back.
const lateRun = async (daysLate) => {
  await sql`update public.reporting_periods set submission_closes_on = ${plus(-daysLate)} where id = ${period.id}`;
  const ran = await admin.mutate("deadlines.runReminders");
  return { ran, rows: await sends(sql`s.days_before = ${-daysLate}`) };
};
const climb = (rows, who) => rows.filter((r) => r.recipient_id === who && r.kind === "escalation");
const isSuper = (r) => superIds.includes(r.recipient_id);

const late1 = await lateRun(1);
check(
  "1 day late: the Project Manager is reminded in the app and by email",
  ok(late1.ran) &&
    late1.rows
      .filter((r) => r.recipient_id === pmId && r.kind === "owner")
      .map((r) => r.channel)
      .sort()
      .join() === "email,in_app",
  JSON.stringify(late1.ran.data),
);
check(
  "…the Project X Administrator is told, as an escalation, in the app and by email",
  climb(late1.rows, prjAdmin.id).length === 2,
  JSON.stringify(climb(late1.rows, prjAdmin.id)),
);
check(
  "…and neither the Project Manager (an owner) nor a Super Admin is part of the climb yet",
  !climb(late1.rows, pmId).length && !late1.rows.some((r) => isSuper(r) && r.kind === "escalation"),
);
const lateNote = await one(sql`
  select title, deep_link_path from public.notifications
  where user_id = ${prjAdmin.id} and type = 'deadline_escalated' and related_entity_id = ${period.id}`);
check(
  "the Administrator's notice says how many are overdue and how late, and links to Submission Monitoring",
  /overdue for E2E Reminders.*1 day late/.test(lateNote?.title ?? "") &&
    /^\/admin\/submissions/.test(lateNote?.deep_link_path ?? ""),
  JSON.stringify(lateNote),
);

const late2 = await lateRun(2);
check(
  "2 days late: the owner is reminded in the app only, and nobody is escalated to",
  ok(late2.ran) &&
    late2.rows.some(
      (r) => r.recipient_id === pmId && r.kind === "owner" && r.channel === "in_app",
    ) &&
    !late2.rows.some((r) => r.channel === "email") &&
    !late2.rows.some((r) => r.kind === "escalation"),
  JSON.stringify(late2.rows.map((r) => [r.kind, r.channel])),
);

const late3 = await lateRun(3);
check(
  "3 days late: the Subsidiary Administrator joins, the Project X Administrator is told again",
  climb(late3.rows, subAdmin.id).length === 2 && climb(late3.rows, prjAdmin.id).length === 2,
  JSON.stringify(late3.rows.filter((r) => r.kind === "escalation").map((r) => r.recipient_id)),
);
check(
  "…the Super Admins are still not told",
  !late3.rows.some((r) => isSuper(r) && r.kind === "escalation"),
);

const late7 = await lateRun(7);
check(
  "7 days late: each Super Admin is told, in the app and by email",
  superIds.every((id) => climb(late7.rows, id).length === 2),
  JSON.stringify(late7.rows.filter(isSuper).map((r) => [r.kind, r.channel])),
);
check(
  "…with the Administrators below still told",
  climb(late7.rows, subAdmin.id).length === 2 && climb(late7.rows, prjAdmin.id).length === 2,
);
const again = await admin.mutate("deadlines.runReminders");
check(
  "a second run the same day sends nothing new",
  ok(again) && again.data.sent.inApp === 0 && again.data.sent.email === 0,
  JSON.stringify(again.data),
);

// ============================================================================================================
section("The status board: who is behind, unit by unit, within each person's reach");
// ============================================================================================================
check(
  "a Project Manager cannot open the board",
  (await pm.query("deadlines.board", { periodId: period.id })).status === 403,
);
const prjBoard = await prjAdmin.session.query("deadlines.board", { periodId: period.id });
const superBoard = await admin.query("deadlines.board", { periodId: period.id });
check(
  "the Project X Administrator and the Super Admin both open it",
  ok(prjBoard) && ok(superBoard),
);
const inPrjX = new Set(
  (
    await sql`
      select t.descendant_id::text as id from public.org_unit_tree t
      join public.org_units o on o.id = t.ancestor_id and o.code = 'PRJ-X'`
  ).map((r) => r.id),
);
check(
  "the Administrator's board holds Project X and the units beneath it only, Project X first",
  prjBoard.data.rows.length > 0 &&
    prjBoard.data.rows.every((r) => inPrjX.has(r.id)) &&
    prjBoard.data.rows[0].depth === 0,
  JSON.stringify(prjBoard.data.rows.map((r) => [r.name, r.depth])),
);
const top = prjBoard.data.rows[0];
check(
  "nothing was uploaded: everything is not started and, the due date being past, overdue",
  top.approved === 0 &&
    top.inProgress === 0 &&
    top.missing === top.total &&
    top.overdue === top.total,
  JSON.stringify(top),
);
check(
  "the Super Admin's board reaches further (units outside Project X)",
  superBoard.data.rows.some((r) => !inPrjX.has(r.id)),
);
check(
  "the board names who is behind",
  top.behind.includes("E2E Project Manager"),
  JSON.stringify(top.behind),
);
check(
  "the period list says which periods are open",
  prjBoard.data.periods.some((p) => p.id === period.id && p.open === true),
);

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
