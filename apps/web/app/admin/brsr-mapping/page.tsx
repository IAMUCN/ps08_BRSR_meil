import { AlertTriangle, ListTree } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
import { ReadinessTree } from "@/components/brsr-tree/readiness-tree";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminSession } from "@/lib/auth/session";
import { recordTraceAction } from "@/lib/scope/actions";
import { api } from "@/lib/trpc/server";
import { MappingTable } from "./mapping-table";

export const metadata: Metadata = { title: "BRSR Mapping · TraceESG" };

// 03_APP_FLOW.md §2.2 BRSR Mapping, UI brief §20–§21 (.grill/phase-14-brsr-mapping-decisions.md): the
// metric → indicator configuration, and the readiness tree that walks an indicator down to its evidence.
export default async function BrsrMappingPage({ searchParams }: PageProps<"/admin/brsr-mapping">) {
  const [, caller, params] = await Promise.all([requireAdminSession(), api(), searchParams]);
  const tab = params.tab === "readiness" ? "readiness" : "mappings";
  const periodId = typeof params.period === "string" ? params.period : undefined;

  const mappings = tab === "mappings" ? await caller.brsr.mappings() : null;
  const readiness = tab === "readiness" ? await caller.brsr.readiness({ periodId }) : null;
  const mappingCount =
    mappings?.sections.reduce(
      (n, s) => n + s.indicators.reduce((m, i) => m + i.mappings.length, 0),
      0,
    ) ?? 0;

  return (
    <div className="max-w-7xl space-y-4">
      <PageHeader
        title="BRSR Mapping"
        description="Which ESG metrics feed which BRSR indicators, and how ready each indicator is. Only the questions answered from measured data are listed; the written ones are on BRSR Disclosures."
      />
      <nav aria-label="BRSR views" className="flex gap-1 border-b">
        {[
          { key: "mappings", label: "Mappings" },
          { key: "readiness", label: "Readiness" },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/admin/brsr-mapping?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              tab === t.key
                ? "border-brsr-heading font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {mappings ? (
        <>
          {mappingCount === 0 ? (
            <Notice title="No mappings yet">
              BRSR reports cannot be generated until at least one metric is mapped to an indicator.
            </Notice>
          ) : null}
          {mappings.unmappedMetrics.length > 0 ? (
            <Notice title={`${mappings.unmappedMetrics.length} metric(s) feed no BRSR indicator`}>
              {mappings.unmappedMetrics.join(", ")}.
            </Notice>
          ) : null}
          <MappingTable view={mappings} />
        </>
      ) : readiness ? (
        <ReadinessTree view={readiness} loadRecord={recordTraceAction} />
      ) : (
        <EmptyState
          icon={ListTree}
          title="No reporting period yet"
          message="Readiness is shown per reporting period. Create one under Reporting Periods."
          link={{ href: "/admin/reporting-periods", label: "Go to Reporting Periods" }}
        />
      )}
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-status-warning/40 bg-status-warning/5 px-4 py-3">
      <AlertTriangle
        className="mt-0.5 size-5 shrink-0 text-status-warning"
        strokeWidth={1.5}
        aria-hidden
      />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
