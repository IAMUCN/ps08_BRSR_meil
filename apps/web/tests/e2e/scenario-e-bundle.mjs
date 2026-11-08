// Scenario E (.grill/multi-bill-pdf-decisions.md): a Project Manager uploads ONE PDF holding an electricity
// bill, a diesel invoice and a water bill. The OCR proposes the split, the PM reviews it (water belongs to
// EHS, so it is not theirs to record), confirms, and each kept bill becomes its own record that the worker
// reads separately and fills with its own values.
import {
  RUN,
  check,
  finish,
  metricId,
  ok,
  one,
  recordOf,
  rejected,
  runWorker,
  sampleBundle,
  section,
  setup,
  sql,
  uploadBundle,
} from "./lib.mjs";

const { sessions } = await setup();
const { pm, hr, ehs } = sessions;
const fieldValue = (loaded, key) => loaded?.fields?.find((f) => f.key === key)?.extractedValue;
const part = (pageFrom, pageTo, metric, skip = false) => ({
  pageFrom,
  pageTo,
  metricId: metric,
  skip,
});

section("1. The PM uploads one PDF with three different bills");
const bytes = sampleBundle(["electricity", "diesel", "water"]);
const { documentId, completed } = await uploadBundle(pm, bytes, `bundle-${RUN}.pdf`);
check("the PDF is accepted", ok(completed) && !!documentId, completed?.error);
const bundle = await one(sql`select * from public.documents where id = ${documentId}`);
check("it is stored as a multi-bill PDF of its own", bundle?.is_bundle === true);
check("it has no record yet (nothing is decided before the review)", !(await recordOf(documentId)));
check(
  "its upload is audited",
  (
    await one(sql`select count(*)::int as n from public.audit_logs
                  where event_type = 'document.bundle_uploaded' and entity_id = ${documentId}`)
  ).n === 1,
);

section("2. The OCR reads every page and proposes the split");
await runWorker();
const proposed = await sql`
  select p.part_number, p.page_from, p.page_to, dt.code as type, m.code as metric
  from public.document_bundle_parts p
  left join public.document_types dt on dt.id = p.proposed_document_type_id
  left join public.esg_metrics m on m.id = p.proposed_metric_id
  where p.bundle_document_id = ${documentId} order by p.part_number`;
check(
  "three bills, one page each, each recognised",
  proposed.length === 3 &&
    proposed.map((p) => `${p.page_from}-${p.page_to}:${p.type}`).join() ===
      "1-1:ELECTRICITY_BILL,2-2:DIESEL_INVOICE,3-3:WATER_BILL",
  JSON.stringify(proposed),
);
check(
  "each proposes its activity",
  proposed.map((p) => p.metric).join() === "GRID_ELECTRICITY,DIESEL_CONSUMPTION,WATER_CONSUMPTION",
  JSON.stringify(proposed.map((p) => p.metric)),
);
const job = await one(
  sql`select status, model_version from public.ocr_jobs where document_id = ${documentId}`,
);
check("the job completed", job?.status === "completed", JSON.stringify(job));
check("still no record exists", !(await recordOf(documentId)));
check(
  "the uploader is told it is ready, linking to the review",
  !!(await one(sql`select 1 as x from public.notifications
                   where related_entity_id = ${documentId}
                     and deep_link_path = ${"/app/upload/split/" + documentId}`)),
);

section("3. The review screen: what the PM may record");
const review = (await pm.query("bundles.review", { documentId })).data;
const allowed = review?.categories?.flatMap((c) => c.metrics.map((m) => m.id)) ?? [];
const grid = await metricId("GRID_ELECTRICITY");
const diesel = await metricId("DIESEL_CONSUMPTION");
const water = await metricId("WATER_CONSUMPTION");
check(
  "status is ready: three pages, three bills",
  review?.status === "ready" && review.pageCount === 3 && review.parts.length === 3,
  JSON.stringify(review?.status),
);
check(
  "the PM may record electricity and diesel",
  allowed.includes(grid) && allowed.includes(diesel),
);
check("water belongs to EHS, so it is not offered to the PM", !allowed.includes(water));
const waiting = async () =>
  ((await pm.query("bundles.pending")).data ?? []).find((b) => b.documentId === documentId);
