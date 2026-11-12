"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { VerifyDocument } from "@/lib/trpc/routers/verification";
import { changeActivityAction } from "@/app/app/verify/[documentId]/actions";

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

/**
 * The record's ESG activity on Verify Extraction (owner's request, 2026-11-12): every activity the Upload page
 * offers for this project, and, when OCR thinks the document belongs to another activity, a category-mismatch
 * flag naming the likely one. The server checks the choice again and reads the document again for the new
 * activity's fields.
 */
export function ActivityPicker({ doc, disabled }: { doc: VerifyDocument; disabled: boolean }) {
  const router = useRouter();
  const selectId = useId();
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const failed = doc.state === "failed";
  const mismatch = doc.activityMismatch;
  const nameOf = (id: string) =>
    doc.activityOptions.flatMap((c) => c.metrics).find((m) => m.id === id)?.name ?? "";

  async function change() {
    if (!target) return;
    setPending(true);
    setError(null);
    const result = await changeActivityAction(doc.documentId, target.id);
    setPending(false);
    setTarget(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(
      result.data.reread
        ? `Filed under ${result.data.metricName}. The document is being read again.`
        : `Filed under ${result.data.metricName}.`,
    );
    router.refresh();
  }

  const suggested = mismatch?.activities ?? [];
  const selectable = suggested.filter((a) => a.selectable);

  return (
    <div className="space-y-3">
      {mismatch ? (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-status-warning/50 bg-status-warning/10 p-3"
        >
          <p className="flex items-center gap-2 text-sm leading-5 font-semibold">
            <AlertTriangle className="size-4 text-status-warning" aria-hidden />
            Category mismatch
          </p>
          <p className="text-sm leading-5">
            This looks like {article(mismatch.typeName)} {mismatch.typeName}, but it was uploaded as{" "}
            <span className="font-medium">{doc.metricName}</span>.
            {suggested.length ? (
              <>
                {" "}
                It may belong to{" "}
                <span className="font-medium">{suggested.map((a) => a.name).join(" or ")}</span>
                {selectable.length ? " — change the activity below." : "."}
              </>
            ) : null}
          </p>
          {selectable.length ? (
            <div className="flex flex-wrap gap-2">
              {selectable.map((a) => (
                <Button
                  key={a.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled || pending}
                  onClick={() => setTarget({ id: a.id, name: a.name })}
                >
                  Change to {a.name}
                </Button>
              ))}
            </div>
          ) : suggested.length ? (
            <p className="text-xs leading-4 text-muted-foreground">
              That activity is uploaded by another role. Reject this document so the right person
              uploads it.
            </p>
          ) : null}
          <p className="text-xs leading-4 text-muted-foreground">
            If the activity is right, carry on — the mismatch is flagged for review after you
            confirm.
          </p>
        </div>
      ) : null}

      {doc.activityOptions.length ? (
        <div className="space-y-1.5">
          <Label htmlFor={selectId}>ESG activity</Label>
          <NativeSelect
            id={selectId}
            value={doc.metricId ?? ""}
            disabled={disabled || pending}
            aria-invalid={mismatch ? true : undefined}
            onChange={(event) => {
              const id = event.target.value;
              if (id && id !== doc.metricId) setTarget({ id, name: nameOf(id) });
            }}
          >
            {doc.activityOptions.map((category) => (
              <optgroup key={category.id} label={category.name}>
                {category.metrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.unit})
                  </option>
                ))}
              </optgroup>
            ))}
          </NativeSelect>
          <p className="text-xs leading-4 text-muted-foreground">
            Uploaded under the wrong activity? Choose the right one before confirming.
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm leading-5 text-status-error">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title={`Change the activity to ${target?.name ?? ""}?`}
        confirmLabel="Change activity"
        pending={pending}
        onConfirm={() => void change()}
      >
        <p>
          {failed
            ? `The record moves from ${doc.metricName} to ${target?.name}, and you enter that activity's values by hand.`
            : `The record moves from ${doc.metricName} to ${target?.name}. The document is read again for that activity's fields; values you edited here are discarded.`}
        </p>
      </ConfirmDialog>
    </div>
  );
}
