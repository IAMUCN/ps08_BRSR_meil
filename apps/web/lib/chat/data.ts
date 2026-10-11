import "server-only";
import postgres from "postgres";
import type { ActiveSession } from "@/lib/auth/session";
import { loadMetrics } from "@/lib/consolidation/query";
import { db } from "@/lib/db";
import type { Period } from "./analysis";
import { readConfig } from "./nim";
import type { CalculationRow, DataLayer, OrgUnit } from "./tools";

// Every database read the chat tools make (.grill/chat-analyst-decisions.md, deviation D34). They run as
// the `chat_reader` role (migration 0042) through CHAT_DATABASE_URL — a role that can select a named list
// of tables and nothing else — inside read-only transactions with a time limit. The queries are fixed;
// only ids the server has already checked against the person's scope are ever bound into them.

/** The chatbot's settings from the environment; null when it is not set up, and it is then switched off. */
export const chatConfig = () => readConfig(process.env);

const globalForChat = globalThis as unknown as { traceEsgChatSql?: postgres.Sql };

function reader(url: string): postgres.Sql {
  // Cached on globalThis like the main pool (lib/db.ts); prepare: false for Supabase's pooler.
  globalForChat.traceEsgChatSql ??= postgres(url, { prepare: false, max: 3 });
  return globalForChat.traceEsgChatSql;
}

const NONE = ["00000000-0000-0000-0000-000000000000"];
const ROW_LIMIT = 20_000;

