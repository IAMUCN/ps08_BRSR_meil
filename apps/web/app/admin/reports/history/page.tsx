import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { RunsTable } from "../runs-table";

export const metadata: Metadata = { title: "Past Reports · EmeilSG" };

// Every report ever generated, successful or failed (owner's page feedback, 2026-10-09; A29).
export default async function ReportHistoryPage() {
  const [, caller] = await Promise.all([requireAdminSession(), api()]);
  const runs = await caller.reports.list();

  if (runs.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No reports generated yet"
        message="Reports appear here once one has been generated."
        link={{ href: "/admin/reports", label: "Back to Reports" }}
      />
    );
  }

  return (
    <div className="max-w-7xl space-y-4">
      <AutoRefresh active={runs.some((r) => r.status === "pending" || r.status === "generating")} />
      <PageHeader
        title="Past Reports"
        description="Every report generated, newest first. A report keeps the figures and answers it was generated with; open one to trace each value to its document, or download its PDF."
        action={
          <Button asChild variant="outline">
            <Link href="/admin/reports">Back to Reports</Link>
          </Button>
        }
      />
      <RunsTable runs={runs} />
    </div>
  );
}
