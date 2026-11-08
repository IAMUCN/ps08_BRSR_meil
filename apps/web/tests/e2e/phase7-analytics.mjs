// Phase 7 of feature_enhancement.md through the running app (HTTP): Carbon Analytics for each kind of
// account, and the emission threshold check run by the real daily trigger (/api/cron/reminders) on a
// four-year fixture (analytics-fixture.mjs) — the alerts it raises, the in-app notifications and the emails
// in the local mail catcher, nothing sent twice, acknowledging. The fixture is removed at the end.
// Local stack only; needs CRON_SECRET in the env file and the mail catcher.
import { setTimeout as sleep } from "node:timers/promises";
import { createFixture, FIXTURE_TODAY, removeFixture } from "./analytics-fixture.mjs";
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
  orgId,
  section,
  setup,
  sql,
} from "./lib.mjs";

const MAIL = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:55324";
const { sessions } = await setup();
const { admin, pm } = sessions;
const prjAdmin = new Session();
await prjAdmin.login(
  await ensureInvited(admin, {
    email: "e2e.prjx.admin@traceesg.test",
    role: "org_admin",
    org: "PRJ-X",
    name: "E2E Project X Administrator",
  }),
  { takeover: true },
);
const PRJ_X = await orgId("PRJ-X");
const SUB_A = await orgId("SUB-A");

section("Who may open Carbon Analytics");
const pmPage = await pm.get("/admin/carbon-analytics");
check(
  "a Project Manager is sent away from the page",
  [302, 303, 307].includes(pmPage.status) || /NEXT_REDIRECT/.test(pmPage.html),
  `status ${pmPage.status}`,
);
check("…and refused by the procedure", (await pm.query("analytics.units")).status === 403);
const adminPage = await prjAdmin.get(`/admin/carbon-analytics?org=${PRJ_X}`);
check(
  "an Administrator opens it for their unit, without the Super Admin settings",
  adminPage.status === 200 &&
    /Carbon Analytics/.test(adminPage.html) &&
    !/Alert settings \(Super Admin\)/.test(adminPage.html),
);
check(
  "an Administrator cannot read a unit above theirs",
  (await prjAdmin.query("analytics.overview", { orgUnitId: SUB_A })).status === 403,
);
const superPage = await admin.get("/admin/carbon-analytics");
check(
  "a Super Admin opens it with the settings and Check now",
  superPage.status === 200 &&
    /Alert settings \(Super Admin\)/.test(superPage.html) &&
    /Check now/.test(superPage.html),
);
check(
  "an Administrator cannot run the check",
  (await prjAdmin.mutate("analytics.runAlerts")).status === 403,
);

const [{ today }] = await sql`select public.reporting_period_today()::text as today`;
if (!env.CRON_SECRET || today < FIXTURE_TODAY.from || today > FIXTURE_TODAY.to) {
  check(
    "the fixture part can run (CRON_SECRET set, date inside the fixture's window)",
    false,
    `CRON_SECRET ${env.CRON_SECRET ? "set" : "missing"}, today ${today}`,
  );
  await finish();
}

