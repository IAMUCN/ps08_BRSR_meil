// Phase 2 of feature_enhancement.md: several open periods, late uploads, the duplicate rules, the bill
// number, document-type correction and returning a wrong activity (migration 0056; decisions in
// .grill/feature-enhancement-roadmap-decisions.md, "Phase 2 decisions"). Runs on the local stack only.
import {
  APP,
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
  rejected,
  runWorker,
  sample,
  section,
  setup,
  sql,
  upload,
} from "./lib.mjs";

const { sessions } = await setup();
const { admin, pm } = sessions;

// India's today and the dates around it, as the database sees them.
const { today } = await one(sql`select (now() at time zone 'Asia/Kolkata')::date::text as today`);
const day = (offset) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

// An Administrator of Project X, to accept a late record of their own unit.
const unitAdmin = await ensureInvited(admin, {
  email: "e2e.prjx.admin@traceesg.test",
  role: "org_admin",
  org: "PRJ-X",
  name: "E2E Project X Administrator",
});
const administrator = new Session();
await administrator.login(unitAdmin, { takeover: true });

// ============================================================================================================
section("Periods: defaults, several open at once, the late window");
// ============================================================================================================
const defaulted = await admin.mutate("reportingPeriods.create", {
  label: `E2E Default ${RUN}`,
  periodType: "monthly",
  startDate: "2030-01-01",
  endDate: "2030-01-31",
  submissionOpensOn: "",
  submissionClosesOn: "",
  lateUploadsUntil: "",
});
const defaultRow = await one(sql`
  select submission_closes_on::text as due, late_uploads_until::text as late
  from public.reporting_periods where id = ${defaulted.data?.id}`);
check(
  "a period created without dates is due 15 days after it ends, late until 45",
  defaultRow?.due === "2030-02-15" && defaultRow?.late === "2030-03-17",
  JSON.stringify(defaultRow),
);
check(
  "late uploads cannot end before the due date",
  rejected(
    await admin.mutate("reportingPeriods.create", {
      label: `E2E Bad ${RUN}`,
      periodType: "monthly",
      startDate: "2030-02-01",
      endDate: "2030-02-28",
      submissionOpensOn: "",
      submissionClosesOn: "2030-03-15",
      lateUploadsUntil: "2030-03-14",
    }),
    "Late uploads",
  ),
);

// A month whose due date passed yesterday and which takes late uploads for another 30 days. Its dates are
// September 2026, matching the invoice date on the sample diesel invoices below (diesel carries an invoice
// number; Grid Electricity captures none yet).
const lateLabel = `E2E Late ${RUN}`;
const created = await admin.mutate("reportingPeriods.create", {
  label: lateLabel,
  periodType: "monthly",
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  submissionOpensOn: "",
  submissionClosesOn: day(-1),
  lateUploadsUntil: day(30),
});
const latePeriod = created.data?.id;
const opened = await admin.mutate("reportingPeriods.transition", { id: latePeriod, to: "open" });
const openCount = (
  await one(sql`select count(*)::int as n from public.reporting_periods where status = 'open'`)
).n;
check("a second period opens while another is open", ok(opened) && openCount >= 2, opened.error);

const options = (await pm.query("documents.uploadOptions")).data;
const lateOption = options?.periods?.find((p) => p.id === latePeriod);
check(
  "the uploader is offered every period that takes uploads",
  (options?.periods?.length ?? 0) >= 2,
);
check(
  "with its dates, and the late one marked late",
  lateOption?.late === true &&
    lateOption?.dueOn === day(-1) &&
    lateOption?.lastUploadDay === day(30),
  JSON.stringify(lateOption),
);
const onTime = options?.periods?.find((p) => !p.late);
check("an on-time period is offered too", Boolean(onTime));

