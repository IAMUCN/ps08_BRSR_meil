import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { OrgManager } from "./org-manager";

export const metadata: Metadata = { title: "Organization · TraceESG" };

export default async function OrganizationPage({ searchParams }: PageProps<"/admin/organization">) {
  const [, params, caller] = await Promise.all([requireAdminSession(), searchParams, api()]);
  const nodes = await caller.organization.tree();
  const selectedId = typeof params.node === "string" ? params.node : null;

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="Organization"
        description="The configurable hierarchy from Group down to Department. Levels can be skipped but never inverted; deactivated nodes are frozen for new activity but their history stays readable."
      />
      <OrgManager nodes={nodes} selectedId={selectedId} />
    </div>
  );
}
