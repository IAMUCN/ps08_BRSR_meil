"use client";

import { CheckCircle2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DocumentViewer } from "@/components/document-viewer/document-viewer";
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
import { decideApprovalAction } from "@/lib/approvals/actions";
import { formatNumber } from "@/lib/validation/checks";
import type { ApprovalRow } from "@/lib/trpc/routers/approvals";

const RETURN_MIN = 10;

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
export function ApprovalQueue({ rows }: { rows: ApprovalRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decision, setDecision] = useState<"approve" | "return" | null>(null);
  const [pending, setPending] = useState(false);
  const selected = rows.find((r) => r.recordId === selectedId) ?? null;

  async function decide(reason: string) {
    if (!selected || !decision) return;
    setPending(true);
    const result = await decideApprovalAction(
      decision === "approve"
        ? { recordId: selected.recordId, decision }
        : { recordId: selected.recordId, decision, reason },
    );
    setPending(false);
    setDecision(null);
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
              {["Document", "Project / site", "Period", "Submitted by", "Verified", "Value"].map(
                (heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className={`px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase ${heading === "Value" ? "text-right" : ""}`}
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.recordId}
                className="border-t border-table-border bg-table-row even:bg-table-row-alt hover:bg-table-row-hover"
              >
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.recordId)}
                    className="text-left font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {row.fileName ?? "Record"}
                  </button>
                  <span className="block text-xs leading-4 text-muted-foreground">
                    {row.metricName}
                    {row.manualException ? " · manual exception" : ""}
                  </span>
                </td>
                <td className="px-3 py-3">{row.orgUnitName}</td>
                <td className="px-3 py-3">{row.periodLabel}</td>
                <td className="px-3 py-3">{row.submittedBy}</td>
                <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(row.verifiedAt)}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {row.activityValue === null ? "—" : formatNumber(row.activityValue)}{" "}
                  <span className="font-sans text-muted-foreground">{row.activityUnit}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="overflow-y-auto data-[side=right]:sm:max-w-[720px]">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="break-words">{selected.fileName ?? "Record"}</SheetTitle>
                <SheetDescription>
                  {selected.metricName} · {selected.orgUnitName} · {selected.periodLabel}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                {/* §12.5: the approver sees who submitted and verified without digging. */}
                <p className="text-sm leading-5">
                  Submitted by <span className="font-medium">{selected.submittedBy}</span>, verified
                  by <span className="font-medium">{selected.verifiedBy ?? "—"}</span>
                  {selected.manualException ? " (manual exception)" : ""}.
                </p>
                <dl className="divide-y rounded-md border">
                  {selected.values.map((v) => (
                    <div key={v.label} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <dt className="w-40 shrink-0 text-muted-foreground">{v.label}</dt>
                      <dd className="font-mono break-words">{v.value ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
                <ValidationResult results={selected.results} />
                <p className="rounded-md border border-dashed p-3 text-xs leading-4 text-muted-foreground">
                  Calculation trace — development placeholder: emissions are calculated from Phase
                  9.
                </p>
                {selected.ownRecord ? (
                  <p className="text-sm leading-5 text-status-error">
                    You submitted or verified this record, so another approver must decide on it.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setDecision("approve")} disabled={pending}>
                      <CheckCircle2 aria-hidden />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setDecision("return")}
                      disabled={pending}
                    >
                      <RotateCcw aria-hidden />
                      Return for correction
                    </Button>
                  </div>
                )}
                {selected.documentId && selected.mimeType ? (
                  <DocumentViewer
                    src={`/api/documents/${selected.documentId}/file`}
                    mimeType={selected.mimeType}
                    fileName={selected.fileName ?? "document"}
                    className="h-[560px]"
                  />
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={decision !== null}
        onOpenChange={(open) => !open && setDecision(null)}
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
