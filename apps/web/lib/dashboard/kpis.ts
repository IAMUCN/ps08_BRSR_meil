// Control Tower arithmetic (UI brief §13.1, Master Approach §34; .grill/phase-16-control-tower-decisions.md).
// Pure, so every card's rule is testable and identical wherever it is shown.

/** A KPI as a fraction; `value` is null when there is nothing to measure (shown "—", never 0 % or 100 %). */
export type Fraction = { numerator: number; denominator: number; value: number | null };

export const fraction = (numerator: number, denominator: number): Fraction => ({
  numerator,
  denominator,
  value: denominator === 0 ? null : (numerator / denominator) * 100,
});

export const READINESS_COMPONENTS = [
  { key: "submission", label: "Submission completion" },
  { key: "evidence", label: "Evidence coverage" },
  { key: "validation", label: "Validation completion" },
  { key: "approval", label: "Approval completion" },
  { key: "indicators", label: "BRSR indicators complete" },
] as const;
export type ReadinessKey = (typeof READINESS_COMPONENTS)[number]["key"];

export type Readiness = {
  value: number | null;
  components: { key: ReadinessKey; label: string; value: number | null; weight: number }[];
};

/**
 * BRSR Readiness %: the weighted average of the components that can be measured. A component with no
 * denominator is left out (and shown as such) rather than counted as 0 or 100; if none can be measured the
 * score is null. Negative or missing weights count as 0.
 */
export function readiness(
  values: Record<ReadinessKey, number | null>,
  weights: Partial<Record<ReadinessKey, number>>,
): Readiness {
  const components = READINESS_COMPONENTS.map((c) => ({
    key: c.key,
    label: c.label,
    value: values[c.key],
    weight: Math.max(0, Number(weights[c.key] ?? 0) || 0),
  }));
  const measured = components.filter((c) => c.value !== null && c.weight > 0);
  const total = measured.reduce((n, c) => n + c.weight, 0);
  return {
    value: total === 0 ? null : measured.reduce((n, c) => n + c.value! * c.weight, 0) / total,
    components,
  };
}
