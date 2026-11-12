import { Link2 } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { ScopeDashboard } from "@/components/scope/scope-dashboard";
import { requireMonitoringSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { recordTraceAction } from "@/lib/scope/actions";

export const metadata: Metadata = { title: "Scope 3 · EmeilSG" };

// 03_APP_FLOW.md §2.2 Scope 3 Dashboard — the same component again, now leading with the category table
// (UI brief §13.1: "X of Y categories active" rather than implied completeness).
export default async function ScopeThreePage({ searchParams }: PageProps<"/admin/scope-3">) {
  const [, caller, params] = await Promise.all([requireMonitoringSession(), api(), searchParams]);
  const orgUnitId = typeof params.org === "string" ? params.org : undefined;
  const periodId = typeof params.period === "string" ? params.period : undefined;
  const view = await caller.scope.getTotal({ scopeCode: "SCOPE_3", orgUnitId, periodId });

  return (
    <div className="max-w-7xl space-y-4">
      <PageHeader
        title="Scope 3"
        description="Value-chain emissions, category by category. Only the categories with usable evidence are enabled; the rest are listed so coverage is never implied. Drill down to the project, the record and the original document."
      />
      {view ? (
        <ScopeDashboard
          scopeName="Scope 3"
          view={view}
          basePath="/admin/scope-3"
          loadRecord={recordTraceAction}
        />
      ) : (
        <EmptyState
          nested
          icon={Link2}
          title="Nothing to total yet"
          message="Scope 3 figures appear once a reporting period exists and records in an enabled category have been calculated."
          link={{ href: "/admin/submissions", label: "See what has been submitted" }}
        />
      )}
    </div>
  );
}
