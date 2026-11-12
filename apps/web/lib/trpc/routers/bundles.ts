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
  type DuplicateWarnings,
  type UploadCategory,
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
      periods: options.periods.map((p) => ({
        id: p.id,
        label: p.label,
        startDate: p.startDate,
        endDate: p.endDate,
        late: p.late,
      })),
      sources: sources.map((s) => ({
        fileName: s.file_name,
        mimeType: s.mime_type,
        pageFrom: s.page_from,
        pageTo: s.page_to,
      })),
      status,
      errorMessage: status === "failed" ? bundle.job_error : null,
      pageCount: bundle.page_total ?? 0,
      parts: parts
        .filter((p) => p.status === "proposed")
        .map((p) => ({
          pageFrom: p.page_from,
          pageTo: p.page_to,
          documentTypeName: p.type_name,
          metricId: p.proposed_metric_id,
          billNumber: p.bill_number,
          billingPeriod: p.billing_period,
          // The period the bill's own billing period points to, among those that take uploads.
          proposedPeriodId: periodForBill(p.billing_period, options.periods) ?? defaultPeriodId,
        })),
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

  /** The uploader's final split: cut each kept bill out as its own PDF and record it. */
  confirm: upload
    .input(
      z.object({
        documentId: z.uuid(),
        acknowledgeDuplicates: z.boolean().default(false),
        parts: z
          .array(
            z.object({
              pageFrom: z.number().int(),
              pageTo: z.number().int(),
              metricId: z.uuid().nullable(),
              skip: z.boolean(),
              /** The bill's reporting period; omitted = the upload's own. */
              reportingPeriodId: z.uuid().optional(),
            }),
          )
          .min(1)
          .max(MAX_BUNDLE_PARTS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      const userId = ctx.session.userId;
      const bundle = await loadBundle(sql, input.documentId, userId);
      const existing = await sql<
        {
          part_number: number;
          page_from: number;
          page_to: number;
          status: string;
          bill_number: string | null;
          billing_period: string | null;
        }[]
      >`select part_number, page_from, page_to, status, bill_number, billing_period
        from public.document_bundle_parts
        where bundle_document_id = ${bundle.id} order by part_number`;
      if (bundle.job_status !== "completed" || existing.length === 0) {
        badRequest("This upload hasn't finished being read yet.");
      }
      if (existing.some((p) => p.status !== "proposed")) {
        badRequest("The bills in this upload were already recorded.");
      }
      const problem = checkBundleParts(input.parts, bundle.page_total ?? 0);
      if (problem) badRequest(problem);

      // Each kept bill must be one the uploader could have uploaded here on its own, in its period.
      const options = await loadUploadOptions(sql, userId);
      const kept = input.parts.flatMap((part, index) => {
        if (part.skip) return [];
        const periodId = part.reportingPeriodId ?? bundle.reporting_period_id;
        return [{ part, index, periodId }];
      });
      const periodLabels = new Map(options.periods.map((p) => [p.id, p.label]));
      const metricNames = new Map<string, string>();
      for (const { part, index, periodId } of kept) {
        if (!periodLabels.has(periodId)) {
          badRequest(
            `Bill ${index + 1}: that reporting period doesn't take uploads now — choose another one.`,
          );
        }
        try {
          const { metric } = resolveTarget(options, bundle.org_unit_id, part.metricId!);
          metricNames.set(part.metricId!, metric.name);
        } catch {
          badRequest(`Bill ${index + 1}: you can't record that activity for this project.`);
        }
      }

      // Duplicates: records already there for this project, period and activity, or an earlier bill in
      // this same upload for the same activity and period. Warned about, never blocked (Phase 5 rule).
      const duplicates: {
        bill: number;
        metricName: string;
        existingRecords: number;
        periodLabel: string;
      }[] = [];
      for (const [position, { part, index, periodId }] of kept.entries()) {
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
            metricName: metricNames.get(part.metricId!)!,
            existingRecords: existingRecords + earlier,
            periodLabel: periodLabels.get(periodId)!,
          });
        }
      }
      if (duplicates.length > 0 && !input.acknowledgeDuplicates) {
        return {
          status: "confirm" as const,
          duplicates,
          periodLabel: bundle.period_label,
          orgUnitName: bundle.org_unit_name,
        };
      }

      // Bytes first, then rows: store every bill, then record them in one transaction. A bill that is
      // exactly one of the uploaded files is that file, unchanged; any other is cut out of the upload.
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
          const whole = sources.find(
            (s) => s.page_from === part.pageFrom && s.page_to === part.pageTo,
          );
          const within = sources.find(
            (s) => s.page_from <= part.pageFrom && part.pageTo <= s.page_to,
          );
          let bytes: Uint8Array;
          let mimeType = PDF;
          let name: string;
          if (whole) {
            const { data: blob, error } = await storage.download(whole.storage_path);
            if (error || !blob)
              badRequest(`Bill ${index + 1}: ${whole.file_name} could not be read.`);
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
          const { error } = await storage.upload(path, bytes, {
            contentType: mimeType,
            upsert: false,
          });
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
            if (!current.periods.some((p) => p.id === periodId)) badRequest(PERIOD_CLOSED);
          }
          // One confirmation only: lock the proposal and check nothing has been recorded since.
          const locked = await tx<{ status: string }[]>`
            select status from public.document_bundle_parts
            where bundle_document_id = ${bundle.id} for update`;
          if (locked.some((p) => p.status !== "proposed")) {
            badRequest("The bills in this upload were already recorded.");
          }

          const recorded: { documentId: string; esgRecordId: string }[] = [];
          for (const [position, { part, periodId }] of kept.entries()) {
            const file = stored[position];
            resolveTarget(current, bundle.org_unit_id, part.metricId!);
            const [metricRow] = await tx<
              { scope_id: string | null; requires_calculation: boolean }[]
            >`select scope_id, requires_calculation from public.esg_metrics
              where id = ${part.metricId!}`;
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
                verification_status, calculation_status, is_duplicate_flag, submitted_late
              ) values (
                ${bundle.org_unit_id}, ${periodId}, ${part.metricId!},
                ${metricRow.scope_id}, ${userId}, 'document_uploaded',
                ${metricRow.requires_calculation ? "pending" : "not_applicable"}, false,
                -- Late if the upload arrived after the bill's period was due (migration 0056).
                (select (d.created_at at time zone 'Asia/Kolkata')::date
                          > coalesce(p.submission_closes_on, p.end_date)
                 from public.documents d, public.reporting_periods p
                 where d.id = ${bundle.id} and p.id = ${periodId})
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
              },
            });
            recorded.push({ documentId: file.id, esgRecordId: record.id });
          }

          // The proposal is replaced by what the uploader confirmed (the proposal is in the audit log).
          // What OCR read on a bill is kept when its pages did not change.
          await tx`delete from public.document_bundle_parts where bundle_document_id = ${bundle.id}`;
          let keptIndex = 0;
          for (const [index, part] of input.parts.entries()) {
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
              parts: input.parts,
              created_document_ids: recorded.map((r) => r.documentId),
              duplicates_acknowledged: duplicates.length > 0,
            },
          });
          return { status: "recorded" as const, count: recorded.length };
        });
      } catch (error) {
        await cleanup();
        if (pgErrorCode(error) === "23505") badRequest("These bills were already recorded.");
        throw error;
      }
    }),
});
