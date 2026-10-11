// Scenario D (06_IMPLEMENTATION_PLAN.md §4): the Admin generates a BRSR report covering Scenarios A–C's data,
// consolidated across the hierarchy, and every value drills down to its original document. Run after A–C.
import { check, close, finish, ok, one, rejected, section, setup, sql } from "./lib.mjs";

const { sessions } = await setup();
const { admin, pm } = sessions;
const root = (
  await one(sql`select id from public.org_units where parent_id is null and deleted_at is null`)
).id;
const period = await one(
  sql`select id, start_date from public.reporting_periods where status = 'open' order by start_date limit 1`,
);
const fy =
  period.start_date.getMonth() >= 3
    ? period.start_date.getFullYear()
    : period.start_date.getFullYear() - 1;

async function waitFor(runId) {
  for (let i = 0; i < 120; i++) {
    const run = (await admin.query("reports.get", { id: runId })).data;
    if (run?.status === "completed" || run?.status === "failed") return run;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return (await admin.query("reports.get", { id: runId })).data;
}

/** The newest approved record of each scenario's metric submitted by the test accounts. */
const scenarioRecord = (metric) =>
  one(sql`
  select r.id, d.id as document_id from public.esg_records r
  join public.esg_metrics m on m.id = r.metric_id join public.users u on u.id = r.submitted_by
  join public.esg_record_documents e on e.esg_record_id = r.id and e.is_primary join public.documents d on d.id = e.document_id
  where m.code = ${metric} and u.email like 'e2e.%' and r.approval_status = 'approved'
  order by r.created_at desc limit 1`);
const scenarios = {
  "A (diesel)": await scenarioRecord("DIESEL_CONSUMPTION"),
  "B (grid electricity)": await scenarioRecord("GRID_ELECTRICITY"),
  "C (headcount)": await scenarioRecord("WORKFORCE_GENDER"),
};
check(
  "Scenarios A–C each left an approved record",
  Object.values(scenarios).every(Boolean),
  Object.entries(scenarios)
    .filter(([, r]) => !r)
    .map(([k]) => k)
    .join(", "),
);

section("Turnover, PPP rate and assurance are entered once per financial year (D26)");
// Whatever is stored locally for this year is put back at the end.
const inputsBefore = (await admin.query("reports.inputs", { financialYear: fy })).data;
const inputs = {
  financialYear: fy,
  turnoverCr: 1000,
  pppRate: 20.343,
  physicalOutput: null,
  physicalOutputUnit: null,
  assurance: "No (e2e synthetic value)",
  methodologyNote: null,
};
check("the Admin saves them", ok(await admin.mutate("reports.saveInputs", inputs)));
check(
  "they read back, and another year is untouched",
  (await admin.query("reports.inputs", { financialYear: fy })).data?.turnoverCr === 1000 &&
    (await admin.query("reports.inputs", { financialYear: 2001 })).data?.turnoverCr === null,
);
check(
  "a negative turnover is refused, and a Project Manager cannot change them",
  rejected(await admin.mutate("reports.saveInputs", { ...inputs, turnoverCr: -1 })) &&
    rejected(await pm.mutate("reports.saveInputs", inputs)),
);
check(
  "the change is audited",
  !!(await one(
    sql`select 1 from public.audit_logs where event_type = 'report_inputs.updated'
        and (new_value->>'financial_year')::int = ${fy} and (new_value->>'turnoverCr')::numeric = 1000`,
  )),
);

section("Generation runs after the request");
const started = Date.now();
const gen = await admin.mutate("reports.generate", { orgUnitId: root, financialYear: fy });
check(
  `the request returns at once (${Date.now() - started} ms)`,
  ok(gen) && Date.now() - started < 5000,
  gen.error,
);
const run = await waitFor(gen.data.runId);
check("the run completes", run.status === "completed", `${run.status}: ${run.error}`);
const file = await admin.file(`/api/reports/${run.id}/file`);
const pdf = Buffer.from(await file.arrayBuffer());
check(
  "the PDF downloads, private and uncached",
  file.status === 200 &&
    pdf.subarray(0, 5).toString() === "%PDF-" &&
    file.headers.get("cache-control")?.includes("no-store"),
);

section("Consolidated correctly across the hierarchy");
const s = run.snapshot;
check(
  "the snapshot carries the previous year, the year's inputs and every factor used with its source",
  !!s.previous?.label &&
    s.inputs?.current.turnoverCr === 1000 &&
    s.inputs?.previous.turnoverCr === null &&
    s.factors.length > 0 &&
    s.factors.every((f) => f.source && f.records > 0) &&
    s.orgUnitCount > 1,
  JSON.stringify({ previous: s.previous?.label, inputs: s.inputs, factors: s.factors?.length }),
);
// Snapshot version 3 (.grill/audit-2-decisions.md): the break-ups and the per-child roll-up add up.
const tonnesOf = (scopes, code) =>
  (scopes.find((x) => x.code === code)?.figures ?? []).reduce(
    (sum, f) => sum + (f.unit === "kgCO2e" ? (f.value ?? 0) / 1000 : 0),
    0,
  );
const gasSum = (code) =>
  s.breakups.gases.filter((g) => g.scopeCode === code).reduce((sum, g) => sum + g.tCo2e, 0);
check(
  "the break-up by gas adds up to each scope's total",
  s.version >= 3 &&
    ["SCOPE_1", "SCOPE_2", "SCOPE_3"].every((c) => close(gasSum(c), tonnesOf(s.scopes, c), 1e-6)),
  JSON.stringify(s.breakups?.gases),
);
check(
  "Scope 1 by emission source adds up to Scope 1",
  close(
    s.breakups.scope1Sources.reduce((sum, x) => sum + x.tCo2e, 0),
    tonnesOf(s.scopes, "SCOPE_1"),
    1e-6,
  ),
  JSON.stringify(s.breakups?.scope1Sources),
);
const wasteTotal = s.sections
  .flatMap((x) => x.indicators)
  .find((i) => i.code === "P6-E9")
  .metrics.flatMap((m) => m.figures)
  .reduce((sum, f) => sum + (f.unit === "kg" ? (f.value ?? 0) / 1000 : 0), 0);
check(
  "waste by category and by treatment route each add up to the waste reported",
  close(
    s.breakups.wasteByCategory.reduce((sum, x) => sum + x.tonnes, 0),
    wasteTotal,
    1e-6,
  ) &&
    close(
      s.breakups.wasteByRoute.reduce((sum, x) => sum + x.tonnes, 0),
      wasteTotal,
      1e-6,
    ),
  JSON.stringify({ wasteTotal, c: s.breakups.wasteByCategory, r: s.breakups.wasteByRoute }),
);
check(
  "no child org unit reports more than the node, and the children are its direct children",
  s.children.length > 0 &&
    ["SCOPE_1", "SCOPE_2", "SCOPE_3"].every(
      (c) =>
        s.children.reduce((sum, child) => sum + tonnesOf(child.scopes, c), 0) <=
        tonnesOf(s.scopes, c) + 1e-6,
    ),
  JSON.stringify(s.children?.map((c) => c.name)),
);
check(
  "the report says which days of the financial year it covers",
  typeof s.coverage.days === "number" &&
    s.coverage.days > 0 &&
    !!s.coverage.from &&
    !!s.coverage.to,
  JSON.stringify(s.coverage),
);
check(
  "each indicator carries its SDG tags (migration 0039)",
  s.sections
    .flatMap((x) => x.indicators)
    .find((i) => i.code === "P6-E7")
    ?.sdgs?.join() === "7,9,13",
);
check(
  "indicators carry the July-2023 BRSR numbers (D25)",
  ["A-20", "A-24", "P6-E7", "P6-E9", "P6-L2"].every((code) =>
    s.sections.some((x) => x.indicators.some((i) => i.code === code)),
  ),
);
const live = (await admin.query("consolidation.query", { orgUnitId: root, financialYear: fy }))
  .data;
const metricsOf = (code) =>
  s.sections.flatMap((x) => x.indicators).find((i) => i.code === code)?.metrics ?? [];
const liveFigure = (code, unit) =>
  live.metrics.find((m) => m.code === code)?.figures.find((f) => f.unit === unit)?.approved;
const diesel = metricsOf("P6-E7").find((m) => m.name === "Diesel Consumption");
check(
  "P6-E7 diesel equals the live approved consolidation",
  close(
    diesel?.figures.find((f) => f.unit === "kgCO2e")?.value,
    liveFigure("DIESEL_CONSUMPTION", "kgCO2e"),
  ),
);
const women = metricsOf("A-20")[0];
check(
  "A-20 % women is re-derived from summed counts, not averaged",
  close(women?.figures[0].value, (women?.basis.part / women?.basis.whole) * 100) &&
    close(women?.figures[0].value, liveFigure("WORKFORCE_GENDER", "%")),
  JSON.stringify(women?.basis),
);
const scope1 = s.scopes
  .find((x) => x.code === "SCOPE_1")
  .figures.find((f) => f.unit === "kgCO2e").value;
const liveScope1 = live.metrics
  .filter((m) => m.scopeName === "Scope 1")
  .reduce((t, m) => t + (m.figures.find((f) => f.unit === "kgCO2e")?.approved ?? 0), 0);
check("the Scope 1 summary equals the sum of its activities", close(scope1, liveScope1));

section("Every scenario's value drills down to its original document");
const reported = s.sections
  .flatMap((x) => x.indicators)
  .flatMap((i) => i.metrics)
  .flatMap((m) => m.records);
for (const [name, rec] of Object.entries(scenarios)) {
  if (!rec) continue;
  const entry = reported.find((r) => r.recordId === rec.id);
  check(`${name} is in the report`, !!entry);
  if (!entry) continue;
  const drill = (
    await admin.query("reports.reportedRecord", {
      recordId: rec.id,
      calculationId: entry.calculationId ?? null,
    })
  ).data;
  check(
    `${name}: indicator → metric → calculation → verified data is available`,
    drill?.available === true,
  );
  const doc = await admin.file(`/api/documents/${rec.document_id}/file`);
  check(`${name}: the original document opens`, doc.status === 200);
}

section("Every stored calculation reproduces from what it stored (determinism)");
const reproduced = await sql`
  with calc as (
    select c.id, c.result_value, c.normalized_value, c.factor_value_snapshot, f.formula_type, f.formula_definition d
    from public.calculations c join public.calculation_formulas f on f.id = c.calculation_formula_id where c.is_current
  ), inputs as (
    select calculation_id, jsonb_object_agg(input_key, input_value) v from public.calculation_inputs group by 1
  )
  select calc.formula_type, count(*)::int as total,
    count(*) filter (where abs(calc.result_value - case calc.formula_type
      when 'direct_multiply' then calc.normalized_value * calc.factor_value_snapshot
      when 'percentage' then (i.v->>(calc.d->>'part'))::numeric / nullif((i.v->>(calc.d->>'whole'))::numeric, 0) * 100
      when 'subtract' then (i.v->>(calc.d->'inputs'->>0))::numeric - (i.v->>(calc.d->'inputs'->>1))::numeric
    end) <= 1e-9 * greatest(abs(calc.result_value), 1))::int as same
  from calc left join inputs i on i.calculation_id = calc.id group by 1`;
for (const r of reproduced)
  check(
    `${r.formula_type}: ${r.same} of ${r.total} current results recomputed exactly`,
    r.same === r.total,
  );

section("A failure names its reason");
const fines = await one(sql`
  select x.id as mapping_id, x.esg_metric_id as metric_id, i.id as indicator_id from public.brsr_metric_mappings x
  join public.brsr_indicators i on i.id = x.brsr_indicator_id where i.code = 'P1-E2'`);
const save = (isApplicable) =>
  admin.mutate("brsr.save", {
    mappingId: fines.mapping_id,
    metricId: fines.metric_id,
    indicatorId: fines.indicator_id,
    isApplicable,
  });
await save(false);
try {
  const bad = await waitFor(
    (await admin.mutate("reports.generate", { orgUnitId: root, periodId: period.id })).data.runId,
  );
  check(
    "an Essential indicator with no applicable mapping fails the report with its code",
    bad.status === "failed" &&
      /1 required BRSR indicator has no metric mapping \(P1-E2\)/.test(bad.error ?? ""),
    bad.error,
  );
} finally {
  await save(true);
}

await admin.mutate("reports.saveInputs", { financialYear: fy, ...inputsBefore });

section("Access");
check(
  "a Project Manager cannot generate or list reports",
  rejected(await pm.mutate("reports.generate", { orgUnitId: root, financialYear: fy })) &&
    rejected(await pm.query("reports.list")),
);
check("nor download one", (await pm.file(`/api/reports/${run.id}/file`)).status === 404);

await finish();
