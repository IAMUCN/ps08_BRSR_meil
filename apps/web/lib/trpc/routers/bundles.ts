import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { db, pgErrorCode } from "@/lib/db";
import {
  BUNDLE_MAX_PAGES,
  MAX_BUNDLE_PARTS,
  checkBundleParts,
  pagesLabel,
} from "@/lib/documents/bundle";
import { extractPages, pdfPageCount } from "@/lib/documents/split-pdf";
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
  NO_PERIOD,
  badRequest,
  enforceUploadLimit,
  loadUploadOptions,
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
};

export type BundleCreated = {
  documentId: string;
  fileName: string;
  pageFrom: number;
  pageTo: number;
  metricName: string | null;
};

export type BundleReview = {
  documentId: string;
  fileName: string;
  orgUnitName: string;
  periodLabel: string;
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
};

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "That PDF wasn't found." });

/** The bundle, only for the person who uploaded it. Not found and not yours look the same. */
async function loadBundle(
  sql: ReturnType<typeof db>,
  documentId: string,
  userId: string,
): Promise<BundleRow> {
  const [row] = await sql<BundleRow[]>`
    select d.id, d.org_unit_id, o.name as org_unit_name, d.reporting_period_id,
           rp.label as period_label, d.file_name, d.storage_path, d.uploaded_by,
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
  prepareUpload: upload
    .input(
      z.object({
        orgUnitId: z.uuid(),
        fileSize: z.number().int().positive(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        acknowledgeDuplicates: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      await enforceUploadLimit(ctx.session.userId);
      const options = await loadUploadOptions(sql, ctx.session.userId);
      if (!options.openPeriod) badRequest(NO_PERIOD);
      const target = options.targets.find((t) => t.orgUnitId === input.orgUnitId);
      if (!target)
        throw new TRPCError({ code: "FORBIDDEN", message: "You can't upload for that project." });
      if (input.fileSize > MAX_UPLOAD_BYTES) {
        badRequest(
          `This file is ${formatMegabytes(input.fileSize)}; the limit is ${formatMegabytes(MAX_UPLOAD_BYTES)}.`,
        );
      }
      const [{ same }] = await sql<{ same: boolean }[]>`
        select exists (select 1 from public.documents
                       where file_hash = ${input.sha256} and deleted_at is null) as same`;
      if (same && !input.acknowledgeDuplicates) {
        return {
          status: "confirm" as const,
          warnings: {
            sameFile: true,
            existingRecords: 0,
            orgUnitName: target.name,
            metricName: "",
            periodLabel: options.openPeriod.label,
          } satisfies DuplicateWarnings,
        };
      }
      const documentId = randomUUID();
      const path = evidencePath(input.orgUnitId, options.openPeriod.id, documentId, PDF)!;
      const { data, error } = await createSupabaseAdminClient()
        .storage.from(evidenceBucket())
        .createSignedUploadUrl(path);
      if (error) throw error;
      return {
        status: "ready" as const,
        documentId,
        reportingPeriodId: options.openPeriod.id,
        signedUrl: data.signedUrl,
      };
    }),

  completeUpload: upload
    .input(
      z.object({
        orgUnitId: z.uuid(),
        documentId: z.uuid(),
        reportingPeriodId: z.uuid(),
        fileName: z.string().trim().min(1).max(255),
        acknowledgeDuplicates: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      const storage = createSupabaseAdminClient().storage.from(evidenceBucket());
      const path = evidencePath(input.orgUnitId, input.reportingPeriodId, input.documentId, PDF)!;
      const reject = async (message: string): Promise<never> => {
        const [recorded] = await sql`select 1 from public.documents where id = ${input.documentId}`;
        if (!recorded) await storage.remove([path]);
        badRequest(message);
      };

      const options = await loadUploadOptions(sql, ctx.session.userId);
      const target = options.targets.find((t) => t.orgUnitId === input.orgUnitId);
      if (!target)
        throw new TRPCError({ code: "FORBIDDEN", message: "You can't upload for that project." });
      if (!options.openPeriod) return reject(NO_PERIOD);
      if (options.openPeriod.id !== input.reportingPeriodId) {
        return reject("The reporting period changed while you were uploading — upload again.");
      }

      const { data: blob, error: downloadError } = await storage.download(path);
      if (downloadError || !blob) badRequest("The file didn't finish uploading — try again.");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length > MAX_UPLOAD_BYTES) {
        return reject(`This file is ${formatMegabytes(bytes.length)}.`);
      }
      const content = checkFileContent(bytes);
      if (!content.ok) return reject(content.reason);
      if (content.mimeType !== PDF) return reject("A PDF with several bills must be a PDF file.");
      let pages: number;
      try {
        pages = await pdfPageCount(bytes);
      } catch {
        return reject("This PDF looks damaged — export or scan it again and re-upload.");
      }
      if (pages > BUNDLE_MAX_PAGES) {
        return reject(
          `This PDF has ${pages} pages; at most ${BUNDLE_MAX_PAGES} are supported. Split it into smaller PDFs.`,
        );
      }
      const fileHash = createHash("sha256").update(bytes).digest("hex");

      try {
        return await sql.begin(async (tx) => {
          await tx`select pg_advisory_xact_lock_shared(hashtext('reporting_period_status'))`;
          await tx`select pg_advisory_xact_lock_shared(hashtext('org_units_tree'))`;
          const current = await loadUploadOptions(tx, ctx.session.userId);
          if (current.openPeriod?.id !== input.reportingPeriodId) badRequest(NO_PERIOD);
          if (!current.targets.some((t) => t.orgUnitId === input.orgUnitId)) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You can't upload for that project.",
            });
          }
          const [{ same }] = await tx<{ same: boolean }[]>`
            select exists (select 1 from public.documents
                           where file_hash = ${fileHash} and deleted_at is null) as same`;
          if (same && !input.acknowledgeDuplicates) {
            return {
              status: "confirm" as const,
              warnings: {
                sameFile: true,
                existingRecords: 0,
                orgUnitName: target.name,
                metricName: "",
                periodLabel: current.openPeriod.label,
              } satisfies DuplicateWarnings,
            };
          }
          await tx`
            insert into public.documents (
              id, org_unit_id, reporting_period_id, storage_path, file_name, mime_type,
              file_size_bytes, file_hash, uploaded_by, is_bundle
            ) values (
              ${input.documentId}, ${input.orgUnitId}, ${input.reportingPeriodId}, ${path},
              ${input.fileName}, ${PDF}, ${bytes.length}, ${fileHash}, ${ctx.session.userId}, true
            )`;
          const [job] = await tx<{ id: string }[]>`
            insert into public.ocr_jobs (document_id) values (${input.documentId}) returning id`;
          await writeAudit(tx, {
            eventType: "document.bundle_uploaded",
            entityType: "document",
            entityId: input.documentId,
            userId: ctx.session.userId,
            newValue: {
              file_name: input.fileName,
              file_size_bytes: bytes.length,
              file_hash: fileHash,
              page_count: pages,
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
        created_document_id: string | null;
        created_file_name: string | null;
        metric_name: string | null;
      }[]
    >`
      select p.page_from, p.page_to, p.proposed_metric_id, p.status, dt.name as type_name,
             p.created_document_id, cd.file_name as created_file_name, m.name as metric_name
      from public.document_bundle_parts p
      left join public.document_types dt on dt.id = p.proposed_document_type_id
      left join public.documents cd on cd.id = p.created_document_id
      left join public.esg_record_documents erd on erd.document_id = p.created_document_id and erd.is_primary
      left join public.esg_records r on r.id = erd.esg_record_id
      left join public.esg_metrics m on m.id = r.metric_id
      where p.bundle_document_id = ${bundle.id}
      order by p.part_number`;

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

    return {
      documentId: bundle.id,
      fileName: bundle.file_name,
      orgUnitName: bundle.org_unit_name,
      periodLabel: bundle.period_label,
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
        { part_number: number; page_from: number; page_to: number; status: string }[]
      >`select part_number, page_from, page_to, status from public.document_bundle_parts
        where bundle_document_id = ${bundle.id} order by part_number`;
      if (bundle.job_status !== "completed" || existing.length === 0) {
        badRequest("This PDF hasn't finished being read yet.");
      }
      if (existing.some((p) => p.status !== "proposed")) {
        badRequest("The bills in this PDF were already recorded.");
      }
      const problem = checkBundleParts(input.parts, bundle.page_total ?? 0);
      if (problem) badRequest(problem);

      // Each kept bill must be one the uploader could have uploaded here on its own.
      const options = await loadUploadOptions(sql, userId);
      if (options.openPeriod?.id !== bundle.reporting_period_id) {
        badRequest("The reporting period changed since you uploaded this PDF — upload it again.");
      }
      const kept = input.parts.flatMap((part, index) => (part.skip ? [] : [{ part, index }]));
      const metricNames = new Map<string, string>();
      for (const { part, index } of kept) {
        try {
          const { metric } = resolveTarget(options, bundle.org_unit_id, part.metricId!);
          metricNames.set(part.metricId!, metric.name);
        } catch {
          badRequest(`Bill ${index + 1}: you can't record that activity for this project.`);
        }
      }

      // Duplicates: records already there for this project, period and activity, or an earlier bill in
      // this same PDF for the same activity. Warned about, never blocked (Phase 5 rule).
      const duplicates: { bill: number; metricName: string; existingRecords: number }[] = [];
      for (const [position, { part, index }] of kept.entries()) {
        const earlier = kept
          .slice(0, position)
          .filter((k) => k.part.metricId === part.metricId).length;
        const [{ existingRecords }] = await sql<{ existingRecords: number }[]>`
          select count(*)::int as "existingRecords" from public.esg_records
          where org_unit_id = ${bundle.org_unit_id}
            and reporting_period_id = ${bundle.reporting_period_id}
            and metric_id = ${part.metricId!}`;
        if (existingRecords + earlier > 0) {
          duplicates.push({
            bill: index + 1,
            metricName: metricNames.get(part.metricId!)!,
            existingRecords: existingRecords + earlier,
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

      // Bytes first, then rows: cut and store every bill, then record them in one transaction.
      const storage = createSupabaseAdminClient().storage.from(evidenceBucket());
      const { data: blob, error: downloadError } = await storage.download(bundle.storage_path);
      if (downloadError || !blob) badRequest("The PDF could not be read — upload it again.");
      const original = new Uint8Array(await blob.arrayBuffer());
      const base = bundle.file_name.replace(/\.pdf$/i, "");

      const stored: { id: string; path: string; bytes: Uint8Array; hash: string; name: string }[] =
        [];
      const cleanup = () => storage.remove(stored.map((s) => s.path));
      try {
        for (const { part, index } of kept) {
          const bytes = await extractPages(original, part.pageFrom, part.pageTo);
          if (!checkFileContent(bytes).ok) {
            badRequest(`Bill ${index + 1} could not be cut out of the PDF.`);
          }
          const id = randomUUID();
          const path = evidencePath(bundle.org_unit_id, bundle.reporting_period_id, id, PDF)!;
          const { error } = await storage.upload(path, bytes, { contentType: PDF, upsert: false });
          if (error) throw error;
          stored.push({
            id,
            path,
            bytes,
            hash: createHash("sha256").update(bytes).digest("hex"),
            name: `${base} (${pagesLabel(part.pageFrom, part.pageTo)}).pdf`,
          });
        }

        return await sql.begin(async (tx) => {
          await tx`select pg_advisory_xact_lock_shared(hashtext('reporting_period_status'))`;
          await tx`select pg_advisory_xact_lock_shared(hashtext('org_units_tree'))`;
          const current = await loadUploadOptions(tx, userId);
          if (current.openPeriod?.id !== bundle.reporting_period_id) badRequest(NO_PERIOD);
          // One confirmation only: lock the proposal and check nothing has been recorded since.
          const locked = await tx<{ status: string }[]>`
            select status from public.document_bundle_parts
            where bundle_document_id = ${bundle.id} for update`;
          if (locked.some((p) => p.status !== "proposed")) {
            badRequest("The bills in this PDF were already recorded.");
          }

          const recorded: { documentId: string; esgRecordId: string }[] = [];
          for (const [position, { part }] of kept.entries()) {
            const file = stored[position];
            resolveTarget(current, bundle.org_unit_id, part.metricId!);
            const [metricRow] = await tx<
              { scope_id: string | null; requires_calculation: boolean }[]
            >`select scope_id, requires_calculation from public.esg_metrics
              where id = ${part.metricId!}`;
            await tx`
              insert into public.documents (
                id, org_unit_id, reporting_period_id, storage_path, file_name, mime_type,
                file_size_bytes, file_hash, uploaded_by, bundle_document_id
              ) values (
                ${file.id}, ${bundle.org_unit_id}, ${bundle.reporting_period_id}, ${file.path},
                ${file.name}, ${PDF}, ${file.bytes.length}, ${file.hash}, ${userId}, ${bundle.id}
              )`;
            const [record] = await tx<{ id: string }[]>`
              insert into public.esg_records (
                org_unit_id, reporting_period_id, metric_id, scope_id, submitted_by,
                verification_status, calculation_status, is_duplicate_flag
              ) values (
                ${bundle.org_unit_id}, ${bundle.reporting_period_id}, ${part.metricId!},
                ${metricRow.scope_id}, ${userId}, 'document_uploaded',
                ${metricRow.requires_calculation ? "pending" : "not_applicable"}, false
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
                mime_type: PDF,
                file_size_bytes: file.bytes.length,
                file_hash: file.hash,
                org_unit_id: bundle.org_unit_id,
                reporting_period_id: bundle.reporting_period_id,
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
          await tx`delete from public.document_bundle_parts where bundle_document_id = ${bundle.id}`;
          let keptIndex = 0;
          for (const [index, part] of input.parts.entries()) {
            const createdId = part.skip ? null : stored[keptIndex++].id;
            await tx`
              insert into public.document_bundle_parts
                (bundle_document_id, part_number, page_from, page_to, proposed_metric_id,
                 status, created_document_id)
              values (${bundle.id}, ${index + 1}, ${part.pageFrom}, ${part.pageTo}, ${part.metricId},
                      ${part.skip ? "skipped" : "created"}, ${createdId})`;
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
