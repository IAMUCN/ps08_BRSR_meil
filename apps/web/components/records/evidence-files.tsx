"use client";

import { Loader2, Paperclip } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  completeSupportingAction,
  prepareSupportingAction,
  recordEvidenceAction,
} from "@/lib/documents/evidence-actions";
import { acceptedTypesLabel, formatMegabytes } from "@/lib/storage/evidence";
import type { RecordEvidence } from "@/lib/trpc/routers/documents";

// Every evidence file of a record, and — for whoever could have uploaded the record, while it is still open —
// a way to add a supporting file (.grill/audit-p2-decisions.md). A supporting file is evidence only: it is
// not read by OCR and changes no value. A plain list by the feature role; the ui role may restyle it (A25).

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function EvidenceFiles({ recordId }: { recordId: string }) {
  const [evidence, setEvidence] = useState<RecordEvidence | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Bumped after a file is added, to read the list again.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    recordEvidenceAction(recordId).then((result) => {
      if (live && result.ok) setEvidence(result.data);
    });
    return () => {
      live = false;
    };
  }, [recordId, version]);

  async function add(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const prepared = await prepareSupportingAction({
        recordId,
        mimeType: file.type,
        fileSize: file.size,
        sha256: await sha256Hex(file),
      });
      if (!prepared.ok) return void toast.error(prepared.error);
      // Same body shape as the main upload (supabase-js uploadToSignedUrl).
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", file);
      const put = await fetch(prepared.data.signedUrl, {
        method: "PUT",
        body,
        headers: { "x-upsert": "false" },
      }).catch(() => null);
      if (!put?.ok) {
        return void toast.error("The upload failed — check your connection and try again.");
      }
      const completed = await completeSupportingAction({
        recordId,
        documentId: prepared.data.documentId,
        mimeType: file.type,
        fileName: file.name,
      });
      if (!completed.ok) return void toast.error(completed.error);
      toast.success(`${file.name} added as supporting evidence.`);
      setVersion((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }

  if (!evidence) return null;
  return (
    <section className="space-y-2" aria-label="Evidence files">
      <h3 className="text-sm font-semibold">Evidence files ({evidence.files.length})</h3>
      <ul className="divide-y rounded-sm border text-sm">
        {evidence.files.map((file) => (
          <li
            key={file.documentId}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
          >
            <a
              href={`/api/documents/${file.documentId}/file`}
              target="_blank"
              rel="noreferrer"
              className="font-medium break-all underline-offset-2 hover:underline"
            >
              {file.fileName}
            </a>
            <span className="text-xs text-muted-foreground">
              {file.isPrimary ? "Original document" : "Supporting"} ·{" "}
              {formatMegabytes(file.sizeBytes)}
            </span>
          </li>
        ))}
      </ul>
      {evidence.canAdd ? (
        <>
          <input
            ref={input}
            type="file"
            accept={evidence.acceptedMimeTypes.join(",")}
            className="sr-only"
            aria-label="Add a supporting file"
            onChange={add}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Paperclip aria-hidden />}
            Add a supporting file
          </Button>
          <p className="text-xs text-muted-foreground">
            {acceptedTypesLabel(evidence.acceptedMimeTypes)}. Kept with the record as evidence;
            values are still read from the original document only.
          </p>
        </>
      ) : evidence.closedReason ? (
        <p className="text-xs text-muted-foreground">{evidence.closedReason}</p>
      ) : null}
    </section>
  );
}
