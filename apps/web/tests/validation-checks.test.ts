import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregate,
  checkAllowedUnits,
  checkBillingPeriodOverlap,
  checkDuplicateInvoice,
  checkEvidence,
  checkFormat,
  checkHistoryRatio,
  checkOrganizational,
  checkRange,
  outcomeOf,
  parseBillingPeriod,
  parseDate,
} from "../lib/validation/checks.ts";

const september = { label: "September 2026", startDate: "2026-09-01", endDate: "2026-09-30" };

test("format: required fields and numbers", () => {
  const fields = [
    { key: "quantity", label: "Quantity", dataType: "number", required: true, value: "1,250.00" },
    { key: "unit", label: "Unit", dataType: "unit", required: true, value: "Ltr" },
    { key: "note", label: "Note", dataType: "text", required: false, value: null },
  ];
  assert.equal(checkFormat(fields).ok, true);
  const broken = checkFormat([
    { ...fields[0], value: "abc" },
    { ...fields[1], value: "" },
  ]);
  assert.equal(broken.ok, false);
  assert.equal(broken.message, 'Quantity "abc" is not a number; Unit is missing.');
});

test("organizational: active and in scope", () => {
  assert.equal(
    checkOrganizational({ orgUnitName: "X", active: true, inSubmitterScope: true }).ok,
    true,
  );
  assert.equal(
    checkOrganizational({ orgUnitName: "X", active: false, inSubmitterScope: true }).ok,
    false,
  );
  assert.equal(
    checkOrganizational({ orgUnitName: "X", active: true, inSubmitterScope: false }).ok,
    false,
  );
});

test("period: dates and ranges as documents print them", () => {
  assert.deepEqual(parseDate("05-Sep-2026"), new Date(Date.UTC(2026, 8, 5)));
  assert.deepEqual(parseDate("01/08/2026"), new Date(Date.UTC(2026, 7, 1)));
  assert.deepEqual(parseDate("5.9.26"), new Date(Date.UTC(2026, 8, 5)));
  assert.equal(parseDate("31-Feb-2026"), null);
  assert.equal(parseDate("Sep 2026"), null);
  assert.deepEqual(parseBillingPeriod("01-Aug-2026 to 31-Aug-2026"), {
    start: new Date(Date.UTC(2026, 7, 1)),
    end: new Date(Date.UTC(2026, 7, 31)),
  });
  assert.equal(parseBillingPeriod("31-Aug-2026 to 01-Aug-2026"), null);
});

test("period: overlap passes, outside fails, unreadable is flagged", () => {
  assert.equal(checkBillingPeriodOverlap("05-Sep-2026", september).ok, true);
  // A bill spanning the month boundary overlaps the period.
  assert.equal(checkBillingPeriodOverlap("15/08/2026 to 14/09/2026", september).ok, true);
  const outside = checkBillingPeriodOverlap("01-Aug-2026 to 31-Aug-2026", september);
  assert.equal(outcomeOf(outside, "hard_fail"), "fail");
  assert.match(outside.message, /outside September 2026/);
  const unreadable = checkBillingPeriodOverlap("sometime soon", september);
  assert.equal(outcomeOf(unreadable, "hard_fail"), "flagged");
});

test("duplicates are reported with counts", () => {
  assert.equal(checkDuplicateInvoice("INV-1", 0, "Project X").ok, true);
  assert.equal(outcomeOf(checkDuplicateInvoice("INV-1", 2, "Project X"), "flag"), "flagged");
  assert.equal(checkDuplicateInvoice(null, 5, "Project X").ok, true);
});

test("evidence: manual entries are always reviewed", () => {
  assert.equal(checkEvidence({ attached: true, manualException: false }).ok, true);
  assert.equal(
    outcomeOf(checkEvidence({ attached: true, manualException: true }), "hard_fail"),
    "flagged",
  );
  assert.equal(
    outcomeOf(checkEvidence({ attached: false, manualException: false }), "hard_fail"),
    "fail",
  );
});

test("logical: range and units", () => {
  assert.equal(checkRange(0, "Quantity", { min_exclusive: 0 }).ok, false);
  assert.equal(checkRange(12.5, "Quantity", { min_exclusive: 0 }).ok, true);
  assert.equal(checkAllowedUnits("ltr", ["L", "Ltr"], "Diesel").ok, true);
  assert.match(checkAllowedUnits("kg", ["L", "Ltr"], "Diesel").message, /isn't valid for Diesel/);
});

test("anomaly: needs history, then flags beyond the configured ratio", () => {
  const params = { max_ratio: 2, min_periods: 3 };
  const two = [
    { periodId: "a", value: 100 },
    { periodId: "b", value: 110 },
  ];
  assert.equal(checkHistoryRatio(500, two, params).ok, true);
  assert.match(checkHistoryRatio(500, two, params).message, /2 of 3 periods/);
  const history = [...two, { periodId: "c", value: 90 }];
  assert.equal(checkHistoryRatio(150, history, params).ok, true);
  assert.equal(checkHistoryRatio(250, history, params).ok, false);
  assert.equal(checkHistoryRatio(40, history, params).ok, false);
});

test("aggregate: any fail wins, then flags", () => {
  assert.equal(aggregate(["pass", "pass"]), "validated");
  assert.equal(aggregate(["pass", "flagged"]), "flagged");
  assert.equal(aggregate(["flagged", "fail"]), "failed");
});
