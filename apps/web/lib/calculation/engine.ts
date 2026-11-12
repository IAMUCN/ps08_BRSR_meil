import "server-only";
// Relative imports (with extensions) so scripts/calculate-pending.ts can run this engine with plain Node.
import { writeAudit } from "../audit.ts";
import type { db, Tx } from "../db.ts";
import { parseNumber } from "../validation/checks.ts";
import {
  activityInput,
  evaluate,
  formulaInputs,
  parseFormula,
  productInputs,
  type FormulaDefinition,
} from "./formulas.ts";
import { normalize, type Normalized } from "./units.ts";

// The calculation engine (06_IMPLEMENTATION_PLAN.md Phase 9, TRD §24, schema §10). Deterministic TS over
// stored data: verified value → normalised value → the factor version effective for the record's period →
// formula → result + scope. No LLM, no network, no "latest factor" shortcut — the same record and the same
// factor version always produce the same number. Called from submitForApproval, so nothing reaches an
// approver without its trace, and from calculation.recalculate.

/** Bumped by hand whenever the maths changes; stored on every calculations row for reproducibility. */
export const ENGINE_VERSION = "calc-1.1.0";

export type CalculationOutcome =
  | { status: "calculated"; calculationId: string; resultValue: number; resultUnit: string }
  | { status: "not_applicable" }
  | { status: "blocked"; reason: string };

type RecordRow = {
  id: string;
  org_unit_id: string;
  org_unit_name: string;
  period_end: string;
  period_label: string;
  metric_id: string;
  metric_code: string;
  metric_name: string;
  metric_unit: string;
  scope_id: string | null;
  requires_calculation: boolean;
  requires_conversion_factor: boolean;
  activity_value: number | null;
  activity_unit: string | null;
  file_name: string | null;
  extraction_id: string | null;
};

type Sql = Tx | ReturnType<typeof db>;

/** The metric's active formula (latest version), or null. Verification uses it to find the activity field. */
export async function activeFormula(sql: Sql, metricId: string): Promise<FormulaDefinition | null> {
  const [row] = await sql<{ formula_type: string; formula_definition: unknown }[]>`
    select formula_type::text, formula_definition from public.calculation_formulas
    where metric_id = ${metricId} and status = 'active'
    order by version desc limit 1`;
  return row ? parseFormula(row.formula_type, row.formula_definition) : null;
}

/**
 * The field key holding a metric's activity value when its formula names one (percentage, subtract), or the
 * keys multiplied into it (travel). null = the single-number convention.
 */
export async function activityKeyFor(
  sql: Sql,
  metricId: string,
): Promise<string | string[] | null> {
  const formula = await activeFormula(sql, metricId);
  return productInputs(formula) ?? activityInput(formula);
}

/**
 * Calculates one record in the caller's transaction, replacing any previous current calculation. A missing
 * factor, formula or unconvertible unit blocks with a named reason — never a guessed number
 * (.grill/phase-9-calculation-engine-decisions.md).
 */
