import "server-only";
import type { db, Tx } from "@/lib/db";
import { formulaInputs, parseFormula } from "./formulas";
import type { CalculationState } from "./trace";

// Reads the current calculation for records the caller is already allowed to see (the callers scope their
// own queries). When there is none, the reason comes from the engine's own audit entry rather than a second
// copy of the lookup logic.

type Sql = Tx | ReturnType<typeof db>;

export async function loadCalculations(
  sql: Sql,
  recordIds: string[],
): Promise<Map<string, CalculationState>> {
  const state = new Map<string, CalculationState>();
  if (recordIds.length === 0) return state;

  const rows = await sql<
    {
      esg_record_id: string;
      input_value: number;
      input_unit: string;
      normalized_value: number;
      normalized_unit: string;
      factor_value: number | null;
      factor_input_unit: string | null;
      factor_output_unit: string | null;
      factor_name: string | null;
      factor_version: number | null;
      factor_source: string | null;
      result_value: number;
      result_unit: string;
      scope_name: string | null;
      engine_version: string;
      calculated_at: Date;
      formula_type: string | null;
      formula_definition: unknown;
      inputs: { key: string; label: string; value: number; unit: string }[];
    }[]
  >`
    select c.esg_record_id, c.input_value::float as input_value, c.input_unit,
           c.normalized_value::float as normalized_value, c.normalized_unit,
           c.factor_value_snapshot::float as factor_value, v.input_unit as factor_input_unit,
           v.output_unit as factor_output_unit, f.name as factor_name,
           v.version_number as factor_version, v.source_reference as factor_source,
           c.result_value::float as result_value, c.result_unit, s.name as scope_name,
           c.engine_version, c.calculated_at,
           cf.formula_type::text as formula_type, cf.formula_definition,
           coalesce((
             select json_agg(json_build_object(
               'key', ci.input_key, 'label', coalesce(req.field_label, ci.input_key),
               'value', ci.input_value::float, 'unit', ci.input_unit))
             from public.calculation_inputs ci
             join public.esg_records r on r.id = c.esg_record_id
             left join public.metric_field_requirements req
               on req.metric_id = r.metric_id and req.field_key = ci.input_key
             where ci.calculation_id = c.id
           ), '[]'::json) as inputs
    from public.calculations c
    left join public.calculation_formulas cf on cf.id = c.calculation_formula_id
    left join public.conversion_factor_versions v on v.id = c.conversion_factor_version_id
    left join public.conversion_factors f on f.id = v.conversion_factor_id
    left join public.scopes s on s.id = c.scope_id
    where c.is_current and c.esg_record_id in ${sql(recordIds)}`;

  for (const r of rows) {
    const formula = r.formula_type ? parseFormula(r.formula_type, r.formula_definition) : null;
    const order = formula ? formulaInputs(formula) : [];
    const inputs = [...r.inputs].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    const label = (key: string) => inputs.find((i) => i.key === key)?.label ?? key;
    state.set(r.esg_record_id, {
      blockedReason: null,
      trace: {
        inputValue: r.input_value,
        inputUnit: r.input_unit,
        normalizedValue: r.normalized_value,
        normalizedUnit: r.normalized_unit,
        factorValue: r.factor_value,
        factorInputUnit: r.factor_input_unit,
        factorOutputUnit: r.factor_output_unit,
        factorName: r.factor_name,
        factorVersion: r.factor_version,
        factorSource: r.factor_source,
        resultValue: r.result_value,
        resultUnit: r.result_unit,
        scopeName: r.scope_name,
        inputs: inputs.map(({ label, value, unit }) => ({ label, value, unit })),
        formula:
          formula?.op === "percentage"
            ? `${label(formula.part)} ÷ ${label(formula.whole)} × 100`
            : formula?.op === "subtract"
              ? `${label(formula.inputs[0])} − ${label(formula.inputs[1])}`
              : null,
        engineVersion: r.engine_version,
        calculatedAt: r.calculated_at.toISOString(),
      },
    });
  }

  const missing = recordIds.filter((id) => !state.has(id));
  if (missing.length > 0) {
    const reasons = await sql<{ entity_id: string; reason: string | null }[]>`
      select distinct on (entity_id) entity_id, new_value->>'reason' as reason
      from public.audit_logs
      where event_type = 'calculation.blocked' and entity_id in ${sql(missing)}
      order by entity_id, created_at desc`;
    const byId = new Map(reasons.map((r) => [r.entity_id, r.reason]));
    for (const id of missing) state.set(id, { trace: null, blockedReason: byId.get(id) ?? null });
  }
  return state;
}
