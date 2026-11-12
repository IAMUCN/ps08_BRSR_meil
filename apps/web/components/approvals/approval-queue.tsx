"use client";

import { rowClick } from "@/components/ui/row-click";
import { Calculator, CheckCircle2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CalculationTraceView } from "@/components/calculation/calculation-trace";
import { DocumentThumbnail } from "@/components/document-viewer/document-thumbnail";
import { DocumentViewer } from "@/components/document-viewer/document-viewer";
import { StageTracker } from "@/components/records/stage-tracker";
import { ValidationResult } from "@/components/validation/validation-result";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { decideApprovalAction, recalculateAction } from "@/lib/approvals/actions";
import { formatNumber } from "@/lib/validation/checks";
import type { ApprovalRow } from "@/lib/trpc/routers/approvals";

const RETURN_MIN = 10;

/**
 * A record that can be decided straight from its row (Phase 2): nothing for the approver to read first —
 * no flag or failed check, not late, not a possible duplicate, not hand-entered, calculated where it must
 * be, and not the approver's own. Anything else opens the panel.
 */
function decidableFromRow(row: ApprovalRow): boolean {
  return (
    !row.ownRecord &&
    !row.selfApproval &&
    !row.manualException &&
    !row.late &&
    !row.duplicate &&
    row.results.every((r) => r.outcome === "pass") &&
    (!row.requiresCalculation || row.calculation.trace !== null)
  );
}