// ============================================================================================================
section("A late upload is marked, flagged and accepted by the unit's Administrator");
// ============================================================================================================
const dieselInvoice = (reference) => sample("diesel", { reference });
const lateRef = `LATE-${RUN}`.toUpperCase();
const lateBytes = dieselInvoice(lateRef);
const lateUpload = await upload(pm, lateBytes, `late-${RUN}.pdf`, {
  metric: "DIESEL_CONSUMPTION",
  periodId: latePeriod,
});
check(
  "an upload into the late period is accepted",
  Boolean(lateUpload.documentId),
  lateUpload.completed?.error,
);
check(
  "and the record is marked late",
  (await recordOf(lateUpload.documentId))?.submitted_late === true,
);
await runWorker();
check("the uploader confirms the values", ok(await confirm(pm, lateUpload.documentId)));
const lateRecord = await recordOf(lateUpload.documentId);
check(
  "validation flags it for review",
  lateRecord.validation_status === "flagged",
  lateRecord.validation_status,
);
const lateMessages = await sql`
  select message from public.validation_results
  where esg_record_id = ${lateRecord.id} and rule_type = 'period' and result = 'flagged'`;
check(
  "saying when it was due and when it came",
  lateMessages.some((m) => /Late submission: due on .*uploaded on/.test(m.message)),
);
check("the confirmed bill number is kept on the record", lateRecord.bill_number === lateRef);

const queue = (await administrator.query("validation.queue")).data ?? [];
const queued = queue.find((r) => r.recordId === lateRecord.id);
check(
  "the unit's Administrator sees it in the Validation Queue, marked late",
  queued?.late === true,
);
const accepted = await administrator.mutate("validation.review", {
  recordId: lateRecord.id,
  decision: "accept",
  reason: "Bill arrived late from the utility.",
});
check("and accepts it", ok(accepted), accepted.error);
check(
  "it then waits for approval",
  (await recordOf(lateUpload.documentId)).approval_status === "review_pending",
);
const approvalRow = ((await admin.query("approvals.queue")).data ?? []).find(
  (r) => r.recordId === lateRecord.id,
);
check(
  "the approval list shows its bill number and the late mark",
  approvalRow?.billNumber === lateRef && approvalRow?.late === true,
);

const septemberUpload = await upload(
  pm,
  sample("electricity", { period: "01-Sep-2026 to 30-Sep-2026" }),
  `on-time-${RUN}.pdf`,
  { metric: "GRID_ELECTRICITY", periodId: onTime?.id },
);
check(
  "an upload into an on-time period is not late",
  (await recordOf(septemberUpload.documentId))?.submitted_late === false,
);

// ============================================================================================================
section("Duplicates: the same file, the same bill, and a corrected re-upload");
// ============================================================================================================
// The identical file again, filed under another period.
const copy = await upload(pm, lateBytes, `copy-of-late-${RUN}.pdf`, {
  metric: "DIESEL_CONSUMPTION",
  periodId: onTime?.id,
});
await runWorker();
await confirm(pm, copy.documentId);
const copyRecord = await recordOf(copy.documentId);
const copyResults = await sql`
  select message from public.validation_results where esg_record_id = ${copyRecord.id} and result <> 'pass'`;
check(
  "the identical file in another period is flagged, naming the earlier record",
  copyResults.some((r) => /^Same file as .* for Project X, E2E Late /.test(r.message)),
  copyResults.map((r) => r.message).join(" | "),
);
check("and marked as a possible duplicate", copyRecord.is_duplicate_flag === true);

// A different file of the same bill (a re-scan): bill number and billing period match, bytes differ.
const rescan = Buffer.concat([lateBytes, Buffer.from(`\n% rescan ${RUN}\n`)]);
const second = await upload(pm, rescan, `rescan-${RUN}.pdf`, {
  metric: "DIESEL_CONSUMPTION",
  periodId: latePeriod,
});
await runWorker();
await confirm(pm, second.documentId);
const secondResults = await sql`
  select message from public.validation_results
  where esg_record_id = ${(await recordOf(second.documentId)).id} and result <> 'pass'`;
check(
  "a different file of the same bill is flagged as the same bill",
  secondResults.some((r) => r.message.includes(`same bill (no. ${lateRef})`)),
  secondResults.map((r) => r.message).join(" | "),
);
check("and not as the same file", !secondResults.some((r) => r.message.startsWith("Same file as")));

// ============================================================================================================
section("Returning the wrong activity, and its re-upload as a new version");
// ============================================================================================================
const wrongBytes = sample("electricity", { period: "01-Sep-2026 to 30-Sep-2026" });
const wrong = await upload(pm, wrongBytes, `wrong-activity-${RUN}.pdf`, {
  metric: "GRID_ELECTRICITY",
  periodId: onTime?.id,
});
await runWorker();
await confirm(pm, wrong.documentId);
const wrongRecord = await recordOf(wrong.documentId);
const wrongReturn = (who, reason = "Uploaded as the wrong activity.") =>
  who.mutate("records.returnWrongActivity", { recordId: wrongRecord.id, reason });
