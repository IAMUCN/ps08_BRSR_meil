"use client";

import { AlertTriangle, CheckCircle2, Download, Loader2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { ValidationResult } from "@/components/validation/validation-result";
import { ActivityPicker } from "@/components/verification/activity-picker";
import { PeriodPicker } from "@/components/verification/period-picker";
import { FieldRow } from "@/components/verification/field-row";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  MANUAL_JUSTIFICATION_MIN,
  REJECT_REASON_MIN,
  checkConfirm,
  isFlagged,
  isResolved,
  type FieldEntry,
} from "@/lib/verification/rules";
import type { VerifyDocument } from "@/lib/trpc/routers/verification";
import {
  checkInvoiceDuplicatesAction,
  confirmManualEntryAction,
  confirmVerificationAction,
  rejectDocumentAction,
  setDocumentTypeAction,
} from "@/app/app/verify/[documentId]/actions";
import { EvidenceFiles } from "@/components/records/evidence-files";
import { submittedLabel } from "@/lib/documents/bundle";

const INVOICE_FIELD = "invoice_number";

/**
 * Right panel of Verify Extraction (UI brief §12.2): document type, fields with confidence, the guard
 * rail, and the Confirm/Reject actions. The same rules run on the server — this panel only explains them.
 */
/**
 * The fields as a spreadsheet (Phase 3): what OCR read, its confidence, whether it needs review and the value
 * as it stands now. Built in the browser from what is on screen; the library loads only when asked for.
 */
