import { Users } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireActiveSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { redirect } from "next/navigation";
import { RegisterManager } from "./register-manager";

export const metadata: Metadata = { title: "Employee Register · EmeilSG" };

// The employee register (migration 0070; .grill/role-dashboard-decisions.md). HR uploads an Excel register of
// the workforce; only the totals computed from it are kept, with the file as private evidence. Each procedure
// checks the permission and scope again.
export default async function EmployeeRegisterPage() {
  const session = await requireActiveSession();
  const allowed = ["employee_register.manage", "employee_register.view", "approval.decide"];
  if (!session.isAdmin && !allowed.some((p) => session.permissions.includes(p))) {
    redirect("/app?notice=forbidden");
  }
  const caller = await api();
  const canUse =
    session.isAdmin ||
    session.permissions.includes("employee_register.manage") ||
    session.permissions.includes("employee_register.view");
  const [options, registers] = await Promise.all([
    canUse ? caller.register.options() : Promise.resolve(null),
    caller.register.list(),
  ]);

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader
        title="Employee Register"
        description="Upload the workforce register once a financial year. The totals the BRSR needs are computed from it and kept; the file itself stays private. A person confirms the totals and an approver, who did not upload or confirm them, accepts them."
      />
      {options || registers.length > 0 ? (
        <RegisterManager options={options} registers={registers} />
      ) : (
        <EmptyState
          icon={Users}
          title="No registers yet"
          message="Registers appear here once HR uploads them."
        />
      )}
    </div>
  );
}
