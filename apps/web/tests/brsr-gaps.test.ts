// The gaps found against the L&T BRSR (owner's request, 2026-11-13; .grill/brsr-gaps-decisions.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateCapexCarbonEconomics } from "../lib/carbon-credits/engine.ts";
import { pppRevenueMnUsd } from "../lib/reports/inputs.ts";
import { checkHistoryRatio, checkRange, outcomeOf } from "../lib/validation/checks.ts";

test("a zero is accepted and flagged for review; a negative is still refused", () => {
  const rule = { min: 0, flag_zero: true };
  const zero = checkRange(0, "Consumption", rule);
  assert.equal(outcomeOf(zero, "hard_fail"), "flagged");
  assert.match(zero.message, /zero — confirm/);
  assert.equal(outcomeOf(checkRange(-1, "Consumption", rule), "hard_fail"), "fail");
  assert.equal(outcomeOf(checkRange(12, "Consumption", rule), "hard_fail"), "pass");
  // Without the key (code from before 0085 reads the same rule this way) a zero simply passes.
  assert.equal(outcomeOf(checkRange(0, "Consumption", { min: 0 }), "hard_fail"), "pass");
});

test("the anomaly check never reads Infinity", () => {
  const history = (values: number[]) => values.map((value, i) => ({ periodId: `p${i}`, value }));
  const params = { max_ratio: 2, min_periods: 3 };
  const zeroAgain = checkHistoryRatio(0, history([0, 0, 0]), params);
  assert.equal(zeroAgain.ok, true);
  const fromZero = checkHistoryRatio(50, history([0, 0, 0]), params);
  assert.equal(fromZero.ok, false);
  assert.doesNotMatch(fromZero.message, /Infinity/);
  const toZero = checkHistoryRatio(0, history([100, 120, 110]), params);
  assert.equal(toZero.ok, false);
  assert.doesNotMatch(toZero.message, /Infinity/);
  assert.match(toZero.message, /^Zero where/);
});

test("PPP revenue needs a positive rate", () => {
  assert.equal(pppRevenueMnUsd(1000, 0), null);
  assert.equal(pppRevenueMnUsd(1000, -2), null);
  assert.equal(pppRevenueMnUsd(1000, 20), 500);
});

test("a project that pays back only with the carbon value says so", () => {
  const base = {
    projectName: "Solar",
    baselineAnnualEmissionsTco2e: 1000,
    projectedAnnualEmissionsTco2e: 600,
    capexAmount: 1_000_000,
    projectLifespanYears: 10,
    shadowPricePerTco2e: 2500,
  };
  const carbonOnly = evaluateCapexCarbonEconomics({ ...base, operationalAnnualSavings: 0 });
  assert.equal(carbonOnly.traditionalPaybackYears, null);
  assert.equal(carbonOnly.carbonAdjustedPaybackYears, 1);
  assert.equal(carbonOnly.paysBackOnlyWithCarbon, true);
  const both = evaluateCapexCarbonEconomics({ ...base, operationalAnnualSavings: 200_000 });
  assert.equal(both.paysBackOnlyWithCarbon, false);
  assert.ok((both.paybackAccelerationYears ?? 0) > 0);
});

// --- Stage 2 and 3: energy, water, waste, procurement ---------------------------------------------------
import { normalize } from "../lib/calculation/units.ts";
import { energyRowOf, isEnergyKey, metricOfEnergyKey } from "../lib/energy/calorific.ts";
import { treatmentLevel, waterSource } from "../lib/reports/classify.ts";
import { indicatorBlock, type Year } from "../lib/reports/html.ts";
import { sebiGroupProblems } from "../lib/validation/sebi-groups.ts";

test("joules convert to and from kWh", () => {
  const gj = normalize(1, "GJ", "kWh");
  assert.ok(gj.ok && Math.abs(gj.normalized.value - 277.7777778) < 1e-6);
  const back = normalize(1000, "kWh", "GJ");
  assert.ok(back.ok && Math.abs(back.normalized.value - 3.6) < 1e-9);
  assert.equal(normalize(1, "MJ", "L").ok, false);
});

