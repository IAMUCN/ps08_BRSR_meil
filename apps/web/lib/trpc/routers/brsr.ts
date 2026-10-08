import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { indicatorStatus, type IndicatorStatus } from "@/lib/brsr/readiness";
import { db } from "@/lib/db";
import { adminProcedure, permissionProcedure, router } from "@/lib/trpc/init";
import { resolvePeriod } from "@/lib/trpc/routers/scope";

// BRSR mapping (03_APP_FLOW.md §2.2, PRD §27, TRD §26; .grill/phase-14-brsr-mapping-decisions.md). The
// indicators are seeded configuration (migration 0022, quoted from SEBI's Annexure I); Admins maintain which
// metrics feed them. Every change is audited in the same transaction.

const manage = permissionProcedure("brsr_mapping.manage");

export type BrsrMapping = {
  id: string;
  metricId: string;
  metricCode: string;
  metricName: string;
  notes: string | null;
  isApplicable: boolean;
  /** What the indicator reports from this metric: the calculated result or the verified quantity (D18). */
  reportedValue: "result" | "activity";
};

export type BrsrIndicator = {
  id: string;
  code: string;
  questionText: string;
  indicatorType: "essential" | "leadership" | null;
  description: string | null;
};

export type BrsrSection = { code: string; name: string };

export type MappingsView = {
  sections: (BrsrSection & { indicators: (BrsrIndicator & { mappings: BrsrMapping[] })[] })[];
  metrics: { id: string; code: string; name: string; categoryName: string }[];
  unmappedMetrics: string[];
};

export type ReadinessRecord = {
  recordId: string;
  documentId: string | null;
  fileName: string | null;
  mimeType: string | null;
  orgUnitName: string;
  approvalStatus: string;
  activityValue: number | null;
  activityUnit: string | null;
  resultValue: number | null;
  resultUnit: string | null;
};

export type ReadinessMetric = {
  metricId: string;
  metricName: string;
  notes: string | null;
  applicable: boolean;
  approved: number;
  pending: number;
  records: ReadinessRecord[];
};

export type ReadinessView = {
  periodId: string;
  periodLabel: string;
  periods: { id: string; label: string }[];
  sections: (BrsrSection & {
    indicators: (BrsrIndicator & { status: IndicatorStatus; metrics: ReadinessMetric[] })[];
  })[];
};

type IndicatorRow = {
  id: string;
  code: string;
  question_text: string;
  indicator_type: "essential" | "leadership" | null;
  description: string | null;
  section_code: string;
  section_name: string;
};

async function catalogue() {
  return db()<IndicatorRow[]>`
    select i.id, i.code, i.question_text, i.indicator_type::text as indicator_type, i.description,
           s.code as section_code, s.name as section_name
    from public.brsr_indicators i
    join public.brsr_sections s on s.id = i.section_id
    where i.deleted_at is null
    order by s.code, i.code`;
}

/** Sections in order with their indicators, each decorated by `extra`. */
function bySection<T>(rows: IndicatorRow[], extra: (row: IndicatorRow) => T) {
  const sections: (BrsrSection & { indicators: (BrsrIndicator & T)[] })[] = [];
  for (const row of rows) {
    let section = sections.find((s) => s.code === row.section_code);
    if (!section) {
      section = { code: row.section_code, name: row.section_name, indicators: [] };
      sections.push(section);
    }
    section.indicators.push({
      id: row.id,
      code: row.code,
      questionText: row.question_text,
      indicatorType: row.indicator_type,
      description: row.description,
      ...extra(row),
    });
  }
  return sections;
}

const mappingInput = z.object({
  mappingId: z.uuid().optional(),
  metricId: z.uuid(),
  indicatorId: z.uuid(),
  notes: z.string().trim().max(500).optional(),
  isApplicable: z.boolean(),
  /** Omitted on an update keeps what is stored; a new mapping defaults to the calculated result. */
  reportedValue: z.enum(["result", "activity"]).optional(),
});

