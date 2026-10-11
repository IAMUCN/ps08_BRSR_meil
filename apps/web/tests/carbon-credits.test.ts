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
