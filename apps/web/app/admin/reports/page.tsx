import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { ReportForm } from "./report-form";
import { ReportInputsForm } from "./report-inputs-form";

export const metadata: Metadata = { title: "Reports · TraceESG" };

const STATUS: Record<string, { tone: StatusTone; label: string }> = {
  pending: { tone: "neutral", label: "Queued" },
  generating: { tone: "warning", label: "Generating" },
  completed: { tone: "success", label: "Ready" },
  failed: { tone: "error", label: "Failed" },
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

// 03_APP_FLOW.md §2.2 Reports and §4.10: a parameter form and every run, successful or failed, kept for
// traceability (.grill/phase-17-reporting-decisions.md).
export default async function ReportsPage() {
  const [, caller] = await Promise.all([requireAdminSession(), api()]);
  const [options, runs] = await Promise.all([caller.reports.options(), caller.reports.list()]);
  const inputsYear = options.defaultFinancialYear ?? options.financialYears[0]?.startYear ?? null;
  const inputs =
    inputsYear === null ? null : await caller.reports.inputs({ financialYear: inputsYear });
  const running = runs.some((r) => r.status === "pending" || r.status === "generating");

  return (
    <div className="max-w-7xl space-y-4">
      <AutoRefresh active={running} />
      <PageHeader
        title="Reports"
        description="Consolidated BRSR reports from approved records, for any part of the organization and a period or financial year. Every reported value drills down to its original document."
      />
      <ReportForm options={options} />
      {inputsYear !== null && inputs ? (
        <ReportInputsForm
          years={options.financialYears.map((y) => y.startYear)}
          initialYear={inputsYear}
          initial={inputs}
        />
      ) : null}

      {runs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No reports generated yet"
          message="Choose a scope and a period or financial year above."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-table-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-table-header text-table-header-foreground">
              <tr>
                {["Report", "Scope", "Requested", "Status", ""].map((h, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
                  >
                    {h || <span className="sr-only">Actions</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-table-border bg-table-row align-top">
                  <td className="px-3 py-2.5 font-medium">BRSR · {r.coverage}</td>
                  <td className="px-3 py-2.5">{r.orgUnitName}</td>
                  <td className="px-3 py-2.5">
                    {when(r.requestedAt)}
                    <span className="block text-xs text-muted-foreground">{r.requestedBy}</span>
                  </td>
                  <td className="max-w-md px-3 py-2.5">
                    <StatusBadge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusBadge>
                    {r.error ? <p className="mt-1 text-xs text-status-error">{r.error}</p> : null}
                  </td>
                  <td className="space-x-3 px-3 py-2.5 text-right whitespace-nowrap">
                    {r.status === "completed" ? (
                      <>
                        <Link
                          href={`/admin/reports/${r.id}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          Open
                        </Link>
                        <a
                          href={`/api/reports/${r.id}/file`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          Download PDF
                        </a>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
