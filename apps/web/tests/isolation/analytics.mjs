// Phase 7 of feature_enhancement.md against the local database: year-wise trends, suggestions and emission
// threshold alerts.
//
// Part 1 builds four financial years of approved, calculated records under a group of its own inside one
// transaction, reads them with the real service code and runs the real daily alert check in that transaction
// (email replaced by a stand-in), then rolls everything back.
// Part 2 calls the real tRPC procedures as a Super Admin, an Administrator of PRJ-X and a Project Manager
// (scope, permissions, acknowledging); the two alert rows it adds are removed again. Audit entries stay.
// Local database only. Run: pnpm --filter web test:analytics
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
Object.assign(process.env, {
  DATABASE_URL: LOCAL,
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-not-a-key",
  SUPABASE_SERVICE_ROLE_KEY: "placeholder-not-a-key",
});
// AI wording must be off here: no request may reach a real provider.
delete process.env.NVIDIA_NIM_API_KEY;
delete process.env.CHAT_DATABASE_URL;

const WEB = fileURLToPath(new URL("../../", import.meta.url)).replaceAll("\\", "/");
const require = createRequire(WEB + "package.json");
const postgres = require("postgres");
const sql = postgres(LOCAL, { prepare: false, max: 2, onnotice() {} });

const { appRouter } = await import(pathToFileURL(WEB + "lib/trpc/root.ts").href);
const { createCallerFactory } = await import(pathToFileURL(WEB + "lib/trpc/init.ts").href);
const { analyticsOverview } = await import(pathToFileURL(WEB + "lib/analytics/service.ts").href);
const { runEmissionAlerts } = await import(pathToFileURL(WEB + "lib/analytics/run-alerts.ts").href);
const callerFor = (session) =>
  createCallerFactory(appRouter)({ session: { status: "active", session } });

let pass = 0;
let fail = 0;
const check = (name, condition, detail = "") => {
  if (condition) pass += 1;
  else fail += 1;
  console.log(
    `${condition ? "ok  " : "FAIL"} ${name}${!condition && detail ? ` — ${detail}` : ""}`,
  );
};
const section = (name) => console.log(`\n== ${name}`);
const refused = async (promise, code) => {
  try {
    await promise;
    return false;
  } catch (error) {
    return error?.name === "TRPCError" && (!code || error.code === code) ? error.message : false;
  }
};

const superAdmins = await sql`
  select distinct u.id, u.email, u.display_name from public.users u
  join public.user_org_assignments a on a.user_id = u.id and a.revoked_at is null
  join public.roles r on r.id = a.role_id and r.code = 'admin'
  where u.is_active and u.deleted_at is null order by u.email`;
if (superAdmins.length === 0) {
  console.error("This test needs a Super Admin on the local database.");
  process.exit(1);
}
const [today] = await sql`select public.reporting_period_today()::text as d`;
if (today.d < "2026-08-01" || today.d > "2027-01-27") {
  console.error(
    `The fixture is laid out for a date between Aug 2026 and Jan 2027; today is ${today.d}.`,
  );
  process.exit(1);
}

const RUN = Date.now().toString(36).toUpperCase();
const ROLLBACK = new Error("rollback");

