import "server-only";
import { consolidateNodes, loadMetrics } from "@/lib/consolidation/query";
import type { Figure, Method } from "@/lib/consolidation/aggregate";
import { normalize } from "@/lib/calculation/units";
import type { db, Tx } from "@/lib/db";
import { parseNumber } from "@/lib/validation/checks";
import {
  combustionUse,
  dischargeDestination,
  dischargeTreated,
  type DischargeDestination,
  wasteCategory,
  wasteRoute,
  type WasteCategory,
  type WasteRoute,
} from "./classify";
import { EMPTY_INPUTS, REPORT_INPUTS_KEY, type FyInputs } from "./inputs";

// What a BRSR report says, frozen at generation (schema §13.1 snapshot_data; .grill/phase-17-reporting-
// decisions.md). Approved records only. Every reported metric lists its contributing records with the
// calculation row each one used — calculations are append-only, so the drill-down can always show the exact
// trace behind a reported number.

type Sql = Tx | ReturnType<typeof db>;

export const SNAPSHOT_VERSION = 4;

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
  /** UN Sustainable Development Goal numbers the indicator is tagged with (migration 0039). */
  sdgs?: number[];
  /**
   * Version 4 (migration 0040): 'statement' questions are answered in writing by an Admin, 'data' ones from
   * approved records. Absent from earlier snapshots, which hold measured indicators only.
   */
  kind?: "data" | "statement";
  /** Section C: the NGRBC principle, 1 to 9. */
  principle?: number | null;
  /** Sections A and B: the sub-heading the question is printed under. */
  part?: string | null;
  /** The typed answer for the report's financial year; null when nothing was entered. */
  answer?: string | null;
  metrics: ReportedMetric[];
};

export type ScopeTotal = {
  code: string;
  name: string;
  figures: { unit: string; value: number | null }[];
};
export type ReportedSection = { code: string; name: string; indicators: ReportedIndicator[] };

export type Scope1Source = "stationary" | "mobile" | "combustion_unstated" | "process" | "fugitive";

/**
 * The break-ups SEBI's tables ask for, from approved records (snapshot version 3). Emissions in metric
 * tonnes of CO2 equivalent, waste in metric tonnes. A null key is "not stated" and is printed as such.
 */
export type Breakups = {
  /** Scope totals by the gases each factor says its value covers. */
  gases: { scopeCode: string; gases: string | null; tCo2e: number }[];
  /** Scope 1 by how it is emitted: stationary or mobile combustion, process, fugitive. */
  scope1Sources: { source: Scope1Source; tCo2e: number }[];
  wasteByCategory: { category: WasteCategory | null; tonnes: number }[];
  wasteByRoute: { route: WasteRoute | null; tonnes: number }[];
  /** Water discharged, in kilolitres, by where it went and whether it was treated (migration 0041). */
  waterDischarge?: {
    destination: DischargeDestination | null;
    treated: boolean | null;
    kl: number;
  }[];
  /** The counts on approved safety incident statements, summed (migration 0041). */
  safety?: SafetyTotals[];
};

export type SafetyTotals = {
  workforce: "employees" | "workers";
  personHours: number;
  lostTimeInjuries: number;
  recordableInjuries: number;
  fatalities: number;
  highConsequenceInjuries: number;
};

