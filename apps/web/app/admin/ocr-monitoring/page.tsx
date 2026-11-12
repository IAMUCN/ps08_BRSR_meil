import { redirect } from "next/navigation";
import { requireAdminAreaSession } from "@/lib/auth/session";

// Phase 3 (feature_enhancement.md 3.1): OCR Monitoring is part of Submission Monitoring now — an OCR
// column and filter, the stalled-worker warning, and Retry in the record panel. Old links land there.
export default async function OcrMonitoringPage() {
  await requireAdminAreaSession();
  redirect("/admin/submissions?ocr=attention");
}
