import { Sidebar, type NavItem } from "@/components/shell/sidebar";
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

  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar items={APP_NAV} label="Workspace navigation" />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          session={session}
          profileHref="/app/profile"
          notificationsHref="/app/notifications"
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
