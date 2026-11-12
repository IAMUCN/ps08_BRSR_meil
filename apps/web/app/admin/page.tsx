import {
  AlertTriangle,
  ClipboardCheck,
  FileWarning,
  Flame,
  Link2,
  ListTree,
  ScanText,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
import { ContextPicker, ReadinessInfo } from "@/components/dashboard/control-tower-parts";
import { NeedsActionBand, TileGrid } from "@/components/dashboard/tile-views";
import { EmptyState } from "@/components/shell/empty-state";
import { NoticeToast } from "@/components/shell/notice-toast";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminAreaSession } from "@/lib/auth/session";
import type { Fraction } from "@/lib/dashboard/kpis";
import { readParams } from "@/lib/records/params";
import { api } from "@/lib/trpc/server";
import { KpiTrendsCard } from "./kpi-trends";

export const metadata: Metadata = { title: "Admin Dashboard · EmeilSG" };

// The Admin Control Tower (UI brief §13.1, Master Approach §33, .grill/phase-16-control-tower-decisions.md):
// header strip, the completion pipeline, scope and readiness, and the issue panel — for the org node and
// period in the URL. Every card and issue row links to the exact slice it counted.

type Card = {
  title: string;
  fraction: Fraction;
  href: string;
  empty: string;
  support?: string;
  icon?: LucideIcon;
  accent?: string;
  important?: boolean;
  extra?: React.ReactNode;
};

function KpiCard({ card }: { card: Card }) {
  const value = card.fraction.value;
  return (
    <div
      className={cn(
        "relative rounded-md border bg-card p-4 transition-colors hover:border-foreground/30",
        card.important && "border-kpi-important/60",
      )}
    >
      <div className="flex items-center gap-2">
        {card.icon ? (
          <card.icon className={cn("size-5", card.accent)} strokeWidth={1.5} aria-hidden />
        ) : null}
        <h2 className="text-sm leading-5 font-semibold text-kpi-title">
          <Link href={card.href} className="after:absolute after:inset-0">
            {card.title}
          </Link>
        </h2>
        {card.extra ? <span className="relative z-10 ml-auto">{card.extra}</span> : null}
      </div>
      <p className="mt-3 text-[32px] leading-10 font-semibold text-kpi-number">
        {value === null ? "—" : `${Math.round(value)} %`}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-muted" aria-hidden>
        <div
          className={cn("h-full", card.important ? "bg-kpi-important" : "bg-kpi-number")}
          style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
        />
      </div>
      <p className="mt-2 text-xs leading-4 text-muted-foreground">
        {value === null
          ? card.empty
          : (card.support ?? `${card.fraction.numerator} / ${card.fraction.denominator}`)}
      </p>
    </div>
  );
}

