/**
 * Carbon Quotation & Offset Procurement Estimator Engine
 * Calculates offset shortfall from live gross/net emissions, estimates procurement costs
 * across major registries (Verra, CarbonTradeLabs, Gold Standard, CCTS India, I-REC),
 * and generates formal SEBI BRSR Core RFQ procurement specifications.
 */

export type QuotationProvider = {
  id: string;
  name: string;
  registryType: "VERRA_VCS" | "GOLD_STANDARD" | "CCTS_INDIA" | "CARBONTRADELABS" | "I_REC";
  category: string;
  indicativePriceInr: number;
  priceRangeInr: { min: number; max: number };
  indicativePriceUsd: number;
  priceRangeUsd: { min: number; max: number };
  status: string;
  recommendedVintage: string;
  directRegistryUrl: string;
  description: string;
};

export type OffsetShortfall = {
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
  hasEmissions: boolean;
};

export type QuotationResult = {
  provider: QuotationProvider;
  targetVolumeTco2e: number;
  unitPriceInr: number;
  unitPriceUsd: number;
  estimatedTotalInr: number;
  estimatedTotalUsd: number;
  minTotalInr: number;
  maxTotalInr: number;
  minTotalUsd: number;
  maxTotalUsd: number;
  remainingNetEmissionsTco2e: number;
  offsetPercentage: number;
  sebiBrsrEligibility: boolean;
};

export type RfqSpecification = {
  rfqNumber: string;
  createdAt: string;
  orgUnitName: string;
  orgUnitCode: string;
  reportingPeriod: string;
  targetVolumeTco2e: number;
  scopeBreakdown: {
    scope1: number;
    scope2: number;
    scope3: number;
  };
  preferredRegistries: string[];
  vintageWindow: string;
  additionalityClause: string;
  antiDoubleCountingClause: string;
  estimatedBudgetInr: string;
  estimatedBudgetUsd: string;
};

export const QUOTATION_PROVIDERS: QuotationProvider[] = [
  {
    id: "verra_vcs",
    name: "Verra VCS (Verified Carbon Standard)",
    registryType: "VERRA_VCS",
    category: "Nature-based (REDD+, Afforestation) & Tech Removal",
    indicativePriceInr: 920,
    priceRangeInr: { min: 750, max: 1250 },
    indicativePriceUsd: 11.0,
    priceRangeUsd: { min: 9.0, max: 15.0 },
    status: "Global Benchmark Voluntary Registry",
    recommendedVintage: "2022–2025 (SEBI Core audit requires vintage ≤ 3 years)",
    directRegistryUrl: "https://registry.verra.org/app/search/VCS",
    description:
      "World's leading voluntary greenhouse gas crediting program for verified carbon units (VCUs).",
  },
  {
    id: "carbontradelabs",
    name: "CarbonTradeLabs / CTX Spot Exchange",
    registryType: "CARBONTRADELABS",
    category: "Spot Electronic Exchange Traded Voluntary Offsets & Biochar",
    indicativePriceInr: 880,
    priceRangeInr: { min: 680, max: 1300 },
    indicativePriceUsd: 10.5,
    priceRangeUsd: { min: 8.0, max: 15.5 },
    status: "Instant Spot Settlement Exchange",
    recommendedVintage: "2022–2025",
    directRegistryUrl: "https://carbontradelabs.com/",
    description:
      "Live digital spot marketplace for wholesale carbon credit trades and direct electronic registry settlement.",
  },
  {
    id: "gold_standard",
    name: "Gold Standard for the Global Goals (GS-VER)",
    registryType: "GOLD_STANDARD",
    category: "Clean Cooking, Safe Water & High-SDG Community Forestry",
    indicativePriceInr: 1520,
    priceRangeInr: { min: 1250, max: 2100 },
    indicativePriceUsd: 18.0,
    priceRangeUsd: { min: 15.0, max: 25.0 },
    status: "Premium High-Integrity Standard",
    recommendedVintage: "2022–2025",
    directRegistryUrl: "https://registry.goldstandard.org/credit-blocks",
    description:
      "WWF-endorsed international standard ensuring quantified Sustainable Development Goal (SDG) co-benefits.",
  },
  {
    id: "ccts_india",
    name: "Indian Carbon Credit Trading Scheme (BEE / CCTS)",
    registryType: "CCTS_INDIA",
    category: "Domestic Indian Compliance Carbon Credit Certificates (CCCs)",
    indicativePriceInr: 1850,
    priceRangeInr: { min: 1500, max: 2400 },
    indicativePriceUsd: 22.0,
    priceRangeUsd: { min: 18.0, max: 28.5 },
    status: "Indian Statutory Market Scheme",
    recommendedVintage: "2023–2025 (Energy Conservation Act compliance)",
    directRegistryUrl: "https://indiancarbonmarket.gov.in/",
    description:
      "Administered by Bureau of Energy Efficiency (BEE) and Grid-India under the Ministry of Power for obligated and voluntary Indian buyers.",
  },
  {
    id: "i_rec",
    name: "I-REC Standard / BEE ESCerts (Renewable Attribute)",
    registryType: "I_REC",
    category: "Scope 2 Indirect Electricity Renewable Certificates",
    indicativePriceInr: 280,
    priceRangeInr: { min: 180, max: 420 },
    indicativePriceUsd: 3.3,
    priceRangeUsd: { min: 2.1, max: 5.0 },
    status: "Scope 2 Renewable Attribute Standard",
    recommendedVintage: "2024–2025",
    directRegistryUrl: "https://www.irec.net/",
    description:
      "International tracking standard for contractual renewable electricity claims to neutralize Scope 2 emissions under GHG Protocol Scope 2 Guidance.",
  },
];

