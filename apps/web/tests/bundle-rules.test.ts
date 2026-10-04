import assert from "node:assert/strict";
import { test } from "node:test";
import { checkBundleParts, pagesLabel, type BundlePartInput } from "../lib/documents/bundle.ts";

const part = (pageFrom: number, pageTo: number, metricId: string | null = "m", skip = false) =>
  ({ pageFrom, pageTo, metricId, skip }) satisfies BundlePartInput;

test("bundle split: a clean split is accepted, gaps are fine", () => {
  assert.equal(checkBundleParts([part(1, 2), part(3, 3), part(5, 6)], 6), null);
});

test("bundle split: bad ranges are named", () => {
  assert.match(checkBundleParts([part(0, 1)], 3) ?? "", /Bill 1: enter a first and last page/);
  assert.match(checkBundleParts([part(3, 2)], 3) ?? "", /not before the first/);
  assert.match(checkBundleParts([part(1.5, 2)], 3) ?? "", /first and last page/);
  assert.match(checkBundleParts([part(1, 4)], 3) ?? "", /only 3 pages/);
  assert.equal(checkBundleParts([part(1, 1)], 1), null, "one page is fine");
});

test("bundle split: a page belongs to one bill", () => {
  assert.match(
    checkBundleParts([part(1, 2), part(2, 3)], 3) ?? "",
    /Bills 1 and 2 both include page 2/,
  );
});

test("bundle split: kept bills need an activity; at least one must be kept", () => {
  assert.match(
    checkBundleParts([part(1, 1, null)], 2) ?? "",
    /Bill 1: choose what it is evidence for/,
  );
  assert.equal(
    checkBundleParts([part(1, 1, null, true), part(2, 2)], 2),
    null,
    "skipped needs none",
  );
  assert.match(checkBundleParts([part(1, 1, null, true)], 2) ?? "", /Keep at least one bill/);
  assert.match(checkBundleParts([], 2) ?? "", /Add at least one bill/);
});

test("bundle split: page labels", () => {
  assert.equal(pagesLabel(3, 3), "page 3");
  assert.equal(pagesLabel(1, 2), "pages 1–2");
});
