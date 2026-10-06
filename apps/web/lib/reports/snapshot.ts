import "server-only";
import { consolidateNodes, loadMetrics } from "@/lib/consolidation/query";
import type { Figure, Method } from "@/lib/consolidation/aggregate";
import { normalize } from "@/lib/calculation/units";
import type { db, Tx } from "@/lib/db";
import { EMPTY_INPUTS, REPORT_INPUTS_KEY, type FyInputs } from "./inputs";

// What a BRSR report says, frozen at generation (schema §13.1 snapshot_data; .grill/phase-17-reporting-
// decisions.md). Approved records only. Every reported metric lists its contributing records with the
// calculation row each one used — calculations are append-only, so the drill-down can always show the exact
// trace behind a reported number.

type Sql = Tx | ReturnType<typeof db>;

export const SNAPSHOT_VERSION = 2;

export type ReportedRecord = {
  recordId: string;
  calculationId: string | null;
  orgUnitName: string;
  fileName: string | null;
  documentId: string | null;
  mimeType: string | null;
  value: number | null;
  unit: string | null;
};

export type ReportedMetric = {
  metricId: string;
  name: string;
  notes: string | null;
  method: Method;
  /** What the indicator reports: the calculated result, or the verified quantity (D18). */
  reportedValue: "result" | "activity";
  /** Approved figures only, per unit. */
  figures: { unit: string; value: number | null }[];
  basis: { partLabel: string; wholeLabel: string; part: number; whole: number } | null;
  records: ReportedRecord[];
};

export type ReportedIndicator = {
  id: string;
  code: string;
  questionText: string;
  indicatorType: string | null;
  required: boolean;
  metrics: ReportedMetric[];
};

export type ScopeTotal = {
  code: string;
  name: string;
  figures: { unit: string; value: number | null }[];
};
export type ReportedSection = { code: string; name: string; indicators: ReportedIndicator[] };

/** A conversion factor version the reported calculations used, as each calculation stored it. */
export type FactorUsed = {
  name: string;
  version: number;
  value: number | null;
  inputUnit: string;
  outputUnit: string;
  source: string;
  geography: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  records: number;
};

export type Snapshot = {
  version: number;
  generatedAt: string;
  org: { id: string; name: string; path: string[] };
  /** The node itself and every org unit beneath it — the report's boundary. */
  orgUnitCount: number;
  coverage: { label: string; periodIds: string[]; financialYear: number | null };
  /** Records in scope still awaiting approval — left out of every figure, stated in the report. */
  excludedAwaitingApproval: number;
  scopes: ScopeTotal[];
  sections: ReportedSection[];
  /**
   * SEBI's tables carry the previous financial year beside the current one: the same figures for the year
   * before, without their records. Null for a single-period report.
   */
  previous: { label: string; scopes: ScopeTotal[]; sections: ReportedSection[] } | null;
  /** Turnover, PPP rate, output and assurance for both years (D26). Null for a single-period report. */
  inputs: { current: FyInputs; previous: FyInputs } | null;
  factors: FactorUsed[];
  /** Schema §13.1: the contributing record ids per indicator, in the documented shape. */
  indicators: { brsr_indicator_id: string; esg_record_ids: string[] }[];
};

/** Required BRSR indicators (Section A/B and Essential) with no applicable metric mapping. */
export async function unmappedRequiredIndicators(sql: Sql): Promise<string[]> {
  const rows = await sql<{ code: string }[]>`
    select i.code from public.brsr_indicators i
    join public.brsr_sections s on s.id = i.section_id
    where i.deleted_at is null
      and (s.code in ('A', 'B') or i.indicator_type = 'essential')
      and not exists (select 1 from public.brsr_metric_mappings x
                       where x.brsr_indicator_id = i.id and x.is_applicable)
    order by i.code`;
  return rows.map((r) => r.code);
}

const approvedFigures = (figures: Figure[]) =>
  figures.map((f) => ({ unit: f.unit, value: f.approved }));

/** The Admin-entered inputs for a financial year; anything not entered is null. */
export async function loadReportInputs(sql: Sql, financialYear: number): Promise<FyInputs> {
  const [row] = await sql<{ value: Record<string, Partial<FyInputs>> }[]>`
    select value from public.org_settings where key = ${REPORT_INPUTS_KEY}`;
  return { ...EMPTY_INPUTS, ...row?.value?.[String(financialYear)] };
}

