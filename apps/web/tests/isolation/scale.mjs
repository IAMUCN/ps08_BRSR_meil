// Release check (feature_enhancement.md 10.2, "larger data volumes"): times the heavy reads on a large
// organization built inside one transaction that is rolled back -- a group with 10 subsidiaries and 300
// projects, 36 monthly periods, 2 activities per project per month (21,600 approved, calculated records).
// Times Carbon Analytics at the group, a full-year report snapshot (what every template prints), the top-bar
// search and the daily alert check. Local database only. Run: pnpm --filter web test:scale
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
Object.assign(process.env, {
  DATABASE_URL: LOCAL,
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-not-a-key",
  SUPABASE_SERVICE_ROLE_KEY: "placeholder-not-a-key",
});
const WEB = fileURLToPath(new URL("../../", import.meta.url)).replaceAll("\\", "/");
const require = createRequire(WEB + "package.json");
const postgres = require("postgres");
const sql = postgres(LOCAL, { prepare: false, max: 2, onnotice() {} });
const { analyticsOverview } = await import(pathToFileURL(WEB + "lib/analytics/service.ts").href);
const { buildSnapshot } = await import(pathToFileURL(WEB + "lib/reports/snapshot.ts").href);
const { globalSearch } = await import(pathToFileURL(WEB + "lib/search/global.ts").href);
const { runEmissionAlerts } = await import(pathToFileURL(WEB + "lib/analytics/run-alerts.ts").href);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const time = async (fn) => {
  const t = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - t) };
};
// Limits for an interactive page on this laptop; the report runs after the request, so it gets longer.
const PAGE_MS = 5_000;
const REPORT_MS = 60_000;

const [superAdmin] = await sql`
  select u.id from public.users u join public.user_org_assignments a on a.user_id = u.id and a.revoked_at is null
  join public.roles r on r.id = a.role_id and r.code = 'admin' order by u.created_at limit 1`;
const RUN = Date.now().toString(36);
const ROLLBACK = new Error("rollback");
try {
  await sql.begin(async (tx) => {
    const t0 = performance.now();
    const [group] =
      await tx`insert into public.org_units (parent_id, unit_type, name, code) values (null, 'group', ${`Scale group ${RUN}`}, ${`SC-G-${RUN}`}) returning id`;
    await tx`
      insert into public.org_units (parent_id, unit_type, name, code)
      select ${group.id}, 'subsidiary', 'Scale subsidiary ' || s, 'SC-S' || s || '-' || ${RUN} from generate_series(1, 10) s`;
    await tx`
      insert into public.org_units (parent_id, unit_type, name, code)
      select o.id, 'project', 'Scale project ' || o.code || '-' || p, o.code || '-P' || p
      from public.org_units o cross join generate_series(1, 30) p where o.code like ${`SC-S%-${RUN}`}`;
    await tx`
      insert into public.reporting_periods (label, start_date, end_date, status)
      select 'Scale ' || to_char(d, 'YYYY-MM') || ' ' || ${RUN}, d::date, (d + interval '1 month - 1 day')::date, 'closed'
      from generate_series('2023-04-01'::date, '2026-03-01'::date, interval '1 month') d`;
    const records = await tx`
      with units as (select id from public.org_units where code like ${`SC-S%-${RUN}-P%`}),
           periods as (select id, start_date from public.reporting_periods where label like ${`Scale % ${RUN}`}),
           metrics as (select id, code from public.esg_metrics where code in ('DIESEL_CONSUMPTION', 'GRID_ELECTRICITY'))
      insert into public.esg_records (org_unit_id, reporting_period_id, metric_id, submitted_by, activity_value_verified,
                                      activity_unit, verification_status, approval_status, data_quality_state, bill_number)
      select u.id, p.id, m.id, ${superAdmin.id}, 100 + (random() * 50)::int, 'unit', 'user_verified', 'approved', 'approved',
             'SC-' || left(u.id::text, 8) || '-' || to_char(p.start_date, 'YYMM') || '-' || m.code
      from units u cross join periods p cross join metrics m
      returning id, activity_value_verified`;
    await tx`
      insert into public.calculations (esg_record_id, input_value, input_unit, normalized_value, normalized_unit,
                                       result_value, result_unit, engine_version)
      select id, activity_value_verified, 'unit', activity_value_verified, 'unit', activity_value_verified * 2.7, 'kgCO2e', 'scale'
      from public.esg_records where bill_number like 'SC-%' and submitted_by = ${superAdmin.id}
        and org_unit_id in (select id from public.org_units where code like ${`SC-S%-${RUN}-P%`})`;
    check(
      `built 311 org units and ${records.length.toLocaleString("en-IN")} records`,
      records.length === 21_600,
      `${Math.round(performance.now() - t0)} ms`,
    );

    const a = await time(() => analyticsOverview(tx, group.id));
    check(
      "Carbon Analytics at the group",
      a.ms < PAGE_MS && a.value.trends.years.length === 3,
      `${a.ms} ms, ${a.value.trends.years.length} years`,
    );

    const periods = (
      await tx`select id from public.reporting_periods where label like ${`Scale 2025-% ${RUN}`} or label like ${`Scale 2026-0% ${RUN}`}`
    ).map((p) => p.id);
    const prev = (
      await tx`select id from public.reporting_periods where label like ${`Scale 2024-% ${RUN}`} or label like ${`Scale 2025-0_ ${RUN}`}`
    ).map((p) => p.id);
    const s = await time(() =>
      buildSnapshot(tx, {
        orgUnitId: group.id,
        periodIds: periods,
        label: "FY 2025-26",
        financialYear: 2025,
        disclosureYear: 2025,
        previous: { periodIds: prev, label: "FY 2024-25" },
      }),
    );
    const records2025 = s.value.sections
      .flatMap((x) => x.indicators)
      .flatMap((i) => i.metrics)
      .reduce((n, m) => n + m.records.length, 0);
    check(
      "a full-year report snapshot at the group (every template prints it)",
      s.ms < REPORT_MS,
      `${s.ms} ms, ${records2025.toLocaleString("en-IN")} record links`,
    );

    const caller = {
      userId: superAdmin.id,
      isAdmin: true,
      isOrgAdmin: false,
      adminOrgUnitIds: [],
      permissions: ["report.generate"],
    };
    const q = await time(() =>
      globalSearch(tx, caller, { q: "Scale project", pathname: "/admin" }),
    );
    check(
      "the top-bar search over all of it",
      q.ms < PAGE_MS && q.value.sections.length > 0,
      `${q.ms} ms`,
    );
    const qWide = await time(() =>
      globalSearch(tx, caller, { q: "SC", pathname: "/admin/submissions" }),
    );
    check("a two-letter search (the widest)", qWide.ms < PAGE_MS, `${qWide.ms} ms`);

    const alerts = await time(() =>
      runEmissionAlerts({ userId: null }, { sql: tx, send: async () => ({ sent: true }) }),
    );
    check(
      "the daily alert check",
      alerts.ms < REPORT_MS,
      `${alerts.ms} ms, ${alerts.value.checked} figures checked`,
    );
    throw ROLLBACK;
  });
} catch (error) {
  if (error !== ROLLBACK) check("the scale run", false, error?.stack ?? String(error));
}
check(
  "nothing was left behind",
  (await sql`select count(*)::int as n from public.org_units where code like ${`SC-%${RUN}%`}`)[0]
    .n === 0,
);
await sql.end();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
