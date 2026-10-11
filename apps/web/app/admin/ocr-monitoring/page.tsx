import { AlertTriangle, ScanText } from "lucide-react";
import type { Metadata } from "next";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminSession } from "@/lib/auth/session";
import { workerStallMinutes } from "@/lib/ocr/rules";
import { api } from "@/lib/trpc/server";
import { OcrJobsTable } from "./ocr-jobs-table";

export const metadata: Metadata = { title: "OCR Monitoring · TraceESG" };

// 03_APP_FLOW.md §2.2 OCR Monitoring; UI brief §20 shared monitoring template (filter bar + table +
// row-click detail drawer).
export default async function OcrMonitoringPage() {
  const [, caller] = await Promise.all([requireAdminSession(), api()]);
  const { jobs, threshold, oldestPendingSince } = await caller.ocr.jobs();
  const stalled = workerStallMinutes(
    oldestPendingSince ? new Date(oldestPendingSince) : null,
    new Date(),
  );

  return (
    <div className="max-w-7xl space-y-4">
      <AutoRefresh active={jobs.some((j) => j.status === "pending" || j.status === "processing")} />
      <PageHeader
        title="OCR Monitoring"
        description={`Document extraction jobs across the organization. Confidence threshold: ${
          threshold === null ? "not configured" : `${threshold}%`
        }.`}
      />

      {stalled !== null ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border border-status-error/40 bg-status-error/10 p-4"
        >
          <AlertTriangle
            className="mt-0.5 size-5 shrink-0 text-status-error"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="text-sm leading-5">
            <span className="font-semibold">
              OCR worker has not picked up jobs for {stalled} minutes.
            </span>{" "}
            Check that the worker service is running.
          </p>
        </div>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState
          nested
          icon={ScanText}
          title="No jobs processed yet"
          message="Jobs appear here as soon as documents are uploaded."
        />
      ) : (
        <OcrJobsTable jobs={jobs} threshold={threshold} />
      )}
    </div>
  );
}
