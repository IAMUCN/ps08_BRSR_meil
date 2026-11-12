import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { FactorsManager } from "./factors-manager";

export const metadata: Metadata = { title: "Conversion Factors · EmeilSG" };

// 03_APP_FLOW.md §2.2 Conversion Factors; TRD §25. Admin area only for now — the page is gated on the
// `factor.manage` permission server-side (.grill/phase-9-calculation-engine-decisions.md). Phase 6 (A46): the
// yearly review, sources, and approval of drafts.
export default async function ConversionFactorsPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const [session, caller, params] = await Promise.all([requireAdminSession(), api(), searchParams]);
  const fy = /^\d{4}-\d{2}$/.test(params.fy ?? "") ? params.fy : undefined;
  const [factors, activityTypes, hosts, review] = await Promise.all([
    caller.factors.list(),
    caller.factors.activityTypes(),
    caller.factors.sourceHosts(),
    caller.factors
      .review(fy ? { financialYear: fy } : undefined)
      .catch(() => caller.factors.review()),
  ]);

  return (
    <div className="max-w-7xl space-y-4">
      <PageHeader
        title="Conversion Factors"
        description="The versioned factor database every calculation reads. A new value is a draft until another Super Admin approves it, and a version already used by a calculation can never be changed."
      />
      {factors.length === 0 ? (
        <div className="flex items-start gap-3 rounded-md border border-status-warning/40 bg-status-warning/5 px-4 py-3">
          <AlertTriangle
            className="mt-0.5 size-5 shrink-0 text-status-warning"
            strokeWidth={1.5}
            aria-hidden
          />
          <div>
            <p className="text-sm font-medium">No factors configured yet</p>
            <p className="text-sm text-foreground">
              Scope 1, Scope 2 and Scope 3 calculations cannot run until a factor exists for each
              activity. Add one below, with the source you verified it against.
            </p>
          </div>
        </div>
      ) : null}
      <FactorsManager
        factors={factors}
        activityTypes={activityTypes}
        hosts={hosts}
        canApprove={session.isAdmin}
        userId={session.userId}
        review={review}
      />
    </div>
  );
}
