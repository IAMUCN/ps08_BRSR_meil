import "server-only";
import { db, type Tx } from "../db.ts";
import { getEsgFeaturesForUnit } from "../features/service.ts";
import {
  evaluateRuleSet,
  type DecisionRule,
  type RuleEvaluationSummary,
  type RuleCategory,
  type RuleSeverity,
  type RuleOperator,
  type RuleStatus,
} from "./engine.ts";

type Sql = Tx | ReturnType<typeof db>;

export type DecisionRuleRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  version: number;
  status: string;
  severity: string;
  target_feature: string;
  operator: string;
  threshold_value: number;
  threshold_upper: number | null;
  advisory_message_template: string;
  disclaimer: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function mapRowToRule(row: DecisionRuleRow): DecisionRule {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    category: row.category as RuleCategory,
    version: row.version,
    status: row.status as RuleStatus,
    severity: row.severity as RuleSeverity,
    targetFeature: row.target_feature as any,
    operator: row.operator as RuleOperator,
    thresholdValue: Number(row.threshold_value),
    thresholdUpper: row.threshold_upper ? Number(row.threshold_upper) : null,
    advisoryMessageTemplate: row.advisory_message_template,
    disclaimer: row.disclaimer,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Retrieves decision rules, optionally filtered by status or category.
 */
export async function listDecisionRules(
  sql: Sql,
  filters: { category?: RuleCategory; status?: RuleStatus } = {},
): Promise<DecisionRule[]> {
  const rows = await sql<DecisionRuleRow[]>`
    select * from public.decision_rules
    where (${filters.category ?? null}::text is null or category = ${filters.category ?? null})
      and (${filters.status ?? null}::text is null or status = ${filters.status ?? null})
    order by category, code, version desc
  `;
  return rows.map(mapRowToRule);
}

/**
 * Creates a brand new decision rule (Version 1).
 */
export async function createDecisionRule(
  sql: Sql,
  data: {
    code: string;
    name: string;
    description: string;
    category: RuleCategory;
    severity: RuleSeverity;
    targetFeature: string;
    operator: RuleOperator;
    thresholdValue: number;
    thresholdUpper?: number | null;
    advisoryMessageTemplate: string;
    disclaimer?: string;
    userId: string;
  },
): Promise<DecisionRule> {
  const rows = await sql<DecisionRuleRow[]>`
    insert into public.decision_rules (
      code, name, description, category, version, status, severity,
      target_feature, operator, threshold_value, threshold_upper,
      advisory_message_template, disclaimer, created_by
    ) values (
      ${data.code}, ${data.name}, ${data.description}, ${data.category}, 1, 'ACTIVE', ${data.severity},
      ${data.targetFeature}, ${data.operator}, ${data.thresholdValue}, ${data.thresholdUpper ?? null},
      ${data.advisoryMessageTemplate}, ${data.disclaimer ?? null}, ${data.userId}
    )
    returning *
  `;
  const created = rows[0];

  return mapRowToRule(created!);
}

/**
 * Modifies an existing rule by versioning it:
 * Marks current version as SUPERSEDED and inserts version + 1 as ACTIVE.
 * Ensures complete historical audit reproducibility.
 */
export async function updateAndVersionDecisionRule(
  sql: Sql,
  ruleId: string,
  updates: {
    name?: string;
    description?: string;
    severity?: RuleSeverity;
    thresholdValue?: number;
    thresholdUpper?: number | null;
    advisoryMessageTemplate?: string;
    status?: RuleStatus;
    userId: string;
  },
): Promise<DecisionRule> {
  const [current] = await sql<DecisionRuleRow[]>`
    select * from public.decision_rules where id = ${ruleId}
  `;
  if (!current) {
    throw new Error(`Decision rule ${ruleId} not found.`);
  }

  // If simply toggling status to DISABLED, update directly
  if (updates.status && updates.status === "DISABLED") {
    const [updated] = await sql<DecisionRuleRow[]>`
      update public.decision_rules
      set status = 'DISABLED', updated_at = now()
      where id = ${ruleId}
      returning *
    `;
    return mapRowToRule(updated!);
  }

  // Otherwise, create a new version: mark current SUPERSEDED
  await sql`
    update public.decision_rules
    set status = 'SUPERSEDED', updated_at = now()
    where id = ${ruleId}
  `;

  const newVersion = current.version + 1;
  const nextRows = await sql<DecisionRuleRow[]>`
    insert into public.decision_rules (
      code, name, description, category, version, status, severity,
      target_feature, operator, threshold_value, threshold_upper,
      advisory_message_template, disclaimer, created_by
    ) values (
      ${current.code},
      ${updates.name ?? current.name},
      ${updates.description ?? current.description},
      ${current.category},
      ${newVersion},
      'ACTIVE',
      ${updates.severity ?? current.severity},
      ${current.target_feature},
      ${current.operator},
      ${updates.thresholdValue ?? current.threshold_value},
      ${updates.thresholdUpper !== undefined ? updates.thresholdUpper : current.threshold_upper},
      ${updates.advisoryMessageTemplate ?? current.advisory_message_template},
      ${current.disclaimer},
      ${updates.userId}
    )
    returning *
  `;
  const next = nextRows[0];

  return mapRowToRule(next!);
}

/**
 * Runs feature extraction, evaluates all active decision rules,
 * and writes immutable audit entries to decision_rule_evaluations.
 */
export async function evaluateAndAuditDecisionRules(
  sql: Sql,
  params: {
    orgUnitId: string;
    reportingPeriodId: string;
  },
): Promise<RuleEvaluationSummary> {
  const { orgUnitId, reportingPeriodId } = params;

  // 1. Calculate verified feature vector from Feature Engine
  const features = await getEsgFeaturesForUnit(sql, { orgUnitId, reportingPeriodId });

  // 2. Fetch contributing verified record IDs for traceability
  const records = await sql<{ id: string }[]>`
    select id from public.esg_records
    where org_unit_id = ${orgUnitId}
      and reporting_period_id = ${reportingPeriodId}
      and verification_status = 'user_verified'
      and approval_status = 'approved'
  `;
  const traceableRecordIds = records.map((r) => r.id);

  // 3. Load active rules
  const activeRules = await listDecisionRules(sql, { status: "ACTIVE" });

  // 4. Pure evaluation
  const summary = evaluateRuleSet(activeRules, features, traceableRecordIds);

  // 5. Append-only audit logging into decision_rule_evaluations
  if (summary.results.length > 0) {
    const featureSnapshot = JSON.stringify(features);
    for (const res of summary.results) {
      await sql`
        insert into public.decision_rule_evaluations (
          rule_id, rule_code, rule_version, org_unit_id, reporting_period_id,
          triggered, observed_feature_value, threshold_value, severity,
          advisory_message, contributing_record_ids, feature_snapshot
        ) values (
          ${res.ruleId}, ${res.ruleCode}, ${res.ruleVersion}, ${orgUnitId}, ${reportingPeriodId},
          ${res.triggered}, ${res.observedValue}, ${res.thresholdValue}, ${res.severity},
          ${res.advisoryMessage}, ${traceableRecordIds}, ${featureSnapshot}::jsonb
        )
      `;
    }
  }

  return summary;
}
