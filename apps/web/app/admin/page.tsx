import type { Metadata } from "next";
import { NoticeToast } from "@/components/shell/notice-toast";
import { requireAdminSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Admin Dashboard · TraceESG" };

// Development placeholder: the Control Tower shell is built in Phase 4 and its data in Phase 16.
export default async function AdminDashboardPage({ searchParams }: PageProps<"/admin">) {
  const [session, params] = await Promise.all([requireAdminSession(), searchParams]);

  return (
    <div className="max-w-2xl space-y-2">
      <NoticeToast notice={typeof params.notice === "string" ? params.notice : undefined} />
      <h1 className="text-[32px] leading-10 font-semibold">Admin Dashboard</h1>
      <p className="text-sm leading-5 text-muted-foreground">
        Signed in as {session.displayName}. The Control Tower is not built yet (Phase 4 shell, Phase
        16 data) — this page only confirms Admin access control works.
      </p>
    </div>
  );
}
