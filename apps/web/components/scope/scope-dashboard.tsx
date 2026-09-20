"use client";

import { BarChart3, ChevronRight, Table2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "cn";
import { CalculationTraceView } from "@/components/calculation/calculation-trace";
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
import type { CalculationState } from "@/lib/calculation/trace";
import { formatCompact, formatTotal } from "@/lib/scope/display";
import type { ScopeBranch, ScopeRecord, UnitTotal } from "@/lib/scope/totals";
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

const approvedOf = (totals: UnitTotal[]) => totals.reduce((sum, t) => sum + t.approved, 0);

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
  const [mode, setMode] = useState<"table" | "chart">("table");
  const [selected, setSelected] = useState<ScopeRecord | null>(null);
  const [trace, setTrace] = useState<CalculationState | null>(null);

  const go = (params: { org?: string; period?: string }) => {
    const search = new URLSearchParams();
    search.set("org", params.org ?? view.node.id);
    search.set("period", params.period ?? view.periodId);
    router.push(`${basePath}?${search.toString()}`);
  };

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMode(mode === "table" ? "chart" : "table")}
          >
            {mode === "table" ? <BarChart3 aria-hidden /> : <Table2 aria-hidden />}
            {mode === "table" ? "Chart" : "Table"}
          </Button>
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

      {view.children.length > 0 ? (
        <section aria-labelledby="scope-children" className="space-y-2">
          <h2 id="scope-children" className="text-sm leading-5 font-semibold">
            By organization unit
          </h2>
          {mode === "chart" ? (
            <BranchBars branches={view.children} />
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
          <TrendBars trend={view.trend} />
        </section>
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

/** Inline SVG bars using the brief's chart tokens — no charting dependency. */
function BranchBars({ branches }: { branches: ScopeBranch[] }) {
  const max = Math.max(...branches.map((b) => approvedOf(b.totals)), 1);
  return (
    <ul className="space-y-2 rounded-md border bg-card p-4">
      {branches.map((branch) => {
        const value = approvedOf(branch.totals);
        const unit = branch.totals[0]?.unit ?? "";
        return (
          <li
            key={branch.id}
            className="grid grid-cols-[10rem_1fr_auto] items-center gap-3 text-sm"
          >
            <span className="truncate">{branch.name}</span>
            <span className="h-3 rounded-sm bg-[var(--chart-neutral-reference)]">
              <span
                className="block h-3 rounded-sm bg-[var(--chart-primary)]"
                style={{ width: `${Math.round((value / max) * 100)}%` }}
                aria-hidden
              />
            </span>
            <span className="font-mono text-xs">{value ? formatCompact(value, unit) : "—"}</span>
          </li>
        );
      })}
    </ul>
  );
}

function TrendBars({ trend }: { trend: ScopeView["trend"] }) {
  const values = trend.map((t) => approvedOf(t.totals));
  const max = Math.max(...values, 1);
  return (
    <ol className="flex items-end gap-3 overflow-x-auto rounded-md border bg-card p-4">
      {trend.map((period, i) => (
        <li key={period.periodId} className="flex w-20 shrink-0 flex-col items-center gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">
            {values[i] ? formatCompact(values[i], period.totals[0]?.unit ?? "") : "—"}
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
              className="border-t border-table-border bg-table-row even:bg-table-row-alt hover:bg-table-row-hover"
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