function formatDateTime(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

/**
 * Approval Queue (03_APP_FLOW.md §2.2; UI brief §12.5): the monitoring template (table + drawer). The
 * drawer shows the evidence, the verified values, the validation result and who submitted and verified the
 * record, then Approve (primary) or Return for correction (important, reason required).
 */
export function ApprovalQueue({
  rows,
  canRecalculate = false,
}: {
  rows: ApprovalRow[];
  /** The viewer holds `factor.manage`, so they can re-run a blocked calculation from here. */
  canRecalculate?: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decision, setDecision] = useState<"approve" | "return" | null>(null);
  // The record the decision is for: the open panel's, or a row's own buttons.
  const [decisionFor, setDecisionFor] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const selected = rows.find((r) => r.recordId === selectedId) ?? null;
  const ask = (recordId: string, kind: "approve" | "return") => {
    setDecisionFor(recordId);
    setDecision(kind);
  };

  async function recalculate(recordId: string) {
    setPending(true);
    const result = await recalculateAction(recordId);
    setPending(false);
    if (result.ok) {
      toast.success("Calculated");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function decide(reason: string) {
    if (!decisionFor || !decision) return;
    setPending(true);
    const result = await decideApprovalAction(
      decision === "approve"
        ? { recordId: decisionFor, decision }
        : { recordId: decisionFor, decision, reason },
    );
    setPending(false);
    setDecision(null);
    setDecisionFor(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(decision === "approve" ? "Approved" : "Returned for correction");
    setSelectedId(null);
    router.refresh();
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border border-table-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-table-header text-table-header-foreground">
            <tr>
              {[
                "Document",
                "Project / site",
                "Period",
                "Submitted by",
                "Verified",
                "Value",
                "Decision",
              ].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className={`px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase ${heading === "Value" ? "text-right" : ""}`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.recordId}
                onClick={rowClick(() => setSelectedId(row.recordId))}
                className="cursor-pointer border-t border-table-border bg-table-row even:bg-table-row-alt hover:bg-table-row-hover"
              >
                <td className="px-3 py-3">
                  <div className="flex items-start gap-3">
                    {row.documentId ? (
                      <DocumentThumbnail
                        documentId={row.documentId}
                        mimeType={row.mimeType}
                        label={`Preview of ${row.fileName ?? "the document"}`}
                      />
                    ) : null}
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.recordId)}
                        className="text-left font-medium text-primary-text underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {row.fileName ?? "Record"}
                      </button>
                      <span className="block text-xs leading-4 text-muted-foreground">
                        {row.metricName}
                        {row.billNumber ? ` · Bill no. ${row.billNumber}` : ""}
                        {row.manualException ? " · manual exception" : ""}
                      </span>
                      {row.late || row.duplicate ? (
                        <span className="mt-1 flex flex-wrap gap-2 text-[11px] leading-4 tracking-wide text-status-warning uppercase">
                          {row.late ? <span>Late</span> : null}
                          {row.duplicate ? <span>Possible duplicate</span> : null}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">{row.orgUnitName}</td>
                <td className="px-3 py-3">{row.periodLabel}</td>
                <td className="px-3 py-3">{row.submittedBy}</td>
                <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(row.verifiedAt)}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {row.activityValue === null ? "—" : formatNumber(row.activityValue)}{" "}
                  <span className="font-sans text-muted-foreground">{row.activityUnit}</span>
                </td>
                <td className="px-3 py-3">
                  {decidableFromRow(row) ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => ask(row.recordId, "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => ask(row.recordId, "return")}
                      >
                        Return
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs leading-4 text-muted-foreground">Open to decide</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="w-[760px] max-w-full overflow-y-auto">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="break-words">{selected.fileName ?? "Record"}</SheetTitle>
                <SheetDescription>
                  {selected.metricName} · {selected.orgUnitName} · {selected.periodLabel}
                </SheetDescription>
              </SheetHeader>
              {/* The bill beside its values once the panel is expanded (Phase 2), one column while docked. */}
              <div className="@container px-4 pb-6">
                <div className="grid gap-5 @4xl:grid-cols-2 @4xl:items-start">
                  <div className="order-last @4xl:sticky @4xl:top-0 @4xl:order-first">
                    {selected.documentId && selected.mimeType ? (
                      <DocumentViewer
                        src={`/api/documents/${selected.documentId}/file`}
                        mimeType={selected.mimeType}
                        fileName={selected.fileName ?? "document"}
                        className="h-[560px] @4xl:h-[calc(100vh-9rem)]"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No evidence document is attached.
                      </p>
                    )}
                  </div>
                  <div className="min-w-0 space-y-4">
                    <StageTracker
                      statuses={{
                        verification: "user_verified",
                        validation: "validated",
                        approval: "review_pending",
                        quality: "validated",
                      }}
                      submittedBy={selected.submittedBy}
                    />
                    {/* §12.5: the approver sees who submitted and verified without digging. */}
                    <p className="text-sm leading-5">
                      Submitted by <span className="font-medium">{selected.submittedBy}</span>,
                      verified by <span className="font-medium">{selected.verifiedBy ?? "—"}</span>
                      {selected.manualException ? " (manual exception)" : ""}.
                    </p>
                    <dl className="divide-y rounded-md border">
                      {selected.values.map((v) => (
                        <div
                          key={v.label}
                          className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline gap-3 px-3 py-2 text-sm"
                        >
                          <dt className="leading-5 text-muted-foreground">{v.label}</dt>
                          <dd className="font-mono leading-5 break-words">{v.value ?? "—"}</dd>
                        </div>
                      ))}
                    </dl>
                    <ValidationResult results={selected.results} />
                    {selected.requiresCalculation ? (
                      <CalculationTraceView state={selected.calculation} />
                    ) : null}
                    {selected.requiresCalculation &&
                    !selected.calculation.trace &&
                    canRecalculate ? (
                      <Button
                        variant="outline"
                        disabled={pending}
                        onClick={() => void recalculate(selected.recordId)}
                      >
                        <Calculator aria-hidden />
                        Run calculation
                      </Button>
                    ) : null}
                    {selected.ownRecord ? (
                      <p className="text-sm leading-5 text-status-error">
                        You submitted or verified this record, so another approver must decide on
                        it.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selected.selfApproval ? (
                          <p className="w-full text-sm leading-5 text-muted-foreground">
                            You submitted or verified this record. As a Super Admin you can still
                            decide on it; the audit trail will show that the same person did both.
                          </p>
                        ) : null}
                        <Button
                          onClick={() => ask(selected.recordId, "approve")}
                          disabled={
                            pending || (selected.requiresCalculation && !selected.calculation.trace)
                          }
                        >
                          <CheckCircle2 aria-hidden />
                          Approve
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => ask(selected.recordId, "return")}
                          disabled={pending}
                        >
                          <RotateCcw aria-hidden />
                          Return for correction
                        </Button>
                        {selected.requiresCalculation && !selected.calculation.trace ? (
                          <p className="w-full text-sm leading-5 text-status-error">
                            Approve is disabled until this record has a calculation — return it, or
                            add the conversion factor and run the calculation.
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={decision !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDecision(null);
            setDecisionFor(null);
          }
        }}
        title={decision === "approve" ? "Approve this record?" : "Return for correction?"}
        confirmLabel={decision === "approve" ? "Approve" : "Return for correction"}
        destructive={decision === "return"}
        pending={pending}
        requireReason={
          decision === "return"
            ? {
                label: "Reason",
                minLength: RETURN_MIN,
                hint: `At least ${RETURN_MIN} characters. Sent to the submitter and recorded in the audit trail.`,
              }
            : undefined
        }
        onConfirm={(reason) => void decide(reason)}
      >
        <p>
          {decision === "approve"
            ? "The record becomes approved and eligible for reporting. The decision is recorded with your name."
            : "The record goes back to the submitter to correct and confirm again."}
        </p>
      </ConfirmDialog>
    </>
  );
}
