// The edge cases of 06_IMPLEMENTATION_PLAN.md §6, each deliberately triggered against the running system
// (QA_CHECKLIST.md maps every row to its check here or to where else it is covered).
import {
  RUN,
  Session,
  check,
  confirm,
  currentCalculation,
  env,
  finish,
  metricId,
  ok,
  one,
  orgId,
  recordOf,
  rejected,
  runWorker,
  sample,
  section,
  setup,
  sql,
  unreadablePdf,
  upload,
  validationResults,
} from "./lib.mjs";

const { sessions } = await setup();
const { admin, pm } = sessions;
const hash = (bytes) =>
  import("node:crypto").then((c) => c.createHash("sha256").update(bytes).digest("hex"));
const prepare = async (
  bytesOrSize,
  {
    mimeType = "application/pdf",
    metric = "DIESEL_CONSUMPTION",
    acknowledgeDuplicates = true,
  } = {},
) =>
  pm.mutate("documents.prepareUpload", {
    orgUnitId: await orgId("PRJ-X"),
    metricId: await metricId(metric),
    mimeType,
    fileSize: typeof bytesOrSize === "number" ? bytesOrSize : bytesOrSize.length,
    sha256: typeof bytesOrSize === "number" ? "0".repeat(64) : await hash(bytesOrSize),
    acknowledgeDuplicates,
  });

section("Invalid file");
check(
  "a declared non-PDF/JPG/PNG type is refused before any upload",
  rejected(await prepare(1000, { mimeType: "text/plain" }), "Invalid file type"),
);
const disguised = await upload(
  pm,
  Buffer.from(`just some text ${RUN}`),
  `edge-disguised-${RUN}.pdf`,
);
check(
  "a text file renamed to .pdf is refused after its bytes are read",
  rejected(disguised.completed, "isn't a PDF, JPG or PNG"),
  disguised.completed?.error,
);

section("Oversized file");
check(
  "a file over 50 MB is refused with the limit and what to do",
  rejected(await prepare(51 * 1024 * 1024), "the limit is 50 MB"),
);

section("Corrupted file");
const truncated = sample("diesel").subarray(0, 600);
const corrupt = await upload(pm, truncated, `edge-truncated-${RUN}.pdf`);
check(
  "a truncated PDF is refused as damaged, with the fix",
  rejected(corrupt.completed, "looks damaged or incomplete"),
  corrupt.completed?.error,
);
const locked = Buffer.from(
  `%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n2 0 obj << /Filter /Standard >> endobj\ntrailer << /Root 1 0 R /Encrypt 2 0 R >>\n%%EOF ${RUN}\n`,
);
const lockedUpload = await upload(pm, locked, `edge-locked-${RUN}.pdf`);
check(
  "a password-protected PDF is refused with the fix",
  rejected(lockedUpload.completed, "password-protected"),
  lockedUpload.completed?.error,
);
check(
  "no record exists for any refused upload",
  (
    await one(
      sql`select count(*)::int as n from public.documents where file_name like ${`edge-%-${RUN}.pdf`}`,
    )
  ).n === 0,
);

section("Unreadable scan → OCR failure → manual exception");
const unreadable = await upload(pm, unreadablePdf("edge"), `edge-unreadable-${RUN}.pdf`);
await runWorker();
const job = await one(
  sql`select status, error_message from public.ocr_jobs where document_id = ${unreadable.documentId}`,
);
check(
  "the OCR job fails with a reason a person can act on",
  job?.status === "failed" && !!job.error_message,
  JSON.stringify(job),
);
check(
  "the uploader is told",
  (
    await one(sql`
  select count(*)::int as n from public.notifications n join public.users u on u.id = n.user_id
  where u.email = 'e2e.pm@traceesg.test' and n.type = 'ocr_failed' and n.related_entity_id = ${unreadable.documentId}`)
  ).n === 1,
);
let loaded = (await pm.query("verification.load", { documentId: unreadable.documentId })).data;
await pm.mutate("verification.setDocumentType", {
  documentId: unreadable.documentId,
  documentTypeId: loaded.documentTypeOptions[0].id,
});
const manual = await pm.mutate("verification.confirmManual", {
  documentId: unreadable.documentId,
  values: [
    { key: "quantity", value: "400" },
    { key: "unit", value: "Ltr" },
    { key: "invoice_number", value: `EDGE-MAN-${RUN}`.toUpperCase() },
    { key: "billing_period", value: "05-Sep-2026" },
  ],
  justification: "Scan unreadable; values read from the paper invoice.",
  acknowledgeDuplicate: true,
});
check(
  "values typed by hand with a justification are accepted — and always flagged for review",
  ok(manual) &&
    manual.data.validation === "flagged" &&
    (await validationResults((await recordOf(unreadable.documentId)).id)).includes(
      "evidence:flagged",
    ),
  JSON.stringify(manual),
);

