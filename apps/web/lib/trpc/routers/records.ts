import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { loadCalculations } from "@/lib/calculation/lookup";
import type { CalculationState } from "@/lib/calculation/trace";
import { financialYearOf, financialYearRange } from "@/lib/consolidation/aggregate";
import { writeAudit } from "@/lib/audit";
import { assertOrgScope, inOrgScope, scopedOrgUnitIds } from "@/lib/auth/scope";
import { canAdminister, canViewAudit } from "@/lib/auth/workspace";
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
import { loadOrgNodes } from "@/lib/org/nodes";
import {
  ISSUES,
  OCR_STATES,
  searchRecords,
  STATUSES,
  RECORD_LIMIT,
  type RecordFilters,
  type RecordRow,
} from "@/lib/records/search";
import { adminAreaProcedure, permissionProcedure, router } from "@/lib/trpc/init";
import { resolvePeriod } from "@/lib/trpc/routers/scope";

// Control Tower, Submission Monitoring and ESG Data Explorer (03_APP_FLOW.md §2.2; Phase 16). For
// administrators: a Super Admin sees every org unit, an Administrator their own and everything beneath.
// The org/period context arrives in the URL and is resolved here (.grill/phase-16-control-tower-decisions.md).

export type ContextOptions = {
  orgUnitId: string;
  periodId: string;
  periodLabel: string;
  orgUnits: {
    id: string;
    name: string;
    unitType: string;
    depth: number;
    parentIds: string[];
    status: string;
  }[];
  periods: { id: string; label: string; financialYear: number; startDate: string }[];
  roles: { code: string; name: string }[];
  /** Each activity with its top-level scope (SCOPE_1/2/3), or null for one that is not an emission. */
  metrics: { code: string; name: string; scopeCode: string | null }[];
  /** For the Document type filter (Phase 2). */
  documentTypes: { code: string; name: string }[];
  /** What the page shows with no filters: Reset filters appears only when the view differs from these. */
  defaultOrgUnitId: string;
  defaultPeriodId: string;
};

/**
 * The node and period in view: the ones asked for, else the first unit the caller may see (the root for a
 * Super Admin) and the open period. The picker lists only units inside the caller's scope, and a unit
 * outside it is refused.
 */
async function resolveContext(
  caller: { userId: string; isAdmin: boolean },
  orgUnitId?: string,
  periodId?: string,
): Promise<ContextOptions> {
  const sql = db();
  const [allOrgUnits, periods, roles, metrics, documentTypes, scope, links] = await Promise.all([
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
    sql<{ code: string; name: string; scope_code: string | null }[]>`
      with recursive up as (
        select id, id as top_id, parent_scope_id from public.scopes where parent_scope_id is null
        union all
        select s.id, up.top_id, s.parent_scope_id from public.scopes s join up on s.parent_scope_id = up.id)
      select m.code, m.name, top.code as scope_code
      from public.esg_metrics m
      left join up on up.id = m.scope_id
      left join public.scopes top on top.id = up.top_id
      where m.deleted_at is null order by m.name`,
    sql<{ code: string; name: string }[]>`
      select code, name from public.document_types order by name`,
    scopedOrgUnitIds(sql, caller, "monitoring.view"),
    loadOrgNodes(sql),
  ]);
  if (orgUnitId) await assertOrgScope(sql, caller, orgUnitId, "monitoring.view");
  const inScope = allOrgUnits.filter((o) => scope === null || scope.includes(o.id));
  // Indent from the caller's own top unit, not from a group they cannot open.
  const top = Math.min(...inScope.map((o) => o.depth));
  const orgUnits = inScope.map((o) => ({ ...o, depth: o.depth - top }));
  const node = orgUnits.find((o) => o.id === orgUnitId) ?? orgUnits[0];
  if (!node) throw new TRPCError({ code: "NOT_FOUND", message: "No organisation configured yet." });
  const defaultPeriod = (await resolvePeriod(undefined)) ?? "";
  const resolvedPeriod = periods.find((p) => p.id === periodId)?.id ?? defaultPeriod;
  return {
    orgUnitId: node.id,
    periodId: resolvedPeriod,
    periodLabel: periods.find((p) => p.id === resolvedPeriod)?.label ?? "",
    orgUnits: orgUnits.map((o) => {
      const link = links.find((n) => n.id === o.id);
      return {
        id: o.id,
        name: o.name,
        unitType: o.unit_type,
        depth: o.depth,
        // The tree selector draws a shared unit under each parent. Parents outside the caller's scope are
        // dropped by the selector, so no name is sent that the list above does not already hold.
        parentIds: [link?.parentId, ...(link?.alsoUnder ?? [])].filter(
          (id): id is string => !!id && inScope.some((s) => s.id === id),
        ),
        status: link?.status ?? "active",
      };
    }),
    periods: periods.map((p) => ({
      id: p.id,
      label: p.label,
      financialYear: financialYearOf(p.start_date),
      startDate: p.start_date,
    })),
    roles,
    metrics: metrics.map((m) => ({ code: m.code, name: m.name, scopeCode: m.scope_code })),
    documentTypes,
    defaultOrgUnitId: orgUnits[0]?.id ?? node.id,
    defaultPeriodId: defaultPeriod,
  };
}

