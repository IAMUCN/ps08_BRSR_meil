// Phase 6 of feature_enhancement.md through the running app: conversion factors are drafts until approved, carry
// their source, and can be fetched only from official sites; the carbon-credit links. Who may do what, over HTTP.
// The approval by a second Super Admin is in tests/isolation/factors.mjs (it needs both Super Admins signed in).
// Local stack only.
import { RUN, check, finish, ok, one, section, setup, sql } from "./lib.mjs";

const { sessions } = await setup();
const { admin, pm, approver } = sessions;
const [{ superAdmins }] = await sql`
  select count(distinct a.user_id)::int as "superAdmins" from public.user_org_assignments a
  join public.roles r on r.id = a.role_id and r.code = 'admin'
  join public.users u on u.id = a.user_id and u.is_active and u.deleted_at is null
  where a.revoked_at is null`;

// ============================================================================================================
section("Who may do what");
// ============================================================================================================
for (const [name, who] of [
  ["a Project Manager", pm],
  ["an approver", approver],
]) {
  check(`${name} cannot list factors`, (await who.query("factors.list")).status === 403);
  check(
    `${name} cannot read the yearly review`,
    (await who.query("factors.review")).status === 403,
  );
  check(
    `${name} cannot fetch a source`,
    (
      await who.mutate("factors.fetchSource", {
        url: "https://cea.nic.in/",
        activityType: "GRID_ELECTRICITY",
      })
    ).status === 403,
  );
  check(
    `${name} cannot approve a version`,
    (await who.mutate("factors.approve", { versionId: crypto.randomUUID() })).status === 403,
  );
  check(
    `${name} cannot add a carbon-credit link`,
    (
      await who.mutate("carbonLinks.create", {
        name: "x y",
        url: "https://x.example/",
        description: "x y",
        kind: "registry",
      })
    ).status === 403,
  );
}
const pmPage = await pm.get("/admin/conversion-factors");
// The root loading page streams a redirect inside a 200 page (CONTEXT.md, traps): check the content too.
check(
  "a Project Manager cannot open Conversion Factors",
  pmPage.status !== 200 || !/Yearly review/.test(pmPage.html),
);

// ============================================================================================================
section("A new version is a draft and does not change calculations");
// ============================================================================================================
const diesel = await one(sql`
  select f.id, v.id as active_id, v.value::float as value
  from public.conversion_factors f
  join public.conversion_factor_versions v on v.conversion_factor_id = f.id and v.status = 'active'
  where f.activity_type = 'DIESEL_CONSUMPTION' order by v.version_number desc limit 1`);
const draft = await admin.mutate("factors.addVersion", {
  factorId: diesel.id,
  value: 99,
  inputUnit: "L",
  outputUnit: "kgCO2e",
  sourceReference: `E2E draft ${RUN} — never approved`,
  sourceUrl: "https://ipcc-nggip.iges.or.jp/public/2006gl/",
  financialYear: "2090-91",
  effectiveFrom: "2090-04-01",
});
check("the Super Admin adds a version", ok(draft), draft.error);
const stored = await one(sql`
  select status::text, financial_year, source_url from public.conversion_factor_versions
  where id = ${draft.data?.versionId}`);
check(
  "it is stored as a draft with its financial year and link",
  stored?.status === "draft" &&
    stored.financial_year === "2090-91" &&
    /ipcc-nggip/.test(stored.source_url),
  JSON.stringify(stored),
);
const still = await one(
  sql`select status::text from public.conversion_factor_versions where id = ${diesel.active_id}`,
);
check("the version in use is unchanged", still.status === "active");
const listed = await admin.query("factors.list");
const row = listed.data
  ?.find((f) => f.id === diesel.id)
  ?.versions.find((v) => v.id === draft.data?.versionId);
check(
  "the list shows it waiting, with an official-source mark",
  row?.status === "draft" && row?.reliability === "official" && row?.financialYear === "2090-91",
  JSON.stringify(row),
);
if (superAdmins > 1) {
  check(
    "with a second Super Admin, the one who entered it cannot approve it",
    (await admin.mutate("factors.approve", { versionId: draft.data?.versionId })).status === 403,
  );
}
const withdrawn = await admin.mutate("factors.reject", {
  versionId: draft.data?.versionId,
  reason: "E2E draft withdrawn by the suite",
});
check("the draft is withdrawn with a reason and kept", ok(withdrawn), withdrawn.error);
check(
  "a malformed version is refused with a reason",
  /same kind/.test(
    (
      await admin.mutate("factors.addVersion", {
        factorId: diesel.id,
        value: 1,
        inputUnit: "kWh",
        outputUnit: "kgCO2e",
        sourceReference: "wrong unit",
        effectiveFrom: "2091-04-01",
      })
    ).error ?? "",
  ),
);

// ============================================================================================================
section("The yearly review and fetching");
// ============================================================================================================
const review = await admin.query("factors.review", { financialYear: "2026-27" });
check(
  "the yearly review lists every activity that takes a factor",
  ok(review) && review.data.items.length >= 30 && review.data.from === "2026-04-01",
  `${review.data?.items.length}`,
);
check(
  "an activity with no factor by design shows as having no value",
  review.data?.items.find((i) => i.activityType === "PURCHASED_STEAM")?.state === "missing",
);
const outside = await admin.mutate("factors.fetchSource", {
  url: "https://example.org/emission-factors.pdf",
  activityType: "GRID_ELECTRICITY",
});
check(
  "a link off the official list is not fetched",
  ok(outside) && outside.data.ok === false && /not on the list/.test(outside.data.reason),
  JSON.stringify(outside.data),
);
const internal = await admin.mutate("factors.fetchSource", {
  url: "https://127.0.0.1/admin",
  activityType: "GRID_ELECTRICITY",
});
check("a numeric address is refused", ok(internal) && internal.data.ok === false);

// ============================================================================================================
section("Carbon-credit links");
// ============================================================================================================
const links = await admin.query("carbonLinks.list");
check(
  "the preset links are there, all https, each naming its site",
  ok(links) &&
    links.data.length >= 6 &&
    links.data.every((l) => l.url.startsWith("https://") && l.host),
);
const page = (await admin.get("/admin/carbon-credits")).html;
check(
  "Carbon Markets says EmeilSG does not sell, certify or guarantee credits",
  /does not sell, certify or guarantee carbon credits/.test(page),
);
check(
  "each link opens in a new tab without passing the app's address",
  /target="_blank" rel="noopener noreferrer nofollow"/.test(page) &&
    /href="https:\/\/indiancarbonmarket\.gov\.in\/"/.test(page),
);
const added = await admin.mutate("carbonLinks.create", {
  name: `E2E link ${RUN}`,
  url: `https://e2e-${RUN.toLowerCase()}.example/`,
  description: "Added by the suite and removed again",
  kind: "registry",
});
check("the Super Admin adds a link", ok(added), added.error);
check(
  "a plain http link is refused",
  (
    await admin.mutate("carbonLinks.create", {
      name: "Plain",
      url: "http://plain.example/",
      description: "plain",
      kind: "registry",
    })
  ).status === 400,
);
const removed = await admin.mutate("carbonLinks.remove", { id: added.data?.id });
check("…and removes it", ok(removed), removed.error);

await finish();