/** Scope totals and every indicator's figures for one set of periods under one org node. */
async function collect(sql: Sql, orgUnitId: string, periodIds: string[]) {
  const [metrics, indicatorRows, mappings] = await Promise.all([
    loadMetrics(sql),
    sql<
      {
        id: string;
        code: string;
        question_text: string;
        indicator_type: string | null;
        section_code: string;
        section_name: string;
      }[]
    >`
      select i.id, i.code, i.question_text, i.indicator_type::text, s.code as section_code,
             s.name as section_name
      from public.brsr_indicators i join public.brsr_sections s on s.id = i.section_id
      where i.deleted_at is null order by s.code, i.code`,
    sql<
      {
        indicator_id: string;
        metric_id: string;
        notes: string | null;
        reported_value: "result" | "activity";
      }[]
    >`
      select brsr_indicator_id as indicator_id, esg_metric_id as metric_id, mapping_notes as notes,
             reported_value
      from public.brsr_metric_mappings where is_applicable`,
  ]);

  const consolidated =
    (await consolidateNodes(sql, [orgUnitId], periodIds, metrics)).get(orgUnitId) ?? [];

  // Approved records under the node, each with the calculation it used (none for recorded amounts).
  const records = periodIds.length
    ? await sql<
        {
          record_id: string;
          metric_id: string;
          calculation_id: string | null;
          org_unit_name: string;
          file_name: string | null;
          document_id: string | null;
          mime_type: string | null;
          value: number | null;
          unit: string | null;
          activity_value: number | null;
          activity_unit: string | null;
        }[]
      >`
        select cr.esg_record_id as record_id, cr.metric_id, cr.calculation_id, o.name as org_unit_name,
               d.file_name, d.id as document_id, d.mime_type, cr.value::float as value, cr.value_unit as unit,
               r.activity_value_verified::float as activity_value, r.activity_unit
        from public.consolidation_records cr
        join public.esg_records r on r.id = cr.esg_record_id
        join public.org_units o on o.id = cr.source_org_unit_id
        left join public.esg_record_documents erd on erd.esg_record_id = cr.esg_record_id and erd.is_primary
        left join public.documents d on d.id = erd.document_id and d.deleted_at is null
        where cr.org_unit_id = ${orgUnitId} and cr.reporting_period_id in ${sql(periodIds)}
          and cr.approval_status = 'approved' and cr.value is not null
        order by o.name, d.file_name`
    : [];

  const [excluded] = periodIds.length
    ? await sql<{ n: number }[]>`
        select count(*)::int as n from public.consolidation_records
        where org_unit_id = ${orgUnitId} and reporting_period_id in ${sql(periodIds)}
          and approval_status = 'review_pending'`
    : [{ n: 0 }];

  const reportedMetric = (
    metricId: string,
    notes: string | null,
    reportedValue: "result" | "activity",
  ): ReportedMetric | null => {
    const c = consolidated.find((m) => m.metricId === metricId);
    const meta = metrics.find((m) => m.id === metricId);
    if (!meta) return null;
    const own = records.filter((r) => r.metric_id === metricId);

    if (reportedValue === "activity") {
      // The verified quantity, normalised to the metric's unit where the unit table can (kg, t, KL…).
      const contributions = own.map((r) => {
        const n =
          r.activity_value !== null && r.activity_unit
            ? normalize(r.activity_value, r.activity_unit, meta.unit)
            : null;
        return n?.ok
          ? { record: r, value: n.normalized.value, unit: meta.unit }
          : { record: r, value: r.activity_value, unit: r.activity_unit };
      });
      const figures: { unit: string; value: number | null }[] = [];
      for (const x of contributions) {
        if (x.value === null || !x.unit) continue;
        const f = figures.find((g) => g.unit === x.unit);
        if (f) f.value = (f.value ?? 0) + x.value;
        else figures.push({ unit: x.unit, value: x.value });
      }
      return {
        metricId,
        name: meta.name,
        notes,
        method: "sum",
        reportedValue,
        figures,
        basis: null,
        records: contributions.map(({ record: r, value, unit }) => ({
          recordId: r.record_id,
          calculationId: r.calculation_id,
          orgUnitName: r.org_unit_name,
          fileName: r.file_name,
          documentId: r.document_id,
          mimeType: r.mime_type,
          value,
          unit,
        })),
      };
    }

    // No approved record → no figure ("no approved data"), never a 0 that looks like a measurement. A 0
    // from other units' pending records is dropped too, unless every approved value really is 0
    // (renewable electricity at a zero factor).
    const allZero = own.length > 0 && own.every((r) => r.value === 0);
    const figures =
      c && own.length
        ? approvedFigures(c.figures).filter((f) => c.method === "ratio" || f.value !== 0 || allZero)
        : [];
    return {
      metricId,
      name: meta.name,
      notes,
      method: c?.method ?? (meta.requires_calculation ? "sum" : "recorded"),
      reportedValue,
      figures,
      basis: c?.basis
        ? {
            partLabel: c.basis.partLabel,
            wholeLabel: c.basis.wholeLabel,
            part: c.basis.approved.part,
            whole: c.basis.approved.whole,
          }
        : null,
      records: own.map((r) => ({
        recordId: r.record_id,
        calculationId: r.calculation_id,
        orgUnitName: r.org_unit_name,
        fileName: r.file_name,
        documentId: r.document_id,
        mimeType: r.mime_type,
        value: r.value,
        unit: r.unit,
      })),
    };
  };

  const sections: ReportedSection[] = [];
  for (const row of indicatorRows) {
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
      required: row.section_code !== "C" || row.indicator_type === "essential",
      metrics: mappings
        .filter((m) => m.indicator_id === row.id)
        .map((m) => reportedMetric(m.metric_id, m.notes, m.reported_value))
        .filter((m): m is ReportedMetric => m !== null),
    });
  }

  // Scope 1/2/3 totals: summed per unit from approved calculated figures, never across units.
  const scopes = (
    [
      ["SCOPE_1", "Scope 1"],
      ["SCOPE_2", "Scope 2"],
      ["SCOPE_3", "Scope 3"],
    ] as const
  ).map(([code, name]) => {
    const figures: { unit: string; value: number | null }[] = [];
    for (const m of consolidated.filter((x) => x.scopeCode === code && x.method === "sum")) {
      for (const f of m.figures) {
        const entry = figures.find((e) => e.unit === f.unit);
        if (entry) entry.value = (entry.value ?? 0) + (f.approved ?? 0);
        else figures.push({ unit: f.unit, value: f.approved });
      }
    }
    return { code, name, figures };
  });

  return { scopes, sections, excluded: excluded.n };
}

