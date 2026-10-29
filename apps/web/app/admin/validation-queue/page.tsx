import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminAreaSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { ValidationQueueTable } from "./validation-queue-table";

export const metadata: Metadata = { title: "Validation Queue · EmeilSG" };

// 03_APP_FLOW.md §2.2 Validation Queue; UI brief §19: the shared monitoring template
// (filter bar + table + row-click detail drawer).
export default async function ValidationQueuePage() {
  const [, caller] = await Promise.all([requireAdminAreaSession(), api()]);
  const rows = await caller.validation.queue();

  return (
    <div className="max-w-7xl space-y-4">
      <PageHeader
        title="Validation Queue"
        description="Records flagged for review or failing validation. Accept a flag with a reason so the record moves on, or return it to the submitter. Failed records are already back with their submitter."
      />
      {rows.length === 0 ? (
        <EmptyState
          nested
          icon={ShieldCheck}
          title="No records need validation review"
          message="Everything confirmed so far passed validation."
        />
      ) : (
        <ValidationQueueTable rows={rows} />
      )}
    </div>
  );
}
