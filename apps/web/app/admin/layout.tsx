import { adminNavFor } from "@/components/shell/admin-nav";
import { SessionKeeper } from "@/components/shell/session-keeper";
import { Sidebar } from "@/components/shell/sidebar";
import { ThemeSync } from "@/components/shell/theme-sync";
import { TopBar } from "@/components/shell/top-bar";
import { requireAdminAreaSession } from "@/lib/auth/session";
import { ChatLauncher } from "@/components/chat/chat-launcher";
import { chatConfig } from "@/lib/chat/data";

// /admin/* is for administrators (03_APP_FLOW.md §1): a Super Admin, or an Administrator of part of the
// organisation, who is offered only the pages about their own org units. Enforced server-side on every
// request by the Data Access Layer; each page and procedure checks the caller again.

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireAdminAreaSession();

  return (
    <div className="flex min-h-screen max-w-full flex-1 overflow-x-clip">
      <ThemeSync theme={session.theme} />
      <SessionKeeper />
      <Sidebar items={adminNavFor(session)} label="Admin navigation" />
      <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-clip">
        <TopBar session={session} profileHref="/admin/profile" />
        <main id="main-content" tabIndex={-1} className="flex-1 max-w-full p-4 pb-24 outline-none md:p-6">
          {children}
        </main>
      </div>
      {session.permissions.includes("chat.use") && chatConfig() ? <ChatLauncher /> : null}
    </div>
  );
}
