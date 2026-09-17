import assert from "node:assert/strict";
import { test } from "node:test";
import {
  submissionBadge,
  submissionTab,
  workerStallMinutes,
  type RecordStatus,
} from "../lib/ocr/rules.ts";

const uploaded: RecordStatus = {
  verificationStatus: "document_uploaded",
  validationStatus: "pending",
  approvalStatus: "not_submitted",
  dataQualityState: "incomplete",
  jobStatus: "pending",
};

test("OCR states map to My Submissions tabs and badges", () => {
  assert.equal(submissionTab(uploaded), "processing");
  assert.equal(submissionTab({ ...uploaded, jobStatus: "processing" }), "processing");

  const completed = {
    ...uploaded,
    verificationStatus: "ocr_completed",
    jobStatus: "completed",
  } as const;
  assert.equal(submissionTab(completed), "needs_verification");
  assert.deepEqual(submissionBadge(completed), { tone: "warning", label: "Needs Verification" });

  // A failed extraction waits for the user under Needs Verification, with a distinct badge.
  const failed = { ...uploaded, jobStatus: "failed" } as const;
  assert.equal(submissionTab(failed), "needs_verification");
  assert.deepEqual(submissionBadge(failed), { tone: "error", label: "Extraction Failed" });
});

test("later lifecycle states take precedence over OCR state", () => {
  const verified = {
    ...uploaded,
    verificationStatus: "user_verified",
    jobStatus: "completed",
  } as const;
  assert.equal(submissionTab({ ...verified, validationStatus: "validated" }), "validated");
  assert.equal(submissionBadge({ ...verified, validationStatus: "flagged" }).label, "Flagged");
  assert.equal(submissionTab({ ...verified, validationStatus: "failed" }), "returned");
  assert.equal(
    submissionTab({ ...verified, approvalStatus: "review_pending" }),
    "pending_approval",
  );
  assert.equal(submissionTab({ ...verified, approvalStatus: "returned" }), "returned");
  assert.equal(submissionTab({ ...verified, approvalStatus: "approved" }), "approved");
  assert.equal(submissionTab({ ...uploaded, dataQualityState: "rejected" }), "rejected");
});

test("worker stall banner only after the oldest pending job waits more than 5 minutes", () => {
  const now = new Date("2026-09-17T10:00:00Z");
  assert.equal(workerStallMinutes(null, now), null);
  assert.equal(workerStallMinutes(new Date("2026-09-17T09:55:00Z"), now), null);
  assert.equal(workerStallMinutes(new Date("2026-09-17T09:48:30Z"), now), 11);
});
