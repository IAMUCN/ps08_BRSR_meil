import "server-only";
// Relative imports (with extensions) so scripts/calculate-pending.ts can run this engine with plain Node.
import { writeAudit } from "../audit.ts";
import type { Tx } from "../db.ts";
import { normalize } from "./units.ts";

// The calculation engine (06_IMPLEMENTATION_PLAN.md Phase 9, TRD §24, schema §10). Deterministic TS over
// stored data: verified value → normalised value → the factor version effective for the record's period →
// formula → result + scope. No LLM, no network, no "latest factor" shortcut — the same record and the same
// factor version always produce the same number. Called from submitForApproval, so nothing reaches an
// approver without its trace, and from calculation.recalculate.

/** Bumped by hand whenever the maths changes; stored on every calculations row for reproducibility. */
export const ENGINE_VERSION = "calc-1.0.0";

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
};

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
           r.activity_value_verified::float as activity_value, r.activity_unit, d.file_name
    from public.esg_records r
    join public.org_units o on o.id = r.org_unit_id
    join public.reporting_periods p on p.id = r.reporting_period_id
    join public.esg_metrics m on m.id = r.metric_id
    left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
    left join public.documents d on d.id = erd.document_id and d.deleted_at is null
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

  if (record.activity_value === null || !record.activity_unit) {
    return blocked("The record has no verified activity value and unit.");
  }

  const normalized = normalize(record.activity_value, record.activity_unit, record.metric_unit);
  if (!normalized.ok) return blocked(normalized.reason);

  const [formula] = await tx<{ id: string; formula_type: string }[]>`
    select id, formula_type::text
    from public.calculation_formulas
    where metric_id = ${record.metric_id} and status = 'active'
      and effective_from <= ${record.period_end}::date
      and (effective_to is null or effective_to >= ${record.period_end}::date)
    order by version desc
    limit 1`;
  if (!formula) {
    return blocked(`No active calculation formula for ${record.metric_name} in this period.`);
  }
  if (formula.formula_type !== "direct_multiply") {
    // `subtract` arrives with Phase 13's water metric; `custom` is reserved and not built (schema §6.7).
    return blocked(`Formula type "${formula.formula_type}" is not implemented yet.`);
  }

  let factorId: string | null = null;
  let factorValue: number | null = null;
  let resultValue = normalized.normalized.value;
  let resultUnit = normalized.normalized.unit;

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
        and v.effective_from <= ${record.period_end}::date
        and (v.effective_to is null or v.effective_to >= ${record.period_end}::date)
      order by v.effective_from desc, v.version_number desc
      limit 1`;
    if (!factor) {
      return blocked(
        `No active conversion factor for ${record.metric_name} covering ${record.period_label}.`,
      );
    }
    // The factor may be written per KL while the record normalised to L: convert, don't assume.
    const inFactorUnit = normalize(
      normalized.normalized.value,
      normalized.normalized.unit,
      factor.input_unit,
    );
    if (!inFactorUnit.ok) {
      return blocked(
        `The factor is per "${factor.input_unit}" but the record is in "${normalized.normalized.unit}".`,
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
    values (${record.id}, ${factorId}, ${formula.id}, ${record.activity_value}, ${record.activity_unit},
            ${normalized.normalized.value}, ${normalized.normalized.unit}, ${factorValue},
            ${resultValue}, ${resultUnit}, ${record.scope_id}, ${ENGINE_VERSION})
    returning id`;
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
      input: { value: record.activity_value, unit: record.activity_unit },
      normalized: normalized.normalized,
      result: { value: resultValue, unit: resultUnit },
      engine_version: ENGINE_VERSION,
    },
  });
  return { status: "calculated", calculationId: row.id, resultValue, resultUnit };
}
