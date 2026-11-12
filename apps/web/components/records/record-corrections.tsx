"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { correctDocumentTypeAction, returnWrongActivityAction } from "@/lib/records/actions";
import type { RecordDetail } from "@/lib/trpc/routers/records";

const SOURCE: Record<"ocr" | "person" | "admin", string> = {
  ocr: "suggested by OCR",
  person: "chosen by the uploader",
  admin: "corrected by an Admin",
};

/**
 * Phase 2: an Admin corrects a record's document type (the label only), or returns a record uploaded as the
 * wrong activity so it is uploaded again. The server checks scope, state and the reason again.
 */
export function RecordCorrections({
  detail,
  onChanged,
}: {
  detail: RecordDetail;
  onChanged: () => void;
}) {
  const router = useRouter();
  const typeFieldId = useId();
  const [typeId, setTypeId] = useState(detail.documentType?.id ?? "");
  const [askType, setAskType] = useState(false);
  const [askReturn, setAskReturn] = useState(false);
  const [pending, setPending] = useState(false);
  const closed = detail.statuses.quality === "rejected";
  const approved = detail.statuses.approval === "approved";
  if (!detail.documentId || closed) return null;

  async function run(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    done: string,
  ) {
    setPending(true);
    const result = await action();
    setPending(false);
    setAskType(false);
    setAskReturn(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(done);
    onChanged();
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-md border p-3">
      <h3 className="text-sm font-semibold">Document type and activity</h3>
      <p className="text-sm leading-5">
        {detail.documentType ? (
          <>
            {detail.documentType.name}{" "}
            <span className="text-muted-foreground">({SOURCE[detail.documentType.source]})</span>
          </>
        ) : (
          <span className="text-muted-foreground">No document type yet.</span>
        )}
        <span className="block text-muted-foreground">Activity: {detail.metricName}</span>
      </p>
      {detail.documentTypeOptions.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1 space-y-1.5">
            <Label htmlFor={typeFieldId}>Correct the document type</Label>
            <NativeSelect
              id={typeFieldId}
              value={typeId}
              disabled={pending}
              onChange={(e) => setTypeId(e.target.value)}
            >
              <option value="" disabled>
                Choose a type
              </option>
              {detail.documentTypeOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={pending || !typeId || typeId === detail.documentType?.id}
            onClick={() => setAskType(true)}
          >
            Save type
          </Button>
        </div>
      ) : null}
      {!approved ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Uploaded as the wrong activity?</span>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setAskReturn(true)}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Return as wrong activity
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={askType}
        onOpenChange={setAskType}
        title="Correct the document type?"
        confirmLabel="Save type"
        pending={pending}
        requireReason={{ label: "Reason", minLength: 10, hint: "Kept in the audit trail." }}
        onConfirm={(reason) =>
          run(
            () =>
              correctDocumentTypeAction({
                recordId: detail.recordId,
                documentTypeId: typeId,
                reason,
              }),
            "Document type corrected",
          )
        }
      >
        <p>
          Only the label changes. The values, the calculation and the activity stay as they are.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={askReturn}
        onOpenChange={setAskReturn}
        title="Return as the wrong activity?"
        confirmLabel="Return to uploader"
        destructive
        pending={pending}
        requireReason={{
          label: "What is wrong",
          minLength: 10,
          hint: "The uploader sees this and a link to upload it again.",
        }}
        onConfirm={(reason) =>
          run(
            () => returnWrongActivityAction({ recordId: detail.recordId, reason }),
            "Returned to the uploader",
          )
        }
      >
        <p>
          This record is closed as rejected. The uploader is asked to upload the document again
          under the right activity; the new upload is kept as its new version, and both stay in the
          history.
        </p>
      </ConfirmDialog>
    </section>
  );
}
