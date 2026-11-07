import assert from "node:assert/strict";
import { test } from "node:test";
import { stageOf, trackOf, type Statuses } from "../lib/records/stage.ts";

const base: Statuses = {
  verification: "document_uploaded",
  validation: "not_validated",
  approval: "not_submitted",
  quality: "unverified",
};
const current = (s: Statuses) =>
  trackOf(s, "Asha").steps.find((x) => x.state !== "done" && x.state !== "todo")?.label;

test("stage tracker: the current step, who it waits on and what is next", () => {
  assert.equal(current(base), "Read by OCR");
  assert.equal(trackOf(base, "Asha").waitingOn, "OCR");

  const ocrDone = { ...base, verification: "ocr_completed" };
  assert.equal(current(ocrDone), "Checked by uploader");
  assert.equal(trackOf(ocrDone, "Asha").waitingOn, "Asha");

  const flagged = { ...base, verification: "user_verified", validation: "flagged" };
  assert.equal(current(flagged), "Validated");
  assert.match(trackOf(flagged, "Asha").waitingOn ?? "", /Validation Queue/);

  const failed = { ...base, verification: "user_verified", validation: "failed" };
  assert.equal(current(failed), "Checked by uploader");
  assert.equal(trackOf(failed, "Asha").waitingOn, "Asha");

  const pending = { ...flagged, validation: "validated", approval: "review_pending" };
  assert.equal(current(pending), "Approved");
  assert.equal(trackOf(pending, "Asha").waitingOn, "An approver");

  const approved = { ...pending, approval: "approved" };
  assert.ok(trackOf(approved, "Asha").steps.every((s) => s.state === "done"));
  assert.equal(trackOf(approved, "Asha").waitingOn, null);

  const rejected = { ...pending, quality: "rejected" };
  const track = trackOf(rejected, "Asha");
  assert.equal(track.steps.find((s) => s.state === "stopped")?.label, "Approved");
  assert.equal(track.waitingOn, null);
});

test("stage tracker and badge agree on approved and rejected", () => {
  const approved: Statuses = {
    verification: "user_verified",
    validation: "validated",
    approval: "approved",
    quality: "approved",
  };
  assert.equal(stageOf(approved).label, "Approved");
  assert.equal(stageOf({ ...approved, quality: "rejected" }).label, "Rejected");
});
