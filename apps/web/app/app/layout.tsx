import { workspaceNavFor } from "@/components/shell/admin-nav";
import { SessionKeeper } from "@/components/shell/session-keeper";
import { Sidebar } from "@/components/shell/sidebar";
import { ThemeSync } from "@/components/shell/theme-sync";
import { TopBar } from "@/components/shell/top-bar";
import { requireAppSession } from "@/lib/auth/session";
import { ChatLauncher } from "@/components/chat/chat-launcher";
import { chatConfig } from "@/lib/chat/data";

// /app/* is the workspace of every role (03_APP_FLOW.md §1); page content varies by role, scope and
// permissions. An administrator uploads and verifies here too and keeps the /admin sidebar while doing so.

export default async function WorkspaceLayout({ children }: LayoutProps<"/app">) {
  const session = await requireAppSession();

  const administrator = session.isAdmin || session.isOrgAdmin;
  const nav = workspaceNavFor(session);

  return (
    <div className="flex min-h-screen max-w-full flex-1 overflow-x-clip">
      <ThemeSync theme={session.theme} />
      <SessionKeeper />
      <Sidebar items={nav} label={administrator ? "Admin navigation" : "Workspace navigation"} />
      <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-clip">
        <TopBar
          session={session}
          profileHref={administrator ? "/admin/profile" : "/app/profile"}
          notificationsHref="/app/notifications"
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 max-w-full p-4 pb-24 outline-none md:p-6"
        >
          {children}
        </main>
      </div>
      {session.permissions.includes("chat.use") && chatConfig() ? <ChatLauncher /> : null}
    </div>
  );
}
