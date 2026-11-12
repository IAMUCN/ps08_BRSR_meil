import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { ActiveSession } from "@/lib/auth/session";
import { db, pgErrorCode, type Tx } from "@/lib/db";
import { entryFieldsOf, unitChoices, type EntryField } from "@/lib/declarations/compare";
import { uploadTargets } from "@/lib/documents/rules";
import { loadLevels } from "@/lib/org/levels";
import { loadOrgNodes } from "@/lib/org/nodes";
import { levelLabel, type OrgNode } from "@/lib/org/rules";
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
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { permissionProcedure, protectedProcedure, router } from "@/lib/trpc/init";
import { documentAccess } from "@/lib/verification/access";
import { expectedProgress, type ExpectedProgress } from "@/lib/upload/progress";
import { bucket, count, exceeded, rateLimits } from "@/lib/security/rate-limit";

// Phase 5 document ingestion (.grill/phase-5-document-ingestion-decisions.md; SCHEMA_DEVIATIONS.md D3).
// Bytes first, then rows: prepareUpload issues a signed upload URL, completeUpload re-reads the stored
// object and records it. Scope is decided here from the session, never from client-supplied identity.

const upload = permissionProcedure("document.upload");

/**
 * The optional description typed on Upload (migration 0063, owner's request 2026-11-11): trimmed, at most 500
 * characters; empty means none.
 */
export const DESCRIPTION = z
  .string()
  .trim()
  .max(500, "Keep the description to 500 characters.")
  .optional()
  .transform((v) => (v ? v : undefined));

export type Sql = Tx | ReturnType<typeof db>;

export type UploadMetric = {
  id: string;
  name: string;
  unit: string;
  acceptedMimeTypes: string[];
  /** The values a row on the Upload page asks for (migration 0077): the required number fields. */
  entryFields: EntryField[];
  /** The field key the unit is typed under, or null (counts, percentages). */
  unitKey: string | null;
  /** The units offered for it, the metric's own first. */
  units: string[];
};
export type UploadCategory = { id: string; name: string; metrics: UploadMetric[] };
export type UploadTarget = {
  orgUnitId: string;
  name: string;
  unitType: string;
  /** The level's configured name (migration 0037). */
  unitTypeLabel: string;
  categories: UploadCategory[];
};
/** A period that takes uploads now (migration 0056): open, and its late-upload window not yet over. */
export type UploadPeriod = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  /** Due date: uploads after it are late. */
  dueOn: string;
  /** Last day uploads are taken at all. */
  lastUploadDay: string;
  /** An upload now would be late. */
  late: boolean;
};

/**
 * A month a bill may be typed for on the Upload page (owner's request, 2026-11-13): the person picks the bill's
 * billing period and the record is filed in that reporting period, even after its due date or once it has closed —
 * marked late. Only months of the current financial year that have begun, and last year's March from April to June.
 */
export type BillingMonth = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  dueOn: string;
  /** Its due date has passed: a bill typed for it now is late. */
  late: boolean;
  /** It no longer takes uploads in the ordinary way (closed, or past its late window). */
  closed: boolean;
};

