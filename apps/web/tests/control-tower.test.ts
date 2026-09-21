import assert from "node:assert/strict";
import { test } from "node:test";
import { stageOf } from "../lib/records/stage.ts";
import { fraction, readiness } from "../lib/dashboard/kpis.ts";

test("a KPI with no denominator is unknown, never 0 % or 100 %", () => {
  assert.deepEqual(fraction(0, 0), { numerator: 0, denominator: 0, value: null });
  assert.equal(fraction(3, 4).value, 75);
});

test("BRSR readiness is the weighted average of the components that can be measured", () => {
  const all = { submission: 50, evidence: 100, validation: 100, approval: 50, indicators: 0 };
  assert.equal(
    readiness(all, { submission: 1, evidence: 1, validation: 1, approval: 1, indicators: 1 }).value,
    60,
  );
  // Double weight on indicators pulls it down: (50+100+100+50+0*2)/6
  assert.equal(
    readiness(all, { submission: 1, evidence: 1, validation: 1, approval: 1, indicators: 2 }).value,
    50,
  );
  // An unmeasurable component is left out rather than counted as zero.
  const partial = readiness(
    { ...all, approval: null, indicators: null },
    { submission: 1, evidence: 1, validation: 1, approval: 1, indicators: 1 },
  );
  assert.ok(Math.abs(partial.value! - 250 / 3) < 1e-9);
  assert.equal(partial.components.length, 5, "every component is still listed in the explanation");
  assert.equal(
    readiness(
      { submission: null, evidence: null, validation: null, approval: null, indicators: null },
      {},
    ).value,
    null,
  );
  assert.equal(readiness(all, { submission: -3 }).value, null, "negative weights count as zero");
});

test("the stage badge reads the pipeline in order", () => {
  const s = (
    verification: string,
    validation = "pending",
    approval = "not_submitted",
    quality = "verified",
  ) => stageOf({ verification, validation, approval, quality }).label;
  assert.equal(s("document_uploaded"), "Processing");
  assert.equal(s("ocr_completed"), "Needs verification");
  assert.equal(s("user_verified", "failed"), "Validation failed");
  assert.equal(s("user_verified", "flagged"), "Flagged");
  assert.equal(s("user_verified", "validated", "review_pending"), "Pending approval");
  assert.equal(s("user_verified", "validated", "approved", "approved"), "Approved");
  assert.equal(s("user_verified", "validated", "approved", "rejected"), "Rejected");
});
