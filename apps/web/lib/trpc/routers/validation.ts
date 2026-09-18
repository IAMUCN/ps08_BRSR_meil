import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { submitForApproval } from "@/lib/approvals/workflow";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { Outcome, RuleType } from "@/lib/validation/checks";
import { permissionProcedure, router } from "@/lib/trpc/init";

// Admin Validation Queue (03_APP_FLOW.md §2.2): records that failed validation or were flagged.
// Decisions: .grill/phase-8-validation-engine-decisions.md. `validation.review` is Admin-held (migration 0009).

const review = permissionProcedure("validation.review");
export const REVIEW_REASON_MIN = 10;

export type QueueResult = { ruleType: RuleType; outcome: Outcome; message: string };

export type QueueRow = {
  recordId: string;
  documentId: string | null;
  fileName: string | null;
  mimeType: string | null;
  orgUnitName: string;
  metricName: string;
  periodLabel: string;
  submittedBy: string;
  verifiedAt: string | null;
  activityValue: number | null;
  activityUnit: string | null;
  status: "flagged" | "failed";
  manualException: boolean;
  duplicate: boolean;
  results: QueueResult[];
};

export const validationRouter = router({
  /** Flagged and failed records with their latest validation run, newest first. */
  queue: review.query(async (): Promise<QueueRow[]> => {
    const sql = db();
    const rows = await sql<
      {
        record_id: string;
        document_id: string | null;
        file_name: string | null;
        mime_type: string | null;
        org_unit_name: string;
        metric_name: string;
        period_label: string;
        submitted_by: string;
        verified_at: Date | null;
        activity_value: number | null;
        activity_unit: string | null;
        status: "flagged" | "failed";
        manual_exception: boolean;
        duplicate: boolean;
        results: QueueResult[] | null;
      }[]
    >`
      select r.id as record_id, d.id as document_id, d.file_name, d.mime_type,
             o.name as org_unit_name, m.name as metric_name, p.label as period_label,
             u.display_name as submitted_by, v.verified_at,
             r.activity_value_verified::float as activity_value, r.activity_unit,
             r.validation_status::text as status, coalesce(v.is_manual_exception, false) as manual_exception,
             r.is_duplicate_flag as duplicate,
             (select json_agg(json_build_object(
                        'ruleType', vr.rule_type, 'outcome', vr.result, 'message', vr.message)
                      order by vr.rule_type, vr.result desc)
                from public.validation_results vr
                where vr.esg_record_id = r.id
                  and vr.evaluated_at = (select max(evaluated_at) from public.validation_results
                                         where esg_record_id = r.id)) as results
      from public.esg_records r
      join public.org_units o on o.id = r.org_unit_id
      join public.esg_metrics m on m.id = r.metric_id
      join public.reporting_periods p on p.id = r.reporting_period_id
      join public.users u on u.id = r.submitted_by
      left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
      left join public.documents d on d.id = erd.document_id and d.deleted_at is null
      left join lateral (
        select verified_at, is_manual_exception from public.verifications
        where esg_record_id = r.id order by verified_at desc limit 1
      ) v on true
      where r.validation_status in ('flagged', 'failed') and r.data_quality_state <> 'rejected'
      order by v.verified_at desc nulls last
      limit 500`;
    return rows.map((r) => ({
      recordId: r.record_id,
      documentId: r.document_id,
      fileName: r.file_name,
      mimeType: r.mime_type,
      orgUnitName: r.org_unit_name,
      metricName: r.metric_name,
      periodLabel: r.period_label,
      submittedBy: r.submitted_by,
      verifiedAt: r.verified_at?.toISOString() ?? null,
      activityValue: r.activity_value,
      activityUnit: r.activity_unit,
      status: r.status,
      manualException: r.manual_exception,
      duplicate: r.duplicate,
      results: r.results ?? [],
    }));
  }),

  /**
   * Accept (clears the flag, record proceeds to calculation) or Return to the submitter. Only flagged
   * records: hard fails are corrected by the submitter, never overridden here.
   */
  review: review
    .input(
      z.object({
        recordId: z.uuid(),
        decision: z.enum(["accept", "return"]),
        reason: z.string().trim().min(REVIEW_REASON_MIN).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        const [record] = await tx<
          {
            id: string;
            validation_status: string;
            data_quality_state: string;
            submitted_by: string;
            document_id: string | null;
            file_name: string | null;
          }[]
        >`
          select r.id, r.validation_status::text, r.data_quality_state::text, r.submitted_by,
                 d.id as document_id, d.file_name
          from public.esg_records r
          left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
          left join public.documents d on d.id = erd.document_id
          where r.id = ${input.recordId}
          for update of r`;
        if (!record) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That record no longer exists." });
        }
        if (record.validation_status !== "flagged" || record.data_quality_state === "rejected") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Only records flagged for review can be accepted or returned here.",
          });
        }

        const accept = input.decision === "accept";
        await tx`
          update public.esg_records
          set validation_status = ${accept ? "validated" : "returned"},
              data_quality_state = ${accept ? "validated" : "verified"}
          where id = ${record.id}`;
        // An accepted flag moves on to approval like any clean record (§4.9).
        if (accept) await submitForApproval(tx, record.id);
        await writeAudit(tx, {
          eventType: accept ? "validation.accepted" : "validation.returned",
          entityType: "esg_record",
          entityId: record.id,
          userId: ctx.session.userId,
          reason: input.reason,
          oldValue: { validation_status: "flagged" },
          newValue: { validation_status: accept ? "validated" : "returned" },
        });
        if (!accept) {
          await tx`
            insert into public.notifications
              (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
            values (${record.submitted_by}, 'returned', 'Returned for correction',
                    ${`${record.file_name ?? "Your submission"}: ${input.reason}`},
                    'esg_record', ${record.id}, ${`/app/verify/${record.document_id}`})`;
        }
      });
      return null;
    }),
});
