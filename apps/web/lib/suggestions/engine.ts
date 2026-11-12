import { z } from "zod";
import type { EsgFeatureSet } from "../features/engine";
import type { RuleEvaluationResult } from "../rules/engine";

export const suggestionCategoryEnum = z.enum([
  "RENEWABLE_POWER",
  "ENERGY_EFFICIENCY",
  "FLEET_AND_FUELS",
  "PROCESS_AND_MATERIALS",
  "WATER_CONSERVATION",
  "CIRCULAR_WASTE",
  "GOVERNANCE_DATA_QUALITY",
]);
export type SuggestionCategory = z.infer<typeof suggestionCategoryEnum>;

export const suggestionPriorityEnum = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
export type SuggestionPriority = z.infer<typeof suggestionPriorityEnum>;

export const investmentTierEnum = z.enum(["NO_COST", "LOW_OPEX", "MODERATE_CAPEX", "MAJOR_CAPEX"]);
export type InvestmentTier = z.infer<typeof investmentTierEnum>;

export const paybackHorizonEnum = z.enum(["IMMEDIATE", "SHORT_TERM", "MEDIUM_TERM", "LONG_TERM"]);
export type PaybackHorizon = z.infer<typeof paybackHorizonEnum>;

export type DecarbonizationSuggestion = {
  dbId?: string;
  id: string;
  title: string;
  summary: string;
  category: SuggestionCategory;
  priority: SuggestionPriority;
  triggeredByRuleCode: string | null;
  targetFeature: string;
  observedValue: number | null;
  thresholdValue: number | null;
  potentialEmissionSavingsTco2e: number;
  potentialPercentageReduction: number;
  investmentTier: InvestmentTier;
  estimatedPaybackYears: number | null;
  carbonAdjustedPaybackYears: number | null;
  paybackHorizon: PaybackHorizon;
  actionSteps: string[];
  technicalPrerequisites: string[];
  regulatoryDisclaimer: string;
  status?: "OPEN" | "IN_REVIEW" | "ACCEPTED" | "IMPLEMENTED" | "DISMISSED";
};

export type StrategicRoadmap = {
  reportingPeriod: string;
  orgUnitId?: string;
  orgUnitName?: string;
  totalPotentialReductionTco2e: number;
  overallReductionPotentialPct: number;
  totalSuggestions: number;
  byPriority: Record<SuggestionPriority, number>;
  byCategory: Record<SuggestionCategory, number>;
  suggestions: DecarbonizationSuggestion[];
  executiveSummary: string;
  aiRationale?: string;
  aiEnriched: boolean;
  generatedAt: string;
};

export const STANDARD_SUGGESTION_DISCLAIMER =
  "This recommendation is generated for operational planning and decarbonization strategy. It does not establish regulatory non-compliance.";

export type SuggestionEngineOptions = {
  shadowPricePerTco2e?: number; // e.g. INR 2000 (~$24/t)
  gridEmissionFactorKgPerKwh?: number; // India CEA baseline grid factor ~0.716 kg CO2/kWh
  dieselEmissionFactorKgPerLitre?: number; // ~2.68 kg CO2/Litre
};

const DEFAULT_OPTIONS: Required<SuggestionEngineOptions> = {
  shadowPricePerTco2e: 2000,
  gridEmissionFactorKgPerKwh: 0.716,
  dieselEmissionFactorKgPerLitre: 2.68,
};

/**
 * Pure Suggestion Engine for TraceESG & MEIL.
 * Translates verified feature metrics and triggered decision rules into actionable,
 * quantified decarbonization and governance initiatives.
 */
