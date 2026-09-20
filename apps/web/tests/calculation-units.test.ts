import assert from "node:assert/strict";
import { test } from "node:test";
import { normalize, sameQuantity } from "../lib/calculation/units.ts";
import { formatQuantity } from "../lib/calculation/trace.ts";

test("normalisation: the spellings validation accepts all convert", () => {
  for (const unit of ["L", "Ltr", "ltrs", "Litre", "Liters"]) {
    const result = normalize(250, unit, "L");
    assert.ok(result.ok);
    assert.deepEqual(result.normalized, { value: 250, unit: "L" });
  }
  const kilolitres = normalize(2.5, "KL", "L");
  assert.ok(kilolitres.ok);
  assert.equal(kilolitres.normalized.value, 2500);

  const units = normalize(900, "Units", "kWh");
  assert.ok(units.ok);
  assert.equal(units.normalized.value, 900);
  const mwh = normalize(1.2, "MWh", "kWh");
  assert.ok(mwh.ok);
  assert.equal(mwh.normalized.value, 1200);
});

test("normalisation: an unknown or mismatched unit stops the calculation", () => {
  const unknown = normalize(10, "drums", "L");
  assert.equal(unknown.ok, false);
  assert.match(unknown.ok ? "" : unknown.reason, /not a unit this engine can convert/);

  const mismatch = normalize(10, "kWh", "L");
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.ok ? "" : mismatch.reason, /cannot be converted/);
});

test("normalisation is reversible and exact for the factor's own unit", () => {
  const toLitres = normalize(3, "KL", "L");
  assert.ok(toLitres.ok);
  const backToKilolitres = normalize(toLitres.normalized.value, "L", "KL");
  assert.ok(backToKilolitres.ok);
  assert.equal(backToKilolitres.normalized.value, 3);
});

test("sameQuantity only matches units of the same kind", () => {
  assert.equal(sameQuantity("L", "KL"), true);
  assert.equal(sameQuantity("kWh", "MWh"), true);
  assert.equal(sameQuantity("L", "kWh"), false);
  assert.equal(sameQuantity("L", "barrels"), false);
});

test("trace numbers keep their precision and carry the unit", () => {
  assert.equal(formatQuantity(1250.5, "L"), "1,250.5 L");
  assert.equal(formatQuantity(3351.34, "kgCO2e"), "3,351.34 kgCO2e");
});
