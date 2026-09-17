import {
  AlertTriangle,
  CircleDashed,
  Flame,
  Link2,
  ShieldCheck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { NoticeToast } from "@/components/shell/notice-toast";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Admin Dashboard · TraceESG" };

type KpiCard = { title: string; icon?: LucideIcon; accent?: string; important?: boolean };

// UI brief §13.1 — row 1 follows the pipeline order; row 2 is scope and readiness.
const PIPELINE_KPIS: KpiCard[] = [
  { title: "Submission Completion" },
  { title: "Evidence Coverage" },
  { title: "Validation Completion" },
  { title: "Approval Completion" },
];
const SCOPE_KPIS: KpiCard[] = [
  { title: "Scope 1 Completion", icon: Flame, accent: "text-scope-1" },
  { title: "Scope 2 Completion", icon: Zap, accent: "text-scope-2" },
  { title: "Scope 3 Completion", icon: Link2, accent: "text-scope-3" },
  { title: "BRSR Readiness", icon: ShieldCheck, accent: "text-kpi-important", important: true },
];
const ISSUES = [
  "Projects with missing submissions",
  "Records missing evidence",
  "Low-confidence OCR records",
  "Validation failures",
  "Anomalous values",
  "Pending approvals",
  "Incomplete BRSR indicators",
];

function PlaceholderLabel() {
  return (
    <p className="text-xs leading-4 text-muted-foreground">
      Development placeholder — data arrives in Phase 16
    </p>
  );
}

function KpiRow({ cards, label }: { cards: KpiCard[]; label: string }) {
  return (
    <section aria-label={label} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className={`rounded-md border bg-card p-4 ${card.important ? "border-kpi-important/60" : ""}`}
        >
          <div className="flex items-center gap-2">
            {card.icon ? (
              <card.icon className={`size-5 ${card.accent}`} strokeWidth={1.5} aria-hidden />
            ) : null}
            <h2 className="text-sm leading-5 font-semibold text-kpi-title">{card.title}</h2>
          </div>
          <p
            className="mt-3 text-[32px] leading-10 font-semibold text-kpi-number"
            aria-label="No data yet"
          >
            —
          </p>
          <div className="mt-2 h-1.5 rounded-sm bg-muted" aria-hidden />
          <div className="mt-2">
            <PlaceholderLabel />
          </div>
        </div>
      ))}
    </section>
  );
}

export default async function AdminDashboardPage({ searchParams }: PageProps<"/admin">) {
  const [, params, caller] = await Promise.all([requireAdminSession(), searchParams, api()]);
  const counts = await caller.dashboard.headerCounts();

  return (
    <div className="max-w-7xl space-y-6">
      <NoticeToast notice={typeof params.notice === "string" ? params.notice : undefined} />
      <PageHeader
        title="Admin Dashboard"
        description="Reporting readiness across the organization."
      />

      <dl
        className="flex flex-wrap gap-x-8 gap-y-2 text-sm leading-5"
        aria-label="Organization overview"
      >
        {[
          ["Organizations", counts.organizations],
          ["Projects", counts.projects],
          ["Active users", counts.activeUsers],
        ].map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <KpiRow cards={PIPELINE_KPIS} label="Completion pipeline" />
      <KpiRow cards={SCOPE_KPIS} label="Scope and readiness" />

      <section aria-labelledby="issues-heading" className="rounded-md border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="issues-heading" className="text-base leading-6 font-semibold">
            Issues
          </h2>
          <PlaceholderLabel />
        </div>
        <ul className="divide-y">
          {ISSUES.map((issue) => (
            <li key={issue} className="flex items-center gap-3 px-4 py-3 text-sm leading-5">
              <AlertTriangle
                className="size-4 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="w-8 font-mono text-muted-foreground" aria-label="No data yet">
                —
              </span>
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="flex items-center gap-2 text-xs leading-4 text-muted-foreground">
        <CircleDashed className="size-4" strokeWidth={1.5} aria-hidden />
        Organizations = subsidiary/entity nodes under the group.
      </p>
    </div>
  );
}
