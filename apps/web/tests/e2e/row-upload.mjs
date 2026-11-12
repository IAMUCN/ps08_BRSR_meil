// Upload by rows, typed values checked against the document (migration 0077, .grill/row-upload-decisions.md).
// Through the real procedures and the worker image: what is typed is stored with the upload; bills that pair
// cleanly are recorded at once; Verify shows each typed value against the reading; validation flags a typed
// value kept against the document; a typed total is checked against its bills; travel is distance x
// passengers; a file with more bills than were typed waits for the person; drafts are kept per person.
import { createHash } from "node:crypto";
import {
  RUN,
  approveSyntheticFactor,
  check,
  finish,
  metricId,
  ok,
  one,
  openPeriodId,
  orgId,
  rejected,
  runWorker,
  sample,
  sampleBundle,
  section,
  setup,
  sql,
} from "./lib.mjs";

const PDF = "application/pdf";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

const { sessions } = await setup();
const { admin, pm } = sessions;
const orgUnitId = await orgId("PRJ-X");
const periodId = await openPeriodId();
const period = await one(
  sql`select start_date::text as start from public.reporting_periods where id = ${periodId}`,
);
const DIESEL = await metricId("DIESEL_CONSUMPTION");
const ELECTRICITY = await metricId("GRID_ELECTRICITY");
const AIR = await metricId("BUSINESS_TRAVEL_AIR");

/** The Upload page's flow for one row: prepare, PUT each file, complete with what was typed. */
async function uploadRow(who, files, declarations) {
  const prepared = await who.mutate("bundles.prepareUpload", {
    orgUnitId,
    reportingPeriodId: periodId,
    files: files.map((f) => ({ fileSize: f.bytes.length, sha256: sha(f.bytes), mimeType: PDF })),
    acknowledgeDuplicates: true,
  });
  if (!ok(prepared) || prepared.data?.status !== "ready") return { prepared };
  for (const [i, f] of files.entries()) {
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", new Blob([f.bytes], { type: PDF }), "upload");
    await fetch(prepared.data.uploads[i].signedUrl, {
      method: "PUT",
      body: form,
      headers: { "x-upsert": "false" },
    });
  }
  const completed = await who.mutate("bundles.completeUpload", {
    orgUnitId,
    documentId: prepared.data.documentId,
    reportingPeriodId: prepared.data.reportingPeriodId,
    sources: prepared.data.uploads.map((u, i) => ({
      id: u.sourceId,
      fileName: files[i].name,
      mimeType: PDF,
    })),
    acknowledgeDuplicates: true,
    declarations,
  });
  return { prepared, completed, documentId: ok(completed) ? prepared.data.documentId : undefined };
}

const dieselFile = (name) => ({ bytes: sample("diesel"), name }); // reads 1250.00 Ltr
const typedDiesel = (quantity, mode = "bill", unit = "L") => ({
  metricId: DIESEL,
  reportingPeriodId: periodId,
  mode,
  values: { quantity, unit },
});

/** Reads the upload, records it if it pairs with what was typed, reads the bills it became. */
async function readAndRecord(who, documentId) {
  await runWorker();
  const outcome = await who.mutate("bundles.autoConfirm", { documentId });
  await runWorker();
  const status = await who.query("bundles.rowStatus", { documentIds: [documentId] });
  return { outcome, documents: status.data?.[0]?.documents ?? [] };
}

const load = async (who, documentId) => (await who.query("verification.load", { documentId })).data;
const field = (doc, key) => doc?.fields.find((f) => f.key === key);
const typedResult = async (recordId) =>
  one(sql`
    select vr.result::text as result, vr.message from public.validation_results vr
    where vr.esg_record_id = ${recordId}
      and vr.evaluated_at = (select max(evaluated_at) from public.validation_results
                             where esg_record_id = ${recordId})
      and (vr.message like '%typed at upload%' or vr.message like '%total typed%')
    order by vr.result desc limit 1`);
