// The gaps found against the L&T BRSR (2026-11-13; .grill/brsr-gaps-decisions.md), through the real app: a zero
// is accepted and flagged; a calorific value is a draft until approved and then turns fuel into GJ in the report;
// SEBI's typed tables save, refuse bad values and stay with the people who may write them; the report prints the
// energy table, the typed tables, the year-on-year note and the assurer. Local stack only.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  WEB,
  approveSyntheticFactor,
  check,
  confirm,
  finish,
  ok,
  one,
  orgId,
  rejected,
  runWorker,
  sample,
  section,
  setup,
  sql,
  upload,
} from "./lib.mjs";

const require = createRequire(`${WEB}/package.json`);
const pdfjs = await import(pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href);
const { sessions } = await setup();
const { admin, pm } = sessions;
const PRJ_X = await orgId("PRJ-X");

const { fy } = await one(sql`
  select (extract(year from p.start_date)::int - case when extract(month from p.start_date) < 4 then 1 else 0 end) as fy
  from public.esg_records r join public.reporting_periods p on p.id = r.reporting_period_id
  join public.org_units o on o.id = r.org_unit_id join public.esg_metrics m on m.id = r.metric_id
  where o.code = 'PRJ-X' and r.approval_status = 'approved' and m.code = 'DIESEL_CONSUMPTION'
  group by 1 order by count(*) desc limit 1`);

// ---------------------------------------------------------------------------------------------------------
section("A zero is accepted and flagged for review");
{
  const { documentId } = await upload(pm, sample("diesel"), "zero-diesel.pdf");
  await runWorker();
  const confirmed = await confirm(pm, documentId, {
    overrides: { quantity: "0" },
    acknowledge: ["quantity"],
  });
  check("a bill confirmed at zero is accepted", ok(confirmed), confirmed.error);
  const [flag] = await sql`
    select vr.result::text as result, vr.message from public.validation_results vr
    join public.esg_record_documents e on e.esg_record_id = vr.esg_record_id
    where e.document_id = ${documentId} and vr.message like '%is zero%'`;
  check("and flagged for a person to confirm", flag?.result === "flagged", JSON.stringify(flag));
}

// ---------------------------------------------------------------------------------------------------------
section("A calorific value: a draft until approved, then fuel counts in GJ");
{
  const types = (await admin.query("factors.activityTypes")).data ?? [];
  check(
    "the factor screen offers calorific values for fuels",
    types.some((t) => t.code === "ENERGY:DIESEL_CONSUMPTION"),
  );
  check(
    "but not for electricity, already energy",
    !types.some((t) => t.code === "ENERGY:GRID_ELECTRICITY"),
  );
  const alreadyThere = await one(
    sql`select id from public.conversion_factors where activity_type = 'ENERGY:DIESEL_CONSUMPTION'`,
  );
  const wrongUnit = await admin.mutate("factors.create", {
    activityType: "ENERGY:DIESEL_CONSUMPTION",
    name: "Diesel calorific value (tests/e2e)",
    value: 0.035776,
    inputUnit: "L",
    outputUnit: "kgCO2e",
    sourceReference: "SYNTHETIC TEST VALUE — apps/web/tests/e2e",
    fromYear: `${fy - 2}-${String((fy - 1) % 100).padStart(2, "0")}`,
  });
  check(
    "a calorific value must give GJ",
    alreadyThere ? rejected(wrongUnit) : rejected(wrongUnit, "GJ"),
    wrongUnit.error,
  );
  const existing = await one(
    sql`select id from public.conversion_factors where activity_type = 'ENERGY:DIESEL_CONSUMPTION'`,
  );
  if (!existing) {
    const created = await admin.mutate("factors.create", {
      activityType: "ENERGY:DIESEL_CONSUMPTION",
      name: "Diesel calorific value (tests/e2e)",
      value: 0.035776,
      inputUnit: "L",
      outputUnit: "GJ",
      sourceReference: "SYNTHETIC TEST VALUE — apps/web/tests/e2e (IPCC NCV x density 0.832)",
      fromYear: `${fy - 2}-${String((fy - 1) % 100).padStart(2, "0")}`,
    });
    check("saved as a draft", ok(created), created.error);
    if (ok(created)) await approveSyntheticFactor(admin, created.data.versionId);
  }
  const active = await one(sql`
    select v.status::text from public.conversion_factor_versions v
    join public.conversion_factors f on f.id = v.conversion_factor_id
    where f.activity_type = 'ENERGY:DIESEL_CONSUMPTION' order by v.version_number desc limit 1`);
  check("and approved", active?.status === "active", active?.status);
}

