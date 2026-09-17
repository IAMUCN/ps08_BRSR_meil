import { CalendarRange, FileSearch, FolderX, RotateCcw, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { NoticeToast } from "@/components/shell/notice-toast";
import { requireAppSession } from "@/lib/auth/session";
import { submissionTab } from "@/lib/ocr/rules";
import { api } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Dashboard · TraceESG" };

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function UserDashboardPage({ searchParams }: PageProps<"/app">) {
  const [session, params, caller] = await Promise.all([requireAppSession(), searchParams, api()]);
  const notice = typeof params.notice === "string" ? params.notice : undefined;
  const workAssignments = session.assignments.filter((a) => a.roleCode !== "admin");

  // §2.3 empty state: a valid account with no assignment is not an error.
  if (workAssignments.length === 0) {
    return (
      <>
        <NoticeToast notice={notice} />
        <EmptyState
          icon={FolderX}
          title="No projects assigned"
          message="You haven't been assigned to a project yet — contact your Admin."
        />
      </>
    );
  }

  const [openPeriod, submissions] = await Promise.all([
    caller.dashboard.openPeriod(),
    caller.ocr.submissions(),
  ]);
  const toVerify = submissions.filter((s) => submissionTab(s) === "needs_verification").length;

  return (
    <div className="max-w-5xl space-y-6">
      <NoticeToast notice={notice} />
      {/* UI brief §20: the Upload CTA is the most prominent element on the user dashboard. */}
      <PageHeader
        title="Dashboard"
        action={
          session.permissions.includes("document.upload") ? (
            <Button asChild size="lg" className="h-11 px-5 text-base">
              <Link href="/app/upload">
                <Upload aria-hidden />
                Upload Document
              </Link>
            </Button>
          ) : null
        }
      />

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

      {/* UI brief §20: task-card-first; a card opens My Submissions pre-filtered (§2.3). */}
      <section aria-label="Tasks" className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/app/submissions?tab=needs_verification"
          className="rounded-md border bg-card p-4 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <div className="flex items-center gap-2">
            <FileSearch className="size-5 text-primary" strokeWidth={1.5} aria-hidden />
            <h2 className="text-sm leading-5 font-semibold">Documents to verify</h2>
          </div>
          <p className="mt-2 text-2xl leading-8 font-semibold tabular-nums">{toVerify}</p>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            Extracted or failed documents waiting for you
          </p>
        </Link>
        <div className="rounded-md border bg-card p-4">
          <div className="flex items-center gap-2">
            <RotateCcw className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <h2 className="text-sm leading-5 font-semibold">Returned for correction</h2>
          </div>
          <p className="mt-2 text-2xl leading-8 font-semibold" aria-label="No data yet">
            —
          </p>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            Development placeholder — returns arrive with validation and approval (Phases 8, 16)
          </p>
        </div>
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