/**
 * Calculates remaining offset shortfall (unmitigated emissions to buy)
 * across Scope 1, Scope 2, Scope 3, and Total.
 */
export function calculateOffsetShortfall(
  gross: { scope1: number; scope2: number; scope3: number; total: number },
  offsets: { scope1: number; scope2: number; scope3: number; total: number },
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
 * Calculates carbon credit procurement quotation for a given target volume
 * against a designated provider/registry.
 */
export function calculateQuotation(
  targetVolumeTco2e: number,
  provider: QuotationProvider,
  currentNetEmissionsTco2e: number,
): QuotationResult {
  const safeVolume = Math.max(0, targetVolumeTco2e);
  const estimatedTotalInr = Math.round(safeVolume * provider.indicativePriceInr);
  const estimatedTotalUsd = Math.round(safeVolume * provider.indicativePriceUsd);
  const minTotalInr = Math.round(safeVolume * provider.priceRangeInr.min);
  const maxTotalInr = Math.round(safeVolume * provider.priceRangeInr.max);
  const minTotalUsd = Math.round(safeVolume * provider.priceRangeUsd.min);
  const maxTotalUsd = Math.round(safeVolume * provider.priceRangeUsd.max);

  const remainingNetEmissionsTco2e = Math.max(0, currentNetEmissionsTco2e - safeVolume);
  const offsetPercentage =
    currentNetEmissionsTco2e > 0
      ? Math.min(100, Number(((safeVolume / currentNetEmissionsTco2e) * 100).toFixed(1)))
      : 100;

  return {
    provider,
    targetVolumeTco2e: safeVolume,
    unitPriceInr: provider.indicativePriceInr,
    unitPriceUsd: provider.indicativePriceUsd,
    estimatedTotalInr,
    estimatedTotalUsd,
    minTotalInr,
    maxTotalInr,
    minTotalUsd,
    maxTotalUsd,
    remainingNetEmissionsTco2e,
    offsetPercentage,
    sebiBrsrEligibility: true,
  };
}

export function formatInrLakhs(amountInr: number): string {
  if (amountInr >= 10000000) {
    return `₹${(amountInr / 10000000).toFixed(2)} Cr`;
  }
  if (amountInr >= 100000) {
    return `₹${(amountInr / 100000).toFixed(2)} Lakhs`;
  }
  return `₹${amountInr.toLocaleString("en-IN")}`;
}

export function formatUsdThousands(amountUsd: number): string {
  if (amountUsd >= 1000000) {
    return `$${(amountUsd / 1000000).toFixed(2)}M`;
  }
  if (amountUsd >= 1000) {
    return `$${(amountUsd / 1000).toFixed(1)}k`;
  }
  return `$${amountUsd.toLocaleString()}`;
}

export function generateRfqDocument(rfq: RfqSpecification): string {
  return `================================================================================
REQUEST FOR QUOTATION (RFQ) - CARBON CREDIT OFFSET PROCUREMENT
Reference ID: ${rfq.rfqNumber}
Date Generated: ${rfq.createdAt}
Issuing Entity: ${rfq.orgUnitName} (${rfq.orgUnitCode})
Reporting Cycle: ${rfq.reportingPeriod}
Compliance Framework: SEBI BRSR Core Principle 6 / GHG Protocol Standard
================================================================================

1. PROCUREMENT SPECIFICATION & TARGET VOLUMES
--------------------------------------------------------------------------------
Total Target Volume:           ${rfq.targetVolumeTco2e.toLocaleString()} tCO2e
- Scope 1 Direct Emissions:    ${rfq.scopeBreakdown.scope1.toLocaleString()} tCO2e
- Scope 2 Electricity Offsets: ${rfq.scopeBreakdown.scope2.toLocaleString()} tCO2e (RECs / I-RECs accepted)
- Scope 3 Value Chain Offsets: ${rfq.scopeBreakdown.scope3.toLocaleString()} tCO2e

2. APPROVED REGISTRIES & CERTIFICATION BODIES
--------------------------------------------------------------------------------
Accepted Programs:
${rfq.preferredRegistries.map((r) => `  * ${r}`).join("\n")}

Acceptable Vintages:           ${rfq.vintageWindow}
Third-Party Assurance:         Mandatory accredited Designated Operational Entity
                               (DOE) verification report (e.g. TÜV, DNV, Bureau Veritas).

3. CONTRACTUAL COMPLIANCE & WARRANTY REQUIREMENTS
--------------------------------------------------------------------------------
1. ANTI-DOUBLE-COUNTING & SURRENDER WARRANTY:
   ${rfq.antiDoubleCountingClause}

2. SERIAL NUMBER DISCLOSURE:
   Full serial number ranges (SerialNumberStart to SerialNumberEnd) must be
   delivered with registry-issued cancellation/retirement confirmation letters
   citing "${rfq.orgUnitName}" as the sole beneficiary.

3. ADDITIONALITY & PERMANENCE:
   ${rfq.additionalityClause}

4. ESTIMATED BUDGETARY ALLOCATION
--------------------------------------------------------------------------------
Budgetary Estimate (INR):      ${rfq.estimatedBudgetInr}
Budgetary Estimate (USD):      ${rfq.estimatedBudgetUsd}

================================================================================
Generated via TraceESG Carbon Intelligence · Automated Procurement Specification
================================================================================`;
}
