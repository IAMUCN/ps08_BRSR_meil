import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { LevelsCard } from "./levels-card";
import { OrgManager } from "./org-manager";

export const metadata: Metadata = { title: "Organization · TraceESG" };

export default async function OrganizationPage({ searchParams }: PageProps<"/admin/organization">) {
  const [, params, caller] = await Promise.all([requireAdminSession(), searchParams, api()]);
  const [nodes, levels] = await Promise.all([
    caller.organization.tree(),
    caller.organization.levels(),
  ]);
  const selectedId = typeof params.node === "string" ? params.node : null;

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="Organization"
        description="The configurable hierarchy from Group down to Department. Levels can be skipped but never inverted; deactivated nodes are frozen for new activity but their history stays readable."
      />
      <OrgManager nodes={nodes} levels={levels} selectedId={selectedId} />
      <LevelsCard
        levels={levels.map((level) => ({
          ...level,
          used: nodes.filter((n) => n.unitType === level.code).length,
        }))}
      />
    </div>
  );
}