test("which activities are energy, and where they go in P6-E1", () => {
  assert.deepEqual(energyRowOf("RENEWABLE_ELECTRICITY", "SCOPE_2", null), {
    renewable: true,
    kind: "electricity",
  });
  assert.deepEqual(energyRowOf("GRID_ELECTRICITY", "SCOPE_2", null), {
    renewable: false,
    kind: "electricity",
  });
  assert.deepEqual(energyRowOf("DIESEL_CONSUMPTION", "SCOPE_1", "Fuel & Energy"), {
    renewable: false,
    kind: "fuel",
  });
  assert.deepEqual(energyRowOf("PURCHASED_STEAM", "SCOPE_2", null), {
    renewable: false,
    kind: "other",
  });
  assert.equal(energyRowOf("WATER_CONSUMPTION", null, "Water"), null);
  assert.equal(energyRowOf("SF6_TOPUP", "SCOPE_1", "Fugitive Emissions"), null);
  assert.ok(isEnergyKey("ENERGY:DIESEL_CONSUMPTION"));
  assert.equal(metricOfEnergyKey("ENERGY:DIESEL_CONSUMPTION"), "DIESEL_CONSUMPTION");
});

test("water sources and treatment levels are read from what people write", () => {
  assert.equal(waterSource("Borewell"), "ground");
  assert.equal(waterSource("Municipal supply"), "third_party");
  assert.equal(waterSource("River"), "surface");
  assert.equal(waterSource("Desalination plant"), "sea");
  assert.equal(waterSource("misc"), null);
  assert.equal(treatmentLevel("Tertiary (RO)"), "tertiary");
  assert.equal(treatmentLevel("RO plant"), "tertiary");
  assert.equal(treatmentLevel("STP"), "secondary");
  assert.equal(treatmentLevel("Primary settling"), "primary");
  assert.equal(treatmentLevel("None"), null);
  assert.equal(treatmentLevel("treated"), null);
});

test("text SEBI's tables can't place is flagged", () => {
  const fields = (v: Record<string, string>) => (k: string) => v[k] ?? null;
  assert.deepEqual(
    sebiGroupProblems("WATER_CONSUMPTION", fields({ source_classification: "Borewell" }), 0),
    [],
  );
  const water = sebiGroupProblems(
    "WATER_CONSUMPTION",
    fields({ source_classification: "misc", discharge_treatment: "treated" }),
    500,
  );
  assert.equal(water.length, 3); // unknown source, no destination, treated with no level
  assert.deepEqual(
    sebiGroupProblems(
      "WASTE_DISPOSED",
      fields({ waste_category: "Plastic", source_classification: "Recycled" }),
      null,
    ),
    [],
  );
  assert.equal(
    sebiGroupProblems(
      "WASTE_DISPOSED",
      fields({ waste_category: "misc", source_classification: "dumped" }),
      null,
    ).length,
    2,
  );
});

test("the energy table adds electricity and fuel in GJ and says what it could not convert", () => {
  const indicator = {
    code: "P6-E1",
    questionText: "Details of total energy consumption (in Joules or multiples)",
    indicatorType: "essential",
    kind: "statement",
    metrics: [],
    answer: null,
  } as never;
  const year: Year = {
    label: "FY 2026-27",
    scopes: [],
    sections: [],
    inputs: {
      turnoverCr: 1000,
      netWorthCr: null,
      pppRate: 20,
      physicalOutput: null,
      physicalOutputUnit: null,
      assurance: null,
      methodologyNote: null,
    } as never,
    breakups: {
      gases: [],
      scope1Sources: [],
      wasteByCategory: [],
      wasteByRoute: [],
      energy: {
        renewable: { electricity: 360, fuel: 0, other: 0 },
        nonRenewable: { electricity: 3600, fuel: 715.52, other: 0 },
        unconverted: [{ activity: "PNG Consumption", records: 2 }],
      },
    },
  };
  const html = indicatorBlock(indicator, [year]);
  assert.match(html, /Total energy consumed \(A\+B\+C\+D\+E\+F\)/);
  assert.match(html, /4,675\.52/); // 360 + 3600 + 715.52
  assert.match(html, /4\.68/); // GJ per ₹ crore: 4,675.52 / 1000
  assert.match(html, /PNG Consumption/);
  assert.doesNotMatch(html, /Not reported/);
});
