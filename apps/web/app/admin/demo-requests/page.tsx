import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { DemoRequestsTable } from "./demo-requests-table";

export const metadata: Metadata = { title: "Demo Requests · EmeilSG" };

// Landing-page demo requests (owner's request, 2026-11-11; migration 0066, A55). Super Admins only.
export default async function DemoRequestsPage() {
  await requireAdminSession();
  const rows = await (await api()).demoRequests.list();
  return (
    <div className="max-w-7xl space-y-4">
      <PageHeader
        title="Demo Requests"
        description="People who asked for a demo on the landing page, newest first. Each saw the demo video after sending the form. Mark a request when someone has contacted them."
      />
      <DemoRequestsTable rows={rows} />
    </div>
  );
}