export function generateDecarbonizationSuggestions(
  features: EsgFeatureSet,
  ruleResults: RuleEvaluationResult[] = [],
  options: SuggestionEngineOptions = {},
): StrategicRoadmap {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const suggestions: DecarbonizationSuggestion[] = [];
  const triggeredRules = new Map(
    ruleResults.filter((r) => r.triggered).map((r) => [r.ruleCode, r]),
  );

  const totalEmissions = Math.max(0, features.total_emissions);
  const electricityKwh = Math.max(0, features.current_electricity);
  const scope1 = Math.max(0, features.scope1_emissions);
  const scope2 = Math.max(0, features.scope2_emissions);
  const scope3 = Math.max(0, features.scope3_emissions);

  // 1. ELEC_GROWTH_ALERT / High Electricity Demand -> Rooftop Solar & Open Access PPA
  if (triggeredRules.has("ELEC_GROWTH_ALERT") || features.renewable_share < 0.2) {
    const rule = triggeredRules.get("ELEC_GROWTH_ALERT");
    const currentRenewable = features.renewable_share;
    const targetRenewableShift = Math.max(0.2, 0.5 - currentRenewable);
    const kwhToSolar = electricityKwh * targetRenewableShift;
    const tco2eSaved = Number(((kwhToSolar * opts.gridEmissionFactorKgPerKwh) / 1000).toFixed(2));
    const pctReduction =
      totalEmissions > 0 ? Number(((tco2eSaved / totalEmissions) * 100).toFixed(2)) : 0;

    suggestions.push({
      id: "REC-SOLAR-PPA-01",
      title: "Group-Captive Solar PPA & Project Site Rooftop PV",
      summary:
        "Transition captive power demand to Group Captive Solar and off-take through Green Energy Open Access (GEOA) contracts to arrest electricity emissions surge.",
      category: "RENEWABLE_POWER",
      priority: triggeredRules.has("ELEC_GROWTH_ALERT") ? "HIGH" : "MEDIUM",
      triggeredByRuleCode:
        rule?.ruleCode ?? (features.renewable_share < 0.2 ? "LOW_RENEWABLE_SHARE" : null),
      targetFeature: "electricity_growth",
      observedValue: features.electricity_growth,
      thresholdValue: rule ? rule.thresholdValue : 0.1,
      potentialEmissionSavingsTco2e: tco2eSaved,
      potentialPercentageReduction: pctReduction,
      investmentTier: "MODERATE_CAPEX",
      estimatedPaybackYears: 4.2,
      carbonAdjustedPaybackYears: 3.4,
      paybackHorizon: "MEDIUM_TERM",
      actionSteps: [
        "Contract 30-40% of baseload electricity via bilateral Green Energy Open Access (GEOA) solar-wind hybrid.",
        "Install modular bifacial solar PV arrays at permanent casting yards, central workshops, and regional offices.",
        "Enroll eligible captive solar installations under the India Carbon Credit Trading Scheme (CCTS) or I-REC registry.",
      ],
      technicalPrerequisites: [
        "HT power grid interconnection feasibility study.",
        "Sub-station telemetry and bi-directional ABT export/import smart metering.",
      ],
      regulatoryDisclaimer: STANDARD_SUGGESTION_DISCLAIMER,
    });
  }

  // 2. Variable Frequency Drives (VFD) & High-Efficiency IE4 Motors for Heavy Infrastructure Equipment
  if (features.current_electricity > 50_000 || triggeredRules.has("ELEC_GROWTH_ALERT")) {
    const kwhSavings = electricityKwh * 0.12; // 12% energy efficiency improvement through VFDs
    const tco2eSaved = Number(((kwhSavings * opts.gridEmissionFactorKgPerKwh) / 1000).toFixed(2));
    const pctReduction =
      totalEmissions > 0 ? Number(((tco2eSaved / totalEmissions) * 100).toFixed(2)) : 0;

    suggestions.push({
      id: "REC-VFD-MOTORS-02",
      title: "IE4 Super-Premium Motors & VFD Automation on Heavy Pumping Stations",
      summary:
        "Retrofit Variable Frequency Drives (VFDs) and high-efficiency IE4 motors on high-duty intake water pumps, compressors, and ventilation blowers.",
      category: "ENERGY_EFFICIENCY",
      priority: "MEDIUM",
      triggeredByRuleCode: triggeredRules.has("ELEC_GROWTH_ALERT") ? "ELEC_GROWTH_ALERT" : null,
      targetFeature: "current_electricity",
      observedValue: features.current_electricity,
      thresholdValue: 50_000,
      potentialEmissionSavingsTco2e: tco2eSaved,
      potentialPercentageReduction: pctReduction,
      investmentTier: "LOW_OPEX",
      estimatedPaybackYears: 2.1,
      carbonAdjustedPaybackYears: 1.7,
      paybackHorizon: "SHORT_TERM",
      actionSteps: [
        "Conduct harmonic distortion and load-profile audit on high-capacity electric motors (>30 kW).",
        "Install variable frequency drives with automated pressure-demand sequencing on water pump lines.",
        "Schedule predictive motor bearing maintenance to eliminate mechanical friction losses.",
      ],
      technicalPrerequisites: [
        "Harmonic filters compliant with IEEE 519 standards.",
        "PLC control panel integration for dynamic throttling.",
      ],
      regulatoryDisclaimer: STANDARD_SUGGESTION_DISCLAIMER,
    });
  }

  // 3. SCOPE1_DOMINANCE / Diesel Generator Idling -> Hybrid BESS Microgrid & Biofuel
  if (triggeredRules.has("SCOPE1_DOMINANCE") || features.scope1_contribution > 0.35) {
    const rule = triggeredRules.get("SCOPE1_DOMINANCE");
    const targetScope1Cut = scope1 * 0.28; // 28% reduction via hybrid battery energy storage & idle shutoff
    const tco2eSaved = Number(targetScope1Cut.toFixed(2));
    const pctReduction =
      totalEmissions > 0 ? Number(((tco2eSaved / totalEmissions) * 100).toFixed(2)) : 0;

    suggestions.push({
      id: "REC-BESS-DG-03",
      title: "Mobile Battery Energy Storage (BESS) & Smart DG Hybrid Microgrids",
      summary:
        "Eliminate low-load diesel generator idling across remote construction sites and tunneling operations using mobile lithium-iron-phosphate (LFP) BESS trailers.",
      category: "FLEET_AND_FUELS",
      priority: "CRITICAL",
      triggeredByRuleCode: rule?.ruleCode ?? "SCOPE1_DOMINANCE",
      targetFeature: "scope1_contribution",
      observedValue: features.scope1_contribution,
      thresholdValue: rule ? rule.thresholdValue : 0.4,
      potentialEmissionSavingsTco2e: tco2eSaved,
      potentialPercentageReduction: pctReduction,
      investmentTier: "MODERATE_CAPEX",
      estimatedPaybackYears: 2.8,
      carbonAdjustedPaybackYears: 2.2,
      paybackHorizon: "SHORT_TERM",
      actionSteps: [
        "Deploy 100 kWh - 250 kWh mobile BESS units paired with existing DG sets to handle intermittent load peaks.",
        "Enforce automated 5-minute engine idle shutoff protocols via CAN-bus IoT telematics on excavators and dumpers.",
        "Pilot B20 biodiesel blends certified under IS 15607 for stationary generators.",
      ],
      technicalPrerequisites: [
        "Generator synchronization panel with automatic start-stop controller.",
        "Telematics gateway on site assets with GPS & fuel flow meter sensors.",
      ],
      regulatoryDisclaimer: STANDARD_SUGGESTION_DISCLAIMER,
    });
  }

  // 4. Heavy Fleet & Transit Bus Electrification (MEIL / Olectra Synergy)
  if (scope1 > 100 || features.has_headcount_data) {
    const fleetCut = scope1 * 0.15;
    const tco2eSaved = Number(fleetCut.toFixed(2));
    const pctReduction =
      totalEmissions > 0 ? Number(((tco2eSaved / totalEmissions) * 100).toFixed(2)) : 0;

    suggestions.push({
      id: "REC-EV-FLEET-04",
      title: "Electric Crew Shuttles & Commercial Fleet Route Optimization",
      summary:
        "Convert site personnel transit shuttles to pure electric buses leveraging MEIL/Olectra Greentech EV platforms with centralized smart fast-charging depots.",
      category: "FLEET_AND_FUELS",
      priority: "MEDIUM",
      triggeredByRuleCode: null,
      targetFeature: "scope1_emissions",
      observedValue: features.scope1_emissions,
      thresholdValue: 100,
      potentialEmissionSavingsTco2e: tco2eSaved,
      potentialPercentageReduction: pctReduction,
      investmentTier: "MODERATE_CAPEX",
      estimatedPaybackYears: 3.5,
      carbonAdjustedPaybackYears: 2.9,
      paybackHorizon: "MEDIUM_TERM",
      actionSteps: [
        "Replace leased diesel staff buses with 9m/12m electric buses at major EPC cluster sites.",
        "Install 120 kW dual-gun DC fast chargers powered by captive solar at central transit hubs.",
        "Integrate dynamic AI route optimization to minimize empty return transit kilometres.",
      ],
      technicalPrerequisites: [
        "Dedicated transformer allocation for EV charging infrastructure.",
        "Fleet telematics dashboard tracking state of charge (SoC) and energy efficiency (kWh/km).",
      ],
      regulatoryDisclaimer: STANDARD_SUGGESTION_DISCLAIMER,
    });
  }

  // 5. SCOPE3_DOMINANCE / Supply Chain Intensity -> Low-Carbon Steel & Blended SCM Cement
  if (triggeredRules.has("SCOPE3_DOMINANCE") || features.scope3_contribution > 0.55) {
    const rule = triggeredRules.get("SCOPE3_DOMINANCE");
    const targetScope3Cut = scope3 * 0.22; // 22% reduction through GGBS/Fly Ash concrete & scrap EAF steel
    const tco2eSaved = Number(targetScope3Cut.toFixed(2));
    const pctReduction =
      totalEmissions > 0 ? Number(((tco2eSaved / totalEmissions) * 100).toFixed(2)) : 0;

    suggestions.push({
      id: "REC-GREEN-PROCURE-05",
      title: "Low-Carbon Supplementary Cementitious Materials (SCM) & Recycled Steel",
      summary:
        "Mandate minimum 35% Fly Ash / Ground Granulated Blast-furnace Slag (GGBS) cement blends in non-critical structural mixes and mandate green steel sourcing.",
      category: "PROCESS_AND_MATERIALS",
      priority: "CRITICAL",
      triggeredByRuleCode: rule?.ruleCode ?? "SCOPE3_DOMINANCE",
      targetFeature: "scope3_contribution",
      observedValue: features.scope3_contribution,
      thresholdValue: rule ? rule.thresholdValue : 0.6,
      potentialEmissionSavingsTco2e: tco2eSaved,
      potentialPercentageReduction: pctReduction,
      investmentTier: "LOW_OPEX",
      estimatedPaybackYears: 1.2,
      carbonAdjustedPaybackYears: 0.9,
      paybackHorizon: "IMMEDIATE",
      actionSteps: [
        "Update project Bill of Quantities (BOQ) specifications to allow Portland Pozzolana Cement (PPC) and PSC.",
        "Require Tier-1 rebar and structural steel suppliers to furnish Environmental Product Declarations (EPDs).",
        "Establish local aggregate quarries within a 35 km radius to slash Scope 3 Category 4 upstream freight emissions.",
      ],
      technicalPrerequisites: [
        "Third-party mix design trials proving 28-day and 56-day compressive strength standards under IS 456.",
        "Supplier ESG disclosure portal integrated into vendor onboarding.",
      ],
      regulatoryDisclaimer: STANDARD_SUGGESTION_DISCLAIMER,
    });
  }

  // 6. WATER_CONSUMPTION_SURGE / Low Water Recycling -> Zero Liquid Discharge (ZLD)
  if (
    triggeredRules.has("WATER_CONSUMPTION_SURGE") ||
    features.water_recycle_rate < 0.25 ||
    (features.water_consumption_growth !== null && features.water_consumption_growth > 0.15)
  ) {
    const rule = triggeredRules.get("WATER_CONSUMPTION_SURGE");
    const waterKl = Math.max(0, features.current_water_consumption);
    const targetRecycledKl = waterKl * 0.45; // 45% recycling

    suggestions.push({
      id: "REC-WATER-ZLD-06",
      title: "Modular Sewage/Effluent Treatment Plant (STP/ETP) & Closed-Loop Curing",
      summary:
        "Install modular automated wastewater treatment systems to recycle batching plant washout and site run-off for dust suppression and concrete curing.",
      category: "WATER_CONSERVATION",
      priority: triggeredRules.has("WATER_CONSUMPTION_SURGE") ? "HIGH" : "MEDIUM",
      triggeredByRuleCode: rule?.ruleCode ?? "WATER_RECYCLE_LOW",
      targetFeature: "water_consumption_growth",
      observedValue: features.water_consumption_growth,
      thresholdValue: rule ? rule.thresholdValue : 0.15,
      potentialEmissionSavingsTco2e: Number((targetRecycledKl * 0.0003).toFixed(2)), // Auxiliary pumping energy offset
      potentialPercentageReduction: 0.8,
      investmentTier: "MODERATE_CAPEX",
      estimatedPaybackYears: 3.1,
      carbonAdjustedPaybackYears: 2.7,
      paybackHorizon: "MEDIUM_TERM",
      actionSteps: [
        "Deploy modular containerized Moving Bed Biofilm Reactor (MBBR) STPs at worker accommodation colonies.",
        "Construct sedimentation basins and oil-water separators at equipment washing bays.",
        "Implement closed-loop water recirculation on hydrostatic pipeline pressure testing spreads.",
      ],
      technicalPrerequisites: [
        "Treated effluent quality sensors measuring BOD, COD, and TSS to meet CPCB surface discharge standards.",
        "IoT electromagnetic flow meters on all discharge recirculation loops.",
      ],
      regulatoryDisclaimer: STANDARD_SUGGESTION_DISCLAIMER,
    });
  }

  // 7. WASTE_RECOVERY_DEFICIT / Low Waste Recovery -> C&D Waste Crushing & Co-processing
  if (
    triggeredRules.has("WASTE_RECOVERY_DEFICIT") ||
    features.waste_recovery_share < 0.5 ||
    (features.waste_growth !== null && features.waste_growth > 0.15)
  ) {
    const rule = triggeredRules.get("WASTE_RECOVERY_DEFICIT");
    const wasteTonnes = Math.max(0, features.current_waste_generated);
    const targetRecovered = wasteTonnes * 0.4;

    suggestions.push({
      id: "REC-WASTE-CIRCULAR-07",
      title: "On-Site C&D Crushing for Granular Sub-Base (GSB) & Refuse-Derived Fuel Co-Processing",
      summary:
        "Segregate inert construction & demolition concrete waste for on-site crushing into sub-base road aggregate, and channel combustible scraps into cement kiln co-processing.",
      category: "CIRCULAR_WASTE",
      priority: triggeredRules.has("WASTE_RECOVERY_DEFICIT") ? "HIGH" : "MEDIUM",
      triggeredByRuleCode: rule?.ruleCode ?? "WASTE_RECOVERY_DEFICIT",
      targetFeature: "waste_recovery_share",
      observedValue: features.waste_recovery_share,
      thresholdValue: rule ? rule.thresholdValue : 0.5,
      potentialEmissionSavingsTco2e: Number((targetRecovered * 0.045).toFixed(2)),
      potentialPercentageReduction: 1.2,
      investmentTier: "LOW_OPEX",
      estimatedPaybackYears: 1.5,
      carbonAdjustedPaybackYears: 1.2,
      paybackHorizon: "SHORT_TERM",
      actionSteps: [
        "Mobilize mobile jaw crushers to convert broken test cubes and structural demolition into IS 383 compliant GSB material.",
        "Partner with regional cement plants for co-processing non-recyclable combustible timber, packaging, and PPE as RDF.",
        "Track waste consignment manifests digitally to ensure 100% auditable cradle-to-grave traceability under C&D Waste Rules.",
      ],
      technicalPrerequisites: [
        "Designated paved segregation yard with multi-bin segregation bays.",
        "MoEFCC/State Pollution Control Board authorized recycler tie-ups for hazardous oils and e-waste.",
      ],
      regulatoryDisclaimer: STANDARD_SUGGESTION_DISCLAIMER,
    });
  }

  // 8. DATA_QUALITY_AUDIT_RISK / Missing Evidence -> Digital Assurance Lock & OCR Gateways
  if (
    triggeredRules.has("DATA_QUALITY_AUDIT_RISK") ||
    features.data_quality_score < 70 ||
    features.missing_evidence_count > 0
  ) {
    const rule = triggeredRules.get("DATA_QUALITY_AUDIT_RISK");

    suggestions.push({
      id: "REC-DATA-QUALITY-08",
      title: "Automated OCR Verification Gate & Dual-Custody Approval Lock",
      summary:
        "Strengthen BRSR Core reasonable assurance readiness by enforcing mandatory OCR-backed utility bill verification and blocking unverified record consolidation.",
      category: "GOVERNANCE_DATA_QUALITY",
      priority: "CRITICAL",
      triggeredByRuleCode: rule?.ruleCode ?? "DATA_QUALITY_AUDIT_RISK",
      targetFeature: "data_quality_score",
      observedValue: features.data_quality_score,
      thresholdValue: rule ? rule.thresholdValue : 70,
      potentialEmissionSavingsTco2e: 0,
      potentialPercentageReduction: 0,
      investmentTier: "NO_COST",
      estimatedPaybackYears: null,
      carbonAdjustedPaybackYears: null,
      paybackHorizon: "IMMEDIATE",
      actionSteps: [
        "Enforce pre-consolidation validation block: reject records lacking cryptographic document proof.",
        "Integrate automated API feeds directly from DISCOM electrical billing portals to bypass manual voucher entry.",
        "Conduct quarterly internal limited-assurance mock audits with certified ESG assurance practitioners.",
      ],
      technicalPrerequisites: [
        "TraceESG OCR pipeline enabled with minimum 80% machine confidence threshold.",
        "Role-based permission separation between Site EHS Uploaders and Corporate ESG Approvers.",
      ],
      regulatoryDisclaimer: STANDARD_SUGGESTION_DISCLAIMER,
    });
  }

  // Aggregations
  const totalPotentialReductionTco2e = Number(
    suggestions.reduce((sum, s) => sum + s.potentialEmissionSavingsTco2e, 0).toFixed(2),
  );
  const overallReductionPotentialPct =
    totalEmissions > 0
      ? Number(Math.min(100, (totalPotentialReductionTco2e / totalEmissions) * 100).toFixed(2))
      : 0;

  const byPriority: Record<SuggestionPriority, number> = {
    CRITICAL: suggestions.filter((s) => s.priority === "CRITICAL").length,
    HIGH: suggestions.filter((s) => s.priority === "HIGH").length,
    MEDIUM: suggestions.filter((s) => s.priority === "MEDIUM").length,
    LOW: suggestions.filter((s) => s.priority === "LOW").length,
  };

  const byCategory: Record<SuggestionCategory, number> = {
    RENEWABLE_POWER: suggestions.filter((s) => s.category === "RENEWABLE_POWER").length,
    ENERGY_EFFICIENCY: suggestions.filter((s) => s.category === "ENERGY_EFFICIENCY").length,
    FLEET_AND_FUELS: suggestions.filter((s) => s.category === "FLEET_AND_FUELS").length,
    PROCESS_AND_MATERIALS: suggestions.filter((s) => s.category === "PROCESS_AND_MATERIALS").length,
    WATER_CONSERVATION: suggestions.filter((s) => s.category === "WATER_CONSERVATION").length,
    CIRCULAR_WASTE: suggestions.filter((s) => s.category === "CIRCULAR_WASTE").length,
    GOVERNANCE_DATA_QUALITY: suggestions.filter((s) => s.category === "GOVERNANCE_DATA_QUALITY")
      .length,
  };

  // Deterministic Executive Summary
  const executiveSummary = [
    `Decarbonization & Operational Roadmap for ${features.reportingPeriod} (${features.orgUnitName ?? "Consolidated Group"}):`,
    `Evaluated ${suggestions.length} strategic initiatives identifying ${totalPotentialReductionTco2e.toLocaleString()} tCO2e in potential emission reductions (${overallReductionPotentialPct}% of current verified emissions).`,
    byPriority.CRITICAL > 0
      ? `Identified ${byPriority.CRITICAL} CRITICAL action items requiring immediate executive committee mobilization, focusing on Scope 1/3 abatement and assurance data governance.`
      : `All operational metrics remain within stable boundaries; identified ${suggestions.length} high-efficiency optimization measures.`,
    `Standard Disclaimer: ${STANDARD_SUGGESTION_DISCLAIMER}`,
  ].join(" ");

  return {
    reportingPeriod: features.reportingPeriod,
    orgUnitId: features.orgUnitId,
    orgUnitName: features.orgUnitName,
    totalPotentialReductionTco2e,
    overallReductionPotentialPct,
    totalSuggestions: suggestions.length,
    byPriority,
    byCategory,
    suggestions,
    executiveSummary,
    aiEnriched: false,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Enriches the strategic roadmap with contextual reasoning from the configured LLM (e.g., Groq / NIM).
 * Does not alter numerical features or reduction calculations; strictly synthesizes engineering rationale.
 */
export async function enrichRoadmapWithAi(
  roadmap: StrategicRoadmap,
  features: EsgFeatureSet,
  callModel: (
    messages: { role: "system" | "user"; content: string }[],
    signal: AbortSignal,
    allowTools: boolean,
  ) => Promise<{ content: string | null; model: string }>,
  signal: AbortSignal,
): Promise<StrategicRoadmap> {
  try {
    const systemPrompt = `You are an expert Chief Sustainability Officer and Senior Industrial Engineer advising Mega Engineering and Infrastructure Limited (MEIL) on SEBI BRSR compliance and Net-Zero decarbonization.
Strict Rules:
1. Do not invent, recalculate, or alter any numerical figures. Use the exact numbers provided in the input feature and roadmap summary.
2. Provide a rigorous, board-level strategic narrative highlighting:
   - Near-term quick wins (CapEx neutral or rapid payback)
   - Capital expenditure initiatives (BESS, Solar PPA, Fleet electrification)
   - Scope 3 supply-chain engagement for low-carbon steel and cement
   - Internal Carbon Price (ICP) justification
3. Keep the tone analytical, decisive, and auditable. Conclude with the mandatory disclaimer: "${STANDARD_SUGGESTION_DISCLAIMER}".`;

    const userPrompt = `Review the following verified ESG feature set and generated decarbonization roadmap:

Reporting Period: ${features.reportingPeriod}
Organization Unit: ${features.orgUnitName ?? "Consolidated Group"}
Current Verified Scope 1: ${features.scope1_emissions} tCO2e (${(features.scope1_contribution * 100).toFixed(1)}%)
Current Verified Scope 2: ${features.scope2_emissions} tCO2e (${(features.scope2_contribution * 100).toFixed(1)}%)
Current Verified Scope 3: ${features.scope3_emissions} tCO2e (${(features.scope3_contribution * 100).toFixed(1)}%)
Total Verified Emissions: ${features.total_emissions} tCO2e
Electricity Growth: ${features.electricity_growth !== null ? (features.electricity_growth * 100).toFixed(2) + "%" : "N/A"}
Renewable Energy Share: ${(features.renewable_share * 100).toFixed(2)}%
Data Quality Assurance Score: ${features.data_quality_score}/100

Generated Initiatives (${roadmap.suggestions.length} total, potential cut of ${roadmap.totalPotentialReductionTco2e} tCO2e):
${roadmap.suggestions
  .map(
    (s, idx) =>
      `${idx + 1}. [${s.priority}] ${s.title} (${s.category}): Potential cut of ${s.potentialEmissionSavingsTco2e} tCO2e. Tier: ${s.investmentTier}. Payback: ${s.estimatedPaybackYears ?? "Immediate"} yrs.`,
  )
  .join("\n")}

Please provide an executive strategic summary and implementation guidance for the MEIL ESG board.`;

    const reply = await callModel(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      signal,
      false,
    );

    if (reply.content && reply.content.trim().length > 0) {
      return {
        ...roadmap,
        aiRationale: reply.content.trim(),
        aiEnriched: true,
      };
    }
  } catch (err) {
    // Graceful fallback to deterministic summary
  }

  return roadmap;
}
