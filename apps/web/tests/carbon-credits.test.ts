import assert from "node:assert/strict";
import { test } from "node:test";
import {
  registryEnum,
  creditStatusEnum,
  targetScopeEnum,
  calculateAvailableBalance,
  reconcileEmissions,
  evaluateCapexCarbonEconomics,
} from "../lib/carbon-credits/engine.ts";

test("Carbon Credit Registry Enums and Schemas", () => {
  // 1. Registry validation
  assert.equal(registryEnum.parse("VERRA_VCS"), "VERRA_VCS");
  assert.equal(registryEnum.parse("CCTS_INDIA"), "CCTS_INDIA");
  assert.equal(registryEnum.parse("GOLD_STANDARD"), "GOLD_STANDARD");
  assert.equal(registryEnum.parse("I_REC"), "I_REC");
  assert.throws(() => registryEnum.parse("INVALID_REGISTRY"));

  // 2. Status validation
  assert.equal(creditStatusEnum.parse("MINTED"), "MINTED");
  assert.equal(creditStatusEnum.parse("RETIRED"), "RETIRED");
  assert.equal(creditStatusEnum.parse("TRANSFERRED"), "TRANSFERRED");
  assert.throws(() => creditStatusEnum.parse("SOLD_OUT"));

  // 3. Target Scope validation
  assert.equal(targetScopeEnum.parse("SCOPE_1"), "SCOPE_1");
  assert.equal(targetScopeEnum.parse("SCOPE_2"), "SCOPE_2");
  assert.equal(targetScopeEnum.parse("SCOPE_3"), "SCOPE_3");
  assert.throws(() => targetScopeEnum.parse("SCOPE_4"));
});

test("Anti-Double-Counting Ledger Balance Logic", () => {
  const totalBatchTco2e = 10000;
  const retired = 3000;
  let transferred = 2000;

  assert.equal(calculateAvailableBalance(totalBatchTco2e, retired, transferred), 5000);

  // Attempting to retire more than available should trigger validation flag
  const remaining = calculateAvailableBalance(totalBatchTco2e, retired, transferred);
  const attemptedRetire = 5500;
  const isOverRetirement = attemptedRetire > remaining;
  assert.equal(isOverRetirement, true);

  // If batch is fully transferred, remaining is zero
  transferred = 7000;
  assert.equal(calculateAvailableBalance(totalBatchTco2e, retired, transferred), 0);
});

test("Double-Counting Prevention Reconciliation (Gross vs Net Math)", () => {
  const grossEmissions = {
    scope1: 4500, // e.g. Diesel + Gas
    scope2: 2500, // e.g. Grid electricity
    scope3: 1200, // e.g. Business travel + Waste
    total: 8200,
  };

  const retiredOffsets = {
    scope1: 1500, // Retired Verra VCS VCU credits for Scope 1
    scope2: 2500, // Retired I-REC / NLDC solar RECs for Scope 2
    scope3: 0,
    total: 4000,
  };

  const transferredCreditsTco2e = 5000; // Sold to external airline

  const reconciliation = reconcileEmissions(
    grossEmissions,
    retiredOffsets,
    transferredCreditsTco2e,
  );

  assert.equal(reconciliation.net.scope1, 3000);
  assert.equal(reconciliation.net.scope2, 0); // 100% net zero Scope 2 via retired RECs
  assert.equal(reconciliation.net.scope3, 1200);
  assert.equal(reconciliation.net.total, 4200);

  // Transferred credits recorded as excluded from claims
  assert.equal(reconciliation.transferredExcludedTco2e, 5000);
  assert.equal(reconciliation.doubleCountingCheckPassed, true);
});

