"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
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
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_TONES,
  attentionLabel,
  type OcrJobStatus,
} from "@/lib/ocr/rules";
import type { OcrFieldRow, OcrJobRow } from "@/lib/trpc/routers/ocr";
import { ocrJobFieldsAction, retryOcrJobAction } from "./actions";

type Band = "low" | "ok";

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

const percent = (value: number | null) =>
  value === null ? "—" : `${Math.round(value * 10) / 10}%`;

function useRetry() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const retry = (jobId: string) =>
    startTransition(async () => {
      const result = await retryOcrJobAction(jobId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Job re-queued");
      router.refresh();
    });
  return { pending, retry };
}

export function OcrJobsTable({ jobs, threshold }: { jobs: OcrJobRow[]; threshold: number | null }) {
  const [status, setStatus] = useState<OcrJobStatus | "">("");
  const [band, setBand] = useState<Band | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { pending, retry } = useRetry();

  const filtered = useMemo(
    () => jobs.filter((j) => (!status || j.status === status) && (!band || j.band === band)),
    [jobs, status, band],
  );
  const selected = jobs.find((j) => j.id === selectedId) ?? null;

  return (
    <>
      {/* UI brief §13.3: persistent filter bar. */}
      <div className="flex flex-wrap items-end gap-3 rounded-md border bg-surface p-3">
        <div className="space-y-1.5">
          <Label htmlFor="ocr-status-filter">Status</Label>
          <NativeSelect
            id="ocr-status-filter"
            className="w-44"
            value={status}
            onChange={(e) => setStatus(e.target.value as OcrJobStatus | "")}
          >
            <option value="">All statuses</option>
            {(Object.keys(JOB_STATUS_LABELS) as OcrJobStatus[]).map((key) => (
              <option key={key} value={key}>
                {JOB_STATUS_LABELS[key]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ocr-band-filter">Confidence</Label>
          <NativeSelect
            id="ocr-band-filter"
            className="w-48"
            value={band}
            onChange={(e) => setBand(e.target.value as Band | "")}
          >
            <option value="">All confidence</option>
            <option value="low">Low confidence</option>
            <option value="ok">Above threshold</option>
          </NativeSelect>
        </div>
        <p className="ml-auto text-sm text-muted-foreground" aria-live="polite">
          {filtered.length} of {jobs.length} jobs
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-table-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-table-header text-table-header-foreground">
            <tr>
              {[
                "Document",
                "Project / site",
                "Uploaded by",
                "Uploaded",
                "Status",
                "Attempts",
                "Lowest confidence",
                "",
              ].map((heading, i) => (
                <th
                  key={i}
                  scope="col"
                  className={cn(
                    "px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase",
                    (heading === "Attempts" || heading === "Lowest confidence") && "text-right",
                  )}
                >
                  {heading || <span className="sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="bg-table-row px-3 py-8 text-center text-muted-foreground"
                >
                  No jobs match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((job) => (
                <tr
                  key={job.id}
                  className="border-t border-table-border bg-table-row even:bg-table-row-alt hover:bg-table-row-hover"
                >
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedId(job.id)}
                      className="text-left font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {job.fileName}
                    </button>
                    <span className="block text-xs leading-4 text-muted-foreground">
                      {job.metricName ?? "No linked record"}
                    </span>
                  </td>
                  <td className="px-3 py-3">{job.orgUnitName}</td>
                  <td className="px-3 py-3">{job.uploadedBy}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(job.uploadedAt)}</td>
                  <td className="px-3 py-3">
                    <StatusBadge tone={JOB_STATUS_TONES[job.status]}>
                      {JOB_STATUS_LABELS[job.status]}
                    </StatusBadge>
                    {job.band === "low" ? (
                      <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                        Low confidence · {attentionLabel(job.attention)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{job.attempts}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {percent(job.lowestConfidence)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {job.status === "failed" && job.recordAwaitingOcr ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => retry(job.id)}
                      >
                        <RotateCw aria-hidden />
                        Retry
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <JobDrawer
        job={selected}
        threshold={threshold}
        onClose={() => setSelectedId(null)}
        retrying={pending}
        onRetry={retry}
      />
    </>
  );
}

function JobDrawer({
  job,
  threshold,
  onClose,
  retrying,
  onRetry,
}: {
  job: OcrJobRow | null;
  threshold: number | null;
  onClose: () => void;
  retrying: boolean;
  onRetry: (jobId: string) => void;
}) {
  const [fields, setFields] = useState<{ jobId: string; rows: OcrFieldRow[] | null } | null>(null);
  const [loading, startLoading] = useTransition();

  function load(jobId: string) {
    startLoading(async () => {
      const result = await ocrJobFieldsAction(jobId);
      setFields({ jobId, rows: result.ok ? result.data : null });
      if (!result.ok) toast.error(result.error);
    });
  }

  const facts: [string, string][] = job
    ? [
        ["ESG activity", job.metricName ?? "No linked record"],
        ["Project / site", job.orgUnitName],
        ["Reporting period", job.periodLabel],
        ["Uploaded by", job.uploadedBy],
        ["Uploaded", formatDateTime(job.uploadedAt)],
        ["Started", formatDateTime(job.startedAt)],
        ["Finished", formatDateTime(job.completedAt)],
        ["Attempts", String(job.attempts)],
        ["Model", job.modelVersion ?? "—"],
      ]
    : [];
  const shownFields = job && fields?.jobId === job.id ? fields.rows : null;

  return (
    <Sheet
      open={job !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        className="overflow-y-auto"
        onOpenAutoFocus={() => {
          if (job && job.status === "completed") load(job.id);
        }}
      >
        {job ? (
          <>
            <SheetHeader>
              <SheetTitle className="break-words">{job.fileName}</SheetTitle>
              <SheetDescription>OCR job details</SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6">
              <div className="flex items-center gap-3">
                <StatusBadge tone={JOB_STATUS_TONES[job.status]}>
                  {JOB_STATUS_LABELS[job.status]}
                </StatusBadge>
                {job.status === "failed" && job.recordAwaitingOcr ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={retrying}
                    onClick={() => onRetry(job.id)}
                  >
                    <RotateCw aria-hidden />
                    Retry
                  </Button>
                ) : null}
              </div>
              {job.errorMessage ? (
                <p className="rounded-sm border border-status-error/40 bg-status-error/10 p-3 text-sm leading-5">
                  {job.errorMessage}
                </p>
              ) : null}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {facts.map(([term, value]) => (
                  <div key={term}>
                    <dt className="text-xs leading-4 text-muted-foreground">{term}</dt>
                    <dd className="leading-5 font-medium break-words">{value}</dd>
                  </div>
                ))}
              </dl>

              {job.status === "completed" ? (
                <section aria-labelledby="fields-heading" className="space-y-2">
                  <h3 id="fields-heading" className="text-sm leading-5 font-semibold">
                    Extracted fields{" "}
                    <span className="font-normal text-muted-foreground">
                      ({job.fieldsFound} of {job.fieldsTotal} found, read-only)
                    </span>
                  </h3>
                  {loading || !shownFields ? (
                    <div className="space-y-2" aria-label="Loading fields">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="h-9 animate-pulse rounded-sm bg-surface-elevated" />
                      ))}
                    </div>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {shownFields.map((f) => {
                        const low =
                          f.value === null ||
                          threshold === null ||
                          (f.confidence !== null && f.confidence < threshold);
                        return (
                          <li key={f.key} className="flex items-center gap-3 px-3 py-2">
                            <span className="w-32 shrink-0 text-muted-foreground">{f.label}</span>
                            <span className="min-w-0 flex-1 font-mono text-xs break-words">
                              {f.value ?? <span className="font-sans italic">Not found</span>}
                            </span>
                            <span
                              className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums"
                              aria-label={
                                f.confidence === null
                                  ? "No confidence, not found"
                                  : `Confidence: ${Math.round(f.confidence)} percent${low ? ", below threshold" : ""}`
                              }
                            >
                              <span
                                className={cn(
                                  "size-2 rounded-full",
                                  low ? "bg-status-warning" : "bg-status-success",
                                )}
                                aria-hidden
                              />
                              {percent(f.confidence)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
