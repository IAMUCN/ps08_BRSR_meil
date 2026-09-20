import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCompact, formatTotal } from "../lib/scope/display.ts";

test("a kilogram total reads in tonnes too, once it is worth reading that way", () => {
  assert.equal(formatTotal(3125, "kgCO2e"), "3,125 kgCO2e (3.125 tCO2e)");
  assert.equal(formatTotal(999.5, "kgCO2e"), "999.5 kgCO2e");
});

test("other units are shown exactly as stored", () => {
  assert.equal(formatTotal(4200, "tCO2e"), "4,200 tCO2e");
  assert.equal(formatTotal(12500, "L"), "12,500 L");
  assert.equal(formatCompact(1250.5, "kgCO2e"), "1,250.5 kgCO2e");
});

test("a negative or zero total never invents a tonne figure", () => {
  assert.equal(formatTotal(0, "kgCO2e"), "0 kgCO2e");
  assert.equal(formatTotal(-2000, "kgCO2e"), "-2,000 kgCO2e (-2 tCO2e)");
});
