import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { loadCalculations } from "@/lib/calculation/lookup";
import type { CalculationState } from "@/lib/calculation/trace";
import { financialYearOf, financialYearRange } from "@/lib/consolidation/aggregate";
import { writeAudit } from "@/lib/audit";
import { assertOrgScope } from "@/lib/auth/scope";
import {
  missingSubmissionOwners,
  missingSubmissions,
  summary,
  type MissingSubmission,
  type Summary,
} from "@/lib/dashboard/summary";
import { kpiTrends, type KpiTrends, type TrendRow } from "@/lib/dashboard/trends";
import { sendEmail, submissionReminderEmailHtml } from "@/lib/email/brevo";
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
  /** The search box: words a record must contain. */
  text: z.string().trim().max(100).optional(),
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
    .query(
      async ({ ctx, input }): Promise<{ context: ContextOptions; summary: Summary | null }> => {
        const context = await resolveContext(input.orgUnitId, input.periodId);
        // monitoring.view can be held below the group: the figures stay inside the holder's own scope.
        await assertOrgScope(db(), ctx.session, context.orgUnitId);
        return {
          context,
          summary: context.periodId
            ? await summary(db(), context.orgUnitId, context.periodId)
            : null,
        };
      },
    ),

  /** The headline figures of each financial year for the node and everything beneath it. */
  kpiTrends: permissionProcedure("monitoring.view")
    .input(z.object({ orgUnitId: z.uuid() }))
    .query(async ({ ctx, input }): Promise<KpiTrends> => {
      await assertOrgScope(db(), ctx.session, input.orgUnitId);
      const rows = await db()<
        {
          financial_year: number;
          scope_code: string | null;
          metric_code: string;
          value: number | null;
          unit: string | null;
          activity: number | null;
          activity_unit: string | null;
        }[]
      >`
        select (extract(year from p.start_date)::int
                 - case when extract(month from p.start_date) < 4 then 1 else 0 end) as financial_year,
               coalesce(ps.code, s.code) as scope_code, m.code as metric_code,
               sum(cr.value)::float as value, cr.value_unit as unit,
               sum(r.activity_value_verified)::float as activity, r.activity_unit
        from public.consolidation_records cr
        join public.esg_records r on r.id = cr.esg_record_id
        join public.reporting_periods p on p.id = cr.reporting_period_id
        join public.esg_metrics m on m.id = cr.metric_id
        left join public.scopes s on s.id = m.scope_id
        left join public.scopes ps on ps.id = s.parent_scope_id
        where cr.org_unit_id = ${input.orgUnitId} and cr.approval_status = 'approved'
          and cr.value is not null
          and (m.scope_id is not null or m.code = 'WATER_CONSUMPTION')
        group by 1, 2, 3, cr.value_unit, r.activity_unit`;
      return kpiTrends(
        rows.map((r): TrendRow => ({
          financialYear: r.financial_year,
          scopeCode: r.scope_code,
          metricCode: r.metric_code,
          value: r.value,
          unit: r.unit,
          activity: r.activity,
          activityUnit: r.activity_unit,
        })),
      );
    }),

  /**
   * Reminds the people who can file each missing expected submission: one in-app notification each, and an
   * email when email is configured. At most one reminder per person per period per day.
   */
  // ponytail: sent when an Admin presses the button — there is no scheduler. Add a daily job when the app
  // is deployed somewhere that has one.
  remindMissing: adminProcedure.input(contextInput).mutation(async ({ ctx, input }) => {
    const context = await resolveContext(input.orgUnitId, input.periodId);
    if (!context.periodId) return { missing: 0, reminded: 0, emailed: 0, alreadyReminded: 0 };
    const sql = db();
    const [missing, owners, [period]] = await Promise.all([
      missingSubmissions(sql, context.orgUnitId, context.periodId),
      missingSubmissionOwners(sql, context.orgUnitId, context.periodId),
      sql<{ closes_on: string | null }[]>`
          select to_char(submission_closes_on, 'DD Mon YYYY') as closes_on
          from public.reporting_periods where id = ${context.periodId}`,
    ]);
    const people = [...new Set(owners.map((o) => o.userId))].map((userId) => {
      const items = owners.filter((o) => o.userId === userId);
      return { userId, email: items[0].email, displayName: items[0].displayName, items };
    });

    const reminded: typeof people = [];
    await sql.begin(async (tx) => {
      for (const person of people) {
        const n = person.items.length;
        const inserted = await tx`
            insert into public.notifications
              (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
            select ${person.userId}, 'submission_reminder', 'Submissions still expected',
                   ${`${n} expected submission${n === 1 ? " is" : "s are"} missing for ${context.periodLabel}: ${person.items
                     .slice(0, 3)
                     .map((i) => `${i.metricName} (${i.orgUnitName})`)
                     .join(", ")}${n > 3 ? ` and ${n - 3} more` : ""}.`},
                   'reporting_period', ${context.periodId}, '/app/upload'
            where not exists (
              select 1 from public.notifications x
              where x.user_id = ${person.userId} and x.type = 'submission_reminder'
                and x.related_entity_id = ${context.periodId}
                and x.created_at > now() - interval '1 day')
            returning id`;
        if (inserted.length) reminded.push(person);
      }
      if (reminded.length) {
        await writeAudit(tx, {
          eventType: "submission.reminders_sent",
          entityType: "reporting_period",
          entityId: context.periodId,
          userId: ctx.session.userId,
          newValue: {
            org_unit_id: context.orgUnitId,
            missing: missing.length,
            reminded_user_ids: reminded.map((p) => p.userId),
          },
        });
      }
    });

    // Email after the transaction: a slow or failing mail server must not undo the notifications.
    const sent = await Promise.all(
      reminded.map((person) =>
        sendEmail({
          to: { email: person.email, name: person.displayName },
          subject: `TraceESG: ${person.items.length} submission(s) still expected for ${context.periodLabel}`,
          html: submissionReminderEmailHtml({
            displayName: person.displayName,
            periodLabel: context.periodLabel,
            closesOn: period?.closes_on ?? null,
            items: person.items,
          }),
        }),
      ),
    );
    return {
      missing: missing.length,
      reminded: reminded.length,
      emailed: sent.filter((r) => r.sent).length,
      alreadyReminded: people.length - reminded.length,
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
          text: input.text,
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
