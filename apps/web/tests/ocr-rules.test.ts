import assert from "node:assert/strict";
import { test } from "node:test";
import {
  groupSubmissions,
  submissionBadge,
  submissionTab,
  workerStallMinutes,
  type RecordStatus,
  type SubmissionItem,
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
  // Verified but not yet validated: Processing, never "Validated" (Phase 8 runs validation).
  assert.equal(submissionTab(verified), "processing");
  assert.deepEqual(submissionBadge(verified), { tone: "neutral", label: "Validation Pending" });
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

test("groupSubmissions builds a tree structure for multibill PDFs with individual records underneath", () => {
  const rowSingle: SubmissionItem = {
    id: "rec-1",
    bundleDocumentId: null,
    bundleFileName: null,
    bundleDescription: null,
    bundleTotalParts: null,
    submittedAt: "2026-11-01T10:00:00Z",
    orgUnitName: "Site Alpha",
    periodLabel: "FY26-Q1",
    metricName: "Electricity consumption",
    fileName: "single_bill.pdf",
  };

  const rowBundle1: SubmissionItem = {
    id: "rec-2",
    bundleDocumentId: "bundle-123",
    bundleFileName: "Q1_combined_invoices.pdf",
    bundleDescription: "Quarterly electricity and fuel bills",
    bundleTotalParts: 2,
    submittedAt: "2026-11-02T10:00:00Z",
    orgUnitName: "Site Alpha",
    periodLabel: "FY26-Q1",
    metricName: "Electricity consumption",
    fileName: "Q1_combined_invoices (pages 1–2).pdf",
    pageFrom: 1,
    pageTo: 2,
  };

  const rowBundle2: SubmissionItem = {
    id: "rec-3",
    bundleDocumentId: "bundle-123",
    bundleFileName: "Q1_combined_invoices.pdf",
    bundleDescription: "Quarterly electricity and fuel bills",
    bundleTotalParts: 2,
    submittedAt: "2026-11-02T10:00:00Z",
    orgUnitName: "Site Alpha",
    periodLabel: "FY26-Q1",
    metricName: "Diesel consumption",
    fileName: "Q1_combined_invoices (pages 3–4).pdf",
    pageFrom: 3,
    pageTo: 4,
  };

  const grouped = groupSubmissions([rowSingle, rowBundle1, rowBundle2]);

  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].type, "single");
  if (grouped[0].type === "single") {
    assert.equal(grouped[0].record.id, "rec-1");
  }

  assert.equal(grouped[1].type, "bundle");
  if (grouped[1].type === "bundle") {
    assert.equal(grouped[1].bundleDocumentId, "bundle-123");
    assert.equal(grouped[1].bundleFileName, "Q1_combined_invoices.pdf");
    assert.equal(grouped[1].bundleDescription, "Quarterly electricity and fuel bills");
    assert.equal(grouped[1].bundleTotalParts, 2);
    assert.equal(grouped[1].records.length, 2);
    assert.equal(grouped[1].records[0].id, "rec-2");
    assert.equal(grouped[1].records[0].pageFrom, 1);
    assert.equal(grouped[1].records[0].pageTo, 2);
    assert.equal(grouped[1].records[1].id, "rec-3");
    assert.equal(grouped[1].records[1].pageFrom, 3);
    assert.equal(grouped[1].records[1].pageTo, 4);
  }
});
