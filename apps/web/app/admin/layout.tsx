import { Sidebar, type NavItem } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { requireAdminSession } from "@/lib/auth/session";

// /admin/* is Admin only (03_APP_FLOW.md §1). Enforced server-side on every request by the Data Access
// Layer; RLS independently limits what any query can return.

// Built-pages-only sidebar (.grill/phase-4-admin-foundation-decisions.md): items are added as phases land.
const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/organization", label: "Organization", icon: "organization" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/roles", label: "Roles & Permissions", icon: "roles" },
  { href: "/admin/reporting-periods", label: "Reporting Periods", icon: "periods" },
  { href: "/admin/ocr-monitoring", label: "OCR Monitoring", icon: "ocr" },
  { href: "/admin/validation-queue", label: "Validation Queue", icon: "validation" },
  { href: "/admin/approval-queue", label: "Approval Queue", icon: "approvals" },
  { href: "/admin/conversion-factors", label: "Conversion Factors", icon: "factors" },
  { href: "/admin/brsr-mapping", label: "BRSR Mapping", icon: "brsr" },
  { href: "/admin/scope-1", label: "Scope 1", icon: "scope" },
  { href: "/admin/scope-2", label: "Scope 2", icon: "scope" },
  { href: "/admin/scope-3", label: "Scope 3", icon: "scope" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireAdminSession();

  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar items={ADMIN_NAV} label="Admin navigation" />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar session={session} profileHref="/admin/profile" />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
