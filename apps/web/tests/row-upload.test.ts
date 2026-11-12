// Upload by rows, typed values against the document (migration 0077, .grill/row-upload-decisions.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFormula, productInputs, productOf } from "../lib/calculation/formulas.ts";
import {
  confirmedProblem,
  entryFieldsOf,
  entryProblem,
  matchBills,
  sameAmount,
  totalStatus,
  typedStatus,
  unitChoices,
} from "../lib/declarations/compare.ts";
import {
  declarationsOf,
  newRow,
  pagesProblem,
  rowProblem,
  rowsFromDraft,
  type RowMetric,
} from "../lib/upload/rows.ts";
import { activityFieldKeys, isFlagged, type VerifyField } from "../lib/verification/rules.ts";

const r = (text: string, unit: string | null = null) => ({ text, unit });

test("amounts match within 1 in the last decimal place, whole numbers exactly", () => {
  assert.equal(sameAmount(r("12.35"), r("12.34")), true);
  assert.equal(sameAmount(r("12.35"), r("12.33")), false);
  assert.equal(sameAmount(r("1,250.00"), r("1250")), true);
  // Counts: 6 passengers are not 7.
  assert.equal(sameAmount(r("6"), r("7")), false);
  assert.equal(sameAmount(r("14210"), r("14211")), false);
  // A whole number is the rounding of a decimal one.
  assert.equal(sameAmount(r("14210"), r("14210.4")), true);
  assert.equal(sameAmount(r("14210"), r("14210.6")), false);
  assert.equal(sameAmount(r("abc"), r("1")), null);
});

test("amounts are compared in one unit", () => {
  assert.equal(sameAmount(r("0.85", "KL"), r("850", "L")), true);
  assert.equal(sameAmount(r("1.2", "MWh"), r("1200", "kWh")), true);
  assert.equal(sameAmount(r("850", "L"), r("850", "kg")), null);
});

test("typed status against what OCR read", () => {
  assert.equal(typedStatus(r("850", "L"), r("850.00", "L")), "match");
  assert.equal(typedStatus(r("1410", "kWh"), r("141", "kWh")), "mismatch");
  assert.equal(typedStatus(r("850"), null), "not_read");
});

test("a confirmed value needs review only when it disagrees with the document (or, unread, with the typing)", () => {
  const label = "Quantity";
  // Typed = read = confirmed.
  assert.equal(
    confirmedProblem({ label, typed: r("850"), read: r("850"), confirmed: r("850") }),
    null,
  );
  // Typed wrong, corrected to the document: no flag.
  assert.equal(
    confirmedProblem({ label, typed: r("8500"), read: r("850"), confirmed: r("850") }),
    null,
  );
  // Typed kept against the document: flagged, both named.
  const kept = confirmedProblem({ label, typed: r("1410"), read: r("141"), confirmed: r("1410") });
  assert.match(kept!, /1410 was typed at upload and kept, but the document reads 141/);
  // A third value.
  assert.ok(confirmedProblem({ label, typed: r("1410"), read: r("141"), confirmed: r("140") }));
  // Nothing read: the typed value must stand.
  assert.equal(confirmedProblem({ label, typed: r("6"), read: null, confirmed: r("6") }), null);
  assert.ok(confirmedProblem({ label, typed: r("6"), read: null, confirmed: r("5") }));
});

test("a typed total against its bills", () => {
  assert.deepEqual(totalStatus(r("2450", "L"), [r("1000", "L"), r("800", "L"), null]), {
    status: "waiting",
  });
  const match = totalStatus(r("2450", "L"), [r("1000", "L"), r("0.8", "KL"), r("650", "L")]);
  assert.equal(match.status, "match");
  const off = totalStatus(r("2450", "L"), [r("1000", "L"), r("800", "L"), r("600", "L")]);
  assert.equal(off.status, "mismatch");
  assert.equal(off.status === "mismatch" && off.sum, 2400);
});