const recordOfDocument = async (documentId) =>
  one(sql`select r.id, r.upload_declaration_id, r.activity_value_verified::float as value,
                 r.validation_status::text as validation
          from public.esg_records r
          join public.esg_record_documents e on e.esg_record_id = r.id and e.is_primary
          where e.document_id = ${documentId}`);

/** Confirm on Verify, choosing a document type when OCR could not. */
async function confirm(who, documentId, { overrides = {}, acknowledge = [] } = {}) {
  let doc = await load(who, documentId);
  if (!doc.documentTypeId && doc.documentTypeOptions?.length) {
    await who.mutate("verification.setDocumentType", {
      documentId,
      documentTypeId: doc.documentTypeOptions[0].id,
    });
    doc = await load(who, documentId);
  }
  return who.mutate("verification.confirm", {
    documentId,
    fields: doc.fields.map((f) => ({
      id: f.id,
      value: overrides[f.key] ?? f.extractedValue ?? f.typed?.value ?? "",
      acknowledged: acknowledge.includes(f.key),
    })),
    acknowledgeDuplicate: true,
  });
}

// ---------------------------------------------------------------------------------------------------------
section("What a row types is checked before anything is stored");
{
  const refuse = async (declarations, includes, what) => {
    const r = await uploadRow(pm, [dieselFile(`refused-${RUN}.pdf`)], declarations);
    check(what, rejected(r.completed, includes), r.completed?.error ?? r.prepared?.error);
  };
  await refuse(
    [{ ...typedDiesel(""), values: { unit: "L" } }],
    "Type the quantity",
    "a row without its value is refused",
  );
  await refuse(
    [typedDiesel("850", "bill", "kg")],
    "choose the unit",
    "a unit the activity does not allow is refused",
  );
  await refuse([typedDiesel("abc")], "enter a number", "a value that is not a number is refused");
  await refuse(
    [typedDiesel("850", "total"), typedDiesel("900", "total")],
    "each typed on their own row",
    "a total cannot be split over several rows",
  );
  await refuse(
    [
      {
        metricId: AIR,
        reportingPeriodId: periodId,
        mode: "bill",
        values: { distance: "1", passengers: "1", unit: "km" },
      },
    ],
    "can't record that bill type",
    "a bill type outside the person's role is refused",
  );
  const before = await one(sql`select count(*)::int as n from public.upload_declarations`);
  check("nothing was stored for the refused rows", before.n >= 0);
}

// ---------------------------------------------------------------------------------------------------------
section("A typed value that matches the document");
let matchedRecord;
{
  const r = await uploadRow(pm, [dieselFile(`match-${RUN}.pdf`)], [typedDiesel("1,250")]);
  check("the row is uploaded with what was typed", ok(r.completed), r.completed?.error);
  const stored = await one(
    sql`select mode, declared_values from public.upload_declarations where bundle_document_id = ${r.documentId}`,
  );
  check(
    "the typed values are stored as typed, unit in its allowed spelling",
    stored?.mode === "bill" &&
      stored.declared_values.quantity === "1,250" &&
      stored.declared_values.unit === "L",
    JSON.stringify(stored),
  );
  const { outcome, documents } = await readAndRecord(pm, r.documentId);
  check(
    "one bill pairs with one row: recorded at once",
    outcome.data?.status === "recorded",
    JSON.stringify(outcome),
  );
  check("the row now lists its bill", documents.length === 1);
  const doc = await load(pm, documents[0].documentId);
  const quantity = field(doc, "quantity");
  check(
    "Verify shows the typed value as matching",
    quantity?.typed?.status === "match",
    JSON.stringify(quantity?.typed),
  );
  const confirmed = await confirm(pm, documents[0].documentId);
  check("it confirms without anything to settle", ok(confirmed), confirmed.error);
  matchedRecord = await recordOfDocument(documents[0].documentId);
  check("the record points at what was typed", !!matchedRecord.upload_declaration_id);
  const verdict = await typedResult(matchedRecord.id);
  check("validation: the typed values agree", verdict?.result === "pass", JSON.stringify(verdict));
}

