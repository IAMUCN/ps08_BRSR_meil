"use client";

import { Loader2, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { retryOcrAction } from "@/lib/records/actions";
import type { RecordDetail } from "@/lib/trpc/routers/records";

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: "Waiting to be read", tone: "neutral" },
  processing: { label: "Being read", tone: "neutral" },
  completed: { label: "Read", tone: "success" },
  failed: { label: "Failed", tone: "error" },
};

/** What OCR made of the document (Phase 3: OCR Monitoring folded into the record panel). */
export function RecordOcr({ detail, onChanged }: { detail: RecordDetail; onChanged: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const ocr = detail.ocr;
  if (!ocr) return null;
  const status = STATUS[ocr.status] ?? { label: ocr.status, tone: "neutral" as StatusTone };
  // "model;rules-14" — the rules version tells which extraction rules read it.
  const rules = ocr.modelVersion?.split(";").pop() ?? null;

  async function retry() {
    setPending(true);
    const result = await retryOcrAction(ocr!.jobId);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Queued to be read again");
    onChanged();
    router.refresh();
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">OCR</h3>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        {rules ? <span className="text-xs text-muted-foreground">Rules {rules}</span> : null}
        {ocr.attempts > 0 ? (
          <span className="text-xs text-muted-foreground">
            {ocr.attempts} attempt{ocr.attempts === 1 ? "" : "s"}
          </span>
        ) : null}
      </p>
      {ocr.status === "failed" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {ocr.error ? <span className="text-status-error">{ocr.error}</span> : null}
          <Button variant="outline" size="sm" disabled={pending} onClick={() => void retry()}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCw aria-hidden />}
            Retry
          </Button>
        </div>
      ) : null}
    </section>
  );
}
