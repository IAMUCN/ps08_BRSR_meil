import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { PeriodsManager } from "./periods-manager";

export const metadata: Metadata = { title: "Reporting Periods · TraceESG" };

export default async function ReportingPeriodsPage() {
  const [, caller] = await Promise.all([requireAdminSession(), api()]);
  const periods = await caller.reportingPeriods.list();

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="Reporting Periods"
        description="Only one period can be open at a time, and uploads are accepted only while a period is open. Submission window dates are guidance shown to users and used for deadline reminders."
      />
      <PeriodsManager periods={periods} />
    </div>
  );
}
