import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { OcrJobStatus, RecordStatus } from "@/lib/ocr/rules";
import { inOrgScope } from "@/lib/auth/scope";
import { adminAreaProcedure, adminProcedure, protectedProcedure, router } from "@/lib/trpc/init";

// Phase 6 OCR status surfacing (.grill/phase-6-ocr-integration-decisions.md). The worker owns job
// processing (SCHEMA_DEVIATIONS D11); the app reads status and lets Admin re-queue failed jobs.

type Sql = ReturnType<typeof db>;

/**
 * Per-document extraction stats, as a lateral join over outer aliases `d` (documents) and `r`
 * (esg_records). "Needs attention" = found below the configured threshold, or required and not found —
 * the same rule the worker uses to pick the notification. No threshold row → every found field counts.
 */
function fieldStats(sql: Sql) {
  return sql`
    left join lateral (
      select
        count(*) filter (
          where (f.extracted_value is null and coalesce(req.is_required, false))
             or (f.extracted_value is not null and f.confidence < coalesce(t.threshold, 101))
        )::int as attention,
        count(*) filter (where f.extracted_value is not null)::int as found,
        count(f.id)::int as total,
        min(f.confidence)::float as lowest
      from public.ocr_extractions e
      join public.ocr_fields f on f.ocr_extraction_id = e.id
      left join public.metric_field_requirements req
        on req.metric_id = r.metric_id and req.field_key = f.field_key
      left join (
        select (value #>> '{}')::numeric as threshold from public.org_settings
        where key = 'ocr_confidence_threshold'
      ) t on true
      where e.document_id = d.id
    ) fs on true`;
}

/** When a pending job started waiting: upload time, or its latest Admin retry. */
function pendingSince(sql: Sql) {
  return sql`greatest(d.created_at, (
    select max(a.created_at) from public.audit_logs a
    where a.entity_type = 'ocr_job' and a.entity_id = j.id and a.event_type = 'ocr.job_retried'))`;
}

export type SubmissionRow = RecordStatus & {
  id: string;
  documentId: string | null;
  fileName: string | null;
  metricName: string;
  orgUnitName: string;
  periodLabel: string;
  submittedAt: string;
  errorMessage: string | null;
  attention: number;
  rejectedReason: string | null;
  manualException: boolean;
  returnReason: string | null;
};

export type OcrJobRow = {
  id: string;
  status: OcrJobStatus;
  attempts: number;
  errorMessage: string | null;
  modelVersion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  documentId: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  orgUnitName: string;
  metricName: string | null;
  periodLabel: string;
  recordAwaitingOcr: boolean;
  manualException: boolean;
  band: "low" | "ok" | null;
  attention: number;
  fieldsFound: number;
  fieldsTotal: number;
  lowestConfidence: number | null;
};

export type OcrFieldRow = {
  key: string;
  label: string;
  value: string | null;
  confidence: number | null;
};

const iso = (value: Date | null) => (value ? value.toISOString() : null);