check("My Submissions lists it as waiting for its split", (await waiting())?.status === "ready");
check("the OCR's water guess is still shown", review?.parts?.[2]?.metricId === water);
check(
  "another user cannot open it",
  rejected(await hr.query("bundles.review", { documentId }), "wasn't found"),
);
check(
  "nor confirm it",
  rejected(
    await hr.mutate("bundles.confirm", {
      documentId,
      acknowledgeDuplicates: true,
      parts: [part(1, 1, grid)],
    }),
    "wasn't found",
  ),
);

section("4. The server refuses what the screen would not allow");
const confirmWith = (parts, ack = true) =>
  pm.mutate("bundles.confirm", { documentId, acknowledgeDuplicates: ack, parts });
check(
  "a water bill cannot be kept by a PM",
  rejected(await confirmWith([part(1, 1, grid), part(3, 3, water)]), "can't record that activity"),
);
check(
  "a page cannot be in two bills",
  rejected(await confirmWith([part(1, 2, grid), part(2, 3, diesel)]), "both include page 2"),
);
check(
  "pages past the end are refused",
  rejected(await confirmWith([part(1, 4, grid)]), "only 3 pages"),
);
check(
  "a kept bill needs an activity",
  rejected(await confirmWith([part(1, 1, null)]), "choose what it is evidence for"),
);
check(
  "at least one bill must be kept",
  rejected(await confirmWith([part(1, 1, grid, true)]), "Keep at least one bill"),
);
check(
  "nothing was recorded by any refusal",
  (
    await one(
      sql`select count(*)::int as n from public.documents where bundle_document_id = ${documentId}`,
    )
  ).n === 0,
);

section("5. The PM confirms: electricity and diesel kept, water left out");
const split = [part(1, 1, grid), part(2, 2, diesel), part(3, 3, water, true)];
let confirmed = await confirmWith(split, false);
if (confirmed.data?.status === "confirm") {
  check(
    "earlier records for the same project, period and activity are warned about, not blocked",
    confirmed.data.duplicates.length > 0,
  );
  confirmed = await confirmWith(split, true);
}
check(
  "two bills are recorded",
  ok(confirmed) && confirmed.data?.status === "recorded" && confirmed.data.count === 2,
  JSON.stringify(confirmed.data ?? confirmed.error),
);
check("once confirmed it no longer waits for a split", !(await waiting()));
check(
  "and can no longer be discarded",
  rejected(await pm.mutate("bundles.discard", { documentId }), "already recorded"),
);
const children = await sql`
  select d.id, d.mime_type, d.file_hash, d.file_size_bytes, m.code as metric,
         r.verification_status::text as status, j.status::text as job
  from public.documents d
  join public.esg_record_documents erd on erd.document_id = d.id and erd.is_primary
  join public.esg_records r on r.id = erd.esg_record_id
  join public.esg_metrics m on m.id = r.metric_id
  join public.ocr_jobs j on j.document_id = d.id
  join public.document_bundle_parts bp on bp.created_document_id = d.id
  where d.bundle_document_id = ${documentId}
  -- In the bundle's order: the bills are created in one transaction, so created_at ties.
  order by bp.part_number`;
check(
  "each kept bill is its own document, record and OCR job",
  children.length === 2 &&
    children.every((c) => c.status === "document_uploaded" && c.job === "pending"),
  JSON.stringify(children.map((c) => [c.metric, c.status, c.job])),
);
check(
  "with the right activities",
  children.map((c) => c.metric).join() === "GRID_ELECTRICITY,DIESEL_CONSUMPTION",
);
check(
  "each is its own PDF, smaller than the whole",
  children.every(
    (c) =>
      c.mime_type === "application/pdf" &&
      c.file_hash !== bundle.file_hash &&
      Number(c.file_size_bytes) < bytes.length,
  ),
);
const parts = await sql`
  select status from public.document_bundle_parts where bundle_document_id = ${documentId}
  order by part_number`;
