import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { UsersManager } from "./users-manager";

export const metadata: Metadata = { title: "Users · TraceESG" };

export default async function UsersPage() {
  const [session, caller] = await Promise.all([requireAdminSession(), api()]);
  const [users, matrix, nodes, bulkImportOptions, levels] = await Promise.all([
    caller.users.list(),
    caller.roles.matrix(),
    caller.organization.tree(),
    caller.users.bulkImportOptions(),
    caller.organization.levels(),
  ]);

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="Users"
        description="Invite users and assign each a role at an organization node. Access cascades down the tree. The Admin role is organization-wide and can only be assigned at the root."
      />
      <UsersManager
        currentUserId={session.userId}
        users={users}
        roles={matrix.roles.map((r) => ({ id: r.id, code: r.code, name: r.name }))}
        nodes={nodes}
        levels={levels}
        bulkImportOptions={bulkImportOptions}
      />
    </div>
  );
}
