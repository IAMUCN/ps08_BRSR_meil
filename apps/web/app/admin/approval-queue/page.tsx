import { ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import { ApprovalQueue } from "@/components/approvals/approval-queue";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Approval Queue · TraceESG" };

// 03_APP_FLOW.md §2.2 Approval Queue (Admin mount; Corporate ESG uses /app/approvals, A1).
export default async function AdminApprovalQueuePage() {
  const [, caller] = await Promise.all([requireAdminSession(), api()]);
  const rows = await caller.approvals.queue();
  return (
    <div className="max-w-7xl space-y-4">
      <PageHeader
        title="Approval Queue"
        description="Validated records awaiting approval. Approve them, or return them for correction with a reason. You can't decide on a record you submitted or verified."
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nothing awaiting your approval"
          message="Validated records appear here as soon as they pass validation."
        />
      ) : (
        <ApprovalQueue rows={rows} />
      )}
    </div>
  );
}