export const brsrRouter = router({
  /** The mapping table, grouped by BRSR section, plus the metrics nothing maps yet. */
  mappings: adminProcedure.query(async (): Promise<MappingsView> => {
    const sql = db();
    const [rows, mappings, metrics] = await Promise.all([
      catalogue(),
      sql<
        {
          id: string;
          indicator_id: string;
          metric_id: string;
          metric_code: string;
          metric_name: string;
          notes: string | null;
          is_applicable: boolean;
          reported_value: "result" | "activity";
        }[]
      >`
        select x.id, x.brsr_indicator_id as indicator_id, m.id as metric_id, m.code as metric_code,
               m.name as metric_name, x.mapping_notes as notes, x.is_applicable, x.reported_value
        from public.brsr_metric_mappings x
        join public.esg_metrics m on m.id = x.esg_metric_id
        order by m.name`,
      sql<{ id: string; code: string; name: string; category_name: string }[]>`
        select m.id, m.code, m.name, c.name as category_name
        from public.esg_metrics m join public.esg_categories c on c.id = m.category_id
        where m.deleted_at is null
        order by c.name, m.name`,
    ]);
    return {
      sections: bySection(rows, (row) => ({
        mappings: mappings
          .filter((x) => x.indicator_id === row.id)
          .map((x) => ({
            id: x.id,
            metricId: x.metric_id,
            metricCode: x.metric_code,
            metricName: x.metric_name,
            notes: x.notes,
            isApplicable: x.is_applicable,
            reportedValue: x.reported_value,
          })),
      })),
      metrics: metrics.map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        categoryName: m.category_name,
      })),
      unmappedMetrics: metrics
        .filter((m) => !mappings.some((x) => x.metric_id === m.id))
        .map((m) => m.name),
    };
  }),

  /** Creates a mapping, or updates an existing one's notes and applicability. */
  save: manage.input(mappingInput).mutation(async ({ ctx, input }) => {
    return db().begin(async (tx) => {
      const [indicator] = await tx<{ id: string }[]>`
        select id from public.brsr_indicators where id = ${input.indicatorId} and deleted_at is null`;
      if (!indicator) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That BRSR indicator doesn't exist." });
      }
      const [metric] = await tx<{ id: string }[]>`
        select id from public.esg_metrics where id = ${input.metricId} and deleted_at is null`;
      if (!metric) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That ESG metric doesn't exist." });
      }
      const notes = input.notes || null;

      if (input.mappingId) {
        const [before] = await tx<
          { notes: string | null; is_applicable: boolean; reported_value: string }[]
        >`
          select mapping_notes as notes, is_applicable, reported_value from public.brsr_metric_mappings
          where id = ${input.mappingId}
            and esg_metric_id = ${input.metricId} and brsr_indicator_id = ${input.indicatorId}
          for update`;
        if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Mapping not found." });
        await tx`
          update public.brsr_metric_mappings
          set mapping_notes = ${notes}, is_applicable = ${input.isApplicable},
              reported_value = coalesce(${input.reportedValue ?? null}, reported_value)
          where id = ${input.mappingId}`;
        await writeAudit(tx, {
          eventType: "brsr_mapping.updated",
          entityType: "brsr_metric_mapping",
          entityId: input.mappingId,
          userId: ctx.session.userId,
          oldValue: before,
          newValue: {
            notes,
            is_applicable: input.isApplicable,
            reported_value: input.reportedValue,
          },
        });
        return { mappingId: input.mappingId };
      }

      const [row] = await tx<{ id: string }[]>`
        insert into public.brsr_metric_mappings
          (esg_metric_id, brsr_indicator_id, mapping_notes, is_applicable, reported_value)
        values (${input.metricId}, ${input.indicatorId}, ${notes}, ${input.isApplicable},
                ${input.reportedValue ?? "result"})
        on conflict (esg_metric_id, brsr_indicator_id) do nothing
        returning id`;
      if (!row) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That metric is already mapped to this indicator.",
        });
      }
      await writeAudit(tx, {
        eventType: "brsr_mapping.created",
        entityType: "brsr_metric_mapping",
        entityId: row.id,
        userId: ctx.session.userId,
        newValue: {
          esg_metric_id: input.metricId,
          brsr_indicator_id: input.indicatorId,
          notes,
          is_applicable: input.isApplicable,
          reported_value: input.reportedValue ?? "result",
        },
      });
      return { mappingId: row.id };
    });
  }),

  remove: manage.input(z.object({ mappingId: z.uuid() })).mutation(async ({ ctx, input }) => {
    return db().begin(async (tx) => {
      const [removed] = await tx<Record<string, unknown>[]>`
        delete from public.brsr_metric_mappings where id = ${input.mappingId}
        returning esg_metric_id, brsr_indicator_id, mapping_notes, is_applicable`;
      if (!removed) throw new TRPCError({ code: "NOT_FOUND", message: "Mapping not found." });
      await writeAudit(tx, {
        eventType: "brsr_mapping.deleted",
        entityType: "brsr_metric_mapping",
        entityId: input.mappingId,
        userId: ctx.session.userId,
        oldValue: removed,
      });
      return { ok: true };
    });
  }),

  /**
   * The readiness tree for one period, organisation-wide: Section → Indicator (status) → Metric → the
   * period's records with their result and evidence (UI brief §21).
   */
  readiness: adminProcedure
    .input(z.object({ periodId: z.uuid().optional() }))
    .query(async ({ input }): Promise<ReadinessView | null> => {
      const sql = db();
      const periodId = await resolvePeriod(input.periodId);
      if (!periodId) return null;
      const [rows, mappings, records, periods] = await Promise.all([
        catalogue(),
        sql<
          {
            indicator_id: string;
            metric_id: string;
            metric_name: string;
            notes: string | null;
            is_applicable: boolean;
          }[]
        >`
          select x.brsr_indicator_id as indicator_id, m.id as metric_id, m.name as metric_name,
                 x.mapping_notes as notes, x.is_applicable
          from public.brsr_metric_mappings x
          join public.esg_metrics m on m.id = x.esg_metric_id
          order by m.name`,
        // ponytail: every record of the period is listed; paginate per metric if a period grows past a few
        // hundred records.
        sql<
          {
            record_id: string;
            metric_id: string;
            document_id: string | null;
            file_name: string | null;
            mime_type: string | null;
            org_unit_name: string;
            approval_status: string;
            activity_value: number | null;
            activity_unit: string | null;
            result_value: number | null;
            result_unit: string | null;
          }[]
        >`
          select r.id as record_id, r.metric_id, d.id as document_id, d.file_name, d.mime_type,
                 o.name as org_unit_name, r.approval_status::text as approval_status,
                 r.activity_value_verified::float as activity_value, r.activity_unit,
                 c.result_value::float as result_value, c.result_unit
          from public.esg_records r
          join public.org_units o on o.id = r.org_unit_id
          left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
          left join public.documents d on d.id = erd.document_id and d.deleted_at is null
          left join public.calculations c on c.esg_record_id = r.id and c.is_current
          where r.reporting_period_id = ${periodId}
            and r.data_quality_state <> 'rejected'
            and r.approval_status in ('approved', 'review_pending')
          order by r.approval_status, o.name, d.file_name`,
        sql<{ id: string; label: string }[]>`
          select id, label from public.reporting_periods order by start_date desc`,
      ]);

      const sections = bySection(rows, (row) => {
        const metrics: ReadinessMetric[] = mappings
          .filter((x) => x.indicator_id === row.id)
          .map((x) => {
            const own = records.filter((r) => r.metric_id === x.metric_id);
            return {
              metricId: x.metric_id,
              metricName: x.metric_name,
              notes: x.notes,
              applicable: x.is_applicable,
              approved: own.filter((r) => r.approval_status === "approved").length,
              pending: own.filter((r) => r.approval_status === "review_pending").length,
              records: own.map((r) => ({
                recordId: r.record_id,
                documentId: r.document_id,
                fileName: r.file_name,
                mimeType: r.mime_type,
                orgUnitName: r.org_unit_name,
                approvalStatus: r.approval_status,
                activityValue: r.activity_value,
                activityUnit: r.activity_unit,
                resultValue: r.result_value,
                resultUnit: r.result_unit,
              })),
            };
          });
        return { status: indicatorStatus(metrics), metrics };
      });

      return {
        periodId,
        periodLabel: periods.find((p) => p.id === periodId)?.label ?? "",
        periods,
        sections,
      };
    }),
});
