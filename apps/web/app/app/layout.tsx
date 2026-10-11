import { Sidebar, type NavItem } from "@/components/shell/sidebar";
import { ThemeSync } from "@/components/shell/theme-sync";
import { TopBar } from "@/components/shell/top-bar";
import { requireAppSession } from "@/lib/auth/session";

// /app/* is for non-admin roles (03_APP_FLOW.md §1); page content varies by role, scope and permissions.

// Built-pages-only sidebar: My Organization/Project, My Submissions, etc. are added as their phases land.
const APP_NAV: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: "dashboard" },
  { href: "/app/upload", label: "Upload", icon: "upload" },
  { href: "/app/submissions", label: "My Submissions", icon: "submissions" },
];

export default async function WorkspaceLayout({ children }: LayoutProps<"/app">) {
  const session = await requireAppSession();

  const nav = [...APP_NAV];
  // A1: the Approvals item appears only for approvers (Corporate ESG/Sustainability).
  if (session.permissions.includes("approval.decide")) {
    nav.push({ href: "/app/approvals", label: "Approvals", icon: "approvals" });
  }
  // A20: bulk-import items appear only for whichever role(s) an Admin has granted the permission to.
  if (session.permissions.includes("user.bulk_import")) {
    nav.push({ href: "/app/users/bulk-import", label: "Add Employees", icon: "users" });
  }
  if (session.permissions.includes("org.bulk_import")) {
    nav.push({ href: "/app/org-units/bulk-import", label: "Add Org Units", icon: "organization" });
  }

  return (
    <div className="flex min-h-screen flex-1">
      <ThemeSync theme={session.theme} />
      <Sidebar items={nav} label="Workspace navigation" />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          session={session}
          profileHref="/app/profile"
          notificationsHref="/app/notifications"
        />
        <main id="main-content" tabIndex={-1} className="flex-1 p-4 outline-none md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
