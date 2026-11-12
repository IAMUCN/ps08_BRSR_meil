"use client";

import { CalendarRange } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { VerifyDocument } from "@/lib/trpc/routers/verification";
import { changePeriodAction, recheckAction } from "@/app/app/verify/[documentId]/actions";

/**
 * The record's reporting period on Verify Extraction (owner's request, 2026-11-13): it can be moved before the
 * values are confirmed, or when the record comes back for correction — e.g. a May bill filed under June. When
 * the billing period points to another month, that month is offered in one click. The server checks again.
 */
export function PeriodPicker({ doc, disabled }: { doc: VerifyDocument; disabled: boolean }) {
  const router = useRouter();
  const selectId = useId();
  const [choice, setChoice] = useState(doc.periodId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(periodId: string) {
    setPending(true);
    setError(null);
    const result = await changePeriodAction(doc.documentId, periodId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setChoice(doc.periodId ?? "");
      return;
    }
    const checked =
      result.data.validation === "failed"
        ? " Checked again: it still needs correcting."
        : result.data.validation
          ? " Checked again: it passes now."
          : "";
    toast.success(
      `Moved to ${result.data.label}${result.data.late ? " — marked as a late submission" : ""}.${checked}`,
    );
    router.refresh();
  }

  async function recheck() {
    setPending(true);
    setError(null);
    const result = await recheckAction(doc.documentId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(
      result.data.validation === "failed"
        ? `Checked again in ${doc.periodLabel}: it still needs correcting.`
        : `Checked again in ${doc.periodLabel}: it passes now.`,
    );
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {doc.recheckAfterMove ? (
        <div
          role="note"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-status-warning/50 bg-status-warning/10 p-3 text-sm leading-5 text-foreground"
        >
          <span>
            This record was moved to <span className="font-medium">{doc.periodLabel}</span> after
            the checks below ran.
          </span>
          <Button
            type="button"
            size="sm"
            disabled={disabled || pending}
            onClick={() => void recheck()}
          >
            Check again in {doc.periodLabel}
          </Button>
        </div>
      ) : null}
      {doc.suggestedPeriod ? (
        <div
          role="note"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-status-warning/50 bg-status-warning/10 p-3 text-sm leading-5 text-foreground"
        >
          <span className="flex items-start gap-2">
            <CalendarRange className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
            <span>
              The billing period points to{" "}
              <span className="font-medium">{doc.suggestedPeriod.label}</span>, but this record is
              filed under <span className="font-medium">{doc.periodLabel}</span>.
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            disabled={disabled || pending}
            onClick={() => void move(doc.suggestedPeriod!.id)}
          >
            Move to {doc.suggestedPeriod.label}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor={selectId}>Reporting period</Label>
          <NativeSelect
            id={selectId}
            value={choice}
            disabled={disabled || pending}
            onChange={(e) => setChoice(e.target.value)}
          >
            {doc.periodOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.late ? " (late submission)" : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || pending || !choice || choice === doc.periodId}
          onClick={() => void move(choice)}
        >
          Move
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm leading-5 text-status-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
