import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activityFieldKeys,
  checkConfirm,
  fieldError,
  isFlagged,
  isResolved,
  parseDecimal,
  verifyState,
  type FieldEntry,
  type VerifyField,
} from "../lib/verification/rules.ts";

const field = (over: Partial<VerifyField> = {}): VerifyField => ({
  id: over.id ?? "f1",
  key: over.key ?? "quantity",
  label: over.label ?? "Quantity",
  dataType: over.dataType ?? "number",
  required: over.required ?? true,
  critical: over.critical ?? false,
  extractedValue: over.extractedValue === undefined ? "1250.00" : over.extractedValue,
  confidence: over.confidence === undefined ? 94.7 : over.confidence,
});
const entry = (value: string, acknowledged = false): FieldEntry => ({ value, acknowledged });

test("a field is flagged below the threshold, when critical, or with no threshold to judge by", () => {
  assert.equal(isFlagged(field({ confidence: 94.7 }), 80), false);
  assert.equal(isFlagged(field({ confidence: 62 }), 80), true);
  assert.equal(isFlagged(field({ confidence: 99, critical: true }), 80), true);
  assert.equal(isFlagged(field({ confidence: 99 }), null), true);
  // Not found is not "flagged" — it has to be filled in instead.
  assert.equal(isFlagged(field({ extractedValue: null, confidence: null }), 80), false);
});

test("numbers accept thousands separators and refuse negatives and junk", () => {
  assert.deepEqual(parseDecimal("1,250.00"), { ok: true, value: 1250 });
  assert.deepEqual(parseDecimal(" 102430 "), { ok: true, value: 102430 });
  assert.equal(parseDecimal("-5").ok, false);
  assert.equal(parseDecimal("1250 L").ok, false);
  assert.equal(fieldError(field(), entry("12.5")), null);
  assert.equal(fieldError(field(), entry("abc")), "Enter a number, e.g. 1250.00");
  assert.equal(
    fieldError(field({ extractedValue: null, confidence: null }), entry("")),
    "This field is required — read it off the document.",
  );
  assert.equal(fieldError(field({ required: false, extractedValue: null }), entry("")), null);
});

test("a flagged field resolves only by editing or acknowledging", () => {
  const low = field({ confidence: 62 });
  assert.equal(isResolved(low, entry("1250.00"), 80), false);
  assert.equal(isResolved(low, entry("1250.00", true), 80), true);
  assert.equal(isResolved(low, entry("1350.00"), 80), true);
  assert.equal(isResolved(field({ confidence: 95 }), entry("1250.00"), 80), true);
});

test("Confirm stays blocked until type, values, flagged fields and duplicates are dealt with", () => {
  const fields = [
    field({ id: "a", confidence: 62 }),
    field({
      id: "b",
      key: "unit",
      label: "Unit",
      dataType: "unit",
      extractedValue: "Ltr",
      confidence: 95,
    }),
  ];
  const entries = { a: entry("1250.00"), b: entry("Ltr") };

  assert.equal(
    checkConfirm(fields, entries, 80, { documentTypeSelected: false }).blockedReason,
    "Select the document type first.",
  );
  const flagged = checkConfirm(fields, entries, 80, { documentTypeSelected: true });
  assert.deepEqual(flagged.unresolved, ["Quantity"]);
  assert.equal(flagged.blockedReason, "Review Quantity — edit it or mark it correct.");

  const bad = checkConfirm(fields, { a: entry("abc", true), b: entry("Ltr") }, 80, {
    documentTypeSelected: true,
  });
  assert.equal(bad.errors.a, "Enter a number, e.g. 1250.00");
  assert.equal(bad.blockedReason, "Fix the field marked in red.");

  const resolved = { a: entry("1250.00", true), b: entry("Ltr") };
  assert.equal(
    checkConfirm(fields, resolved, 80, { documentTypeSelected: true }).blockedReason,
    null,
  );
  assert.equal(
    checkConfirm(fields, resolved, 80, { documentTypeSelected: true, duplicates: 1 }).blockedReason,
    "Acknowledge the possible duplicate first.",
  );
  assert.equal(
    checkConfirm(fields, resolved, 80, {
      documentTypeSelected: true,
      duplicates: 1,
      duplicateAcknowledged: true,
    }).blockedReason,
    null,
  );
});

test("activity value and unit come from the metric's field requirements", () => {
  const diesel = [
    { key: "quantity", dataType: "number" as const, required: true },
    { key: "unit", dataType: "unit" as const, required: true },
    { key: "invoice_number", dataType: "text" as const, required: true },
  ];
  assert.deepEqual(activityFieldKeys(diesel), { ok: true, valueKey: "quantity", unitKey: "unit" });
  assert.equal(activityFieldKeys(diesel.slice(1)).ok, false);
  assert.equal(
    activityFieldKeys([...diesel, { key: "extra", dataType: "number", required: true }]).ok,
    false,
  );
});

test("the verify page state follows the record and its job", () => {
  const base = { verificationStatus: "document_uploaded", dataQualityState: "incomplete" } as const;
  assert.equal(verifyState({ ...base, jobStatus: "pending" }), "processing");
  assert.equal(verifyState({ ...base, jobStatus: "failed" }), "failed");
  assert.equal(
    verifyState({ ...base, verificationStatus: "ocr_completed", jobStatus: "completed" }),
    "ready",
  );
  assert.equal(
    verifyState({ ...base, verificationStatus: "user_verified", jobStatus: "completed" }),
    "verified",
  );
  assert.equal(
    verifyState({ ...base, dataQualityState: "rejected", jobStatus: "failed" }),
    "rejected",
  );
});
