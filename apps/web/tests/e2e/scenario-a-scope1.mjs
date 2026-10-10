// Scenario A (06_IMPLEMENTATION_PLAN.md §4): a Project Manager uploads a diesel invoice → OCR → verify →
// validate → calculate with the applicable factor → approve → the Admin drills the Scope 1 total down to
// the original invoice.
import { createHash } from "node:crypto";
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
  rejected,
  runWorker,
  sample,
  section,
  setup,
  sql,
  upload,
} from "./lib.mjs";

const { sessions } = await setup();
const { admin, pm, approver } = sessions;
const periodId = await openPeriodId();
const totalOf = (view) =>
  view?.node?.totals?.find((t) => t.unit === "kgCO2e") ?? { approved: 0, awaitingApproval: 0 };

section("1–2. The PM signs in to their project");
check("the PM's dashboard shows their project", (await pm.get("/app")).html.includes("Project X"));

section("3–4. Upload a diesel invoice; OCR extracts it");
const before = totalOf(
  (await admin.query("scope.getTotal", { scopeCode: "SCOPE_1", periodId })).data,
);
const invoice = `A-${RUN}-1`.toUpperCase(); // real invoice numbers carry digits
const bytes = sample("diesel", { reference: invoice });
const { documentId, completed } = await upload(pm, bytes, `scenario-a-${RUN}.pdf`);
check(
  "the invoice is accepted and queued for OCR",
  ok(completed) && !!documentId,
  completed?.error,
);
await runWorker();
const loaded = (await pm.query("verification.load", { documentId })).data;
const value = (key) => loaded?.fields?.find((f) => f.key === key)?.extractedValue;
check(
  "OCR read the quantity, unit, billing period and invoice number (diesel is the activity itself)",
  !!value("quantity") &&
    !!value("unit") &&
    !!value("billing_period") &&
    value("invoice_number") === invoice,
  JSON.stringify(loaded?.fields?.map((f) => [f.key, f.extractedValue])),
);

section("5–6. The PM verifies (editing a value) and validation passes");
const confirmed = await confirm(pm, documentId, { overrides: { quantity: "500" } });
check(
  "Confirm validates the record",
  ok(confirmed) && confirmed.data.validation === "validated",
  JSON.stringify(confirmed),
);
const record = await recordOf(documentId);
const edited = await one(sql`
  select f.extracted_value, f.verified_value, f.verification_status from public.ocr_fields f
  join public.ocr_extractions e on e.id = f.ocr_extraction_id
  where e.document_id = ${documentId} and f.field_key = 'quantity'`);
check(
  "the edit keeps the OCR value beside the verified one",
  edited?.verified_value === "500" &&
    edited?.verification_status === "edited" &&
    edited.extracted_value !== "500",
  JSON.stringify(edited),
);

