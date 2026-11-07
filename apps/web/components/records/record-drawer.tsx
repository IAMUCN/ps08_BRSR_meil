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
import { EvidenceFiles } from "./evidence-files";
import { RecordCorrections } from "./record-corrections";
import { StageTracker } from "./stage-tracker";

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
  "document.type_corrected": "Document type corrected",
  "record.returned_wrong_activity": "Returned as the wrong activity",
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
  // Bumped after a correction, so the panel reads the record again.
  const [version, setVersion] = useState(0);

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
  }, [recordId, version]);

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
          // Sized by the panel, not the screen: one column while docked, document beside the values once
          // the panel is expanded.
          <div className="@container overflow-y-auto px-4 pb-6">
            <div className="grid gap-5 @4xl:grid-cols-2 @4xl:items-start">
              <div className="order-last @4xl:sticky @4xl:top-0 @4xl:order-first">
                {detail.documentId && detail.mimeType ? (
                  <DocumentViewer
                    src={`/api/documents/${detail.documentId}/file`}
                    mimeType={detail.mimeType}
                    fileName={detail.fileName ?? "Evidence"}
                    className="@4xl:h-[calc(100vh-9rem)]"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No evidence document is attached.</p>
                )}
              </div>
              <div className="min-w-0 space-y-5">
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
                <StageTracker statuses={detail.statuses} submittedBy={detail.submittedBy} />
                {detail.billNumber || detail.late || detail.duplicate ? (
                  <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {detail.billNumber ? <span>Bill no. {detail.billNumber}</span> : null}
                    {detail.late ? (
                      <span className="font-medium text-status-warning">Late submission</span>
                    ) : null}
                    {detail.duplicate ? (
                      <span className="font-medium text-status-warning">Possible duplicate</span>
                    ) : null}
                  </p>
                ) : null}

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Extracted and verified values</h3>
                  {detail.fields.length ? (
                    <dl className="divide-y rounded-md border text-sm">
                      {detail.fields.map((f) => (
                        // Two columns that share the row's baseline and wrap inside their own width, so the
                        // values line up whether the panel is docked (narrow) or expanded.
                        <div
                          key={f.label}
                          className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline gap-3 px-3 py-2"
                        >
                          <dt className="leading-5 text-muted-foreground">{f.label}</dt>
                          <dd className="font-mono leading-5 break-words">{f.value ?? "—"}</dd>
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

                <RecordCorrections detail={detail} onChanged={() => setVersion((v) => v + 1)} />

                <EvidenceFiles recordId={detail.recordId} />

                <section className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
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
                      <li
                        key={i}
                        className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline gap-3"
                      >
                        <time className="font-mono text-xs leading-5 text-muted-foreground">
                          {new Date(a.at).toLocaleString("en-IN")}
                        </time>
                        <span className="leading-5">
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
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
