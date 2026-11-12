import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { db, pgErrorCode, type Tx } from "@/lib/db";
import {
  BUNDLE_MAX_PAGES,
  MAX_BUNDLE_PARTS,
  MAX_UPLOAD_FILES,
  UPLOAD_MIME_TYPES,
  checkBundleParts,
  pagesLabel,
  periodForBill,
} from "@/lib/documents/bundle";
import { joinPages, pagesIn } from "@/lib/documents/join-pages";
import {
  entryProblem,
  matchBills,
  type DeclarationMode,
  type DeclaredBill,
} from "@/lib/declarations/compare";
import { extractPages } from "@/lib/documents/split-pdf";
import {
  MAX_UPLOAD_BYTES,
  checkFileContent,
  evidenceBucket,
  evidencePath,
  formatMegabytes,
} from "@/lib/storage/evidence";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { permissionProcedure, router } from "@/lib/trpc/init";
import {
  DESCRIPTION,
  NO_PERIOD,
  PERIOD_CLOSED,
  badRequest,
  enforceUploadLimit,
  loadUploadOptions,
  resolvePeriod,
  resolveTarget,
  takesTypedBill,
  type DuplicateWarnings,
  type UploadCategory,
  type UploadOptions,
} from "@/lib/trpc/routers/documents";

// Multi-bill PDFs (.grill/multi-bill-pdf-decisions.md; SCHEMA_DEVIATIONS D24). One PDF is uploaded as a
// document of its own with no record; the OCR worker proposes how its pages split into bills; the
// uploader confirms or edits the split here, and only then does each bill become an ordinary document,
// record and OCR job (its own PDF). Everything is checked against the uploader's own upload scope — a
// bill for an activity outside their role is refused exactly like a single upload would be.

const upload = permissionProcedure("document.upload");
const PDF = "application/pdf";

export type BundlePartView = {
  pageFrom: number;
  pageTo: number;
  /** What the OCR took the bill to be, for the reviewer; null when it could not tell. */
  documentTypeName: string | null;
  metricId: string | null;
  /** What OCR read on the bill (migration 0067), shown with the proposed period. */
  billNumber: string | null;
  billingPeriod: string | null;
  /** The reporting period its billing period points to, else the upload's own. */
  proposedPeriodId: string | null;
  /** The typed row (position) this bill is proposed to be, for an upload typed on the Upload page. */
  proposedDeclaration: number | null;
};

/** A row typed on the Upload page for this upload (migration 0077). */
export type ReviewDeclaration = {
  position: number;
  metricId: string;
  metricName: string;
  reportingPeriodId: string;
  periodLabel: string;
  mode: DeclarationMode;
  /** "850 L", "1,150 km × 6": what was typed, for the person to recognise the row. */
  summary: string;
};

export type ReviewPeriod = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  late: boolean;
};

export type BundleCreated = {
  documentId: string;
  fileName: string;
  pageFrom: number;
  pageTo: number;
  metricName: string | null;
  periodLabel: string;
};

export type BundleReview = {
  documentId: string;
  fileName: string;
  orgUnitName: string;
  periodLabel: string;
  /** When the upload was submitted. */
  submittedAt: string;
  /** The period a bill is filed in unless its billing period says otherwise; null if none takes uploads. */
  defaultPeriodId: string | null;
  /** The periods this person may file in now, newest first. */
  periods: ReviewPeriod[];
  /** The uploaded files and which of the upload's pages each one is. */
  sources: { fileName: string; mimeType: string; pageFrom: number; pageTo: number }[];
  /** processing: OCR still reading; ready: waiting for the uploader; failed; done: bills were recorded. */
  status: "processing" | "ready" | "failed" | "done";
  errorMessage: string | null;
  pageCount: number;
  parts: BundlePartView[];
  /** The activities this uploader may record at this project (same list a single upload offers). */
  categories: UploadCategory[];
  created: BundleCreated[];
  /** The rows typed for this upload; empty for an upload from before migration 0077. */
  declarations: ReviewDeclaration[];
};

type BundleRow = {
  id: string;
  org_unit_id: string;
  org_unit_name: string;
  reporting_period_id: string;
  period_label: string;
  file_name: string;
  storage_path: string;
  uploaded_by: string;
  job_status: string | null;
  job_error: string | null;
  page_total: number | null;
  created_at: Date;
};

const SHA256 = z.string().regex(/^[0-9a-f]{64}$/);

/** Values typed on the Upload page, by field key, as typed (migration 0077). */
const DECLARED_VALUES = z
  .record(z.string().max(100), z.string().trim().max(50))
  .refine((v) => Object.keys(v).length <= 12, "Too many values.");

/** One row (or sub-row) of the Upload page: what the person says a bill is, and its values. */
const DECLARATION = z.object({
  metricId: z.uuid(),
  reportingPeriodId: z.uuid(),
  mode: z.enum(["bill", "pages_of_one", "total"]).default("bill"),
  values: DECLARED_VALUES,
  /** For a bill inside a file of several: its pages, across the row's files (migration 0079). */
  pageFrom: z.number().int().min(1).max(BUNDLE_MAX_PAGES).optional(),
  pageTo: z.number().int().min(1).max(BUNDLE_MAX_PAGES).optional(),
});
type DeclarationInput = z.infer<typeof DECLARATION>;

/** What the server keeps of a row: only the activity's own values, the unit in its allowed spelling. */
type CheckedDeclaration = {
  metricId: string;
  reportingPeriodId: string;
  mode: DeclarationMode;
  values: Record<string, string>;
  pageFrom: number | null;
  pageTo: number | null;
};

/**
 * Checks the rows declared for one upload against what this person may upload now. Throws a message naming
 * the row. Several rows for one file are bills inside it, each its own; "pages of one bill" and "total"
 * describe a whole row and stand alone.
 */
