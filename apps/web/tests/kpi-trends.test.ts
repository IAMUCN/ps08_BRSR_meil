import assert from "node:assert/strict";
import { test } from "node:test";
import { kpiTrends, yearOnYear, type TrendRow } from "../lib/dashboard/trends.ts";

const row = (r: Partial<TrendRow> & { financialYear: number }): TrendRow => ({
  scopeCode: null,
  metricCode: "X",
  value: null,
  unit: null,
  activity: null,
  activityUnit: null,
  ...r,
});

test("KPI trends: each financial year's approved totals, an empty year left empty", () => {
  const t = kpiTrends([
    row({
      financialYear: 2024,
      scopeCode: "SCOPE_1",
      metricCode: "DIESEL",
      value: 4000,
      unit: "kgCO2e",
    }),
    row({
      financialYear: 2026,
      scopeCode: "SCOPE_1",
      metricCode: "DIESEL",
      value: 3000,
      unit: "kgCO2e",
    }),
    row({ financialYear: 2026, scopeCode: "SCOPE_1", metricCode: "LPG", value: 1, unit: "tCO2e" }),
    row({
      financialYear: 2026,
      scopeCode: "SCOPE_2",
      metricCode: "GRID",
      value: 7100,
      unit: "kgCO2e",
    }),
    row({ financialYear: 2026, metricCode: "WATER_CONSUMPTION", value: 850, unit: "m3" }),
    row({
      financialYear: 2026,
      scopeCode: "SCOPE_3",
      metricCode: "WASTE_DISPOSED",
      value: 500,
      unit: "kgCO2e",
      activity: 2.5,
      activityUnit: "tonnes",
    }),
  ]);
  assert.deepEqual(t.years, [2024, 2025, 2026]);
  const of = (key: string) => t.kpis.find((k) => k.key === key)!.values;
  assert.deepEqual(
    of("scope1"),
    [4, null, 4],
    "kilograms and tonnes add up in tonnes; 2025 is empty",
  );
  assert.deepEqual(of("scope2"), [null, null, 7.1]);
  assert.deepEqual(of("scope3"), [null, null, 0.5]);
  assert.deepEqual(of("total"), [4, null, 11.6]);
  assert.deepEqual(of("water"), [null, null, 850], "cubic metres are kilolitres");
  assert.deepEqual(of("waste"), [null, null, 2.5], "waste is the weight, not its emissions");
  assert.equal(yearOnYear(of("scope1"), 2), null, "no change is claimed across an empty year");
  assert.equal(yearOnYear([4, 5], 1), 25);
  assert.deepEqual(kpiTrends([]), { years: [], kpis: [] });
});

test("KPI trends: at most the five latest financial years", () => {
  const t = kpiTrends(
    [2018, 2020, 2026].map((financialYear) =>
      row({ financialYear, scopeCode: "SCOPE_1", value: 1000, unit: "kgCO2e" }),
    ),
  );
  assert.deepEqual(t.years, [2022, 2023, 2024, 2025, 2026]);
  assert.deepEqual(t.kpis[0].values, [null, null, null, null, 1]);
});