check(
  "the confirmed split is kept: created, created, skipped",
  parts.map((p) => p.status).join() === "created,created,skipped",
);
const ids = children.map((c) => c.id);
check(
  "each bill and the confirmation are audited",
  (
    await one(sql`select count(*)::int as n from public.audit_logs
                  where event_type = 'document.uploaded' and entity_id = any(${ids})`)
  ).n === 2 &&
    (
      await one(sql`select count(*)::int as n from public.audit_logs
                    where event_type = 'document.bundle_confirmed' and entity_id = ${documentId}`)
    ).n === 1,
);
const file = await pm.file(`/api/documents/${children[1].id}/file`);
const body = Buffer.from(await file.arrayBuffer());
check(
  "a bill's own PDF is served to its owner",
  file.status === 200 &&
    body.subarray(0, 5).toString() === "%PDF-" &&
    body.length === Number(children[1].file_size_bytes),
);
check(
  "a second confirmation is refused",
  rejected(await confirmWith([part(1, 1, grid)]), "already recorded"),
);

section("6. Each bill is read on its own and fills its own fields");
await runWorker();
const electricity = (await pm.query("verification.load", { documentId: children[0].id })).data;
const fuel = (await pm.query("verification.load", { documentId: children[1].id })).data;
check(
  "the electricity bill's consumption, unit and period are read",
  !!fieldValue(electricity, "consumption") &&
    !!fieldValue(electricity, "unit") &&
    !!fieldValue(electricity, "billing_period"),
  JSON.stringify(electricity?.fields?.map((f) => [f.key, f.extractedValue])),
);
check(
  "the diesel invoice's quantity, unit, period and number are read",
  !!fieldValue(fuel, "quantity") &&
    !!fieldValue(fuel, "unit") &&
    !!fieldValue(fuel, "billing_period") &&
    !!fieldValue(fuel, "invoice_number"),
  JSON.stringify(fuel?.fields?.map((f) => [f.key, f.extractedValue])),
);
check(
  "the two sets of values are different",
  fieldValue(electricity, "consumption") !== fieldValue(fuel, "quantity"),
);

section("7. After confirmation");
const done = (await pm.query("bundles.review", { documentId })).data;
check(
  "the review says done and lists the recorded bills",
  done?.status === "done" && done.created.length === 2 && done.created.every((c) => !!c.metricName),
  JSON.stringify(done?.created),
);

section("8. Uploads that cannot be split are refused; EHS keeps its water bill");
const tooLong = await uploadBundle(pm, sampleBundle(Array(21).fill("diesel")), "too-long.pdf");
check(
  "more than 20 pages is refused with a clear message",
  rejected(tooLong.completed, "at most 20"),
  tooLong.completed?.error,
);
const notPdf = await uploadBundle(pm, Buffer.from("this is not a pdf at all"), "x.pdf");
check(
  "something that is not a PDF is refused",
  rejected(notPdf.completed, "isn't a PDF"),
  notPdf.completed?.error,
);
const ehsUpload = await uploadBundle(ehs, sampleBundle(["water", "diesel"]), `ehs-${RUN}.pdf`);
await runWorker();
const ehsReview = (await ehs.query("bundles.review", { documentId: ehsUpload.documentId })).data;
const ehsAllowed = ehsReview?.categories?.flatMap((c) => c.metrics.map((m) => m.id)) ?? [];
check(
  "an EHS user is offered water, and the OCR proposed it for their first bill",
  ehsReview?.status === "ready" &&
    ehsAllowed.includes(water) &&
    ehsReview.parts[0]?.metricId === water,
  JSON.stringify(ehsReview?.parts),
);

await finish();