// ---------------------------------------------------------------------------------------------------------
// Part 1: a group of the test's own, Apr 2023 to Jul 2026, in one transaction that is rolled back.
//   Grid electricity (Scope 2): 10 t a month, every July 20 t; July 2026 40 t (twice the usual July).
//   Business travel by air (Scope 3): 2 t every month (flat: no suggestion, no alert).
// ---------------------------------------------------------------------------------------------------------
section("Trends, suggestions and the daily check on a fixture (rolled back)");
const sent = [];
try {
  await sql.begin(async (tx) => {
    const [group] = await tx`
      insert into public.org_units (parent_id, unit_type, name, code)
      values (null, 'group', ${`Analytics group ${RUN}`}, ${`AN-G-${RUN}`}) returning id`;
    const [project] = await tx`
      insert into public.org_units (parent_id, unit_type, name, code)
      values (${group.id}, 'project', ${`Analytics project ${RUN}`}, ${`AN-P-${RUN}`}) returning id`;
    const metric = Object.fromEntries(
      (
        await tx`select code, id from public.esg_metrics
                where code in ('GRID_ELECTRICITY', 'BUSINESS_TRAVEL_AIR')`
      ).map((m) => [m.code, m.id]),
    );
    const by = superAdmins[0].id;
    const periods = {};
    for (let i = 0; i < 40; i++) {
      const y = 2023 + Math.floor((3 + i) / 12);
      const m = ((3 + i) % 12) + 1;
      const mm = String(m).padStart(2, "0");
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const [p] = await tx`
        insert into public.reporting_periods (label, start_date, end_date, status)
        values (${`AN ${y}-${mm} ${RUN}`}, ${`${y}-${mm}-01`}, ${`${y}-${mm}-${last}`}, 'closed')
        returning id`;
      periods[`${y}-${mm}`] = p.id;
    }
    const record = async (key, code, tonnes, approval = "approved", quality = "approved") => {
      const [r] = await tx`
        insert into public.esg_records (org_unit_id, reporting_period_id, metric_id, submitted_by,
                                        activity_value_verified, activity_unit, verification_status,
                                        approval_status, data_quality_state)
        values (${project.id}, ${periods[key]}, ${metric[code]}, ${by}, ${tonnes}, 'kWh', 'user_verified',
                ${approval}, ${quality}) returning id`;
      await tx`
        insert into public.calculations (esg_record_id, input_value, input_unit, normalized_value,
                                         normalized_unit, result_value, result_unit, engine_version)
        values (${r.id}, ${tonnes}, 'kWh', ${tonnes}, 'kWh', ${tonnes * 1000}, 'kgCO2e', 'fixture')`;
      return r.id;
    };
    for (const key of Object.keys(periods)) {
      await record(key, "GRID_ELECTRICITY", key === "2026-07" ? 40 : key.endsWith("-07") ? 20 : 10);
      await record(key, "BUSINESS_TRAVEL_AIR", 2);
    }

    // Trends.
    const o = await analyticsOverview(tx, group.id);
    const years = o.trends.years;
    check(
      "four financial years are shown",
      years.map((y) => y.label).join(",") === "FY 2023-24,FY 2024-25,FY 2025-26,FY 2026-27",
      years.map((y) => y.label).join(","),
    );
    const fy24 = years.find((y) => y.financialYear === 2024);
    const fy25 = years.find((y) => y.financialYear === 2025);
    const fy26 = years.find((y) => y.financialYear === 2026);
    check(
      "FY 2024-25 adds up: 130 grid + 24 travel",
      fy24?.total === 154 && fy24.byScope.SCOPE_2 === 130,
      JSON.stringify(fy24?.byScope),
    );
    check(
      "FY 2025-26 is complete and compared in full (no change)",
      fy25?.complete && fy25.change.kind === "full" && fy25.change.changePct === 0,
      JSON.stringify(fy25?.change),
    );
    check(
      "FY 2026-27 is partial and compared on Apr–Jul only (78 against 58)",
      !fy26?.complete &&
        fy26.change.kind === "same_months" &&
        fy26.change.current === 78 &&
        fy26.change.previous === 58,
      JSON.stringify(fy26?.change),
    );
    check(
      "the partial year says why",
      fy26?.notes.some((n) => /not over/.test(n)) &&
        fy26.notes.some((n) => /4 of 12 months/.test(n)),
      fy26?.notes.join(" | "),
    );
    check(
      "the project gives the same figures as its group",
      (await analyticsOverview(tx, project.id)).trends.years.at(-1).total === 78,
    );

    // Suggestions.
    const ids = o.recommendations.map((r) => r.id);
    const grid = o.recommendations.find((r) => r.id === "grid_electricity");
    check(
      "grid electricity: one suggestion, rising on the same months and a high July",
      grid?.triggers.join(",") === "rising,spike",
      grid?.triggers.join(","),
    );
    check(
      "July 2026 is called out as unusually high",
      !!grid && /unusually high AN 2026-07/.test(grid.title) && grid.priority === "high",
      grid?.title,
    );
    check(
      "both findings are stated with their figures",
      /up 40% from 50 tCO2e/.test(grid?.reason ?? "") &&
        /In AN 2026-07 .* they were 40 tCO2e, 4\.0 times/.test(grid?.reason ?? ""),
      grid?.reason,
    );
    check(
      "flat business travel gives no travel suggestion",
      !ids.some((i) => i.startsWith("business_travel")),
      ids.join(","),
    );
    check(
      "each suggestion carries its periods as evidence",
      o.recommendations.every((r) => r.evidence.periods.length > 0),
    );

    // An expected submission never filed makes the years incomplete.
    await tx
      .savepoint(async (sp) => {
        await sp`insert into public.submission_expectations (org_unit_id, metric_id, created_by)
               values (${project.id}, (select id from public.esg_metrics where code = 'DIESEL_CONSUMPTION'), ${by})`;
        const withGap = await analyticsOverview(sp, group.id);
        const y = withGap.trends.years.find((x) => x.financialYear === 2025);
        check(
          "a missing expected submission makes a year incomplete and is counted",
          !y.complete && y.notes.some((n) => /12 expected submission/.test(n)),
          y.notes.join(" | "),
        );
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });

    // The daily check. A record awaiting approval in July 2026 holds it back.
    const stub = async (message) => {
      sent.push(message);
      return sent.length === 1 ? { sent: false, reason: "stand-in failure" } : { sent: true };
    };
    const pendingId = await record("2026-07", "GRID_ELECTRICITY", 1, "review_pending", "validated");
    const held = await runEmissionAlerts({ userId: null }, { sql: tx, send: stub });
    check(
      "no alert while something in the period awaits approval",
      held.newAlerts === 0,
      JSON.stringify(held),
    );
    await tx`update public.esg_records set data_quality_state = 'rejected', approval_status = 'rejected' where id = ${pendingId}`;

    const first = await runEmissionAlerts({ userId: null }, { sql: tx, send: stub });
    check(
      "July 2026 Scope 2 alerts for the project and its group",
      first.newAlerts === 2,
      JSON.stringify(first),
    );
    const alerts = await tx`
      select a.org_unit_id, a.scope_code, a.measured_tco2e::float as m, a.baseline_tco2e::float as b,
             jsonb_array_length(a.baseline_periods) as n
      from public.emission_alerts a where a.org_unit_id in (${group.id}, ${project.id})`;
    check(
      "the alert keeps 40 measured against an expected 20 from three earlier Julys",
      alerts.length === 2 &&
        alerts.every((a) => a.scope_code === "SCOPE_2" && a.m === 40 && a.b === 20 && a.n === 3),
      JSON.stringify(alerts),
    );
    check("Scope 3 (flat) raises nothing", !alerts.some((a) => a.scope_code === "SCOPE_3"));
    check(
      "every Super Admin gets one in-app notification listing both",
      first.sent.inApp === superAdmins.length &&
        (
          await tx`select count(*)::int as n from public.notifications where type = 'emission_alert'
                  and message like ${`%Analytics project ${RUN}%`}`
        )[0].n === superAdmins.length,
      JSON.stringify(first.sent),
    );
    check(
      "one email per Super Admin; the failed one is recorded",
      sent.length === superAdmins.length && first.failed === 1,
      `${sent.length} sent, ${first.failed} failed`,
    );
    check(
      "the email lists the measured and expected figures",
      /40 tCO2e against an expected 20/.test(sent.at(-1)?.html ?? ""),
    );

    const second = await runEmissionAlerts({ userId: null }, { sql: tx, send: stub });
    check(
      "a second run finds nothing new and only retries the failed email",
      second.newAlerts === 0 &&
        second.sent.inApp === 0 &&
        second.sent.email === 1 &&
        second.failed === 0,
      JSON.stringify(second),
    );
    const third = await runEmissionAlerts({ userId: null }, { sql: tx, send: stub });
    check(
      "a third run sends nothing",
      third.sent.inApp === 0 && third.sent.email === 0,
      JSON.stringify(third),
    );

    await tx`update public.org_settings set value = jsonb_set(value, '{enabled}', 'false') where key = 'emission_alert_settings'`;
    const off = await runEmissionAlerts({ userId: null }, { sql: tx, send: stub });
    check(
      "switched off, the check finds nothing",
      off.found === 0 && off.checked === 0,
      JSON.stringify(off),
    );
    throw ROLLBACK;
  });
} catch (error) {
  if (error !== ROLLBACK) {
    check("part 1 ran", false, error?.stack ?? String(error));
  }
}
check(
  "the fixture left nothing behind",
  (await sql`select count(*)::int as n from public.org_units where code like ${`AN-%-${RUN}`}`)[0]
    .n === 0,
);