async function downloadFieldsWorkbook(
  doc: VerifyDocument,
  entries: Record<string, FieldEntry>,
): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Extracted values");
  sheet.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Read by OCR", key: "ocr", width: 30 },
    { header: "Confidence (%)", key: "confidence", width: 15 },
    { header: "Needs review", key: "review", width: 14 },
    { header: "Value now", key: "value", width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const field of doc.fields) {
    const entry = entries[field.id] ?? { value: "", acknowledged: false };
    const unresolved = !isResolved(field, entry, doc.threshold);
    const row = sheet.addRow({
      field: field.label,
      ocr: field.extractedValue ?? "(not found)",
      confidence: field.confidence === null ? null : Math.round(field.confidence),
      review: isFlagged(field, doc.threshold) ? (unresolved ? "Yes" : "Checked") : "No",
      value: entry.value,
    });
    if (unresolved) {
      row.getCell("ocr").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFDE2E1" },
      };
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  link.download = `${doc.fileName.replace(/\.[^.]+$/, "")} - extracted values.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function VerifyWorkspace({
  doc,
  selectedKey = null,
  onSelectKey,
  diagnostics = {},
}: {
  doc: VerifyDocument;
  /** The field boxed on the document (Phase 3); rows and boxes select each other. */
  selectedKey?: string | null;
  onSelectKey?: (key: string) => void;
  /** Why OCR did not read a field, per field key. */
  diagnostics?: Record<string, string>;
}) {
  const router = useRouter();
  const manual = doc.state === "failed";
  const returned = doc.state === "returned";
  // A returned record reopens with its prior confirmed values (03_APP_FLOW.md §4.8 step 3).
  const initialValue = (f: VerifyDocument["fields"][number]) =>
    // A value OCR did not find starts as the one typed at upload (migration 0077), for the person to check.
    (returned ? f.verifiedValue : null) ?? f.extractedValue ?? f.typed?.value ?? "";
  const [entries, setEntries] = useState<Record<string, FieldEntry>>(() =>
    Object.fromEntries(
      doc.fields.map((f) => [f.id, { value: initialValue(f), acknowledged: false }]),
    ),
  );
  // Per-field validation state (UI brief §12.2 item 4) from the last run, worst outcome per field.
  const fieldValidation = new Map<string, { outcome: "fail" | "flagged"; message: string }>();
  for (const r of doc.validation?.results ?? []) {
    if (!r.field || r.outcome === "pass") continue;
    const current = fieldValidation.get(r.field);
    if (!current || (current.outcome === "flagged" && r.outcome === "fail")) {
      fieldValidation.set(r.field, { outcome: r.outcome, message: r.message });
    }
  }
  const [documentTypeId, setDocumentTypeId] = useState(doc.documentTypeId ?? "");
  const [justification, setJustification] = useState("");
  const [duplicates, setDuplicates] = useState(0);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Plain async handlers, not a transition: a transition that also navigates aborts the action's
  // request (the upload form follows the same pattern).
  const [pending, setPending] = useState(false);

  const dirty = doc.fields.some((f) => (entries[f.id]?.value ?? "") !== initialValue(f));

  // Unsaved edits live only in this page until Confirm (.grill/phase-7-ocr-verification-decisions.md).
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const invoiceField = doc.fields.find((f) => f.key === INVOICE_FIELD);
  const invoiceValue = invoiceField ? (entries[invoiceField.id]?.value ?? "") : "";

  // Duplicate invoice numbers are a warning to acknowledge, never a block (03_APP_FLOW.md §2.3).
  useEffect(() => {
    const value = invoiceValue.trim();
    const timer = setTimeout(async () => {
      if (!invoiceField || !value) {
        setDuplicates(0);
        return;
      }
      const result = await checkInvoiceDuplicatesAction(doc.documentId, value);
      if (result.ok) {
        setDuplicates(result.data.count);
        if (result.data.count === 0) setDuplicateAcknowledged(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [doc.documentId, invoiceField, invoiceValue]);

  const check = checkConfirm(doc.fields, entries, manual ? null : doc.threshold, {
    documentTypeSelected: Boolean(documentTypeId),
    duplicates,
    duplicateAcknowledged,
  });
  const justificationShort = justification.trim().length < MANUAL_JUSTIFICATION_MIN;
  const blockedReason = manual
    ? (check.blockedReason ??
      (justificationShort
        ? `Explain why you're entering values by hand (at least ${MANUAL_JUSTIFICATION_MIN} characters).`
        : null))
    : check.blockedReason;

  async function run(action: () => Promise<{ ok: boolean; error?: string; data?: unknown }>) {
    setFailure(null);
    setPending(true);
    const result = (await action()) as
      | {
          ok: true;
          data: { status?: string; duplicates?: number; validation?: string } | null;
        }
      | { ok: false; error: string };
    setPending(false);
    setConfirmOpen(false);
    setManualOpen(false);
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    if (result.data?.status === "confirm_duplicate") {
      setDuplicates(result.data.duplicates ?? 1);
      setDuplicateAcknowledged(false);
      setFailure("This invoice number is already recorded — review the warning below.");
      return;
    }
    // Validation ran in the same transaction (schema §20.3): say what actually happened.
    const outcome = result.data?.validation;
    if (outcome === "failed") {
      toast.error(
        "Verified, but validation found problems — the record is back with you to correct.",
      );
      router.push("/app/submissions?tab=returned");
    } else if (outcome === "flagged") {
      toast.success("Verified — flagged for review by an Admin.");
      router.push("/app/submissions?tab=validated");
    } else {
      toast.success("Verified and validated — sent for approval.");
      router.push("/app/submissions?tab=pending_approval");
    }
  }

  async function saveDocumentType(next: string) {
    setDocumentTypeId(next);
    if (!next) return;
    const result = await setDocumentTypeAction(doc.documentId, next);
    if (!result.ok) {
      setFailure(result.error);
      setDocumentTypeId(doc.documentTypeId ?? "");
    }
  }

  return (
    <div className="flex max-h-[calc(100vh-10rem)] min-h-[480px] flex-col rounded-lg border bg-card">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 border-b p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {[
              // With a picker below, the activity is shown (and changed) there.
              ...(doc.activityOptions.length ? [] : [["ESG activity", doc.metricName ?? "—"]]),
              ["Project / site", doc.orgUnitName],
              // With a picker below, the period is shown (and changed) there.
              ...(doc.periodOptions.length ? [] : [["Reporting period", doc.periodLabel]]),
              ["Uploaded by", doc.uploadedByName],
              ["Submitted on", submittedLabel(doc.uploadedAt)],
            ].map(([term, value]) => (
              <div key={term}>
                <dt className="text-xs leading-4 text-muted-foreground">{term}</dt>
                <dd className="leading-5 font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <ActivityPicker doc={doc} disabled={pending} />
          {doc.periodOptions.length ? (
            // Keyed by the month: after a move the picker starts again from the record's new month.
            <PeriodPicker key={doc.periodId} doc={doc} disabled={pending} />
          ) : null}

          {/* Master Approach §12: no document type, no verification. */}
          {doc.documentTypeId && doc.documentTypeName ? (
            <p className="text-sm leading-5">
              <span className="text-muted-foreground">Document type: </span>
              <span className="font-medium">{doc.documentTypeName}</span>
            </p>
          ) : (
            <div className="space-y-2 rounded-md border border-status-warning/50 bg-status-warning/10 p-3">
              <Label htmlFor="document-type">
                Document type not identified — select it to continue
              </Label>
              <NativeSelect
                id="document-type"
                value={documentTypeId}
                disabled={pending}
                onChange={(event) => void saveDocumentType(event.target.value)}
              >
                <option value="">Select a document type…</option>
                {doc.documentTypeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
        </div>

        {returned ? (
          <div className="space-y-3 border-b bg-status-error/5 p-4">
            <p className="flex items-center gap-2 text-sm leading-5 font-semibold">
              <AlertTriangle className="size-4 text-status-error" aria-hidden />
              Returned for correction
            </p>
            {doc.returnReason ? <p className="text-sm leading-5">{doc.returnReason}</p> : null}
            <p className="text-sm leading-5 text-muted-foreground">
              Correct the values below and confirm again — validation runs from the top.
            </p>
            {doc.validation ? <ValidationResult results={doc.validation.results} /> : null}
          </div>
        ) : null}

        {manual ? (
          <div className="border-b bg-status-error/5 p-4">
            <p className="flex items-center gap-2 text-sm leading-5 font-semibold">
              <AlertTriangle className="size-4 text-status-error" aria-hidden />
              Extraction failed
            </p>
            <p className="mt-1 text-sm leading-5">{doc.errorMessage}</p>
            <p className="mt-2 text-sm leading-5 text-muted-foreground">
              Upload a clearer copy, or enter the values manually below — manual entries are flagged
              for Admin review and are not the normal workflow.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href={`/app/upload?replaces=${doc.documentId}`}>
                <Upload aria-hidden />
                Re-upload a clearer copy
              </Link>
            </Button>
          </div>
        ) : null}

        {doc.recordId ? <EvidenceFiles recordId={doc.recordId} /> : null}

        {doc.typedTotal ? <TypedTotal total={doc.typedTotal} /> : null}

        <div className="flex items-center justify-between gap-3 border-b px-4 py-2 text-xs leading-4 text-muted-foreground">
          <span>
            Pick a value to see where it was read on the document. Values in red need checking.
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() =>
              void downloadFieldsWorkbook(doc, entries).catch(() =>
                toast.error("The spreadsheet could not be made. Try again."),
              )
            }
          >
            <Download aria-hidden />
            Download as Excel
          </Button>
        </div>
        <ul className="divide-y">
          {doc.fields.map((field) => {
            const entry = entries[field.id] ?? { value: "", acknowledged: false };
            return (
              <FieldRow
                key={field.id}
                field={field}
                entry={entry}
                threshold={manual ? null : doc.threshold}
                error={check.errors[field.id] ?? null}
                validation={returned ? (fieldValidation.get(field.key) ?? null) : null}
                disabled={pending}
                onChange={(next) => setEntries((current) => ({ ...current, [field.id]: next }))}
                selected={selectedKey === field.key}
                onSelect={onSelectKey ? () => onSelectKey(field.key) : undefined}
                diagnostic={diagnostics[field.key] ?? null}
              />
            );
          })}
        </ul>

        {manual ? (
          <div className="space-y-2 border-t p-4">
            <Label htmlFor="manual-justification">Why are you entering these values by hand?</Label>
            <textarea
              id="manual-justification"
              rows={3}
              value={justification}
              disabled={pending}
              onChange={(event) => setJustification(event.target.value)}
              placeholder="e.g. The scan is too faint to extract, values read from the paper invoice."
              className="w-full rounded-sm border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <p className="text-xs leading-4 text-muted-foreground">
              At least {MANUAL_JUSTIFICATION_MIN} characters. Recorded with your name for Admin
              review.
            </p>
          </div>
        ) : null}

        {duplicates > 0 ? (
          <div role="alert" className="border-t border-status-warning/50 bg-status-warning/10 p-4">
            <p className="flex items-center gap-2 text-sm leading-5 font-semibold">
              <AlertTriangle className="size-4 text-status-warning" aria-hidden />
              Possible duplicate
            </p>
            <p className="mt-1 text-sm leading-5">
              {duplicates === 1 ? "Another record" : `${duplicates} other records`} for{" "}
              {doc.orgUnitName} in {doc.periodLabel} already carry invoice number{" "}
              <span className="font-mono">{invoiceValue.trim()}</span>.
            </p>
            <label className="mt-2 flex items-center gap-2 text-sm leading-5">
              <input
                type="checkbox"
                checked={duplicateAcknowledged}
                onChange={(event) => setDuplicateAcknowledged(event.target.checked)}
                className="size-4"
              />
              I&apos;ve checked — this is a separate document.
            </label>
          </div>
        ) : null}

        {failure ? (
          <p
            role="alert"
            className="border-t border-status-error/40 bg-status-error/10 p-4 text-sm leading-5"
          >
            {failure}
          </p>
        ) : null}
      </div>

      {/* Actions stay pinned at the bottom of the panel (UI brief §12.2), always visible. */}
      <div className="space-y-2 rounded-b-lg border-t bg-card p-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="destructive" disabled={pending} onClick={() => setRejectOpen(true)}>
            Reject
          </Button>
          <Button
            disabled={pending || blockedReason !== null}
            aria-describedby={blockedReason ? "confirm-blocked" : undefined}
            onClick={() => (manual ? setManualOpen(true) : setConfirmOpen(true))}
          >
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 aria-hidden />
            )}
            Confirm
          </Button>
        </div>
        <p
          id="confirm-blocked"
          className={cn(
            "text-right text-xs leading-4",
            blockedReason ? "text-status-warning" : "text-muted-foreground",
          )}
        >
          {blockedReason ??
            "Confirmed values are recorded against this record and sent for validation."}
        </p>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm these values?"
        confirmLabel="Confirm values"
        pending={pending}
        onConfirm={() =>
          void run(() =>
            confirmVerificationAction({
              documentId: doc.documentId,
              fields: doc.fields.map((f) => ({
                id: f.id,
                value: entries[f.id]?.value ?? "",
                acknowledged: entries[f.id]?.acknowledged ?? false,
              })),
              acknowledgeDuplicate: duplicateAcknowledged,
            }),
          )
        }
      >
        <p>
          You are confirming these values as correct for {doc.metricName} at {doc.orgUnitName},{" "}
          {doc.periodLabel}. They become the record&apos;s reported figures.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        title="Record a manual exception?"
        confirmLabel="Record manual exception"
        pending={pending}
        onConfirm={() =>
          void run(() =>
            confirmManualEntryAction({
              documentId: doc.documentId,
              values: doc.fields.map((f) => ({ key: f.key, value: entries[f.id]?.value ?? "" })),
              justification: justification.trim(),
              acknowledgeDuplicate: duplicateAcknowledged,
            }),
          )
        }
      >
        <p>
          These values did not come from OCR. The record will be flagged as a manual exception,
          visible to Admin, with your justification attached.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject this document?"
        confirmLabel="Reject document"
        destructive
        pending={pending}
        requireReason={{
          label: "Reason",
          minLength: REJECT_REASON_MIN,
          hint: `At least ${REJECT_REASON_MIN} characters. Shown in My Submissions and recorded in the audit trail.`,
        }}
        onConfirm={(reason) =>
          void (async () => {
            setPending(true);
            const result = await rejectDocumentAction(doc.documentId, reason);
            setPending(false);
            setRejectOpen(false);
            if (!result.ok) {
              setFailure(result.error);
              return;
            }
            toast.success("Document rejected");
            router.push("/app/submissions?tab=rejected");
          })()
        }
      >
        <p>
          {doc.fileName} is not usable evidence. The file is kept, but the record won&apos;t be
          reported.
        </p>
      </ConfirmDialog>
    </div>
  );
}

/** This bill is one of several whose total was typed at upload: the bills and the totals so far. */
function TypedTotal({ total }: { total: NonNullable<VerifyDocument["typedTotal"]> }) {
  const mismatch = total.fields.some((f) => f.status === "mismatch");
  return (
    <div
      className={cn(
        "space-y-2 border-b p-4 text-sm leading-5",
        mismatch ? "bg-status-error/5" : "bg-muted/40",
      )}
    >
      <p className="font-semibold">
        One of {total.bills.length} bills whose total you typed at upload
      </p>
      <ul className="space-y-1">
        {total.fields.map((f) => (
          <li key={f.label}>
            {f.label}: typed{" "}
            <span className="font-mono">
              {f.typed}
              {f.unit ? ` ${f.unit}` : ""}
            </span>
            {f.status === "waiting"
              ? " — checked once every bill has been read."
              : f.status === "match"
                ? " — the bills add up to it."
                : ` — the bills add up to ${f.sum === null ? "a total that can't be compared" : f.sum.toLocaleString("en-IN", { maximumFractionDigits: 6 })}${f.unit ? ` ${f.unit}` : ""}. Check each bill; a difference left is flagged for review.`}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Bills:{" "}
        {total.bills.map((b, i) => (
          <span key={b.documentId ?? i}>
            {i > 0 ? ", " : ""}
            {b.isThis || !b.documentId ? (
              <span className="font-medium text-foreground">{b.fileName ?? "this bill"}</span>
            ) : (
              <Link href={`/app/verify/${b.documentId}`} className="underline">
                {b.fileName}
              </Link>
            )}
            {b.verified ? " (confirmed)" : ""}
          </span>
        ))}
      </p>
    </div>
  );
}