const contextInput = z.object({ orgUnitId: z.uuid().optional(), periodId: z.uuid().optional() });

const searchInput = contextInput.extend({
  /** A whole April–March financial year instead of one period (Data Explorer). */
  financialYear: z.number().int().min(2000).max(2100).optional(),
  scopeCode: z.string().trim().max(60).optional(),
  metricCode: z.string().trim().max(60).optional(),
  documentTypeCode: z.string().trim().max(60).optional(),
  roleCode: z.string().trim().max(60).optional(),
  status: z.enum(STATUSES).optional(),
  issue: z.enum(ISSUES).optional(),
  /** The search box: words a record must contain. */
  text: z.string().trim().max(100).optional(),
  /** What OCR made of the document (Phase 3). */
  ocr: z.enum(OCR_STATES).optional(),
  /** Uploaded on or after / on or before these days, India time (owner's page feedback, 2026-11-11). */
  uploadedFrom: z.iso.date().optional(),
  uploadedTo: z.iso.date().optional(),
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
  /** The uploader's optional description (migration 0063). */
  description: string | null;
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
  /** Phase 2: the bill number, the document type and who chose it, the Late and Duplicate marks. */
  billNumber: string | null;
  late: boolean;
  duplicate: boolean;
  documentType: { id: string; name: string; source: "ocr" | "person" | "admin" } | null;
  /** The document types of this activity, for an Admin's correction. */
  documentTypeOptions: { id: string; name: string }[];
  /** What OCR made of the document (Phase 3: OCR Monitoring folded into this panel). */
  ocr: {
    jobId: string;
    status: string;
    attempts: number;
    error: string | null;
    modelVersion: string | null;
    completedAt: string | null;
  } | null;
  /** Each field's OCR confidence (0–100), by label, for the panel's values. */
  confidences: Record<string, number | null>;
  /**
   * What the viewer may do from here, decided on the server. Corporate ESG reads a record (monitoring.view)
   * but corrects, retries OCR and opens the audit trail only with the rights that earn them.
   */
  viewer: { canAct: boolean; canViewAudit: boolean };
};

/** A reason an Admin gives for a correction or a return; the same length as other review reasons. */
const ADMIN_REASON = z
  .string()
  .trim()
  .min(10, "Give a reason of at least 10 characters.")
  .max(1000);

/** The record, refused alike when it is missing or outside the caller's scope (§4.4). */
async function recordInScope(
  sql: ReturnType<typeof db>,
  session: Parameters<typeof inOrgScope>[1],
  recordId: string,
) {
  const [row] = await sql<
    {
      id: string;
      org_unit_id: string;
      metric_id: string;
      submitted_by: string;
      approval_status: string;
      data_quality_state: string;
      document_id: string | null;
      document_type_id: string | null;
      file_name: string | null;
    }[]
  >`
    select r.id, r.org_unit_id, r.metric_id, r.submitted_by, r.approval_status::text,
           r.data_quality_state::text, d.id as document_id, d.document_type_id, d.file_name
    from public.esg_records r
    left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
    left join public.documents d on d.id = erd.document_id and d.deleted_at is null
    where r.id = ${recordId}`;
  if (!row || !(await inOrgScope(sql, session, row.org_unit_id))) {
    throw new TRPCError({ code: "NOT_FOUND", message: "That record isn't available." });
  }
  return row;
}

export const recordsRouter = router({
  /** The Control Tower for one node and period, with the picker's options. */
  summary: permissionProcedure("monitoring.view")
    .input(contextInput)
    .query(
      async ({ ctx, input }): Promise<{ context: ContextOptions; summary: Summary | null }> => {
        // monitoring.view can be held below the group: the figures stay inside the holder's own scope.
        const context = await resolveContext(ctx.session, input.orgUnitId, input.periodId);
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
      await assertOrgScope(db(), ctx.session, input.orgUnitId, "monitoring.view");
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
  remindMissing: adminAreaProcedure.input(contextInput).mutation(async ({ ctx, input }) => {
    const context = await resolveContext(ctx.session, input.orgUnitId, input.periodId);
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
          subject: `EmeilSG: ${person.items.length} submission(s) still expected for ${context.periodLabel}`,
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

  search: permissionProcedure("monitoring.view")
    .input(searchInput)
    .query(
      async ({
        ctx,
        input,
      }): Promise<{
        context: ContextOptions;
        rows: RecordRow[];
        truncated: boolean;
        /** The oldest document still waiting for OCR, for the stalled-worker banner (Phase 3). */
        oldestPendingSince: string | null;
      }> => {
        const context = await resolveContext(ctx.session, input.orgUnitId, input.periodId);
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
          documentTypeCode: input.documentTypeCode,
          roleCode: input.roleCode,
          status: input.status,
          issue: input.issue,
          text: input.text,
          ocr: input.ocr,
          uploadedFrom: input.uploadedFrom,
          uploadedTo: input.uploadedTo,
        };
        const [rows, [pending]] = await Promise.all([
          searchRecords(db(), filters),
          db()<{ since: Date | null }[]>`
            select min(d.created_at) as since
            from public.ocr_jobs j join public.documents d on d.id = j.document_id
            where j.status = 'pending' and d.deleted_at is null`,
        ]);
        return {
          context,
          rows,
          truncated: rows.length === RECORD_LIMIT,
          oldestPendingSince: pending?.since?.toISOString() ?? null,
        };
      },
    ),

  /** Expected submissions with nothing filed for the period (Control Tower "missing submissions"). */
  missing: permissionProcedure("monitoring.view")
    .input(contextInput)
    .query(
      async ({ ctx, input }): Promise<{ context: ContextOptions; rows: MissingSubmission[] }> => {
        const context = await resolveContext(ctx.session, input.orgUnitId, input.periodId);
        return {
          context,
          rows: context.periodId
            ? await missingSubmissions(db(), context.orgUnitId, context.periodId)
            : [],
        };
      },
    ),

  /** The shared record detail (App Flow §2.2): evidence, extracted values, validation, calculation, audit. */
  detail: permissionProcedure("monitoring.view")
    .input(z.object({ recordId: z.uuid() }))
    .query(async ({ ctx, input }): Promise<RecordDetail> => {
      const sql = db();
      // Out of scope and missing read the same (§4.4).
      const [owner] = await sql<{ org_unit_id: string }[]>`
        select org_unit_id from public.esg_records where id = ${input.recordId}`;
      if (!owner || !(await inOrgScope(sql, ctx.session, owner.org_unit_id, "monitoring.view"))) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That record isn't available." });
      }
      const [r] = await sql<
        {
          id: string;
          metric_name: string;
          org_unit_name: string;
          period_label: string;
          document_id: string | null;
          file_name: string | null;
          description: string | null;
          mime_type: string | null;
          submitted_by: string;
          verified_by: string | null;
          verification_status: string;
          validation_status: string;
          approval_status: string;
          data_quality_state: string;
          activity_value: number | null;
          activity_unit: string | null;
          metric_id: string;
          bill_number: string | null;
          late: boolean;
          duplicate: boolean;
          document_type_id: string | null;
          document_type_name: string | null;
          document_type_source: "ocr" | "person" | "admin" | null;
        }[]
      >`
        select r.id, r.metric_id, r.bill_number, r.submitted_late as late, r.is_duplicate_flag as duplicate,
               d.document_type_id, dt.name as document_type_name,
               case when d.document_type_id is null then null
                    else coalesce(d.document_type_source, 'ocr') end as document_type_source,
               m.name as metric_name, o.name as org_unit_name, p.label as period_label,
               d.id as document_id, d.file_name, d.description, d.mime_type, su.display_name as submitted_by,
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
        left join public.document_types dt on dt.id = d.document_type_id
        where r.id = ${input.recordId}`;
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Record not found." });

      const [fields, results, audit, calculations, typeOptions, [job], confidenceRows] =
        await Promise.all([
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
          sql<
            { created_at: Date; event_type: string; who: string | null; reason: string | null }[]
          >`
          select a.created_at, a.event_type, u.display_name as who, a.reason
          from public.audit_logs a left join public.users u on u.id = a.user_id
          where a.entity_id = ${r.id} or a.entity_id = ${r.document_id}
          order by a.created_at`,
          loadCalculations(sql, [r.id]),
          sql<{ id: string; name: string }[]>`
          select dt.id, dt.name from public.document_type_metric_mappings map
          join public.document_types dt on dt.id = map.document_type_id
          where map.metric_id = ${r.metric_id} order by dt.name`,
          sql<
            {
              id: string;
              status: string;
              retry_count: number;
              error_message: string | null;
              model_version: string | null;
              completed_at: Date | null;
            }[]
          >`
          select id, status::text, retry_count, error_message, model_version, completed_at
          from public.ocr_jobs where document_id = ${r.document_id}
          order by started_at desc nulls first limit 1`,
          sql<{ label: string; confidence: number | null }[]>`
          select f.field_label as label, f.confidence::float as confidence
          from public.ocr_extractions e join public.ocr_fields f on f.ocr_extraction_id = e.id
          where e.document_id = ${r.document_id}`,
        ]);

      return {
        recordId: r.id,
        metricName: r.metric_name,
        orgUnitName: r.org_unit_name,
        periodLabel: r.period_label,
        documentId: r.document_id,
        fileName: r.file_name,
        description: r.description,
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
        billNumber: r.bill_number,
        late: r.late,
        duplicate: r.duplicate,
        documentType:
          r.document_type_id && r.document_type_name && r.document_type_source
            ? { id: r.document_type_id, name: r.document_type_name, source: r.document_type_source }
            : null,
        documentTypeOptions: typeOptions,
        viewer: { canAct: canAdminister(ctx.session), canViewAudit: canViewAudit(ctx.session) },
        ocr: job
          ? {
              jobId: job.id,
              status: job.status,
              attempts: job.retry_count,
              error: job.error_message,
              modelVersion: job.model_version,
              completedAt: job.completed_at?.toISOString() ?? null,
            }
          : null,
        confidences: Object.fromEntries(confidenceRows.map((c) => [c.label, c.confidence])),
      };
    }),

  /**
   * An Admin corrects the document type OCR suggested or the uploader chose (Phase 2). Only the label
   * changes — values, calculation and activity stay — and only to a type of the record's own activity.
   */
  setDocumentType: adminAreaProcedure
    .input(z.object({ recordId: z.uuid(), documentTypeId: z.uuid(), reason: ADMIN_REASON }))
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      const record = await recordInScope(sql, ctx.session, input.recordId);
      if (!record.document_id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This record has no document." });
      }
      if (record.data_quality_state === "rejected") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This record was rejected." });
      }
      if (record.document_type_id === input.documentTypeId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That is already its document type." });
      }
      await sql.begin(async (tx) => {
        const [mapped] = await tx`
          select 1 from public.document_type_metric_mappings
          where metric_id = ${record.metric_id} and document_type_id = ${input.documentTypeId}`;
        if (!mapped) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "That document type belongs to another activity. Return the record as the wrong activity instead.",
          });
        }
        await tx`
          update public.documents
          set document_type_id = ${input.documentTypeId}, document_type_source = 'admin'
          where id = ${record.document_id}`;
        await writeAudit(tx, {
          eventType: "document.type_corrected",
          entityType: "document",
          entityId: record.document_id!,
          userId: ctx.session.userId,
          reason: input.reason,
          oldValue: { document_type_id: record.document_type_id },
          newValue: { document_type_id: input.documentTypeId, record_id: record.id },
        });
      });
      return null;
    }),

  /**
   * The activity chosen at upload is wrong (Phase 2): an Admin returns the record. It is closed as rejected
   * — fields, factor and scope all depend on the activity, so it is never changed in place — and the
   * uploader is asked to upload it again under the right activity; the new upload is linked to this one as
   * its new version (documents.related_document_id).
   */
  returnWrongActivity: adminAreaProcedure
    .input(z.object({ recordId: z.uuid(), reason: ADMIN_REASON }))
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      const record = await recordInScope(sql, ctx.session, input.recordId);
      if (record.approval_status === "approved") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An approved record cannot be returned.",
        });
      }
      if (record.data_quality_state === "rejected") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This record was already rejected." });
      }
      await sql.begin(async (tx) => {
        const [updated] = await tx`
          update public.esg_records
          set data_quality_state = 'rejected',
              approval_status = case when approval_status = 'review_pending'
                                     then 'not_submitted'::public.record_approval_status
                                     else approval_status end
          where id = ${record.id} and data_quality_state <> 'rejected'
            and approval_status <> 'approved'
          returning id`;
        if (!updated) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "The record changed meanwhile. Reload.",
          });
        }
        await writeAudit(tx, {
          eventType: "record.returned_wrong_activity",
          entityType: "esg_record",
          entityId: record.id,
          userId: ctx.session.userId,
          reason: input.reason,
          oldValue: {
            data_quality_state: record.data_quality_state,
            approval_status: record.approval_status,
          },
          newValue: { data_quality_state: "rejected" },
        });
        await tx`
          insert into public.notifications
            (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
          values (${record.submitted_by}, 'returned', 'Upload again under the right activity',
                  ${`${record.file_name ?? "Your document"}: ${input.reason}`},
                  'esg_record', ${record.id},
                  ${record.document_id ? `/app/upload?replaces=${record.document_id}` : "/app/upload"})`;
      });
      return null;
    }),
});
