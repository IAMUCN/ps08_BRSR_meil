import { z } from "zod";
import type { EsgFeatureSet } from "../features/engine";

export const ruleCategoryEnum = z.enum([
  "ENERGY",
  "EMISSIONS",
  "WATER",
  "WASTE",
  "INTENSITY",
  "DATA_QUALITY",
]);
export type RuleCategory = z.infer<typeof ruleCategoryEnum>;

export const ruleSeverityEnum = z.enum(["INFO", "WARNING", "ACTION_REQUIRED", "CRITICAL_REVIEW"]);
export type RuleSeverity = z.infer<typeof ruleSeverityEnum>;

export const ruleOperatorEnum = z.enum([">", ">=", "<", "<=", "==", "!=", "OUTSIDE_RANGE"]);
export type RuleOperator = z.infer<typeof ruleOperatorEnum>;

export const ruleStatusEnum = z.enum(["DRAFT", "ACTIVE", "SUPERSEDED", "DISABLED"]);
export type RuleStatus = z.infer<typeof ruleStatusEnum>;

export type DecisionRule = {
  id: string;
  code: string;
  name: string;
  description: string;
  category: RuleCategory;
  version: number;
  status: RuleStatus;
  severity: RuleSeverity;
  targetFeature: keyof EsgFeatureSet;
  operator: RuleOperator;
  thresholdValue: number;
  thresholdUpper?: number | null; // For OUTSIDE_RANGE
  advisoryMessageTemplate: string;
  disclaimer?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type RuleEvaluationResult = {
  ruleId: string;
  ruleCode: string;
  ruleVersion: number;
  ruleName: string;
  category: RuleCategory;
  severity: RuleSeverity;
  triggered: boolean;
  targetFeature: string;
  observedValue: number | null;
  thresholdValue: number;
  thresholdUpper?: number | null;
  operator: RuleOperator;
  advisoryMessage: string;
  disclaimer: string;
  traceableRecordIds: string[];
};

export type RuleEvaluationSummary = {
  reportingPeriod: string;
  orgUnitId?: string;
  orgUnitName?: string;
  rulesEvaluated: number;
  triggeredCount: number;
  bySeverity: Record<RuleSeverity, number>;
  results: RuleEvaluationResult[];
  evaluatedAt: string;
};

export const STANDARD_DISCLAIMER =
  "This detects an operational growth threshold or metric condition. It does not establish regulatory non-compliance.";

/**
 * Formats advisory messages dynamically replacing `{actual}` and `{threshold}` placeholders.
 */
export function formatAdvisoryMessage(
  template: string,
  actual: number | null,
  threshold: number,
  thresholdUpper?: number | null,
): string {
  if (actual === null) {
    return template
      .replace(/{actual}/g, "N/A (No Data)")
      .replace(/{actual_pct}/g, "N/A")
      .replace(/{threshold}/g, String(threshold))
      .replace(/{threshold_pct}/g, `${(threshold * 100).toFixed(1)}%`);
  }

  const actualPct = `${(actual * 100).toFixed(2)}%`;
  const threshPct = `${(threshold * 100).toFixed(1)}%`;

  let msg = template
    .replace(/{actual}/g, String(actual))
    .replace(/{actual_pct}/g, actualPct)
    .replace(/{threshold}/g, String(threshold))
    .replace(/{threshold_pct}/g, threshPct);

  if (thresholdUpper !== null && thresholdUpper !== undefined) {
    msg = msg
      .replace(/{threshold_upper}/g, String(thresholdUpper))
      .replace(/{threshold_upper_pct}/g, `${(thresholdUpper * 100).toFixed(1)}%`);
  }

  return msg;
}

/**
 * Pure evaluation of a numerical value against a comparison operator.
 */
export function compareOperator(
  value: number | null,
  operator: RuleOperator,
  threshold: number,
  thresholdUpper?: number | null,
): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  switch (operator) {
    case ">":
      return value > threshold;
    case ">=":
      return value >= threshold;
    case "<":
      return value < threshold;
    case "<=":
      return value <= threshold;
    case "==":
      return Math.abs(value - threshold) < 0.0001;
    case "!=":
      return Math.abs(value - threshold) >= 0.0001;
    case "OUTSIDE_RANGE": {
      if (thresholdUpper === null || thresholdUpper === undefined) {
        return false;
      }
      return value < threshold || value > thresholdUpper;
    }
    default:
      return false;
  }
}

/**
 * Pure Evaluation of a single configurable Decision Rule against an EsgFeatureSet.
 *
 * Guarantees:
 * - Deterministic output.
 * - Full traceability to input records.
 * - Standard disclaimer attached to every result.
 */
export function evaluateRule(
  rule: DecisionRule,
  features: EsgFeatureSet,
  traceableRecordIds: string[] = [],
): RuleEvaluationResult {
  const rawValue = features[rule.targetFeature];
  const observedValue = typeof rawValue === "number" ? rawValue : null;

  const triggered = compareOperator(
    observedValue,
    rule.operator,
    rule.thresholdValue,
    rule.thresholdUpper,
  );

  const advisoryMessage = triggered
    ? formatAdvisoryMessage(
        rule.advisoryMessageTemplate,
        observedValue,
        rule.thresholdValue,
        rule.thresholdUpper,
      )
    : `Threshold not exceeded (Observed: ${observedValue ?? "None"}, Threshold: ${rule.operator} ${rule.thresholdValue}).`;

  return {
    ruleId: rule.id,
    ruleCode: rule.code,
    ruleVersion: rule.version,
    ruleName: rule.name,
    category: rule.category,
    severity: rule.severity,
    triggered,
    targetFeature: String(rule.targetFeature),
    observedValue,
    thresholdValue: rule.thresholdValue,
    thresholdUpper: rule.thresholdUpper,
    operator: rule.operator,
    advisoryMessage,
    disclaimer: rule.disclaimer || STANDARD_DISCLAIMER,
    traceableRecordIds,
  };
}

/**
 * Pure Evaluation of an entire active rule set against an EsgFeatureSet.
 */
export function evaluateRuleSet(
  rules: DecisionRule[],
  features: EsgFeatureSet,
  traceableRecordIds: string[] = [],
): RuleEvaluationSummary {
  const activeRules = rules.filter((r) => r.status === "ACTIVE");
  const results = activeRules.map((rule) => evaluateRule(rule, features, traceableRecordIds));

  const bySeverity: Record<RuleSeverity, number> = {
    INFO: 0,
    WARNING: 0,
    ACTION_REQUIRED: 0,
    CRITICAL_REVIEW: 0,
  };

  let triggeredCount = 0;
  for (const res of results) {
    if (res.triggered) {
      triggeredCount++;
      bySeverity[res.severity]++;
    }
  }

  return {
    reportingPeriod: features.reportingPeriod,
    orgUnitId: features.orgUnitId,
    orgUnitName: features.orgUnitName,
    rulesEvaluated: activeRules.length,
    triggeredCount,
    bySeverity,
    results,
    evaluatedAt: new Date().toISOString(),
  };
}
