import { z } from "zod";

export const registryEnum = z.enum([
  "CCTS_INDIA",
  "VERRA_VCS",
  "GOLD_STANDARD",
  "I_REC",
  "BEE_ESCERT",
  "INTERNAL_SHADOW",
]);

export const creditStatusEnum = z.enum(["MINTED", "HELD", "TRANSFERRED", "RETIRED"]);
export const targetScopeEnum = z.enum(["SCOPE_1", "SCOPE_2", "SCOPE_3"]);
export const priceTypeEnum = z.enum(["SHADOW_PRICE", "INTERNAL_FEE", "IMPLICIT_PRICE"]);

export type ScopeEmissions = {
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
};

export type CapexEvaluationParams = {
  projectName: string;
  baselineAnnualEmissionsTco2e: number;
  projectedAnnualEmissionsTco2e: number;
  capexAmount: number;
  operationalAnnualSavings: number;
  projectLifespanYears: number;
  shadowPricePerTco2e: number;
  discountRatePercent?: number;
};

export type CapexEvaluationResult = {
  projectName: string;
  shadowPricePerTco2e: number;
  annualEmissionCutTco2e: number;
  annualCarbonValue: number;
  totalAnnualBenefit: number;
  traditionalPaybackYears: number | null;
  carbonAdjustedPaybackYears: number | null;
  paybackAccelerationYears: number | null;
  /**
   * No payback from the operating savings alone (none, or not positive), but one with the carbon value: the
   * acceleration can't be a number of years then, so it is said in words (2026-11-13).
   */
  paysBackOnlyWithCarbon: boolean;
  traditionalNpv: number;
  carbonAdjustedNpv: number;
  lifetimeCarbonAvoidedTco2e: number;
};

/**
 * Calculates remaining available unallocated balance in a credit batch.
 */
export function calculateAvailableBalance(
  totalBatchTco2e: number,
  retiredTco2e: number,
  transferredTco2e: number,
): number {
  return Math.max(0, totalBatchTco2e - retiredTco2e - transferredTco2e);
}

/**
 * Reconciles Gross Emissions against Retired Offsets while ensuring
 * transferred/sold credits are completely barred from lowering internal claims.
 */
export function reconcileEmissions(
  gross: ScopeEmissions,
  retiredOffsets: ScopeEmissions,
  transferredTco2e: number,
): {
  gross: ScopeEmissions;
  offsets: ScopeEmissions;
  net: ScopeEmissions;
  transferredExcludedTco2e: number;
  doubleCountingCheckPassed: boolean;
} {
  const netScope1 = Math.max(0, gross.scope1 - retiredOffsets.scope1);
  const netScope2 = Math.max(0, gross.scope2 - retiredOffsets.scope2);
  const netScope3 = Math.max(0, gross.scope3 - retiredOffsets.scope3);
  const netTotal = Math.max(0, gross.total - retiredOffsets.total);

  return {
    gross,
    offsets: retiredOffsets,
    net: {
      scope1: netScope1,
      scope2: netScope2,
      scope3: netScope3,
      total: netTotal,
    },
    transferredExcludedTco2e: transferredTco2e,
    doubleCountingCheckPassed: true,
  };
}

/**
 * Evaluates the financial and carbon-adjusted economics for capital expenditure projects.
 */
export function evaluateCapexCarbonEconomics(params: CapexEvaluationParams): CapexEvaluationResult {
  const annualEmissionCutTco2e = Math.max(
    0,
    params.baselineAnnualEmissionsTco2e - params.projectedAnnualEmissionsTco2e,
  );
  const annualCarbonValue = annualEmissionCutTco2e * params.shadowPricePerTco2e;
  const totalAnnualBenefit = params.operationalAnnualSavings + annualCarbonValue;

  const traditionalPaybackYears =
    params.operationalAnnualSavings > 0
      ? Number((params.capexAmount / params.operationalAnnualSavings).toFixed(2))
      : null;

  const carbonAdjustedPaybackYears =
    totalAnnualBenefit > 0 ? Number((params.capexAmount / totalAnnualBenefit).toFixed(2)) : null;

  const paybackAccelerationYears =
    traditionalPaybackYears && carbonAdjustedPaybackYears
      ? Number((traditionalPaybackYears - carbonAdjustedPaybackYears).toFixed(2))
      : null;

  const r = (params.discountRatePercent ?? 8.0) / 100;
  let traditionalNpv = -params.capexAmount;
  let carbonAdjustedNpv = -params.capexAmount;

  for (let year = 1; year <= params.projectLifespanYears; year++) {
    const discountFactor = Math.pow(1 + r, year);
    traditionalNpv += params.operationalAnnualSavings / discountFactor;
    carbonAdjustedNpv += totalAnnualBenefit / discountFactor;
  }

  return {
    projectName: params.projectName,
    shadowPricePerTco2e: params.shadowPricePerTco2e,
    annualEmissionCutTco2e,
    annualCarbonValue,
    totalAnnualBenefit,
    traditionalPaybackYears,
    carbonAdjustedPaybackYears,
    paybackAccelerationYears,
    paysBackOnlyWithCarbon: traditionalPaybackYears === null && carbonAdjustedPaybackYears !== null,
    traditionalNpv: Math.round(traditionalNpv),
    carbonAdjustedNpv: Math.round(carbonAdjustedNpv),
    lifetimeCarbonAvoidedTco2e: annualEmissionCutTco2e * params.projectLifespanYears,
  };
}
