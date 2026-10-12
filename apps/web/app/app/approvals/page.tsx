import { ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ApprovalQueue } from "@/components/approvals/approval-queue";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireAppSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Approvals · EmeilSG" };

// Approval Queue for Corporate ESG/Sustainability (APP_FLOW_DEVIATIONS A1): the same component and
// procedure as /admin/approval-queue, limited server-side to the approver's own scope.
export default async function ApprovalsPage() {
  const session = await requireAppSession();
  if (!session.permissions.includes("approval.decide")) redirect("/app?notice=forbidden");
  const rows = await (await api()).approvals.queue();
  return (
    <div className="max-w-7xl space-y-4">
      <PageHeader
        title="Approvals"
        description="Validated records in your scope awaiting approval. You can't decide on a record you submitted or verified."
      />
      {rows.length === 0 ? (
        <EmptyState
          nested
          icon={ClipboardCheck}
          title="Nothing awaiting your approval"
          message="Validated records appear here as soon as they pass validation."
        />
      ) : (
        <ApprovalQueue rows={rows} canRecalculate={session.permissions.includes("factor.manage")} />
      )}
    </div>
  );
}
