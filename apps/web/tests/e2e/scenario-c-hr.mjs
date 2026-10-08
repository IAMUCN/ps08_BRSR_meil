// Scenario C (06_IMPLEMENTATION_PLAN.md §4, App Flow Journey 3): HR uploads a headcount statement whose
// "Men" count OCR reads below the confidence threshold. Confirm is refused until HR reviews that field;
// validation runs; the engine derives % women from the verified counts; the Admin sees both counts and the
// formula and approves.
import {
  RUN,
  check,
  close,
  confirm,
  currentCalculation,
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
  validationResults,
} from "./lib.mjs";

const { sessions } = await setup();
const { admin, hr, pm } = sessions;
const threshold = Number(
  (
    await one(
      sql`select value #>> '{}' as v from public.org_settings where key = 'ocr_confidence_threshold'`,
    )
  ).v,
);

section("Each role sees only its own evidence");
const options = async (who) =>
  JSON.stringify((await who.query("documents.uploadOptions")).data ?? {});
check("HR is offered the workforce metrics", (await options(hr)).includes("Employees by gender"));
check("a Project Manager is not", !(await options(pm)).includes("Employees by gender"));
check(
  "and cannot upload one through the API",
  rejected(
    (
      await upload(pm, sample("workforce", { period: "30-Sep-2026" }), `c-pm-${RUN}.pdf`, {
        metric: "WORKFORCE_GENDER",
      })
    ).prepared,
  ),
);

section("HR uploads the headcount statement");
const { documentId, completed } = await upload(
  hr,
  sample("workforce", { period: "30-Sep-2026" }),
  `scenario-c-${RUN}.pdf`,
  {
    metric: "WORKFORCE_GENDER",
  },
);
check("it is accepted", ok(completed), completed?.error);
await runWorker();
const loaded = (await hr.query("verification.load", { documentId })).data;
const field = (key) => loaded?.fields?.find((f) => f.key === key);
check(
  "OCR read total 180 and women 42",
  field("total_employees")?.extractedValue === "180" &&
    field("female_employees")?.extractedValue === "42",
  JSON.stringify(loaded?.fields?.map((f) => [f.key, f.extractedValue, f.confidence])),
);
check(
  `"Men" is genuinely below the ${threshold}% threshold`,
  field("male_employees")?.confidence < threshold,
  `confidence ${field("male_employees")?.confidence}`,
);

section("The guard rail");
const blocked = await confirm(hr, documentId);
check(
  "Confirm is refused while the weak field is unreviewed, naming it",
  rejected(blocked, "Men"),
  JSON.stringify(blocked),
);
check(
  "and nothing was written",
  (await recordOf(documentId)).verification_status === "ocr_completed",
);
const confirmed = await confirm(hr, documentId, { acknowledge: ["male_employees"] });
check("after HR marks it correct, Confirm succeeds", ok(confirmed), JSON.stringify(confirmed));
const acknowledged = await one(sql`
  select f.verification_status from public.ocr_fields f join public.ocr_extractions e on e.id = f.ocr_extraction_id
  where e.document_id = ${documentId} and f.field_key = 'male_employees'`);
check(
  "the review is recorded on the field",
  acknowledged?.verification_status === "confirmed",
  JSON.stringify(acknowledged),
);

section("Validation and the derived metric");
let record = await recordOf(documentId);
if (record.validation_status === "flagged") {
  // A headcount from an earlier run already covers this period: the only flag must be that one.
  const results = await validationResults(record.id);
  check(
    "flagged only as a second headcount for the period",
    results.filter((r) => !r.endsWith(":pass")).join() === "period:flagged",
    results.join(),
  );
  check(
    "an Admin accepts it",
    ok(
      await admin.mutate("validation.review", {
        recordId: record.id,
        decision: "accept",
        reason: `Restated headcount (tests/e2e ${RUN}).`,
      }),
    ),
  );
  record = await recordOf(documentId);
}
check(
  "the record is validated",
  record.validation_status === "validated",
  record.validation_status,
);
const calc = await currentCalculation(record.id);
check(
  "% women = 42 ÷ 180 × 100 = 23.33 %",
  close(Number(calc?.result_value), (42 / 180) * 100, 1e-9) && calc?.result_unit === "%",
  `${calc?.result_value} ${calc?.result_unit}`,
);
const inputs =
  await sql`select input_key, input_value::float as v from public.calculation_inputs where calculation_id = ${calc.id} order by 1`;
check(
  "the counts are stored as the inputs, not only the percentage",
  inputs.map((i) => `${i.input_key}=${i.v}`).join() === "female_employees=42,total_employees=180",
);
check("no conversion factor is involved", calc.conversion_factor_version_id === null);

section("Visible to the Admin, who approves");
const row = ((await admin.query("approvals.queue")).data ?? []).find(
  (r) => r.recordId === record.id,
);
check(
  "it is in the Admin approval queue with both inputs and the formula",
  row?.calculation?.trace?.inputs?.length === 2 &&
    row.calculation.trace.formula === "Women ÷ Total employees × 100",
  JSON.stringify(row?.calculation?.trace),
);
check(
  "HR cannot approve it",
  rejected(await hr.mutate("approvals.decide", { recordId: record.id, decision: "approve" })),
);
check(
  "the Admin approves",
  ok(await admin.mutate("approvals.decide", { recordId: record.id, decision: "approve" })),
);
check(
  "HR is told",
  (
    await one(sql`
  select count(*)::int as n from public.notifications n join public.users u on u.id = n.user_id
  where u.email = 'e2e.hr@traceesg.test' and n.related_entity_id = ${record.id} and n.type = 'approved'`)
  ).n === 1,
);

await finish();
