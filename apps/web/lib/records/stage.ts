// One label for where a record is in the pipeline (UI brief §11.7), derived from its four status columns in
// the same order My Submissions uses. Pure, so it is testable and shared by every table and drawer.
import type { StatusTone } from "@/components/ui/status-badge";

export type Statuses = {
  verification: string;
  validation: string;
  approval: string;
  quality: string;
};

export function stageOf(s: Statuses): { tone: StatusTone; label: string } {
  if (s.quality === "rejected") return { tone: "locked", label: "Rejected" };
  if (s.approval === "approved") return { tone: "success", label: "Approved" };
  if (s.approval === "returned" || s.validation === "returned")
    return { tone: "error", label: "Returned" };
  if (s.approval === "review_pending") return { tone: "warning", label: "Pending approval" };
  if (s.validation === "failed") return { tone: "error", label: "Validation failed" };
  if (s.validation === "flagged") return { tone: "warning", label: "Flagged" };
  if (s.verification === "ocr_completed") return { tone: "warning", label: "Needs verification" };
  if (s.verification === "user_verified") return { tone: "neutral", label: "Verified" };
  return { tone: "neutral", label: "Processing" };
}

/** One step of the stage tracker (feature_enhancement.md 2.2). */
export type Step = { label: string; state: "done" | "current" | "todo" | "stopped" };

export type Track = {
  steps: Step[];
  /** Who has to act now: a person's name or a role. Null when nothing is waiting. */
  waitingOn: string | null;
  /** What that person does next, in a few words. */
  nextAction: string | null;
};

const STEP_LABELS = [
  "Uploaded",
  "Read by OCR",
  "Checked by uploader",
  "Validated",
  "Approved",
] as const;

/**
 * Where a record stands in the five steps, who it waits on and what happens next. Derived from the same
 * four status columns as `stageOf`, so the tracker and the badge never disagree.
 */
export function trackOf(s: Statuses, submittedBy: string): Track {
  const at = (current: number, state: "current" | "stopped" = "current"): Step[] =>
    STEP_LABELS.map((label, i) => ({
      label,
      state: i < current ? "done" : i === current ? state : "todo",
    }));
  const reached = (): number => {
    if (s.verification === "document_uploaded") return 1;
    if (s.verification === "ocr_completed") return 2;
    if (s.approval === "review_pending" || s.approval === "approved") return 4;
    return 3;
  };

  if (s.quality === "rejected") {
    return {
      steps: at(reached(), "stopped"),
      waitingOn: null,
      nextAction: "Rejected. A corrected document can be uploaded as its new version.",
    };
  }
  if (s.approval === "approved") {
    return {
      steps: STEP_LABELS.map((label) => ({ label, state: "done" })),
      waitingOn: null,
      nextAction: null,
    };
  }
  if (s.approval === "returned" || s.validation === "returned" || s.validation === "failed") {
    return {
      steps: at(2),
      waitingOn: submittedBy,
      nextAction: "Correct the values and confirm again.",
    };
  }
  if (s.approval === "review_pending") {
    return { steps: at(4), waitingOn: "An approver", nextAction: "Approve or return it." };
  }
  if (s.validation === "flagged") {
    return {
      steps: at(3),
      waitingOn: "A reviewer (Validation Queue)",
      nextAction: "Accept the flag or return the record.",
    };
  }
  if (s.verification === "ocr_completed") {
    return {
      steps: at(2),
      waitingOn: submittedBy,
      nextAction: "Check the extracted values and confirm them.",
    };
  }
  if (s.verification === "user_verified") {
    return { steps: at(3), waitingOn: "The system", nextAction: "Validation runs on its own." };
  }
  return { steps: at(1), waitingOn: "OCR", nextAction: "The document is being read." };
}
