"use client";

import { rowClick } from "@/components/ui/row-click";
import { BarChart3, ChevronRight, Table2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { cn } from "cn";
import { CalculationTraceView } from "@/components/calculation/calculation-trace";
import { DocumentViewer } from "@/components/document-viewer/document-viewer";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { PeriodSelect } from "@/components/ui/period-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
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
          <PeriodSelect
            idPrefix="scope"
            inline
            periods={view.periods}
            value={view.periodId}
            onChange={(period) => go({ period })}
          />
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
            <Bars
              label="Approved emissions by category"
              items={view.categories
                .filter((c) => c.active)
                .map((c) => ({ key: c.code, label: c.name, totals: c.totals }))}
            />
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
            <Bars
              label="Approved emissions by activity"
              items={view.byActivity.map((a) => ({
                key: a.metricId,
                label: a.metricName,
                totals: a.totals,
              }))}
            />
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
            <Bars
              label="Approved emissions by organization unit"
              items={view.children.map((b) => ({
                key: b.id,
                label: b.name,
                totals: b.totals,
                onOpen: () => go({ org: b.id }),
              }))}
            />
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
          {mode === "chart" ? <TrendBars trend={view.trend} /> : <TrendTable trend={view.trend} />}
        </section>
      ) : null}

      {mode === "chart" && view.records.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          The contributing records stay a table: each row is a document to open.
        </p>
      ) : null}

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
      <Donut
        slices={rows.flatMap((r, i) =>
          r.bar && r.bar.value > 0 && r.bar.unit === units[0]
            ? [{ key: r.key, label: r.label, value: r.bar.value, color: SLICE[i % SLICE.length] }]
            : [],
        )}
        unit={units[0]}
        mixedUnits={units.length > 1}
      />
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

const SLICE = [1, 2, 3, 4, 5, 6].map((n) => `var(--chart-${n})`);

/** Share of the total as a donut with a legend (same figures as the bars; one unit only, never mixed). */
function Donut({
  slices,
  unit,
  mixedUnits,
}: {
  slices: { key: string; label: string; value: number; color: string }[];
  unit: string;
  mixedUnits: boolean;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (slices.length < 2 || total <= 0) return null;
  const R = 40;
  const C = 2 * Math.PI * R;
  const starts = slices.map((_, i) =>
    slices.slice(0, i).reduce((s, x) => s + (x.value / total) * C, 0),
  );
  return (
    <div className="mb-4 flex flex-wrap items-center gap-6">
      <svg
        viewBox="0 0 100 100"
        className="h-40 w-40 shrink-0 -rotate-90"
        role="img"
        aria-label={`Share of the total by ${slices.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(", ")}`}
      >
        {slices.map((s, i) => {
          const len = (s.value / total) * C;
          return (
            <circle
              key={s.key}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="18"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-starts[i]}
            >
              <title>{`${s.label}: ${formatCompact(s.value, unit)}`}</title>
            </circle>
          );
        })}
      </svg>
      <ul className="space-y-1 text-sm">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            <span>{s.label}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {((s.value / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
        {mixedUnits ? (
          <li className="text-xs text-muted-foreground">Only {unit} shown; units are not mixed.</li>
        ) : null}
      </ul>
    </div>
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

function TrendBars({ trend }: { trend: ScopeView["trend"] }) {
  const bars = trend.map((t) => barValue(t.totals));
  const values = bars.map((b) => b?.value ?? 0);
  const max = Math.max(...values, 1);
  return (
    <ol className="flex items-end gap-3 overflow-x-auto rounded-md border bg-card p-4">
      {trend.map((period, i) => (
        <li key={period.periodId} className="flex w-20 shrink-0 flex-col items-center gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">
            {bars[i] ? formatCompact(bars[i]!.value, bars[i]!.unit) : "—"}
          </span>
          <span
            className={cn("w-full rounded-t-sm bg-[var(--chart-primary)]")}
            style={{ height: `${Math.max(4, Math.round((values[i] / max) * 120))}px` }}
            aria-hidden
          />
          <span className="text-center text-[11px] text-muted-foreground">{period.label}</span>
        </li>
      ))}
    </ol>
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
