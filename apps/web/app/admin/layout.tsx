import { AppHeader } from "@/components/shell/app-header";
import { requireAdminSession } from "@/lib/auth/session";

// /admin/* is Admin only (03_APP_FLOW.md §1). Enforced server-side on every request by the Data Access
// Layer; RLS independently limits what any query can return.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireAdminSession();

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader session={session} area="Admin" />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