test("declared bills pair with found bills by activity and period", () => {
  const declared = [
    { index: 0, metricId: "elec", periodId: "apr", mode: "bill" as const },
    { index: 1, metricId: "elec", periodId: "may", mode: "bill" as const },
    { index: 2, metricId: "diesel", periodId: "may", mode: "bill" as const },
  ];
  // Found in page order: diesel May, electricity May, electricity April.
  const m = matchBills(declared, [
    { index: 0, metricId: "diesel", periodId: "may" },
    { index: 1, metricId: "elec", periodId: "may" },
    { index: 2, metricId: "elec", periodId: "apr" },
  ]);
  assert.deepEqual(m.assignment, [2, 1, 0]);
  assert.equal(m.clean, true);

  // More found than typed: not clean, the extra is not declared.
  const extra = matchBills(declared.slice(0, 1), [
    { index: 0, metricId: "elec", periodId: "apr" },
    { index: 1, metricId: "elec", periodId: "may" },
  ]);
  assert.equal(extra.clean, false);
  assert.deepEqual(extra.assignment, [0, null]);

  // Fewer found than typed.
  const fewer = matchBills(declared, [{ index: 0, metricId: "elec", periodId: "may" }]);
  assert.equal(fewer.clean, false);
  assert.deepEqual(fewer.unmatched, [0, 2]);

  // A total: every bill found belongs to it.
  const total = matchBills(
    [{ index: 0, metricId: "diesel", periodId: "oct", mode: "total" }],
    [
      { index: 0, metricId: "diesel", periodId: "oct" },
      { index: 1, metricId: null, periodId: null },
    ],
  );
  assert.deepEqual(total.assignment, [0, 0]);
  assert.equal(total.clean, true);
});

test("the values a row asks for, and its units", () => {
  const fields = entryFieldsOf([
    { key: "billing_period", label: "Period", dataType: "text", required: true },
    { key: "distance", label: "Distance (km)", dataType: "number", required: true },
    { key: "passengers", label: "Passengers", dataType: "number", required: true },
    { key: "unit", label: "Unit", dataType: "unit", required: true },
  ]);
  assert.deepEqual(
    fields.map((f) => f.key),
    ["distance", "passengers"],
  );
  assert.equal(entryProblem(fields, { distance: "1150" }), "Type the passengers.");
  assert.equal(
    entryProblem(fields, { distance: "1150", passengers: "six" })?.startsWith("Passengers"),
    true,
  );
  assert.equal(entryProblem(fields, { distance: "1,150", passengers: "6" }), null);
  assert.deepEqual(unitChoices(["L", "Ltr", "Litres", "KL", "Kilolitre"], "L"), ["L", "KL"]);
  assert.deepEqual(unitChoices(["km", "Km", "KM", "Kms", "pkm"], "km"), ["km"]);
});

const diesel: RowMetric = {
  id: "diesel",
  name: "Diesel",
  entryFields: [{ key: "quantity", label: "Quantity" }],
  unitKey: "unit",
  units: ["L", "KL"],
};

test("a row needs its values and its evidence", () => {
  const metricOf = (id: string) => (id === "diesel" ? diesel : undefined);
  const row = { ...newRow("r1", "oct"), metricId: "diesel", values: { unit: "L" } };
  assert.equal(rowProblem(row, 1, metricOf), "Type the quantity.");
  const typed = { ...row, values: { unit: "L", quantity: "850" } };
  assert.match(rowProblem(typed, 0, metricOf)!, /every submission needs its document/);
  assert.equal(rowProblem(typed, 1, metricOf), null);
  assert.match(
    rowProblem({ ...typed, mode: "total" }, 1, metricOf)!,
    /Attach each bill: separate bills need a file each/,
  );

  assert.deepEqual(declarationsOf(typed), [
    {
      metricId: "diesel",
      reportingPeriodId: "oct",
      mode: "bill",
      values: { unit: "L", quantity: "850" },
    },
  ]);
  const each = {
    ...typed,
    mode: "each" as const,
    more: [
      { id: "b2", metricId: "diesel", periodId: "sep", values: { unit: "L", quantity: "600" } },
    ],
  };
  assert.equal(declarationsOf(each).length, 2);
  assert.ok(declarationsOf(each).every((d) => d.mode === "bill"));
  assert.equal(declarationsOf({ ...typed, mode: "total" })[0].mode, "total");
});