export default async function AdminDashboardPage({ searchParams }: PageProps<"/admin">) {
  const [, raw, caller] = await Promise.all([requireAdminAreaSession(), searchParams, api()]);
  const q = readParams(raw);
  const { context, summary } = await caller.records.summary({
    orgUnitId: q.orgUnitId,
    periodId: q.periodId,
  });
  const [trends, tiles] = await Promise.all([
    caller.records.kpiTrends({ orgUnitId: context.orgUnitId }),
    caller.dashboard.tiles({ periodId: context.periodId || undefined }),
  ]);
  const ctx = `org=${context.orgUnitId}&period=${context.periodId}`;
  const notice = typeof raw.notice === "string" ? raw.notice : undefined;

  if (!summary) {
    return (
      <div className="max-w-7xl space-y-6">
        <NoticeToast notice={notice} />
        <PageHeader
          title="Admin Dashboard"
          description="Reporting readiness across the organization."
        />
        <EmptyState
          nested
          icon={TrendingUp}
          title="No activity yet"
          message="Create a reporting period and the organization hierarchy to start collecting submissions."
          link={{ href: "/admin/reporting-periods", label: "Create a reporting period" }}
        />
      </div>
    );
  }

  const noExpectations = "No expected submissions configured — set them on the Organization page.";
  const noRecords = `No records in ${context.periodLabel} yet.`;
  const pipeline: Card[] = [
    {
      title: "Submission Completion",
      fraction: summary.pipeline.submission,
      href: `/admin/submissions?${ctx}&issue=missing_submissions`,
      empty: noExpectations,
    },
    {
      title: "Evidence Coverage",
      fraction: summary.pipeline.evidence,
      href: `/admin/submissions?${ctx}&issue=missing_evidence`,
      empty: noRecords,
    },
    {
      title: "Validation Completion",
      fraction: summary.pipeline.validation,
      href: `/admin/submissions?${ctx}&status=not_validated`,
      empty: "No verified records yet.",
    },
    {
      title: "Approval Completion",
      fraction: summary.pipeline.approval,
      href: `/admin/submissions?${ctx}&issue=pending_approval`,
      empty: "No records have passed validation yet.",
    },
  ];
  const scopeLook = {
    SCOPE_1: { icon: Flame, accent: "text-scope-1", href: "/admin/scope-1" },
    SCOPE_2: { icon: Zap, accent: "text-scope-2", href: "/admin/scope-2" },
    SCOPE_3: { icon: Link2, accent: "text-scope-3", href: "/admin/scope-3" },
  };
  const scopes: Card[] = summary.scopes.map((s) => ({
    title: `${s.name} Completion`,
    fraction: s.completion,
    href: `${scopeLook[s.code].href}?${ctx}`,
    icon: scopeLook[s.code].icon,
    accent: scopeLook[s.code].accent,
    empty: s.categories
      ? `${s.categories.active} of ${s.categories.total} categories active · no expected submissions`
      : `No expected ${s.name} submissions configured.`,
    support: s.categories
      ? `${s.completion.numerator} / ${s.completion.denominator} approved · ${s.categories.active} of ${s.categories.total} categories active`
      : `${s.completion.numerator} / ${s.completion.denominator} expected submissions approved`,
  }));
  scopes.push({
    title: "BRSR Readiness",
    fraction: {
      numerator: 0,
      denominator: 0,
      value: summary.readiness.value,
    },
    href: `/admin/brsr-mapping?tab=readiness&period=${context.periodId}`,
    icon: ShieldCheck,
    accent: "text-kpi-important",
    important: true,
    empty: "Nothing to measure yet this period.",
    support: "Internal indicator, not an official score",
    extra: <ReadinessInfo readiness={summary.readiness} />,
  });

  const issues: { key: string; icon: LucideIcon; label: string; href: string }[] = [
    {
      key: "missing_submissions",
      icon: AlertTriangle,
      label: "Projects with missing submissions",
      href: `/admin/submissions?${ctx}&issue=missing_submissions`,
    },
    {
      key: "missing_evidence",
      icon: FileWarning,
      label: "Records missing evidence",
      href: `/admin/submissions?${ctx}&issue=missing_evidence`,
    },
    {
      key: "low_confidence",
      icon: ScanText,
      label: "Low-confidence OCR records awaiting verification",
      href: `/admin/submissions?${ctx}&issue=low_confidence`,
    },
    {
      key: "validation_failed",
      icon: ShieldAlert,
      label: "Validation failures",
      href: `/admin/submissions?${ctx}&issue=validation_failed`,
    },
    {
      key: "anomaly",
      icon: TrendingUp,
      label: "Anomalous values awaiting review",
      href: `/admin/submissions?${ctx}&issue=anomaly`,
    },
    {
      key: "pending_approval",
      icon: ClipboardCheck,
      label: "Pending approvals",
      href: `/admin/submissions?${ctx}&issue=pending_approval`,
    },
    {
      key: "incomplete_indicators",
      icon: ListTree,
      label: "Incomplete BRSR indicators",
      href: `/admin/brsr-mapping?tab=readiness&period=${context.periodId}`,
    },
  ];

  return (
    <div className="max-w-7xl space-y-6">
      <NoticeToast notice={notice} />
      <PageHeader
        title="Admin Dashboard"
        description={`Reporting readiness for ${context.orgUnits.find((o) => o.id === context.orgUnitId)?.name} and everything beneath it, ${context.periodLabel}.`}
        action={<ContextPicker context={context} />}
      />

      <dl
        className="flex flex-wrap gap-x-8 gap-y-2 text-sm leading-5"
        aria-label="Organization overview"
      >
        {[
          ["Organizations", summary.header.organizations],
          ["Projects", summary.header.projects],
          ["Active users", summary.header.activeUsers],
        ].map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      {/* Role-wise dashboard (Phase 2): the tiles this person's permissions earn. The cards below are the
          earlier Control Tower and are replaced as the next phases land. */}
      <NeedsActionBand tiles={tiles.band} />
      <TileGrid tiles={tiles.grid} />

      <section
        aria-label="Completion pipeline"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {pipeline.map((card) => (
          <KpiCard key={card.title} card={card} />
        ))}
      </section>
      <section
        aria-label="Scope and readiness"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {scopes.map((card) => (
          <KpiCard key={card.title} card={card} />
        ))}
      </section>

      <section aria-labelledby="issues-heading" className="rounded-md border bg-card">
        <h2 id="issues-heading" className="border-b px-4 py-3 text-base leading-6 font-semibold">
          Issues
        </h2>
        <ul className="divide-y">
          {issues.map((issue) => {
            const n = summary.issues[issue.key as keyof typeof summary.issues];
            return (
              <li key={issue.key}>
                <Link
                  href={issue.href}
                  className="flex items-center gap-3 px-4 py-3 text-sm leading-5 hover:bg-muted"
                >
                  <issue.icon
                    className={cn(
                      "size-4",
                      n > 0 ? "text-status-warning" : "text-muted-foreground",
                    )}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      "w-8 font-mono",
                      n > 0 ? "font-semibold" : "text-muted-foreground",
                    )}
                  >
                    {n}
                  </span>
                  <span>{issue.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <KpiTrendsCard
        trends={trends}
        orgName={context.orgUnits.find((o) => o.id === context.orgUnitId)?.name ?? ""}
      />
    </div>
  );
}