function checkDeclarations(
  options: UploadOptions,
  orgUnitId: string,
  declarations: DeclarationInput[],
): CheckedDeclaration[] {
  if (declarations.length > 1 && declarations.some((d) => d.mode !== "bill")) {
    badRequest("Bills inside one file are each typed on their own row.");
  }
  // Pages: for every bill of a file of several, or for none; never overlapping (migration 0079).
  const paged = declarations.filter((d) => d.pageFrom !== undefined || d.pageTo !== undefined);
  if (paged.length > 0) {
    if (declarations.length < 2 || paged.length !== declarations.length) {
      badRequest("Give the pages of every bill in the file, or of none.");
    }
    const owner = new Map<number, number>();
    for (const [i, d] of declarations.entries()) {
      if (d.pageFrom === undefined || d.pageTo === undefined || d.pageTo < d.pageFrom) {
        badRequest(`Bill ${i + 1}: enter a first and last page, the last not before the first.`);
      }
      for (let page = d.pageFrom; page <= d.pageTo; page++) {
        const other = owner.get(page);
        if (other !== undefined)
          badRequest(`Bills ${other + 1} and ${i + 1} both include page ${page}.`);
        owner.set(page, i);
      }
    }
  }
  return declarations.map((d, i) => {
    const label = declarations.length > 1 ? `Bill ${i + 1}` : "This row";
    let metric: ReturnType<typeof resolveTarget>["metric"];
    try {
      metric = resolveTarget(options, orgUnitId, d.metricId).metric;
    } catch {
      return badRequest(`${label}: you can't record that bill type for this project.`);
    }
    // The bill's billing month (owner's request, 2026-11-13): late or closed months of this year are accepted;
    // the record is marked late.
    if (!takesTypedBill(options, d.reportingPeriodId)) {
      badRequest(`${label}: bills for that month can't be added any more — choose another month.`);
    }
    const problem = entryProblem(metric.entryFields, d.values);
    if (problem) badRequest(`${label}: ${problem}`);
    const values: Record<string, string> = {};
    for (const field of metric.entryFields) values[field.key] = d.values[field.key].trim();
    if (metric.unitKey) {
      const typed = (d.values[metric.unitKey] ?? "").trim();
      const unit = metric.units.find((u) => u.toLowerCase() === typed.toLowerCase());
      if (!unit) badRequest(`${label}: choose the unit (${metric.units.join(", ")}).`);
      values[metric.unitKey] = unit;
    }
    return {
      metricId: d.metricId,
      reportingPeriodId: d.reportingPeriodId,
      mode: d.mode,
      values,
      pageFrom: d.pageFrom ?? null,
      pageTo: d.pageTo ?? null,
    };
  });
}

type StoredDeclaration = {
  id: string;
  position: number;
  metric_id: string;
  reporting_period_id: string;
  mode: DeclarationMode;
  declared_values: Record<string, string>;
  page_from: number | null;
  page_to: number | null;
};

async function loadDeclarations(
  sql: ReturnType<typeof db> | Tx,
  bundleId: string,
): Promise<StoredDeclaration[]> {
  return sql<StoredDeclaration[]>`
    select id, position, metric_id, reporting_period_id, mode, declared_values, page_from, page_to
    from public.upload_declarations where bundle_document_id = ${bundleId} order by position`;
}

/** Whether any of these files was uploaded before, on its own or inside another upload. */
async function sameFiles(sql: ReturnType<typeof db> | Tx, hashes: string[]): Promise<boolean> {
  const [{ same }] = await sql<{ same: boolean }[]>`
    select exists (select 1 from public.documents
                   where file_hash = any(${hashes}) and deleted_at is null)
        or exists (select 1 from public.document_bundle_sources s
                   join public.documents d on d.id = s.bundle_document_id
                   where s.file_hash = any(${hashes}) and d.deleted_at is null) as same`;
  return same;
}

/** One name for an upload of several files: the first, and how many more. */
function uploadName(names: string[]): string {
  const name = names.length === 1 ? names[0] : `${names[0]} and ${names.length - 1} more`;
  return name.slice(0, 255);
}

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "That PDF wasn't found." });

/** The bundle, only for the person who uploaded it. Not found and not yours look the same. */
async function loadBundle(
  sql: ReturnType<typeof db>,
  documentId: string,
  userId: string,
): Promise<BundleRow> {
  const [row] = await sql<BundleRow[]>`
    select d.id, d.org_unit_id, o.name as org_unit_name, d.reporting_period_id,
           rp.label as period_label, d.file_name, d.storage_path, d.uploaded_by, d.created_at,
           j.status::text as job_status, j.error_message as job_error,
           (select (e.raw_output -> 'pages' ->> 'total')::int from public.ocr_extractions e
             where e.document_id = d.id order by e.extracted_at desc limit 1) as page_total
    from public.documents d
    join public.org_units o on o.id = d.org_unit_id
    join public.reporting_periods rp on rp.id = d.reporting_period_id
    left join public.ocr_jobs j on j.document_id = d.id
    where d.id = ${documentId} and d.is_bundle and d.deleted_at is null`;
  if (!row || row.uploaded_by !== userId) throw notFound();
  return row;
}

// --- Confirming a split ------------------------------------------------------------------------------

const PART = z.object({
  pageFrom: z.number().int(),
  pageTo: z.number().int(),
  metricId: z.uuid().nullable(),
  skip: z.boolean(),
  /** The bill's reporting period; omitted = the upload's own. */
  reportingPeriodId: z.uuid().optional(),
  /** The typed row this bill is (its position), for an upload typed on the Upload page. */
  declaration: z.number().int().min(1).nullable().optional(),
  /** Values typed here for a bill no row was typed for. */
  values: DECLARED_VALUES.optional(),
});
type PartInput = z.infer<typeof PART>;

type ExistingPart = {
  part_number: number;
  page_from: number;
  page_to: number;
  status: string;
  bill_number: string | null;
  billing_period: string | null;
  proposed_metric_id: string | null;
};

async function loadParts(sql: ReturnType<typeof db>, bundleId: string) {
  return sql<ExistingPart[]>`
    select part_number, page_from, page_to, status, bill_number, billing_period, proposed_metric_id
    from public.document_bundle_parts
    where bundle_document_id = ${bundleId} order by part_number`;
}

type KeptBill = {
  part: PartInput;
  index: number;
  periodId: string;
  metricName: string;
  /** The typed row it is (position), or null; `typed` = values typed for it on the separation page. */
  declaration: number | null;
  typed: CheckedDeclaration | null;
};
type BillPlan = { kept: KeptBill[]; dropped: number[] };

/**
 * Checks a split against what the uploader may record, and (for a typed upload) against the typed rows:
 * every kept bill is a typed row or has values typed for it, a row of one bill is used once, and every row
 * is used or dropped by name. Throws a message naming the bill.
 */
function planBills(
  options: UploadOptions,
  bundle: BundleRow,
  parts: PartInput[],
  declarations: StoredDeclaration[],
  drop: number[],
): BillPlan {
  const periodLabels = new Map(
    [...options.periods, ...options.billingMonths].map((p) => [p.id, p.label]),
  );
  const typedUpload = declarations.length > 0;
  const used = new Map<number, number>();
  const kept: KeptBill[] = [];
  for (const [index, part] of parts.entries()) {
    if (part.skip) continue;
    const periodId = part.reportingPeriodId ?? bundle.reporting_period_id;
    if (!periodLabels.has(periodId)) {
      badRequest(
        `Bill ${index + 1}: that reporting period doesn't take uploads now — choose another one.`,
      );
    }
    let metricName: string;
    try {
      metricName = resolveTarget(options, bundle.org_unit_id, part.metricId!).metric.name;
    } catch {
      return badRequest(`Bill ${index + 1}: you can't record that activity for this project.`);
    }
    let declaration: number | null = null;
    let typed: CheckedDeclaration | null = null;
    if (typedUpload) {
      if (part.declaration) {
        const row = declarations.find((d) => d.position === part.declaration);
        if (!row) badRequest(`Bill ${index + 1}: that typed row isn't part of this upload.`);
        if (drop.includes(row.position)) {
          badRequest(`Bill ${index + 1}: its typed row is marked as not in this upload.`);
        }
        used.set(row.position, (used.get(row.position) ?? 0) + 1);
        if (row.mode !== "total" && used.get(row.position)! > 1) {
          badRequest(
            `Row ${row.position} was typed for one bill; two bills point to it. Type the values of the other.`,
          );
        }
        declaration = row.position;
      } else if (part.values) {
        try {
          [typed] = checkDeclarations(options, bundle.org_unit_id, [
            {
              metricId: part.metricId!,
              reportingPeriodId: periodId,
              mode: "bill",
              values: part.values,
            },
          ]);
        } catch (error) {
          if (error instanceof TRPCError) {
            badRequest(`Bill ${index + 1}: ${error.message.replace(/^This row: /, "")}`);
          }
          throw error;
        }
      } else {
        badRequest(`Bill ${index + 1}: type its value — every bill needs one.`);
      }
    }
    kept.push({ part, index, periodId, metricName, declaration, typed });
  }
  if (typedUpload) {
    for (const row of declarations) {
      if (!used.has(row.position) && !drop.includes(row.position)) {
        badRequest(
          `Row ${row.position} that you typed isn't matched to a bill. Choose its bill, or mark it as not in this upload.`,
        );
      }
    }
  }
  return { kept, dropped: drop.filter((p) => declarations.some((d) => d.position === p)) };
}

