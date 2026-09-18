"use client";

import { CheckCircle2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { DocumentViewer } from "@/components/document-viewer/document-viewer";
import { ValidationResult } from "@/components/validation/validation-result";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { RULE_TYPES, formatNumber, type RuleType } from "@/lib/validation/checks";
import type { QueueRow } from "@/lib/trpc/routers/validation";
import { reviewRecordAction } from "./actions";

const REASON_MIN = 10;

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

/** Categories that didn't pass, for the table and the category filter. */
const problemTypes = (row: QueueRow) => [
  ...new Set(row.results.filter((r) => r.outcome !== "pass").map((r) => r.ruleType)),
];

export function ValidationQueueTable({ rows }: { rows: QueueRow[] }) {
  const router = useRouter();
  const [category, setCategory] = useState<RuleType | "">("");
  const [status, setStatus] = useState<"flagged" | "failed" | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decision, setDecision] = useState<"accept" | "return" | null>(null);
  const [pending, setPending] = useState(false);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!status || r.status === status) && (!category || problemTypes(r).includes(category)),
      ),
    [rows, status, category],
  );
  const selected = rows.find((r) => r.recordId === selectedId) ?? null;

  async function decide(reason: string) {
    if (!selected || !decision) return;
    setPending(true);
    const result = await reviewRecordAction({ recordId: selected.recordId, decision, reason });
    setPending(false);
    setDecision(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(decision === "accept" ? "Reviewed" : "Returned to submitter");
    setSelectedId(null);
    router.refresh();
  }

  return (
    <>
      {/* UI brief §13.3: persistent filter bar. */}
      <div className="flex flex-wrap items-end gap-3 rounded-md border bg-surface p-3">
        <div className="space-y-1.5">
          <Label htmlFor="vq-status">Status</Label>
          <NativeSelect
            id="vq-status"
            className="w-44"
            value={status}
            onChange={(e) => setStatus(e.target.value as "flagged" | "failed" | "")}
          >
            <option value="">All</option>
            <option value="flagged">Flagged</option>
            <option value="failed">Failed</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vq-category">Category</Label>
          <NativeSelect
            id="vq-category"
            className="w-48"
            value={category}
            onChange={(e) => setCategory(e.target.value as RuleType | "")}
          >
            <option value="">All categories</option>
            {RULE_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <p className="ml-auto text-sm text-muted-foreground" aria-live="polite">
          {filtered.length} of {rows.length} records
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-table-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-table-header text-table-header-foreground">
            <tr>
              {[
                "Document",
                "Project / site",
                "Submitted by",
                "Verified",
                "Value",
                "Status",
                "Issues",
              ].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className={cn(
                    "px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase",
                    heading === "Value" && "text-right",
                  )}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="bg-table-row px-3 py-8 text-center text-muted-foreground"
                >
                  No records match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
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
                      {row.fileName ?? "No document"}
                    </button>
                    <span className="block text-xs leading-4 text-muted-foreground">
                      {row.metricName} · {row.periodLabel}
                    </span>
                  </td>
                  <td className="px-3 py-3">{row.orgUnitName}</td>
                  <td className="px-3 py-3">{row.submittedBy}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(row.verifiedAt)}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {row.activityValue === null ? "—" : formatNumber(row.activityValue)}{" "}
                    <span className="font-sans text-muted-foreground">{row.activityUnit}</span>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge tone={row.status === "flagged" ? "warning" : "error"}>
                      {row.status === "flagged" ? "Flagged" : "Failed"}
                    </StatusBadge>
                    {row.manualException ? (
                      <span className="mt-1 block text-[11px] leading-4 tracking-wide text-status-warning uppercase">
                        Manual exception
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-xs leading-4">
                    {problemTypes(row)
                      .map((t) => RULE_TYPES.find((r) => r.key === t)?.label)
                      .join(", ")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* UI brief §11.6: 720px drawer for document-heavy detail, so the table context stays put. */}
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="overflow-y-auto data-[side=right]:sm:max-w-[720px]">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="break-words">{selected.fileName ?? "Record"}</SheetTitle>
                <SheetDescription>
                  {selected.metricName} · {selected.orgUnitName} · {selected.periodLabel} ·
                  submitted by {selected.submittedBy}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge tone={selected.status === "flagged" ? "warning" : "error"}>
                    {selected.status === "flagged" ? "Flagged" : "Failed"}
                  </StatusBadge>
                  <span className="text-sm">
                    Verified value:{" "}
                    <span className="font-mono">
                      {selected.activityValue === null ? "—" : formatNumber(selected.activityValue)}
                    </span>{" "}
                    {selected.activityUnit}
                  </span>
                </div>
                <ValidationResult results={selected.results} />
                {selected.status === "flagged" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setDecision("accept")} disabled={pending}>
                      <CheckCircle2 aria-hidden />
                      Accept
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setDecision("return")}
                      disabled={pending}
                    >
                      <RotateCcw aria-hidden />
                      Return to submitter
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm leading-5 text-muted-foreground">
                    Failed records are back with the submitter — only their correction clears them.
                  </p>
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
        title={decision === "accept" ? "Accept this record?" : "Return to the submitter?"}
        confirmLabel={decision === "accept" ? "Accept" : "Return to submitter"}
        destructive={decision === "return"}
        pending={pending}
        requireReason={{
          label: "Reason",
          minLength: REASON_MIN,
          hint: `At least ${REASON_MIN} characters. Recorded in the audit trail${decision === "return" ? " and sent to the submitter" : ""}.`,
        }}
        onConfirm={(reason) => void decide(reason)}
      >
        <p>
          {decision === "accept"
            ? "The flag is cleared and the record moves on to calculation."
            : "The record goes back to the submitter to correct and confirm again."}
        </p>
      </ConfirmDialog>
    </>
  );
}