export type UploadOptions = {
  /** Begun periods newest first (the first is the default choice), then periods still to come. */
  periods: UploadPeriod[];
  /** The billing months the Upload rows offer, newest first. */
  billingMonths: BillingMonth[];
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
export const PERIOD_CLOSED = "That reporting period no longer takes uploads — choose another one.";
const NOT_ALLOWED = "You can't upload that category for that project.";

export function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

/**
 * The period an upload goes to: the one asked for if it still takes uploads, else (nothing asked) the
 * newest. Throws a message the person can act on.
 */
export function resolvePeriod(options: UploadOptions, periodId?: string | null): UploadPeriod {
  if (options.periods.length === 0) badRequest(NO_PERIOD);
  if (!periodId) return options.periods[0];
  const period = options.periods.find((p) => p.id === periodId);
  if (!period) badRequest(PERIOD_CLOSED);
  return period;
}

export async function loadUploadOptions(sql: Sql, userId: string): Promise<UploadOptions> {
  const periodRows = await sql<
    {
      id: string;
      label: string;
      start_date: string;
      end_date: string;
      due_on: string;
      last_upload_day: string;
      late: boolean;
    }[]
  >`
    select rp.id, rp.label, rp.start_date::text, rp.end_date::text,
           coalesce(rp.submission_closes_on, rp.end_date)::text as due_on,
           coalesce(rp.late_uploads_until, rp.submission_closes_on, rp.end_date)::text as last_upload_day,
           public.reporting_period_late(rp) as late
    from public.reporting_periods rp
    where rp.status = 'open' and not public.reporting_period_locked(rp)
    -- Periods that have begun first, newest first (the default choice); months still to come after them
    -- (a whole financial year can be open at once, 2026-11-12).
    order by rp.start_date <= (now() at time zone 'Asia/Kolkata')::date desc, rp.start_date desc`;
  const periods: UploadPeriod[] = periodRows.map((r) => ({
    id: r.id,
    label: r.label,
    startDate: r.start_date,
    endDate: r.end_date,
    dueOn: r.due_on,
    lastUploadDay: r.last_upload_day,
    late: r.late,
  }));
  const billingMonths = await loadBillingMonths(sql);
  const levels = await loadLevels(sql);

  const nodeRows = await loadOrgNodes(sql);
  const nodes: OrgNode[] = nodeRows;

  // An administrator uploads too (owner's decision 2026-10-13): any activity, whichever role owns it, for
  // every unit they administer. A Super Admin's reach is every group, wherever the role is assigned.
  const held = await sql<{ org_unit_id: string; role_id: string; code: string }[]>`
    select uoa.org_unit_id, uoa.role_id, r.code
    from public.user_org_assignments uoa join public.roles r on r.id = uoa.role_id
    where uoa.user_id = ${userId} and uoa.revoked_at is null`;
  const superRole = held.find((a) => a.code === "admin");
  const assignments = [
    ...held,
    ...(superRole
      ? nodes
          .filter((n) => n.parentId === null)
          .map((n) => ({ org_unit_id: n.id, role_id: superRole.role_id, code: "admin" }))
      : []),
  ];
  const administratorRoleIds = new Set(
    held.filter((a) => a.code === "admin" || a.code === "org_admin").map((a) => a.role_id),
  );
  const uploadRoles = await sql<{ role_id: string }[]>`
    select rp.role_id from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where p.code = 'document.upload'`;
  const behalfRows = await sql<{ id: string; uploads_for_role_id: string }[]>`
    select id, uploads_for_role_id from public.roles where uploads_for_role_id is not null`;

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

  // What a row types for each activity: its required numbers and a unit from its allowed units.
  const requirementRows = await sql<
    { metric_id: string; key: string; label: string; data_type: string; required: boolean }[]
  >`
    select metric_id, field_key as key, field_label as label, data_type::text as data_type,
           is_required as required
    from public.metric_field_requirements order by metric_id, field_label`;
  const unitRules = await sql<{ metric_id: string; units: string[] | null }[]>`
    select metric_id, array(select jsonb_array_elements_text(rule_definition -> 'units')) as units
    from public.validation_rules
    where is_active and metric_id is not null and rule_definition ->> 'check' = 'allowed_units'`;
  const entryOf = (metricId: string, metricUnit: string) => {
    const own = requirementRows.filter((r) => r.metric_id === metricId);
    const unitKey = own.find((r) => r.data_type === "unit")?.key ?? null;
    return {
      entryFields: entryFieldsOf(
        own.map((r) => ({
          key: r.key,
          label: r.label,
          dataType: r.data_type,
          required: r.required,
        })),
      ),
      unitKey,
      units: unitKey
        ? unitChoices(unitRules.find((u) => u.metric_id === metricId)?.units ?? [], metricUnit)
        : [],
    };
  };

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
      ...entryOf(row.id, row.unit),
    });
    categoriesById.set(row.category_id, category);
  }

  const targetMap = uploadTargets(
    nodes,
    assignments.map((a) => ({ orgUnitId: a.org_unit_id, roleId: a.role_id })),
    new Set(uploadRoles.map((r) => r.role_id)),
    [...categoriesById.values()],
    new Map(behalfRows.map((r) => [r.id, r.uploads_for_role_id])),
    administratorRoleIds,
  );
  const targets = nodeRows
    .filter((n) => targetMap.has(n.id))
    .map((n) => ({
      orgUnitId: n.id,
      name: n.name,
      unitType: n.unitType,
      unitTypeLabel: levelLabel(levels, n.unitType),
      categories: targetMap.get(n.id)!.map((id) => {
        const { name, metrics } = categoriesById.get(id)!;
        return { id, name, metrics };
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { periods, billingMonths, targets, maxBytes: MAX_UPLOAD_BYTES };
}

/**
 * The months of the current financial year (April to March, India time) that have begun, open or closed, and
 * — the March exception — last year's March while the new year is in its first quarter, because March bills
 * arrive after the year ends. Months still to come and earlier years are not offered.
 */
export async function loadBillingMonths(sql: Sql): Promise<BillingMonth[]> {
  const rows = await sql<
    {
      id: string;
      label: string;
      start_date: string;
      end_date: string;
      due_on: string;
      late: boolean;
      closed: boolean;
    }[]
  >`
    with today as (select public.reporting_period_today() as d),
    fy as (
      select make_date(extract(year from d)::int - case when extract(month from d) < 4 then 1 else 0 end, 4, 1)
             as start, d from today
    )
    select rp.id, rp.label, rp.start_date::text, rp.end_date::text,
           coalesce(rp.submission_closes_on, rp.end_date)::text as due_on,
           public.reporting_period_late(rp) as late,
           (rp.status <> 'open' or public.reporting_period_locked(rp)) as closed
    from public.reporting_periods rp, fy
    where rp.status in ('open', 'closed')
      and rp.start_date <= fy.d
      and (rp.start_date >= fy.start
           or (rp.start_date >= (fy.start - interval '1 month')::date
               and rp.end_date < fy.start
               and fy.d < (fy.start + interval '3 months')::date))
    order by rp.start_date desc`;
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    startDate: r.start_date,
    endDate: r.end_date,
    dueOn: r.due_on,
    late: r.late,
    closed: r.closed,
  }));
}

/** Whether a period may hold a bill typed on the Upload page: one that takes uploads, or a billing month. */
export function takesTypedBill(options: UploadOptions, periodId: string): boolean {
  return (
    options.periods.some((p) => p.id === periodId) ||
    options.billingMonths.some((m) => m.id === periodId)
  );
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
  /** The period chosen; omitted = the newest one that takes uploads. */
  reportingPeriodId: z.uuid().optional(),
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
  /**
   * Why it is replaced: its extraction failed (same activity), or the record was rejected — for instance
   * returned as the wrong activity — and is uploaded again as a new version (Phase 2; the activity may
   * change).
   */
  reason: "ocr_failed" | "rejected";
};

/**
 * The document this upload replaces, or null: one whose extraction failed while its record still waits, or
 * one whose record was rejected (Phase 2: a corrected re-upload is a new version, linked to the old one,
 * never a duplicate). Only by someone who could verify it, only once, and only for the same project.
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
  const rejected = row.data_quality_state === "rejected";
  const ocrFailed = row.job_status === "failed" && row.verification_status === "document_uploaded";
  if (!rejected && !ocrFailed) badRequest("That document no longer needs replacing.");
  const [already] = await sql`
    select 1 from public.documents where related_document_id = ${documentId} and deleted_at is null`;
  if (already) badRequest("That document was already replaced.");
  if (expected && row.org_unit_id !== expected.orgUnitId) {
    badRequest("A replacement must be for the same project.");
  }
  if (expected && !rejected && row.metric_id !== expected.metricId) {
    badRequest("A replacement must be for the same project and activity.");
  }
  return {
    documentId,
    recordId: row.record_id,
    fileName: row.file_name,
    orgUnitId: row.org_unit_id,
    metricId: row.metric_id,
    reason: rejected ? "rejected" : "ocr_failed",
  };
}

export type RecordEvidence = {
  /** May the caller add a supporting file, and if not, why — shown as is. */
  canAdd: boolean;
  closedReason: string | null;
  acceptedMimeTypes: string[];
  files: {
    documentId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    isPrimary: boolean;
    addedAt: string;
  }[];
};

