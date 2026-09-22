// Scenario B (06_IMPLEMENTATION_PLAN.md §4): the Scope 1 journey with an electricity bill — plus the checks
// that are specific to it: a second bill in a month is flagged for an Admin, and renewable electricity
// calculates to an honest zero.
import {
  RUN,
  check,
  close,
  confirm,
  currentCalculation,
  finish,
  ok,
  one,
  openPeriodId,
  orgId,
  recordOf,
  runWorker,
  sample,
  section,
  setup,
  sql,
  upload,
  validationResults,
} from "./lib.mjs";

const { sessions } = await setup();
const { admin, pm, approver } = sessions;
const periodId = await openPeriodId();
const bill = () => sample("electricity", { period: "01-Sep-2026 to 30-Sep-2026" });
const totalOf = (view) => view?.node?.totals?.find((t) => t.unit === "kgCO2e") ?? { approved: 0 };

/** Earlier data may already hold a bill for this project and month; an Admin accepts that flag with a reason. */
async function acceptIfFlagged(documentId) {
  const record = await recordOf(documentId);
  if (record.validation_status !== "flagged") return record.validation_status;
  const r = await admin.mutate("validation.review", {
    recordId: record.id,
    decision: "accept",
    reason: `Separate meter for the site office (tests/e2e ${RUN}).`,
  });
  return ok(r) ? "accepted" : `accept failed: ${r.error}`;
}

section("Upload, OCR, verify, validate");
const before = totalOf(
  (await admin.query("scope.getTotal", { scopeCode: "SCOPE_2", periodId })).data,
);
const bytes = bill();
const { documentId, completed } = await upload(pm, bytes, `scenario-b-${RUN}.pdf`, {
  metric: "GRID_ELECTRICITY",
});
check("the bill is accepted", ok(completed), completed?.error);
await runWorker();
const loaded = (await pm.query("verification.load", { documentId })).data;
const field = (key) => loaded?.fields?.find((f) => f.key === key)?.extractedValue;
check(
  "OCR read the consumption, unit and billing period",
  !!field("consumption") && !!field("unit") && !!field("billing_period"),
  JSON.stringify(loaded?.fields?.map((f) => [f.key, f.extractedValue])),
);
check("Confirm succeeds", ok(await confirm(pm, documentId)));
const path = await acceptIfFlagged(documentId);
check(`validation lets it through (${path})`, path === "validated" || path === "accepted", path);

section("Calculation — Scope 2");
const record = await recordOf(documentId);
const calc = await currentCalculation(record.id);
const scope = await one(sql`select code from public.scopes where id = ${calc?.scope_id}`);
check("classified as Scope 2", scope?.code === "SCOPE_2");
check(
  "consumption × the stored factor = the result",
  close(
    Number(calc?.result_value),
    Number(record.activity_value_verified) * Number(calc?.factor_value_snapshot),
  ),
);

section("A second bill for the same month is flagged, not failed");
const second = await upload(pm, bill(), `scenario-b-second-${RUN}.pdf`, {
  metric: "GRID_ELECTRICITY",
});
await runWorker();
const secondConfirm = await confirm(pm, second.documentId);
check(
  "it is flagged for an Admin",
  ok(secondConfirm) && secondConfirm.data.validation === "flagged",
  JSON.stringify(secondConfirm),
);
const secondRecord = await recordOf(second.documentId);
check(
  "the period check is the one that flagged it",
  (await validationResults(secondRecord.id)).includes("period:flagged"),
);
check(
  "an Admin accepts it with a reason",
  (await acceptIfFlagged(second.documentId)) === "accepted",
);

section("Renewable electricity calculates to zero");
const renewable = await upload(pm, bill(), `scenario-b-renewable-${RUN}.pdf`, {
  metric: "RENEWABLE_ELECTRICITY",
});
await runWorker();
check(
  "it confirms (the user picks the document type if OCR couldn't)",
  ok(await confirm(pm, renewable.documentId)),
);
await acceptIfFlagged(renewable.documentId);
const renewableCalc = await currentCalculation((await recordOf(renewable.documentId)).id);
check(
  "its result is exactly 0 kgCO2e with the zero factor recorded",
  Number(renewableCalc?.result_value) === 0 && Number(renewableCalc?.factor_value_snapshot) === 0,
);

section("Approve and drill down to the bill");
check(
  "the approver approves",
  ok(await approver.mutate("approvals.decide", { recordId: record.id, decision: "approve" })),
);
const view = (await admin.query("scope.getTotal", { scopeCode: "SCOPE_2", periodId })).data;
check(
  "the approved Scope 2 total moved by this bill",
  close(totalOf(view).approved, before.approved + Number(calc.result_value)),
);
check(
  "grid and renewable are separate activities",
  ["Grid Electricity Consumption", "Renewable Electricity"].every((n) =>
    view.byActivity.some((a) => a.metricName === n),
  ),
  view.byActivity.map((a) => a.metricName).join(", "),
);
const project = (
  await admin.query("scope.getTotal", {
    scopeCode: "SCOPE_2",
    orgUnitId: await orgId("PRJ-X"),
    periodId,
  })
).data;
check(
  "the bill is a contributing record of Project X",
  project.records.some((r) => r.documentId === documentId),
);
const original = await admin.file(`/api/documents/${documentId}/file`);
check(
  "the original bill downloads byte for byte",
  Buffer.from(await original.arrayBuffer()).equals(bytes),
);

await finish();