export const ocrRouter = router({
  /** My Submissions: the signed-in user's own records, open period plus anything still in progress. */
  submissions: protectedProcedure.query(async ({ ctx }) => {
    const sql = db();
    const rows = await sql<
      {
        id: string;
        verification_status: RecordStatus["verificationStatus"];
        validation_status: RecordStatus["validationStatus"];
        approval_status: RecordStatus["approvalStatus"];
        data_quality_state: string;
        created_at: Date;
        metric_name: string;
        org_unit_name: string;
        period_label: string;
        document_id: string | null;
        file_name: string | null;
        job_status: OcrJobStatus | null;
        error_message: string | null;
        attention: number | null;
        rejected_reason: string | null;
        manual_exception: boolean;
        return_reason: string | null;
      }[]
    >`
      select r.id, r.verification_status, r.validation_status, r.approval_status,
             r.data_quality_state, r.created_at, m.name as metric_name, o.name as org_unit_name,
             p.label as period_label, d.id as document_id, d.file_name, j.status as job_status,
             j.error_message, fs.attention,
             (select a.reason from public.audit_logs a
               where a.event_type = 'verification.rejected' and a.entity_id = r.id
               order by a.created_at desc limit 1) as rejected_reason,
             exists (select 1 from public.verifications v
                      where v.esg_record_id = r.id and v.is_manual_exception) as manual_exception,
             case
               when r.approval_status = 'returned' then (
                 select ap.reason from public.approvals ap
                 where ap.esg_record_id = r.id and ap.action = 'returned'
                 order by ap.decided_at desc limit 1)
               when r.validation_status = 'returned' then (
                 select a.reason from public.audit_logs a
                 where a.event_type = 'validation.returned' and a.entity_id = r.id
                 order by a.created_at desc limit 1)
               when r.validation_status = 'failed' then (
                 select string_agg(vr.message, ' ') from public.validation_results vr
                 where vr.esg_record_id = r.id and vr.result = 'fail'
                   and vr.evaluated_at = (select max(evaluated_at) from public.validation_results
                                          where esg_record_id = r.id))
             end as return_reason
      from public.esg_records r
      join public.esg_metrics m on m.id = r.metric_id
      join public.org_units o on o.id = r.org_unit_id
      join public.reporting_periods p on p.id = r.reporting_period_id
      left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
      left join public.documents d on d.id = erd.document_id and d.deleted_at is null
      left join public.ocr_jobs j on j.document_id = d.id
      ${fieldStats(sql)}
      where r.submitted_by = ${ctx.session.userId}
        and (p.status = 'open'
             or (r.approval_status not in ('approved', 'rejected')
                 and r.data_quality_state <> 'rejected'))
      order by r.created_at desc`;
    return rows.map((r): SubmissionRow => ({
      id: r.id,
      verificationStatus: r.verification_status,
      validationStatus: r.validation_status,
      approvalStatus: r.approval_status,
      dataQualityState: r.data_quality_state,
      jobStatus: r.job_status,
      documentId: r.document_id,
      fileName: r.file_name,
      metricName: r.metric_name,
      orgUnitName: r.org_unit_name,
      periodLabel: r.period_label,
      submittedAt: r.created_at.toISOString(),
      errorMessage: r.job_status === "failed" ? r.error_message : null,
      attention: r.attention ?? 0,
      rejectedReason: r.rejected_reason,
      manualException: r.manual_exception,
      returnReason: r.return_reason,
    }));
  }),

  /** OCR Monitoring (03_APP_FLOW.md §2.2): newest jobs plus the worker health signal. */
  jobs: adminProcedure.query(async () => {
    const sql = db();
    // ponytail: newest 500 jobs, filtered in the browser; move filters server-side if volume grows.
    const [rows, [health], [setting]] = await Promise.all([
      sql<
        {
          id: string;
          status: OcrJobStatus;
          retry_count: number;
          error_message: string | null;
          model_version: string | null;
          started_at: Date | null;
          completed_at: Date | null;
          document_id: string;
          file_name: string;
          created_at: Date;
          uploaded_by: string;
          org_unit_name: string;
          metric_name: string | null;
          period_label: string;
          verification_status: string | null;
          manual_exception: boolean;
          attention: number | null;
          found: number | null;
          total: number | null;
          lowest: number | null;
        }[]
      >`
        select j.id, j.status, j.retry_count, j.error_message, j.model_version, j.started_at,
               j.completed_at, d.id as document_id, d.file_name, d.created_at,
               u.display_name as uploaded_by, o.name as org_unit_name, m.name as metric_name,
               p.label as period_label, r.verification_status,
               exists (select 1 from public.verifications v
                        where v.esg_record_id = r.id and v.is_manual_exception) as manual_exception,
               fs.attention, fs.found, fs.total, fs.lowest
        from public.ocr_jobs j
        join public.documents d on d.id = j.document_id and d.deleted_at is null
        join public.users u on u.id = d.uploaded_by
        join public.org_units o on o.id = d.org_unit_id
        join public.reporting_periods p on p.id = d.reporting_period_id
        left join public.esg_record_documents erd on erd.document_id = d.id and erd.is_primary
        left join public.esg_records r on r.id = erd.esg_record_id
        left join public.esg_metrics m on m.id = r.metric_id
        ${fieldStats(sql)}
        order by d.created_at desc
        limit 500`,
      sql<{ oldest_pending: Date | null }[]>`
        select min(${pendingSince(sql)}) as oldest_pending
        from public.ocr_jobs j
        join public.documents d on d.id = j.document_id and d.deleted_at is null
        where j.status = 'pending'`,
      sql<{ threshold: number | null }[]>`
        select (value #>> '{}')::float as threshold from public.org_settings
        where key = 'ocr_confidence_threshold'`,
    ]);

    return {
      threshold: setting?.threshold ?? null,
      oldestPendingSince: iso(health.oldest_pending),
      jobs: rows.map((r): OcrJobRow => ({
        id: r.id,
        status: r.status,
        // retry_count counts extra attempts; a job that has started or finished used one more.
        attempts: r.status === "pending" ? r.retry_count : r.retry_count + 1,
        errorMessage: r.error_message,
        modelVersion: r.model_version,
        startedAt: iso(r.started_at),
        completedAt: iso(r.completed_at),
        documentId: r.document_id,
        fileName: r.file_name,
        uploadedAt: r.created_at.toISOString(),
        uploadedBy: r.uploaded_by,
        orgUnitName: r.org_unit_name,
        metricName: r.metric_name,
        periodLabel: r.period_label,
        recordAwaitingOcr: r.verification_status === "document_uploaded",
        manualException: r.manual_exception,
        band: r.status === "completed" ? ((r.attention ?? 0) > 0 ? "low" : "ok") : null,
        attention: r.attention ?? 0,
        fieldsFound: r.found ?? 0,
        fieldsTotal: r.total ?? 0,
        lowestConfidence: r.lowest,
      })),
    };
  }),

  /** Extracted fields for the OCR Monitoring detail drawer (read-only; verification is Phase 7). */
  jobFields: adminProcedure.input(z.object({ jobId: z.uuid() })).query(async ({ input }) => {
    const rows = await db()<
      {
        field_key: string;
        field_label: string;
        extracted_value: string | null;
        confidence: number | null;
      }[]
    >`
        select f.field_key, f.field_label, f.extracted_value, f.confidence::float as confidence
        from public.ocr_extractions e
        join public.ocr_fields f on f.ocr_extraction_id = e.id
        where e.ocr_job_id = ${input.jobId}
        order by f.field_label`;
    return rows.map((r): OcrFieldRow => ({
      key: r.field_key,
      label: r.field_label,
      value: r.extracted_value,
      confidence: r.confidence,
    }));
  }),

  /**
   * Re-queue a failed job with fresh attempts (.grill/phase-6-ocr-integration-decisions.md). From the record
   * panel of Submission Monitoring (Phase 3), so an Administrator may retry inside their own units.
   */
  retry: adminAreaProcedure
    .input(z.object({ jobId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [owner] = await db()<{ org_unit_id: string }[]>`
      select d.org_unit_id from public.ocr_jobs j join public.documents d on d.id = j.document_id
      where j.id = ${input.jobId}`;
      // Outside the caller's scope reads the same as missing (§4.4).
      if (!owner || !(await inOrgScope(db(), ctx.session, owner.org_unit_id))) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That OCR job no longer exists." });
      }
      await db().begin(async (tx) => {
        const [job] = await tx<
          {
            id: string;
            status: OcrJobStatus;
            retry_count: number;
            error_message: string | null;
            document_id: string;
            verification_status: string | null;
          }[]
        >`
          select j.id, j.status, j.retry_count, j.error_message, j.document_id, r.verification_status
          from public.ocr_jobs j
          join public.documents d on d.id = j.document_id and d.deleted_at is null
          left join public.esg_record_documents erd on erd.document_id = d.id and erd.is_primary
          left join public.esg_records r on r.id = erd.esg_record_id
          where j.id = ${input.jobId}
          for update of j`;
        if (!job) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That OCR job no longer exists." });
        }
        if (job.status !== "failed") {
          throw new TRPCError({ code: "CONFLICT", message: "Only failed jobs can be retried." });
        }
        if (job.verification_status !== "document_uploaded") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This document's record is no longer waiting for extraction.",
          });
        }

        await tx`
          update public.ocr_jobs
          set status = 'pending', retry_count = 0, error_message = null, started_at = null,
              completed_at = null
          where id = ${job.id}`;
        await tx`update public.documents set upload_status = 'uploaded' where id = ${job.document_id}`;
        await writeAudit(tx, {
          eventType: "ocr.job_retried",
          entityType: "ocr_job",
          entityId: job.id,
          userId: ctx.session.userId,
          oldValue: {
            status: "failed",
            error_message: job.error_message,
            attempts: job.retry_count,
          },
          newValue: { status: "pending", attempts: 0 },
        });
      });
      return null;
    }),
});
