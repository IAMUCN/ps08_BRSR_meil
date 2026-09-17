// OCR status surfacing rules (.grill/phase-6-ocr-integration-decisions.md). Pure — unit-testable.

export type OcrJobStatus = "pending" | "processing" | "completed" | "failed";

export type RecordStatus = {
  verificationStatus: "draft" | "document_uploaded" | "ocr_completed" | "user_verified";
  validationStatus: "pending" | "validated" | "flagged" | "failed" | "returned";
  approvalStatus: "not_submitted" | "review_pending" | "approved" | "returned" | "rejected";
  dataQualityState: string;
  jobStatus: OcrJobStatus | null;
};

// 03_APP_FLOW.md §2.3 My Submissions status tabs, in pipeline order.
export const SUBMISSION_TABS = [
  { key: "processing", label: "Processing" },
  { key: "needs_verification", label: "Needs Verification" },
  { key: "validated", label: "Validated" },
  { key: "pending_approval", label: "Pending Approval" },
  { key: "returned", label: "Returned" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;

export type SubmissionTab = (typeof SUBMISSION_TABS)[number]["key"];

export function isSubmissionTab(value: unknown): value is SubmissionTab {
  return SUBMISSION_TABS.some((tab) => tab.key === value);
}

/** Which My Submissions tab a record belongs to. OCR failures wait for the user under Needs Verification. */
export function submissionTab(r: RecordStatus): SubmissionTab {
  if (r.approvalStatus === "rejected" || r.dataQualityState === "rejected") return "rejected";
  if (r.approvalStatus === "approved") return "approved";
  if (
    r.approvalStatus === "returned" ||
    r.validationStatus === "returned" ||
    (r.verificationStatus === "user_verified" && r.validationStatus === "failed")
  ) {
    return "returned";
  }
  if (r.approvalStatus === "review_pending") return "pending_approval";
  if (r.verificationStatus === "user_verified") return "validated";
  if (r.verificationStatus === "ocr_completed" || r.jobStatus === "failed") {
    return "needs_verification";
  }
  return "processing";
}

export type BadgeTone = "success" | "warning" | "error" | "neutral" | "locked";

/** Status badge text and tone (UI brief §11.7) for a record. */
export function submissionBadge(r: RecordStatus): { tone: BadgeTone; label: string } {
  switch (submissionTab(r)) {
    case "processing":
      return { tone: "neutral", label: "Processing" };
    case "needs_verification":
      return r.jobStatus === "failed" && r.verificationStatus !== "ocr_completed"
        ? { tone: "error", label: "Extraction Failed" }
        : { tone: "warning", label: "Needs Verification" };
    case "validated":
      return r.validationStatus === "flagged"
        ? { tone: "warning", label: "Flagged" }
        : { tone: "success", label: "Validated" };
    case "pending_approval":
      return { tone: "neutral", label: "Pending Approval" };
    case "returned":
      return { tone: "error", label: "Returned" };
    case "approved":
      return { tone: "success", label: "Approved" };
    case "rejected":
      return { tone: "locked", label: "Rejected" };
  }
}

export const JOB_STATUS_LABELS: Record<OcrJobStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

export const JOB_STATUS_TONES: Record<OcrJobStatus, BadgeTone> = {
  pending: "neutral",
  processing: "warning",
  completed: "success",
  failed: "error",
};

/** A pending job older than this means the worker isn't picking jobs up. */
export const WORKER_STALL_MINUTES = 5;

/** Minutes the oldest pending job has waited, when that signals a stalled worker; otherwise null. */
export function workerStallMinutes(oldestPendingSince: Date | null, now: Date): number | null {
  if (!oldestPendingSince) return null;
  const minutes = Math.floor((now.getTime() - oldestPendingSince.getTime()) / 60_000);
  return minutes > WORKER_STALL_MINUTES ? minutes : null;
}

/** "3 fields need attention" / "1 field needs attention". */
export function attentionLabel(count: number): string {
  return count === 1 ? "1 field needs attention" : `${count} fields need attention`;
}
