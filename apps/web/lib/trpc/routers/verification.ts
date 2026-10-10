import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { activityKeyFor } from "@/lib/calculation/engine";
import { loadCalculations } from "@/lib/calculation/lookup";
import type { CalculationState } from "@/lib/calculation/trace";
import type { ActiveSession } from "@/lib/auth/session";
import { db, type Tx } from "@/lib/db";
import type { OcrJobStatus } from "@/lib/ocr/rules";
import type { Outcome, RuleType } from "@/lib/validation/checks";
import { runValidation } from "@/lib/validation/engine";
import { confidenceThreshold, documentAccess } from "@/lib/verification/access";
import {
  MANUAL_JUSTIFICATION_MIN,
  REJECT_REASON_MIN,
  activityFieldKeys,
  checkConfirm,
  parseDecimal,
  verifyState,
  type FieldDataType,
  type VerifyField,
  type VerifyState,
} from "@/lib/verification/rules";
import { protectedProcedure, router } from "@/lib/trpc/init";

// Verify Extraction (03_APP_FLOW.md §2.3, UI brief §12.2). The human-in-the-loop checkpoint: the guard
// rail is enforced here, not only in the browser, and every write is one audited transaction (D1).

const INVOICE_FIELD = "invoice_number";

export type VerifyDocument = {
  state: VerifyState;
  canVerify: boolean;
  documentId: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedAt: string;
  uploadedByName: string;
  orgUnitName: string;
  periodLabel: string;
  metricName: string | null;
  metricUnit: string | null;
  recordId: string | null;
  documentTypeId: string | null;
  documentTypeName: string | null;
  documentTypeOptions: { id: string; name: string }[];
  jobStatus: OcrJobStatus | null;
  errorMessage: string | null;
  threshold: number | null;
  fields: VerifyField[];
  /** Set once the record has been verified (read-only summary). */
  verified: {
    at: string;
    byName: string;
    isManualException: boolean;
    notes: string | null;
    values: { label: string; value: string | null }[];
  } | null;
  rejectedReason: string | null;
  /** Latest validation run (UI brief §12.4); null before the first Confirm. */
  validation: {
    status: string;
    results: { ruleType: RuleType; outcome: Outcome; message: string; field: string | null }[];
  } | null;
  /** The stored calculation for this record, or why there isn't one yet (Phase 9). */
  calculation: CalculationState;
  /** Why a returned record came back: the Admin's reason, or the failed checks. */
  returnReason: string | null;
  approvalStatus: string;
};

type Sql = Tx | ReturnType<typeof db>;

function notFound(): never {
  throw new TRPCError({ code: "NOT_FOUND", message: "That document isn't available." });
}

async function loadFields(sql: Sql, documentId: string, metricId: string | null) {
  // Extracted fields joined to their requirement; when OCR failed there is no extraction, so the
  // requirements alone describe the manual-entry form.
  return sql<
    {
      id: string | null;
      field_key: string;
      field_label: string;
      data_type: FieldDataType;
      is_required: boolean;
      is_critical: boolean;
      extracted_value: string | null;
      confidence: number | null;
      verified_value: string | null;
    }[]
  >`
    select f.id, coalesce(f.field_key, req.field_key) as field_key,
           coalesce(f.field_label, req.field_label) as field_label,
           coalesce(req.data_type, 'text')::text as data_type,
           coalesce(req.is_required, false) as is_required,
           coalesce(req.is_critical, false) as is_critical,
           f.extracted_value, f.confidence::float as confidence, f.verified_value
    from public.metric_field_requirements req
    full join (
      select f.* from public.ocr_fields f
      join public.ocr_extractions e on e.id = f.ocr_extraction_id
      where e.document_id = ${documentId}
    ) f on f.field_key = req.field_key and req.metric_id = ${metricId}
    where req.metric_id = ${metricId} or f.id is not null
    order by coalesce(req.field_label, f.field_label)`;
}

