import { adminNavFor } from "@/components/shell/admin-nav";
import { SessionKeeper } from "@/components/shell/session-keeper";
import { Sidebar } from "@/components/shell/sidebar";
import { ThemeSync } from "@/components/shell/theme-sync";
import { TopBar } from "@/components/shell/top-bar";
import { requireAdminAreaSession } from "@/lib/auth/session";

// /admin/* is for administrators (03_APP_FLOW.md §1): a Super Admin, or an Administrator of part of the
// organisation, who is offered only the pages about their own org units. Enforced server-side on every
// request by the Data Access Layer; each page and procedure checks the caller again.

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireAdminAreaSession();

  return (
    <div className="flex min-h-screen flex-1">
      <ThemeSync theme={session.theme} />
      <SessionKeeper />
      <Sidebar items={adminNavFor(session)} label="Admin navigation" />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar session={session} profileHref="/admin/profile" />
        <main id="main-content" tabIndex={-1} className="flex-1 p-4 pb-24 outline-none md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
