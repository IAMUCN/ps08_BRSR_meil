import assert from "node:assert/strict";
import { test } from "node:test";
import { indicatorStatus } from "../lib/brsr/readiness.ts";

test("readiness: complete only when every applicable mapped metric has an approved record", () => {
  assert.equal(
    indicatorStatus([
      { applicable: true, approved: 2 },
      { applicable: true, approved: 1 },
    ]),
    "complete",
  );
  assert.equal(
    indicatorStatus([
      { applicable: true, approved: 1 },
      { applicable: true, approved: 0 },
    ]),
    "partial",
  );
  assert.equal(indicatorStatus([{ applicable: true, approved: 0 }]), "missing");
  assert.equal(indicatorStatus([]), "not_mapped");
});

test("readiness: a mapping marked not applicable counts neither way", () => {
  assert.equal(
    indicatorStatus([
      { applicable: true, approved: 1 },
      { applicable: false, approved: 0 },
    ]),
    "complete",
  );
  assert.equal(indicatorStatus([{ applicable: false, approved: 3 }]), "not_mapped");
});
