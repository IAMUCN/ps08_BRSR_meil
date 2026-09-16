import { FolderX } from "lucide-react";
import type { Metadata } from "next";
import { NoticeToast } from "@/components/shell/notice-toast";
import { requireAppSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Dashboard · TraceESG" };

export default async function UserDashboardPage({ searchParams }: PageProps<"/app">) {
  const [session, params] = await Promise.all([requireAppSession(), searchParams]);
  const notice = typeof params.notice === "string" ? params.notice : undefined;
  const workAssignments = session.assignments.filter((a) => a.roleCode !== "admin");

  // §2.3 empty state: a valid account with no assignment is not an error.
  if (workAssignments.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
        <NoticeToast notice={notice} />
        <FolderX className="size-12 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        <h1 className="text-xl leading-7 font-semibold">No projects assigned</h1>
        <p className="max-w-sm text-sm leading-5 text-muted-foreground">
          You haven&apos;t been assigned to a project yet — contact your Admin.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <NoticeToast notice={notice} />
      <div className="space-y-1">
        <h1 className="text-[32px] leading-10 font-semibold">Dashboard</h1>
        <p className="text-sm leading-5 text-muted-foreground">
          Task cards and the Upload Document action arrive with the Phase 4 shell and Phase 5
          upload.
        </p>
      </div>
      <section aria-labelledby="assignments-heading" className="rounded-md border bg-card p-4">
        <h2 id="assignments-heading" className="text-base leading-6 font-semibold">
          Your assignments
        </h2>
        <ul className="mt-2 space-y-1 text-sm leading-5">
          {workAssignments.map((a) => (
            <li key={`${a.orgUnitId}-${a.roleCode}`}>
              {a.roleName} · <span className="font-medium">{a.orgUnitName}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