section("Missing field, wrong document type, user edits");
const second = await upload(pm, sample("diesel"), `edge-fields-${RUN}.pdf`, {
  metric: "RENEWABLE_ELECTRICITY",
});
const fields = await upload(pm, sample("diesel"), `edge-diesel-${RUN}.pdf`);
await runWorker();
loaded = (await pm.query("verification.load", { documentId: second.documentId })).data;
check(
  "a document the classifier can't place asks for its type",
  loaded?.documentTypeId === null && loaded.documentTypeOptions.length > 0,
);
const noType = await pm.mutate("verification.confirm", {
  documentId: second.documentId,
  fields: loaded.fields.map((f) => ({
    id: f.id,
    value: f.extractedValue ?? "1",
    acknowledged: true,
  })),
  acknowledgeDuplicate: true,
});
check(
  "Confirm is refused until the type is chosen",
  rejected(noType, "document type"),
  noType.error,
);
const blank = await confirm(pm, fields.documentId, { overrides: { quantity: "" } });
check(
  "a required field left empty blocks Confirm (the screen marks the field)",
  rejected(blank, "Fix the field"),
  blank.error,
);
const negative = await confirm(pm, fields.documentId, { overrides: { quantity: "-5" } });
check("a negative quantity is refused before validation", rejected(negative), negative.error);
// A reference with no digits isn't read as an invoice number — and never replaced by a nearby date.
const noDigits = await upload(
  pm,
  sample("diesel", { reference: "NODIGITS" }),
  `edge-nodigits-${RUN}.pdf`,
);
await runWorker();
const unread = (await pm.query("verification.load", { documentId: noDigits.documentId })).data;
check(
  "a field OCR can't read is left empty, not guessed",
  unread?.fields?.find((f) => f.key === "invoice_number")?.extractedValue === null,
  JSON.stringify(unread?.fields?.map((f) => [f.key, f.extractedValue])),
);
check(
  "Confirm waits until the person fills it",
  rejected(await confirm(pm, noDigits.documentId), "Fix the field"),
);
check(
  "filled in by hand, it confirms",
  ok(
    await confirm(pm, noDigits.documentId, {
      overrides: { invoice_number: `NODIGITS-${RUN}-1`.toUpperCase() },
    }),
  ),
);

section("Duplicate document");
const again = sample("diesel", { reference: `EDGE-DUP-${RUN}-1`.toUpperCase() });
await upload(pm, again, `edge-dup-a-${RUN}.pdf`);
const warn = await prepare(again, { acknowledgeDuplicates: false });
check(
  "the same file again asks for acknowledgement, naming the duplicate",
  ok(warn) && warn.data.status === "confirm" && warn.data.warnings.sameFile,
  JSON.stringify(warn.data),
);
const dup = await upload(pm, again, `edge-dup-b-${RUN}.pdf`);
check(
  "acknowledged, it goes through and its record is marked a duplicate",
  ok(dup.completed) && (await recordOf(dup.documentId)).is_duplicate_flag === true,
);

section("Duplicate invoice, invalid unit, invalid date");
await runWorker();
const firstOfPair = await confirm(
  pm,
  (await one(sql`select id from public.documents where file_name = ${`edge-dup-a-${RUN}.pdf`}`)).id,
);
check("(the first of the pair is confirmed)", ok(firstOfPair), firstOfPair.error);
const dupInvoice = await confirm(pm, dup.documentId);
check(
  "the same invoice number twice is flagged, not failed",
  ok(dupInvoice) &&
    dupInvoice.data.validation === "flagged" &&
    (await recordOf(dup.documentId)).is_duplicate_flag === true,
  JSON.stringify(dupInvoice),
);
const wrongUnit = await confirm(pm, fields.documentId, {
  overrides: { unit: "kg", invoice_number: `EDGE-UNIT-${RUN}`.toUpperCase() },
});
check(
  "a unit the metric doesn't accept fails validation",
  ok(wrongUnit) && wrongUnit.data.validation === "failed",
  JSON.stringify(wrongUnit),
);
check(
  "and is returned to the submitter with the reason",
  (await recordOf(fields.documentId)).validation_status === "failed" &&
    (
      await one(
        sql`select count(*)::int as n from public.notifications where related_entity_id = ${(await recordOf(fields.documentId)).id} and type = 'returned'`,
      )
    ).n >= 1,
);
const outside = await confirm(pm, fields.documentId, {
  overrides: {
    unit: "Ltr",
    billing_period: "05-Aug-2026",
    invoice_number: `EDGE-DATE-${RUN}`.toUpperCase(),
  },
});
check(
  "a billing date outside the reporting period fails the period check",
  ok(outside) &&
    outside.data.validation === "failed" &&
    (await validationResults((await recordOf(fields.documentId)).id)).includes("period:fail"),
);
const unreadableDate = await confirm(pm, fields.documentId, {
  overrides: {
    unit: "Ltr",
    billing_period: "sometime soon",
    invoice_number: `EDGE-DATE2-${RUN}`.toUpperCase(),
  },
});
check(
  "a date that can't be read is flagged for a person to check",
  ok(unreadableDate) && unreadableDate.data.validation === "flagged",
  JSON.stringify(unreadableDate),
);

