import { AlertTriangle, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminAreaSession } from "@/lib/auth/session";
import { api, orNotFound } from "@/lib/trpc/server";
import { ReportForwarding } from "@/components/reports/report-forwarding";
import { ReportView } from "./report-view";

export const metadata: Metadata = { title: "Report · EmeilSG" };

// 03_APP_FLOW.md §2.2 Report Detail / Drill-down: the stored report with live links into its data trail.
export default async function ReportDetailPage({ params }: PageProps<"/admin/reports/[reportId]">) {
  const [session, caller, { reportId }] = await Promise.all([
    requireAdminAreaSession(),
    api(),
    params,
  ]);
  const run = await orNotFound(caller.reports.get({ id: reportId }));
  const steps = await caller.reportForwarding.trail({ reportRunId: reportId });
  const s = run.snapshot;

  return (
    <div className="max-w-7xl space-y-4">
      <AutoRefresh active={run.status === "pending" || run.status === "generating"} />
      <PageHeader
        title={`BRSR Report · ${run.coverage}`}
        description={
          s
            ? `${s.org.path.join(" › ")} · generated ${new Date(s.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} by ${run.requestedBy}. Approved records only${s.excludedAwaitingApproval ? ` — ${s.excludedAwaitingApproval} awaiting approval not included` : ""}. Click any value to trace it to its document.`
            : `${run.orgUnitName} · requested by ${run.requestedBy}`
        }
        action={
          run.status === "completed" ? (
            <a
              href={`/api/reports/${run.id}/file`}
              className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted"
            >
              <Download className="size-4" aria-hidden />
              Download PDF
            </a>
          ) : null
        }
      />
      {run.status === "failed" ? (
        <p className="flex items-start gap-2 rounded-md border border-status-error/40 bg-status-error/5 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-error" aria-hidden />
          <span>
            {run.error}{" "}
            <Link href="/admin/reports" className="font-medium underline underline-offset-2">
              Back to Reports
            </Link>
          </span>
        </p>
      ) : null}
      {run.status === "pending" || run.status === "generating" ? (
        <p className="rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">
          Generating report… this page refreshes on its own, and you&apos;ll be notified when
          it&apos;s ready.
        </p>
      ) : null}
      {run.status === "completed" ? (
        <ReportForwarding
          reportRunId={run.id}
          steps={steps}
          // The server decides precisely; offered while the report may be sent and nothing waits.
          canForward={
            session.permissions.includes("report.generate") &&
            !steps.some((step) => step.status === "pending")
          }
        />
      ) : null}
      {s ? <ReportView snapshot={s} /> : null}
    </div>
  );
}
