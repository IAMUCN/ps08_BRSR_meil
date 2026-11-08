import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminAreaSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { UsersManager } from "./users-manager";

export const metadata: Metadata = { title: "Users · EmeilSG" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const [session, caller, params] = await Promise.all([
    requireAdminAreaSession(),
    api(),
    searchParams,
  ]);
  // The top-bar search links here with ?q= (feature_enhancement.md 8.3).
  const initialQuery = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const [users, options, nodes, bulkImportOptions, levels] = await Promise.all([
    caller.users.list(),
    caller.users.options(),
    caller.organization.tree(),
    caller.users.bulkImportOptions(),
    caller.organization.levels(),
  ]);

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="Users"
        description={
          session.isAdmin
            ? "Invite users and assign each a role at an organization node. Access cascades down the tree. The Super Admin role is organization-wide and can only be assigned at the root; an Administrator administers the node it is assigned at and everything beneath."
            : "The people who hold a role in the part of the organization you administer. Invite users and assign each a role at one of your nodes; access cascades down the tree."
        }
      />
      <UsersManager
        currentUserId={session.userId}
        users={users}
        roles={options.roles}
        nodes={nodes}
        levels={levels}
        initialQuery={initialQuery}
        bulkImportOptions={bulkImportOptions}
      />
    </div>
  );
}