test("Internal Carbon Pricing (ICP) & CapEx Evaluation Model", () => {
  const result = evaluateCapexCarbonEconomics({
    projectName: "Solar Microgrid & Energy Storage at Plant A",
    shadowPricePerTco2e: 2500, // INR
    capexAmount: 5000000, // 50 Lakhs INR
    operationalAnnualSavings: 800000, // 8 Lakhs INR
    baselineAnnualEmissionsTco2e: 600,
    projectedAnnualEmissionsTco2e: 200,
    projectLifespanYears: 10,
    discountRatePercent: 8,
  });

  assert.equal(result.annualEmissionCutTco2e, 400);
  assert.equal(result.annualCarbonValue, 1000000); // 10 Lakhs/year carbon value
  assert.equal(result.totalAnnualBenefit, 1800000); // 18 Lakhs/year total
  assert.equal(result.traditionalPaybackYears, 6.25); // 6.25 years without carbon price
  assert.equal(result.carbonAdjustedPaybackYears, 2.78); // 2.78 years with carbon price
  assert.equal(result.paybackAccelerationYears, 3.47); // Accelerated by 3.47 yrs
  assert.equal(result.lifetimeCarbonAvoidedTco2e, 4000);

  assert.ok(result.traditionalNpv > 0, "Traditional NPV should be positive");
  assert.ok(
    result.carbonAdjustedNpv > result.traditionalNpv,
    "Carbon-adjusted NPV should exceed traditional NPV",
  );
  assert.equal(result.traditionalNpv, 368065);
  assert.equal(result.carbonAdjustedNpv, 7078147);
});

test("Carbon Offset Quotation & Shortfall Procurement Calculations", async () => {
  const {
    calculateOffsetShortfall,
    calculateQuotation,
    QUOTATION_PROVIDERS,
    formatInrLakhs,
    generateRfqDocument,
  } = await import("../lib/carbon-credits/quotation.ts");

  const gross = { scope1: 5000, scope2: 3000, scope3: 2000, total: 10000 };
  const offsets = { scope1: 1000, scope2: 1500, scope3: 0, total: 2500 };

  const shortfall = calculateOffsetShortfall(gross, offsets);
  assert.equal(shortfall.scope1, 4000);
  assert.equal(shortfall.scope2, 1500);
  assert.equal(shortfall.scope3, 2000);
  assert.equal(shortfall.total, 7500);
  assert.equal(shortfall.hasEmissions, true);

  // Verra VCS Quotation
  const verra = QUOTATION_PROVIDERS.find((p) => p.id === "verra_vcs");
  assert.ok(verra, "Verra VCS provider should exist");
  const quote = calculateQuotation(shortfall.total, verra!, shortfall.total);

  assert.equal(quote.targetVolumeTco2e, 7500);
  // 7,500 * 920 = 6,900,000 INR (69 Lakhs)
  assert.equal(quote.estimatedTotalInr, 6900000);
  assert.equal(quote.remainingNetEmissionsTco2e, 0);
  assert.equal(quote.offsetPercentage, 100);
  assert.equal(formatInrLakhs(quote.estimatedTotalInr), "₹69.00 Lakhs");

  // CarbonTradeLabs Spot Exchange Quotation
  const ctx = QUOTATION_PROVIDERS.find((p) => p.id === "carbontradelabs");
  assert.ok(ctx, "CarbonTradeLabs provider should exist");
  const ctxQuote = calculateQuotation(2000, ctx!, shortfall.total);
  assert.equal(ctxQuote.targetVolumeTco2e, 2000);
  assert.equal(ctxQuote.estimatedTotalInr, 1760000);
  assert.equal(ctxQuote.remainingNetEmissionsTco2e, 5500);
  assert.ok(ctxQuote.offsetPercentage > 26 && ctxQuote.offsetPercentage < 27);

  // RFQ Generation
  const rfq = generateRfqDocument({
    rfqNumber: "RFQ-TEST-1234",
    createdAt: "13 Nov 2026",
    orgUnitName: "MEIL Infrastructure",
    orgUnitCode: "MEIL-INFRA",
    reportingPeriod: "FY 2025-26",
    targetVolumeTco2e: 7500,
    scopeBreakdown: { scope1: 4000, scope2: 1500, scope3: 2000 },
    preferredRegistries: ["Verra VCS", "Gold Standard", "CCTS India"],
    vintageWindow: "2022–2025",
    additionalityClause: "Must be certified additional under approved methodology.",
    antiDoubleCountingClause: "Non-double-counting warranty required under Article 6.",
    estimatedBudgetInr: "₹69.00 Lakhs",
    estimatedBudgetUsd: "$82.5k",
  });

  assert.ok(rfq.includes("RFQ-TEST-1234"));
  assert.ok(rfq.includes("7,500 tCO2e"));
  assert.ok(rfq.includes("MEIL Infrastructure"));
  assert.ok(rfq.includes("SEBI BRSR Core"));
});
