// Scenario F (audit fixes P1, .grill/audit-p1-decisions.md): the activities added in migration 0035 work
// through the unchanged pipeline — a flight and a train of the same distance give different emissions, coal
// in tonnes is normalised to the factor's kilograms, and each activity is offered only to the role that owns
// its evidence. Synthetic documents and labelled synthetic factors only.
import {
  ACCOUNTS,
  RUN,
  Session,
  check,
  close,
  confirm,
  currentCalculation,
  ensureInvited,
  finish,
  ok,
  one,
  recordOf,
  rejected,
  runWorker,
  sample,
  section,
  setup,
  sql,
  upload,
  approveSyntheticFactor,
} from "./lib.mjs";

const { sessions } = await setup();
const { admin, pm } = sessions;

// Business travel belongs to Finance / CSR; the suite's standing accounts have no such user.
const financeAccount = {
  email: "e2e.finance@traceesg.test",
  role: "finance_csr",
  org: ACCOUNTS.pm.org,
  name: "E2E Finance",
};
const finance = new Session();
await finance.login(await ensureInvited(admin, financeAccount));

const FACTORS = [
  ["BUSINESS_TRAVEL_AIR", "Air travel", 0.15, "km"],
  ["BUSINESS_TRAVEL_RAIL", "Rail travel", 0.01, "km"],
  ["COAL_BITUMINOUS", "Bituminous coal", 2.4, "kg"],
];
for (const [activityType, name, value, inputUnit] of FACTORS) {
  if (await one(sql`select 1 from public.conversion_factors where activity_type = ${activityType}`))
    continue;
  const created = await admin.mutate("factors.create", {
    activityType,
    name: `${name} (synthetic, tests/e2e)`,
    value,
    inputUnit,
    outputUnit: "kgCO2e",
    sourceReference: "SYNTHETIC TEST VALUE — apps/web/tests/e2e, not an authoritative factor",
    effectiveFrom: "2026-01-01",
  });
  if (!ok(created)) throw new Error(`could not enter the synthetic ${activityType} factor`);
  await approveSyntheticFactor(admin, created.data.versionId);
}
const factorOf = async (code) =>
  (
    await one(sql`
      select v.value::float as value from public.conversion_factor_versions v
      join public.conversion_factors f on f.id = v.conversion_factor_id
      where f.activity_type = ${code} and v.status = 'active' order by v.version_number desc limit 1`)
  ).value;

const options = async (who) =>
  JSON.stringify((await who.query("documents.uploadOptions")).data ?? {});

section("Each new activity is offered to the role that owns its evidence");
const pmOptions = await options(pm);
const financeOptions = await options(finance);
check(
  "a Project Manager is offered coal by grade, LNG and PNG",
  ["Coal — Anthracite", "Coal — Lignite", "LNG Consumption", "PNG Consumption"].every((n) =>
    pmOptions.includes(n),
  ),
);
check(
  "Finance is offered travel by air, rail and road; a Project Manager is not",
  ["Business Travel — Air", "Business Travel — Rail", "Business Travel — Bus / Road"].every((n) =>
    financeOptions.includes(n),
  ) && !pmOptions.includes("Business Travel — Air"),
);
check(
  "refrigerant top-ups and purchased cement are not a Project Manager's to upload",
  !pmOptions.includes("Refrigerant top-up") && !pmOptions.includes("Cement purchased"),
);
check(
  "and the API refuses a Project Manager's flight",
  rejected(
    (
      await upload(pm, sample("travel"), `f-refused-${RUN}.pdf`, {
        metric: "BUSINESS_TRAVEL_AIR",
      })
    ).prepared,
  ),
);

/** Upload one ticket for a mode, type the distance the ticket does not print, and return its calculation. */
async function journey(metric, n) {
  const bytes = sample("travel", {
    reference: `F-${RUN}-${n}`.toUpperCase(),
    period: "15-Sep-2026",
  });
  const { documentId, completed } = await upload(finance, bytes, `f-${metric}-${RUN}.pdf`, {
    metric,
  });
  if (!documentId) return { error: completed?.error ?? "upload refused" };
  await runWorker();
  const confirmed = await confirm(finance, documentId, {
    overrides: { quantity: "1000", unit: "km" },
    acknowledge: ["quantity", "unit", "invoice_number", "billing_period"],
  });
  const record = await recordOf(documentId);
  return { confirmed, record, calc: record ? await currentCalculation(record.id) : null };
}

section("A flight and a train of the same distance give different emissions");
const air = await journey("BUSINESS_TRAVEL_AIR", 1);
const rail = await journey("BUSINESS_TRAVEL_RAIL", 2);
check(
  "both tickets are verified and validated with the distance typed by the person",
  ok(air.confirmed) && ok(rail.confirmed),
  JSON.stringify([air.confirmed ?? air.error, rail.confirmed ?? rail.error]),
);
check(
  "1,000 passenger-km by air = 1,000 × the air factor",
  close(Number(air.calc?.result_value), 1000 * (await factorOf("BUSINESS_TRAVEL_AIR"))),
  `${air.calc?.result_value}`,
);
check(
  "1,000 passenger-km by rail = 1,000 × the rail factor, a different number",
  close(Number(rail.calc?.result_value), 1000 * (await factorOf("BUSINESS_TRAVEL_RAIL"))) &&
    !close(Number(rail.calc?.result_value), Number(air.calc?.result_value)),
  `${rail.calc?.result_value}`,
);
check(
  "both count as Scope 3 business travel",
  (
    await sql`
      select distinct s.code from public.calculations c join public.scopes s on s.id = c.scope_id
      where c.id in ${sql([air.calc?.id, rail.calc?.id].filter(Boolean))}`
  )
    .map((r) => r.code)
    .join() === "SCOPE_3_BUSINESS_TRAVEL",
);