export function dataLayer(databaseUrl: string): DataLayer & { periods(): Promise<Period[]> } {
  // The role is read-only by default; saying so on each transaction holds even where a pooler does not
  // apply role settings.
  const read = <T>(query: (tx: postgres.TransactionSql) => Promise<T>) =>
    reader(databaseUrl).begin("read only", async (tx) => {
      await tx`set local statement_timeout = '10s'`;
      return query(tx);
    }) as Promise<T>;
  const cells = (
    tx: postgres.TransactionSql,
    nodes: string[],
    periods: string[],
    metrics: string[],
  ) =>
    tx`cr.org_unit_id in ${tx(nodes.length ? nodes : NONE)}
       and cr.reporting_period_id in ${tx(periods.length ? periods : NONE)}
       and cr.metric_id in ${tx(metrics.length ? metrics : NONE)}`;

  return {
    periods: () =>
      read(
        (tx) => tx<Period[]>`
          select id, label, start_date::text as start, end_date::text as "end", period_type::text as type
          from public.reporting_periods order by start_date`,
      ),

    metrics: async (filter) =>
      (await read((tx) => loadMetrics(tx, filter))).map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        unit: m.unit,
        requiresCalculation: m.requires_calculation,
        scopeCode: m.scope_code,
        scopeName: m.scope_name,
        formulaType: m.formula_type,
        formulaDefinition: m.formula_definition,
      })),

    fieldLabels: (metricIds) =>
      read(
        (tx) => tx<{ metricId: string; key: string; label: string }[]>`
          select metric_id as "metricId", field_key as key, field_label as label
          from public.metric_field_requirements where metric_id in ${tx(metricIds.length ? metricIds : NONE)}`,
      ),

    // The same sums consolidateNodes makes (lib/consolidation/query.ts), kept per reporting period as well.
    values: (nodes, periods, metrics) =>
      read(
        (tx) => tx<Awaited<ReturnType<DataLayer["values"]>>>`
          select cr.org_unit_id as "nodeId", cr.reporting_period_id as "periodId",
                 cr.metric_id as "metricId", cr.value_unit as unit,
                 coalesce(sum(cr.value) filter (where cr.approval_status = 'approved'), 0)::float as approved,
                 coalesce(sum(cr.value) filter (where cr.approval_status <> 'approved'), 0)::float as awaiting,
                 count(cr.value)::int as records,
                 count(*) filter (where cr.not_calculated)::int as "notCalculated"
          from public.consolidation_records cr
          where ${cells(tx, nodes, periods, metrics)}
          group by 1, 2, 3, 4 limit ${ROW_LIMIT}`,
      ),

    inputs: (nodes, periods, metrics) =>
      read(
        (tx) => tx<Awaited<ReturnType<DataLayer["inputs"]>>>`
          select cr.org_unit_id as "nodeId", cr.reporting_period_id as "periodId",
                 cr.metric_id as "metricId", ci.input_key as key,
                 coalesce(sum(ci.input_value) filter (where cr.approval_status = 'approved'), 0)::float as approved,
                 coalesce(sum(ci.input_value) filter (where cr.approval_status <> 'approved'), 0)::float as awaiting
          from public.consolidation_records cr
          join public.calculation_inputs ci on ci.calculation_id = cr.calculation_id
          where ${cells(tx, nodes, periods, metrics)}
          group by 1, 2, 3, 4 limit ${ROW_LIMIT}`,
      ),

    quantities: (nodes, periods, metrics) =>
      read(
        (tx) => tx<Awaited<ReturnType<DataLayer["quantities"]>>>`
          select cr.org_unit_id as "nodeId", cr.reporting_period_id as "periodId",
                 cr.metric_id as "metricId", r.activity_unit as unit,
                 coalesce(sum(r.activity_value_verified) filter (where cr.approval_status = 'approved'), 0)::float as approved,
                 coalesce(sum(r.activity_value_verified) filter (where cr.approval_status <> 'approved'), 0)::float as awaiting
          from public.consolidation_records cr
          join public.esg_records r on r.id = cr.esg_record_id
          where ${cells(tx, nodes, periods, metrics)}
            and r.activity_value_verified is not null and r.activity_unit is not null
          group by 1, 2, 3, 4 limit ${ROW_LIMIT}`,
      ),

    // One status per record, the furthest stage it has reached (the stages of lib/records/search.ts).
    statuses: (nodeId, periods) =>
      read(
        (tx) => tx<{ periodId: string; status: string; records: number }[]>`
          select r.reporting_period_id as "periodId",
                 case when r.data_quality_state = 'rejected' then 'rejected'
                      when r.approval_status = 'returned' or r.validation_status = 'returned' then 'returned'
                      when r.approval_status = 'approved' then 'approved'
                      when r.approval_status = 'review_pending' then 'awaiting_approval'
                      when r.validation_status = 'failed' then 'failed'
                      when r.validation_status = 'flagged' then 'flagged'
                      when r.verification_status = 'user_verified' then 'verified'
                      when r.verification_status = 'ocr_completed' then 'needs_verification'
                      else 'processing' end as status,
                 count(*)::int as records
          from public.esg_records r
          join public.org_unit_tree t on t.descendant_id = r.org_unit_id and t.ancestor_id = ${nodeId}
          where r.reporting_period_id in ${tx(periods.length ? periods : NONE)}
          group by 1, 2`,
      ),

    // Expected submissions and what satisfies one, as the Control Tower counts them (lib/dashboard/summary.ts).
    expectations: (nodeId) =>
      read(
        (tx) => tx<Awaited<ReturnType<DataLayer["expectations"]>>>`
          select e.org_unit_id as "orgUnitId", e.metric_id as "metricId", m.name as metric,
                 m.frequency::text as frequency
          from public.submission_expectations e
          join public.org_unit_tree t on t.descendant_id = e.org_unit_id and t.ancestor_id = ${nodeId}
          join public.esg_metrics m on m.id = e.metric_id and m.deleted_at is null
          join public.org_units o on o.id = e.org_unit_id and o.deleted_at is null
          limit ${ROW_LIMIT}`,
      ),

    submitted: (nodeId, periods) =>
      read(
        (tx) => tx<Awaited<ReturnType<DataLayer["submitted"]>>>`
          select distinct r.org_unit_id as "orgUnitId", r.metric_id as "metricId",
                 r.reporting_period_id as "periodId"
          from public.esg_records r
          join public.org_unit_tree t on t.descendant_id = r.org_unit_id and t.ancestor_id = ${nodeId}
          where r.reporting_period_id in ${tx(periods.length ? periods : NONE)}
            and r.data_quality_state <> 'rejected'
          limit ${ROW_LIMIT}`,
      ),

    calculations: async (nodeId, periods, metricId, limit) => {
      const rows = await read(
        (tx) => tx<(CalculationRow & { total: number })[]>`
          select p.label as "periodLabel", cr.source_org_unit_id as "orgUnitId",
                 cr.approval_status::text as "approvalStatus",
                 c.input_value::float as "inputValue", c.input_unit as "inputUnit",
                 c.normalized_value::float as "normalizedValue", c.normalized_unit as "normalizedUnit",
                 f.name as "factorName", v.version_number as "factorVersion",
                 c.factor_value_snapshot::float as "factorValue", v.input_unit as "factorInputUnit",
                 v.output_unit as "factorOutputUnit", v.source_reference as "factorSource",
                 c.result_value::float as "resultValue", c.result_unit as "resultUnit",
                 c.engine_version as "engineVersion",
                 coalesce((select json_agg(json_build_object(
                             'key', ci.input_key, 'value', ci.input_value::float, 'unit', ci.input_unit))
                           from public.calculation_inputs ci where ci.calculation_id = c.id), '[]'::json) as inputs,
                 count(*) over ()::int as total
          from public.consolidation_records cr
          join public.calculations c on c.id = cr.calculation_id
          join public.reporting_periods p on p.id = cr.reporting_period_id
          left join public.conversion_factor_versions v on v.id = c.conversion_factor_version_id
          left join public.conversion_factors f on f.id = v.conversion_factor_id
          where cr.org_unit_id = ${nodeId} and cr.metric_id = ${metricId}
            and cr.reporting_period_id in ${tx(periods.length ? periods : NONE)}
          order by p.start_date desc, c.result_value desc
          limit ${limit}`,
      );
      return { total: rows[0]?.total ?? 0, rows };
    },
  };
}

const MAX_UNITS = 5000;

/**
 * Every org unit the person may see, read fresh for each question on the app's own connection (D1): all of
 * them for an Admin, otherwise their assignments and everything beneath — the rule of consolidation.query.
 * A changed assignment therefore applies to the very next question.
 */
export async function allowedUnits(session: ActiveSession): Promise<OrgUnit[]> {
  const sql = db();
  if (session.isAdmin) {
    return sql<OrgUnit[]>`
      select id, name, code, unit_type::text as type, parent_id as "parentId"
      from public.org_units where deleted_at is null order by name limit ${MAX_UNITS}`;
  }
  return sql<OrgUnit[]>`
    select distinct o.id, o.name, o.code, o.unit_type::text as type, o.parent_id as "parentId"
    from public.user_org_assignments uoa
    join public.org_unit_tree t on t.ancestor_id = uoa.org_unit_id
    join public.org_units o on o.id = t.descendant_id
    where uoa.user_id = ${session.userId} and uoa.revoked_at is null and o.deleted_at is null
    order by o.name limit ${MAX_UNITS}`;
}