check("a Project Manager cannot return a record", (await wrongReturn(pm)).status === 403);
check("a reason is required", rejected(await wrongReturn(admin, "short"), "at least 10"));
const returned = await wrongReturn(admin);
check("an Admin returns it", ok(returned), returned.error);
check(
  "it is closed as rejected",
  (await recordOf(wrong.documentId)).data_quality_state === "rejected",
);
const notice = await one(sql`
  select deep_link_path from public.notifications
  where related_entity_id = ${wrongRecord.id} and title = 'Upload again under the right activity'`);
check(
  "the uploader is asked to upload it again, with a link that replaces it",
  notice?.deep_link_path === `/app/upload?replaces=${wrong.documentId}`,
);
const approvedOne = await one(
  sql`select id from public.esg_records where approval_status = 'approved' limit 1`,
);
if (approvedOne) {
  check(
    "an approved record cannot be returned",
    rejected(
      await admin.mutate("records.returnWrongActivity", {
        recordId: approvedOne.id,
        reason: "Trying to return an approved one.",
      }),
      "approved",
    ),
  );
}
const again = await upload(pm, wrongBytes, `again-${RUN}.pdf`, {
  metric: "GRID_ELECTRICITY",
  periodId: onTime?.id,
  replacesDocumentId: wrong.documentId,
});
check("the re-upload is accepted", Boolean(again.documentId), again.completed?.error);
const link = await one(
  sql`select related_document_id from public.documents where id = ${again.documentId}`,
);
check(
  "and linked to the returned one as its new version",
  link?.related_document_id === wrong.documentId,
);
const twice = await upload(pm, wrongBytes, `again2-${RUN}.pdf`, {
  metric: "GRID_ELECTRICITY",
  periodId: onTime?.id,
  replacesDocumentId: wrong.documentId,
});
check(
  "the returned document can be replaced only once",
  rejected(twice.prepared, "already replaced"),
  twice.prepared?.error,
);
await runWorker();
await confirm(pm, again.documentId);
const againResults = await sql`
  select message from public.validation_results
  where esg_record_id = ${(await recordOf(again.documentId)).id} and result <> 'pass'`;
check(
  "the new version is not flagged as a copy of the record it replaces",
  !againResults.some((r) => r.message.startsWith("Same file as")),
  againResults.map((r) => r.message).join(" | "),
);

// ============================================================================================================
section("Correcting the document type");
// ============================================================================================================
// Every activity maps to one document type today, so for this test Diesel gets a second one for a moment
// (removed again below): the correction is meant for an activity with several bill formats.
const extraType = await one(sql`
  select dt.id from public.document_types dt
  where not exists (select 1 from public.document_type_metric_mappings map
                    join public.esg_metrics m on m.id = map.metric_id
                    where map.document_type_id = dt.id and m.code = 'DIESEL_CONSUMPTION')
  order by dt.name limit 1`);
await sql`
  insert into public.document_type_metric_mappings (document_type_id, metric_id)
  select ${extraType.id}, id from public.esg_metrics where code = 'DIESEL_CONSUMPTION'
  on conflict do nothing`;
