import { redirect } from "next/navigation";
import { CalendarRange, Factory, FileSearch, FolderX, RotateCcw, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { NoticeToast } from "@/components/shell/notice-toast";
import { requireAppSession } from "@/lib/auth/session";
import { submissionTab } from "@/lib/ocr/rules";
import { formatTotal } from "@/lib/scope/display";
import { api } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Dashboard · EmeilSG" };

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
  // An administrator's dashboard is the Control Tower; they come to /app only to upload and verify.
  if (session.isAdmin || session.isOrgAdmin) redirect("/admin");
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

  const [openPeriods, submissions, myTotals] = await Promise.all([
    caller.dashboard.openPeriods(),
    caller.ocr.submissions(),
    // Phases 10–12: this user's own project totals for every configured scope — never an
    // organisation-wide figure, and never a hard-coded list of scopes.
    caller.scope.topLevel().then((all) =>
      Promise.all(
        all.map(async (scope) => ({
          name: scope.name,
          view: await caller.scope.myTotal({ scopeCode: scope.code }),
        })),
      ),
    ),
  ]);
  const scopes = myTotals.filter((s) => s.view !== null);
  const toVerify = submissions.filter((s) => submissionTab(s) === "needs_verification").length;
  const returned = submissions.filter((s) => submissionTab(s) === "returned").length;

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
          <CalendarRange className="size-5 text-primary-text" strokeWidth={1.5} aria-hidden />
          <h2 id="period-heading" className="text-base leading-6 font-semibold">
            {openPeriods.length > 1 ? "Open reporting periods" : "Current reporting period"}
          </h2>
        </div>
        {openPeriods.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm leading-5">
            {openPeriods.map((period) => (
              <li key={period.id}>
                <span className="font-medium">{period.label}</span>
                <span className="text-muted-foreground">
                  {period.late
                    ? ` · was due ${formatDate(period.dueOn)}; late uploads until ${formatDate(period.lastUploadDay)}`
                    : ` · submissions due by ${formatDate(period.dueOn)}`}
                </span>
              </li>
            ))}
          </ul>
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
            <FileSearch className="size-5 text-primary-text" strokeWidth={1.5} aria-hidden />
            <h2 className="text-sm leading-5 font-semibold">Documents to verify</h2>
          </div>
          <p className="mt-2 text-2xl leading-8 font-semibold tabular-nums">{toVerify}</p>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            Extracted or failed documents waiting for you
          </p>
        </Link>
        <Link
          href="/app/submissions?tab=returned"
          className="rounded-md border bg-card p-4 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <div className="flex items-center gap-2">
            <RotateCcw className="size-5 text-status-error" strokeWidth={1.5} aria-hidden />
            <h2 className="text-sm leading-5 font-semibold">Returned for correction</h2>
          </div>
          <p className="mt-2 text-2xl leading-8 font-semibold tabular-nums">{returned}</p>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            Records that failed validation or were sent back by a reviewer
          </p>
        </Link>
      </section>

      {scopes.length > 0 ? (
        <section aria-labelledby="scopes-heading" className="rounded-md border bg-card p-4">
          <div className="flex items-center gap-2">
            <Factory className="size-5 text-primary-text" strokeWidth={1.5} aria-hidden />
            <h2 id="scopes-heading" className="text-base leading-6 font-semibold">
              Your project&apos;s emissions · {scopes[0].view!.node.name},{" "}
              {scopes[0].view!.periodLabel}
            </h2>
          </div>
          <dl className="mt-3 space-y-3">
            {scopes.map(({ name, view }) => (
              <div key={name}>
                <dt className="text-sm leading-5 font-medium">{name}</dt>
                {view!.node.totals.length > 0 ? (
                  view!.node.totals.map((total) => (
                    <dd
                      key={total.unit}
                      className="flex flex-wrap items-baseline gap-x-3 text-sm leading-5"
                    >
                      <span className="font-mono font-semibold">
                        {formatTotal(total.approved, total.unit)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        approved · {total.records} record(s)
                      </span>
                      {total.awaitingApproval > 0 ? (
                        <span className="text-xs text-status-warning">
                          {formatTotal(total.awaitingApproval, total.unit)} awaiting approval
                        </span>
                      ) : null}
                    </dd>
                  ))
                ) : (
                  <dd className="text-sm leading-5 text-muted-foreground">
                    Nothing calculated for this period yet.
                  </dd>
                )}
                {view!.node.notCalculated > 0 ? (
                  <dd className="text-xs leading-4 text-status-warning">
                    {view!.node.notCalculated} verified record(s) are waiting on a conversion
                    factor.
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
        </section>
      ) : null}

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
