import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { ActiveSession } from "@/lib/auth/session";
import { db, pgErrorCode, type Tx } from "@/lib/db";
import { uploadTargets } from "@/lib/documents/rules";
import type { OrgNode } from "@/lib/org/rules";
import {
  DEFAULT_ACCEPTED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  acceptedTypesLabel,
  checkFileContent,
  evidenceBucket,
  evidencePath,
  formatMegabytes,
} from "@/lib/storage/evidence";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { permissionProcedure, router } from "@/lib/trpc/init";
import { documentAccess } from "@/lib/verification/access";
import { bucket, count, exceeded, rateLimits } from "@/lib/security/rate-limit";

// Phase 5 document ingestion (.grill/phase-5-document-ingestion-decisions.md; SCHEMA_DEVIATIONS.md D3).
// Bytes first, then rows: prepareUpload issues a signed upload URL, completeUpload re-reads the stored
// object and records it. Scope is decided here from the session, never from client-supplied identity.

const upload = permissionProcedure("document.upload");

export type Sql = Tx | ReturnType<typeof db>;

export type UploadMetric = {
  id: string;
  name: string;
  unit: string;
  acceptedMimeTypes: string[];
};
export type UploadCategory = { id: string; name: string; metrics: UploadMetric[] };
export type UploadTarget = {
  orgUnitId: string;
  name: string;
  unitType: string;
  categories: UploadCategory[];
};
export type UploadOptions = {
  openPeriod: { id: string; label: string } | null;
  targets: UploadTarget[];
  maxBytes: number;
};

export type DuplicateWarnings = {
  sameFile: boolean;
  existingRecords: number;
  orgUnitName: string;
  metricName: string;
  periodLabel: string;
};

export const NO_PERIOD = "No active reporting period — contact your Admin.";
const NOT_ALLOWED = "You can't upload that category for that project.";

export function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