test("a draft comes back without anything malformed", () => {
  const rows = rowsFromDraft(
    [
      {
        id: "a",
        metricId: "diesel",
        periodId: "oct",
        values: { quantity: "850", x: 5 },
        mode: "one",
        more: [],
      },
      { id: "b", metricId: "diesel", periodId: "closed", values: {}, mode: "weird" },
      "nonsense",
    ],
    new Set(["oct"]),
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].values, { quantity: "850" });
  assert.equal(rows[1].periodId, "");
  assert.equal(rows[1].mode, "one");
});

test("travel: distance x passengers is the activity value", () => {
  const formula = parseFormula("direct_multiply", {
    op: "multiply_by_factor",
    inputs: ["distance", "passengers"],
  });
  assert.deepEqual(productInputs(formula), ["distance", "passengers"]);
  // Version 1 named the activity value itself: no product.
  assert.equal(
    productInputs(parseFormula("direct_multiply", { inputs: ["activity_value"] })),
    null,
  );
  assert.equal(productOf([1150, 6]), 6900);
  assert.equal(productOf([0.1, 3]), 0.3);
  assert.equal(productOf([1150, null]), null);

  const fields = [
    { key: "distance", dataType: "number" as const, required: true },
    { key: "passengers", dataType: "number" as const, required: true },
    { key: "unit", dataType: "unit" as const, required: true },
  ];
  assert.deepEqual(activityFieldKeys(fields, ["distance", "passengers"]), {
    ok: true,
    valueKey: "distance",
    unitKey: "unit",
    productKeys: ["distance", "passengers"],
  });
  // A record read before the change has one passenger-km number.
  assert.deepEqual(
    activityFieldKeys(
      [
        { key: "quantity", dataType: "number" as const, required: false },
        { key: "unit", dataType: "unit" as const, required: true },
      ],
      ["distance", "passengers"],
    ),
    { ok: true, valueKey: "quantity", unitKey: "unit" },
  );
});

test("a typed value the document disagrees with must be dealt with on Verify", () => {
  const field: VerifyField = {
    id: "f",
    key: "quantity",
    label: "Quantity",
    dataType: "number",
    required: true,
    critical: false,
    extractedValue: "141",
    confidence: 99,
  };
  assert.equal(isFlagged(field, 80), false);
  assert.equal(
    isFlagged({ ...field, typed: { value: "1410", unit: null, status: "mismatch" } }, 80),
    true,
  );
  assert.equal(
    isFlagged({ ...field, typed: { value: "141", unit: null, status: "match" } }, 80),
    false,
  );
});

test("the pages of the bills in one file: all or none, valid, not overlapping", () => {
  const line = (id: string, pageFrom = "", pageTo = "") => ({
    id,
    metricId: "diesel",
    periodId: "oct",
    values: { quantity: "850", unit: "L" },
    pageFrom,
    pageTo,
  });
  assert.equal(pagesProblem([line("a"), line("b")]), null);
  assert.equal(pagesProblem([line("a", "1", "2"), line("b", "3", "3")]), null);
  assert.match(
    pagesProblem([line("a", "1", "2"), line("b")])!,
    /every bill in the file, or of none/,
  );
  assert.match(
    pagesProblem([line("a", "2", "1"), line("b", "3", "3")])!,
    /Bill 1: enter its first and last page/,
  );
  assert.match(
    pagesProblem([line("a", "1", "2"), line("b", "2", "3")])!,
    /Bills 1 and 2 both include page 2/,
  );

  const row = {
    ...newRow("r", "oct"),
    ...line("r", "1", "2"),
    mode: "each" as const,
    more: [line("b", "3", "4")],
  };
  const sent = declarationsOf(row);
  assert.deepEqual(
    sent.map((d) => [d.pageFrom, d.pageTo]),
    [
      [1, 2],
      [3, 4],
    ],
  );
  // Without pages the file is split by OCR as before.
  const unpaged = declarationsOf({ ...row, pageFrom: "", pageTo: "", more: [line("b")] });
  assert.ok(unpaged.every((d) => d.pageFrom === undefined));
});