async function loadDocument(sql: Sql, documentId: string) {
  const [row] = await sql<
    {
      file_name: string;
      mime_type: string;
      file_size_bytes: number;
      created_at: Date;
      uploaded_by_name: string;
      org_unit_id: string;
      org_unit_name: string;
      reporting_period_id: string;
      period_label: string;
      document_type_id: string | null;
      document_type_name: string | null;
      record_id: string | null;
      metric_id: string | null;
      metric_name: string | null;
      metric_unit: string | null;
      verification_status: "draft" | "document_uploaded" | "ocr_completed" | "user_verified";
      data_quality_state: string;
      validation_status: string;
      approval_status: string;
      job_status: OcrJobStatus | null;
      error_message: string | null;
      extraction_id: string | null;
    }[]
  >`
    select d.file_name, d.mime_type, d.file_size_bytes, d.created_at, u.display_name as uploaded_by_name,
           d.org_unit_id, o.name as org_unit_name, d.reporting_period_id, p.label as period_label,
           d.document_type_id, dt.name as document_type_name,
           r.id as record_id, r.metric_id, m.name as metric_name, m.unit as metric_unit,
           coalesce(r.verification_status::text, 'draft') as verification_status,
           coalesce(r.data_quality_state::text, 'incomplete') as data_quality_state,
           coalesce(r.validation_status::text, 'pending') as validation_status,
           coalesce(r.approval_status::text, 'not_submitted') as approval_status,
           j.status as job_status, j.error_message, e.id as extraction_id
    from public.documents d
    join public.users u on u.id = d.uploaded_by
    join public.org_units o on o.id = d.org_unit_id
    join public.reporting_periods p on p.id = d.reporting_period_id
    left join public.document_types dt on dt.id = d.document_type_id
    left join public.esg_record_documents erd on erd.document_id = d.id and erd.is_primary
    left join public.esg_records r on r.id = erd.esg_record_id
    left join public.esg_metrics m on m.id = r.metric_id
    left join public.ocr_jobs j on j.document_id = d.id
    left join public.ocr_extractions e on e.document_id = d.id
    where d.id = ${documentId} and d.deleted_at is null`;
  return row ?? null;
}