// ---------------------------------------------------------------------------------------------------------
section("A typed value the document disagrees with");
{
  const r = await uploadRow(pm, [dieselFile(`mismatch-${RUN}.pdf`)], [typedDiesel("12500")]);
  const { documents } = await readAndRecord(pm, r.documentId);
  const id = documents[0]?.documentId;
  const doc = await load(pm, id);
  check("Verify flags the difference", field(doc, "quantity")?.typed?.status === "mismatch");
  const blocked = await confirm(pm, id);
  check("Confirm is refused until the person chooses", rejected(blocked, "Review"), blocked.error);
  const took = await confirm(pm, id, { acknowledge: ["quantity"] });
  check("taking the document's value confirms", ok(took), took.error);
  const verdict = await typedResult((await recordOfDocument(id)).id);
  check(
    "and is not flagged (the typing was corrected)",
    verdict?.result === "pass",
    JSON.stringify(verdict),
  );
}
{
  const r = await uploadRow(pm, [dieselFile(`kept-${RUN}.pdf`)], [typedDiesel("1410")]);
  const { documents } = await readAndRecord(pm, r.documentId);
  const id = documents[0]?.documentId;
  const kept = await confirm(pm, id, {
    overrides: { quantity: "1410" },
    acknowledge: ["quantity"],
  });
  check("keeping the typed value confirms", ok(kept), kept.error);
  const record = await recordOfDocument(id);
  const verdict = await typedResult(record.id);
  check(
    "but is flagged for review, naming both values",
    verdict?.result === "flagged" &&
      /1410 L was typed at upload and kept, but the document reads 1250/.test(verdict.message),
    JSON.stringify(verdict),
  );
  check(
    "the record waits in the Validation Queue",
    record.validation === "flagged",
    record.validation,
  );
}

