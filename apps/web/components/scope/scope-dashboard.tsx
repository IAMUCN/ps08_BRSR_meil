"use client";

import { rowClick } from "@/components/ui/row-click";
import { BarChart3, ChevronRight, Minus, Table2, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { cn } from "cn";
import { CalculationTraceView } from "@/components/calculation/calculation-trace";
import { DonutChart, type DonutSlice } from "@/components/charts/donut";
import { DocumentViewer } from "@/components/document-viewer/document-viewer";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { formatNumber, linear, linePath, niceTicks } from "@/lib/charts/geometry";
import type { CalculationState } from "@/lib/calculation/trace";
import { barValue, formatCompact, formatTotal } from "@/lib/scope/display";
import type {
  ActivityTotal,
  ScopeBranch,
  ScopeCategory,
  ScopeRecord,
  UnitTotal,
} from "@/lib/scope/totals";
import type { ScopeView } from "@/lib/trpc/routers/scope";

// Scope dashboard (03_APP_FLOW.md §2.2, one template for Scope 1/2/3). Table first — the UI brief rejects
// chart-first dashboards that bury the table — with a bar view drawn inline from the chart tokens. Drilling
// walks whatever org levels exist, and a record opens its trace and the original document.

const APPROVAL: Record<string, { tone: StatusTone; label: string }> = {
  approved: { tone: "success", label: "Approved" },
  review_pending: { tone: "warning", label: "Pending approval" },
  returned: { tone: "error", label: "Returned" },
  not_submitted: { tone: "neutral", label: "Not submitted" },
};

export function ScopeDashboard({
  scopeName,
  view,
  basePath,
  loadRecord,
}: {
  scopeName: string;
  view: ScopeView;
  /** Where drilling navigates, e.g. /admin/scope-1. */
  basePath: string;
  loadRecord: (recordId: string) => Promise<CalculationState>;
}) {
  const router = useRouter();
  // Table or chart (feature_enhancement.md 8.2, requirement 5): kept in the address, so drilling down and
  // changing the period keep it, and it switches every summary section, not only the org-unit one.
  const mode: "table" | "chart" = useSearchParams().get("view") === "chart" ? "chart" : "table";
  const [selected, setSelected] = useState<ScopeRecord | null>(null);
  const [trace, setTrace] = useState<CalculationState | null>(null);

  const href = (params: { org?: string; period?: string; view?: "table" | "chart" }) => {
    const search = new URLSearchParams();
    search.set("org", params.org ?? view.node.id);
    search.set("period", params.period ?? view.periodId);
    if ((params.view ?? mode) === "chart") search.set("view", "chart");
    return `${basePath}?${search.toString()}`;
  };
  const go = (params: { org?: string; period?: string }) => router.push(href(params));
  const setMode = (next: "table" | "chart") =>
    router.replace(href({ view: next }), { scroll: false });

  async function openRecord(record: ScopeRecord) {
    setSelected(record);
    setTrace(null);
    setTrace(await loadRecord(record.recordId));
  }

  const hasNumbers = view.node.totals.length > 0;
  const primaryUnit =
    barValue(view.node.totals)?.unit ?? view.node.totals[0]?.unit ?? "tCO2e";

  const categorySlices: DonutSlice[] = view.categories
    .filter((c) => c.active)
    .map((c) => {
      const b = barValue(c.totals);
      return {
        key: c.code,
        label: c.name,
        value: b?.value ?? 0,
      };
    })
    .filter((s) => s.value > 0);

  const activitySlices: DonutSlice[] = view.byActivity
    .map((a) => {
      const b = barValue(a.totals);
      return {
        key: a.metricId,
        label: a.metricName,
        value: b?.value ?? 0,
      };
    })
    .filter((s) => s.value > 0);

  const branchSlices: DonutSlice[] = view.children
    .map((b) => {
      const v = barValue(b.totals);
      return {
        key: b.id,
        label: b.name,
        value: v?.value ?? 0,
        href: href({ org: b.id }),
      };
    })
    .filter((s) => s.value > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <nav aria-label="Organization path" className="flex flex-wrap items-center gap-1 text-sm">
          {view.path.map((step, i) => (
            <span key={step.id} className="flex items-center gap-1">
              {i > 0 ? (
                <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
              ) : null}
              {i === view.path.length - 1 ? (
                <span className="font-medium">{step.name}</span>
              ) : (
                <button
                  type="button"
                  className="text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => go({ org: step.id })}
                >
                  {step.name}
                </button>
              )}
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <label htmlFor="scope-period" className="text-sm text-muted-foreground">
            Period
          </label>
          <NativeSelect
            id="scope-period"
            value={view.periodId}
            onChange={(e) => go({ period: e.target.value })}
          >
            {view.periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
          <div
            role="group"
            aria-label="Show the figures as"
            className="inline-flex rounded-md border border-border p-0.5"
          >
            {(
              [
                ["table", "Table", Table2],
                ["chart", "Chart", BarChart3],
              ] as const
            ).map(([value, label, Icon]) => (
              <Button
                key={value}
                variant={mode === value ? "default" : "ghost"}
                size="sm"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
              >
                <Icon aria-hidden />
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <section aria-labelledby="scope-total" className="rounded-md border bg-card p-4">
        <h2 id="scope-total" className="text-sm leading-5 font-medium text-muted-foreground">
          {scopeName} — {view.node.name}, {view.periodLabel}
        </h2>
        {hasNumbers ? (
          <dl className="mt-2 space-y-2">
            {view.node.totals.map((total) => (
              <div key={total.unit} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <dd className="font-mono text-xl leading-7 font-semibold">
                  {formatTotal(total.approved, total.unit)}
                </dd>
                <dt className="text-xs text-muted-foreground">
                  approved · {total.records} record(s)
                </dt>
                {total.awaitingApproval > 0 ? (
                  <dt className="text-xs text-status-warning">
                    {formatTotal(total.awaitingApproval, total.unit)} awaiting approval
                  </dt>
                ) : null}
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No calculated data yet for this scope and period.
          </p>
        )}
        {view.node.notCalculated > 0 ? (
          <p className="mt-2 text-xs text-status-warning">
            {view.node.notCalculated} verified record(s) have no calculation yet — usually a missing
            conversion factor.
          </p>
        ) : null}
      </section>

      {view.categories.length > 0 ? (
        <section aria-labelledby="scope-categories" className="space-y-2">
          <h2 id="scope-categories" className="text-sm leading-5 font-semibold">
            Categories — {view.categories.filter((c) => c.active).length} of{" "}
            {view.categories.length} active
          </h2>
          {mode === "chart" ? (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <DonutChart
                title="Emissions by Category"
                description="Share of approved emissions across active categories"
                unit={primaryUnit}
                centreLabel={scopeName}
                slices={categorySlices}
              />
              <Bars
                label="Approved emissions by category"
                items={view.categories
                  .filter((c) => c.active)
                  .map((c) => ({ key: c.code, label: c.name, totals: c.totals }))}
              />
            </div>
          ) : (
            <CategoryTable categories={view.categories} />
          )}
        </section>
      ) : null}

      {view.byActivity.length > 0 ? (
        <section aria-labelledby="scope-activities" className="space-y-2">
          <h2 id="scope-activities" className="text-sm leading-5 font-semibold">
            By activity
          </h2>
          {mode === "chart" ? (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <DonutChart
                title="Emissions by Activity"
                description="Share of approved emissions across ESG activities"
                unit={primaryUnit}
                centreLabel={scopeName}
                slices={activitySlices}
              />
              <Bars
                label="Approved emissions by activity"
                items={view.byActivity.map((a) => ({
                  key: a.metricId,
                  label: a.metricName,
                  totals: a.totals,
                }))}
              />
            </div>
          ) : (
            <ActivityTable activities={view.byActivity} />
          )}
        </section>
      ) : null}

      {view.children.length > 0 ? (
        <section aria-labelledby="scope-children" className="space-y-2">
          <h2 id="scope-children" className="text-sm leading-5 font-semibold">
            By organization unit
          </h2>
          {mode === "chart" ? (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <DonutChart
                title="Emissions by Organization Unit"
                description="Share of approved emissions across project units"
                unit={primaryUnit}
                centreLabel={scopeName}
                slices={branchSlices}
              />
              <Bars
                label="Approved emissions by organization unit"
                items={view.children.map((b) => ({
                  key: b.id,
                  label: b.name,
                  totals: b.totals,
                  onOpen: () => go({ org: b.id }),
                }))}
              />
            </div>
          ) : (
            <BranchTable branches={view.children} onOpen={(id) => go({ org: id })} />
          )}
        </section>
      ) : null}

      {view.records.length > 0 ? (
        <section aria-labelledby="scope-records" className="space-y-2">
          <h2 id="scope-records" className="text-sm leading-5 font-semibold">
            Contributing records at {view.node.name}
          </h2>
          <RecordTable records={view.records} onOpen={openRecord} />
        </section>
      ) : null}

      {view.trend.length > 1 ? (
        <section aria-labelledby="scope-trend" className="space-y-2">
          <h2 id="scope-trend" className="text-sm leading-5 font-semibold">
            Across periods
          </h2>
          {mode === "chart" ? (
            <TrendBars
              trend={view.trend}
              currentPeriodLabel={view.periodLabel}
              getHref={(periodId) => href({ period: periodId })}
            />
          ) : (
            <TrendTable trend={view.trend} />
          )}
        </section>
      ) : null}

      {mode === "chart" && view.records.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          The contributing records stay a table: each row is a document to open.
        </p>
      ) : null}

      <ScopeFooter />

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-[720px] max-w-full">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.fileName ?? selected.metricName}</SheetTitle>
                <SheetDescription>
                  {selected.metricName} · {selected.orgUnitName} · {view.periodLabel}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 overflow-y-auto px-4 pb-6">
                {trace ? (
                  <CalculationTraceView state={trace} />
                ) : (
                  <p className="text-sm text-muted-foreground">Loading the calculation trace…</p>
                )}
                {selected.documentId && selected.mimeType ? (
                  <DocumentViewer
                    src={`/api/documents/${selected.documentId}/file`}
                    mimeType={selected.mimeType}
                    fileName={selected.fileName ?? "Evidence"}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No evidence document is attached to this record.
                  </p>
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * Multi-column footer for Scope reporting (Scope 1, 2, and 3).
 * Provides cross-scope navigation, compliance workflows, and methodology references.
 */
function ScopeFooter() {
  return (
    <footer
      aria-label="Scope Navigation & Guidance"
      className="mt-8 rounded-lg border border-border bg-card/60 p-6 backdrop-blur"
    >
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Emissions Scopes
          </h3>
          <ul className="mt-3 space-y-2 text-xs">
            <li>
              <Link
                href="/admin/scope-1"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Scope 1 — Direct Combustion & Fuels
              </Link>
            </li>
            <li>
              <Link
                href="/admin/scope-2"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Scope 2 — Purchased Electricity & Grid
              </Link>
            </li>
            <li>
              <Link
                href="/admin/scope-3"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Scope 3 — Value Chain & Supply Chain
              </Link>
            </li>
            <li>
              <Link
                href="/admin/data-explorer"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Data Explorer & Cross-Scope Pivot
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Oversight & Compliance
          </h3>
          <ul className="mt-3 space-y-2 text-xs">
            <li>
              <Link
                href="/admin/submissions"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Submission Monitoring & Deadlines
              </Link>
            </li>
            <li>
              <Link
                href="/admin/validation-queue"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Validation & Anomaly Alerts
              </Link>
            </li>
            <li>
              <Link
                href="/admin/approval-queue"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Approval Sign-off & Audit Evidence
              </Link>
            </li>
            <li>
              <Link
                href="/admin/reports"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                BRSR Core & Greenhouse Gas Inventory
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Methodology & Standards
          </h3>
          <ul className="mt-3 space-y-2 text-xs">
            <li>
              <Link
                href="/admin/conversion-factors"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Conversion Factors & Coefficients
              </Link>
            </li>
            <li>
              <Link
                href="/admin/audit-trail"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Immutable Audit Trail & Activity Logs
              </Link>
            </li>
            <li>
              <Link
                href="/admin/carbon-intelligence"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Carbon Intelligence & Forecasts
              </Link>
            </li>
            <li>
              <Link
                href="/app/help"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Help & BRSR Reporting Documentation
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-border pt-4 text-[11px] text-muted-foreground sm:flex-row">
        <p>© {new Date().getFullYear()} EmeilSG · Evidence-first ESG & BRSR reporting platform.</p>
        <p className="flex items-center gap-1.5 font-mono">
          <span>GHG Protocol</span>
          <span>·</span>
          <span>SEBI BRSR Format</span>
        </p>
      </div>
    </footer>
  );
}

/** UI brief §13.1: partial coverage is stated, never implied away. */
function CategoryTable({ categories }: { categories: ScopeCategory[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-table-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-table-header text-table-header-foreground">
          <tr>
            {["Category", "Status", "Approved", "Awaiting approval", "Records"].map((h, i) => (
              <th
                key={i}
                scope="col"
                className="px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr
              key={category.code}
              className={cn(
                "border-t border-table-border bg-table-row even:bg-table-row-alt",
                !category.active && "text-muted-foreground",
              )}
            >
              <td className="px-3 py-3 font-medium">{category.name}</td>
              <td className="px-3 py-3">
                <StatusBadge tone={category.active ? "success" : "neutral"}>
                  {category.active ? "Active" : "Not enabled"}
                </StatusBadge>
                {category.active && !category.configured ? (
                  <span className="block text-[11px] text-status-warning">
                    No activity configured yet
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-3 font-mono text-xs">
                {category.totals.length === 0
                  ? "—"
                  : category.totals.map((t) => formatTotal(t.approved, t.unit)).join(" · ")}
              </td>
              <td className="px-3 py-3 font-mono text-xs">
                {category.totals.some((t) => t.awaitingApproval > 0)
                  ? category.totals
                      .filter((t) => t.awaitingApproval > 0)
                      .map((t) => formatCompact(t.awaitingApproval, t.unit))
                      .join(" · ")
                  : "—"}
              </td>
              <td className="px-3 py-3 text-xs">
                {category.totals.reduce((sum, t) => sum + t.records, 0)}
                {category.notCalculated > 0 ? (
                  <span className="block text-status-warning">
                    {category.notCalculated} not calculated
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityTable({ activities }: { activities: ActivityTotal[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-table-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-table-header text-table-header-foreground">
          <tr>
            {["Activity", "Approved", "Awaiting approval", "Records"].map((h, i) => (
              <th
                key={i}
                scope="col"
                className="px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activities.map((activity) => (
            <tr
              key={activity.metricId}
              className="border-t border-table-border bg-table-row even:bg-table-row-alt"
            >
              <td className="px-3 py-3 font-medium">{activity.metricName}</td>
              <td className="px-3 py-3 font-mono text-xs">
                {activity.totals.length === 0
                  ? "—"
                  : activity.totals.map((t) => formatTotal(t.approved, t.unit)).join(" · ")}
              </td>
              <td className="px-3 py-3 font-mono text-xs">
                {activity.totals.some((t) => t.awaitingApproval > 0)
                  ? activity.totals
                      .filter((t) => t.awaitingApproval > 0)
                      .map((t) => formatCompact(t.awaitingApproval, t.unit))
                      .join(" · ")
                  : "—"}
              </td>
              <td className="px-3 py-3 text-xs">
                {activity.totals.reduce((sum, t) => sum + t.records, 0)}
                {activity.notCalculated > 0 ? (
                  <span className="block text-status-warning">
                    {activity.notCalculated} not calculated
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BranchTable({
  branches,
  onOpen,
}: {
  branches: ScopeBranch[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-table-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-table-header text-table-header-foreground">
          <tr>
            {["Unit", "Type", "Approved", "Awaiting approval", "Records", ""].map((h, i) => (
              <th
                key={i}
                scope="col"
                className="px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
              >
                {h || <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {branches.map((branch) => (
            <tr
              key={branch.id}
              className="border-t border-table-border bg-table-row even:bg-table-row-alt hover:bg-table-row-hover"
            >
              <td className="px-3 py-3 font-medium">{branch.name}</td>
              <td className="px-3 py-3 text-xs text-muted-foreground capitalize">
                {branch.unitType.replace(/_/g, " ")}
              </td>
              <td className="px-3 py-3 font-mono text-xs">
                {branch.totals.length === 0
                  ? "—"
                  : branch.totals.map((t) => formatTotal(t.approved, t.unit)).join(" · ")}
              </td>
              <td className="px-3 py-3 font-mono text-xs">
                {branch.totals.some((t) => t.awaitingApproval > 0)
                  ? branch.totals
                      .filter((t) => t.awaitingApproval > 0)
                      .map((t) => formatCompact(t.awaitingApproval, t.unit))
                      .join(" · ")
                  : "—"}
              </td>
              <td className="px-3 py-3 text-xs">
                {branch.totals.reduce((sum, t) => sum + t.records, 0)}
                {branch.notCalculated > 0 ? (
                  <span className="block text-status-warning">
                    {branch.notCalculated} not calculated
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-3 text-right">
                <Button variant="ghost" size="sm" onClick={() => onOpen(branch.id)}>
                  Drill down
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Horizontal bars, one hue (the brief's chart tokens), every bar labelled with its figure, no charting
 * dependency. Approved figures only; units are never added together (barValue).
 */
function Bars({
  label,
  items,
}: {
  label: string;
  items: { key: string; label: string; totals: UnitTotal[]; onOpen?: () => void }[];
}) {
  const rows = items.map((item) => ({ ...item, bar: barValue(item.totals) }));
  const units = [...new Set(rows.flatMap((r) => (r.bar ? [r.bar.unit] : [])))];
  const max = Math.max(...rows.map((r) => r.bar?.value ?? 0), 0);
  if (rows.every((r) => !r.bar))
    return (
      <p className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
        Nothing approved to draw yet.
      </p>
    );
  return (
    <figure className="rounded-md border bg-card p-4">
      <figcaption className="mb-2 text-xs text-muted-foreground">
        {label}
        {units.length === 1 ? `, ${units[0]}` : ""}. Approved records only.
      </figcaption>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.key}
            className="grid grid-cols-[minmax(6rem,12rem)_1fr_auto] items-center gap-3 text-sm"
          >
            {r.onOpen ? (
              <button
                type="button"
                className="truncate text-left underline-offset-2 hover:underline"
                onClick={r.onOpen}
                title={`Drill down into ${r.label}`}
              >
                {r.label}
              </button>
            ) : (
              <span className="truncate" title={r.label}>
                {r.label}
              </span>
            )}
            <span className="h-3 rounded-sm bg-[var(--chart-neutral-reference)]" aria-hidden>
              <span
                className="block h-3 rounded-sm bg-[var(--chart-primary)]"
                style={{
                  width: `${r.bar && max > 0 ? Math.max(1, Math.round((r.bar.value / max) * 100)) : 0}%`,
                }}
              />
            </span>
            <span className="font-mono text-xs">
              {r.bar ? formatCompact(r.bar.value, r.bar.unit) : "—"}
              {r.bar?.leftOut.length ? (
                <span className="block text-[11px] text-muted-foreground">
                  + {r.bar.leftOut.join(", ")} not drawn
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function TrendTable({ trend }: { trend: ScopeView["trend"] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-table-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-table-header text-table-header-foreground">
          <tr>
            {["Period", "Approved"].map((h) => (
              <th
                key={h}
                scope="col"
                className="px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trend.map((period) => (
            <tr
              key={period.periodId}
              className="border-t border-table-border bg-table-row even:bg-table-row-alt"
            >
              <td className="px-3 py-3 font-medium">{period.label}</td>
              <td className="px-3 py-3 font-mono text-xs">
                {period.totals.length === 0
                  ? "—"
                  : period.totals.map((t) => formatTotal(t.approved, t.unit)).join(" · ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendBars({
  trend,
  currentPeriodLabel,
  getHref,
}: {
  trend: ScopeView["trend"];
  currentPeriodLabel?: string;
  getHref?: (periodId: string) => string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const bars = trend.map((t) => barValue(t.totals));
  const values = bars.map((b) => b?.value ?? 0);
  const unit = bars.find((b) => b?.unit)?.unit ?? "tCO2e";

  const nonZero = values.filter((v) => v > 0);
  const max = Math.max(...values, 1);
  const min = nonZero.length > 0 ? Math.min(...nonZero) : 0;
  const avg = nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0;

  const firstVal = values.find((v) => v > 0) ?? 0;
  const lastVal = [...values].reverse().find((v) => v > 0) ?? 0;
  const overallDelta = firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0;

  const maxPeriod = trend[values.indexOf(max)];

  // Layout parameters for SVG
  const W = Math.max(760, trend.length * 115);
  const H = 260;
  const M = { top: 40, right: 32, bottom: 48, left: 64 };

  const ticks = niceTicks(0, max * 1.15, 5);
  const topTick = ticks[ticks.length - 1] || max;
  const yScale = linear(0, topTick, H - M.bottom, M.top);
  const band = (W - M.left - M.right) / Math.max(1, trend.length);
  const barW = Math.min(46, Math.max(26, band * 0.46));

  const points = values.map((v, i) => ({
    x: M.left + band * i + band / 2,
    y: yScale(v),
  }));

  const trendLine = linePath(points);
  const areaPath =
    points.length > 1
      ? `${trendLine} L ${points[points.length - 1].x} ${yScale(0)} L ${points[0].x} ${yScale(0)} Z`
      : "";

  return (
    <div className="space-y-3 rounded-lg border bg-card p-5 shadow-xs">
      {/* Header & KPI Summary strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Monthly Emission Trend</span>
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            {unit}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Overall Trend Pill */}
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
              overallDelta > 0
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : overallDelta < 0
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {overallDelta > 0 ? (
              <TrendingUp className="size-3.5" aria-hidden />
            ) : overallDelta < 0 ? (
              <TrendingDown className="size-3.5" aria-hidden />
            ) : (
              <Minus className="size-3.5" aria-hidden />
            )}
            <span>
              {overallDelta > 0 ? `+${overallDelta.toFixed(1)}%` : `${overallDelta.toFixed(1)}%`} overall
            </span>
          </div>

          {/* Average */}
          {avg > 0 && (
            <div className="rounded-full bg-muted/60 px-2.5 py-1 text-muted-foreground">
              Avg:{" "}
              <span className="font-mono font-medium text-foreground">
                {avg.toFixed(2)} {unit}
              </span>
              /mo
            </div>
          )}

          {/* Peak */}
          {maxPeriod && max > 0 && (
            <div className="rounded-full bg-muted/60 px-2.5 py-1 text-muted-foreground">
              Peak:{" "}
              <span className="font-medium text-foreground">{maxPeriod.label}</span> (
              <span className="font-mono font-medium text-foreground">
                {max.toFixed(2)}
              </span>
              )
            </div>
          )}
        </div>
      </div>

      {/* SVG Graphical Chart */}
      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[680px] select-none overflow-visible"
          role="img"
          aria-label="Scope emissions trend chart across periods"
        >
          <defs>
            {/* Gradient for regular bars */}
            <linearGradient id="trend-bar-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.75" />
            </linearGradient>

            {/* Gradient for active / selected period bar */}
            <linearGradient id="trend-bar-active" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="1" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.85" />
            </linearGradient>

            {/* Gradient for area fill beneath trend line */}
            <linearGradient id="trend-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines & Y-Axis Scale */}
          {ticks.map((t) => {
            const y = yScale(t);
            return (
              <g key={t}>
                <line
                  x1={M.left}
                  x2={W - M.right}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className={cn(t === 0 ? "text-border" : "text-border/40")}
                  strokeWidth={t === 0 ? 1.5 : 1}
                  strokeDasharray={t === 0 ? undefined : "3 3"}
                />
                <text
                  x={M.left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-muted-foreground font-mono text-[10px]"
                >
                  {formatNumber(t)}
                </text>
              </g>
            );
          })}

          {/* Subtle Area Fill under Trend Line */}
          {areaPath && <path d={areaPath} fill="url(#trend-area-grad)" />}

          {/* Trend Polyline */}
          {trendLine && (
            <path
              d={trendLine}
              fill="none"
              stroke="var(--chart-2)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Individual Period Bars & Markers */}
          {trend.map((period, i) => {
            const cx = points[i].x;
            const v = values[i];
            const y = yScale(v);
            const y0 = yScale(0);
            const barH = Math.max(4, y0 - y);
            const isCurrent = currentPeriodLabel === period.label;
            const isHovered = hoveredIdx === i;
            const prevVal = i > 0 ? values[i - 1] : null;
            const delta =
              prevVal !== null && prevVal > 0 ? ((v - prevVal) / prevVal) * 100 : null;

            const barContent = (
              <g
                key={period.periodId}
                className="cursor-pointer transition-opacity"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Background track column */}
                <rect
                  x={cx - barW / 2}
                  y={M.top}
                  width={barW}
                  height={y0 - M.top}
                  rx={5}
                  fill="currentColor"
                  className={cn(
                    "transition-colors",
                    isCurrent
                      ? "text-primary/10"
                      : isHovered
                        ? "text-muted/50"
                        : "text-muted/20",
                  )}
                />

                {/* Vertical Bar */}
                <rect
                  x={cx - barW / 2}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={5}
                  fill={isCurrent ? "url(#trend-bar-active)" : "url(#trend-bar-grad)"}
                  stroke={isCurrent ? "var(--primary)" : isHovered ? "var(--foreground)" : "transparent"}
                  strokeWidth={isCurrent || isHovered ? 1.5 : 0}
                  className="transition-all duration-200"
                />

                {/* Trend line vertex circle */}
                <circle
                  cx={cx}
                  cy={y}
                  r={isHovered ? 6 : isCurrent ? 5 : 4}
                  fill="var(--chart-2)"
                  stroke="var(--card)"
                  strokeWidth="2"
                  className="transition-all"
                />

                {/* Value Label above Bar */}
                <text
                  x={cx}
                  y={y - (delta !== null ? 18 : 10)}
                  textAnchor="middle"
                  className={cn(
                    "font-mono text-[11px] transition-all",
                    isCurrent
                      ? "fill-primary font-bold"
                      : isHovered
                        ? "fill-foreground font-bold"
                        : "fill-foreground/90 font-medium",
                  )}
                >
                  {bars[i] ? formatCompact(bars[i]!.value, bars[i]!.unit) : "—"}
                </text>

                {/* Period-over-period Delta Pill */}
                {delta !== null ? (
                  <text
                    x={cx}
                    y={y - 7}
                    textAnchor="middle"
                    className={cn(
                      "font-mono text-[10px] font-semibold",
                      delta > 0
                        ? "fill-amber-600 dark:fill-amber-400"
                        : delta < 0
                          ? "fill-emerald-600 dark:fill-emerald-400"
                          : "fill-muted-foreground",
                    )}
                  >
                    {delta > 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}
                  </text>
                ) : null}

                {/* Active Period Indicator */}
                {isCurrent && (
                  <rect
                    x={cx - 18}
                    y={H - M.bottom + 4}
                    width={36}
                    height={3}
                    rx={1.5}
                    fill="var(--primary)"
                  />
                )}

                {/* Period Label on X-Axis */}
                <text
                  x={cx}
                  y={H - M.bottom + 20}
                  textAnchor="middle"
                  className={cn(
                    "text-[11px] transition-colors",
                    isCurrent
                      ? "fill-foreground font-bold"
                      : isHovered
                        ? "fill-foreground font-medium"
                        : "fill-muted-foreground",
                  )}
                >
                  {period.label}
                </text>
              </g>
            );

            return getHref ? (
              <Link
                key={period.periodId}
                href={getHref(period.periodId)}
                title={`Switch to ${period.label}`}
                className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {barContent}
              </Link>
            ) : (
              barContent
            );
          })}
        </svg>

        {/* Hover Floating Details Card */}
        {hoveredIdx !== null && (
          <div
            className="pointer-events-none absolute z-20 rounded-md border bg-popover px-3 py-2 text-xs shadow-lg transition-all"
            style={{
              left: `${Math.min(
                Math.max(10, (points[hoveredIdx].x / W) * 100),
                90,
              )}%`,
              top: `${Math.max(10, (points[hoveredIdx].y / H) * 100 - 18)}%`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="font-semibold text-popover-foreground">
              {trend[hoveredIdx].label}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-sm font-bold text-foreground">
                {values[hoveredIdx].toFixed(2)}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">{unit}</span>
            </div>
            {hoveredIdx > 0 && values[hoveredIdx - 1] > 0 && (
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                vs {trend[hoveredIdx - 1].label}:{" "}
                <span
                  className={cn(
                    "font-mono font-medium",
                    values[hoveredIdx] > values[hoveredIdx - 1]
                      ? "text-amber-600 dark:text-amber-400"
                      : values[hoveredIdx] < values[hoveredIdx - 1]
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground",
                  )}
                >
                  {values[hoveredIdx] >= values[hoveredIdx - 1] ? "+" : ""}
                  {(values[hoveredIdx] - values[hoveredIdx - 1]).toFixed(2)} (
                  {(
                    ((values[hoveredIdx] - values[hoveredIdx - 1]) /
                      values[hoveredIdx - 1]) *
                    100
                  ).toFixed(1)}
                  %)
                </span>
              </div>
            )}
            {getHref && (
              <div className="mt-1 border-t pt-1 text-[10px] text-primary-text">
                Click to switch dashboard to this period
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend & Instructions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block size-3 rounded-xs"
              style={{ background: "var(--chart-1)" }}
              aria-hidden
            />
            <span>Approved Emissions</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-3.5 rounded-full"
              style={{ background: "var(--chart-2)" }}
              aria-hidden
            />
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: "var(--chart-2)" }}
              aria-hidden
            />
            <span>Trend Trajectory</span>
          </div>
          {currentPeriodLabel && (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block size-3 rounded-xs border-2 border-primary bg-primary/20"
                aria-hidden
              />
              <span>Current Period ({currentPeriodLabel})</span>
            </div>
          )}
        </div>
        <div>
          <span>Click any bar to jump to that period</span>
        </div>
      </div>
    </div>
  );
}

function RecordTable({
  records,
  onOpen,
}: {
  records: ScopeRecord[];
  onOpen: (record: ScopeRecord) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-table-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-table-header text-table-header-foreground">
          <tr>
            {["Document", "Activity", "Verified value", "Result", "Approval"].map((h, i) => (
              <th
                key={i}
                scope="col"
                className="px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr
              key={record.recordId}
              onClick={rowClick(() => onOpen(record))}
              className="cursor-pointer border-t border-table-border bg-table-row even:bg-table-row-alt hover:bg-table-row-hover"
            >
              <td className="px-3 py-3">
                <button
                  type="button"
                  className="font-medium underline-offset-2 hover:underline"
                  onClick={() => onOpen(record)}
                >
                  {record.fileName ?? "Record"}
                </button>
              </td>
              <td className="px-3 py-3 text-xs text-muted-foreground">{record.metricName}</td>
              <td className="px-3 py-3 font-mono text-xs">
                {record.activityValue === null
                  ? "—"
                  : formatCompact(record.activityValue, record.activityUnit ?? "")}
              </td>
              <td className="px-3 py-3 font-mono text-xs">
                {record.resultValue === null
                  ? "Not calculated"
                  : formatCompact(record.resultValue, record.resultUnit ?? "")}
              </td>
              <td className="px-3 py-3">
                <StatusBadge tone={APPROVAL[record.approvalStatus]?.tone ?? "neutral"}>
                  {APPROVAL[record.approvalStatus]?.label ?? record.approvalStatus}
                </StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