const detail = (await admin.query("records.detail", { recordId: lateRecord.id })).data;
check(
  "the record panel lists the activity's document types",
  (detail?.documentTypeOptions?.length ?? 0) > 0,
);
check("and the late mark and bill number", detail?.late === true && detail?.billNumber === lateRef);
const otherType = detail?.documentTypeOptions?.find((t) => t.id !== detail.documentType?.id);
if (otherType) {
  check(
    "a Project Manager cannot correct it",
    (
      await pm.mutate("records.setDocumentType", {
        recordId: lateRecord.id,
        documentTypeId: otherType.id,
        reason: "Not mine to change.",
      })
    ).status === 403,
  );
  const corrected = await admin.mutate("records.setDocumentType", {
    recordId: lateRecord.id,
    documentTypeId: otherType.id,
    reason: "It is the other kind of bill.",
  });
  check("an Admin corrects it with a reason", ok(corrected), corrected.error);
  const after = (await admin.query("records.detail", { recordId: lateRecord.id })).data;
  check(
    "it now says an Admin chose it",
    after?.documentType?.id === otherType.id && after?.documentType?.source === "admin",
  );
  check(
    "the correction is in the audit trail with its reason",
    Boolean(
      await one(sql`
        select 1 as x from public.audit_logs
        where event_type = 'document.type_corrected' and entity_id = ${lateUpload.documentId}
          and reason = 'It is the other kind of bill.'`),
    ),
  );
} else {
  console.log("  SKIP correcting the type: Diesel has only one document type here");
}
await sql`
  delete from public.document_type_metric_mappings
  where document_type_id = ${extraType.id}
    and metric_id = (select id from public.esg_metrics where code = 'DIESEL_CONSUMPTION')`;
const typeOfOtherActivity = await one(sql`
  select dt.id from public.document_types dt
  where not exists (select 1 from public.document_type_metric_mappings map
                    join public.esg_metrics m on m.id = map.metric_id
                    where map.document_type_id = dt.id and m.code = 'DIESEL_CONSUMPTION')
  limit 1`);
check(
  "a type of another activity is refused, pointing to returning it instead",
  rejected(
    await admin.mutate("records.setDocumentType", {
      recordId: lateRecord.id,
      documentTypeId: typeOfOtherActivity.id,
      reason: "Wrong kind of bill entirely.",
    }),
    "Return the record",
  ),
);

// ============================================================================================================
section("Monitoring: bill number, filters, readable download names");
// ============================================================================================================
const found = await admin.query("records.search", {
  orgUnitId: await orgId("MEIL"),
  periodId: latePeriod,
  text: lateRef,
});
const foundRow = found.data?.rows?.find((r) => r.recordId === lateRecord.id);
check("searching for the bill number finds the record", Boolean(foundRow), found.error);
check(
  "the row shows its bill number and the late mark",
  foundRow?.billNumber === lateRef && foundRow?.late === true,
);
const typeCode = (
  await one(sql`select dt.code from public.documents d join public.document_types dt on dt.id = d.document_type_id
                where d.id = ${lateUpload.documentId}`)
)?.code;
const byType = await admin.query("records.search", {
  orgUnitId: await orgId("MEIL"),
  periodId: latePeriod,
  documentTypeCode: typeCode,
});
check(
  "the document type filter keeps records of that type only",
  (byType.data?.rows ?? []).length > 0 &&
    byType.data.rows.every((r) => r.documentTypeName === byType.data.rows[0].documentTypeName),
);
check(
  "both categories are offered as filters",
  (found.data?.context?.documentTypes?.length ?? 0) > 0 &&
    (found.data?.context?.metrics?.length ?? 0) > 0,
);
const download = await admin.file(`/api/documents/${lateUpload.documentId}/file`);
check(
  "a downloaded original gets a readable name",
  /filename="[A-Za-z-]+_Bill-LATE-[A-Z0-9]+_E2E-Late-[A-Za-z0-9]+\.pdf"/.test(
    download.headers.get("content-disposition") ?? "",
  ),
  download.headers.get("content-disposition"),
);

// ============================================================================================================
section("A period past its late window takes no more uploads");
// ============================================================================================================
await sql`
  update public.reporting_periods
  set submission_closes_on = ${day(-10)}::date, late_uploads_until = ${day(-1)}::date
  where id = ${latePeriod}`;
const refused = await upload(pm, dieselInvoice(`LOCKED-${RUN}`), `locked-${RUN}.pdf`, {
  metric: "DIESEL_CONSUMPTION",
  periodId: latePeriod,
});
check(
  "an upload into it is refused, saying to choose another period",
  rejected(refused.prepared, "no longer takes uploads"),
  refused.prepared?.error,
);
check(
  "and it is no longer offered",
  !(await pm.query("documents.uploadOptions")).data?.periods?.some((p) => p.id === latePeriod),
);

// Leave the local database as the other scripts expect: the test periods closed.
await sql`
  update public.reporting_periods set status = 'closed', closed_at = now()
  where label in (${lateLabel}, ${`E2E Default ${RUN}`})`;
void APP;

await finish();