export async function buildSnapshot(
  sql: Sql,
  input: {
    orgUnitId: string;
    periodIds: string[];
    label: string;
    financialYear: number | null;
    /** The financial year before, for SEBI's second column; its periods may be empty. */
    previous?: { periodIds: string[]; label: string } | null;
  },
): Promise<Snapshot> {
  const { orgUnitId, periodIds, financialYear } = input;
  const [path, [units], current, before] = await Promise.all([
    sql<{ id: string; name: string }[]>`
      select o.id, o.name from public.org_unit_tree t join public.org_units o on o.id = t.ancestor_id
      where t.descendant_id = ${orgUnitId} order by t.depth desc`,
    sql<{ n: number }[]>`
      select count(*)::int as n from public.org_unit_tree where ancestor_id = ${orgUnitId}`,
    collect(sql, orgUnitId, periodIds),
    input.previous ? collect(sql, orgUnitId, input.previous.periodIds) : null,
  ]);
  const { scopes, sections } = current;

  const calculationIds = [
    ...new Set(
      sections.flatMap((s) =>
        s.indicators.flatMap((i) =>
          i.metrics.flatMap((m) => m.records.flatMap((r) => r.calculationId ?? [])),
        ),
      ),
    ),
  ];
  const factors = calculationIds.length
    ? await sql<FactorUsed[]>`
        select cf.name, v.version_number as version, c.factor_value_snapshot::float as value,
               v.input_unit as "inputUnit", v.output_unit as "outputUnit", v.source_reference as source,
               v.geography, v.effective_from::text as "effectiveFrom", v.effective_to::text as "effectiveTo",
               count(*)::int as records
        from public.calculations c
        join public.conversion_factor_versions v on v.id = c.conversion_factor_version_id
        join public.conversion_factors cf on cf.id = v.conversion_factor_id
        where c.id in ${sql(calculationIds)}
        group by cf.name, v.version_number, c.factor_value_snapshot, v.input_unit, v.output_unit,
                 v.source_reference, v.geography, v.effective_from, v.effective_to
        order by cf.name, v.version_number`
    : [];

  return {
    version: SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    org: { id: orgUnitId, name: path.at(-1)?.name ?? "", path: path.map((p) => p.name) },
    orgUnitCount: units.n,
    coverage: { label: input.label, periodIds, financialYear },
    excludedAwaitingApproval: current.excluded,
    scopes,
    sections,
    previous:
      before && input.previous
        ? {
            label: input.previous.label,
            scopes: before.scopes,
            sections: before.sections.map((s) => ({
              ...s,
              indicators: s.indicators.map((i) => ({
                ...i,
                metrics: i.metrics.map((m) => ({ ...m, records: [] })),
              })),
            })),
          }
        : null,
    inputs:
      financialYear === null
        ? null
        : {
            current: await loadReportInputs(sql, financialYear),
            previous: await loadReportInputs(sql, financialYear - 1),
          },
    factors: [...factors],
    indicators: sections.flatMap((s) =>
      s.indicators.map((i) => ({
        brsr_indicator_id: i.id,
        esg_record_ids: [...new Set(i.metrics.flatMap((m) => m.records.map((r) => r.recordId)))],
      })),
    ),
  };
}
