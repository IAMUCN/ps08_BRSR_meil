import "server-only";
import { TRPCError } from "@trpc/server";
import { after } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { loadCalculationsById } from "@/lib/calculation/lookup";
import type { CalculationState } from "@/lib/calculation/trace";
import {
  financialYearLabel,
  financialYearOf,
  financialYearRange,
} from "@/lib/consolidation/aggregate";
import { db } from "@/lib/db";
import { expireStaleRuns, runReport } from "@/lib/reports/generate";
import { REPORT_INPUTS_KEY, type FyInputs } from "@/lib/reports/inputs";
import { loadReportInputs, type Snapshot } from "@/lib/reports/snapshot";
import { adminProcedure, permissionProcedure, router } from "@/lib/trpc/init";

// Reports (03_APP_FLOW.md §2.2 Reports / Report Detail, §4.10; .grill/phase-17-reporting-decisions.md).
// Generating needs `report.generate`; a requester who is not an Admin may only report inside their own
// assignments. The job runs after the response.

const generateProcedure = permissionProcedure("report.generate");

export type ReportRunRow = {
  id: string;
  status: "pending" | "generating" | "completed" | "failed";
  orgUnitName: string;
  coverage: string;
  requestedBy: string;
  requestedAt: string;
  completedAt: string | null;
  error: string | null;
};

/** One evidence file behind a record of a financial year. */
export type EvidenceFile = {
  documentId: string;
  recordId: string;
  fileName: string;
  /** The document the values were read from; false for a supporting file added later. */
  isPrimary: boolean;
  metricName: string;
  orgUnitName: string;
  periodLabel: string;
  uploadedBy: string;
  uploadedAt: string;
  /** The record's approval status, or "rejected". */
  approvalStatus: string;
};

export type ReportOptions = {
  orgUnits: { id: string; name: string; depth: number }[];
  periods: { id: string; label: string }[];
  financialYears: { startYear: number; label: string }[];
  /** The open period and its financial year — the form's defaults. */
  defaultPeriodId: string | null;
  defaultFinancialYear: number | null;
};

const financialYear = z.number().int().min(2000).max(2100);
const amount = z.number().positive().finite().nullable();
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);

