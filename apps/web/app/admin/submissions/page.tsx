import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ContextFilters, ISSUE_LABELS, RecordsTable } from "@/components/records/records-explorer";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { workerStallMinutes } from "@/lib/ocr/rules";
import { requireAdminAreaSession } from "@/lib/auth/session";
import { readParams, stringParams } from "@/lib/records/params";
import { api } from "@/lib/trpc/server";

import { RemindButton } from "./remind-button";
export const metadata: Metadata = { title: "Submission Monitoring · EmeilSG" };

// Where each issue is acted on (the Control Tower lands here with the exact slice it counted).
const QUEUE: Record<string, { href: string; label: string }> = {
  validation_failed: { href: "/admin/validation-queue", label: "the Validation Queue" },
  anomaly: { href: "/admin/validation-queue", label: "the Validation Queue" },
  pending_approval: { href: "/admin/approval-queue", label: "the Approval Queue" },
};

// 03_APP_FLOW.md §2.2 Submission Monitoring: every submission and its pipeline status, filterable by org
// node, role, period and status (.grill/phase-16-control-tower-decisions.md).
export default async function SubmissionMonitoringPage({
  searchParams,
}: PageProps<"/admin/submissions">) {
  const [, caller, raw] = await Promise.all([requireAdminAreaSession(), api(), searchParams]);
  const q = readParams(raw);
  const params = stringParams(raw);

  if (q.missingSubmissions) {
    const { context, rows } = await caller.records.missing({
      orgUnitId: q.orgUnitId,
      periodId: q.periodId,
    });
    return (
      <div className="max-w-7xl space-y-4">
        <PageHeader
          title="Submission Monitoring"
          description={`Expected submissions with nothing filed for ${context.periodLabel}. Expectations are set per node on the Organization page.`}
        />
        <ContextFilters context={context} params={params} variant="monitoring" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {rows.length} expected submission(s) missing across{" "}
            {new Set(rows.map((r) => r.orgUnitId)).size} org unit(s).
          </p>
          {rows.length > 0 ? (
            <RemindButton orgUnitId={context.orgUnitId} periodId={context.periodId} />
          ) : null}
        </div>
        <div className="overflow-x-auto rounded-md border border-table-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-table-header text-table-header-foreground">
              <tr>
                {["Org unit", "Expected activity", "Category"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.orgUnitId}:${r.metricName}`}
                  className="border-t border-table-border bg-table-row"
                >
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/organization?node=${r.orgUnitId}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {r.orgUnitName}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">{r.metricName}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{r.categoryName}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-muted-foreground">
                    Every expected submission has been filed for {context.periodLabel}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const { context, rows, truncated, oldestPendingSince } = await caller.records.search({
    orgUnitId: q.orgUnitId,
    periodId: q.periodId,
    scopeCode: q.scopeCode,
    metricCode: q.metricCode,
    documentTypeCode: q.documentTypeCode,
    roleCode: q.roleCode,
    status: q.status,
    issue: q.issue,
    text: q.text,
    ocr: q.ocr,
  });
  const queue = q.issue ? QUEUE[q.issue] : undefined;
  // Phase 3: OCR Monitoring's stalled-worker warning now lives here.
  const stalled = workerStallMinutes(
    oldestPendingSince ? new Date(oldestPendingSince) : null,
    new Date(),
  );

  return (
    <div className="max-w-7xl space-y-4">
      <PageHeader
        title="Submission Monitoring"
        description="Every submission across the organization, what OCR made of it and where it is in the pipeline. Open a record for its evidence, OCR, validation, calculation and audit trail."
      />
      <AutoRefresh active={rows.some((r) => r.ocrState === "reading")} />
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
              The OCR worker has not picked up a document for {stalled} minutes.
            </span>{" "}
            Uploads wait until it runs again; check that the worker is running.
          </p>
        </div>
      ) : null}
      <ContextFilters context={context} params={params} variant="monitoring" search />
      {q.issue ? (
        <p className="rounded-md border border-status-warning/40 bg-status-warning/5 px-4 py-2 text-sm">
          Showing <span className="font-medium">{ISSUE_LABELS[q.issue]}</span>
          {queue ? (
            <>
              {" "}
              — act on them in{" "}
              <Link href={queue.href} className="font-medium underline underline-offset-2">
                {queue.label}
              </Link>
              .
            </>
          ) : (
            "."
          )}
        </p>
      ) : null}
      <RecordsTable
        rows={rows}
        truncated={truncated}
        variant="monitoring"
        emptyMessage={`No submissions match these filters for ${context.periodLabel}.`}
      />
    </div>
  );
}
