import { Zap } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { ScopeDashboard } from "@/components/scope/scope-dashboard";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { recordTraceAction } from "@/lib/scope/actions";

export const metadata: Metadata = { title: "Scope 2 · TraceESG" };

// 03_APP_FLOW.md §2.2 Scope 2 Dashboard — the Phase 10 component with a different scope code, which is
// what the plan asks this phase to prove (Rule 14: reuse, don't duplicate).
export default async function ScopeTwoPage({ searchParams }: PageProps<"/admin/scope-2">) {
  const [, caller, params] = await Promise.all([requireAdminSession(), api(), searchParams]);
  const orgUnitId = typeof params.org === "string" ? params.org : undefined;
  const periodId = typeof params.period === "string" ? params.period : undefined;
  const view = await caller.scope.getTotal({ scopeCode: "SCOPE_2", orgUnitId, periodId });

  return (
    <div className="max-w-7xl space-y-4">
      <PageHeader
        title="Scope 2"
        description="Indirect emissions from purchased electricity, totalled from approved records. Grid and renewable electricity are separate activities. Drill down to the project, the record and the original bill."
      />
      {view ? (
        <ScopeDashboard
          scopeName="Scope 2"
          view={view}
          basePath="/admin/scope-2"
          loadRecord={recordTraceAction}
        />
      ) : (
        <EmptyState
          icon={Zap}
          title="Nothing to total yet"
          message="Scope 2 figures appear once a reporting period exists and electricity records have been calculated."
          link={{ href: "/admin/submissions", label: "See what has been submitted" }}
        />
      )}
    </div>
  );
}