export async function loadUploadOptions(sql: Sql, userId: string): Promise<UploadOptions> {
  const [period] = await sql<{ id: string; label: string }[]>`
    select id, label from public.reporting_periods where status = 'open'`;

  const nodeRows = await sql<
    { id: string; parent_id: string | null; unit_type: string; status: string; name: string }[]
  >`select id, parent_id, unit_type, status, name from public.org_units where deleted_at is null`;
  const nodes: OrgNode[] = nodeRows.map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    unitType: r.unit_type as OrgNode["unitType"],
    status: r.status as OrgNode["status"],
  }));

  // Admin works in /admin and does not upload (03_APP_FLOW.md §2.3 "All non-admin roles").
  const assignments = await sql<{ org_unit_id: string; role_id: string }[]>`
    select uoa.org_unit_id, uoa.role_id
    from public.user_org_assignments uoa join public.roles r on r.id = uoa.role_id
    where uoa.user_id = ${userId} and uoa.revoked_at is null and r.code <> 'admin'`;
  const uploadRoles = await sql<{ role_id: string }[]>`
    select rp.role_id from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where p.code = 'document.upload'`;

  const metricRows = await sql<
    {
      id: string;
      name: string;
      unit: string;
      category_id: string;
      category_name: string;
      owning_role_id: string | null;
      accepted: string[] | null;
    }[]
  >`
    select m.id, m.name, m.unit, c.id as category_id, c.name as category_name, c.owning_role_id,
      (select array_agg(distinct t.mime order by t.mime)
         from public.document_type_metric_mappings map
         join public.document_types dt on dt.id = map.document_type_id
         cross join unnest(dt.accepted_mime_types) as t (mime)
         where map.metric_id = m.id) as accepted
    from public.esg_metrics m join public.esg_categories c on c.id = m.category_id
    where m.deleted_at is null
    order by c.name, m.name`;

  const categoriesById = new Map<string, UploadCategory & { owningRoleId: string | null }>();
  for (const row of metricRows) {
    const category = categoriesById.get(row.category_id) ?? {
      id: row.category_id,
      name: row.category_name,
      owningRoleId: row.owning_role_id,
      metrics: [],
    };
    category.metrics.push({
      id: row.id,
      name: row.name,
      unit: row.unit,
      acceptedMimeTypes: row.accepted ?? DEFAULT_ACCEPTED_MIME_TYPES,
    });
    categoriesById.set(row.category_id, category);
  }

  const targetMap = uploadTargets(
    nodes,
    assignments.map((a) => ({ orgUnitId: a.org_unit_id, roleId: a.role_id })),
    new Set(uploadRoles.map((r) => r.role_id)),
    [...categoriesById.values()],
  );
  const targets = nodeRows
    .filter((n) => targetMap.has(n.id))
    .map((n) => ({
      orgUnitId: n.id,
      name: n.name,
      unitType: n.unit_type,
      categories: targetMap.get(n.id)!.map((id) => {
        const { name, metrics } = categoriesById.get(id)!;
        return { id, name, metrics };
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { openPeriod: period ?? null, targets, maxBytes: MAX_UPLOAD_BYTES };
}

/** Resolves the target node + metric for this user, or throws a non-revealing error. */
export function resolveTarget(options: UploadOptions, orgUnitId: string, metricId: string) {
  const target = options.targets.find((t) => t.orgUnitId === orgUnitId);
  const metric = target?.categories.flatMap((c) => c.metrics).find((m) => m.id === metricId);
  if (!target || !metric) throw new TRPCError({ code: "FORBIDDEN", message: NOT_ALLOWED });
  return { target, metric };
}

function checkDeclaredFile(metric: UploadMetric, size: number, mimeType: string) {
  if (size > MAX_UPLOAD_BYTES) {
    badRequest(
      `This file is ${formatMegabytes(size)}; the limit is ${formatMegabytes(MAX_UPLOAD_BYTES)}. Scan at a lower resolution or split the document.`,
    );
  }
  if (!metric.acceptedMimeTypes.includes(mimeType)) {
    badRequest(`Invalid file type — upload a ${acceptedTypesLabel(metric.acceptedMimeTypes)}.`);
  }
}

export async function duplicateWarnings(
  sql: Sql,
  hash: string,
  orgUnitId: string,
  periodId: string,
  metricId: string,
  replacedRecordId: string | null = null,
): Promise<{ sameFile: boolean; existingRecords: number }> {
  // Organization-wide on purpose (same bill filed by two projects); the message never says where.
  const [{ same_file, existing_records }] = await sql<
    { same_file: boolean; existing_records: number }[]
  >`
    select
      exists (select 1 from public.documents where file_hash = ${hash} and deleted_at is null) as same_file,
      (select count(*)::int from public.esg_records
        where org_unit_id = ${orgUnitId} and reporting_period_id = ${periodId}
          and metric_id = ${metricId}
          and (${replacedRecordId}::uuid is null or id <> ${replacedRecordId})) as existing_records`;
  return { sameFile: same_file, existingRecords: existing_records };
}

const fileInput = {
  orgUnitId: z.uuid(),
  metricId: z.uuid(),
  mimeType: z.string().max(100),
  acknowledgeDuplicates: z.boolean().default(false),
  /** Re-uploading a clearer copy after a failed extraction (03_APP_FLOW.md §4.5). */
  replacesDocumentId: z.uuid().optional(),
};

export type ReplacementTarget = {
  documentId: string;
  recordId: string;
  fileName: string;
  orgUnitId: string;
  metricId: string;
};

/**
 * The failed document this upload replaces, or null. Only a document whose extraction failed and whose
 * record is still waiting can be replaced, and only by someone who could verify it.
 */
async function replacementTarget(
  sql: Sql,
  session: ActiveSession,
  documentId: string | undefined,
  expected?: { orgUnitId: string; metricId: string },
): Promise<ReplacementTarget | null> {
  if (!documentId) return null;
  const access = await documentAccess(session, documentId);
  if (!access?.canVerify) badRequest("That document can't be replaced.");
  const [row] = await sql<
    {
      record_id: string;
      file_name: string;
      org_unit_id: string;
      metric_id: string;
      job_status: string | null;
      verification_status: string;
      data_quality_state: string;
    }[]
  >`
    select r.id as record_id, d.file_name, r.org_unit_id, r.metric_id, j.status::text as job_status,
           r.verification_status::text, r.data_quality_state::text
    from public.documents d
    join public.esg_record_documents erd on erd.document_id = d.id and erd.is_primary
    join public.esg_records r on r.id = erd.esg_record_id
    left join public.ocr_jobs j on j.document_id = d.id
    where d.id = ${documentId} and d.deleted_at is null`;
  if (!row) badRequest("That document can't be replaced.");
  if (
    row.job_status !== "failed" ||
    row.verification_status !== "document_uploaded" ||
    row.data_quality_state === "rejected"
  ) {
    badRequest("That document no longer needs replacing.");
  }
  if (expected && (row.org_unit_id !== expected.orgUnitId || row.metric_id !== expected.metricId)) {
    badRequest("A replacement must be for the same project and activity.");
  }
  return {
    documentId,
    recordId: row.record_id,
    fileName: row.file_name,
    orgUnitId: row.org_unit_id,
    metricId: row.metric_id,
  };
}

/** Abuse protection (SECURITY_REVIEW.md): every signed upload URL issued counts, completed or not. */
export async function enforceUploadLimit(userId: string): Promise<void> {
  const limits = await rateLimits();
  const uploads = bucket("upload-user", userId);
  if (await exceeded(uploads, limits.uploads_per_user, limits.upload_window_minutes)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Upload limit reached — at most ${limits.uploads_per_user} uploads every ${limits.upload_window_minutes} minutes. Try again shortly.`,
    });
  }
  await count(uploads);
}

export const documentsRouter = router({
  uploadOptions: upload.query(({ ctx }) => loadUploadOptions(db(), ctx.session.userId)),

  /** Context for "re-upload a clearer copy" (03_APP_FLOW.md §4.5): which failed document is replaced. */
  replacementInfo: upload
    .input(z.object({ documentId: z.uuid() }))
    .query(({ ctx, input }) => replacementTarget(db(), ctx.session, input.documentId)),

  prepareUpload: upload
    .input(
      z.object({
        ...fileInput,
        fileSize: z.number().int().positive(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      await enforceUploadLimit(ctx.session.userId);
      const options = await loadUploadOptions(sql, ctx.session.userId);
      if (!options.openPeriod) badRequest(NO_PERIOD);
      const { target, metric } = resolveTarget(options, input.orgUnitId, input.metricId);
      checkDeclaredFile(metric, input.fileSize, input.mimeType);
      const replaces = await replacementTarget(sql, ctx.session, input.replacesDocumentId, {
        orgUnitId: input.orgUnitId,
        metricId: input.metricId,
      });

      const warnings = await duplicateWarnings(
        sql,
        input.sha256,
        input.orgUnitId,
        options.openPeriod.id,
        input.metricId,
        replaces?.recordId ?? null,
      );
      if ((warnings.sameFile || warnings.existingRecords > 0) && !input.acknowledgeDuplicates) {
        return {
          status: "confirm" as const,
          warnings: {
            ...warnings,
            orgUnitName: target.name,
            metricName: metric.name,
            periodLabel: options.openPeriod.label,
          } satisfies DuplicateWarnings,
        };
      }

      const documentId = randomUUID();
      const path = evidencePath(
        input.orgUnitId,
        options.openPeriod.id,
        documentId,
        input.mimeType,
      )!;
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
        ...fileInput,
        documentId: z.uuid(),
        reportingPeriodId: z.uuid(),
        fileName: z.string().trim().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      const storage = createSupabaseAdminClient().storage.from(evidenceBucket());
      const path = evidencePath(
        input.orgUnitId,
        input.reportingPeriodId,
        input.documentId,
        input.mimeType,
      );
      if (!path) badRequest("Invalid file type — upload a PDF, JPG or PNG.");

      // Rejected bytes are not evidence: remove them, unless this document was already recorded
      // (e.g. a repeated completion request).
      const reject = async (message: string): Promise<never> => {
        const [recorded] = await sql`select 1 from public.documents where id = ${input.documentId}`;
        if (!recorded) await storage.remove([path]);
        badRequest(message);
      };

      // Scope first: nothing in storage is touched for a node outside the user's scope.
      const options = await loadUploadOptions(sql, ctx.session.userId);
      const { metric } = resolveTarget(options, input.orgUnitId, input.metricId);
      if (!options.openPeriod) return reject(NO_PERIOD);
      if (options.openPeriod.id !== input.reportingPeriodId) {
        return reject("The reporting period changed while you were uploading — upload again.");
      }

      const { data: blob, error: downloadError } = await storage.download(path);
      if (downloadError || !blob) badRequest("The file didn't finish uploading — try again.");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length > MAX_UPLOAD_BYTES) {
        return reject(
          `This file is ${formatMegabytes(bytes.length)}; the limit is ${formatMegabytes(MAX_UPLOAD_BYTES)}.`,
        );
      }
      const content = checkFileContent(bytes);
      if (!content.ok) return reject(content.reason);
      if (
        content.mimeType !== input.mimeType ||
        !metric.acceptedMimeTypes.includes(content.mimeType)
      ) {
        return reject(
          `Invalid file type — upload a ${acceptedTypesLabel(metric.acceptedMimeTypes)}.`,
        );
      }
      const fileHash = createHash("sha256").update(bytes).digest("hex");

      try {
        return await sql.begin(async (tx) => {
          // Shared locks: uploads run concurrently, but not across a period close or a tree change.
          await tx`select pg_advisory_xact_lock_shared(hashtext('reporting_period_status'))`;
          await tx`select pg_advisory_xact_lock_shared(hashtext('org_units_tree'))`;
          const current = await loadUploadOptions(tx, ctx.session.userId);
          if (current.openPeriod?.id !== input.reportingPeriodId) badRequest(NO_PERIOD);
          const { target } = resolveTarget(current, input.orgUnitId, input.metricId);

          const replaces = await replacementTarget(tx, ctx.session, input.replacesDocumentId, {
            orgUnitId: input.orgUnitId,
            metricId: input.metricId,
          });
          const warnings = await duplicateWarnings(
            tx,
            fileHash,
            input.orgUnitId,
            input.reportingPeriodId,
            input.metricId,
            replaces?.recordId ?? null,
          );
          if ((warnings.sameFile || warnings.existingRecords > 0) && !input.acknowledgeDuplicates) {
            // Keep the uploaded bytes: the user can acknowledge and complete without re-uploading.
            return {
              status: "confirm" as const,
              warnings: {
                ...warnings,
                orgUnitName: target.name,
                metricName: metric.name,
                periodLabel: current.openPeriod.label,
              } satisfies DuplicateWarnings,
            };
          }

          const [metricRow] = await tx<
            { scope_id: string | null; requires_calculation: boolean }[]
          >`
            select scope_id, requires_calculation from public.esg_metrics where id = ${input.metricId}`;
          const userId = ctx.session.userId;

          await tx`
            insert into public.documents (
              id, org_unit_id, reporting_period_id, storage_path, file_name, mime_type,
              file_size_bytes, file_hash, uploaded_by, related_document_id
            ) values (
              ${input.documentId}, ${input.orgUnitId}, ${input.reportingPeriodId}, ${path},
              ${input.fileName}, ${content.mimeType}, ${bytes.length}, ${fileHash}, ${userId},
              ${replaces?.documentId ?? null}
            )`;
          const [record] = await tx<{ id: string }[]>`
            insert into public.esg_records (
              org_unit_id, reporting_period_id, metric_id, scope_id, submitted_by,
              verification_status, calculation_status, is_duplicate_flag
            ) values (
              ${input.orgUnitId}, ${input.reportingPeriodId}, ${input.metricId}, ${metricRow.scope_id},
              ${userId}, 'document_uploaded',
              ${metricRow.requires_calculation ? "pending" : "not_applicable"}, ${warnings.sameFile}
            ) returning id`;
          await tx`
            insert into public.esg_record_documents (esg_record_id, document_id, is_primary, added_by)
            values (${record.id}, ${input.documentId}, true, ${userId})`;
          const [job] = await tx<{ id: string }[]>`
            insert into public.ocr_jobs (document_id) values (${input.documentId}) returning id`;

          if (replaces) {
            // The replaced record closes in the same transaction, so a failed upload can never leave a
            // half-done replacement (.grill/phase-7-ocr-verification-decisions.md).
            await tx`
              update public.esg_records set data_quality_state = 'rejected'
              where id = ${replaces.recordId}`;
            await writeAudit(tx, {
              eventType: "verification.rejected",
              entityType: "esg_record",
              entityId: replaces.recordId,
              userId,
              reason: `Replaced by ${input.fileName}`,
              oldValue: { document_id: replaces.documentId, file_name: replaces.fileName },
              newValue: {
                data_quality_state: "rejected",
                replacement_document_id: input.documentId,
              },
            });
          }

          await writeAudit(tx, {
            eventType: "document.uploaded",
            entityType: "document",
            entityId: input.documentId,
            userId,
            newValue: {
              file_name: input.fileName,
              mime_type: content.mimeType,
              file_size_bytes: bytes.length,
              file_hash: fileHash,
              org_unit_id: input.orgUnitId,
              reporting_period_id: input.reportingPeriodId,
              metric_id: input.metricId,
              esg_record_id: record.id,
              ocr_job_id: job.id,
              is_duplicate_flag: warnings.sameFile,
              existing_records_for_period: warnings.existingRecords,
              duplicates_acknowledged: warnings.sameFile || warnings.existingRecords > 0,
              replaces_document_id: replaces?.documentId ?? null,
            },
          });
          return {
            status: "recorded" as const,
            documentId: input.documentId,
            esgRecordId: record.id,
          };
        });
      } catch (error) {
        if (pgErrorCode(error) === "23505") badRequest("This upload was already recorded.");
        if (error instanceof TRPCError && error.code !== "INTERNAL_SERVER_ERROR") {
          return reject(error.message);
        }
        throw error;
      }
    }),
});
