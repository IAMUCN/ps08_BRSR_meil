import { AppHeader } from "@/components/shell/app-header";
import { requireAppSession } from "@/lib/auth/session";

// /app/* is for non-admin roles (03_APP_FLOW.md §1); page content varies by role, scope and permissions.
export default async function WorkspaceLayout({ children }: LayoutProps<"/app">) {
  const session = await requireAppSession();

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader session={session} area="Workspace" />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
