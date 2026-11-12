// Phase 8 of feature_enhancement.md through the real tRPC procedures on the local database: the top-bar search
// (search.global) and report templates (reports.generate's template). What each kind of person may find:
// a Super Admin everything; an Administrator of PRJ-X only PRJ-X and below; a Project Manager only the records
// they submitted. Uses records the end-to-end suite leaves: Project X's and the "E2E Far Project" outside it.
// Local database only. Run: pnpm --filter web test:search
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
const { appRouter } = await import(pathToFileURL(WEB + "lib/trpc/root.ts").href);
const { createCallerFactory } = await import(pathToFileURL(WEB + "lib/trpc/init.ts").href);
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
const one = async (query) => (await query)[0];

const user = async (email) =>
  one(sql`select id, email, display_name from public.users where email = ${email}`);
const unit = async (code) =>
  (await one(sql`select id from public.org_units where code = ${code}`))?.id;
const [superRow] = await sql`
  select u.id, u.email, u.display_name from public.users u
  join public.user_org_assignments a on a.user_id = u.id and a.revoked_at is null
  join public.roles r on r.id = a.role_id and r.code = 'admin'
  where u.is_active and u.deleted_at is null order by u.email limit 1`;
const pmRow = await user("e2e.pm@traceesg.test");
const farPmRow = await user("e2e.farpm@traceesg.test");
const prjX = await unit("PRJ-X");
const farProject = await unit("E2E-FAR-P");
if (!superRow || !pmRow || !farPmRow || !prjX || !farProject) {
  console.error(
    "This test needs the end-to-end suite's accounts and records on the local database (run it once).",
  );
  process.exit(1);
}
const permissions = (await sql`select code from public.permissions`).map((p) => p.code);
const session = (row, extra) => ({
  userId: row.id,
  email: row.email,
  displayName: row.display_name,
  theme: "theme-2",
  assignments: [],
  roleCodes: [],
  isAdmin: false,
  isOrgAdmin: false,
  adminOrgUnitIds: [],
  permissions: ["monitoring.view"],
  ...extra,
});
const superAdmin = callerFor(
  session(superRow, { isAdmin: true, roleCodes: ["admin"], permissions }),
);
const orgAdmin = callerFor(
  session(superRow, {
    isOrgAdmin: true,
    roleCodes: ["org_admin"],
    adminOrgUnitIds: [prjX],
    permissions: ["monitoring.view", "report.generate", "user.manage"],
  }),
);
const pm = callerFor(
  session(pmRow, { roleCodes: ["project_manager"], permissions: ["report.generate"] }),
);
const farPm = callerFor(session(farPmRow, { roleCodes: ["project_manager"] }));
const search = (caller, q, pathname = "/admin") => caller.search.global({ q, pathname });
const keys = (r) => r.sections.map((s) => s.key);
const hitsOf = (r, key) => r.sections.find((s) => s.key === key)?.hits ?? [];

section("Short and odd queries");
const empty = await search(pm, "a");
check(
  "one character searches nothing, and says what would be searched",
  empty.sections.length === 0 && empty.searched.includes("records you submitted"),
);
const wild = await search(superAdmin, "%%");
check(
  "% is matched literally, not as everything",
  hitsOf(wild, "records").length === 0 && hitsOf(wild, "people").length === 0,
);
check(
  "an over-long query is refused",
  !!(await refused(search(pm, "x".repeat(400)), "BAD_REQUEST")),
);

section("What a Project Manager finds");
const pmFar = await search(pm, "auth-far", "/app/submissions");
check(
  "not another person's records",
  hitsOf(pmFar, "records").length === 0,
  JSON.stringify(hitsOf(pmFar, "records")),
);
check(
  "no people, org unit or report sections",
  !keys(pmFar).some((k) => ["people", "units", "reports"].includes(k)),
);
check(
  "…and the audit link is their own activity",
  hitsOf(pmFar, "audit")[0]?.href === "/app/activity?q=auth-far",
);
const farOwn = await search(farPm, "auth-far", "/app/submissions");
const farHits = hitsOf(farOwn, "records");
check(
  "the person who submitted them finds their own, linked to the verify screen",
  farHits.length > 0 && farHits.every((h) => h.href.startsWith("/app/verify/")),
  JSON.stringify(farHits[0]),
);
check("their records come first on My Submissions", farOwn.sections[0]?.key === "records");
const pages = await search(pm, "upload", "/app");
check(
  "pages come from their own navigation",
  hitsOf(pages, "pages").some((h) => h.href === "/app/upload"),
);
const adminPage = await search(pm, "audit trail");
check("…never an admin page", !hitsOf(adminPage, "pages").some((h) => h.href.startsWith("/admin")));

section("What an Administrator of PRJ-X finds");
const xFar = await search(orgAdmin, "auth-far");
check("no records outside their units", hitsOf(xFar, "records").length === 0);
const xFarUnit = await search(orgAdmin, "E2E Far");
check(
  "no org unit outside their units",
  !hitsOf(xFarUnit, "units").some((h) => /Far/.test(h.title)),
);
const xOwn = await search(orgAdmin, "Project X");
check(
  "their own unit, linked to Organization",
  hitsOf(xOwn, "units").some((h) => h.href === `/admin/organization?node=${prjX}`),
);
check(
  "records in their units, linked to the record's history",
  hitsOf(xOwn, "records").length > 0 &&
    hitsOf(xOwn, "records").every((h) => h.href.startsWith("/admin/audit-trail?record=")),
);
const xPeople = await search(orgAdmin, "farpm");
check("no people who hold roles only outside their units", hitsOf(xPeople, "people").length === 0);
check(
  "people first on the Users page",
  (await search(orgAdmin, "e2e", "/admin/users")).sections[0]?.key === "people",
);

section("What a Super Admin finds");
const sFar = await search(superAdmin, "auth-far");
check("records anywhere", hitsOf(sFar, "records").length > 0);
const sUnit = await search(superAdmin, "E2E Far Project");
check(
  "org units anywhere",
  hitsOf(sUnit, "units").some((h) => h.href === `/admin/organization?node=${farProject}`),
);
const sPeople = await search(superAdmin, "farpm");
check(
  "people anywhere, linked to Users with the address",
  hitsOf(sPeople, "people")[0]?.href === "/admin/users?q=e2e.farpm%40traceesg.test",
);
check(
  "every word must match",
  hitsOf(await search(superAdmin, "auth-far zzzznothing"), "records").length === 0,
);

section("Report templates through reports.generate");
const [fyRow] =
  await sql`select extract(year from start_date)::int as y from public.reporting_periods order by start_date limit 1`;
check(
  "an unknown template is refused",
  !!(await refused(
    superAdmin.reports.generate({ orgUnitId: prjX, financialYear: fyRow.y, template: "glossy" }),
    "BAD_REQUEST",
  )),
);
const sReports = await search(superAdmin, "GHG inventory");
check(
  "reports are found by their template's name",
  hitsOf(sReports, "reports").every((h) => /GHG inventory/.test(h.title)),
);
check(
  "a Project Manager has no report section even with report.generate",
  !keys(await search(pm, "report")).includes("reports"),
);

await sql.end();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