// ---------------------------------------------------------------------------------------------------------
// Part 2: the procedures, as three kinds of caller.
// ---------------------------------------------------------------------------------------------------------
section("Procedures: scope and permissions");
const permissions = (await sql`select code from public.permissions`).map((p) => p.code);
const base = {
  email: superAdmins[0].email,
  displayName: superAdmins[0].display_name,
  theme: "theme-2",
  assignments: [],
};
const superCaller = callerFor({
  ...base,
  userId: superAdmins[0].id,
  isAdmin: true,
  isOrgAdmin: false,
  adminOrgUnitIds: [],
  roleCodes: ["admin"],
  permissions,
});
const unit = async (code) =>
  (await sql`select id from public.org_units where code = ${code}`)[0].id;
const prjX = await unit("PRJ-X");
const subA = await unit("SUB-A");
const [adminUser] =
  await sql`select id from public.users where email like 'e2e.prjx.admin%' limit 1`;
const orgAdmin = callerFor({
  ...base,
  userId: adminUser?.id ?? superAdmins[0].id,
  isAdmin: false,
  isOrgAdmin: true,
  adminOrgUnitIds: [prjX],
  roleCodes: ["org_admin"],
  permissions: ["monitoring.view", "chat.use"],
});
const pm = callerFor({
  ...base,
  userId: superAdmins[0].id,
  isAdmin: false,
  isOrgAdmin: false,
  adminOrgUnitIds: [],
  roleCodes: ["project_manager"],
  permissions: ["monitoring.view", "chat.use"],
});