export const reportsRouter = router({
  /** Turnover, PPP rate, output and assurance for one financial year (D26); null where nothing was entered. */
  inputs: adminProcedure
    .input(z.object({ financialYear }))
    .query(({ input }): Promise<FyInputs> => loadReportInputs(db(), input.financialYear)),

  saveInputs: adminProcedure
    .input(
      z.object({
        financialYear,
        turnoverCr: amount,
        pppRate: amount,
        physicalOutput: amount,
        physicalOutputUnit: text(40),
        assurance: text(500),
        methodologyNote: text(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { financialYear: year, ...values } = input;
      await db().begin(async (tx) => {
        // Lock the one settings row so two Admins saving different years cannot overwrite each other.
        const [existing] = await tx<{ value: Record<string, FyInputs> }[]>`
          select value from public.org_settings where key = ${REPORT_INPUTS_KEY} for update`;
        const [row] = await tx<{ id: string }[]>`
          insert into public.org_settings (key, value, updated_by)
          values (${REPORT_INPUTS_KEY}, ${tx.json({ [year]: values })}, ${ctx.session.userId})
          on conflict (key) do update
            set value = public.org_settings.value || excluded.value,
                updated_by = excluded.updated_by, updated_at = now()
          returning id`;
        await writeAudit(tx, {
          eventType: "report_inputs.updated",
          entityType: "org_setting",
          entityId: row.id,
          userId: ctx.session.userId,
          oldValue: { financial_year: year, ...existing?.value?.[String(year)] },
          newValue: { financial_year: year, ...values },
        });
      });
    }),

  /** Every evidence file linked to a record whose reporting period lies in the financial year. */
  evidence: adminProcedure
    .input(z.object({ financialYear }))
    .query(async ({ input }): Promise<EvidenceFile[]> => {
      const { from, to } = financialYearRange(input.financialYear);
      const rows = await db()<
        {
          document_id: string;
          record_id: string;
          file_name: string;
          is_primary: boolean;
          metric_name: string;
          org_unit_name: string;
          period_label: string;
          uploaded_by: string;
          uploaded_at: Date;
          approval_status: string;
        }[]
      >`
        select d.id as document_id, r.id as record_id, d.file_name, erd.is_primary,
               m.name as metric_name, o.name as org_unit_name, p.label as period_label,
               u.display_name as uploaded_by, d.created_at as uploaded_at,
               case when r.data_quality_state = 'rejected' then 'rejected'
                    else r.approval_status::text end as approval_status
        from public.esg_records r
        join public.reporting_periods p on p.id = r.reporting_period_id
        join public.esg_record_documents erd on erd.esg_record_id = r.id
        join public.documents d on d.id = erd.document_id and d.deleted_at is null
        join public.esg_metrics m on m.id = r.metric_id
        join public.org_units o on o.id = r.org_unit_id
        join public.users u on u.id = d.uploaded_by
        where p.start_date >= ${from} and p.end_date <= ${to}
        order by p.start_date, o.name, m.name, erd.is_primary desc, d.created_at`;
      return rows.map((r) => ({
        documentId: r.document_id,
        recordId: r.record_id,
        fileName: r.file_name,
        isPrimary: r.is_primary,
        metricName: r.metric_name,
        orgUnitName: r.org_unit_name,
        periodLabel: r.period_label,
        uploadedBy: r.uploaded_by,
        uploadedAt: r.uploaded_at.toISOString(),
        approvalStatus: r.approval_status,
      }));
    }),

  options: generateProcedure.query(async (): Promise<ReportOptions> => {
    const sql = db();
    const [orgUnits, periods] = await Promise.all([
      sql<{ id: string; name: string; depth: number }[]>`
        with recursive tree as (
          select id, name, 0 as depth, array[name::text] as path
          from public.org_units where parent_id is null and deleted_at is null
          union all
          select o.id, o.name, t.depth + 1, t.path || o.name::text
          from public.org_units o join tree t on o.parent_id = t.id where o.deleted_at is null
        )
        select id, name, depth from tree order by path`,
      sql<{ id: string; label: string; start_date: string; status: string }[]>`
        select id, label, start_date::text, status::text from public.reporting_periods
        order by start_date desc`,
    ]);
    const open = periods.find((p) => p.status === "open") ?? periods[0];
    return {
      defaultPeriodId: open?.id ?? null,
      defaultFinancialYear: open ? financialYearOf(open.start_date) : null,
      orgUnits,
      periods: periods.map((p) => ({ id: p.id, label: p.label })),
      financialYears: [...new Set(periods.map((p) => financialYearOf(p.start_date)))].map((y) => ({
        startYear: y,
        label: financialYearLabel(y),
      })),
    };
  }),

  generate: generateProcedure
    .input(
      z
        .object({
          orgUnitId: z.uuid(),
          periodId: z.uuid().optional(),
          financialYear: z.number().int().min(2000).max(2100).optional(),
        })
        .refine((i) => (i.periodId === undefined) !== (i.financialYear === undefined), {
          message: "Choose either a reporting period or a financial year.",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      if (!ctx.session.isAdmin) {
        const [inScope] = await sql<{ ok: boolean }[]>`
          select exists (
            select 1 from public.user_org_assignments uoa
            join public.org_unit_tree t on t.ancestor_id = uoa.org_unit_id
            where uoa.user_id = ${ctx.session.userId} and uoa.revoked_at is null
              and t.descendant_id = ${input.orgUnitId}) as ok`;
        if (!inScope?.ok) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only generate reports inside your own assignments.",
          });
        }
      }
      const runId = await sql.begin(async (tx) => {
        const [unit] = await tx<{ id: string }[]>`
          select id from public.org_units where id = ${input.orgUnitId} and deleted_at is null`;
        if (!unit) throw new TRPCError({ code: "BAD_REQUEST", message: "Org unit not found." });
        if (input.periodId) {
          const [period] = await tx<{ id: string }[]>`
            select id from public.reporting_periods where id = ${input.periodId}`;
          if (!period) throw new TRPCError({ code: "BAD_REQUEST", message: "Period not found." });
        }
        const [run] = await tx<{ id: string }[]>`
          insert into public.report_runs
            (requested_by, org_unit_id, reporting_period_id, financial_year, report_type)
          values (${ctx.session.userId}, ${input.orgUnitId}, ${input.periodId ?? null},
                  ${input.financialYear ?? null}, 'brsr')
          returning id`;
        await writeAudit(tx, {
          eventType: "report.requested",
          entityType: "report_run",
          entityId: run.id,
          userId: ctx.session.userId,
          newValue: { ...input, report_type: "brsr" },
        });
        return run.id;
      });
      // Non-blocking (App Flow §4.10): the Admin gets the run id now and a notification when it's done.
      after(() => runReport(runId));
      return { runId };
    }),

  list: generateProcedure.query(async (): Promise<ReportRunRow[]> => {
    await expireStaleRuns();
    const rows = await db()<
      {
        id: string;
        status: ReportRunRow["status"];
        org_unit_name: string;
        period_label: string | null;
        financial_year: number | null;
        requested_by: string;
        requested_at: Date;
        completed_at: Date | null;
        error_message: string | null;
      }[]
    >`
      select rr.id, rr.status::text as status, o.name as org_unit_name, p.label as period_label,
             rr.financial_year, u.display_name as requested_by, rr.requested_at, rr.completed_at,
             rr.error_message
      from public.report_runs rr
      join public.org_units o on o.id = rr.org_unit_id
      join public.users u on u.id = rr.requested_by
      left join public.reporting_periods p on p.id = rr.reporting_period_id
      order by rr.requested_at desc
      limit 100`;
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      orgUnitName: r.org_unit_name,
      coverage:
        r.financial_year !== null ? financialYearLabel(r.financial_year) : (r.period_label ?? "—"),
      requestedBy: r.requested_by,
      requestedAt: r.requested_at.toISOString(),
      completedAt: r.completed_at?.toISOString() ?? null,
      error: r.error_message,
    }));
  }),

  get: generateProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ input }): Promise<ReportRunRow & { snapshot: Snapshot | null }> => {
      const runs = await db()<
        {
          id: string;
          status: ReportRunRow["status"];
          org_unit_name: string;
          period_label: string | null;
          financial_year: number | null;
          requested_by: string;
          requested_at: Date;
          completed_at: Date | null;
          error_message: string | null;
          snapshot_data: Snapshot | null;
        }[]
      >`
        select rr.id, rr.status::text as status, o.name as org_unit_name, p.label as period_label,
               rr.financial_year, u.display_name as requested_by, rr.requested_at, rr.completed_at,
               rr.error_message, rr.snapshot_data
        from public.report_runs rr
        join public.org_units o on o.id = rr.org_unit_id
        join public.users u on u.id = rr.requested_by
        left join public.reporting_periods p on p.id = rr.reporting_period_id
        where rr.id = ${input.id}`;
      const r = runs[0];
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found." });
      return {
        id: r.id,
        status: r.status,
        orgUnitName: r.org_unit_name,
        coverage:
          r.financial_year !== null
            ? financialYearLabel(r.financial_year)
            : (r.period_label ?? "—"),
        requestedBy: r.requested_by,
        requestedAt: r.requested_at.toISOString(),
        completedAt: r.completed_at?.toISOString() ?? null,
        error: r.error_message,
        snapshot: r.snapshot_data,
      };
    }),

  /**
   * One reported record as the report used it: the exact calculation row the snapshot recorded, and
   * whether the record has been recalculated since (App Flow §2.2: "source record unavailable" is explicit).
   */
  reportedRecord: generateProcedure
    .input(z.object({ recordId: z.uuid(), calculationId: z.uuid().nullable() }))
    .query(
      async ({
        input,
      }): Promise<{
        available: boolean;
        calculation: CalculationState | null;
        recalculatedSince: boolean;
      }> => {
        const sql = db();
        const [record] = await sql<{ current: string | null }[]>`
          select (select id from public.calculations where esg_record_id = r.id and is_current) as current
          from public.esg_records r where r.id = ${input.recordId}`;
        if (!record) return { available: false, calculation: null, recalculatedSince: false };
        if (!input.calculationId) {
          return { available: true, calculation: null, recalculatedSince: false };
        }
        const calculation =
          (await loadCalculationsById(sql, [input.calculationId])).get(input.calculationId) ?? null;
        return {
          available: true,
          calculation,
          recalculatedSince: record.current !== input.calculationId,
        };
      },
    ),
});
