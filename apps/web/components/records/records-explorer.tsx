"use client";

import { rowClick } from "@/components/ui/row-click";
import { Download } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { formatQuantity } from "@/lib/calculation/trace";
import type { RecordRow } from "@/lib/records/search";
import type { ContextOptions } from "@/lib/trpc/routers/records";
import { RecordDrawer } from "./record-drawer";
import { StageBadge } from "./stage-badge";

// Submission Monitoring and the ESG Data Explorer (UI brief §20: filter bar + table + row-click drawer).
// Every filter lives in the URL, so a Control Tower card lands on exactly the slice it counted.

export const ISSUE_LABELS: Record<string, string> = {
  missing_evidence: "Missing evidence",
  low_confidence: "Low-confidence OCR",
  validation_failed: "Validation failures",
  anomaly: "Anomalous values",
  pending_approval: "Pending approvals",
  missing_submissions: "Missing submissions",
};

const STATUS_LABELS: Record<string, string> = {
  processing: "Processing",
  needs_verification: "Needs verification",
  not_validated: "Not yet passed validation",
  flagged: "Flagged",
  failed: "Validation failed",
  pending_approval: "Pending approval",
  approved: "Approved",
  returned: "Returned",
  rejected: "Rejected",
};

export type ExplorerParams = Record<string, string | undefined>;

export function ContextFilters({
  context,
  params,
  variant,
}: {
  context: ContextOptions;
  params: ExplorerParams;
  variant: "monitoring" | "explorer";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams();
    const merged = { ...params, org: context.orgUnitId, [key]: value };
    // A financial year replaces the single period, and vice versa.
    if (key === "fy" && value) delete merged.period;
    if (key === "period") delete merged.fy;
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    router.push(`${pathname}?${next.toString()}`);
  };
  const years = [...new Set(context.periods.map((p) => p.financialYear))];

  const select = (
    id: string,
    label: string,
    value: string,
    options: [string, string][],
    key: string,
    any = "All",
  ) => (
    <label htmlFor={id} className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <NativeSelect id={id} value={value} onChange={(e) => set(key, e.target.value)}>
        {any ? <option value="">{any}</option> : null}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </NativeSelect>
    </label>
  );

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">
      {select(
        "f-org",
        "Organization",
        context.orgUnitId,
        context.orgUnits.map((o) => [o.id, `${"  ".repeat(o.depth)}${o.name}`]),
        "org",
        "",
      )}
      {variant === "explorer"
        ? select(
            "f-fy",
            "Financial year",
            params.fy ?? "",
            years.map((y) => [String(y), `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`]),
            "fy",
            "One period",
          )
        : null}
      {!params.fy
        ? select(
            "f-period",
            "Period",
            context.periodId,
            context.periods.map((p) => [p.id, p.label]),
            "period",
            "",
          )
        : null}
      {select(
        "f-scope",
        "Scope",
        params.scope ?? "",
        [
          ["SCOPE_1", "Scope 1"],
          ["SCOPE_2", "Scope 2"],
          ["SCOPE_3", "Scope 3"],
        ],
        "scope",
      )}
      {variant === "explorer"
        ? select(
            "f-metric",
            "Metric",
            params.metric ?? "",
            context.metrics.map((m) => [m.code, m.name]),
            "metric",
          )
        : select(
            "f-role",
            "Role",
            params.role ?? "",
            context.roles.map((r) => [r.code, r.name]),
            "role",
          )}
      {select("f-status", "Status", params.status ?? "", Object.entries(STATUS_LABELS), "status")}
      {variant === "monitoring"
        ? select(
            "f-issue",
            "Issue",
            params.issue ?? "",
            Object.entries(ISSUE_LABELS),
            "issue",
            "Any",
          )
        : null}
    </div>
  );
}

function valueOf(row: RecordRow) {
  if (row.resultValue !== null && row.resultUnit)
    return formatQuantity(row.resultValue, row.resultUnit);
  if (row.activityValue !== null) return formatQuantity(row.activityValue, row.activityUnit ?? "");
  return "—";
}

const csvCell = (v: string | number | null) => {
  const text = v === null ? "" : String(v);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The filtered rows as CSV, built in the browser from what is already on screen. */
function exportCsv(rows: RecordRow[], name: string) {
  const header = [
    "Document",
    "Metric",
    "Category",
    "Org unit",
    "Period",
    "Submitted by",
    "Submitted at",
    "Verification",
    "Validation",
    "Approval",
    "Activity value",
    "Activity unit",
    "Result",
    "Result unit",
  ];
  const lines = rows.map((r) =>
    [
      r.fileName,
      r.metricName,
      r.categoryName,
      r.orgUnitName,
      r.periodLabel,
      r.submittedBy,
      r.submittedAt,
      r.verificationStatus,
      r.validationStatus,
      r.approvalStatus,
      r.activityValue,
      r.activityUnit,
      r.resultValue,
      r.resultUnit,
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${name}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function RecordsTable({
  rows,
  truncated,
  variant,
  emptyMessage,
}: {
  rows: RecordRow[];
  truncated: boolean;
  variant: "monitoring" | "explorer";
  emptyMessage: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const pathname = usePathname();
  const headings =
    variant === "monitoring"
      ? ["Document", "ESG activity", "Org unit", "Period", "Submitted by", "Status"]
      : ["Document", "Metric", "Org unit", "Period", "Value", "Status"];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length} record(s){truncated ? " — showing the newest 500; narrow the filters" : ""}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={rows.length === 0}
          onClick={() => exportCsv(rows, variant === "monitoring" ? "submissions" : "esg-records")}
        >
          <Download aria-hidden />
          Export CSV
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border bg-card px-4 py-6 text-sm text-muted-foreground">
          {emptyMessage}{" "}
          <Link
            href={pathname}
            className="font-medium text-primary-text underline underline-offset-2"
          >
            Clear filters
          </Link>
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-table-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-table-header text-table-header-foreground">
              <tr>
                {headings.map((h) => (
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
              {rows.map((r) => (
                <tr
                  key={r.recordId}
                  onClick={rowClick(() => setSelected(r.recordId))}
                  className="cursor-pointer border-t border-table-border bg-table-row even:bg-table-row-alt hover:bg-table-row-hover"
                >
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      className="text-left font-medium underline-offset-2 hover:underline"
                      onClick={() => setSelected(r.recordId)}
                    >
                      {r.fileName ?? "Record without a document"}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    {r.metricName}
                    <span className="block text-xs text-muted-foreground">{r.categoryName}</span>
                  </td>
                  <td className="px-3 py-2.5">{r.orgUnitName}</td>
                  <td className="px-3 py-2.5">{r.periodLabel}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    {variant === "monitoring" ? (
                      <span className="font-sans text-sm">{r.submittedBy}</span>
                    ) : (
                      valueOf(r)
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <StageBadge
                      row={{
                        verification: r.verificationStatus,
                        validation: r.validationStatus,
                        approval: r.approvalStatus,
                        quality: r.dataQualityState,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <RecordDrawer recordId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
