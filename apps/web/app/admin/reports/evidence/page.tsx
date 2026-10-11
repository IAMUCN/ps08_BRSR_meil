import { Archive, FolderOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { requireAdminSession } from "@/lib/auth/session";
import { financialYearLabel } from "@/lib/consolidation/aggregate";
import { api } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Evidence · TraceESG" };

const STATUS: Record<string, { tone: StatusTone; label: string }> = {
  approved: { tone: "success", label: "Approved" },
  review_pending: { tone: "warning", label: "Awaiting approval" },
  returned: { tone: "error", label: "Returned" },
  rejected: { tone: "error", label: "Rejected" },
};

// Every evidence file behind a financial year's records, in one list (owner's page feedback, 2026-10-09;
// A29). Each file opens through the access-checked evidence route — nothing here is a public link.
export default async function ReportEvidencePage({
  searchParams,
}: PageProps<"/admin/reports/evidence">) {
  const [, caller, params] = await Promise.all([requireAdminSession(), api(), searchParams]);
  const options = await caller.reports.options();
  const years = options.financialYears.map((y) => y.startYear);
  const asked = Number(params.year);
  const year = years.includes(asked) ? asked : (options.defaultFinancialYear ?? years[0] ?? null);

  if (year === null) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="No reporting periods yet"
        message="Evidence is listed by financial year. Create a reporting period first."
        link={{ href: "/admin/reporting-periods", label: "Reporting Periods" }}
      />
    );
  }

  const files = await caller.reports.evidence({ financialYear: year });
  const records = new Set(files.map((f) => f.recordId)).size;
  const approved = files.filter((f) => f.approvalStatus === "approved").length;

  return (
    <div className="max-w-7xl space-y-4">
      <PageHeader
        title="Evidence"
        description="Every document behind the records of a financial year: the original bill, invoice or certificate each figure was read from, and any supporting files."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/reports">Back to Reports</Link>
            </Button>
            <Button asChild variant="default">
              <Link href="/admin/reports/bundle">
                <Archive aria-hidden />
                Export Evidence Bundle
              </Link>
            </Button>
          </div>
        }
      />
      <nav aria-label="Financial year" className="flex flex-wrap gap-1 border-b">
        {years.map((y) => (
          <Link
            key={y}
            href={`/admin/reports/evidence?year=${y}`}
            aria-current={y === year ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              y === year
                ? "border-primary text-primary-text"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {financialYearLabel(y)}
          </Link>
        ))}
      </nav>

      {files.length === 0 ? (
        <p className="rounded-md border border-table-border bg-table-row px-3 py-8 text-center text-sm text-muted-foreground">
          No evidence has been uploaded for {financialYearLabel(year)} yet.
        </p>
      ) : (
        <>
          <p className="text-sm leading-5 text-muted-foreground">
            {files.length} {files.length === 1 ? "file" : "files"} behind {records}{" "}
            {records === 1 ? "record" : "records"} in {financialYearLabel(year)}; {approved} belong
            to approved records, which are the ones a report counts.
          </p>
          <div className="overflow-x-auto rounded-md border border-table-border">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Evidence files for {financialYearLabel(year)}</caption>
              <thead className="bg-table-header text-table-header-foreground">
                <tr>
                  {[
                    "Document",
                    "ESG activity",
                    "Project / site",
                    "Period",
                    "Uploaded",
                    "Record",
                  ].map((h) => (
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
                {files.map((f) => {
                  const status = STATUS[f.approvalStatus] ?? {
                    tone: "neutral" as const,
                    label: "In progress",
                  };
                  return (
                    <tr
                      key={`${f.recordId}-${f.documentId}`}
                      className="border-t border-table-border bg-table-row align-top"
                    >
                      <td className="px-3 py-2.5 font-medium">
                        <a
                          href={`/api/documents/${f.documentId}/file`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary-text underline-offset-4 hover:underline"
                        >
                          {f.fileName}
                        </a>
                        <span className="block text-xs font-normal text-muted-foreground">
                          {f.isPrimary ? "Original document" : "Supporting file"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{f.metricName}</td>
                      <td className="px-3 py-2.5">{f.orgUnitName}</td>
                      <td className="px-3 py-2.5">{f.periodLabel}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {new Date(f.uploadedAt).toLocaleDateString("en-IN", {
                          dateStyle: "medium",
                        })}
                        <span className="block text-xs text-muted-foreground">{f.uploadedBy}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
