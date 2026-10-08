import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { loadCalculations } from "@/lib/calculation/lookup";
import type { CalculationState } from "@/lib/calculation/trace";
import { financialYearOf, financialYearRange } from "@/lib/consolidation/aggregate";
import {
  missingSubmissions,
  summary,
  type MissingSubmission,
  type Summary,
} from "@/lib/dashboard/summary";
import { db } from "@/lib/db";
import {
  ISSUES,
  searchRecords,
  STATUSES,
  RECORD_LIMIT,
  type RecordFilters,
  type RecordRow,
} from "@/lib/records/search";
import { adminProcedure, permissionProcedure, router } from "@/lib/trpc/init";
import { resolvePeriod } from "@/lib/trpc/routers/scope";

// Control Tower, Submission Monitoring and ESG Data Explorer (03_APP_FLOW.md §2.2; Phase 16). Admin only;
// the org/period context arrives in the URL and is resolved here (.grill/phase-16-control-tower-decisions.md).

export type ContextOptions = {
  orgUnitId: string;
  periodId: string;
  periodLabel: string;
  orgUnits: { id: string; name: string; unitType: string; depth: number }[];
  periods: { id: string; label: string; financialYear: number }[];
  roles: { code: string; name: string }[];
  metrics: { code: string; name: string }[];
};

/** The node and period in view: the ones asked for, else the organisation root and the open period. */
async function resolveContext(orgUnitId?: string, periodId?: string): Promise<ContextOptions> {
  const sql = db();
  const [orgUnits, periods, roles, metrics] = await Promise.all([
    // Depth-first order with depth, so the picker can indent the tree.
    sql<{ id: string; name: string; unit_type: string; depth: number }[]>`
      with recursive tree as (
        select id, name, unit_type, 0 as depth, array[name::text] as path
        from public.org_units where parent_id is null and deleted_at is null
        union all
        select o.id, o.name, o.unit_type, t.depth + 1, t.path || o.name::text
        from public.org_units o join tree t on o.parent_id = t.id where o.deleted_at is null
      )
      select id, name, unit_type::text, depth from tree order by path`,
    sql<{ id: string; label: string; start_date: string }[]>`
      select id, label, start_date::text from public.reporting_periods order by start_date desc`,
    sql<{ code: string; name: string }[]>`
      select code, name from public.roles where code <> 'admin' order by name`,
    sql<{ code: string; name: string }[]>`
      select code, name from public.esg_metrics where deleted_at is null order by name`,
  ]);
  const node = orgUnits.find((o) => o.id === orgUnitId) ?? orgUnits[0];
  if (!node) throw new TRPCError({ code: "NOT_FOUND", message: "No organisation configured yet." });
  const resolvedPeriod =
    periods.find((p) => p.id === periodId)?.id ?? (await resolvePeriod(undefined)) ?? "";
  return {
    orgUnitId: node.id,
    periodId: resolvedPeriod,
    periodLabel: periods.find((p) => p.id === resolvedPeriod)?.label ?? "",
    orgUnits: orgUnits.map((o) => ({
      id: o.id,
      name: o.name,
      unitType: o.unit_type,
      depth: o.depth,
    })),
    periods: periods.map((p) => ({
      id: p.id,
      label: p.label,
      financialYear: financialYearOf(p.start_date),
    })),
    roles,
    metrics,
  };
}

const contextInput = z.object({ orgUnitId: z.uuid().optional(), periodId: z.uuid().optional() });

const searchInput = contextInput.extend({
  /** A whole April–March financial year instead of one period (Data Explorer). */
  financialYear: z.number().int().min(2000).max(2100).optional(),
  scopeCode: z.string().trim().max(60).optional(),
  metricCode: z.string().trim().max(60).optional(),
  roleCode: z.string().trim().max(60).optional(),
  status: z.enum(STATUSES).optional(),
  issue: z.enum(ISSUES).optional(),
});

export type AuditEntry = {
  at: string;
  event: string;
  who: string | null;
  reason: string | null;
};

export type RecordDetail = {
  recordId: string;
  metricName: string;
  orgUnitName: string;
  periodLabel: string;
  documentId: string | null;
  fileName: string | null;
  mimeType: string | null;
  submittedBy: string;
  verifiedBy: string | null;
  statuses: { verification: string; validation: string; approval: string; quality: string };
  activityValue: number | null;
  activityUnit: string | null;
  fields: { label: string; value: string | null }[];
  results: { ruleType: string; outcome: string; message: string }[];
  calculation: CalculationState;
  audit: AuditEntry[];
};

