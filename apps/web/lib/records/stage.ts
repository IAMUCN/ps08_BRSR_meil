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