/** Records already there for the same project, period and activity, or earlier in this upload. */
async function duplicateBills(
  sql: ReturnType<typeof db>,
  bundle: BundleRow,
  kept: KeptBill[],
  options: UploadOptions,
) {
  const periodLabels = new Map(
    [...options.periods, ...options.billingMonths].map((p) => [p.id, p.label]),
  );
  const duplicates: {
    bill: number;
    metricName: string;
    existingRecords: number;
    periodLabel: string;
  }[] = [];
  for (const [position, { part, index, periodId, metricName }] of kept.entries()) {
    const earlier = kept
      .slice(0, position)
      .filter((k) => k.part.metricId === part.metricId && k.periodId === periodId).length;
    const [{ existingRecords }] = await sql<{ existingRecords: number }[]>`
      select count(*)::int as "existingRecords" from public.esg_records
      where org_unit_id = ${bundle.org_unit_id}
        and reporting_period_id = ${periodId}
        and metric_id = ${part.metricId!}`;
    if (existingRecords + earlier > 0) {
      duplicates.push({
        bill: index + 1,
        metricName,
        existingRecords: existingRecords + earlier,
        periodLabel: periodLabels.get(periodId)!,
      });
    }
  }
  return duplicates;
}

/** Bytes first, then rows: store every kept bill, then record them all in one transaction. */
async function recordBills(
  sql: ReturnType<typeof db>,
  args: {
    userId: string;
    bundle: BundleRow;
    parts: PartInput[];
    existing: ExistingPart[];
    plan: BillPlan;
    declarations: StoredDeclaration[];
    duplicatesAcknowledged: boolean;
    automatic: boolean;
  },
) {
  const { userId, bundle, parts, existing, plan, declarations } = args;
  const kept = plan.kept;
  // A bill that is exactly one of the uploaded files is that file, unchanged; any other is cut out.
  const storage = createSupabaseAdminClient().storage.from(evidenceBucket());
  const sources = await sql<
    {
      file_name: string;
      mime_type: string;
      file_hash: string;
      storage_path: string;
      page_from: number;
      page_to: number;
    }[]
  >`
    select file_name, mime_type, file_hash, storage_path, page_from, page_to
    from public.document_bundle_sources where bundle_document_id = ${bundle.id}
    order by position`;
  let original: Uint8Array | null = null;
  const bundleBytes = async () => {
    if (!original) {
      const { data: blob, error } = await storage.download(bundle.storage_path);
      if (error || !blob) badRequest("The upload could not be read — upload it again.");
      original = new Uint8Array(await blob.arrayBuffer());
    }
    return original;
  };
  const base = bundle.file_name.replace(/\.pdf$/i, "");

  const stored: {
    id: string;
    path: string;
    bytes: Uint8Array;
    hash: string;
    name: string;
    mimeType: string;
  }[] = [];
  const cleanup = () => storage.remove(stored.map((s) => s.path));
  try {
    for (const { part, index, periodId } of kept) {
      const whole = sources.find((s) => s.page_from === part.pageFrom && s.page_to === part.pageTo);
      const within = sources.find((s) => s.page_from <= part.pageFrom && part.pageTo <= s.page_to);
      let bytes: Uint8Array;
      let mimeType = PDF;
      let name: string;
      if (whole) {
        const { data: blob, error } = await storage.download(whole.storage_path);
        if (error || !blob) badRequest(`Bill ${index + 1}: ${whole.file_name} could not be read.`);
        bytes = new Uint8Array(await blob.arrayBuffer());
        mimeType = whole.mime_type;
        name = whole.file_name;
      } else {
        bytes = await extractPages(await bundleBytes(), part.pageFrom, part.pageTo);
        const from = within ? within.file_name.replace(/\.[a-z0-9]+$/i, "") : base;
        const offset = within ? within.page_from - 1 : 0;
        name = `${from} (${pagesLabel(part.pageFrom - offset, part.pageTo - offset)}).pdf`;
      }
      if (!checkFileContent(bytes).ok) {
        badRequest(`Bill ${index + 1} could not be cut out of the upload.`);
      }
      const id = randomUUID();
      const path = evidencePath(bundle.org_unit_id, periodId, id, mimeType)!;
      const { error } = await storage.upload(path, bytes, { contentType: mimeType, upsert: false });
      if (error) throw error;
      stored.push({
        id,
        path,
        bytes,
        hash: createHash("sha256").update(bytes).digest("hex"),
        name,
        mimeType,
      });
    }

    return await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock_shared(hashtext('reporting_period_status'))`;
      await tx`select pg_advisory_xact_lock_shared(hashtext('org_units_tree'))`;
      const current = await loadUploadOptions(tx, userId);
      for (const { periodId } of kept) {
        if (!takesTypedBill(current, periodId)) badRequest(PERIOD_CLOSED);
      }
      // One confirmation only: lock the proposal and check nothing has been recorded since.
      const locked = await tx<{ status: string }[]>`
        select status from public.document_bundle_parts
        where bundle_document_id = ${bundle.id} for update`;
      if (locked.some((p) => p.status !== "proposed")) {
        badRequest("The bills in this upload were already recorded.");
      }

      // Values typed on this page for bills no row was typed for become rows of their own.
      let nextPosition = declarations.reduce((max, d) => Math.max(max, d.position), 0);
      const declarationIds = new Map(declarations.map((d) => [d.position, d.id]));
      const typedHere: { bill: number; position: number; values: Record<string, string> }[] = [];
      const declarationOf: (string | null)[] = [];
      for (const bill of kept) {
        if (bill.typed) {
          const [row] = await tx<{ id: string }[]>`
            insert into public.upload_declarations
              (bundle_document_id, position, metric_id, reporting_period_id, mode, declared_values,
               declared_by)
            values (${bundle.id}, ${++nextPosition}, ${bill.typed.metricId},
                    ${bill.typed.reportingPeriodId}, 'bill', ${tx.json(bill.typed.values)}, ${userId})
            returning id`;
          typedHere.push({
            bill: bill.index + 1,
            position: nextPosition,
            values: bill.typed.values,
          });
          declarationOf.push(row.id);
        } else {
          declarationOf.push(bill.declaration ? declarationIds.get(bill.declaration)! : null);
        }
      }

      const recorded: { documentId: string; esgRecordId: string }[] = [];
      for (const [position, { part, periodId }] of kept.entries()) {
        const file = stored[position];
        resolveTarget(current, bundle.org_unit_id, part.metricId!);
        const [metricRow] = await tx<{ scope_id: string | null; requires_calculation: boolean }[]>`
          select scope_id, requires_calculation from public.esg_metrics where id = ${part.metricId!}`;
        await tx`
          insert into public.documents (
            id, org_unit_id, reporting_period_id, storage_path, file_name, mime_type,
            file_size_bytes, file_hash, uploaded_by, bundle_document_id, description
          ) values (
            ${file.id}, ${bundle.org_unit_id}, ${periodId}, ${file.path},
            ${file.name}, ${file.mimeType}, ${file.bytes.length}, ${file.hash}, ${userId},
            ${bundle.id},
            -- A bill cut out of the upload takes the upload's description (migration 0063).
            (select description from public.documents where id = ${bundle.id})
          )`;
        const [record] = await tx<{ id: string }[]>`
          insert into public.esg_records (
            org_unit_id, reporting_period_id, metric_id, scope_id, submitted_by,
            verification_status, calculation_status, is_duplicate_flag, submitted_late,
            upload_declaration_id
          ) values (
            ${bundle.org_unit_id}, ${periodId}, ${part.metricId!},
            ${metricRow.scope_id}, ${userId}, 'document_uploaded',
            ${metricRow.requires_calculation ? "pending" : "not_applicable"}, false,
            -- Late if the upload arrived after the bill's period was due (migration 0056).
            (select (d.created_at at time zone 'Asia/Kolkata')::date
                      > coalesce(p.submission_closes_on, p.end_date)
             from public.documents d, public.reporting_periods p
             where d.id = ${bundle.id} and p.id = ${periodId}),
            ${declarationOf[position]}
          ) returning id`;
        await tx`
          insert into public.esg_record_documents (esg_record_id, document_id, is_primary, added_by)
          values (${record.id}, ${file.id}, true, ${userId})`;
        const [job] = await tx<{ id: string }[]>`
          insert into public.ocr_jobs (document_id) values (${file.id}) returning id`;
        await writeAudit(tx, {
          eventType: "document.uploaded",
          entityType: "document",
          entityId: file.id,
          userId,
          newValue: {
            file_name: file.name,
            mime_type: file.mimeType,
            file_size_bytes: file.bytes.length,
            file_hash: file.hash,
            org_unit_id: bundle.org_unit_id,
            reporting_period_id: periodId,
            metric_id: part.metricId,
            esg_record_id: record.id,
            ocr_job_id: job.id,
            bundle_document_id: bundle.id,
            bundle_pages: [part.pageFrom, part.pageTo],
            upload_declaration_id: declarationOf[position],
          },
        });
        recorded.push({ documentId: file.id, esgRecordId: record.id });
      }

      // The proposal is replaced by what was confirmed (the proposal is in the audit log). What OCR read
      // on a bill is kept when its pages did not change.
      await tx`delete from public.document_bundle_parts where bundle_document_id = ${bundle.id}`;
      let keptIndex = 0;
      for (const [index, part] of parts.entries()) {
        const createdId = part.skip ? null : stored[keptIndex++].id;
        const read = existing.find(
          (e) => e.page_from === part.pageFrom && e.page_to === part.pageTo,
        );
        await tx`
          insert into public.document_bundle_parts
            (bundle_document_id, part_number, page_from, page_to, proposed_metric_id,
             status, created_document_id, bill_number, billing_period, reporting_period_id)
          values (${bundle.id}, ${index + 1}, ${part.pageFrom}, ${part.pageTo}, ${part.metricId},
                  ${part.skip ? "skipped" : "created"}, ${createdId},
                  ${read?.bill_number ?? null}, ${read?.billing_period ?? null},
                  ${part.skip ? null : (part.reportingPeriodId ?? bundle.reporting_period_id)})`;
      }
      await writeAudit(tx, {
        eventType: "document.bundle_confirmed",
        entityType: "document",
        entityId: bundle.id,
        userId,
        oldValue: { proposed_parts: existing },
        newValue: {
          parts,
          created_document_ids: recorded.map((r) => r.documentId),
          duplicates_acknowledged: args.duplicatesAcknowledged,
          // Recorded straight from the typed rows (the Upload page), or on the separation page.
          automatic: args.automatic,
          typed_rows_used: kept.map((k) => k.declaration),
          typed_here: typedHere,
          typed_rows_not_in_upload: plan.dropped,
        },
      });
      return { status: "recorded" as const, count: recorded.length };
    });
  } catch (error) {
    await cleanup();
    if (pgErrorCode(error) === "23505") badRequest("These bills were already recorded.");
    throw error;
  }
}

export const bundlesRouter = router({
  /**
   * Signed upload URLs for one upload of one or more files (owner's request, 2026-11-12: one upload for every
   * bill). The older shape — one PDF as `fileSize` and `sha256` — still works and stores it at the document's
   * own path.
   */
  prepareUpload: upload
    .input(
      z.object({
        /** The period chosen; omitted = the newest one that takes uploads. */
        reportingPeriodId: z.uuid().optional(),
        orgUnitId: z.uuid(),
        fileSize: z.number().int().positive().optional(),
        sha256: SHA256.optional(),
        files: z
          .array(
            z.object({
              fileSize: z.number().int().positive(),
              sha256: SHA256,
              mimeType: z.enum(UPLOAD_MIME_TYPES as [string, ...string[]]),
            }),
          )
          .min(1)
          .max(MAX_UPLOAD_FILES)
          .optional(),
        acknowledgeDuplicates: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      await enforceUploadLimit(ctx.session.userId);
      const options = await loadUploadOptions(sql, ctx.session.userId);
      const period = resolvePeriod(options, input.reportingPeriodId);
      const target = options.targets.find((t) => t.orgUnitId === input.orgUnitId);
      if (!target)
        throw new TRPCError({ code: "FORBIDDEN", message: "You can't upload for that project." });
      const legacy = !input.files;
      const files =
        input.files ??
        (input.fileSize && input.sha256
          ? [{ fileSize: input.fileSize, sha256: input.sha256, mimeType: PDF }]
          : badRequest("Attach at least one file."));
      for (const file of files) {
        if (file.fileSize > MAX_UPLOAD_BYTES) {
          badRequest(
            `A file is ${formatMegabytes(file.fileSize)}; the limit is ${formatMegabytes(MAX_UPLOAD_BYTES)} a file.`,
          );
        }
      }
      const total = files.reduce((sum, f) => sum + f.fileSize, 0);
      if (total > MAX_UPLOAD_BYTES) {
        badRequest(
          `These files are ${formatMegabytes(total)} together; the limit is ${formatMegabytes(MAX_UPLOAD_BYTES)} an upload. Upload them in two goes.`,
        );
      }
      const same = await sameFiles(
        sql,
        files.map((f) => f.sha256),
      );
      if (same && !input.acknowledgeDuplicates) {
        return {
          status: "confirm" as const,
          warnings: {
            sameFile: true,
            existingRecords: 0,
            orgUnitName: target.name,
            metricName: "",
            periodLabel: period.label,
          } satisfies DuplicateWarnings,
        };
      }
      const documentId = randomUUID();
      const storage = createSupabaseAdminClient().storage.from(evidenceBucket());
      const uploads: { sourceId: string; signedUrl: string }[] = [];
      for (const file of files) {
        // The older one-PDF shape keeps its file at the document's own path.
        const sourceId = legacy ? documentId : randomUUID();
        const path = evidencePath(input.orgUnitId, period.id, sourceId, file.mimeType)!;
        const { data, error } = await storage.createSignedUploadUrl(path);
        if (error) throw error;
        uploads.push({ sourceId, signedUrl: data.signedUrl });
      }
      return {
        status: "ready" as const,
        documentId,
        reportingPeriodId: period.id,
        signedUrl: uploads[0].signedUrl,
        uploads,
      };
    }),

  completeUpload: upload
    .input(
      z.object({
        orgUnitId: z.uuid(),
        documentId: z.uuid(),
        reportingPeriodId: z.uuid(),
        /** One name for the whole upload; for several files the server builds it from theirs. */
        fileName: z.string().trim().min(1).max(255).optional(),
        /** The files, in the order they were dropped (from prepareUpload's `uploads`). */
        sources: z
          .array(
            z.object({
              id: z.uuid(),
              fileName: z.string().trim().min(1).max(255),
              mimeType: z.enum(UPLOAD_MIME_TYPES as [string, ...string[]]),
            }),
          )
          .min(1)
          .max(MAX_UPLOAD_FILES)
          .optional(),
        acknowledgeDuplicates: z.boolean().default(false),
        description: DESCRIPTION,
        /**
         * The row(s) typed for this upload on the Upload page (migration 0077): its bill type, period and
         * values, or one sub-row per bill inside the file. Omitted by older callers (the e2e suite).
         */
        declarations: z.array(DECLARATION).min(1).max(MAX_BUNDLE_PARTS).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      const storage = createSupabaseAdminClient().storage.from(evidenceBucket());
      const sources =
        input.sources ??
        (input.fileName
          ? [{ id: input.documentId, fileName: input.fileName, mimeType: PDF }]
          : badRequest("Attach at least one file."));
      const sourcePath = (s: { id: string; mimeType: string }) =>
        evidencePath(input.orgUnitId, input.reportingPeriodId, s.id, s.mimeType)!;
      // A single PDF is the bundle itself; anything else is joined into a PDF of its own.
      const joined = !(sources.length === 1 && sources[0].mimeType === PDF);
      const bundlePath = joined
        ? evidencePath(input.orgUnitId, input.reportingPeriodId, input.documentId, PDF)!
        : sourcePath(sources[0]);
      const reject = async (message: string): Promise<never> => {
        const [recorded] = await sql`select 1 from public.documents where id = ${input.documentId}`;
        if (!recorded) {
          await storage.remove([...sources.map(sourcePath), ...(joined ? [bundlePath] : [])]);
        }
        badRequest(message);
      };

      const options = await loadUploadOptions(sql, ctx.session.userId);
      const target = options.targets.find((t) => t.orgUnitId === input.orgUnitId);
      if (!target)
        throw new TRPCError({ code: "FORBIDDEN", message: "You can't upload for that project." });
      if (options.periods.length === 0) return reject(NO_PERIOD);
      if (!options.periods.some((p) => p.id === input.reportingPeriodId)) {
        return reject("The reporting period closed while you were uploading — choose another one.");
      }
      let declared: CheckedDeclaration[] = [];
      if (input.declarations) {
        try {
          declared = checkDeclarations(options, input.orgUnitId, input.declarations);
        } catch (error) {
          if (error instanceof TRPCError) return reject(error.message);
          throw error;
        }
      }

      // Every file re-read and checked on the server: its real type, damage, size and pages.
      const read: {
        id: string;
        fileName: string;
        mimeType: string;
        bytes: Uint8Array;
        hash: string;
        pageFrom: number;
        pageTo: number;
      }[] = [];
      let pages = 0;
      let total = 0;
      for (const source of sources) {
        const { data: blob, error } = await storage.download(sourcePath(source));
        if (error || !blob) badRequest(`${source.fileName} didn't finish uploading — try again.`);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        total += bytes.length;
        if (bytes.length > MAX_UPLOAD_BYTES || total > MAX_UPLOAD_BYTES) {
          return reject(`The upload is over ${formatMegabytes(MAX_UPLOAD_BYTES)}.`);
        }
        const content = checkFileContent(bytes);
        if (!content.ok) return reject(`${source.fileName}: ${content.reason}`);
        if (content.mimeType !== source.mimeType) {
          return reject(`${source.fileName} isn't the kind of file its name says.`);
        }
        let count: number;
        try {
          count = await pagesIn({ bytes, mimeType: content.mimeType });
        } catch {
          return reject(
            `${source.fileName} looks damaged — export or scan it again and re-upload.`,
          );
        }
        read.push({
          id: source.id,
          fileName: source.fileName,
          mimeType: content.mimeType,
          bytes,
          hash: createHash("sha256").update(bytes).digest("hex"),
          pageFrom: pages + 1,
          pageTo: pages + count,
        });
        pages += count;
      }
      if (pages > BUNDLE_MAX_PAGES) {
        return reject(
          `This upload has ${pages} pages; at most ${BUNDLE_MAX_PAGES} are supported. Upload it in smaller parts.`,
        );
      }
      let bundleBytes = read[0].bytes;
      if (joined) {
        try {
          bundleBytes = await joinPages(read);
        } catch {
          return reject("These files could not be put together — upload them one at a time.");
        }
        // Our own file at a path of this upload: written again if a duplicate warning sent it back.
        const { error } = await storage.upload(bundlePath, bundleBytes, {
          contentType: PDF,
          upsert: true,
        });
        if (error) return reject("The upload could not be stored — try again.");
      }
      const fileHash = joined
        ? createHash("sha256").update(bundleBytes).digest("hex")
        : read[0].hash;
      const fileName =
        input.fileName && sources.length === 1
          ? input.fileName
          : uploadName(read.map((r) => r.fileName));

      try {
        return await sql.begin(async (tx) => {
          await tx`select pg_advisory_xact_lock_shared(hashtext('reporting_period_status'))`;
          await tx`select pg_advisory_xact_lock_shared(hashtext('org_units_tree'))`;
          const current = await loadUploadOptions(tx, ctx.session.userId);
          const period = resolvePeriod(current, input.reportingPeriodId);
          if (!current.targets.some((t) => t.orgUnitId === input.orgUnitId)) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You can't upload for that project.",
            });
          }
          const same = await sameFiles(
            tx,
            read.map((r) => r.hash),
          );
          if (same && !input.acknowledgeDuplicates) {
            return {
              status: "confirm" as const,
              warnings: {
                sameFile: true,
                existingRecords: 0,
                orgUnitName: target.name,
                metricName: "",
                periodLabel: period.label,
              } satisfies DuplicateWarnings,
            };
          }
          await tx`
            insert into public.documents (
              id, org_unit_id, reporting_period_id, storage_path, file_name, mime_type,
              file_size_bytes, file_hash, uploaded_by, is_bundle, description
            ) values (
              ${input.documentId}, ${input.orgUnitId}, ${input.reportingPeriodId}, ${bundlePath},
              ${fileName}, ${PDF}, ${bundleBytes.length}, ${fileHash}, ${ctx.session.userId}, true,
              ${input.description ?? null}
            )`;
          for (const [index, file] of read.entries()) {
            await tx`
              insert into public.document_bundle_sources (
                bundle_document_id, position, file_name, mime_type, file_size_bytes, file_hash,
                storage_path, page_from, page_to
              ) values (
                ${input.documentId}, ${index + 1}, ${file.fileName}, ${file.mimeType},
                ${file.bytes.length}, ${file.hash}, ${sourcePath(file)}, ${file.pageFrom},
                ${file.pageTo}
              )`;
          }
          if (input.declarations) checkDeclarations(current, input.orgUnitId, input.declarations);
          for (const [index, d] of declared.entries()) {
            await tx`
              insert into public.upload_declarations
                (bundle_document_id, position, metric_id, reporting_period_id, mode, declared_values,
                 declared_by, page_from, page_to)
              values (${input.documentId}, ${index + 1}, ${d.metricId}, ${d.reportingPeriodId}, ${d.mode},
                      ${tx.json(d.values)}, ${ctx.session.userId}, ${d.pageFrom}, ${d.pageTo})`;
          }
          const [job] = await tx<{ id: string }[]>`
            insert into public.ocr_jobs (document_id) values (${input.documentId}) returning id`;
          await writeAudit(tx, {
            eventType: "document.bundle_uploaded",
            entityType: "document",
            entityId: input.documentId,
            userId: ctx.session.userId,
            newValue: {
              file_name: fileName,
              file_size_bytes: bundleBytes.length,
              file_hash: fileHash,
              description: input.description ?? null,
              page_count: pages,
              files: read.map((r) => ({
                file_name: r.fileName,
                mime_type: r.mimeType,
                file_size_bytes: r.bytes.length,
                file_hash: r.hash,
                pages: [r.pageFrom, r.pageTo],
              })),
              org_unit_id: input.orgUnitId,
              reporting_period_id: input.reportingPeriodId,
              ocr_job_id: job.id,
              duplicate_acknowledged: same,
              declarations: declared,
            },
          });
          return { status: "recorded" as const, documentId: input.documentId };
        });
      } catch (error) {
        if (pgErrorCode(error) === "23505") badRequest("This upload was already recorded.");
        if (error instanceof TRPCError && error.code !== "INTERNAL_SERVER_ERROR") {
          return reject(error.message);
        }
        throw error;
      }
    }),

  /**
   * The uploader's PDFs whose split is not confirmed yet. They have no record, so My Submissions lists
   * them from here — otherwise leaving the split screen loses them. A failed one drops off after a week.
   */
  pending: upload.query(async ({ ctx }) => {
    const rows = await db()<
      { id: string; file_name: string; created_at: Date; job_status: string | null }[]
    >`
      select d.id, d.file_name, d.created_at, j.status::text as job_status
      from public.documents d
      left join public.ocr_jobs j on j.document_id = d.id
      where d.is_bundle and d.deleted_at is null and d.uploaded_by = ${ctx.session.userId}
        and not exists (select 1 from public.document_bundle_parts p
                         where p.bundle_document_id = d.id and p.status <> 'proposed')
        and (j.status is distinct from 'failed' or d.created_at > now() - interval '7 days')
      order by d.created_at desc`;
    return rows.map((row) => ({
      documentId: row.id,
      fileName: row.file_name,
      uploadedAt: row.created_at.toISOString(),
      status:
        row.job_status === "completed"
          ? ("ready" as const)
          : row.job_status === "failed"
            ? ("failed" as const)
            : ("processing" as const),
    }));
  }),

  /**
   * The uploader drops a PDF they uploaded by mistake. Only before anything is recorded from it, and not
   * while the worker is still reading it. The stored file is kept; the document is marked deleted.
   */
  discard: upload.input(z.object({ documentId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const sql = db();
    const bundle = await loadBundle(sql, input.documentId, ctx.session.userId);
    if (bundle.job_status !== "completed" && bundle.job_status !== "failed") {
      badRequest("This PDF is still being read — discard it once that has finished.");
    }
    await sql.begin(async (tx) => {
      const [recorded] = await tx`
        select 1 from public.document_bundle_parts
        where bundle_document_id = ${bundle.id} and status <> 'proposed' limit 1`;
      if (recorded) badRequest("Bills from this PDF are already recorded; it can't be discarded.");
      await tx`update public.documents set deleted_at = now() where id = ${bundle.id}`;
      await writeAudit(tx, {
        eventType: "document.bundle_discarded",
        entityType: "document",
        entityId: bundle.id,
        userId: ctx.session.userId,
        oldValue: { file_name: bundle.file_name },
      });
    });
    return { discarded: true };
  }),

  /** The review screen's data: status, the proposed bills, and what the uploader may record. */
  review: upload.input(z.object({ documentId: z.uuid() })).query(async ({ ctx, input }) => {
    const sql = db();
    const bundle = await loadBundle(sql, input.documentId, ctx.session.userId);
    const parts = await sql<
      {
        page_from: number;
        page_to: number;
        proposed_metric_id: string | null;
        status: string;
        type_name: string | null;
        bill_number: string | null;
        billing_period: string | null;
        created_document_id: string | null;
        created_file_name: string | null;
        metric_name: string | null;
        created_period_label: string | null;
      }[]
    >`
      select p.page_from, p.page_to, p.proposed_metric_id, p.status, dt.name as type_name,
             p.bill_number, p.billing_period,
             p.created_document_id, cd.file_name as created_file_name, m.name as metric_name,
             crp.label as created_period_label
      from public.document_bundle_parts p
      left join public.document_types dt on dt.id = p.proposed_document_type_id
      left join public.documents cd on cd.id = p.created_document_id
      left join public.reporting_periods crp on crp.id = cd.reporting_period_id
      left join public.esg_record_documents erd on erd.document_id = p.created_document_id and erd.is_primary
      left join public.esg_records r on r.id = erd.esg_record_id
      left join public.esg_metrics m on m.id = r.metric_id
      where p.bundle_document_id = ${bundle.id}
      order by p.part_number`;
    const sources = await sql<
      { file_name: string; mime_type: string; page_from: number; page_to: number }[]
    >`
      select file_name, mime_type, page_from, page_to from public.document_bundle_sources
      where bundle_document_id = ${bundle.id} order by position`;

    const options = await loadUploadOptions(sql, ctx.session.userId);
    const categories =
      options.targets.find((t) => t.orgUnitId === bundle.org_unit_id)?.categories ?? [];
    const done = parts.some((p) => p.status !== "proposed");
    const stored = await loadDeclarations(sql, bundle.id);
    const declarationRows = stored.length
      ? await sql<{ position: number; metric_name: string; period_label: string }[]>`
          select d.position, m.name as metric_name, rp.label as period_label
          from public.upload_declarations d
          join public.esg_metrics m on m.id = d.metric_id
          join public.reporting_periods rp on rp.id = d.reporting_period_id
          where d.bundle_document_id = ${bundle.id}`
      : [];
    const metricsById = new Map(categories.flatMap((c) => c.metrics).map((m) => [m.id, m]));
    const declarations: ReviewDeclaration[] = stored.map((d) => {
      const names = declarationRows.find((r) => r.position === d.position);
      const metric = metricsById.get(d.metric_id);
      const numbers = (metric?.entryFields ?? [])
        .map((f) => d.declared_values[f.key])
        .filter(Boolean)
        .join(" × ");
      const unit = metric?.unitKey ? (d.declared_values[metric.unitKey] ?? "") : "";
      return {
        position: d.position,
        metricId: d.metric_id,
        metricName: names?.metric_name ?? "",
        reportingPeriodId: d.reporting_period_id,
        periodLabel: names?.period_label ?? "",
        mode: d.mode,
        summary: `${numbers}${unit ? ` ${unit}` : ""}${d.mode === "total" ? " (total of the bills)" : ""}${
          d.page_from !== null && d.page_to !== null
            ? `, ${pagesLabel(d.page_from, d.page_to)}`
            : ""
        }`,
      };
    });
    const proposals = parts.filter((p) => p.status === "proposed");
    const match = stored.length
      ? matchBills(
          stored.map((d, i) => ({
            index: i,
            metricId: d.metric_id,
            periodId: d.reporting_period_id,
            mode: d.mode,
          })),
          proposals.map((p, i) => ({
            index: i,
            metricId: p.proposed_metric_id,
            periodId: periodForBill(p.billing_period, [
              ...options.periods,
              ...options.billingMonths,
            ]),
          })),
        )
      : null;
    const status: BundleReview["status"] = done
      ? "done"
      : bundle.job_status === "completed"
        ? "ready"
        : bundle.job_status === "failed"
          ? "failed"
          : "processing";
    // The upload's own period while it takes uploads, else the newest one that does.
    const defaultPeriodId = options.periods.some((p) => p.id === bundle.reporting_period_id)
      ? bundle.reporting_period_id
      : (options.periods[0]?.id ?? null);

    return {
      documentId: bundle.id,
      fileName: bundle.file_name,
      orgUnitName: bundle.org_unit_name,
      periodLabel: bundle.period_label,
      submittedAt: bundle.created_at.toISOString(),
      defaultPeriodId,
      // The periods that take uploads, and this year's billing months (late or closed: a bill is filed in
      // its own month, marked late).
      periods: [
        ...options.periods.map((p) => ({
          id: p.id,
          label: p.label,
          startDate: p.startDate,
          endDate: p.endDate,
          late: p.late,
        })),
        ...options.billingMonths
          .filter((m) => !options.periods.some((p) => p.id === m.id))
          .map((m) => ({
            id: m.id,
            label: m.label,
            startDate: m.startDate,
            endDate: m.endDate,
            late: true,
          })),
      ].sort((a, b) => b.startDate.localeCompare(a.startDate)),
      sources: sources.map((s) => ({
        fileName: s.file_name,
        mimeType: s.mime_type,
        pageFrom: s.page_from,
        pageTo: s.page_to,
      })),
      status,
      errorMessage: status === "failed" ? bundle.job_error : null,
      pageCount: bundle.page_total ?? 0,
      parts: proposals.map((p, i) => {
        // A bill paired with a typed row takes that row's bill type and period.
        const paired = match?.assignment[i] ?? null;
        const row = paired === null ? null : stored[paired];
        return {
          pageFrom: p.page_from,
          pageTo: p.page_to,
          documentTypeName: p.type_name,
          metricId: row?.metric_id ?? p.proposed_metric_id,
          billNumber: p.bill_number,
          billingPeriod: p.billing_period,
          // The period the bill's own billing period points to, among those that take uploads.
          proposedPeriodId:
            row?.reporting_period_id ??
            periodForBill(p.billing_period, [...options.periods, ...options.billingMonths]) ??
            defaultPeriodId,
          proposedDeclaration: row?.position ?? null,
        };
      }),
      declarations,
      categories,
      created: parts
        .filter((p) => p.created_document_id)
        .map((p) => ({
          documentId: p.created_document_id!,
          fileName: p.created_file_name ?? "",
          pageFrom: p.page_from,
          pageTo: p.page_to,
          metricName: p.metric_name,
          periodLabel: p.created_period_label ?? bundle.period_label,
        })),
    } satisfies BundleReview;
  }),

  /**
   * The uploader's final split: cut each kept bill out as its own PDF and record it. For an upload typed on
   * the Upload page (migration 0077) each kept bill is one of the typed rows (`declaration`, its position) or
   * gets its values typed here (`values`); a typed row that is not in the upload is dropped by name.
   */
  confirm: upload
    .input(
      z.object({
        documentId: z.uuid(),
        acknowledgeDuplicates: z.boolean().default(false),
        parts: z.array(PART).min(1).max(MAX_BUNDLE_PARTS),
        /** Typed rows (positions) the person says are not in this upload. */
        dropDeclarations: z.array(z.number().int().min(1)).max(MAX_BUNDLE_PARTS).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      const userId = ctx.session.userId;
      const bundle = await loadBundle(sql, input.documentId, userId);
      const existing = await loadParts(sql, bundle.id);
      if (bundle.job_status !== "completed" || existing.length === 0) {
        badRequest("This upload hasn't finished being read yet.");
      }
      if (existing.some((p) => p.status !== "proposed")) {
        badRequest("The bills in this upload were already recorded.");
      }
      const problem = checkBundleParts(input.parts, bundle.page_total ?? 0);
      if (problem) badRequest(problem);
      const options = await loadUploadOptions(sql, userId);
      const declarations = await loadDeclarations(sql, bundle.id);
      const plan = planBills(options, bundle, input.parts, declarations, input.dropDeclarations);

      const duplicates = await duplicateBills(sql, bundle, plan.kept, options);
      if (duplicates.length > 0 && !input.acknowledgeDuplicates) {
        return {
          status: "confirm" as const,
          duplicates,
          periodLabel: bundle.period_label,
          orgUnitName: bundle.org_unit_name,
        };
      }
      return recordBills(sql, {
        userId,
        bundle,
        parts: input.parts,
        existing,
        plan,
        declarations,
        duplicatesAcknowledged: duplicates.length > 0,
        automatic: false,
      });
    }),

  /**
   * The Upload page calls this once a typed upload has been read (migration 0077): when the bills OCR found
   * pair cleanly with the rows typed for it, they are recorded at once, each in its typed period and as its
   * typed bill type, with no separation page. Anything less clean waits for the person on that page.
   * Possible duplicates do not stop it: validation flags the same file and the same bill for review.
   */
  autoConfirm: upload.input(z.object({ documentId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const sql = db();
    const userId = ctx.session.userId;
    const bundle = await loadBundle(sql, input.documentId, userId);
    if (bundle.job_status === "failed") return { status: "failed" as const };
    if (bundle.job_status !== "completed") return { status: "processing" as const };
    const existing = await loadParts(sql, bundle.id);
    if (existing.some((p) => p.status !== "proposed")) return { status: "done" as const };
    const declarations = await loadDeclarations(sql, bundle.id);
    const check = (reason: string) => ({ status: "needs_check" as const, reason });
    if (declarations.length === 0 || existing.length === 0) {
      return check("Check where each bill starts on the next page.");
    }
    const options = await loadUploadOptions(sql, userId);
    const pageCount = bundle.page_total ?? 0;

    let parts: PartInput[];
    const only = declarations.length === 1 ? declarations[0] : null;
    if (declarations.every((d) => d.page_from !== null && d.page_to !== null)) {
      // The person said which pages each bill is (migration 0079): cut there, whatever the OCR proposed.
      parts = declarations.map((d) => ({
        pageFrom: d.page_from!,
        pageTo: d.page_to!,
        metricId: d.metric_id,
        skip: false,
        reportingPeriodId: d.reporting_period_id,
        declaration: d.position,
      }));
      const problem = checkBundleParts(parts, pageCount);
      if (problem) return check(`The pages typed don't fit the upload: ${problem}`);
    } else if (only?.mode === "pages_of_one") {
      // The person said the files are the pages of one bill: one bill, whatever the split proposed.
      parts = [
        {
          pageFrom: 1,
          pageTo: pageCount,
          metricId: only.metric_id,
          skip: false,
          reportingPeriodId: only.reporting_period_id,
          declaration: only.position,
        },
      ];
    } else {
      const declared: DeclaredBill[] = declarations.map((d, i) => ({
        index: i,
        metricId: d.metric_id,
        periodId: d.reporting_period_id,
        mode: d.mode,
      }));
      const match = matchBills(
        declared,
        existing.map((p, i) => ({
          index: i,
          metricId: p.proposed_metric_id,
          periodId: periodForBill(p.billing_period, [...options.periods, ...options.billingMonths]),
        })),
      );
      if (!match.clean) {
        const extra = match.assignment.filter((a) => a === null).length;
        return check(
          extra > 0
            ? `${existing.length} bills were found but ${declarations.length} ${declarations.length === 1 ? "was" : "were"} typed. Say which is which on the next page and type the values of the others.`
            : `${declarations.length} bills were typed but only ${existing.length} found. Check the split on the next page.`,
        );
      }
      parts = existing.map((p, i) => {
        const d = declarations[match.assignment[i]!];
        return {
          pageFrom: p.page_from,
          pageTo: p.page_to,
          metricId: d.metric_id,
          skip: false,
          reportingPeriodId: d.reporting_period_id,
          declaration: d.position,
        };
      });
    }

    let plan: BillPlan;
    try {
      if (checkBundleParts(parts, pageCount)) throw new Error("split");
      plan = planBills(options, bundle, parts, declarations, []);
    } catch (error) {
      return check(
        error instanceof TRPCError ? error.message : "Check the split on the next page.",
      );
    }
    try {
      const duplicates = await duplicateBills(sql, bundle, plan.kept, options);
      const recorded = await recordBills(sql, {
        userId,
        bundle,
        parts,
        existing,
        plan,
        declarations,
        duplicatesAcknowledged: duplicates.length > 0,
        automatic: true,
      });
      return { status: "recorded" as const, count: recorded.count };
    } catch (error) {
      // Recorded by another tab in the meantime, or a period closed: the person sees it on the next page.
      if (error instanceof TRPCError && error.code === "BAD_REQUEST") {
        const [done] = await sql`
          select 1 from public.document_bundle_parts
          where bundle_document_id = ${bundle.id} and status <> 'proposed' limit 1`;
        return done ? { status: "done" as const } : check(error.message);
      }
      throw error;
    }
  }),

  /** Where each of this person's uploads stands, for the rows of the Upload page. */
  rowStatus: upload
    .input(z.object({ documentIds: z.array(z.uuid()).min(1).max(MAX_BUNDLE_PARTS) }))
    .query(async ({ ctx, input }) => {
      const rows = await db()<
        {
          id: string;
          job_status: string | null;
          error_message: string | null;
          recorded: number;
          documents: { id: string; file_name: string }[] | null;
        }[]
      >`
        select d.id, j.status::text as job_status, j.error_message,
               (select count(*)::int from public.document_bundle_parts p
                 where p.bundle_document_id = d.id and p.status = 'created') as recorded,
               (select json_agg(json_build_object('id', cd.id, 'file_name', cd.file_name)
                                order by p.part_number)
                  from public.document_bundle_parts p
                  join public.documents cd on cd.id = p.created_document_id
                  where p.bundle_document_id = d.id) as documents
        from public.documents d
        left join public.ocr_jobs j on j.document_id = d.id
        where d.id = any(${input.documentIds}) and d.is_bundle and d.deleted_at is null
          and d.uploaded_by = ${ctx.session.userId}`;
      return rows.map((r) => ({
        documentId: r.id,
        status:
          r.recorded > 0
            ? ("done" as const)
            : r.job_status === "completed"
              ? ("ready" as const)
              : r.job_status === "failed"
                ? ("failed" as const)
                : ("processing" as const),
        errorMessage: r.job_status === "failed" ? r.error_message : null,
        documents: (r.documents ?? []).map((x) => ({ documentId: x.id, fileName: x.file_name })),
      }));
    }),

  /** The person's unfinished Upload table (owner's choice: drafts), or null. Files are not kept. */
  draft: upload.query(async ({ ctx }) => {
    const [row] = await db()<{ rows: unknown[]; updated_at: Date }[]>`
      select rows, updated_at from public.upload_drafts where user_id = ${ctx.session.userId}`;
    return row ? { rows: row.rows, savedAt: row.updated_at.toISOString() } : null;
  }),

  saveDraft: upload
    .input(z.object({ rows: z.array(z.record(z.string(), z.unknown())).max(MAX_BUNDLE_PARTS) }))
    .mutation(async ({ ctx, input }) => {
      if (JSON.stringify(input.rows).length > 100_000)
        badRequest("The draft is too large to save.");
      const [row] = await db()<{ updated_at: Date }[]>`
        insert into public.upload_drafts (user_id, rows, updated_at)
        values (${ctx.session.userId}, ${db().json(input.rows as never)}, now())
        on conflict (user_id) do update set rows = excluded.rows, updated_at = now()
        returning updated_at`;
      return { savedAt: row.updated_at.toISOString() };
    }),

  clearDraft: upload.mutation(async ({ ctx }) => {
    await db()`delete from public.upload_drafts where user_id = ${ctx.session.userId}`;
    return null;
  }),
});
