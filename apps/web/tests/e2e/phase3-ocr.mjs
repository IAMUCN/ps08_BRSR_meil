// Phase 3 of feature_enhancement.md through the real OCR worker (rules-14): the electricity bill number,
// page sizes and field source boxes for the grid, a document that looks like another activity's, the reason a
// billing period was not read, and OCR Monitoring folded into Submission Monitoring. Local stack only; run
// with E2E_WORKER_IMAGE set to a rules-14 image.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RUN,
  Session,
  check,
  confirm,
  ensureInvited,
  finish,
  ok,
  one,
  orgId,
  recordOf,
  runWorker,
  sample,
  section,
  setup,
  sql,
  unreadablePdf,
  upload,
} from "./lib.mjs";

const { sessions } = await setup();
const { admin, pm } = sessions;
const unitAdmin = await ensureInvited(admin, {
  email: "e2e.prjx.admin@traceesg.test",
  role: "org_admin",
  org: "PRJ-X",
  name: "E2E Project X Administrator",
});
const administrator = new Session();
await administrator.login(unitAdmin, { takeover: true });
const extractionOf = async (documentId) =>
  (
    await one(sql`
      select raw_output from public.ocr_extractions where document_id = ${documentId}
      order by extracted_at desc limit 1`)
  )?.raw_output;

// ============================================================================================================
section("An electricity bill: its bill number, page sizes and where each field was read");
// ============================================================================================================
const billNo = `EB-${RUN}`.toUpperCase();
const bill = await upload(
  pm,
  sample("electricity", { reference: billNo, period: "01-Sep-2026 to 30-Sep-2026" }),
  `p3-bill-${RUN}.pdf`,
  { metric: "GRID_ELECTRICITY" },
);
await runWorker();
const raw = await extractionOf(bill.documentId);
check(
  "the worker ran rules-14",
  /rules-14$/.test(
    (
      await one(
        sql`select model_version from public.ocr_jobs where document_id = ${bill.documentId}`,
      )
    )?.model_version ?? "",
  ),
);
check(
  "it records the size of each page image the boxes are measured on",
  Array.isArray(raw?.page_sizes) && raw.page_sizes[0]?.length === 2 && raw.page_sizes[0][0] > 0,
);
const sources = (await pm.query("verification.sources", { documentId: bill.documentId })).data;
check(
  "the grid gets a box for the values it read",
  (sources?.boxes?.consumption?.length ?? 0) > 0 && sources.boxes.consumption[0].box.length === 4,
);
check("and the page sizes", JSON.stringify(sources?.pageSizes) === JSON.stringify(raw?.page_sizes));
const loaded = (await pm.query("verification.load", { documentId: bill.documentId })).data;
check(
  "an electricity bill is now asked for its bill number, and OCR reads it",
  loaded?.fields?.find((f) => f.key === "invoice_number")?.extractedValue === billNo,
);
check("the right activity is not reported as a mismatch", raw?.classification?.mismatch === null);
check("the uploader confirms it", ok(await confirm(pm, bill.documentId)));
check(
  "the bill number is kept on the record",
  (await recordOf(bill.documentId)).bill_number === billNo,
);

// ============================================================================================================
section("An electricity bill uploaded as diesel is flagged");
// ============================================================================================================
const wrong = await upload(
  pm,
  sample("electricity", {
    reference: `EBW-${RUN}`.toUpperCase(),
    period: "01-Sep-2026 to 30-Sep-2026",
  }),
  `p3-wrong-${RUN}.pdf`,
  { metric: "DIESEL_CONSUMPTION" },
);
await runWorker();
const wrongRaw = await extractionOf(wrong.documentId);
check(
  "OCR reports it looks like an electricity bill",
  wrongRaw?.classification?.mismatch?.document_type === "ELECTRICITY_BILL",
  JSON.stringify(wrongRaw?.classification),
);
await confirm(pm, wrong.documentId, {
  overrides: {
    quantity: "100",
    unit: "L",
    invoice_number: `EBW-${RUN}`,
    billing_period: "01-Sep-2026 to 30-Sep-2026",
  },
  acknowledge: ["quantity", "unit", "invoice_number", "billing_period"],
});
const wrongRecord = await recordOf(wrong.documentId);
const wrongResults = await sql`
  select message from public.validation_results
  where esg_record_id = ${wrongRecord.id} and result <> 'pass'`;
