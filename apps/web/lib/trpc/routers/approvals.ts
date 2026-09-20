import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { loadCalculations } from "@/lib/calculation/lookup";
import type { CalculationState } from "@/lib/calculation/trace";
import type { ActiveSession } from "@/lib/auth/session";
import { db, type Tx } from "@/lib/db";
import type { Outcome, RuleType } from "@/lib/validation/checks";
import { permissionProcedure, router } from "@/lib/trpc/init";

// Approval Queue (03_APP_FLOW.md §2.2 / §4.9; UI brief §12.5; schema §9.5). Mounted at
// /admin/approval-queue and /app/approvals (A1). Approvers never decide on a record they submitted or
// verified (SCHEMA_DEVIATIONS D1 item 8), and non-Admin approvers only see records inside their scope.

const decide = permissionProcedure("approval.decide");
export const RETURN_REASON_MIN = 10;

type Sql = Tx | ReturnType<typeof db>;

export type ApprovalRow = {
  recordId: string;
  documentId: string | null;
  fileName: string | null;
  mimeType: string | null;
  orgUnitName: string;
  metricName: string;
  periodLabel: string;
  submittedBy: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  activityValue: number | null;
  activityUnit: string | null;
  manualException: boolean;
  /** The signed-in approver submitted or verified this record, so they may not decide on it. */
  ownRecord: boolean;
  values: { label: string; value: string | null }[];
  results: { ruleType: RuleType; outcome: Outcome; message: string }[];
  /** The stored calculation, or why there isn't one yet — Approve is blocked until it exists (Phase 9). */
  calculation: CalculationState;
  requiresCalculation: boolean;
};

/** Org units an approver may act on: everything for Admin, else their approval.decide subtrees. */
function scopeFilter(sql: Sql, session: ActiveSession) {
  if (session.isAdmin) return sql`true`;
  return sql`r.org_unit_id in (
    with recursive scope as (
      select uoa.org_unit_id as id
      from public.user_org_assignments uoa
      join public.role_permissions rp on rp.role_id = uoa.role_id
      join public.permissions p on p.id = rp.permission_id and p.code = 'approval.decide'
      where uoa.user_id = ${session.userId} and uoa.revoked_at is null
      union
      select o.id from public.org_units o join scope s on o.parent_id = s.id
    )
    select id from scope)`;
}

