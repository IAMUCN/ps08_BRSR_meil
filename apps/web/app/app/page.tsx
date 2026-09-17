import { CalendarRange, FileSearch, FolderX, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { NoticeToast } from "@/components/shell/notice-toast";
import { requireAppSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Dashboard · TraceESG" };

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// UI brief §20: task-card-first. Tasks arrive with upload/verification (Phases 5–7).
const TASK_CARDS = [
  { title: "Documents to verify", icon: FileSearch },
  { title: "Returned for correction", icon: RotateCcw },
];

export default async function UserDashboardPage({ searchParams }: PageProps<"/app">) {
  const [session, params, caller] = await Promise.all([requireAppSession(), searchParams, api()]);
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

  const openPeriod = await caller.dashboard.openPeriod();

  return (
    <div className="max-w-5xl space-y-6">
      <NoticeToast notice={notice} />
      <PageHeader title="Dashboard" />

      <section aria-labelledby="period-heading" className="rounded-md border bg-card p-4">
        <div className="flex items-center gap-2">
          <CalendarRange className="size-5 text-primary" strokeWidth={1.5} aria-hidden />
          <h2 id="period-heading" className="text-base leading-6 font-semibold">
            Current reporting period
          </h2>
        </div>
        {openPeriod ? (
          <p className="mt-2 text-sm leading-5">
            <span className="font-medium">{openPeriod.label}</span>
            {openPeriod.submissionClosesOn ? (
              <span className="text-muted-foreground">
                {" "}
                · submissions due by {formatDate(openPeriod.submissionClosesOn)}
              </span>
            ) : null}
          </p>
        ) : (
          <p className="mt-2 text-sm leading-5 text-muted-foreground">
            No reporting period is open — contact your Admin.
          </p>
        )}
      </section>

      <section aria-label="Tasks" className="grid gap-4 sm:grid-cols-2">
        {TASK_CARDS.map((card) => (
          <div key={card.title} className="rounded-md border bg-card p-4">
            <div className="flex items-center gap-2">
              <card.icon className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              <h2 className="text-sm leading-5 font-semibold">{card.title}</h2>
            </div>
            <p className="mt-2 text-2xl leading-8 font-semibold" aria-label="No data yet">
              —
            </p>
            <p className="mt-1 text-xs leading-4 text-muted-foreground">
              Development placeholder — tasks arrive with document upload (Phase 5)
            </p>
          </div>
        ))}
      </section>

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
