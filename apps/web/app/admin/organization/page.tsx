import type { Metadata } from "next";
import { requireAdminAreaSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { LevelsCard } from "./levels-card";
import { OrgManager } from "./org-manager";

export const metadata: Metadata = { title: "Organization · EmeilSG" };

export default async function OrganizationPage({ searchParams }: PageProps<"/admin/organization">) {
  const [session, params, caller] = await Promise.all([
    requireAdminAreaSession(),
    searchParams,
    api(),
  ]);
  const [nodes, levels] = await Promise.all([
    caller.organization.tree(),
    caller.organization.levels(),
  ]);
  const selectedId = typeof params.node === "string" ? params.node : null;

  return (
    // Wider than the other Admin pages: the tree and the selected unit sit side by side.
    <div className="max-w-[1760px]">
      <OrgManager nodes={nodes} levels={levels} selectedId={selectedId} />
      {/* Hierarchy levels are group-wide configuration: Super Admin only. */}
      {session.isAdmin ? (
        <LevelsCard
          levels={levels.map((level) => ({
            ...level,
            used: nodes.filter((n) => n.unitType === level.code).length,
          }))}
        />
      ) : null}
    </div>
  );
}
