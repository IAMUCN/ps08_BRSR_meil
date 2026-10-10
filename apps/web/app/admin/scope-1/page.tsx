import { Flame } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { ScopeDashboard } from "@/components/scope/scope-dashboard";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { recordTraceAction } from "@/lib/scope/actions";

export const metadata: Metadata = { title: "Scope 1 · TraceESG" };

// 03_APP_FLOW.md §2.2 Scope 1 Dashboard. The same component serves Scope 2 and 3 in Phases 11–12; only
// the scope code and the title change.
export default async function ScopeOnePage({ searchParams }: PageProps<"/admin/scope-1">) {
  const [, caller, params] = await Promise.all([requireAdminSession(), api(), searchParams]);
  const orgUnitId = typeof params.org === "string" ? params.org : undefined;
  const periodId = typeof params.period === "string" ? params.period : undefined;
  const view = await caller.scope.getTotal({ scopeCode: "SCOPE_1", orgUnitId, periodId });

  return (
    <div className="max-w-7xl space-y-4">
      <PageHeader
        title="Scope 1"
        description="Direct emissions from fuel burned in owned or controlled equipment, totalled from approved records. Drill down to the project, the record and the original invoice."
      />
      {view ? (
        <ScopeDashboard
          scopeName="Scope 1"
          view={view}
          basePath="/admin/scope-1"
          loadRecord={recordTraceAction}
        />
      ) : (
        <EmptyState
          icon={Flame}
          title="Nothing to total yet"
          message="Scope 1 figures appear once a reporting period exists and records have been calculated."
          link={{ href: "/admin/submissions", label: "See what has been submitted" }}
        />
      )}
    </div>
  );
}