/**
 * The record a supporting file is added to (.grill/audit-p2-decisions.md). The same people who could have
 * uploaded the record's document may add to it — their scope and their role's category — and only while the
 * record is still open: evidence is not added to a record after it was approved or rejected.
 */
async function supportingTarget(sql: Sql, session: ActiveSession, recordId: string) {
  const [record] = await sql<
    {
      org_unit_id: string;
      reporting_period_id: string;
      metric_id: string;
      approval_status: string;
      data_quality_state: string;
    }[]
  >`
    select org_unit_id, reporting_period_id, metric_id, approval_status::text, data_quality_state::text
    from public.esg_records where id = ${recordId}`;
  if (!record) badRequest("Record not found.");
  const options = await loadUploadOptions(sql, session.userId);
  const { metric } = resolveTarget(options, record.org_unit_id, record.metric_id);
  // A closed period takes no new documents; what was already uploaded still finishes its review.
  if (!options.periods.some((p) => p.id === record.reporting_period_id)) {
    badRequest("This record's reporting period is closed. No new evidence can be added.");
  }
  if (record.approval_status === "approved") {
    badRequest("This record is approved — its evidence is closed.");
  }
  if (record.data_quality_state === "rejected") {
    badRequest("This record was rejected — upload a new document instead.");
  }
  return { record, metric };
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
      const period = resolvePeriod(options, input.reportingPeriodId);
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
        period.id,
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
            periodLabel: period.label,
          } satisfies DuplicateWarnings,
        };
      }

      const documentId = randomUUID();
      const path = evidencePath(input.orgUnitId, period.id, documentId, input.mimeType)!;
      const { data, error } = await createSupabaseAdminClient()
        .storage.from(evidenceBucket())
        .createSignedUploadUrl(path);
      if (error) throw error;
      return {
        status: "ready" as const,
        documentId,
        reportingPeriodId: period.id,
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
        description: DESCRIPTION,
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
      if (options.periods.length === 0) return reject(NO_PERIOD);
      if (!options.periods.some((p) => p.id === input.reportingPeriodId)) {
        return reject("The reporting period closed while you were uploading — choose another one.");
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
          const period = resolvePeriod(current, input.reportingPeriodId);
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
                periodLabel: period.label,
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
              file_size_bytes, file_hash, uploaded_by, related_document_id, description
            ) values (
              ${input.documentId}, ${input.orgUnitId}, ${input.reportingPeriodId}, ${path},
              ${input.fileName}, ${content.mimeType}, ${bytes.length}, ${fileHash}, ${userId},
              ${replaces?.documentId ?? null}, ${input.description ?? null}
            )`;
          const [record] = await tx<{ id: string }[]>`
            insert into public.esg_records (
              org_unit_id, reporting_period_id, metric_id, scope_id, submitted_by,
              verification_status, calculation_status, is_duplicate_flag, submitted_late
            ) values (
              ${input.orgUnitId}, ${input.reportingPeriodId}, ${input.metricId}, ${metricRow.scope_id},
              ${userId}, 'document_uploaded',
              ${metricRow.requires_calculation ? "pending" : "not_applicable"}, ${warnings.sameFile},
              ${period.late}
            ) returning id`;
          await tx`
            insert into public.esg_record_documents (esg_record_id, document_id, is_primary, added_by)
            values (${record.id}, ${input.documentId}, true, ${userId})`;
          const [job] = await tx<{ id: string }[]>`
            insert into public.ocr_jobs (document_id) values (${input.documentId}) returning id`;

          if (replaces?.reason === "ocr_failed") {
            // The replaced record closes in the same transaction, so a failed upload can never leave a
            // half-done replacement (.grill/phase-7-ocr-verification-decisions.md). A rejected one is
            // closed already; the new document's related_document_id is the link.
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
              description: input.description ?? null,
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
  /**
   * The expected submissions of a unit the caller can upload for, in a period that takes uploads, with what
   * is on file for each (owner's request, 2026-11-11). Every expected activity of the unit is listed, other
   * roles' too; nothing beyond activity names and stages is shown.
   */
  expectedProgress: upload
    .input(z.object({ orgUnitId: z.uuid(), periodId: z.uuid() }))
    .query(async ({ ctx, input }): Promise<ExpectedProgress> => {
      const sql = db();
      const options = await loadUploadOptions(sql, ctx.session.userId);
      if (
        !options.targets.some((t) => t.orgUnitId === input.orgUnitId) ||
        !takesTypedBill(options, input.periodId)
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That project or period isn't available.",
        });
      }
      return expectedProgress(sql, input.orgUnitId, input.periodId);
    }),

  /**
   * Change a document's description (migration 0063): only the person who uploaded it, and only while its
   * record is not yet approved or rejected (a multi-bill PDF: until its bills are recorded). Audited.
   */
  setDescription: upload
    .input(z.object({ documentId: z.uuid(), description: DESCRIPTION }))
    .mutation(async ({ ctx, input }) => {
      const description = input.description ?? null;
      return db().begin(async (tx) => {
        const [doc] = await tx<
          {
            uploaded_by: string;
            description: string | null;
            is_bundle: boolean;
            bundle_open: boolean;
            approval_status: string | null;
            data_quality_state: string | null;
          }[]
        >`
          select d.uploaded_by, d.description, d.is_bundle,
                 not exists (select 1 from public.document_bundle_parts bp
                             where bp.bundle_document_id = d.id and bp.status <> 'proposed') as bundle_open,
                 r.approval_status::text, r.data_quality_state::text
          from public.documents d
          left join public.esg_record_documents erd on erd.document_id = d.id and erd.is_primary
          left join public.esg_records r on r.id = erd.esg_record_id
          where d.id = ${input.documentId} and d.deleted_at is null
          for update of d`;
        // Someone else's document is refused like a missing one.
        if (!doc || doc.uploaded_by !== ctx.session.userId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That document isn't available." });
        }
        const closed = doc.is_bundle
          ? !doc.bundle_open
          : doc.approval_status === "approved" || doc.data_quality_state === "rejected";
        if (closed) {
          badRequest(
            doc.is_bundle
              ? "The bills in this PDF are already recorded; change each bill's description instead."
              : "The record is approved or rejected, so its description can no longer change.",
          );
        }
        if (doc.description === description) return { description };
        await tx`update public.documents set description = ${description}
                 where id = ${input.documentId}`;
        await writeAudit(tx, {
          eventType: "document.description_changed",
          entityType: "document",
          entityId: input.documentId,
          userId: ctx.session.userId,
          oldValue: { description: doc.description },
          newValue: { description },
        });
        return { description };
      });
    }),

  /** Every evidence file of a record the caller can see (RLS: org scope or Admin), the primary one first. */
  recordEvidence: protectedProcedure
    .input(z.object({ recordId: z.uuid() }))
    .query(async ({ ctx, input }): Promise<RecordEvidence> => {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("esg_record_documents")
        .select(
          "is_primary, added_at, documents(id, file_name, mime_type, file_size_bytes, deleted_at)",
        )
        .eq("esg_record_id", input.recordId)
        .order("is_primary", { ascending: false })
        .order("added_at")
        .overrideTypes<
          {
            is_primary: boolean;
            added_at: string;
            documents: {
              id: string;
              file_name: string;
              mime_type: string;
              file_size_bytes: number;
              deleted_at: string | null;
            } | null;
          }[],
          { merge: false }
        >();
      if (error) throw error;
      let canAdd = false;
      let closedReason: string | null = null;
      let acceptedMimeTypes: string[] = [];
      if (ctx.session.permissions.includes("document.upload")) {
        try {
          acceptedMimeTypes = (await supportingTarget(db(), ctx.session, input.recordId)).metric
            .acceptedMimeTypes;
          canAdd = true;
        } catch (reason) {
          if (!(reason instanceof TRPCError)) throw reason;
          closedReason = reason.message;
        }
      }
      return {
        canAdd,
        closedReason,
        acceptedMimeTypes,
        files: (data ?? [])
          .filter((row) => row.documents && !row.documents.deleted_at)
          .map((row) => ({
            documentId: row.documents!.id,
            fileName: row.documents!.file_name,
            mimeType: row.documents!.mime_type,
            sizeBytes: row.documents!.file_size_bytes,
            isPrimary: row.is_primary,
            addedAt: row.added_at,
          })),
      };
    }),

  /**
   * A supporting file for an existing record (schema §9.2 allows several documents per record; the screens
   * offered one). Bytes first, then rows, as for the record's own document. The file is evidence only: it is
   * not read by OCR and no value is taken from it.
   */
  prepareSupporting: upload
    .input(
      z.object({
        recordId: z.uuid(),
        mimeType: z.string().max(100),
        fileSize: z.number().int().positive(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      await enforceUploadLimit(ctx.session.userId);
      const { record, metric } = await supportingTarget(sql, ctx.session, input.recordId);
      checkDeclaredFile(metric, input.fileSize, input.mimeType);
      const [same] = await sql`
        select 1 from public.esg_record_documents erd
        join public.documents d on d.id = erd.document_id
        where erd.esg_record_id = ${input.recordId} and d.file_hash = ${input.sha256}
          and d.deleted_at is null`;
      if (same) badRequest("That file is already attached to this record.");
      const documentId = randomUUID();
      const path = evidencePath(
        record.org_unit_id,
        record.reporting_period_id,
        documentId,
        input.mimeType,
      )!;
      const { data, error } = await createSupabaseAdminClient()
        .storage.from(evidenceBucket())
        .createSignedUploadUrl(path);
      if (error) throw error;
      return { documentId, signedUrl: data.signedUrl };
    }),

  completeSupporting: upload
    .input(
      z.object({
        recordId: z.uuid(),
        documentId: z.uuid(),
        mimeType: z.string().max(100),
        fileName: z.string().trim().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      const storage = createSupabaseAdminClient().storage.from(evidenceBucket());
      // Scope and the record's state first: nothing in storage is touched for a record out of reach.
      const { record, metric } = await supportingTarget(sql, ctx.session, input.recordId);
      const path = evidencePath(
        record.org_unit_id,
        record.reporting_period_id,
        input.documentId,
        input.mimeType,
      );
      if (!path) badRequest("Invalid file type — upload a PDF, JPG or PNG.");
      const reject = async (message: string): Promise<never> => {
        const [recorded] = await sql`select 1 from public.documents where id = ${input.documentId}`;
        if (!recorded) await storage.remove([path]);
        badRequest(message);
      };

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
          // Re-checked under the transaction: the record may have been approved while the file uploaded.
          await supportingTarget(tx, ctx.session, input.recordId);
          const [same] = await tx`
            select 1 from public.esg_record_documents erd
            join public.documents d on d.id = erd.document_id
            where erd.esg_record_id = ${input.recordId} and d.file_hash = ${fileHash}
              and d.deleted_at is null`;
          if (same) badRequest("That file is already attached to this record.");
          const userId = ctx.session.userId;
          await tx`
            insert into public.documents (
              id, org_unit_id, reporting_period_id, storage_path, file_name, mime_type,
              file_size_bytes, file_hash, uploaded_by
            ) values (
              ${input.documentId}, ${record.org_unit_id}, ${record.reporting_period_id}, ${path},
              ${input.fileName}, ${content.mimeType}, ${bytes.length}, ${fileHash}, ${userId}
            )`;
          await tx`
            insert into public.esg_record_documents (esg_record_id, document_id, is_primary, added_by)
            values (${input.recordId}, ${input.documentId}, false, ${userId})`;
          await writeAudit(tx, {
            eventType: "document.attached",
            entityType: "esg_record",
            entityId: input.recordId,
            userId,
            newValue: {
              document_id: input.documentId,
              file_name: input.fileName,
              mime_type: content.mimeType,
              file_size_bytes: bytes.length,
              file_hash: fileHash,
              is_primary: false,
            },
          });
          return { documentId: input.documentId };
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