// ---------------------------------------------------------------------------------------------------------
section("Travel: distance x passengers");
{
  // A labelled synthetic factor so the trace can be checked (never a real value).
  const exists = await one(
    sql`select id from public.conversion_factors where activity_type = 'BUSINESS_TRAVEL_AIR'`,
  );
  if (!exists) {
    const created = await admin.mutate("factors.create", {
      activityType: "BUSINESS_TRAVEL_AIR",
      name: "Air travel (synthetic, tests/e2e)",
      value: 0.15,
      inputUnit: "km",
      outputUnit: "kgCO2e",
      sourceReference: "SYNTHETIC TEST VALUE — apps/web/tests/e2e, not an authoritative factor",
      effectiveFrom: "2026-01-01",
    });
    if (ok(created)) await approveSyntheticFactor(admin, created.data.versionId);
  }
  const date = new Date(`${period.start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 4);
  const travelDate = date
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
    .replace(/ /g, "-");
  const ticket = { bytes: sample("air_ticket", { period: travelDate }), name: `ticket-${RUN}.pdf` };
  const r = await uploadRow(
    admin,
    [ticket],
    [
      {
        metricId: AIR,
        reportingPeriodId: periodId,
        mode: "bill",
        values: { distance: "1150", passengers: "6", unit: "km" },
      },
    ],
  );
  check(
    "an Administrator uploads the ticket with distance and passengers",
    ok(r.completed),
    r.completed?.error,
  );
  const { outcome, documents } = await readAndRecord(admin, r.documentId);
  check("recorded at once", outcome.data?.status === "recorded", JSON.stringify(outcome));
  const id = documents[0]?.documentId;
  const doc = await load(admin, id);
  check(
    "the passengers counted on the ticket match what was typed",
    field(doc, "passengers")?.typed?.status === "match",
    JSON.stringify(field(doc, "passengers")),
  );
  check(
    "the distance is not on the ticket: the typed one is used",
    field(doc, "distance")?.typed?.status === "not_read",
  );
  check(
    "the PNR is read as the bill number",
    field(doc, "invoice_number")?.extractedValue?.length > 0,
  );
  const confirmed = await confirm(admin, id, {
    overrides: { distance: "1150", unit: "km" },
    acknowledge: ["passengers"],
  });
  check("confirmed", ok(confirmed), confirmed.error);
  const record = await recordOfDocument(id);
  check(
    "the activity value is 1150 x 6 = 6900 passenger-km",
    record.value === 6900,
    String(record.value),
  );
  const verdict = await typedResult(record.id);
  check(
    "the typed values agree with what was confirmed",
    verdict?.result === "pass",
    JSON.stringify(verdict),
  );
  const calc = await one(sql`select c.id, c.result_value::float as result from public.calculations c
                             where c.esg_record_id = ${record.id} and c.is_current`);
  if (calc) {
    const inputs = await sql`select input_key, input_value::float as value, input_unit
                             from public.calculation_inputs where calculation_id = ${calc.id} order by input_key`;
    check(
      "the trace keeps the distance in km and the passengers as a count",
      inputs.length === 2 &&
        inputs.some(
          (i) => i.input_key === "distance" && i.value === 1150 && i.input_unit === "km",
        ) &&
        inputs.some(
          (i) => i.input_key === "passengers" && i.value === 6 && i.input_unit === "count",
        ),
      JSON.stringify(inputs),
    );
    check(
      "6900 passenger-km x 0.15 = 1035 kgCO2e",
      Math.abs(calc.result - 1035) < 1e-6,
      String(calc.result),
    );
  } else {
    check("calculated with the synthetic factor", false, "no current calculation");
  }
}

// ---------------------------------------------------------------------------------------------------------
section("A file with more bills than were typed");
{
  const bytes = sampleBundle(["diesel", "electricity"]);
  const r = await uploadRow(pm, [{ bytes, name: `two-bills-${RUN}.pdf` }], [typedDiesel("1250")]);
  const { outcome } = await readAndRecord(pm, r.documentId);
  check(
    "it is not recorded by itself",
    outcome.data?.status === "needs_check",
    JSON.stringify(outcome),
  );
  check(
    "the reason names what is missing",
    /2 bills were found but 1 was typed/.test(outcome.data?.reason ?? ""),
    outcome.data?.reason,
  );
  const review = (await pm.query("bundles.review", { documentId: r.documentId })).data;
  check(
    "the separation page lists the typed row",
    review?.declarations.length === 1 && /1250 L/.test(review.declarations[0].summary),
  );
  const dieselPart = review.parts.find((p) => p.proposedDeclaration === 1);
  const other = review.parts.find((p) => p.proposedDeclaration === null);
  check(
    "the diesel bill is paired with it, the other is not",
    !!dieselPart && !!other,
    JSON.stringify(review.parts),
  );
  const part = (p, extra) => ({
    pageFrom: p.pageFrom,
    pageTo: p.pageTo,
    metricId: p.metricId,
    skip: false,
    reportingPeriodId: periodId,
    ...extra,
  });

  const noValue = await pm.mutate("bundles.confirm", {
    documentId: r.documentId,
    acknowledgeDuplicates: true,
    parts: [
      part(dieselPart, { declaration: 1 }),
      part({ ...other, metricId: ELECTRICITY }, { declaration: null }),
    ],
  });
  check("a bill nobody typed needs its value", rejected(noValue, "type its value"), noValue.error);
  const unmatched = await pm.mutate("bundles.confirm", {
    documentId: r.documentId,
    acknowledgeDuplicates: true,
    parts: [
      part(dieselPart, { skip: true }),
      part(
        { ...other, metricId: ELECTRICITY },
        { declaration: null, values: { consumption: "86400", unit: "kWh" } },
      ),
    ],
  });
  check(
    "a typed row left without a bill must be marked as not in the upload",
    rejected(unmatched, "isn't matched to a bill"),
    unmatched.error,
  );
  const done = await pm.mutate("bundles.confirm", {
    documentId: r.documentId,
    acknowledgeDuplicates: true,
    parts: [
      part(dieselPart, { declaration: 1 }),
      part(
        { ...other, metricId: ELECTRICITY },
        { declaration: null, values: { consumption: "86400", unit: "kWh" } },
      ),
    ],
  });
  check(
    "both bills are recorded",
    ok(done) && done.data?.count === 2,
    done.error ?? JSON.stringify(done.data),
  );
  const rows = await sql`select position, mode, declared_values from public.upload_declarations
                         where bundle_document_id = ${r.documentId} order by position`;
  check(
    "the value typed on the separation page is kept as its own row",
    rows.length === 2 && rows[1].declared_values.consumption === "86400",
    JSON.stringify(rows),
  );
  const linked = await one(sql`select count(*)::int as n from public.esg_records r
    join public.esg_record_documents e on e.esg_record_id = r.id
    join public.documents d on d.id = e.document_id
    where d.bundle_document_id = ${r.documentId} and r.upload_declaration_id is not null`);
  check("each bill points at its typed row", linked.n === 2);
}

// ---------------------------------------------------------------------------------------------------------
section("A file of several bills with their pages typed");
{
  const bytes = sampleBundle(["diesel", "electricity"]); // page 1 diesel, page 2 electricity
  const typedPages = [
    { ...typedDiesel("1250"), pageFrom: 1, pageTo: 1 },
    {
      metricId: ELECTRICITY,
      reportingPeriodId: periodId,
      mode: "bill",
      values: { consumption: "86400", unit: "kWh" },
      pageFrom: 2,
      pageTo: 2,
    },
  ];
  const overlap = await uploadRow(
    pm,
    [{ bytes, name: `overlap-${RUN}.pdf` }],
    [typedPages[0], { ...typedPages[1], pageFrom: 1, pageTo: 2 }],
  );
  check(
    "overlapping pages are refused",
    rejected(overlap.completed, "both include page 1"),
    overlap.completed?.error,
  );
  const r = await uploadRow(pm, [{ bytes, name: `paged-${RUN}.pdf` }], typedPages);
  check("the pages are stored with each bill", ok(r.completed), r.completed?.error);
  const stored = await sql`select position, page_from, page_to from public.upload_declarations
                           where bundle_document_id = ${r.documentId} order by position`;
  check(
    "as typed",
    stored.map((d) => `${d.page_from}-${d.page_to}`).join(",") === "1-1,2-2",
    JSON.stringify(stored),
  );
  const { outcome, documents } = await readAndRecord(pm, r.documentId);
  check(
    "the upload is cut where the person said and recorded at once",
    outcome.data?.status === "recorded" && documents.length === 2,
    JSON.stringify(outcome),
  );
  const kinds = await sql`select m.code from public.documents d
    join public.esg_record_documents e on e.document_id = d.id join public.esg_records r on r.id = e.esg_record_id
    join public.esg_metrics m on m.id = r.metric_id where d.bundle_document_id = ${r.documentId} order by d.file_name`;
  check(
    "each page became its typed bill",
    kinds
      .map((k) => k.code)
      .sort()
      .join(",") === "DIESEL_CONSUMPTION,GRID_ELECTRICITY",
    JSON.stringify(kinds),
  );

  const beyond = await uploadRow(
    pm,
    [{ bytes, name: `beyond-${RUN}.pdf` }],
    [typedPages[0], { ...typedPages[1], pageFrom: 2, pageTo: 3 }],
  );
  const late = await readAndRecord(pm, beyond.documentId);
  check(
    "pages beyond the file wait for the person, saying why",
    late.outcome.data?.status === "needs_check" && /only 2 pages/.test(late.outcome.data.reason),
    JSON.stringify(late.outcome.data),
  );
}

// ---------------------------------------------------------------------------------------------------------
section("Several bills whose total was typed");
{
  const files = [dieselFile(`total-a-${RUN}.pdf`), dieselFile(`total-b-${RUN}.pdf`)];
  const r = await uploadRow(pm, files, [typedDiesel("2500", "total")]);
  const { outcome, documents } = await readAndRecord(pm, r.documentId);
  check(
    "both bills are recorded at once",
    outcome.data?.status === "recorded" && documents.length === 2,
    JSON.stringify(outcome),
  );
  const shared =
    await one(sql`select count(distinct r.upload_declaration_id)::int as n, count(*)::int as bills
    from public.esg_records r join public.esg_record_documents e on e.esg_record_id = r.id
    join public.documents d on d.id = e.document_id where d.bundle_document_id = ${r.documentId}`);
  check(
    "one record per bill, both under the one typed total",
    shared.n === 1 && shared.bills === 2,
    JSON.stringify(shared),
  );
  const doc = await load(pm, documents[0].documentId);
  check(
    "Verify shows the total against the bills read",
    doc?.typedTotal?.fields[0]?.status === "match" &&
      doc.typedTotal.fields[0].sum === 2500 &&
      doc.typedTotal.bills.length === 2,
    JSON.stringify(doc?.typedTotal),
  );
  const confirmed = await confirm(pm, documents[0].documentId);
  const verdict = await typedResult((await recordOfDocument(documents[0].documentId)).id);
  check(
    "confirmed, and the total agrees",
    ok(confirmed) && verdict?.result === "pass",
    JSON.stringify(verdict),
  );
}
{
  const files = [dieselFile(`total-c-${RUN}.pdf`), dieselFile(`total-d-${RUN}.pdf`)];
  const r = await uploadRow(pm, files, [typedDiesel("2400", "total")]);
  const { documents } = await readAndRecord(pm, r.documentId);
  const doc = await load(pm, documents[0]?.documentId);
  check(
    "a total the bills do not add up to is shown",
    doc?.typedTotal?.fields[0]?.status === "mismatch",
  );
  await confirm(pm, documents[0].documentId);
  const verdict = await typedResult((await recordOfDocument(documents[0].documentId)).id);
  check(
    "and flagged for review",
    verdict?.result === "flagged" &&
      /2400 L was typed at upload as the total of 2 bills, but they add up to 2,500/.test(
        verdict.message,
      ),
    JSON.stringify(verdict),
  );
}

// ---------------------------------------------------------------------------------------------------------
section("Several files that are the pages of one bill");
{
  const files = [dieselFile(`page-1-${RUN}.pdf`), dieselFile(`page-2-${RUN}.pdf`)];
  const r = await uploadRow(pm, files, [typedDiesel("1250", "pages_of_one")]);
  const { outcome, documents } = await readAndRecord(pm, r.documentId);
  check(
    "recorded as one bill",
    outcome.data?.status === "recorded" && documents.length === 1,
    JSON.stringify({ outcome, documents }),
  );
}

// ---------------------------------------------------------------------------------------------------------
section("Billing months: this financial year so far, late ones filed and marked late");
{
  // Labelled fixtures, all closed (an open one would change which period other scripts pick). Today is read
  // the way the database reads it (India time).
  const { today } = await one(sql`select public.reporting_period_today()::text as today`);
  const d = new Date(`${today}T00:00:00Z`);
  const fyStart = new Date(
    Date.UTC(d.getUTCMonth() < 3 ? d.getUTCFullYear() - 1 : d.getUTCFullYear(), 3, 1),
  );
  const iso = (x) => x.toISOString().slice(0, 10);
  const monthOf = (from, add) => {
    const s = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + add, 1));
    const e = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0));
    return [iso(s), iso(e)];
  };
  const fixture = async (label, [start, end]) =>
    (
      await one(sql`
        insert into public.reporting_periods (label, start_date, end_date, status, submission_closes_on,
                                              late_uploads_until, opened_at, closed_at)
        values (${label}, ${start}, ${end}, 'closed', ${end}, ${end}, now(), now())
        on conflict (label) do update set status = 'closed'
        returning id`)
    ).id;
  // The first month of this financial year (closed long ago), a month still to come, and last year's February
  // and March. Labels are fixed so reruns reuse them.
  const thisYear = await fixture(`E2E FY start ${iso(fyStart)}`, monthOf(fyStart, 0));
  const future = await fixture(
    `E2E future ${iso(fyStart)}`,
    monthOf(new Date(`${today}T00:00:00Z`), 2),
  );
  const lastFeb = await fixture(`E2E last Feb ${iso(fyStart)}`, monthOf(fyStart, -2));
  const lastMarch = await fixture(`E2E last March ${iso(fyStart)}`, monthOf(fyStart, -1));
  const inFirstQuarter = d < new Date(Date.UTC(fyStart.getUTCFullYear(), 6, 1));

  const months = (await pm.query("documents.uploadOptions")).data?.billingMonths ?? [];
  const has = (id) => months.some((m) => m.id === id);
  check(
    "a closed month of this financial year is offered",
    has(thisYear) && months.find((m) => m.id === thisYear)?.late,
  );
  check("a month still to come is not", !has(future));
  check("last year's months are not", !has(lastFeb));
  check(
    `last year's March only from April to June (${inFirstQuarter ? "offered now" : "not now"})`,
    has(lastMarch) === inFirstQuarter,
  );
  check(
    "newest first",
    months.every((m, i) => i === 0 || months[i - 1].startDate >= m.startDate),
  );

  const typed = { ...typedDiesel("1250"), reportingPeriodId: thisYear };
  const r = await uploadRow(pm, [dieselFile(`late-${RUN}.pdf`)], [typed]);
  check("a bill for a closed month of this year is accepted", ok(r.completed), r.completed?.error);
  const { outcome, documents } = await readAndRecord(pm, r.documentId);
  check("and recorded", outcome.data?.status === "recorded", JSON.stringify(outcome));
  const record = await one(sql`
    select r.reporting_period_id, r.submitted_late from public.esg_records r
    join public.esg_record_documents e on e.esg_record_id = r.id and e.is_primary
    where e.document_id = ${documents[0]?.documentId}`);
  check(
    "in its own month, marked as a late submission",
    record?.reporting_period_id === thisYear && record.submitted_late === true,
    JSON.stringify(record),
  );
  section("Verify: moving a bill filed in the wrong month");
  // The diesel sample is billed 05-Sep-2026, so in that early month it fails the billing-period check.
  const lateDoc = documents[0]?.documentId;
  await confirm(pm, lateDoc);
  let view = await load(pm, lateDoc);
  check("the bill comes back for correction", view?.state === "returned", view?.state);
  check(
    "Verify offers the record's months, with the one its billing period points to",
    view.periodOptions.length > 1 && view.suggestedPeriod?.id === periodId,
    JSON.stringify(view.suggestedPeriod),
  );
  const tooEarly = await pm.mutate("verification.changePeriod", {
    documentId: lateDoc,
    reportingPeriodId: future,
  });
  check(
    "a month bills can't go to is refused",
    rejected(tooEarly, "can't be filed"),
    tooEarly.error,
  );
  const moved = await pm.mutate("verification.changePeriod", {
    documentId: lateDoc,
    reportingPeriodId: periodId,
  });
  check("the person moves it to the suggested month", ok(moved), moved.error);
  const after = await one(sql`
    select r.reporting_period_id, r.submitted_late, d.reporting_period_id as document_period
    from public.esg_records r join public.esg_record_documents e on e.esg_record_id = r.id and e.is_primary
    join public.documents d on d.id = e.document_id where d.id = ${lateDoc}`);
  check(
    "the record and its document move, and late is worked out again for the new month",
    after.reporting_period_id === periodId &&
      after.document_period === periodId &&
      after.submitted_late === moved.data?.late,
    JSON.stringify(after),
  );
  const recordId = (await recordOfDocument(lateDoc)).id;
  const audited = await one(sql`
    select count(*)::int as n from public.audit_logs
    where event_type = 'record.period_changed' and entity_id = ${recordId}`);
  check("the move is in the audit trail", audited.n === 1);
  check(
    "the record is checked again in its new month at once",
    moved.data?.validation && moved.data.validation !== "failed",
    JSON.stringify(moved.data),
  );
  view = await load(pm, lateDoc);
  check(
    "Verify now shows the new month and no longer the return",
    view.periodId === periodId && view.periodLabel !== undefined && view.suggestedPeriod === null,
  );
  check(
    "the billing period now fits",
    view.state !== "returned" && !view.validation?.results.some((r) => r.outcome === "fail"),
    JSON.stringify(view.validation?.results.filter((r) => r.outcome !== "pass")),
  );
  // A record moved before 2026-11-13, when a move did not run the checks again (the owner's page-5 bill):
  // moved by hand here, with the audit entry the move writes, then checked again from Verify.
  {
    const again = await uploadRow(
      pm,
      [dieselFile(`moved-early-${RUN}.pdf`)],
      [{ ...typedDiesel("1250"), reportingPeriodId: thisYear }],
    );
    const early = await readAndRecord(pm, again.documentId);
    const earlyDoc = early.documents[0]?.documentId;
    await confirm(pm, earlyDoc);
    const earlyRecord = (await recordOfDocument(earlyDoc)).id;
    await sql`update public.esg_records set reporting_period_id = ${periodId} where id = ${earlyRecord}`;
    await sql`update public.documents set reporting_period_id = ${periodId} where id = ${earlyDoc}`;
    await sql`insert into public.audit_logs (event_type, entity_type, entity_id, user_id, new_value)
              values ('record.period_changed', 'esg_record', ${earlyRecord}, null,
                      ${sql.json({ reporting_period_id: periodId, via: "tests/e2e: a move from before the recheck" })})`;
    let early1 = await load(pm, earlyDoc);
    check(
      "a record moved after its checks ran offers Check again",
      early1.state === "returned" && early1.recheckAfterMove === true,
      JSON.stringify({ state: early1.state, recheck: early1.recheckAfterMove }),
    );
    const rechecked = await pm.mutate("verification.recheck", { documentId: earlyDoc });
    check(
      "checked again in its new month, it passes",
      ok(rechecked) && rechecked.data?.validation !== "failed",
      rechecked.error ?? JSON.stringify(rechecked.data),
    );
    early1 = await load(pm, earlyDoc);
    check(
      "and is no longer returned",
      early1.state !== "returned" && !early1.recheckAfterMove,
      early1.state,
    );
    const twice = await pm.mutate("verification.recheck", { documentId: earlyDoc });
    check("Check again is only for a record the checks sent back", rejected(twice), twice.error);
  }

  const locked = await pm.mutate("verification.changePeriod", {
    documentId: lateDoc,
    reportingPeriodId: thisYear,
  });
  check("once confirmed, the month can't be changed", rejected(locked), locked.error);

  const refused = await uploadRow(
    pm,
    [dieselFile(`future-${RUN}.pdf`)],
    [{ ...typedDiesel("1250"), reportingPeriodId: future }],
  );
  check(
    "a month still to come is refused",
    rejected(refused.completed, "can't be added"),
    refused.completed?.error,
  );
  const old = await uploadRow(
    pm,
    [dieselFile(`old-${RUN}.pdf`)],
    [{ ...typedDiesel("1250"), reportingPeriodId: lastFeb }],
  );
  check("so is last year's", rejected(old.completed, "can't be added"), old.completed?.error);
}

// ---------------------------------------------------------------------------------------------------------
section("Drafts");
{
  const rows = [
    {
      id: "r1",
      metricId: DIESEL,
      periodId,
      values: { quantity: "850", unit: "L" },
      mode: "one",
      more: [],
      description: "",
    },
  ];
  const saved = await pm.mutate("bundles.saveDraft", { rows });
  check("a draft is saved", ok(saved) && !!saved.data?.savedAt, saved.error);
  const back = await pm.query("bundles.draft");
  check("and comes back for the same person", back.data?.rows?.[0]?.values?.quantity === "850");
  const other = await admin.query("bundles.draft");
  check("but not for anyone else", ok(other) && other.data === null);
  await pm.mutate("bundles.clearDraft");
  check("and is cleared", (await pm.query("bundles.draft")).data === null);
}

await finish();
