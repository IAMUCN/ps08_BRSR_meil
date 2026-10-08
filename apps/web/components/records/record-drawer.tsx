"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalculationTraceView } from "@/components/calculation/calculation-trace";
import { DocumentViewer } from "@/components/document-viewer/document-viewer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ValidationResult } from "@/components/validation/validation-result";
import { formatQuantity } from "@/lib/calculation/trace";
import { recordDetailAction } from "@/lib/records/actions";
import type { RecordDetail } from "@/lib/trpc/routers/records";
import type { Outcome, RuleType } from "@/lib/validation/checks";
import { StageBadge } from "./stage-badge";

// The shared record detail (03_APP_FLOW.md §2.2 Submission Monitoring → "record detail view, shared
// component also used by … ESG Data Explorer"): evidence, extracted values, validation, calculation and the
// audit trail, with a link to the queue where the record can be acted on.

const EVENT_LABELS: Record<string, string> = {
  "document.uploaded": "Document uploaded",
  "document.type_selected": "Document type chosen",
  "ocr.document_processed": "OCR extracted the fields",
  "ocr.document_failed": "OCR failed",
  "ocr.job_retried": "OCR retried by an Admin",
  "verification.confirmed": "Values verified",
  "verification.field_edited": "A field was corrected",
  "verification.manual_exception": "Entered by hand (OCR failed)",
  "verification.rejected": "Rejected by the submitter",
  "validation.completed": "Validation ran",
  "validation.accepted": "Flag accepted by an Admin",
  "validation.returned": "Returned for correction",
  "calculation.completed": "Calculated",
  "calculation.blocked": "Calculation blocked",
  "approval.approved": "Approved",
  "approval.returned": "Returned by the approver",
};

/** Where this record can be acted on, if anywhere. */
function queueFor(d: RecordDetail): { href: string; label: string } | null {
  if (d.statuses.approval === "review_pending")
    return { href: "/admin/approval-queue", label: "Open the Approval Queue" };
  if (d.statuses.validation === "flagged")
    return { href: "/admin/validation-queue", label: "Open the Validation Queue" };
  if (["document_uploaded", "ocr_completed"].includes(d.statuses.verification))
    return { href: "/admin/ocr-monitoring", label: "Open OCR Monitoring" };
  return null;
}

export function RecordDrawer({
  recordId,
  onClose,
}: {
  recordId: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recordId) return;
    let live = true;
    recordDetailAction(recordId).then((result) => {
      if (!live) return;
      if (result.ok) setDetail(result.data);
      else setError(result.error);
    });
    return () => {
      live = false;
      setDetail(null);
      setError(null);
    };
  }, [recordId]);

  const queue = detail ? queueFor(detail) : null;
  return (
    <Sheet open={recordId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[760px] max-w-full">
        <SheetHeader>
          <SheetTitle>{detail?.fileName ?? detail?.metricName ?? "Record"}</SheetTitle>
          <SheetDescription>
            {detail
              ? `${detail.metricName} · ${detail.orgUnitName} · ${detail.periodLabel}`
              : (error ?? "Loading…")}
          </SheetDescription>
        </SheetHeader>
        {detail ? (
          <div className="space-y-5 overflow-y-auto px-4 pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <StageBadge row={detail.statuses} />
              <span className="text-sm text-muted-foreground">
                Submitted by {detail.submittedBy}
                {detail.verifiedBy ? `, verified by ${detail.verifiedBy}` : ""}
              </span>
              {queue ? (
                <Link
                  href={queue.href}
                  className="ml-auto text-sm font-medium underline underline-offset-2"
                >
                  {queue.label}
                </Link>
              ) : null}
            </div>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Extracted and verified values</h3>
              {detail.fields.length ? (
                <dl className="divide-y rounded-md border text-sm">
                  {detail.fields.map((f) => (
                    <div key={f.label} className="flex gap-3 px-3 py-1.5">
                      <dt className="w-40 shrink-0 text-muted-foreground">{f.label}</dt>
                      <dd className="font-mono text-xs">{f.value ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing extracted yet.</p>
              )}
              {detail.activityValue !== null ? (
                <p className="text-sm">
                  Activity value:{" "}
                  <span className="font-mono">
                    {formatQuantity(detail.activityValue, detail.activityUnit ?? "")}
                  </span>
                </p>
              ) : null}
            </section>

            {detail.results.length ? (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Validation</h3>
                <ValidationResult
                  results={detail.results.map((r) => ({
                    ruleType: r.ruleType as RuleType,
                    outcome: r.outcome as Outcome,
                    message: r.message,
                  }))}
                />
              </section>
            ) : null}

            {detail.calculation.trace || detail.calculation.blockedReason ? (
              <CalculationTraceView state={detail.calculation} />
            ) : null}

            {detail.documentId && detail.mimeType ? (
              <DocumentViewer
                src={`/api/documents/${detail.documentId}/file`}
                mimeType={detail.mimeType}
                fileName={detail.fileName ?? "Evidence"}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No evidence document is attached.</p>
            )}

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Audit trail</h3>
                <Link
                  href={`/admin/audit-trail?record=${detail.recordId}`}
                  className="text-sm font-medium underline underline-offset-2"
                >
                  View audit history
                </Link>
              </div>
              <ol className="space-y-1 text-sm">
                {detail.audit.map((a, i) => (
                  <li key={i} className="flex gap-3">
                    <time className="w-36 shrink-0 font-mono text-xs text-muted-foreground">
                      {new Date(a.at).toLocaleString("en-IN")}
                    </time>
                    <span>
                      {EVENT_LABELS[a.event] ?? a.event}
                      {a.who ? ` — ${a.who}` : " — system"}
                      {a.reason ? (
                        <span className="block text-xs text-muted-foreground">{a.reason}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