export const recordsRouter = router({
  /** The Control Tower for one node and period, with the picker's options. */
  summary: permissionProcedure("monitoring.view")
    .input(contextInput)
    .query(async ({ input }): Promise<{ context: ContextOptions; summary: Summary | null }> => {
      const context = await resolveContext(input.orgUnitId, input.periodId);
      return {
        context,
        summary: context.periodId ? await summary(db(), context.orgUnitId, context.periodId) : null,
      };
    }),

  search: adminProcedure
    .input(searchInput)
    .query(
      async ({
        input,
      }): Promise<{ context: ContextOptions; rows: RecordRow[]; truncated: boolean }> => {
        const context = await resolveContext(input.orgUnitId, input.periodId);
        let periodIds = context.periodId ? [context.periodId] : [];
        if (input.financialYear !== undefined) {
          const { from, to } = financialYearRange(input.financialYear);
          const periods = await db()<{ id: string }[]>`
          select id from public.reporting_periods where start_date >= ${from} and end_date <= ${to}`;
          periodIds = periods.map((p) => p.id);
        }
        const filters: RecordFilters = {
          orgUnitId: context.orgUnitId,
          periodIds,
          scopeCode: input.scopeCode,
          metricCode: input.metricCode,
          roleCode: input.roleCode,
          status: input.status,
          issue: input.issue,
        };
        const rows = await searchRecords(db(), filters);
        return { context, rows, truncated: rows.length === RECORD_LIMIT };
      },
    ),

  /** Expected submissions with nothing filed for the period (Control Tower "missing submissions"). */
  missing: adminProcedure
    .input(contextInput)
    .query(async ({ input }): Promise<{ context: ContextOptions; rows: MissingSubmission[] }> => {
      const context = await resolveContext(input.orgUnitId, input.periodId);
      return {
        context,
        rows: context.periodId
          ? await missingSubmissions(db(), context.orgUnitId, context.periodId)
          : [],
      };
    }),

  /** The shared record detail (App Flow §2.2): evidence, extracted values, validation, calculation, audit. */
  detail: adminProcedure
    .input(z.object({ recordId: z.uuid() }))
    .query(async ({ input }): Promise<RecordDetail> => {
      const sql = db();
      const [r] = await sql<
        {
          id: string;
          metric_name: string;
          org_unit_name: string;
          period_label: string;
          document_id: string | null;
          file_name: string | null;
          mime_type: string | null;
          submitted_by: string;
          verified_by: string | null;
          verification_status: string;
          validation_status: string;
          approval_status: string;
          data_quality_state: string;
          activity_value: number | null;
          activity_unit: string | null;
        }[]
      >`
        select r.id, m.name as metric_name, o.name as org_unit_name, p.label as period_label,
               d.id as document_id, d.file_name, d.mime_type, su.display_name as submitted_by,
               vu.display_name as verified_by, r.verification_status::text,
               r.validation_status::text, r.approval_status::text, r.data_quality_state::text,
               r.activity_value_verified::float as activity_value, r.activity_unit
        from public.esg_records r
        join public.esg_metrics m on m.id = r.metric_id
        join public.org_units o on o.id = r.org_unit_id
        join public.reporting_periods p on p.id = r.reporting_period_id
        join public.users su on su.id = r.submitted_by
        left join public.users vu on vu.id = r.verified_by
        left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
        left join public.documents d on d.id = erd.document_id and d.deleted_at is null
        where r.id = ${input.recordId}`;
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Record not found." });

      const [fields, results, audit, calculations] = await Promise.all([
        sql<{ label: string; value: string | null }[]>`
          select f.field_label as label, coalesce(f.verified_value, f.extracted_value) as value
          from public.ocr_extractions e join public.ocr_fields f on f.ocr_extraction_id = e.id
          where e.document_id = ${r.document_id} order by f.field_label`,
        sql<{ rule_type: string; outcome: string; message: string }[]>`
          select vr.rule_type::text, vr.result::text as outcome, vr.message
          from public.validation_results vr
          where vr.esg_record_id = ${r.id}
            and vr.evaluated_at = (select max(evaluated_at) from public.validation_results
                                   where esg_record_id = ${r.id})
          order by vr.rule_type`,
        // The record's own events and its document's (upload, OCR), oldest first.
        sql<{ created_at: Date; event_type: string; who: string | null; reason: string | null }[]>`
          select a.created_at, a.event_type, u.display_name as who, a.reason
          from public.audit_logs a left join public.users u on u.id = a.user_id
          where a.entity_id = ${r.id} or a.entity_id = ${r.document_id}
          order by a.created_at`,
        loadCalculations(sql, [r.id]),
      ]);

      return {
        recordId: r.id,
        metricName: r.metric_name,
        orgUnitName: r.org_unit_name,
        periodLabel: r.period_label,
        documentId: r.document_id,
        fileName: r.file_name,
        mimeType: r.mime_type,
        submittedBy: r.submitted_by,
        verifiedBy: r.verified_by,
        statuses: {
          verification: r.verification_status,
          validation: r.validation_status,
          approval: r.approval_status,
          quality: r.data_quality_state,
        },
        activityValue: r.activity_value,
        activityUnit: r.activity_unit,
        fields,
        results: results.map((v) => ({
          ruleType: v.rule_type,
          outcome: v.outcome,
          message: v.message,
        })),
        calculation: calculations.get(r.id) ?? { trace: null, blockedReason: null },
        audit: audit.map((a) => ({
          at: a.created_at.toISOString(),
          event: a.event_type,
          who: a.who,
          reason: a.reason,
        })),
      };
    }),
});