section("Several evidence files for one record (audit fix P2)");
/** Adds a supporting file the way the screen does: prepare, PUT the bytes, complete. */
async function attach(who, bytes, fileName) {
  const prepared = await who.mutate("documents.prepareSupporting", {
    recordId: record.id,
    mimeType: "application/pdf",
    fileSize: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  if (!ok(prepared)) return prepared;
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new Blob([bytes], { type: "application/pdf" }), "upload");
  await fetch(prepared.data.signedUrl, {
    method: "PUT",
    body: form,
    headers: { "x-upsert": "false" },
  });
  return who.mutate("documents.completeSupporting", {
    recordId: record.id,
    documentId: prepared.data.documentId,
    mimeType: "application/pdf",
    fileName,
  });
}
const supporting = sample("diesel", { reference: `A-${RUN}-2`.toUpperCase() });
const attached = await attach(pm, supporting, `scenario-a-supporting-${RUN}.pdf`);
check("the PM adds a supporting file to the record", ok(attached), attached.error);
const listed = (await pm.query("documents.recordEvidence", { recordId: record.id })).data;
check(
  "the record lists both files, the original first, and is still open for more",
  listed?.files.length === 2 &&
    listed.files[0].isPrimary &&
    listed.files[0].documentId === documentId &&
    !listed.files[1].isPrimary &&
    listed.canAdd,
  JSON.stringify(listed),
);
check(
  "the supporting file opens for someone in scope and is not read by OCR",
  (await approver.file(`/api/documents/${attached.data?.documentId}/file`)).status === 200 &&
    !(await one(
      sql`select 1 from public.ocr_jobs where document_id = ${attached.data?.documentId ?? null}`,
    )),
);
check(
  "the same file cannot be attached twice",
  rejected(await attach(pm, supporting, "again.pdf"), "already attached"),
);
check(
  "someone whose role does not own the activity cannot add evidence to it",
  rejected(
    await attach(
      sessions.hr,
      sample("diesel", { reference: `A-${RUN}-3`.toUpperCase() }),
      "hr.pdf",
    ),
  ),
);
check(
  "adding it is audited on the record, and the record's value did not change",
  !!(await one(
    sql`select 1 from public.audit_logs where entity_id = ${record.id} and event_type = 'document.attached'`,
  )) && Number((await recordOf(documentId)).activity_value_verified) === 500,
);

section("7–8. The engine applies the factor effective for the period");
const calc = await currentCalculation(record.id);
const factor = await one(sql`
  select v.value::float as value from public.conversion_factor_versions v where v.id = ${calc?.conversion_factor_version_id}`);
check(
  "the calculation used the factor version stored with it",
  !!calc && close(Number(calc.factor_value_snapshot), factor?.value),
);
check(
  "500 L × factor = the stored result",
  close(Number(calc?.result_value), 500 * factor?.value),
  `${calc?.result_value}`,
);
check("the record waits for approval", record.approval_status === "review_pending");

section("Approval — nobody approves their own record");
check(
  "the PM cannot approve",
  rejected(await pm.mutate("approvals.decide", { recordId: record.id, decision: "approve" })),
);
check(
  "the approver in scope approves",
  ok(await approver.mutate("approvals.decide", { recordId: record.id, decision: "approve" })),
);

section("9. The Admin sees the result");
const view = (await admin.query("scope.getTotal", { scopeCode: "SCOPE_1", periodId })).data;
check(
  "the approved Scope 1 total moved by exactly this record",
  close(totalOf(view).approved, before.approved + Number(calc.result_value)),
  `${before.approved} + ${calc.result_value} vs ${totalOf(view).approved}`,
);
const monitored = (await admin.query("records.search", { periodId })).data?.rows?.find(
  (r) => r.recordId === record.id,
);
check(
  "Submission Monitoring lists it as approved",
  monitored?.approvalStatus === "approved",
  JSON.stringify(monitored),
);

section("10–11. Drill down from the total to the original invoice");
const group = view.path[0];
check("the drill-down starts at the group", view.path.length === 1 && group.name === "MEIL");
const subsidiary = view.children.find((c) => c.name === "Subsidiary A");
check("Subsidiary A carries its subtree total", !!subsidiary && subsidiary.totals.length > 0);
const project = (
  await admin.query("scope.getTotal", {
    scopeCode: "SCOPE_1",
    orgUnitId: await orgId("PRJ-X"),
    periodId,
  })
).data;
check(
  "the breadcrumb reads MEIL › Subsidiary A › Project X",
  project.path.map((p) => p.name).join(" › ") === "MEIL › Subsidiary A › Project X",
  project.path.map((p) => p.name).join(" › "),
);
const row = project.records.find((r) => r.recordId === record.id);
check(
  "the record is listed with its result and document",
  close(row?.resultValue, Number(calc.result_value)) && row?.documentId === documentId,
);
const trace = (await admin.query("scope.recordTrace", { recordId: record.id })).data;
check("its calculation trace opens", close(trace?.trace?.resultValue, Number(calc.result_value)));
const original = await admin.file(`/api/documents/${documentId}/file`);
check(
  "the original invoice downloads byte for byte",
  original.status === 200 && Buffer.from(await original.arrayBuffer()).equals(bytes),
);

section("Audit fixes P2: the trail, the stored calculation and the evidence hold up");
const trail = await sql`
  select event_type, user_id, user_agent, session_id from public.audit_logs
  where entity_id = ${record.id} order by created_at`;
const at = (event) => trail.findIndex((e) => e.event_type === event);
check(
  "the trail reads in the order things happened: validated, calculated, then queued for approval",
  at("validation.completed") >= 0 &&
    at("validation.completed") < at("calculation.completed") &&
    at("calculation.completed") < at("approval.submitted"),
  trail.map((e) => e.event_type).join(" → "),
);
const personal = trail.filter((e) => e.user_id);
check(
  "an action by a person records their browser and sign-in session; system steps record neither",
  personal.length > 0 &&
    personal.every((e) => e.user_agent && e.session_id) &&
    trail.filter((e) => !e.user_id).every((e) => !e.user_agent && !e.session_id),
  JSON.stringify(trail),
);
let deleted = "nothing stopped it";
try {
  await sql`delete from public.calculations where id = ${calc.id}`;
} catch (error) {
  deleted = error.message;
}
check(
  "the stored calculation cannot be deleted, even by the server",
  /append-only/.test(deleted),
  deleted,
);
check(
  "once approved, the record's evidence is closed",
  rejected(
    await pm.mutate("documents.prepareSupporting", {
      recordId: record.id,
      mimeType: "application/pdf",
      fileSize: 10,
      sha256: "a".repeat(64),
    }),
    "approved",
  ) && (await pm.query("documents.recordEvidence", { recordId: record.id })).data?.canAdd === false,
);
const evidence = `/api/documents/${documentId}/file`;
const headers = (await admin.file(evidence)).headers;
const pageHeaders = (await admin.file("/login")).headers;
check(
  "every response carries the security headers; a page cannot be framed",
  [headers, pageHeaders].every(
    (h) =>
      h.get("x-frame-options") === "DENY" &&
      h.get("x-content-type-options") === "nosniff" &&
      /max-age=\d+/.test(h.get("strict-transport-security") ?? ""),
  ) && /frame-ancestors 'none'/.test(pageHeaders.get("content-security-policy") ?? ""),
  pageHeaders.get("content-security-policy") ?? "no policy",
);
check(
  "and the evidence route keeps its own stricter sandbox policy",
  /^sandbox/.test(headers.get("content-security-policy") ?? ""),
  headers.get("content-security-policy") ?? "no policy",
);
const [{ file_hash: fingerprint }] = await sql`
  select file_hash from public.documents where id = ${documentId}`;
await sql`update public.documents set file_hash = ${"0".repeat(64)} where id = ${documentId}`;
try {
  check(
    "evidence whose bytes no longer match the recorded fingerprint is refused",
    (await admin.file(evidence)).status === 409,
  );
} finally {
  await sql`update public.documents set file_hash = ${fingerprint} where id = ${documentId}`;
}
check("and served again once it matches", (await admin.file(evidence)).status === 200);

await finish();
