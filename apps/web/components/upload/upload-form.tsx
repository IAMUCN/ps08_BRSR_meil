"use client";

import { AlertTriangle, CalendarRange, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { acceptedTypesLabel, formatMegabytes } from "@/lib/storage/evidence";
import type {
  DuplicateWarnings,
  ReplacementTarget,
  UploadPeriod,
  UploadTarget,
} from "@/lib/trpc/routers/documents";
import {
  completeBundleUploadAction,
  completeUploadAction,
  prepareBundleUploadAction,
  prepareUploadAction,
} from "@/app/app/upload/actions";
import { BUNDLE_MAX_PAGES } from "@/lib/documents/bundle";
import { DropZone } from "./drop-zone";

type Phase = "idle" | "checking" | "uploading" | "finishing";
/** One bill for one activity, or one PDF holding several bills (split and confirmed after OCR). */
type Mode = "single" | "bundle";
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

/** "15 Sep 2026" from an ISO date, without any time-zone shift. */
function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function UploadForm({
  periods,
  targets,
  maxBytes,
  replaces,
  onUploaded,
  onTargetChange,
}: {
  /** Periods that take uploads now, newest first (migration 0056). */
  periods: UploadPeriod[];
  targets: UploadTarget[];
  maxBytes: number;
  replaces?: ReplacementTarget | null;
  /** Called after each recorded upload (the expected-submissions list refreshes). */
  onUploaded?: () => void;
  /** The project and period chosen on the form, for the expected-submissions list. */
  onTargetChange?: (orgUnitId: string, periodId: string) => void;
}) {
  const router = useRouter();
  const metricFieldId = useId();
  const nodeFieldId = useId();
  const periodFieldId = useId();
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const [mode, setMode] = useState<Mode>("single");
  const [periodId, setPeriodId] = useState(periods[0].id);
  const period = periods.find((p) => p.id === periodId) ?? periods[0];
  const [orgUnitId, setOrgUnitId] = useState(replaces?.orgUnitId ?? targets[0].orgUnitId);
  // A rejected record may come back as another activity (it was the wrong one); a failed read may not.
  const activityFixed = replaces?.reason === "ocr_failed";
  const [metricId, setMetricId] = useState(activityFixed ? replaces.metricId : "");
  const [file, setFile] = useState<File | null>(null);
  /** Optional description (migration 0063), kept with the document. */
  const [description, setDescription] = useState("");
  const descriptionId = useId();
  const [metricError, setMetricError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<DuplicateWarnings | null>(null);
  const [uploaded, setUploaded] = useState<Uploaded | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  /** The upload that just finished. The person stays here to add the next document. */
  const [received, setReceived] = useState<{ fileName: string; splitHref?: string } | null>(null);

  const target = targets.find((t) => t.orgUnitId === orgUnitId) ?? targets[0];
  // Tell the page which project and period are chosen (the expected-submissions list follows them).
  useEffect(() => {
    onTargetChange?.(target.orgUnitId, period.id);
  }, [onTargetChange, target.orgUnitId, period.id]);
  const metric = useMemo(
    () => target.categories.flatMap((c) => c.metrics).find((m) => m.id === metricId),
    [target, metricId],
  );
  const bundle = mode === "bundle" && !replaces;
  const acceptedTypes = bundle
    ? ["application/pdf"]
    : (metric?.acceptedMimeTypes ?? ["application/pdf", "image/jpeg", "image/png"]);
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
    if (bundle) {
      const outcome = await completeBundleUploadAction({
        ...done,
        orgUnitId,
        fileName: chosen.name,
        acknowledgeDuplicates: acknowledge,
        description,
      });
      setPhase("idle");
      if (!outcome.ok) {
        setFailure(outcome.error);
        return;
      }
      if (outcome.data.status === "confirm") {
        setUploaded(done);
        setWarnings(outcome.data.warnings);
        return;
      }
      setFile(null);
      setDescription("");
      setUploaded(null);
      onUploaded?.();
      setReceived({
        fileName: chosen.name,
        splitHref: `/app/upload/split/${outcome.data.documentId}`,
      });
      return;
    }
    const result = await completeUploadAction({
      ...done,
      orgUnitId,
      metricId,
      mimeType: chosen.type,
      fileName: chosen.name,
      acknowledgeDuplicates: acknowledge,
      replacesDocumentId: replaces?.documentId,
      description,
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
    // A replacement is one document for one failed record: go back to the list. Otherwise stay.
    if (replaces) {
      toast.success("Document received, processing");
      router.push("/app/submissions?tab=processing");
      return;
    }
    setFile(null);
    setDescription("");
    setUploaded(null);
    onUploaded?.();
    setReceived({ fileName: chosen.name });
  }

  async function submit(acknowledge: boolean) {
    const metricMissing = bundle || metricId ? null : "Choose what this document is evidence for.";
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
      const sha256 = await sha256Hex(file);
      const prepared = bundle
        ? await prepareBundleUploadAction({
            reportingPeriodId: period.id,
            orgUnitId,
            fileSize: file.size,
            sha256,
            acknowledgeDuplicates: acknowledge,
          })
        : await prepareUploadAction({
            reportingPeriodId: period.id,
            orgUnitId,
            metricId,
            mimeType: file.type,
            fileSize: file.size,
            sha256,
            acknowledgeDuplicates: acknowledge,
            replacesDocumentId: replaces?.documentId,
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
      <div className="space-y-2">
        {periods.length > 1 ? (
          <>
            <Label htmlFor={periodFieldId} className="flex items-center gap-2">
              <CalendarRange className="size-4 text-primary-text" strokeWidth={1.5} aria-hidden />
              Reporting period
            </Label>
            <NativeSelect
              id={periodFieldId}
              value={period.id}
              disabled={busy}
              onChange={(e) => {
                setPeriodId(e.target.value);
                resetAttempt();
              }}
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} —{" "}
                  {p.late ? `late (was due ${shortDate(p.dueOn)})` : `due ${shortDate(p.dueOn)}`}
                </option>
              ))}
            </NativeSelect>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm leading-5">
            <CalendarRange className="size-4 text-primary-text" strokeWidth={1.5} aria-hidden />
            Reporting period: <span className="font-medium">{period.label}</span>
            <span className="text-muted-foreground">· due {shortDate(period.dueOn)}</span>
          </p>
        )}
        {period.late ? (
          <p
            role="note"
            className="rounded-md border border-status-warning/50 bg-status-warning/10 p-3 text-sm leading-5 text-foreground"
          >
            <span className="font-semibold">Late submission.</span> {period.label} was due on{" "}
            {shortDate(period.dueOn)}. You can still upload until {shortDate(period.lastUploadDay)};
            the record is marked late and reviewed before approval.
          </p>
        ) : null}
      </div>

      {replaces ? (
        <div className="rounded-md border border-status-warning/50 bg-status-warning/10 p-3 text-sm leading-5">
          <span className="font-semibold">Replacing {replaces.fileName}</span>
          {activityFixed
            ? " — its extraction failed. The project and activity are fixed to match; the old record closes when this upload finishes."
            : " — it was returned. Choose the right activity; this upload is kept as its new version and both stay in the record's history."}
        </div>
      ) : null}

      {!replaces ? (
        <fieldset className="space-y-2" disabled={busy}>
          <legend className="text-sm leading-5 font-medium">What are you uploading?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["single", "One bill", "A bill or invoice for one activity."],
                [
                  "bundle",
                  "A PDF with several bills",
                  `Different bills in one PDF (up to ${BUNDLE_MAX_PAGES} pages). You'll check how it's split.`,
                ],
              ] as const
            ).map(([value, title, hint]) => (
              <label
                key={value}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface-elevated p-3 text-sm leading-5 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:[&_.text-muted-foreground]:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              >
                <input
                  type="radio"
                  name="upload-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => {
                    setMode(value);
                    setMetricError(null);
                    setFileError(null);
                    resetAttempt();
                  }}
                  className="mt-0.5 accent-[var(--primary)]"
                />
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="block text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {targets.length > 1 && !replaces ? (
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
                {` (${t.unitTypeLabel})`}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : (
        <p className="text-sm leading-5">
          Uploading for <span className="font-medium">{target.name}</span>
        </p>
      )}

      {bundle ? null : (
        <div className="space-y-2">
          <Label htmlFor={metricFieldId}>ESG activity</Label>
          <NativeSelect
            id={metricFieldId}
            value={metricId}
            disabled={busy || activityFixed}
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
      )}

      <DropZone
        file={file}
        accept={acceptedTypes.join(",")}
        hint={`${acceptedTypesLabel(acceptedTypes)} · up to ${formatMegabytes(maxBytes)}${bundle ? ` · at most ${BUNDLE_MAX_PAGES} pages` : ""}`}
        error={fileError}
        progress={phase === "idle" ? null : phase === "checking" ? 0 : progress}
        stage={
          phase === "checking"
            ? "Checking the file…"
            : phase === "finishing"
              ? "Saving…"
              : undefined
        }
        disabled={busy}
        onCancel={phase === "uploading" ? () => xhrRef.current?.abort() : undefined}
        onFile={(picked) => {
          setReceived(null);
          setFile(picked);
          setFileError(checkFile(picked, acceptedTypes));
          resetAttempt();
        }}
      />

      <div className="space-y-2">
        <Label htmlFor={descriptionId}>
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <textarea
          id={descriptionId}
          value={description}
          maxLength={500}
          rows={2}
          disabled={busy}
          onChange={(e) => setDescription(e.target.value)}
          aria-describedby={`${descriptionId}-hint`}
          className="w-full rounded-sm border border-input bg-surface px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        />
        <p
          id={`${descriptionId}-hint`}
          className="flex justify-between gap-2 text-xs text-muted-foreground"
        >
          <span>
            Anything that helps reviewers, e.g. &ldquo;meter 2, generator shed&rdquo; or
            &ldquo;credit note for March&rdquo;. You can change it until the record is approved.
          </span>
          <span className="shrink-0">{description.length}/500</span>
        </p>
      </div>

      {received ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-status-success/40 bg-status-success/10 p-4 text-sm leading-5"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-status-success" aria-hidden />
            <span>
              <span className="font-medium">{received.fileName}</span> received — it&apos;s being
              read in the background. Add the next document whenever you&apos;re ready.
            </span>
          </span>
          <Button asChild variant="outline" size="sm">
            <Link href={received.splitHref ?? "/app/submissions?tab=processing"}>
              {received.splitHref ? "Check the split" : "My Submissions"}
            </Link>
          </Button>
        </div>
      ) : null}

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
                : bundle
                  ? "Upload PDF"
                  : "Upload document"}
        </Button>
      </div>
    </form>
  );
}
