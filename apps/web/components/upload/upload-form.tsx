"use client";

import { AlertTriangle, CalendarRange, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ORG_UNIT_TYPE_LABELS, isOrgUnitType } from "@/lib/org/rules";
import { acceptedTypesLabel, formatMegabytes } from "@/lib/storage/evidence";
import type { DuplicateWarnings, UploadTarget } from "@/lib/trpc/routers/documents";
import { completeUploadAction, prepareUploadAction } from "@/app/app/upload/actions";
import { DropZone } from "./drop-zone";

type Phase = "idle" | "checking" | "uploading" | "finishing";
type Uploaded = { documentId: string; reportingPeriodId: string };

const UPLOAD_FAILED = "The upload failed — check your connection and try again.";

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** PUT to the server-issued signed URL, same body shape as supabase-js uploadToSignedUrl. */
function putFile(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
  xhrRef: { current: XMLHttpRequest | null },
): Promise<"done" | "aborted"> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve("done") : reject());
    xhr.onerror = () => reject();
    xhr.onabort = () => resolve("aborted");
    xhr.send(body);
  });
}

export function UploadForm({
  periodLabel,
  targets,
  maxBytes,
}: {
  periodLabel: string;
  targets: UploadTarget[];
  maxBytes: number;
}) {
  const router = useRouter();
  const metricFieldId = useId();
  const nodeFieldId = useId();
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const [orgUnitId, setOrgUnitId] = useState(targets[0].orgUnitId);
  const [metricId, setMetricId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [metricError, setMetricError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<DuplicateWarnings | null>(null);
  const [uploaded, setUploaded] = useState<Uploaded | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);

  const target = targets.find((t) => t.orgUnitId === orgUnitId) ?? targets[0];
  const metric = useMemo(
    () => target.categories.flatMap((c) => c.metrics).find((m) => m.id === metricId),
    [target, metricId],
  );
  const acceptedTypes = metric?.acceptedMimeTypes ?? ["application/pdf", "image/jpeg", "image/png"];
  const busy = phase !== "idle";

  function resetAttempt() {
    setFailure(null);
    setWarnings(null);
    setUploaded(null);
  }

  function checkFile(candidate: File | null, types: string[]): string | null {
    if (!candidate) return "Attach a document to upload.";
    if (candidate.size > maxBytes) {
      return `This file is ${formatMegabytes(candidate.size)}; the limit is ${formatMegabytes(maxBytes)}. Scan at a lower resolution or split the document.`;
    }
    if (!types.includes(candidate.type)) {
      return `Invalid file type — upload a ${acceptedTypesLabel(types)}.`;
    }
    return null;
  }

  async function complete(done: Uploaded, acknowledge: boolean, chosen: File) {
    setPhase("finishing");
    const result = await completeUploadAction({
      ...done,
      orgUnitId,
      metricId,
      mimeType: chosen.type,
      fileName: chosen.name,
      acknowledgeDuplicates: acknowledge,
    });
    setPhase("idle");
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    if (result.data.status === "confirm") {
      setUploaded(done);
      setWarnings(result.data.warnings);
      return;
    }
    toast.success("Document received, processing");
    router.push("/app/submissions?tab=processing");
  }

  async function submit(acknowledge: boolean) {
    const metricMissing = metricId ? null : "Choose what this document is evidence for.";
    const invalidFile = checkFile(file, acceptedTypes);
    setMetricError(metricMissing);
    setFileError(invalidFile);
    if (metricMissing || invalidFile || !file) return;
    setFailure(null);
    setWarnings(null);

    // Bytes already stored and only the duplicate acknowledgment was missing: don't upload again.
    if (uploaded) return complete(uploaded, acknowledge, file);

    try {
      setPhase("checking");
      const prepared = await prepareUploadAction({
        orgUnitId,
        metricId,
        mimeType: file.type,
        fileSize: file.size,
        sha256: await sha256Hex(file),
        acknowledgeDuplicates: acknowledge,
      });
      if (!prepared.ok) {
        setPhase("idle");
        setFailure(prepared.error);
        return;
      }
      if (prepared.data.status === "confirm") {
        setPhase("idle");
        setWarnings(prepared.data.warnings);
        return;
      }

      setProgress(0);
      setPhase("uploading");
      const outcome = await putFile(prepared.data.signedUrl, file, setProgress, xhrRef);
      xhrRef.current = null;
      if (outcome === "aborted") {
        setPhase("idle");
        return;
      }
      await complete(prepared.data, acknowledge, file);
    } catch {
      xhrRef.current = null;
      setPhase("idle");
      setFailure(UPLOAD_FAILED);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <p className="flex items-center gap-2 text-sm leading-5">
        <CalendarRange className="size-4 text-primary" strokeWidth={1.5} aria-hidden />
        Reporting period: <span className="font-medium">{periodLabel}</span>
      </p>

      {targets.length > 1 ? (
        <div className="space-y-2">
          <Label htmlFor={nodeFieldId}>Project / site</Label>
          <NativeSelect
            id={nodeFieldId}
            value={orgUnitId}
            disabled={busy}
            onChange={(event) => {
              setOrgUnitId(event.target.value);
              setMetricId("");
              resetAttempt();
            }}
          >
            {targets.map((t) => (
              <option key={t.orgUnitId} value={t.orgUnitId}>
                {t.name}
                {isOrgUnitType(t.unitType) ? ` (${ORG_UNIT_TYPE_LABELS[t.unitType]})` : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : (
        <p className="text-sm leading-5">
          Uploading for <span className="font-medium">{target.name}</span>
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor={metricFieldId}>ESG activity</Label>
        <NativeSelect
          id={metricFieldId}
          value={metricId}
          disabled={busy}
          aria-invalid={metricError ? true : undefined}
          aria-describedby={metricError ? `${metricFieldId}-error` : undefined}
          onChange={(event) => {
            setMetricId(event.target.value);
            setMetricError(null);
            resetAttempt();
            const next = target.categories
              .flatMap((c) => c.metrics)
              .find((m) => m.id === event.target.value);
            if (file && next) setFileError(checkFile(file, next.acceptedMimeTypes));
          }}
        >
          <option value="">Select an activity…</option>
          {target.categories.map((category) => (
            <optgroup key={category.id} label={category.name}>
              {category.metrics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit})
                </option>
              ))}
            </optgroup>
          ))}
        </NativeSelect>
        {metricError ? (
          <p
            id={`${metricFieldId}-error`}
            role="alert"
            className="text-sm leading-5 text-status-error"
          >
            {metricError}
          </p>
        ) : null}
      </div>

      <DropZone
        file={file}
        accept={acceptedTypes.join(",")}
        hint={`${acceptedTypesLabel(acceptedTypes)} · up to ${formatMegabytes(maxBytes)}`}
        error={fileError}
        progress={phase === "uploading" ? progress : null}
        disabled={busy}
        onCancel={() => xhrRef.current?.abort()}
        onFile={(picked) => {
          setFile(picked);
          setFileError(checkFile(picked, acceptedTypes));
          resetAttempt();
        }}
      />

      {warnings ? (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-status-warning/50 bg-status-warning/10 p-4"
        >
          <p className="flex items-center gap-2 text-sm leading-5 font-semibold">
            <AlertTriangle className="size-4 text-status-warning" aria-hidden />
            Possible duplicate
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-5">
            {warnings.sameFile ? (
              <li>
                This file has already been uploaded. If you continue, the new record is flagged for
                review.
              </li>
            ) : null}
            {warnings.existingRecords > 0 ? (
              <li>
                {warnings.orgUnitName} already has {warnings.existingRecords} {warnings.metricName}{" "}
                {warnings.existingRecords === 1 ? "record" : "records"} for {warnings.periodLabel}.
                Continue if this is a separate document, such as another invoice.
              </li>
            ) : null}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void submit(true)}>
              Upload anyway
            </Button>
            <Button type="button" variant="outline" onClick={resetAttempt}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {failure ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-status-error/40 bg-status-error/10 p-4 text-sm leading-5"
        >
          <span>{failure}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void submit(false)}>
            <RotateCcw aria-hidden />
            Try again
          </Button>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={busy || warnings !== null}>
          {phase === "checking" || phase === "finishing" ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : null}
          {phase === "checking"
            ? "Checking…"
            : phase === "uploading"
              ? "Uploading…"
              : phase === "finishing"
                ? "Saving…"
                : "Upload document"}
        </Button>
      </div>
    </form>
  );
}
