// Phase 6 of feature_enhancement.md through the app's real tRPC procedures: conversion-factor drafts and their
// approval by another Super Admin, the checks on a version, the yearly review list, fetching a source (with the
// network replaced by stubs: official list, redirects, private addresses), and the carbon-credit links.
//
// Two Super Admins are needed, as on hosted once the second is invited: the local database's two are used.
// The test works on an activity of its own (removed afterwards), so no factor the suites rely on changes.
// Local database only. Run: pnpm --filter web test:factors
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
const { fetchSource, guardedLookup } = await import(
  pathToFileURL(WEB + "lib/factors/source.ts").href
);
const { checkAddress } = await import(pathToFileURL(WEB + "lib/trpc/routers/carbon-links.ts").href);
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
if (superAdmins.length !== 2) {
  console.error(
    `This test needs two Super Admins on the local database; found ${superAdmins.length}.`,
  );
  process.exit(1);
}
const permissions = (await sql`select code from public.permissions`).map((p) => p.code);
const superSession = (u) => ({
  userId: u.id,
  email: u.email,
  displayName: u.display_name,
  theme: "theme-2",
  isAdmin: true,
  isOrgAdmin: false,
  adminOrgUnitIds: [],
  roleCodes: ["admin"],
  permissions,
  assignments: [],
});
const [maker, checker] = superAdmins.map((u) => callerFor(superSession(u)));
const [makerRow, checkerRow] = superAdmins;
const prjX = (await sql`select id from public.org_units where code = 'PRJ-X'`)[0];
const orgAdmin = callerFor({
  ...superSession(makerRow),
  userId: makerRow.id,
  isAdmin: false,
  isOrgAdmin: true,
  adminOrgUnitIds: [prjX.id],
  roleCodes: ["org_admin"],
  permissions: ["carbon_credit.view", "monitoring.view"],
});

// An activity of the test's own, so no factor the suites use changes.
const RUN = Date.now().toString(36).toUpperCase();
const CODE = `ISO_FACTOR_${RUN}`;
const [diesel] =
  await sql`select category_id, scope_id from public.esg_metrics where code = 'DIESEL_CONSUMPTION'`;
await sql`
  insert into public.esg_metrics (category_id, code, name, unit, scope_id, requires_conversion_factor,
                                  requires_calculation, description)
  values (${diesel.category_id}, ${CODE}, ${`Isolation test fuel ${RUN}`}, 'L', ${diesel.scope_id}, true, true,
          'tests/isolation/factors.mjs — removed at the end')`;

const base = {
  value: 2.5,
  inputUnit: "L",
  outputUnit: "kgCO2e",
  sourceReference: "Synthetic isolation test value",
  sourceUrl: "https://cea.nic.in/some/report.pdf",
  sourcePublisher: "Central Electricity Authority",
  financialYear: "2026-27",
  effectiveFrom: "2026-04-01",
  effectiveTo: "2027-03-31",
};