// ---------------------------------------------------------------------------------------------------------
section("SEBI's typed tables");
{
  const forbidden = await pm.query("brsrTables.list", { financialYear: fy });
  check("a Project Manager can't open them", rejected(forbidden), forbidden.error);
  const list = await admin.query("brsrTables.list", { financialYear: fy });
  check(
    "a Super Admin sees every table",
    ok(list) && list.data.length >= 17,
    `${list.data?.length} tables`,
  );
  const badPct = await admin.mutate("brsrTables.save", {
    financialYear: fy,
    tables: [{ code: "A-22", cells: { "main.employees": { male: 140 } }, notes: null }],
  });
  check("a percentage over 100 is refused", rejected(badPct, "more than 100"), badPct.error);
  const saved = await admin.mutate("brsrTables.save", {
    financialYear: fy,
    tables: [
      {
        code: "A-21",
        cells: { "main.board": { total: 12, female: 3, female_pct: 99 } },
        notes: "As at 31 March.",
      },
      { code: "P1-E8", cells: { "main.main": { payables: 100, cost: 365 } }, notes: null },
    ],
  });
  check(
    "two tables save in one go (as an Excel import does)",
    ok(saved) && saved.data.saved <= 2,
    saved.error,
  );
  const stored = await one(sql`
    select a.cells from public.brsr_table_answers a join public.brsr_indicators i on i.id = a.brsr_indicator_id
    where i.code = 'A-21' and a.financial_year = ${fy}`);
  check(
    "only the typed cells are kept (the percentage is worked out, never stored)",
    JSON.stringify(stored?.cells) === JSON.stringify({ "main.board": { total: 12, female: 3 } }),
    JSON.stringify(stored?.cells),
  );
  const audited = await one(sql`
    select count(*)::int as n from public.audit_logs where event_type = 'brsr.table_saved'
      and new_value ->> 'code' = 'A-21'`);
  check("the change is in the audit trail", audited.n >= 1);
}

// ---------------------------------------------------------------------------------------------------------
section("The report");
{
  const inputs = (await admin.query("reports.inputs", { financialYear: fy })).data;
  const savedInputs = await admin.mutate("reports.saveInputs", {
    financialYear: fy,
    turnoverCr: inputs?.turnoverCr ?? 1000,
    pppRate: inputs?.pppRate ?? 20.343,
    netWorthCr: inputs?.netWorthCr ?? null,
    physicalOutput: inputs?.physicalOutput ?? null,
    physicalOutputUnit: inputs?.physicalOutputUnit ?? null,
    assurance: inputs?.assurance ?? null,
    methodologyNote: inputs?.methodologyNote ?? null,
    pppSource: "IMF World Economic Outlook (tests/e2e)",
    pppAccessedOn: "2026-10-01",
    assurer: "An assurance firm (tests/e2e)",
    assuranceLevel: "reasonable",
    changeNotes: { "P6-E1": "Energy changed because of the e2e fixtures." },
  });
  check("the yearly notes, PPP source and assurer are saved", ok(savedInputs), savedInputs.error);

  const gen = await admin.mutate("reports.generate", {
    orgUnitId: PRJ_X,
    financialYear: fy,
    template: "brsr",
  });
  let run = null;
  for (let i = 0; i < 180 && ok(gen); i++) {
    run = (await admin.query("reports.get", { id: gen.data.runId })).data;
    if (run?.status === "completed" || run?.status === "failed") break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  check("the report completes", run?.status === "completed", `${run?.status}: ${run?.error}`);
  const snapshot = run?.snapshot;
  check("as version 5", snapshot?.version === 5, String(snapshot?.version));
  check(
    "with diesel turned into GJ by its calorific value",
    (snapshot?.breakups?.energy?.nonRenewable.fuel ?? 0) > 0,
    JSON.stringify(snapshot?.breakups?.energy),
  );
  check(
    "and the typed tables of the year",
    !!snapshot?.typedTables?.byYear?.[String(fy)]?.["A-21"],
  );
  const file = await admin.file(`/api/reports/${gen.data?.runId}/file`);
  const bytes = file.ok ? await file.arrayBuffer() : null;
  let text = "";
  if (bytes) {
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
    const doc = await task.promise;
    for (let p = 1; p <= doc.numPages; p++) {
      text +=
        (await (await doc.getPage(p)).getTextContent()).items.map((x) => x.str).join(" ") + " ";
    }
    await task.destroy();
    text = text.replace(/\s+/g, " ");
  }
  check("the PDF prints the energy table", /Total energy consumed \(A\+B\+C\+D\+E\+F\)/.test(text));
  check(
    "the year-on-year note",
    /Reason for the change from the previous year: Energy changed/.test(text),
  );
  check(
    "the assurer under BRSR Core tables",
    /An assurance firm \(tests\/e2e\), reasonable assurance/.test(text),
  );
  check("the women's representation table", /Board of Directors/.test(text) && /25%/.test(text));
  check(
    "payable days worked out (100 × 365 / 365)",
    /Number of days of accounts payable/.test(text),
  );
  check(
    "the PPP source",
    /IMF World Economic Outlook \(tests\/e2e\), accessed 2026-10-01/.test(text),
  );
}

await finish();
