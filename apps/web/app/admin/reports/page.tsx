import { Archive, FileText, FolderOpen, History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireAdminSession } from "@/lib/auth/session";
import { financialYearLabel } from "@/lib/consolidation/aggregate";
import { api } from "@/lib/trpc/server";
import { ReportForm } from "./report-form";
import { ReportInputsForm } from "./report-inputs-form";
import { RunsTable } from "./runs-table";

export const metadata: Metadata = { title: "Reports · TraceESG" };

/** How many runs the Reports page itself lists; the rest are on Past Reports. */
const RECENT = 5;

// 03_APP_FLOW.md §2.2 Reports and §4.10: a parameter form and every run, successful or failed, kept for
// traceability (.grill/phase-17-reporting-decisions.md).
export default async function ReportsPage() {
  const [, caller] = await Promise.all([requireAdminSession(), api()]);
  const [options, runs] = await Promise.all([caller.reports.options(), caller.reports.list()]);
  const inputsYear = options.defaultFinancialYear ?? options.financialYears[0]?.startYear ?? null;
  const inputs =
    inputsYear === null ? null : await caller.reports.inputs({ financialYear: inputsYear });
  const running = runs.some((r) => r.status === "pending" || r.status === "generating");
  // The written part of the report: how much of it is still unanswered for that year.
  const written =
    inputsYear === null
      ? []
      : (await caller.brsr.disclosures({ financialYear: inputsYear }))
          .flatMap((s) => s.indicators)
          .filter((i) => i.kind === "statement");
  const unanswered = written.filter((i) => !i.answer).length;

  return (
    <div className="max-w-7xl space-y-4">
      <AutoRefresh active={running} />
      <PageHeader
        title="Reports"
        description="Consolidated BRSR reports from approved records, for any part of the organization and a period or financial year. Every reported value drills down to its original document."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/reports/history">
                <History aria-hidden />
                Past reports
              </Link>
            </Button>
            <Button asChild variant="default">
              <Link href="/admin/reports/bundle">
                <Archive aria-hidden />
                Evidence Bundle
              </Link>
            </Button>
            {inputsYear !== null ? (
              <Button asChild variant="outline">
                <Link href={`/admin/reports/evidence?year=${inputsYear}`}>
                  <FolderOpen aria-hidden />
                  Evidence for {financialYearLabel(inputsYear)}
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />
      <ReportForm options={options} />
      {inputsYear !== null && unanswered > 0 ? (
        <p
          role="status"
          className="rounded-md border border-status-warning/50 bg-status-warning/10 p-3 text-sm leading-5"
        >
          {unanswered} of {written.length} written BRSR disclosures have no answer for{" "}
          {financialYearLabel(inputsYear)}. A report generated now prints them as &ldquo;Not
          reported&rdquo;.{" "}
          <Link
            href={`/admin/disclosures?year=${inputsYear}`}
            className="font-medium text-primary-text underline-offset-4 hover:underline"
          >
            Answer them on BRSR Disclosures
          </Link>
        </p>
      ) : null}
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
        <section aria-labelledby="recent-reports" className="space-y-2">
          <h2 id="recent-reports" className="text-base leading-6 font-semibold">
            Recent reports
          </h2>
          <RunsTable runs={runs.slice(0, RECENT)} />
          {runs.length > RECENT ? (
            <p className="text-sm leading-5 text-muted-foreground">
              Showing the latest {RECENT} of {runs.length}.{" "}
              <Link
                href="/admin/reports/history"
                className="font-medium text-primary-text underline-offset-4 hover:underline"
              >
                See all past reports
              </Link>
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
