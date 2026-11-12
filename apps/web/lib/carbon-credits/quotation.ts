/**
 * Carbon Equivalent & Credit Purchase Estimator Engine
 * Calculates the exact carbon credits required to purchase based strictly on
 * operational emissions data (1 Carbon Credit = 1 tCO2e carbon equivalent).
 */

export type ScopeEmissions = {
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
};

export type OffsetShortfall = {
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
  hasEmissions: boolean;
};

export type CreditProcurementPlan = {
  targetCreditsToBuy: number;
  scopeBreakdown: {
    scope1: number;
    scope2: number;
    scope3: number;
  };
  currentGrossEmissionsTco2e: number;
  currentOffsetsRetiredTco2e: number;
  currentNetEmissionsTco2e: number;
  projectedNetEmissionsTco2e: number;
  offsetPercentage: number;
  isNetZeroAchieved: boolean;
};

export type ProcurementBrief = {
  planId: string;
  createdAt: string;
  orgUnitName: string;
  orgUnitCode: string;
  reportingPeriod: string;
  grossEmissionsTco2e: number;
  existingOffsetsTco2e: number;
  unmitigatedNetEmissionsTco2e: number;
  creditsToPurchase: number;
  scopeAllocation: {
    scope1: number;
    scope2: number;
    scope3: number;
  };
  postProcurementResidualTco2e: number;
  complianceStandard: string;
};

/**
 * Calculates remaining carbon credit deficit across Scope 1, Scope 2, Scope 3, and Total.
 * 1 Carbon Credit = 1 tCO2e.
 */
export function calculateOffsetShortfall(
  gross: ScopeEmissions,
  offsets: ScopeEmissions,
): OffsetShortfall {
  const scope1 = Math.max(0, gross.scope1 - offsets.scope1);
  const scope2 = Math.max(0, gross.scope2 - offsets.scope2);
  const scope3 = Math.max(0, gross.scope3 - offsets.scope3);
  const total = Math.max(0, gross.total - offsets.total);
  return {
    scope1,
    scope2,
    scope3,
    total,
    hasEmissions: gross.total > 0,
  };
}

/**
 * Calculates credit procurement plan allocating target credits across scopes
 * and calculating projected post-offset residual emissions.
 */
export function calculateCreditProcurementPlan(
  targetCreditsToBuy: number,
  gross: ScopeEmissions,
  offsets: ScopeEmissions,
  scopeFilter: "ALL" | "SCOPE_1" | "SCOPE_2" | "SCOPE_3" = "ALL",
): CreditProcurementPlan {
  const shortfall = calculateOffsetShortfall(gross, offsets);
  const safeCredits = Math.max(0, targetCreditsToBuy);

  let scope1Allocated = 0;
  let scope2Allocated = 0;
  let scope3Allocated = 0;

  if (scopeFilter === "SCOPE_1") {
    scope1Allocated = Math.min(safeCredits, shortfall.scope1);
  } else if (scopeFilter === "SCOPE_2") {
    scope2Allocated = Math.min(safeCredits, shortfall.scope2);
  } else if (scopeFilter === "SCOPE_3") {
    scope3Allocated = Math.min(safeCredits, shortfall.scope3);
  } else {
    // Allocate proportionally across scopes based on actual shortfall
    const totalShortfall = shortfall.total;
    if (totalShortfall > 0) {
      scope1Allocated = Math.round((shortfall.scope1 / totalShortfall) * safeCredits);
      scope2Allocated = Math.round((shortfall.scope2 / totalShortfall) * safeCredits);
      scope3Allocated = safeCredits - scope1Allocated - scope2Allocated;
    } else {
      scope1Allocated = Math.round(safeCredits / 3);
      scope2Allocated = Math.round(safeCredits / 3);
      scope3Allocated = safeCredits - scope1Allocated - scope2Allocated;
    }
  }

  const projectedNetEmissions = Math.max(0, shortfall.total - safeCredits);
  const offsetPercentage =
    shortfall.total > 0
      ? Math.min(100, Number(((safeCredits / shortfall.total) * 100).toFixed(1)))
      : 100;

  return {
    targetCreditsToBuy: safeCredits,
    scopeBreakdown: {
      scope1: scope1Allocated,
      scope2: scope2Allocated,
      scope3: scope3Allocated,
    },
    currentGrossEmissionsTco2e: gross.total,
    currentOffsetsRetiredTco2e: offsets.total,
    currentNetEmissionsTco2e: shortfall.total,
    projectedNetEmissionsTco2e: projectedNetEmissions,
    offsetPercentage,
    isNetZeroAchieved: projectedNetEmissions === 0,
  };
}

export function generateProcurementBriefDocument(brief: ProcurementBrief): string {
  return `================================================================================
CARBON CREDIT PROCUREMENT PLAN & EMISSION OFFSET SPECIFICATION
Plan ID: ${brief.planId}
Date Generated: ${brief.createdAt}
Organization Unit: ${brief.orgUnitName} (${brief.orgUnitCode})
Reporting Period: ${brief.reportingPeriod}
Conversion Basis: 1 Carbon Credit = 1 tCO2e (Metric Tonne CO2 Equivalent)
Standard: ${brief.complianceStandard}
================================================================================

1. OPERATIONAL EMISSIONS DATA (PLATFORM RECORDS)
--------------------------------------------------------------------------------
Gross Operational Emissions:   ${brief.grossEmissionsTco2e.toLocaleString()} tCO2e
Existing Retired Credits:      ${brief.existingOffsetsTco2e.toLocaleString()} Credits (tCO2e)
--------------------------------------------------------------------------------
Net Unmitigated Shortfall:     ${brief.unmitigatedNetEmissionsTco2e.toLocaleString()} tCO2e

2. REQUIRED CARBON CREDITS TO PURCHASE
--------------------------------------------------------------------------------
Total Credits to Purchase:     ${brief.creditsToPurchase.toLocaleString()} Carbon Credits
- Scope 1 (Direct Fuel/Fleet): ${brief.scopeAllocation.scope1.toLocaleString()} Credits
- Scope 2 (Electricity Grid):  ${brief.scopeAllocation.scope2.toLocaleString()} Credits (RECs / I-RECs)
- Scope 3 (Value Chain):       ${brief.scopeAllocation.scope3.toLocaleString()} Credits

3. PROJECTED POST-OFFSET CARBON POSITION
--------------------------------------------------------------------------------
Baseline Gross Emissions:      ${brief.grossEmissionsTco2e.toLocaleString()} tCO2e
Total Applied Offsets:         ${(brief.existingOffsetsTco2e + brief.creditsToPurchase).toLocaleString()} tCO2e
Projected Net Emissions:       ${brief.postProcurementResidualTco2e.toLocaleString()} tCO2e
Net Zero Status:               ${brief.postProcurementResidualTco2e === 0 ? "100% Carbon Neutral Achieved" : "Partial Offset Coverage"}

4. AUDIT & SEBI BRSR PRINCIPLE 6 REQUIREMENTS
--------------------------------------------------------------------------------
* Every purchased credit must be issued under an accredited registry standard
  (e.g., Verra VCS, Gold Standard, CCTS India, or I-REC).
* Cancellation/retirement letters must name "${brief.orgUnitName}" as beneficiary.
* Serial number ranges (start to end) must be entered into the TraceESG ledger
  to guarantee anti-double-counting audit verification.

================================================================================
TraceESG Carbon Intelligence · Data-Driven Carbon Credit Procurement Specification
================================================================================`;
}