/** A direct child of the reported org unit with its own rolled-up scope totals. */
export type ChildTotals = { name: string; level: string; scopes: ScopeTotal[] };

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
  coverage: {
    label: string;
    periodIds: string[];
    financialYear: number | null;
    /** First and last day the report's periods cover, and how many days they hold (version 3). */
    from?: string | null;
    to?: string | null;
    days?: number;
  };
  /** Records in scope still awaiting approval — left out of every figure, stated in the report. */
  excludedAwaitingApproval: number;
  scopes: ScopeTotal[];
  sections: ReportedSection[];
  /**
   * SEBI's tables carry the previous financial year beside the current one: the same figures for the year
   * before, without their records. Null for a single-period report.
   */
  previous: {
    label: string;
    scopes: ScopeTotal[];
    sections: ReportedSection[];
    breakups?: Breakups;
  } | null;
  /** Version 3. Absent from earlier snapshots. */
  breakups?: Breakups;
  children?: ChildTotals[];
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
      and i.answer_kind = 'data'
      and (s.code in ('A', 'B') or i.indicator_type = 'essential')
      and not exists (select 1 from public.brsr_metric_mappings x
                       where x.brsr_indicator_id = i.id and x.is_applicable)
    order by i.code`;
  return rows.map((r) => r.code);
}

/** Scope 1/2/3 totals: summed per unit from approved calculated figures, never across units. */
function scopeTotals(
  consolidated: { scopeCode: string | null; method: Method; figures: Figure[] }[],
): ScopeTotal[] {
  return (
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
}

const addTo = <K>(list: { key: K; total: number }[], key: K, amount: number) => {
  const entry = list.find((e) => e.key === key);
  if (entry) entry.total += amount;
  else list.push({ key, total: amount });
};

/** The gas, emission-source and waste break-ups of the approved records under a node. */
async function collectBreakups(
  sql: Sql,
  orgUnitId: string,
  periodIds: string[],
): Promise<Breakups> {
  const rows = periodIds.length
    ? await sql<
        {
          scope_code: string | null;
          metric_code: string;
          emission_source: "combustion" | "process" | "fugitive" | null;
          value: number | null;
          unit: string | null;
          gases: string | null;
          activity_value: number | null;
          activity_unit: string | null;
          used_in: string | null;
          waste_category: string | null;
        }[]
      >`
        select coalesce(ps.code, s.code) as scope_code, m.code as metric_code, m.emission_source,
               cr.value::float as value, cr.value_unit as unit, v.gases,
               r.activity_value_verified::float as activity_value, r.activity_unit,
               (select f.verified_value from public.ocr_fields f
                 where f.ocr_extraction_id = e.id and f.field_key = 'source_classification' limit 1) as used_in,
               (select f.verified_value from public.ocr_fields f
                 where f.ocr_extraction_id = e.id and f.field_key = 'waste_category' limit 1) as waste_category
        from public.consolidation_records cr
        join public.esg_records r on r.id = cr.esg_record_id
        join public.esg_metrics m on m.id = cr.metric_id
        left join public.scopes s on s.id = m.scope_id
        left join public.scopes ps on ps.id = s.parent_scope_id
        left join public.calculations c on c.id = cr.calculation_id
        left join public.conversion_factor_versions v on v.id = c.conversion_factor_version_id
        left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
        left join public.ocr_extractions e on e.document_id = erd.document_id
        where cr.org_unit_id = ${orgUnitId} and cr.reporting_period_id in ${sql(periodIds)}
          and cr.approval_status = 'approved' and cr.value is not null
          and m.scope_id is not null`
    : [];

  const gases: { key: string; total: number }[] = [];
  const sources: { key: Scope1Source; total: number }[] = [];
  const categories: { key: WasteCategory | null; total: number }[] = [];
  const routes: { key: WasteRoute | null; total: number }[] = [];
  for (const r of rows) {
    const unit = r.unit?.trim().toLowerCase();
    const tCo2e =
      r.value === null
        ? null
        : unit === "kgco2e"
          ? r.value / 1000
          : unit === "tco2e"
            ? r.value
            : null;
    if (r.scope_code && tCo2e !== null) {
      addTo(gases, `${r.scope_code}|${r.gases?.trim() ?? ""}`, tCo2e);
      if (r.scope_code === "SCOPE_1") {
        const source: Scope1Source =
          r.emission_source === "process" || r.emission_source === "fugitive"
            ? r.emission_source
            : (combustionUse(r.used_in) ?? "combustion_unstated");
        addTo(sources, source, tCo2e);
      }
    }
    if (r.metric_code === "WASTE_DISPOSED" && r.activity_value !== null && r.activity_unit) {
      const kg = normalize(r.activity_value, r.activity_unit, "kg");
      if (kg.ok) {
        addTo(categories, wasteCategory(r.waste_category), kg.normalized.value / 1000);
        addTo(routes, wasteRoute(r.used_in), kg.normalized.value / 1000);
      }
    }
  }
  // SEBI's water-discharge and safety tables are built from the verified fields of approved records.
  const fieldRows = periodIds.length
    ? await sql<
        { metric_code: string; unit: string | null; fields: Record<string, string | null> | null }[]
      >`
        select m.code as metric_code, r.activity_unit as unit,
               (select jsonb_object_agg(f.field_key, f.verified_value) from public.ocr_fields f
                 where f.ocr_extraction_id = e.id) as fields
        from public.consolidation_records cr
        join public.esg_records r on r.id = cr.esg_record_id
        join public.esg_metrics m on m.id = cr.metric_id
        left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
        left join lateral (select x.id from public.ocr_extractions x
                            where x.document_id = erd.document_id
                            order by x.extracted_at desc limit 1) e on true
        where cr.org_unit_id = ${orgUnitId} and cr.reporting_period_id in ${sql(periodIds)}
          and cr.approval_status = 'approved'
          and m.code in ('WATER_CONSUMPTION', 'SAFETY_EMPLOYEES', 'SAFETY_WORKERS')`
    : [];
  const waterDischarge: NonNullable<Breakups["waterDischarge"]> = [];
  const safety: SafetyTotals[] = [];
  for (const r of fieldRows) {
    const number = (key: string) => parseNumber(r.fields?.[key] ?? null);
    if (r.metric_code === "WATER_CONSUMPTION") {
      const discharged = number("discharge");
      const kl = discharged !== null && r.unit ? normalize(discharged, r.unit, "KL") : null;
      if (!kl?.ok || kl.normalized.value === 0) continue;
      const destination = dischargeDestination(r.fields?.discharge_destination);
      const treated = dischargeTreated(r.fields?.discharge_treatment);
      const entry = waterDischarge.find(
        (x) => x.destination === destination && x.treated === treated,
      );
      if (entry) entry.kl += kl.normalized.value;
      else waterDischarge.push({ destination, treated, kl: kl.normalized.value });
      continue;
    }
    const workforce = r.metric_code === "SAFETY_EMPLOYEES" ? "employees" : "workers";
    let totals = safety.find((x) => x.workforce === workforce);
    if (!totals) {
      totals = {
        workforce,
        personHours: 0,
        lostTimeInjuries: 0,
        recordableInjuries: 0,
        fatalities: 0,
        highConsequenceInjuries: 0,
      };
      safety.push(totals);
    }
    totals.personHours += number("person_hours") ?? 0;
    totals.lostTimeInjuries += number("lost_time_injuries") ?? 0;
    totals.recordableInjuries += number("recordable_injuries") ?? 0;
    totals.fatalities += number("fatalities") ?? 0;
    totals.highConsequenceInjuries += number("high_consequence_injuries") ?? 0;
  }

  return {
    waterDischarge,
    safety,
    gases: gases.map((g) => {
      const at = g.key.indexOf("|");
      return { scopeCode: g.key.slice(0, at), gases: g.key.slice(at + 1) || null, tCo2e: g.total };
    }),
    scope1Sources: sources.map((x) => ({ source: x.key, tCo2e: x.total })),
    wasteByCategory: categories.map((x) => ({ category: x.key, tonnes: x.total })),
    wasteByRoute: routes.map((x) => ({ route: x.key, tonnes: x.total })),
  };
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
async function collect(
  sql: Sql,
  orgUnitId: string,
  periodIds: string[],
  /** The financial year whose typed answers are printed; null prints none. */
  disclosureYear: number | null,
) {
  const [metrics, indicatorRows, mappings, answers] = await Promise.all([
    loadMetrics(sql),
    sql<
      {
        id: string;
        code: string;
        question_text: string;
        indicator_type: string | null;
        section_code: string;
        section_name: string;
        sdg_goals: number[];
        answer_kind: "data" | "statement";
        principle: number | null;
        part: string | null;
      }[]
    >`
      select i.id, i.code, i.question_text, i.indicator_type::text, s.code as section_code,
             s.name as section_name, i.sdg_goals, i.answer_kind, i.principle, i.part
      from public.brsr_indicators i join public.brsr_sections s on s.id = i.section_id
      where i.deleted_at is null order by s.code, i.sort_order, i.code`,
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
    disclosureYear === null
      ? []
      : sql<{ indicator_id: string; answer: string }[]>`
          select brsr_indicator_id as indicator_id, answer from public.brsr_disclosures
          where financial_year = ${disclosureYear}`,
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
      sdgs: [...row.sdg_goals].sort((a, b) => a - b),
      kind: row.answer_kind,
      principle: row.principle,
      part: row.part,
      answer: answers.find((a) => a.indicator_id === row.id)?.answer ?? null,
      metrics: mappings
        .filter((m) => m.indicator_id === row.id)
        .map((m) => reportedMetric(m.metric_id, m.notes, m.reported_value))
        .filter((m): m is ReportedMetric => m !== null),
    });
  }

  const scopes = scopeTotals(consolidated);
  const breakups = await collectBreakups(sql, orgUnitId, periodIds);

  return { scopes, sections, breakups, excluded: excluded.n };
}

export async function buildSnapshot(
  sql: Sql,
  input: {
    orgUnitId: string;
    periodIds: string[];
    label: string;
    financialYear: number | null;
    /**
     * The financial year whose typed disclosures are printed. A single-period report has no
     * `financialYear` but still belongs to one.
     */
    disclosureYear?: number | null;
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
    collect(sql, orgUnitId, periodIds, input.disclosureYear ?? financialYear),
    input.previous ? collect(sql, orgUnitId, input.previous.periodIds, null) : null,
  ]);
  const { scopes, sections } = current;

  // Each direct child's own roll-up, so the report shows where the total comes from.
  const childRows = await sql<{ id: string; name: string; level: string }[]>`
    select o.id, o.name, l.label as level from public.org_units o
    join public.org_levels l on l.code = o.unit_type
    where o.parent_id = ${orgUnitId} and o.deleted_at is null order by o.name`;
  const childTotals = childRows.length
    ? await consolidateNodes(
        sql,
        childRows.map((c) => c.id),
        periodIds,
        await loadMetrics(sql),
      )
    : null;
  const [span] = periodIds.length
    ? await sql<{ from: string | null; to: string | null; days: number }[]>`
        select min(start_date)::text as "from", max(end_date)::text as "to",
               coalesce(sum(end_date - start_date + 1), 0)::int as days
        from public.reporting_periods where id in ${sql(periodIds)}`
    : [{ from: null, to: null, days: 0 }];

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
    coverage: { label: input.label, periodIds, financialYear, ...span },
    excludedAwaitingApproval: current.excluded,
    scopes,
    sections,
    previous:
      before && input.previous
        ? {
            label: input.previous.label,
            scopes: before.scopes,
            breakups: before.breakups,
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
    breakups: current.breakups,
    children: childRows.map((c) => ({
      name: c.name,
      level: c.level,
      scopes: scopeTotals(childTotals?.get(c.id) ?? []),
    })),
    factors: [...factors],
    indicators: sections.flatMap((s) =>
      s.indicators.map((i) => ({
        brsr_indicator_id: i.id,
        esg_record_ids: [...new Set(i.metrics.flatMap((m) => m.records.map((r) => r.recordId)))],
      })),
    ),
  };
}