check(
  "validation flags it for the Validation Queue, naming the type and its activity",
  wrongRecord.validation_status === "flagged" &&
    wrongResults.some((r) =>
      /looks like an electricity bill \(used for .*Grid Electricity.*\), suggested by OCR, but it was uploaded as Diesel/.test(
        r.message,
      ),
    ),
  wrongResults.map((r) => r.message).join(" | "),
);

// ============================================================================================================
section("A document with almost no readable text says why the billing period is missing");
// ============================================================================================================
// A small image with three words and no period: OCR reads it, the period is not there.
const dir = mkdtempSync(join(tmpdir(), "p3-"));
const png = join(dir, "few.png");
execFileSync(process.env.E2E_PYTHON, [
  "-c",
  `from PIL import Image, ImageDraw, ImageFont
img = Image.new("RGB", (900, 400), "white")
d = ImageDraw.Draw(img)
try:
    f = ImageFont.truetype("arial.ttf", 48)
except OSError:
    f = ImageFont.load_default()
d.text((40, 60), "ELECTRICITY", fill="black", font=f)
d.text((40, 160), "Sample Power Co", fill="black", font=f)
img.save(r"${png.replace(/\\/g, "\\\\")}")`,
]);
const fewBytes = readFileSync(png);
rmSync(dir, { recursive: true, force: true });
const few = await upload(pm, fewBytes, `p3-few-${RUN}.png`, {
  metric: "GRID_ELECTRICITY",
  mimeType: "image/png",
});
await runWorker();
const fewSources = (await pm.query("verification.sources", { documentId: few.documentId })).data;
check(
  "the reason asks for a better photo",
  /Only \d+ lines of text could be read/.test(fewSources?.diagnostics?.billing_period ?? ""),
  JSON.stringify(fewSources?.diagnostics),
);

// ============================================================================================================
section("OCR Monitoring folded into Submission Monitoring");
// ============================================================================================================
const failedUpload = await upload(pm, unreadablePdf("p3"), `p3-unreadable-${RUN}.pdf`, {
  metric: "DIESEL_CONSUMPTION",
});
await runWorker();
const meil = await orgId("MEIL");
const failedSearch = await admin.query("records.search", { orgUnitId: meil, ocr: "failed" });
const failedRow = failedSearch.data?.rows?.find((r) => r.documentId === failedUpload.documentId);
check("the OCR filter finds the failed read", Boolean(failedRow), failedSearch.error);
check(
  "with its state and reason",
  failedRow?.ocrState === "failed" && Boolean(failedRow?.ocrError),
);
check(
  "every row of that filter is a failed read",
  (failedSearch.data?.rows ?? []).every((r) => r.ocrState === "failed"),
);
const readRow = (
  await admin.query("records.search", { orgUnitId: meil, text: billNo })
).data?.rows?.find((r) => r.documentId === bill.documentId);
check(
  "a read bill shows as read or needing attention",
  ["read", "attention"].includes(readRow?.ocrState),
);
check(
  "the search carries the oldest waiting document for the stalled-worker warning",
  "oldestPendingSince" in (failedSearch.data ?? {}),
);

const failedRecord = await recordOf(failedUpload.documentId);
const detail = (await admin.query("records.detail", { recordId: failedRecord.id })).data;
check(
  "the record panel shows the OCR job and its error",
  detail?.ocr?.status === "failed" && Boolean(detail.ocr.error),
);
check(
  "a Project Manager cannot retry a read",
  (await pm.mutate("ocr.retry", { jobId: detail.ocr.jobId })).status === 403,
);
const retried = await administrator.mutate("ocr.retry", { jobId: detail.ocr.jobId });
check("the unit's Administrator can, inside their unit", ok(retried), retried.error);
check(
  "the job is queued again",
  (await one(sql`select status::text as s from public.ocr_jobs where id = ${detail.ocr.jobId}`))
    ?.s === "pending",
);
const billDetail = (
  await admin.query("records.detail", { recordId: (await recordOf(bill.documentId)).id })
).data;
check(
  "the panel shows each value's confidence",
  Object.values(billDetail?.confidences ?? {}).some((c) => typeof c === "number"),
);
const oldPage = await administrator.get("/admin/ocr-monitoring");
check(
  "the old OCR Monitoring address opens Submission Monitoring's OCR filter",
  /\/admin\/submissions\?ocr=attention/.test(oldPage.location ?? "") ||
    oldPage.html.includes("NEXT_REDIRECT;replace;/admin/submissions?ocr=attention"),
);

// The retried unreadable PDF fails again in the next pass; nothing else is left waiting.
await runWorker();
await finish();