section("Trends and suggestions on a four-year fixture");
const adminId = (
  await one(sql`select id from public.users where email = 'e2e.admin@traceesg.test'`)
).id;
let fixture;
try {
  fixture = await createFixture(sql, RUN, adminId);
  const o = await admin.query("analytics.overview", { orgUnitId: fixture.group.id });
  check("the overview reads", ok(o), o.error);
  const years = o.data?.trends.years ?? [];
  check("four financial years", years.length === 4, years.map((y) => y.label).join(","));
  const fy26 = years.at(-1);
  check(
    "the current year is partial and compared on the same months",
    fy26 && !fy26.complete && fy26.change.kind === "same_months",
    JSON.stringify(fy26?.change),
  );
  const ids = (o.data?.recommendations ?? []).map((r) => r.id);
  check(
    "electricity and diesel suggestions, none for flat travel",
    ids.includes("grid_electricity") &&
      ids.includes("fuels") &&
      !ids.some((i) => i.startsWith("business_travel")),
    ids.join(","),
  );

  section("The daily trigger raises and delivers alerts");
  const started = Date.now();
  const cron = await fetch(`${APP}/api/cron/reminders`, {
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  });
  const body = await cron.json().catch(() => ({}));
  check(
    "the daily trigger answers with an alert summary",
    cron.status === 200 && !!body.alerts,
    JSON.stringify(body).slice(0, 300),
  );
  const raised = await sql`
    select a.org_unit_id, a.scope_code, p.label, a.measured_tco2e::float as m, a.baseline_tco2e::float as b
    from public.emission_alerts a join public.reporting_periods p on p.id = a.reporting_period_id
    where a.org_unit_id = any(${fixture.units}::uuid[]) order by p.start_date, a.scope_code`;
  const july2 = raised.filter((a) => a.scope_code === "SCOPE_2");
  check(
    "Scope 2 for July 2026 on the project and its group: 40 against 20",
    july2.length === 2 && july2.every((a) => /2026-07/.test(a.label) && a.m === 40 && a.b === 20),
    JSON.stringify(july2),
  );
  check(
    "Scope 1 for the 2026 months inside 180 days: 8 against 5",
    raised.filter((a) => a.scope_code === "SCOPE_1").every((a) => a.m === 8 && a.b === 5) &&
      raised.filter((a) => a.scope_code === "SCOPE_1").length >= 2,
    JSON.stringify(raised.filter((a) => a.scope_code === "SCOPE_1").map((a) => a.label)),
  );
  check("nothing for flat Scope 3", !raised.some((a) => a.scope_code === "SCOPE_3"));
  const note = await one(sql`
    select title, message, deep_link_path from public.notifications
    where user_id = ${adminId} and type = 'emission_alert' order by created_at desc limit 1`);
  check(
    "the Super Admin has an in-app notification linking to the alerts",
    !!note &&
      /emission alert/i.test(note.title) &&
      note.deep_link_path === "/admin/carbon-analytics#alerts",
    JSON.stringify(note),
  );
  let mail = null;
  for (let i = 0; i < 40 && !mail; i++) {
    const list = await fetch(
      `${MAIL}/api/v1/search?query=${encodeURIComponent('to:"e2e.admin@traceesg.test" subject:"emission alert"')}`,
    )
      .then((r) => r.json())
      .catch(() => ({}));
    const newest = (list.messages ?? []).find(
      (m) => new Date(m.Created).getTime() >= started - 1000,
    );
    if (newest) mail = await fetch(`${MAIL}/api/v1/message/${newest.ID}`).then((r) => r.json());
    else await sleep(250);
  }
  check(
    "…and an email naming the unit and the figures",
    !!mail &&
      mail.HTML.includes(fixture.project.name) &&
      /40 tCO2e against an expected 20/.test(mail.HTML),
    mail ? mail.Subject : "no email",
  );
  const sends = await one(sql`
    select count(*)::int as n from public.emission_alert_sends s
    join public.emission_alerts a on a.id = s.alert_id
    where a.org_unit_id = any(${fixture.units}::uuid[]) and s.recipient_id = ${adminId}`);
  check(
    "each alert is recorded as sent to them, in the app and by email",
    sends.n === raised.length * 2,
    `${sends.n} for ${raised.length}`,
  );

  const again = await fetch(`${APP}/api/cron/reminders`, {
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  }).then((r) => r.json());
  const notesAfter = await one(sql`
    select count(*)::int as n from public.notifications
    where user_id = ${adminId} and type = 'emission_alert' and message like ${`%${RUN}%`}`);
  check(
    "a second daily run raises and sends nothing again",
    again.alerts?.newAlerts === 0 && notesAfter.n === 1,
    JSON.stringify(again.alerts),
  );

  section("Acknowledging");
  const list = await admin.query("analytics.alerts", { orgUnitId: fixture.group.id });
  const first = list.data?.find((a) => a.scopeCode === "SCOPE_2");
  check(
    "the alert list shows the figures and the earlier periods",
    !!first && first.baselinePeriods.length === 3,
  );
  check(
    "the Administrator of PRJ-X does not see the fixture's alerts",
    !(await prjAdmin.query("analytics.alerts")).data?.some((a) =>
      fixture.units.includes(a.orgUnitId),
    ),
  );
  const ack = await admin.mutate("analytics.acknowledge", {
    id: first.id,
    note: "E2E: July load from a new plant line.",
  });
  check("a Super Admin acknowledges it", ok(ack), ack.error);
  const twice = await admin.mutate("analytics.acknowledge", { id: first.id, note: "again" });
  check("…once", twice.status === 409, `status ${twice.status}`);
} finally {
  await removeFixture(sql, fixture);
  check(
    "the fixture is removed",
    (
      await one(
        sql`select count(*)::int as n from public.org_units where code like ${`AN-%-${RUN}`}`,
      )
    ).n === 0,
  );
}

await finish();