export const approvalsRouter = router({
  /** Records awaiting approval inside the approver's scope, oldest first (first in, first decided). */
  queue: decide.query(async ({ ctx }): Promise<ApprovalRow[]> => {
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
        submitted_by_id: string;
        submitted_by: string;
        verified_by_id: string | null;
        verified_by: string | null;
        verified_at: Date | null;
        activity_value: number | null;
        activity_unit: string | null;
        manual_exception: boolean;
        requires_calculation: boolean;
        values: { label: string; value: string | null }[] | null;
        results: ApprovalRow["results"] | null;
      }[]
    >`
      select r.id as record_id, d.id as document_id, d.file_name, d.mime_type,
             o.name as org_unit_name, m.name as metric_name, p.label as period_label,
             r.submitted_by as submitted_by_id, su.display_name as submitted_by,
             v.verified_by as verified_by_id, vu.display_name as verified_by, v.verified_at,
             r.activity_value_verified::float as activity_value, r.activity_unit,
             coalesce(v.is_manual_exception, false) as manual_exception,
             m.requires_calculation,
             (select json_agg(json_build_object('label', f.field_label, 'value', f.verified_value)
                              order by f.field_label)
                from public.ocr_extractions e join public.ocr_fields f on f.ocr_extraction_id = e.id
                where e.document_id = d.id) as values,
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
      join public.users su on su.id = r.submitted_by
      left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
      left join public.documents d on d.id = erd.document_id and d.deleted_at is null
      left join lateral (
        select verified_by, verified_at, is_manual_exception from public.verifications
        where esg_record_id = r.id order by verified_at desc limit 1
      ) v on true
      left join public.users vu on vu.id = v.verified_by
      where r.approval_status = 'review_pending' and r.data_quality_state <> 'rejected'
        and ${scopeFilter(sql, ctx.session)}
      order by v.verified_at nulls last
      limit 500`;
    const calculations = await loadCalculations(
      sql,
      rows.map((r) => r.record_id),
    );
    return rows.map((r) => ({
      recordId: r.record_id,
      documentId: r.document_id,
      fileName: r.file_name,
      mimeType: r.mime_type,
      orgUnitName: r.org_unit_name,
      metricName: r.metric_name,
      periodLabel: r.period_label,
      submittedBy: r.submitted_by,
      verifiedBy: r.verified_by,
      verifiedAt: r.verified_at?.toISOString() ?? null,
      activityValue: r.activity_value,
      activityUnit: r.activity_unit,
      manualException: r.manual_exception,
      ownRecord:
        r.submitted_by_id === ctx.session.userId || r.verified_by_id === ctx.session.userId,
      values: r.values ?? [],
      results: r.results ?? [],
      calculation: calculations.get(r.record_id) ?? { trace: null, blockedReason: null },
      requiresCalculation: r.requires_calculation,
    }));
  }),

  /** Approve, or Return for correction with a reason (§4.9). One transaction with the audit entry. */
  decide: decide
    .input(
      z.discriminatedUnion("decision", [
        z.object({ recordId: z.uuid(), decision: z.literal("approve") }),
        z.object({
          recordId: z.uuid(),
          decision: z.literal("return"),
          reason: z.string().trim().min(RETURN_REASON_MIN).max(1000),
        }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.userId;
      await db().begin(async (tx) => {
        const [record] = await tx<
          {
            id: string;
            approval_status: string;
            data_quality_state: string;
            submitted_by: string;
            verified_by: string | null;
            document_id: string | null;
            file_name: string | null;
            needs_calculation: boolean;
          }[]
        >`
          select r.id, r.approval_status::text, r.data_quality_state::text, r.submitted_by,
                 (m.requires_calculation and not exists (
                    select 1 from public.calculations c
                    where c.esg_record_id = r.id and c.is_current)) as needs_calculation,
                 (select verified_by from public.verifications
                   where esg_record_id = r.id order by verified_at desc limit 1) as verified_by,
                 d.id as document_id, d.file_name
          from public.esg_records r
          join public.esg_metrics m on m.id = r.metric_id
          left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
          left join public.documents d on d.id = erd.document_id
          where r.id = ${input.recordId} and ${scopeFilter(tx, ctx.session)}
          for update of r`;
        // Out of scope and missing look the same (§4.4).
        if (!record) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That record isn't available." });
        }
        if (
          record.approval_status !== "review_pending" ||
          record.data_quality_state === "rejected"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This record is not awaiting approval.",
          });
        }
        if (record.submitted_by === userId || record.verified_by === userId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You submitted or verified this record, so someone else must decide on it.",
          });
        }

        // Approving means approving a number: a record whose calculation is still blocked can only be
        // returned (.grill/phase-9-calculation-engine-decisions.md).
        if (input.decision === "approve" && record.needs_calculation) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This record has no calculation yet — an Admin must add the conversion factor first.",
          });
        }

        const approve = input.decision === "approve";
        const reason = input.decision === "return" ? input.reason : null;
        await tx`
          insert into public.approvals (esg_record_id, action, decided_by, reason)
          values (${record.id}, ${approve ? "approved" : "returned"}, ${userId}, ${reason})`;
        await tx`
          update public.esg_records
          set approval_status = ${approve ? "approved" : "returned"},
              data_quality_state = ${approve ? "approved" : "validated"}
          where id = ${record.id}`;
        await writeAudit(tx, {
          eventType: approve ? "approval.approved" : "approval.returned",
          entityType: "esg_record",
          entityId: record.id,
          userId,
          reason,
          oldValue: { approval_status: "review_pending" },
          newValue: { approval_status: approve ? "approved" : "returned" },
        });
        const file = record.file_name ?? "Your submission";
        await tx`
          insert into public.notifications
            (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
          values (${record.submitted_by}, ${approve ? "approved" : "returned"},
                  ${approve ? "Approved" : "Returned for correction"},
                  ${approve ? `${file} was approved.` : `${file}: ${reason}`},
                  'esg_record', ${record.id},
                  ${approve ? "/app/submissions?tab=approved" : `/app/verify/${record.document_id}`})`;
      });
      return null;
    }),
});