export async function runCalculation(
  tx: Tx,
  recordId: string,
  actorId: string | null = null,
): Promise<CalculationOutcome> {
  const [record] = await tx<RecordRow[]>`
    select r.id, r.org_unit_id, o.name as org_unit_name,
           p.end_date::text as period_end, p.label as period_label,
           r.metric_id, m.code as metric_code, m.name as metric_name, m.unit as metric_unit,
           m.scope_id, m.requires_calculation, m.requires_conversion_factor,
           r.activity_value_verified::float as activity_value, r.activity_unit, d.file_name,
           e.id as extraction_id
    from public.esg_records r
    join public.org_units o on o.id = r.org_unit_id
    join public.reporting_periods p on p.id = r.reporting_period_id
    join public.esg_metrics m on m.id = r.metric_id
    left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
    left join public.documents d on d.id = erd.document_id and d.deleted_at is null
    left join public.ocr_extractions e on e.document_id = d.id
    where r.id = ${recordId}`;

  if (!record.requires_calculation) {
    await tx`update public.esg_records set calculation_status = 'not_applicable' where id = ${recordId}`;
    return { status: "not_applicable" };
  }

  const blocked = async (reason: string): Promise<CalculationOutcome> => {
    // Told once per reason: a retry that hits the same gap shouldn't fill every Admin's bell again.
    const [seen] = await tx<{ n: number }[]>`
      select count(*)::int as n from public.audit_logs
      where event_type = 'calculation.blocked' and entity_id = ${record.id}
        and new_value->>'reason' = ${reason}`;
    await writeAudit(tx, {
      eventType: "calculation.blocked",
      entityType: "esg_record",
      entityId: record.id,
      userId: actorId,
      newValue: { reason, engine_version: ENGINE_VERSION },
    });
    if (seen.n > 0) return { status: "blocked", reason };
    // An Admin configuration gap, not the submitter's mistake: the record waits, the Admins are told.
    await tx`
      insert into public.notifications
        (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
      select distinct u.id, 'calculation_blocked', 'Calculation blocked',
             ${`${record.file_name ?? record.metric_name} (${record.org_unit_name}, ${record.period_label}): ${reason}`},
             'esg_record', ${record.id}::uuid, '/admin/conversion-factors'
      from public.users u
      join public.user_org_assignments uoa on uoa.user_id = u.id and uoa.revoked_at is null
      join public.roles ro on ro.id = uoa.role_id and ro.code = 'admin'
      where u.is_active and u.deleted_at is null`;
    return { status: "blocked", reason };
  };

  const [formulaRow] = await tx<
    { id: string; formula_type: string; formula_definition: unknown }[]
  >`
    select id, formula_type::text, formula_definition
    from public.calculation_formulas
    where metric_id = ${record.metric_id} and status = 'active'
      and effective_from <= ${record.period_end}::date
      and (effective_to is null or effective_to >= ${record.period_end}::date)
    order by version desc
    limit 1`;
  if (!formulaRow) {
    return blocked(`No active calculation formula for ${record.metric_name} in this period.`);
  }
  const formula = parseFormula(formulaRow.formula_type, formulaRow.formula_definition);
  if (!formula) {
    // `custom` is reserved and not built (schema §6.7); a malformed definition is a configuration gap.
    return blocked(
      `Formula type "${formulaRow.formula_type}" is not implemented or is misconfigured.`,
    );
  }

  if (record.activity_value === null) {
    return blocked("The record has no verified activity value.");
  }
  // Workforce counts carry no unit field: the numbers are counts (.grill/phase-13-role-modules-decisions.md).
  const inputUnit = record.activity_unit ?? (formula.op === "percentage" ? "count" : null);
  if (!inputUnit) return blocked("The record has no verified activity unit.");

  // `normalized` is the activity value in the metric's terms; `base` is what the formula produced.
  let normalized: Normalized;
  let base: Normalized;
  const inputs: { key: string; value: number; unit?: string }[] = [];
  if (formula.op === "multiply_by_factor") {
    const n = normalize(record.activity_value, inputUnit, record.metric_unit);
    if (!n.ok) return blocked(n.reason);
    normalized = base = n.normalized;
    // Travel (migration 0077): the activity value is distance x passengers, set at verification. The two
    // inputs go in the trace. A record verified before then has neither and keeps its passenger-km.
    const keys = productInputs(formula);
    if (keys) {
      const rows = await tx<{ field_key: string; verified_value: string | null }[]>`
        select f.field_key, f.verified_value from public.ocr_fields f
        where f.ocr_extraction_id = ${record.extraction_id} and f.field_key in ${tx(keys)}`;
      for (const k of keys) {
        const parsed = parseNumber(rows.find((r) => r.field_key === k)?.verified_value ?? null);
        if (parsed !== null) {
          // The distance is in the record's unit; the passengers are a count of people.
          inputs.push({ key: k, value: parsed, unit: k === keys[0] ? inputUnit : "count" });
        }
      }
      if (inputs.length !== keys.length) inputs.length = 0;
    }
  } else {
    // Every input is a verified field of the same document (schema §10.4 calculation_inputs).
    const keys = formulaInputs(formula);
    const rows = await tx<
      { field_key: string; field_label: string; verified_value: string | null }[]
    >`
      select f.field_key, f.field_label, f.verified_value from public.ocr_fields f
      where f.ocr_extraction_id = ${record.extraction_id} and f.field_key in ${tx(keys)}`;
    const values: Record<string, number> = {};
    for (const k of keys) {
      const row = rows.find((r) => r.field_key === k);
      const parsed = parseNumber(row?.verified_value ?? null);
      if (parsed === null) return blocked(`${row?.field_label ?? k} has no verified number.`);
      // Subtraction happens in the metric's unit (m³ and KL alike); a percentage's units cancel.
      if (formula.op === "subtract") {
        const n = normalize(parsed, inputUnit, record.metric_unit);
        if (!n.ok) return blocked(n.reason);
        values[k] = n.normalized.value;
      } else {
        values[k] = parsed;
      }
      inputs.push({ key: k, value: parsed });
    }
    const result = evaluate(formula, values);
    if (!result.ok) return blocked(result.reason);
    const unit = formula.op === "subtract" ? record.metric_unit : inputUnit;
    normalized = { value: values[keys[0]], unit };
    base = {
      value: result.value,
      // A rate that is not a percentage is in the metric's own unit ("per million person-hours").
      unit: formula.op === "subtract" || formula.scale !== 100 ? record.metric_unit : "%",
    };
  }

  let factorId: string | null = null;
  let factorValue: number | null = null;
  let resultValue = base.value;
  let resultUnit = base.unit;

  if (record.requires_conversion_factor) {
    // The version effective for the record's period — never "the newest row" (TRD §25).
    const [factor] = await tx<
      { id: string; value: number; input_unit: string; output_unit: string }[]
    >`
      select v.id, v.value::float as value, v.input_unit, v.output_unit
      from public.conversion_factor_versions v
      join public.conversion_factors f on f.id = v.conversion_factor_id
      where f.activity_type = ${record.metric_code}
        -- superseded versions stay selectable for the periods they covered: that is what makes a past
        -- calculation reproducible after a correction. retired and draft versions are never used.
        and v.status in ('active', 'superseded')
        -- The latest version starting on or before the period. Its last financial year does not stop it: a
        -- year with no newer version inherits it (owner's decision, 2026-11-11; migration 0064).
        and v.effective_from <= ${record.period_end}::date
      order by v.effective_from desc, v.version_number desc
      limit 1`;
    if (!factor) {
      return blocked(
        `No active conversion factor for ${record.metric_name} covering ${record.period_label}.`,
      );
    }
    // The factor may be written per KL while the record normalised to L: convert, don't assume.
    const inFactorUnit = normalize(base.value, base.unit, factor.input_unit);
    if (!inFactorUnit.ok) {
      return blocked(
        `The factor is per "${factor.input_unit}" but the record is in "${base.unit}".`,
      );
    }
    factorId = factor.id;
    factorValue = factor.value;
    resultValue = inFactorUnit.normalized.value * factor.value;
    resultUnit = factor.output_unit;
  }

  await tx`update public.calculations set is_current = false
           where esg_record_id = ${record.id} and is_current`;
  const [row] = await tx<{ id: string }[]>`
    insert into public.calculations
      (esg_record_id, conversion_factor_version_id, calculation_formula_id, input_value, input_unit,
       normalized_value, normalized_unit, factor_value_snapshot, result_value, result_unit, scope_id,
       engine_version)
    values (${record.id}, ${factorId}, ${formulaRow.id}, ${record.activity_value}, ${inputUnit},
            ${normalized.value}, ${normalized.unit}, ${factorValue},
            ${resultValue}, ${resultUnit}, ${record.scope_id}, ${ENGINE_VERSION})
    returning id`;
  for (const input of inputs) {
    await tx`
      insert into public.calculation_inputs (calculation_id, input_key, input_value, input_unit)
      values (${row.id}, ${input.key}, ${input.value}, ${input.unit ?? inputUnit})`;
  }
  await tx`update public.esg_records set calculation_status = 'calculated' where id = ${record.id}`;
  await writeAudit(tx, {
    eventType: "calculation.completed",
    entityType: "esg_record",
    entityId: record.id,
    userId: actorId, // null when it runs as part of verification (a system step)
    newValue: {
      calculation_id: row.id,
      conversion_factor_version_id: factorId,
      factor_value: factorValue,
      input: { value: record.activity_value, unit: inputUnit },
      inputs,
      normalized,
      result: { value: resultValue, unit: resultUnit },
      engine_version: ENGINE_VERSION,
    },
  });
  return { status: "calculated", calculationId: row.id, resultValue, resultUnit };
}
