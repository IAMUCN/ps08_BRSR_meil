import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activityInput,
  evaluate,
  formulaInputs,
  parseFormula,
} from "../lib/calculation/formulas.ts";
import { normalize } from "../lib/calculation/units.ts";
import { checkNotGreaterThan } from "../lib/validation/checks.ts";
import { activityFieldKeys } from "../lib/verification/rules.ts";

test("formulas: the stored definitions parse, anything else is refused", () => {
  assert.deepEqual(parseFormula("direct_multiply", {}), { op: "multiply_by_factor" });
  assert.deepEqual(parseFormula("subtract", { inputs: ["withdrawal", "discharge"] }), {
    op: "subtract",
    inputs: ["withdrawal", "discharge"],
  });
  assert.deepEqual(
    parseFormula("percentage", { part: "female_employees", whole: "total_employees" }),
    {
      op: "percentage",
      part: "female_employees",
      whole: "total_employees",
      scale: 100,
    },
  );
  assert.equal(parseFormula("custom", { expr: "a*b" }), null); // reserved, never evaluated
  assert.equal(parseFormula("subtract", { inputs: ["withdrawal"] }), null);
  assert.equal(parseFormula("percentage", { part: "x" }), null);
});

test("formulas: percentage and subtract evaluate deterministically", () => {
  const pct = parseFormula("percentage", { part: "women", whole: "total" });
  assert.ok(pct && pct.op === "percentage");
  const r = evaluate(pct, { women: 42, total: 180 });
  assert.ok(r.ok);
  assert.equal(r.value, (42 / 180) * 100);
  assert.deepEqual(evaluate(pct, { women: 0, total: 0 }).ok, false);

  const sub = parseFormula("subtract", { inputs: ["withdrawal", "discharge"] });
  assert.ok(sub && sub.op === "subtract");
  assert.deepEqual(evaluate(sub, { withdrawal: 1250, discharge: 400 }), { ok: true, value: 850 });
});

test("formulas: the activity value is the whole of a percentage and the first input of a subtraction", () => {
  const pct = parseFormula("percentage", { part: "women", whole: "total" })!;
  assert.deepEqual(formulaInputs(pct), ["total", "women"]);
  assert.equal(activityInput(pct), "total");
  assert.equal(
    activityInput(parseFormula("subtract", { inputs: ["withdrawal", "discharge"] })),
    "withdrawal",
  );
  assert.equal(activityInput(parseFormula("direct_multiply", {})), null);
});

test("activity field: a formula-named field wins over the single-number convention", () => {
  const fields = [
    { key: "total_employees", dataType: "number" as const, required: true },
    { key: "female_employees", dataType: "number" as const, required: true },
  ];
  assert.equal(activityFieldKeys(fields).ok, false);
  const named = activityFieldKeys(fields, "total_employees");
  assert.ok(named.ok);
  assert.equal(named.valueKey, "total_employees");
  assert.equal(named.unitKey, null);
});

test("validation: a part can't exceed its whole", () => {
  assert.equal(
    checkNotGreaterThan({ label: "Women", value: 42 }, { label: "Total", value: 180 }).ok,
    true,
  );
  assert.equal(
    checkNotGreaterThan({ label: "Women", value: 181 }, { label: "Total", value: 180 }).ok,
    false,
  );
  assert.equal(
    checkNotGreaterThan({ label: "Women", value: null }, { label: "Total", value: 180 }).ok,
    false,
  );
});

test("units: water in cubic metres normalises to kilolitres one for one", () => {
  const r = normalize(850, "m³", "KL");
  assert.ok(r.ok);
  assert.equal(r.normalized.value, 850);
});

test("formulas: a rate states its scale; a percentage is the default", () => {
  const pct = parseFormula("percentage", { part: "women", whole: "total" });
  assert.ok(pct && pct.op === "percentage" && pct.scale === 100);
  const ltifr = parseFormula("percentage", {
    part: "lost_time_injuries",
    whole: "person_hours",
    scale: 1000000,
  });
  assert.ok(ltifr && ltifr.op === "percentage" && ltifr.scale === 1_000_000);
  // 3 lost time injuries in 2,400,000 person-hours = 1.25 per million.
  assert.deepEqual(evaluate(ltifr, { lost_time_injuries: 3, person_hours: 2_400_000 }), {
    ok: true,
    value: 1.25,
  });
  const none = evaluate(ltifr, { lost_time_injuries: 0, person_hours: 0 });
  assert.ok(!none.ok && /no rate/.test(none.reason));
});