check("a Project Manager is refused", !!(await refused(pm.analytics.units(), "FORBIDDEN")));
const adminUnits = await orgAdmin.analytics.units();
const allUnits = await superCaller.analytics.units();
check(
  "an Administrator is offered PRJ-X and what is beneath it only",
  adminUnits.some((u) => u.id === prjX) &&
    !adminUnits.some((u) => u.id === subA) &&
    adminUnits.length < allUnits.length,
  `${adminUnits.length} of ${allUnits.length}`,
);
check(
  "an Administrator cannot read a unit above theirs",
  !!(await refused(orgAdmin.analytics.overview({ orgUnitId: subA }), "FORBIDDEN")),
);
const own = await orgAdmin.analytics.overview({ orgUnitId: prjX });
check(
  "an Administrator reads their own unit",
  own.orgUnitId === prjX && Array.isArray(own.trends.years),
);
check("AI wording is off here, and says so", own.aiAvailable === false);
check(
  "AI wording is refused without the service",
  !!(await refused(
    superCaller.analytics.wordRecommendation({
      orgUnitId: prjX,
      recommendationId: "grid_electricity",
    }),
    "FORBIDDEN",
  )),
);
check(
  "an Administrator cannot word a suggestion for a unit outside their scope",
  /scope/.test(
    (await refused(
      orgAdmin.analytics.wordRecommendation({ orgUnitId: subA, recommendationId: "fuels" }),
      "FORBIDDEN",
    )) || "",
  ),
);
check(
  "only a Super Admin changes the settings",
  !!(await refused(
    orgAdmin.analytics.updateAlertSettings({
      enabled: true,
      thresholdPct: { SCOPE_1: 5, SCOPE_2: 5, SCOPE_3: 5 },
      minBaselineYears: 1,
      minIncreaseTco2e: 0,
      lookbackDays: 30,
    }),
    "FORBIDDEN",
  )),
);
check(
  "only a Super Admin runs the check",
  !!(await refused(orgAdmin.analytics.runAlerts(), "FORBIDDEN")),
);