section("Duplicate reporting period");
const period = await one(
  sql`select label, start_date, end_date from public.reporting_periods where status = 'open' limit 1`,
);
const iso = (d) => d.toISOString().slice(0, 10);
check(
  "a second period with the same label is refused",
  rejected(
    await admin.mutate("reportingPeriods.create", {
      label: period.label,
      periodType: "monthly",
      startDate: iso(period.start_date),
      endDate: iso(period.end_date),
    }),
  ),
);

section("Anomalous quantity (flagged against the project's own history, never rejected)");
// History: three closed months at a site of its own, value 100 each (fixture rows — closed periods take no uploads).
const site = await orgId("E2E-ANOM");
if (!site) {
  await admin.mutate("organization.create", {
    parentId: await orgId("PRJ-X"),
    unitType: "site",
    name: "E2E Anomaly Site",
    code: "E2E-ANOM",
  });
}
const anomSite = await orgId("E2E-ANOM");
const pmId = (await one(sql`select id from public.users where email = 'e2e.pm@traceesg.test'`)).id;
for (const [label, start, end] of [
  ["June 2026", "2026-06-01", "2026-06-30"],
  ["July 2026", "2026-07-01", "2026-07-31"],
  ["August 2026", "2026-08-01", "2026-08-31"],
]) {
  await sql`insert into public.reporting_periods (label, period_type, start_date, end_date, status, opened_at, closed_at)
            values (${label}, 'monthly', ${start}, ${end}, 'closed', now(), now()) on conflict (label) do nothing`;
}
await sql`
  insert into public.esg_records (org_unit_id, reporting_period_id, metric_id, scope_id, submitted_by, verification_status,
    validation_status, data_quality_state, activity_value_verified, activity_unit, calculation_status)
  select ${anomSite}, p.id, m.id, m.scope_id, ${pmId}, 'user_verified', 'validated', 'validated', 100, 'L', 'pending'
  from public.reporting_periods p, public.esg_metrics m
  where p.label in ('June 2026', 'July 2026', 'August 2026') and m.code = 'DIESEL_CONSUMPTION'
    and not exists (select 1 from public.esg_records r where r.org_unit_id = ${anomSite} and r.reporting_period_id = p.id)`;
const spike = await upload(pm, sample("diesel"), `edge-anomaly-${RUN}.pdf`, {
  orgCode: "E2E-ANOM",
});
await runWorker();
const anomaly = await confirm(pm, spike.documentId, { overrides: { quantity: "1250" } });
check(
  "1,250 L against a usual 100 L is flagged for review, not rejected",
  ok(anomaly) &&
    anomaly.data.validation === "flagged" &&
    (await validationResults((await recordOf(spike.documentId)).id)).includes("anomaly:flagged"),
  JSON.stringify(anomaly),
);

section("Missing conversion factor / calculation failure");
// Purchased steam has no factor by design (the supplier's own figure is the factor), so it stays a standing
// example of a missing one. The waste certificate sample is a quantity in kilograms, which steam accepts.
const petrolFactor = await one(
  sql`select id from public.conversion_factors where activity_type = 'PURCHASED_STEAM'`,
);
check("(precondition) Purchased steam has no conversion factor configured", !petrolFactor);
const petrol = await upload(
  pm,
  sample("waste", { period: "15-Sep-2026" }),
  `edge-steam-${RUN}.pdf`,
  {
    metric: "PURCHASED_STEAM",
  },
);
await runWorker();
const petrolConfirm = await confirm(pm, petrol.documentId);
const petrolRecord = await recordOf(petrol.documentId);
check(
  "the record still reaches the approval queue",
  ok(petrolConfirm) && petrolRecord.approval_status === "review_pending",
  JSON.stringify(petrolConfirm),
);
check(
  "with no number invented",
  !(await currentCalculation(petrolRecord.id)) && petrolRecord.calculation_status !== "calculated",
);
check(
  "the reason is recorded",
  (
    await one(sql`
  select count(*)::int as n from public.audit_logs where event_type = 'calculation.blocked' and entity_id = ${petrolRecord.id}`)
  ).n >= 1,
);
check(
  "Admins are told, with a link to Conversion Factors",
  (
    await one(sql`
  select count(*)::int as n from public.notifications where type = 'calculation_blocked' and related_entity_id = ${petrolRecord.id}
    and deep_link_path = '/admin/conversion-factors'`)
  ).n >= 1,
);
check(
  "and it cannot be approved until it has a number",
  rejected(
    await admin.mutate("approvals.decide", { recordId: petrolRecord.id, decision: "approve" }),
    "no calculation yet",
  ),
);

section("Expired session");
// A session cookie that no longer holds a valid session (each check gets its own: the first response clears it).
const staleSession = () => {
  const s = new Session();
  s.jar.set(
    `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`,
    "base64-e30",
  );
  return s;
};
const expired = await staleSession().query("documents.uploadOptions");
check(
  "a request with a dead session cookie is refused with the expired-session message",
  expired.status === 401 && /session expired/i.test(expired.error ?? ""),
  `${expired.status} ${expired.error}`,
);
const page = await staleSession().get("/app/submissions");
check(
  "a page sends the user to sign in, saying why and where they were",
  page.location?.includes("/login") &&
    page.location.includes("reason=expired") &&
    page.location.includes("next="),
  page.location,
);

await finish();