section("Coal by grade: tonnes on the invoice, kilograms in the factor");
const coalUpload = await upload(
  pm,
  sample("diesel", { reference: `F-${RUN}-3`.toUpperCase() }),
  `f-coal-${RUN}.pdf`,
  { metric: "COAL_BITUMINOUS" },
);
await runWorker();
const litres = await confirm(pm, coalUpload.documentId);
check(
  "coal in litres is refused by the units rule",
  !ok(litres) || litres.data?.validation === "failed",
  JSON.stringify(litres),
);
const coal = await confirm(pm, coalUpload.documentId, {
  overrides: { quantity: "2", unit: "MT" },
  acknowledge: ["quantity", "unit"],
});
const coalRecord = await recordOf(coalUpload.documentId);
// The sample is a diesel invoice filed as coal, so OCR (rules-14) flags it as another activity's document;
// an Admin accepts the flag, as a reviewer would for a coal invoice that mentions diesel.
check(
  "a diesel invoice filed as coal is flagged as looking like another activity's document",
  coalRecord.validation_status === "flagged",
);
await admin.mutate("validation.review", {
  recordId: coalRecord.id,
  decision: "accept",
  reason: "Test document reused for coal on purpose.",
});
const coalCalc = await currentCalculation(coalRecord.id);
check(
  "2 MT of bituminous coal = 2,000 kg × the factor, in Scope 1",
  ok(coal) && close(Number(coalCalc?.result_value), 2000 * (await factorOf("COAL_BITUMINOUS"))),
  `${JSON.stringify(coal)} ${coalCalc?.result_value}`,
);

section("Hierarchy levels are configuration (audit fix P2, migration 0037)");
const levelsBefore = (await admin.query("organization.levels")).data;
check(
  "the seeded levels are served in order, to any signed-in user",
  levelsBefore?.[0]?.code === "group" &&
    levelsBefore.at(-1).code === "department" &&
    ok(await pm.query("organization.levels")),
  JSON.stringify(levelsBefore?.map((l) => l.code)),
);
// One fixed test level, reused across runs (a level in use cannot be removed).
if (!levelsBefore.some((l) => l.code === "e2e_package")) {
  const added = await admin.mutate("organization.addLevel", {
    label: "E2E Package",
    afterCode: "region",
  });
  check("the Admin adds a level between Region and Project", ok(added), added.error);
}
const levels = (await admin.query("organization.levels")).data.map((l) => l.code);
check(
  "it takes its place by position",
  levels.indexOf("e2e_package") === levels.indexOf("region") + 1 &&
    levels.indexOf("e2e_package") < levels.indexOf("project"),
  levels.join(" > "),
);
const subA = (await one(sql`select id from public.org_units where code = 'SUB-A'`)).id;
const packageUnit = await admin.mutate("organization.create", {
  parentId: subA,
  unitType: "e2e_package",
  name: `E2E Package ${RUN}`,
  code: `E2E-PKG-${RUN}`.toUpperCase(),
});
check("an org unit can be created at the new level", ok(packageUnit), packageUnit.error);
check(
  "a later level fits under it; an earlier level and an unknown level do not",
  ok(
    await admin.mutate("organization.create", {
      parentId: packageUnit.data?.id,
      unitType: "project",
      name: `E2E Package project ${RUN}`,
      code: "",
    }),
  ) &&
    rejected(
      await admin.mutate("organization.create", {
        parentId: packageUnit.data?.id,
        unitType: "subsidiary",
        name: "inverted",
        code: "",
      }),
    ) &&
    rejected(
      await admin.mutate("organization.create", {
        parentId: packageUnit.data?.id,
        unitType: "no_such_level",
        name: "unknown",
        code: "",
      }),
    ),
);
check(
  "a level in use cannot be removed, the root level never, and a Project Manager cannot change levels",
  rejected(
    await admin.mutate("organization.removeLevel", { code: "e2e_package" }),
    "cannot be removed",
  ) &&
    rejected(await admin.mutate("organization.removeLevel", { code: "group" })) &&
    rejected(await pm.mutate("organization.addLevel", { label: "PM Level", afterCode: "site" })),
);
const renamed = await admin.mutate("organization.renameLevel", {
  code: "e2e_package",
  label: "E2E Package",
});
check(
  "a level can be renamed, and uploads show each project's level by its configured name",
  ok(renamed) &&
    JSON.stringify((await pm.query("documents.uploadOptions")).data).includes(
      '"unitTypeLabel":"Project"',
    ),
  renamed.error,
);

section("The Admin sees six active Scope 3 categories");
const scope3 = (
  await admin.query("scope.getTotal", {
    scopeCode: "SCOPE_3",
    periodId: (await recordOf(coalUpload.documentId)).reporting_period_id,
  })
).data;
check(
  "the Scope 3 dashboard's data lists 6 of 10 categories as active (downstream transport since 0038)",
  scope3?.categories?.length === 10 && scope3.categories.filter((c) => c.active).length === 6,
  JSON.stringify(scope3?.categories?.map((c) => [c.code, c.active])),
);

await finish();
