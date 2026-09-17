import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { RolesManager } from "./roles-manager";

export const metadata: Metadata = { title: "Roles & Permissions · TraceESG" };

export default async function RolesPage({ searchParams }: PageProps<"/admin/roles">) {
  const [, params, caller] = await Promise.all([requireAdminSession(), searchParams, api()]);
  const matrix = await caller.roles.matrix();

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="Roles & Permissions"
        description="Each role's permission set. Which categories a role may upload into is configured per ESG category; which data a user sees is set by their organization scope."
      />
      <RolesManager
        matrix={matrix}
        selectedId={typeof params.role === "string" ? params.role : null}
      />
    </div>
  );
}
