import { ChatLauncher } from "@/components/chat/chat-launcher";
import { workspaceNavFor } from "@/components/shell/admin-nav";
import { SessionKeeper } from "@/components/shell/session-keeper";
import { Sidebar } from "@/components/shell/sidebar";
import { ThemeSync } from "@/components/shell/theme-sync";
import { TopBar } from "@/components/shell/top-bar";
import { requireAdminWorkspaceSession } from "@/lib/auth/session";
import { canAdminister } from "@/lib/auth/workspace";
import { chatConfig } from "@/lib/chat/data";

// /admin/* is for administrators (03_APP_FLOW.md §1): a Super Admin, or an Administrator of part of the
// organisation, who is offered only the pages about their own org units. Since the role-wise dashboard, a
// holder of monitoring.view or report.generate (Corporate ESG) also comes through this door, to the
// read-only pages their permission opens — and is offered only those. Enforced server-side on every
// request by the Data Access Layer; each page and procedure checks the caller again.

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireAdminWorkspaceSession();

  return (
    <div className="flex min-h-screen max-w-full flex-1 overflow-x-clip">
      <ThemeSync theme={session.theme} />
      <SessionKeeper />
      <Sidebar items={workspaceNavFor(session)} label="Admin navigation" />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          session={session}
          profileHref={canAdminister(session) ? "/admin/profile" : "/app/profile"}
        />
        <main id="main-content" tabIndex={-1} className="flex-1 p-4 pb-24 outline-none md:p-6">
          {children}
        </main>
      </div>
      {session.permissions.includes("chat.use") && chatConfig() ? <ChatLauncher /> : null}
    </div>
  );
}
