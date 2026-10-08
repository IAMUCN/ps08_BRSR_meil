// BRSR readiness status (UI brief §21, .grill/phase-14-brsr-mapping-decisions.md). Pure, so the rule is
// testable and the same everywhere it is shown.

export type IndicatorStatus = "complete" | "partial" | "missing" | "not_mapped";

export const STATUS_LABEL: Record<IndicatorStatus, string> = {
  complete: "Complete",
  partial: "Partial",
  missing: "Missing evidence",
  not_mapped: "Not mapped",
};

/**
 * Complete when every applicable mapped metric has an approved record in the period, Partial when some do,
 * Missing evidence when none do. Mappings switched off (not applicable) don't count either way.
 */
export function indicatorStatus(
  metrics: { applicable: boolean; approved: number }[],
): IndicatorStatus {
  const counted = metrics.filter((m) => m.applicable);
  if (counted.length === 0) return "not_mapped";
  const covered = counted.filter((m) => m.approved > 0).length;
  if (covered === counted.length) return "complete";
  return covered > 0 ? "partial" : "missing";
}
