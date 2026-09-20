import "server-only";
import type { db, Tx } from "@/lib/db";
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
    }[]
  >`
    select c.esg_record_id, c.input_value::float as input_value, c.input_unit,
           c.normalized_value::float as normalized_value, c.normalized_unit,
           c.factor_value_snapshot::float as factor_value, v.input_unit as factor_input_unit,
           v.output_unit as factor_output_unit, f.name as factor_name,
           v.version_number as factor_version, v.source_reference as factor_source,
           c.result_value::float as result_value, c.result_unit, s.name as scope_name,
           c.engine_version, c.calculated_at
    from public.calculations c
    left join public.conversion_factor_versions v on v.id = c.conversion_factor_version_id
    left join public.conversion_factors f on f.id = v.conversion_factor_id
    left join public.scopes s on s.id = c.scope_id
    where c.is_current and c.esg_record_id in ${sql(recordIds)}`;

  for (const r of rows) {
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