const before = await superCaller.analytics.alertSettings();
const changed = { ...before, thresholdPct: { ...before.thresholdPct, SCOPE_2: 35 } };
await superCaller.analytics.updateAlertSettings(changed);
check(
  "a Super Admin changes a threshold",
  (await superCaller.analytics.alertSettings()).thresholdPct.SCOPE_2 === 35,
);
const [settingAudit] = await sql`
  select count(*)::int as n from public.audit_logs
  where event_type = 'settings.emission_alerts_changed' and created_at > now() - interval '1 minute'`;
check("the change is audited", settingAudit.n >= 1);
check(
  "out-of-range settings are refused",
  !!(await refused(
    superCaller.analytics.updateAlertSettings({ ...before, lookbackDays: 5000 }),
    "BAD_REQUEST",
  )),
);
await superCaller.analytics.updateAlertSettings(before);

section("Procedures: alerts and acknowledging");
const [period] =
  await sql`select id from public.reporting_periods where status = 'closed' order by start_date limit 1`;
const inserted = await sql`
  insert into public.emission_alerts
    (org_unit_id, reporting_period_id, scope_code, measured_tco2e, baseline_tco2e, threshold_pct, baseline_periods)
  values (${prjX}, ${period.id}, 'SCOPE_1', 2, 1, 20, '[]'), (${subA}, ${period.id}, 'SCOPE_1', 2, 1, 20, '[]')
  on conflict do nothing
  returning id, org_unit_id`;
const alertX = inserted.find((a) => a.org_unit_id === prjX)?.id;
const alertA = inserted.find((a) => a.org_unit_id === subA)?.id;
try {
  check("two test alerts were added", !!alertX && !!alertA);
  const seen = await orgAdmin.analytics.alerts();
  check(
    "an Administrator sees the alert for PRJ-X and not SUB-A's",
    seen.some((a) => a.id === alertX) && !seen.some((a) => a.id === alertA),
  );
  const all = await superCaller.analytics.alerts();
  check(
    "a Super Admin sees both",
    all.some((a) => a.id === alertX) && all.some((a) => a.id === alertA),
  );
  check(
    "filtered to PRJ-X, SUB-A's alert is left out",
    !(await superCaller.analytics.alerts({ orgUnitId: prjX })).some((a) => a.id === alertA),
  );
  check(
    "an Administrator cannot acknowledge SUB-A's alert",
    !!(await refused(
      orgAdmin.analytics.acknowledge({ id: alertA, note: "Not mine" }),
      "FORBIDDEN",
    )),
  );
  check(
    "a note is required",
    !!(await refused(orgAdmin.analytics.acknowledge({ id: alertX, note: " " }), "BAD_REQUEST")),
  );
  await orgAdmin.analytics.acknowledge({
    id: alertX,
    note: "Checked: a generator ran during an outage.",
  });
  const after = (await orgAdmin.analytics.alerts()).find((a) => a.id === alertX);
  check(
    "the Administrator acknowledges their unit's alert, with the note",
    after?.status === "acknowledged" && /generator/.test(after.acknowledgedNote ?? ""),
  );
  check(
    "it cannot be acknowledged twice",
    !!(await refused(superCaller.analytics.acknowledge({ id: alertX, note: "Again" }), "CONFLICT")),
  );
  const [ackAudit] =
    await sql`select count(*)::int as n from public.audit_logs where entity_id = ${alertX} and event_type = 'emission_alert.acknowledged'`;
  check("the acknowledgement is audited", ackAudit.n === 1);
} finally {
  await sql`delete from public.emission_alerts where id = any(${[alertX, alertA].filter(Boolean)}::uuid[])`;
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