try {
  section("A new factor is a draft, and the person who entered it cannot approve it");
  const created = await maker.factors.create({
    activityType: CODE,
    name: `Isolation ${RUN}`,
    ...base,
    effectiveTo: null,
  });
  const [v1] = await sql`
    select status::text, source_url, financial_year, source_publisher, value_origin, approved_by
    from public.conversion_factor_versions where id = ${created.versionId}`;
  check(
    "it is stored as a draft with its link, publisher and financial year",
    v1.status === "draft" &&
      v1.source_url === base.sourceUrl &&
      v1.financial_year === "2026-27" &&
      v1.source_publisher === base.sourcePublisher &&
      v1.value_origin === "manual" &&
      v1.approved_by === null,
    JSON.stringify(v1),
  );
  const notified = await sql`
    select 1 from public.notifications
    where user_id = ${checkerRow.id} and type = 'factor_review' and created_at > now() - interval '1 minute'`;
  check("the other Super Admin is told a draft is waiting", notified.length >= 1);
  check(
    "an Administrator cannot approve",
    !!(await refused(orgAdmin.factors.approve({ versionId: created.versionId }), "FORBIDDEN")),
  );
  check(
    "the Super Admin who entered it cannot approve it while another exists",
    /another Super Admin must approve/.test(
      (await refused(maker.factors.approve({ versionId: created.versionId }), "FORBIDDEN")) || "",
    ),
  );
  check(
    "a draft cannot be switched on through Retire / Put back",
    !!(await refused(
      maker.factors.setStatus({ versionId: created.versionId, status: "active" }),
      "CONFLICT",
    )),
  );

  section("Another Super Admin approves it");
  const approved = await checker.factors.approve({ versionId: created.versionId, note: "Checked" });
  const [v1b] = await sql`
    select status::text, approved_by, self_approved, review_note
    from public.conversion_factor_versions where id = ${created.versionId}`;
  check(
    "it is active, approved by the other Super Admin, not self-approved",
    approved.selfApproved === false &&
      v1b.status === "active" &&
      v1b.approved_by === checkerRow.id &&
      !v1b.self_approved &&
      v1b.review_note === "Checked",
    JSON.stringify(v1b),
  );
  const audit = await sql`
    select 1 from public.audit_logs
    where event_type = 'factor.version_approved' and entity_id = ${created.versionId}`;
  check("the approval is audited", audit.length === 1);
  check(
    "a version already approved cannot be approved again",
    !!(await refused(checker.factors.approve({ versionId: created.versionId }), "CONFLICT")),
  );

  section("A correction for the next year waits, then supersedes the old one when approved");
  const next = await maker.factors.addVersion({
    factorId: created.factorId,
    ...base,
    value: 2.6,
    financialYear: "2027-28",
    effectiveFrom: "2027-04-01",
    effectiveTo: null,
  });
  const before = await sql`
    select status::text from public.conversion_factor_versions where id = ${created.versionId}`;
  check("until it is approved, the old version stays active", before[0].status === "active");
  const reviewBefore = await maker.factors.review({ financialYear: "2027-28" });
  const item = reviewBefore.items.find((i) => i.activityType === CODE);
  check(
    "the yearly review shows FY 2027-28 as still carried over, with a draft waiting",
    item?.state === "carried_over" && item?.drafts === 1,
    JSON.stringify(item),
  );
  await checker.factors.approve({ versionId: next.versionId });
  const versions = await sql`
    select version_number, status::text, effective_to::text
    from public.conversion_factor_versions where conversion_factor_id = ${created.factorId}
    order by version_number`;
  check(
    "approving it supersedes the old version (its end date stays 31 March 2027)",
    versions[0].status === "superseded" &&
      versions[0].effective_to === "2027-03-31" &&
      versions[1].status === "active",
    JSON.stringify(versions),
  );
  const reviewAfter = await maker.factors.review({ financialYear: "2027-28" });
  check(
    "now FY 2027-28 is entered for that year",
    reviewAfter.items.find((i) => i.activityType === CODE)?.state === "for_this_year",
  );
  check(
    "FY 2025-26 shows no value for the activity",
    (await maker.factors.review({ financialYear: "2025-26" })).items.find(
      (i) => i.activityType === CODE,
    )?.state === "missing",
  );

  section("Turning a draft down");
  const third = await maker.factors.addVersion({
    factorId: created.factorId,
    ...base,
    value: 9,
    financialYear: "2028-29",
    effectiveFrom: "2028-04-01",
    effectiveTo: null,
  });
  check(
    "a reason of fewer than 10 characters is refused",
    !!(await refused(checker.factors.reject({ versionId: third.versionId, reason: "no" }))),
  );
  await checker.factors.reject({
    versionId: third.versionId,
    reason: "Value does not match the source table",
  });
  const [v3] = await sql`
    select status::text, review_note from public.conversion_factor_versions where id = ${third.versionId}`;
  check(
    "it is retired with the reason",
    v3.status === "retired" && /does not match/.test(v3.review_note),
  );
  check(
    "a turned-down version cannot be put back",
    !!(await refused(
      maker.factors.setStatus({ versionId: third.versionId, status: "active" }),
      "CONFLICT",
    )),
  );

  section("The checks on a version");
  const bad = async (patch) =>
    refused(
      maker.factors.addVersion({ factorId: created.factorId, ...base, ...patch }),
      "BAD_REQUEST",
    );
  check(
    "a per-unit of another kind (kWh for a litre activity) is refused",
    !!(await bad({ inputUnit: "kWh" })),
  );
  check(
    "a per-unit of the same kind (KL) is accepted",
    !(await bad({
      inputUnit: "KL",
      effectiveFrom: "2029-04-01",
      effectiveTo: null,
      financialYear: "2029-30",
    })),
  );
  check(
    "a result unit that is not an emission unit is refused",
    !!(await bad({ outputUnit: "kg" })),
  );
  check(
    "a different result unit from the factor's is refused",
    !!(await bad({ outputUnit: "tCO2e" })),
  );
  check(
    "a start date outside the financial year is refused",
    !!(await bad({ financialYear: "2025-26" })),
  );
  check("a malformed financial year is refused", !!(await bad({ financialYear: "2026-28" })));
  check("an http link is refused", !!(await bad({ sourceUrl: "http://cea.nic.in/x" })));
  check(
    "a value said to come from a page without the page's fingerprint is refused",
    !!(await bad({ valueOrigin: "fetched" })),
  );
  check(
    "a Project Manager-like role without factor.manage cannot create factors",
    !!(await refused(
      orgAdmin.factors.create({ activityType: CODE, name: "x y", ...base }),
      "FORBIDDEN",
    )),
  );

  section("Fetching a source: only official sites, never a private address");
  const outside = await maker.factors.fetchSource({
    url: "https://example.org/factors",
    activityType: CODE,
  });
  check(
    "a link off the official list is not fetched (and nothing leaves the server)",
    outside.ok === false && /not on the list of official sources/.test(outside.reason),
    JSON.stringify(outside),
  );
  check(
    "an internal address is refused before any request",
    (await maker.factors.fetchSource({ url: "https://169.254.169.254/latest", activityType: CODE }))
      .ok === false,
  );
  const fetchAudit = await sql`
    select new_value from public.audit_logs where event_type = 'factor.source_fetched'
    order by created_at desc limit 1`;
  check("each fetch attempt is audited", !!fetchAudit[0]?.new_value?.refused);

  const HOSTS = [{ host: "cea.nic.in", publisher: "Central Electricity Authority" }];
  const ctx = { metricUnit: "kWh", keywords: ["Grid Electricity"] };
  const page =
    (html, status = 200, extra = {}) =>
    async () => ({
      status,
      location: null,
      contentType: "text/html; charset=utf-8",
      body: Buffer.from(html),
      ...extra,
    });
  const ok1 = await fetchSource(
    "https://cea.nic.in/baseline",
    HOSTS,
    ctx,
    page("<title>CO2 Baseline</title><p>Grid emission factor for FY 2024-25: 0.710 tCO2/MWh</p>"),
  );
  check(
    "an official page is read and its factor offered, with the page's fingerprint",
    ok1.ok &&
      ok1.source.candidates[0]?.value === 0.71 &&
      ok1.source.title === "CO2 Baseline" &&
      /^[0-9a-f]{64}$/.test(ok1.source.sha256) &&
      ok1.source.publisher === "Central Electricity Authority",
    JSON.stringify(ok1),
  );
  let hops = 0;
  const redirectAway = await fetchSource("https://cea.nic.in/a", HOSTS, ctx, async () => {
    hops += 1;
    return {
      status: 302,
      location: "https://attacker.example/steal",
      contentType: "",
      body: Buffer.alloc(0),
    };
  });
  check(
    "a redirect to a site off the list is refused without following it",
    !redirectAway.ok && /attacker\.example/.test(redirectAway.reason) && hops === 1,
  );
  const redirectHttp = await fetchSource("https://cea.nic.in/a", HOSTS, ctx, async () => ({
    status: 301,
    location: "http://cea.nic.in/a",
    contentType: "",
    body: Buffer.alloc(0),
  }));
  check("a redirect to plain http is refused", !redirectHttp.ok);
  const loop = await fetchSource("https://cea.nic.in/a", HOSTS, ctx, async () => ({
    status: 302,
    location: "https://cea.nic.in/a",
    contentType: "",
    body: Buffer.alloc(0),
  }));
  check("endless redirects stop", !loop.ok && /too many/.test(loop.reason));
  check(
    "a page that is not found says so",
    !(await fetchSource("https://cea.nic.in/x", HOSTS, ctx, page("", 404))).ok,
  );
  check(
    "a file type that cannot be read is refused",
    !(
      await fetchSource(
        "https://cea.nic.in/x",
        HOSTS,
        ctx,
        page("x", 200, { contentType: "application/zip" }),
      )
    ).ok,
  );
  const privateErr = await fetchSource("https://cea.nic.in/x", HOSTS, ctx, async () => {
    throw new Error("cea.nic.in resolves to a private address");
  });
  check(
    "a name that resolves to a private address is reported as such",
    !privateErr.ok && /private address/.test(privateErr.reason),
  );
  const lookup = (addresses) =>
    new Promise((resolve) =>
      guardedLookup((_h, _o, cb) => cb(null, addresses))("cea.nic.in", { all: true }, (err, res) =>
        resolve({ err, res }),
      ),
    );
  check(
    "the connection's lookup refuses a name with any private address",
    !!(
      await lookup([
        { address: "164.100.1.1", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ])
    ).err,
  );
  check(
    "…and lets a name with only public addresses through",
    !(await lookup([{ address: "164.100.1.1", family: 4 }])).err,
  );

  section("Carbon-credit links");
  const links = await maker.carbonLinks.list();
  check(
    "the preset links are listed, each with its host",
    links.length >= 6 && links.every((l) => l.url.startsWith("https://") && l.host),
  );
  check(
    "an Administrator with carbon_credit.view sees them but cannot change them",
    (await orgAdmin.carbonLinks.list()).length >= 6 &&
      !!(await refused(
        orgAdmin.carbonLinks.create({
          name: "x y",
          url: "https://x.example/",
          description: "x y",
          kind: "registry",
        }),
        "FORBIDDEN",
      )),
  );
  check(
    "an http link is refused",
    !!(await refused(
      maker.carbonLinks.create({
        name: "Plain",
        url: "http://x.example/",
        description: "plain",
        kind: "registry",
      }),
      "BAD_REQUEST",
    )),
  );
  check(
    "a link to a numeric address is refused",
    !!(await refused(
      maker.carbonLinks.create({
        name: "Local",
        url: "https://127.0.0.1/",
        description: "local",
        kind: "registry",
      }),
      "BAD_REQUEST",
    )),
  );
  const added = await maker.carbonLinks.create({
    name: `Isolation ${RUN}`,
    url: `https://isolation-${RUN.toLowerCase()}.example/`,
    description: "Test link",
    kind: "registry",
  });
  check(
    "the same address cannot be added twice",
    !!(await refused(
      maker.carbonLinks.create({
        name: "Again",
        url: `https://isolation-${RUN.toLowerCase()}.example/`,
        description: "dup",
        kind: "registry",
      }),
      "CONFLICT",
    )),
  );
  await maker.carbonLinks.update({
    id: added.id,
    name: `Isolation ${RUN}`,
    url: `https://isolation-${RUN.toLowerCase()}.example/`,
    description: "Hidden test link",
    kind: "registry",
    active: false,
  });
  check(
    "a hidden link is not shown to others, but the Super Admin still sees it",
    !(await orgAdmin.carbonLinks.list()).some((l) => l.id === added.id) &&
      (await maker.carbonLinks.list()).some((l) => l.id === added.id && !l.active),
  );
  await maker.carbonLinks.remove({ id: added.id });
  check(
    "removing it is audited",
    (
      await sql`select 1 from public.audit_logs where event_type = 'carbon_link.removed' and entity_id = ${added.id}`
    ).length === 1,
  );
  const followed = await checkAddress("https://a.example/", async (url) =>
    url.hostname === "a.example"
      ? { status: 301, location: "https://b.example/", contentType: "", body: Buffer.alloc(0) }
      : { status: 200, location: null, contentType: "text/html", body: Buffer.alloc(0) },
  );
  check(
    "checking an address follows redirects and records where it ended",
    followed.status === 200 && followed.finalUrl === "https://b.example/",
  );
  const down = await checkAddress("https://a.example/", async () => {
    throw new Error("connect ECONNREFUSED");
  });
  check(
    "an address that does not answer is recorded as status 0",
    down.status === 0 && !!down.error,
  );
} finally {
  // The test's activity and its factor go; audit entries stay (append-only).
  const factor = await sql`select id from public.conversion_factors where activity_type = ${CODE}`;
  if (factor[0]) {
    await sql`delete from public.notifications where related_entity_type in ('conversion_factor', 'conversion_factor_version')
              and message like ${`%Isolation ${RUN}%`}`;
    await sql`delete from public.conversion_factor_versions where conversion_factor_id = ${factor[0].id}`;
    await sql`delete from public.conversion_factors where id = ${factor[0].id}`;
  }
  // Removed outright (nothing refers to it), so database tests that list every activity are not disturbed;
  // soft-deleted only if something unexpected still points at it.
  await sql`delete from public.esg_metrics where code = ${CODE}`.catch(
    () => sql`update public.esg_metrics set deleted_at = now() where code = ${CODE}`,
  );
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