/** Confirmed records for the same project + period + metric carrying the same invoice number (§2.3). */
async function invoiceDuplicates(
  sql: Sql,
  input: {
    recordId: string;
    orgUnitId: string;
    periodId: string;
    metricId: string;
    invoice: string;
  },
): Promise<number> {
  const invoice = input.invoice.trim();
  if (!invoice) return 0;
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count
    from public.ocr_fields f
    join public.ocr_extractions e on e.id = f.ocr_extraction_id
    join public.esg_record_documents erd on erd.document_id = e.document_id and erd.is_primary
    join public.esg_records r on r.id = erd.esg_record_id
    where f.field_key = ${INVOICE_FIELD}
      and upper(trim(coalesce(f.verified_value, ''))) = upper(${invoice})
      and r.id <> ${input.recordId}
      and r.org_unit_id = ${input.orgUnitId}
      and r.reporting_period_id = ${input.periodId}
      and r.metric_id = ${input.metricId}
      and r.verification_status = 'user_verified'
      and r.data_quality_state <> 'rejected'`;
  return row.count;
}

/** Locks the record and checks it is still waiting for this user's verification. */
async function lockPendingRecord(tx: Tx, documentId: string) {
  const [row] = await tx<
    {
      id: string;
      org_unit_id: string;
      reporting_period_id: string;
      metric_id: string;
      verification_status: string;
      data_quality_state: string;
      validation_status: string;
      approval_status: string;
      job_status: OcrJobStatus | null;
      extraction_id: string | null;
      extraction_source: string | null;
      ocr_job_id: string | null;
      document_type_id: string | null;
    }[]
  >`
    select r.id, r.org_unit_id, r.reporting_period_id, r.metric_id, r.verification_status::text,
           r.data_quality_state::text, r.validation_status::text,
           r.approval_status::text, j.status as job_status,
           e.id as extraction_id, e.raw_output->>'source' as extraction_source,
           j.id as ocr_job_id, d.document_type_id
    from public.documents d
    join public.esg_record_documents erd on erd.document_id = d.id and erd.is_primary
    join public.esg_records r on r.id = erd.esg_record_id
    left join public.ocr_jobs j on j.document_id = d.id
    left join public.ocr_extractions e on e.document_id = d.id
    where d.id = ${documentId} and d.deleted_at is null
    for update of r`;
  if (!row) notFound();
  if (row.data_quality_state === "rejected") {
    throw new TRPCError({ code: "CONFLICT", message: "This record was rejected." });
  }
  const returned =
    row.verification_status === "user_verified" &&
    (row.validation_status === "failed" ||
      row.validation_status === "returned" ||
      row.approval_status === "returned");
  if (row.verification_status === "user_verified" && !returned) {
    throw new TRPCError({ code: "CONFLICT", message: "This document was already verified." });
  }
  return { ...row, returned };
}

async function requireAccess(session: ActiveSession, documentId: string) {
  const access = await documentAccess(session, documentId);
  if (!access) notFound();
  if (!access.canVerify) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You can't verify that document." });
  }
  return access;
}

const fieldEntry = z.object({
  id: z.uuid(),
  value: z.string().max(500),
  acknowledged: z.boolean().default(false),
});

export const verificationRouter = router({
  /** Everything the Verify Extraction screen renders. Null when the document isn't visible (§4.4). */
  load: protectedProcedure
    .input(z.object({ documentId: z.uuid() }))
    .query(async ({ ctx, input }): Promise<VerifyDocument | null> => {
      const access = await documentAccess(ctx.session, input.documentId);
      if (!access) return null;
      const sql = db();
      const row = await loadDocument(sql, input.documentId);
      if (!row) return null;

      const [fieldRows, threshold, typeOptions, verification, rejection, results, adminReturn] =
        await Promise.all([
          loadFields(sql, input.documentId, row.metric_id),
          confidenceThreshold(sql),
          sql<{ id: string; name: string }[]>`
          select dt.id, dt.name from public.document_type_metric_mappings map
          join public.document_types dt on dt.id = map.document_type_id
          where map.metric_id = ${row.metric_id}
          order by dt.name`,
          sql<
            {
              verified_at: Date;
              is_manual_exception: boolean;
              notes: string | null;
              name: string;
            }[]
          >`
          select v.verified_at, v.is_manual_exception, v.notes, u.display_name as name
          from public.verifications v join public.users u on u.id = v.verified_by
          where v.esg_record_id = ${row.record_id}
          order by v.verified_at desc limit 1`,
          sql<{ reason: string | null }[]>`
          select reason from public.audit_logs
          where event_type = 'verification.rejected' and entity_id = ${row.record_id}
          order by created_at desc limit 1`,
          // The latest run: every result of one run shares its transaction's timestamp.
          sql<{ rule_type: RuleType; outcome: Outcome; message: string; field: string | null }[]>`
          select vr.rule_type::text as rule_type, vr.result::text as outcome, vr.message,
                 rule.rule_definition->>'field' as field
          from public.validation_results vr
          left join public.validation_rules rule on rule.id = vr.validation_rule_id
          where vr.esg_record_id = ${row.record_id}
            and vr.evaluated_at = (
              select max(evaluated_at) from public.validation_results
              where esg_record_id = ${row.record_id})
          order by vr.rule_type, vr.result desc`,
          sql<{ reason: string | null }[]>`
          select reason from (
            select reason, created_at from public.audit_logs
            where event_type = 'validation.returned' and entity_id = ${row.record_id}
            union all
            select reason, decided_at from public.approvals
            where action = 'returned' and esg_record_id = ${row.record_id}
          ) returns order by created_at desc limit 1`,
        ]);

      const fields: VerifyField[] = fieldRows
        .filter((f) => f.id)
        .map((f) => ({
          id: f.id!,
          key: f.field_key,
          label: f.field_label,
          dataType: f.data_type,
          required: f.is_required,
          critical: f.is_critical,
          extractedValue: f.extracted_value,
          confidence: f.confidence,
          verifiedValue: f.verified_value,
        }));
      const state = verifyState({
        verificationStatus: row.verification_status,
        dataQualityState: row.data_quality_state,
        jobStatus: row.job_status,
        validationStatus: row.validation_status,
        approvalStatus: row.approval_status,
      });
      // Results name "activity_value" for the metric's activity field; point them at the real field.
      const activity = activityFieldKeys(
        fields,
        row.metric_id ? await activityKeyFor(sql, row.metric_id) : null,
      );
      const activityKey = activity.ok ? activity.valueKey : null;
      const validationResults = results.map((r) => ({
        ruleType: r.rule_type,
        outcome: r.outcome,
        message: r.message,
        field: r.field === "activity_value" ? activityKey : r.field,
      }));

      return {
        state,
        canVerify: access.canVerify,
        documentId: input.documentId,
        fileName: row.file_name,
        mimeType: row.mime_type,
        fileSizeBytes: Number(row.file_size_bytes),
        uploadedAt: row.created_at.toISOString(),
        uploadedByName: row.uploaded_by_name,
        orgUnitName: row.org_unit_name,
        periodLabel: row.period_label,
        metricName: row.metric_name,
        metricUnit: row.metric_unit,
        recordId: row.record_id,
        documentTypeId: row.document_type_id,
        documentTypeName: row.document_type_name,
        documentTypeOptions: typeOptions.map((t) => ({ id: t.id, name: t.name })),
        jobStatus: row.job_status,
        errorMessage: row.job_status === "failed" ? row.error_message : null,
        threshold,
        // Manual entry (failed OCR) works from the requirements, which have no ocr_fields rows yet.
        fields:
          state === "failed" && fields.length === 0
            ? fieldRows.map((f) => ({
                id: f.field_key,
                key: f.field_key,
                label: f.field_label,
                dataType: f.data_type,
                required: f.is_required,
                critical: f.is_critical,
                extractedValue: null,
                confidence: null,
              }))
            : fields,
        verified:
          state === "verified" && verification[0]
            ? {
                at: verification[0].verified_at.toISOString(),
                byName: verification[0].name,
                isManualException: verification[0].is_manual_exception,
                notes: verification[0].notes,
                values: fieldRows
                  .filter((f) => f.id)
                  .map((f) => ({ label: f.field_label, value: f.verified_value })),
              }
            : null,
        rejectedReason: state === "rejected" ? (rejection[0]?.reason ?? null) : null,
        approvalStatus: row.approval_status,
        calculation: (row.record_id
          ? (await loadCalculations(sql, [row.record_id])).get(row.record_id)
          : null) ?? { trace: null, blockedReason: null },
        validation: validationResults.length
          ? { status: row.validation_status, results: validationResults }
          : null,
        returnReason:
          state !== "returned"
            ? null
            : row.validation_status === "returned" || row.approval_status === "returned"
              ? (adminReturn[0]?.reason ?? "Returned by a reviewer.")
              : validationResults
                  .filter((r) => r.outcome === "fail")
                  .map((r) => r.message)
                  .join(" "),
      };
    }),

  /** Master Approach §12: when OCR couldn't classify the document, the user picks the type. */
  setDocumentType: protectedProcedure
    .input(z.object({ documentId: z.uuid(), documentTypeId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireAccess(ctx.session, input.documentId);
      await db().begin(async (tx) => {
        const record = await lockPendingRecord(tx, input.documentId);
        const [mapped] = await tx`
          select 1 from public.document_type_metric_mappings
          where metric_id = ${record.metric_id} and document_type_id = ${input.documentTypeId}`;
        if (!mapped) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That document type doesn't apply to this activity.",
          });
        }
        await tx`
          update public.documents set document_type_id = ${input.documentTypeId}
          where id = ${input.documentId}`;
        await writeAudit(tx, {
          eventType: "document.type_selected",
          entityType: "document",
          entityId: input.documentId,
          userId: ctx.session.userId,
          oldValue: { document_type_id: record.document_type_id },
          newValue: { document_type_id: input.documentTypeId },
        });
      });
      return null;
    }),

  /** Live duplicate check while the user edits the invoice number (§2.3). */
  invoiceDuplicates: protectedProcedure
    .input(z.object({ documentId: z.uuid(), invoiceNumber: z.string().max(200) }))
    .query(async ({ ctx, input }) => {
      await requireAccess(ctx.session, input.documentId);
      const sql = db();
      const row = await loadDocument(sql, input.documentId);
      if (!row?.record_id || !row.metric_id) return { count: 0 };
      const count = await invoiceDuplicates(sql, {
        recordId: row.record_id,
        orgUnitId: row.org_unit_id,
        periodId: row.reporting_period_id,
        metricId: row.metric_id,
        invoice: input.invoiceNumber,
      });
      return { count };
    }),

  /** The Confirm action: per-field verified values, the verification event and the record, in one go. */
  confirm: protectedProcedure
    .input(
      z.object({
        documentId: z.uuid(),
        fields: z.array(fieldEntry).min(1),
        acknowledgeDuplicate: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireAccess(ctx.session, input.documentId);
      const userId = ctx.session.userId;

      return db().begin(async (tx) => {
        const record = await lockPendingRecord(tx, input.documentId);
        if (
          (record.verification_status !== "ocr_completed" && !record.returned) ||
          !record.extraction_id
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This document has no completed extraction to verify.",
          });
        }
        if (!record.document_type_id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Select the document type first." });
        }

        const fieldRows = await loadFields(tx, input.documentId, record.metric_id);
        const fields: VerifyField[] = fieldRows
          .filter((f) => f.id)
          .map((f) => ({
            id: f.id!,
            key: f.field_key,
            label: f.field_label,
            dataType: f.data_type,
            required: f.is_required,
            critical: f.is_critical,
            extractedValue: f.extracted_value,
            confidence: f.confidence,
          }));
        const entries = Object.fromEntries(
          input.fields.map((f) => [f.id, { value: f.value, acknowledged: f.acknowledged }]),
        );
        if (fields.some((f) => !entries[f.id])) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Some fields were not submitted." });
        }

        const activity = activityFieldKeys(fields, await activityKeyFor(tx, record.metric_id));
        if (!activity.ok) throw new TRPCError({ code: "BAD_REQUEST", message: activity.reason });

        const threshold = await confidenceThreshold(tx);
        const invoice = fields.find((f) => f.key === INVOICE_FIELD);
        const duplicates = invoice
          ? await invoiceDuplicates(tx, {
              recordId: record.id,
              orgUnitId: record.org_unit_id,
              periodId: record.reporting_period_id,
              metricId: record.metric_id,
              invoice: entries[invoice.id].value,
            })
          : 0;

        // Field problems are reported first: a duplicate warning must never mask an invalid value.
        const check = checkConfirm(fields, entries, threshold, { documentTypeSelected: true });
        if (check.blockedReason) {
          throw new TRPCError({ code: "BAD_REQUEST", message: check.blockedReason });
        }
        if (duplicates > 0 && !input.acknowledgeDuplicate) {
          return { status: "confirm_duplicate" as const, duplicates };
        }

        let activityValue: number | null = null;
        let activityRaw: number | null = null;
        let activityUnit: string | null = null;
        for (const field of fields) {
          const value = entries[field.id].value.trim();
          const edited = value !== (field.extractedValue ?? "").trim();
          await tx`
            update public.ocr_fields
            set verified_value = ${value || null},
                verification_status = ${edited ? "edited" : "confirmed"},
                verified_by = ${userId}, verified_at = now()
            where id = ${field.id}`;
          if (edited) {
            await writeAudit(tx, {
              eventType: "verification.field_edited",
              entityType: "ocr_field",
              entityId: field.id,
              userId,
              oldValue: { field_key: field.key, extracted_value: field.extractedValue },
              newValue: { field_key: field.key, verified_value: value || null },
            });
          }
          if (field.key === activity.valueKey) {
            const verified = parseDecimal(value);
            activityValue = verified.ok ? verified.value : null;
            const raw = field.extractedValue ? parseDecimal(field.extractedValue) : null;
            activityRaw = raw?.ok ? raw.value : null;
          }
          if (activity.unitKey && field.key === activity.unitKey) activityUnit = value || null;
        }

        // A re-confirmed manual exception stays a manual exception (schema §9.3).
        const manual = record.extraction_source === "manual_exception";
        await tx`
          insert into public.verifications
            (esg_record_id, ocr_extraction_id, verified_by, is_manual_exception, notes)
          values (${record.id}, ${manual ? null : record.extraction_id}, ${userId}, ${manual},
                  ${record.returned ? "Re-verified after return" : null})`;
        await tx`
          update public.esg_records
          set activity_value_raw = ${activityRaw}, activity_value_verified = ${activityValue},
              activity_unit = ${activityUnit}, verified_by = ${userId},
              verification_status = 'user_verified', data_quality_state = 'verified'
          where id = ${record.id}`;
        await writeAudit(tx, {
          eventType: "verification.confirmed",
          entityType: "esg_record",
          entityId: record.id,
          userId,
          newValue: {
            document_id: input.documentId,
            ocr_extraction_id: record.extraction_id,
            activity_value_verified: activityValue,
            activity_unit: activityUnit,
            fields_edited: fields.filter(
              (f) => entries[f.id].value.trim() !== (f.extractedValue ?? "").trim(),
            ).length,
            confidence_threshold: threshold,
            duplicate_invoice_matches: duplicates,
          },
        });
        const validation = await runValidation(tx, record.id);
        return {
          status: "verified" as const,
          recordId: record.id,
          validation: validation.status,
        };
      });
    }),

  /** OCR failed: values entered by hand, flagged as an exception (03_APP_FLOW.md §4.5). */
  confirmManual: protectedProcedure
    .input(
      z.object({
        documentId: z.uuid(),
        values: z.array(z.object({ key: z.string().max(100), value: z.string().max(500) })),
        justification: z.string().trim().min(MANUAL_JUSTIFICATION_MIN).max(1000),
        acknowledgeDuplicate: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireAccess(ctx.session, input.documentId);
      const userId = ctx.session.userId;

      return db().begin(async (tx) => {
        const record = await lockPendingRecord(tx, input.documentId);
        if (record.job_status !== "failed" || !record.ocr_job_id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Manual entry is only for documents whose extraction failed.",
          });
        }
        if (record.extraction_id) {
          throw new TRPCError({ code: "CONFLICT", message: "This document already has values." });
        }
        if (!record.document_type_id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Select the document type first." });
        }

        const requirements = await tx<
          {
            field_key: string;
            field_label: string;
            data_type: FieldDataType;
            is_required: boolean;
            is_critical: boolean;
          }[]
        >`
          select field_key, field_label, data_type::text as data_type, is_required, is_critical
          from public.metric_field_requirements where metric_id = ${record.metric_id}
          order by field_label`;
        const fields: VerifyField[] = requirements.map((r) => ({
          id: r.field_key,
          key: r.field_key,
          label: r.field_label,
          dataType: r.data_type,
          required: r.is_required,
          critical: r.is_critical,
          extractedValue: null,
          confidence: null,
        }));
        const entries = Object.fromEntries(
          input.values.map((v) => [v.key, { value: v.value, acknowledged: true }]),
        );
        const activity = activityFieldKeys(fields, await activityKeyFor(tx, record.metric_id));
        if (!activity.ok) throw new TRPCError({ code: "BAD_REQUEST", message: activity.reason });
        const check = checkConfirm(fields, entries, null, { documentTypeSelected: true });
        if (check.blockedReason) {
          throw new TRPCError({ code: "BAD_REQUEST", message: check.blockedReason });
        }

        const invoiceValue = entries[INVOICE_FIELD]?.value ?? "";
        const duplicates = await invoiceDuplicates(tx, {
          recordId: record.id,
          orgUnitId: record.org_unit_id,
          periodId: record.reporting_period_id,
          metricId: record.metric_id,
          invoice: invoiceValue,
        });
        if (duplicates > 0 && !input.acknowledgeDuplicate) {
          return { status: "confirm_duplicate" as const, duplicates };
        }

        // A manual extraction row keeps hand-entered values in the same place as OCR values, with the
        // "no OCR value, no confidence" trail intact (.grill/phase-7-ocr-verification-decisions.md).
        const [extraction] = await tx<{ id: string }[]>`
          insert into public.ocr_extractions (ocr_job_id, document_id, raw_output)
          values (${record.ocr_job_id}, ${input.documentId}, ${tx.json({
            source: "manual_exception",
            reason: record.job_status,
            entered_by: userId,
          })})
          returning id`;
        for (const field of fields) {
          const value = (entries[field.key]?.value ?? "").trim();
          await tx`
            insert into public.ocr_fields (
              ocr_extraction_id, field_key, field_label, extracted_value, confidence,
              verified_value, verification_status, verified_by, verified_at
            ) values (
              ${extraction.id}, ${field.key}, ${field.label}, null, null,
              ${value || null}, 'edited', ${userId}, now()
            )`;
        }
        const parsed = parseDecimal(entries[activity.valueKey].value);
        await tx`
          insert into public.verifications
            (esg_record_id, ocr_extraction_id, verified_by, is_manual_exception, notes)
          values (${record.id}, null, ${userId}, true, ${input.justification})`;
        await tx`
          update public.esg_records
          set activity_value_verified = ${parsed.ok ? parsed.value : null},
              activity_unit = ${activity.unitKey ? (entries[activity.unitKey]?.value.trim() ?? null) : null},
              verified_by = ${userId}, verification_status = 'user_verified',
              data_quality_state = 'verified'
          where id = ${record.id}`;
        await writeAudit(tx, {
          eventType: "verification.manual_exception",
          entityType: "esg_record",
          entityId: record.id,
          userId,
          reason: input.justification,
          newValue: {
            document_id: input.documentId,
            ocr_extraction_id: extraction.id,
            ocr_error: record.job_status,
            values: Object.fromEntries(fields.map((f) => [f.key, entries[f.key]?.value ?? null])),
            duplicate_invoice_matches: duplicates,
          },
        });
        const validation = await runValidation(tx, record.id);
        return {
          status: "verified" as const,
          recordId: record.id,
          validation: validation.status,
        };
      });
    }),

  /** Reject: this document is not usable evidence. The file itself is kept — evidence is never deleted. */
  reject: protectedProcedure
    .input(
      z.object({
        documentId: z.uuid(),
        reason: z.string().trim().min(REJECT_REASON_MIN).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireAccess(ctx.session, input.documentId);
      await db().begin(async (tx) => {
        const record = await lockPendingRecord(tx, input.documentId);
        await tx`
          update public.esg_records set data_quality_state = 'rejected' where id = ${record.id}`;
        if (record.extraction_id) {
          await tx`
            update public.ocr_fields set verification_status = 'rejected'
            where ocr_extraction_id = ${record.extraction_id}`;
        }
        await writeAudit(tx, {
          eventType: "verification.rejected",
          entityType: "esg_record",
          entityId: record.id,
          userId: ctx.session.userId,
          reason: input.reason,
          oldValue: { data_quality_state: record.data_quality_state },
          newValue: { data_quality_state: "rejected", document_id: input.documentId },
        });
      });
      return null;
    }),
});
