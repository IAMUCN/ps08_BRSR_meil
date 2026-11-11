import { CalendarRange, FileStack, Sliders } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireAdminAreaSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { DeadlinesClient } from "./deadlines-client";
import { RemindersPanel } from "./reminders-panel";

export const metadata: Metadata = {
  title: "Reporting Deadlines & Escalation Engine · EmeilSG",
};

export default async function DeadlinesPage() {
  // Phase 5: Administrators see the reminders for their units; the task list stays with the Super Admin.
  const session = await requireAdminAreaSession();
  const caller = await api();
  const [data, schedule, log] = await Promise.all([
    session.isAdmin ? caller.deadlines.list() : null,
    caller.deadlines.schedule(),
    caller.deadlines.reminderLog(),
  ]);

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        title="Reporting Deadlines & Escalation Engine"
        description="Monitor the submission deadlines set for each reporting period, identify upcoming and overdue tasks, and execute deterministic multi-tier escalations across MEIL projects."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/submissions">
                <FileStack className="size-4" aria-hidden />
                Submission Monitoring
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/reporting-periods">
                <CalendarRange className="size-4" aria-hidden />
                Reporting Periods
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/simulator">
                <Sliders className="size-4" aria-hidden />
                Reduction Simulator
              </Link>
            </Button>
          </div>
        }
      />

      <RemindersPanel
        schedule={schedule}
        log={log}
        canEdit={session.isAdmin}
        // The daily run is Vercel Cron calling /api/cron/reminders with CRON_SECRET (vercel.json); anywhere
        // else nothing calls it on its own, so the panel says so instead of claiming it is active.
        dailyRunReady={!!process.env.CRON_SECRET && !!process.env.VERCEL}
      />

      {data ? (
        <DeadlinesClient
          initialTasks={data.tasks}
          initialKpis={data.kpis}
          periods={data.periods}
          orgUnits={data.orgUnits}
        />
      ) : null}
    </div>
  );
}
