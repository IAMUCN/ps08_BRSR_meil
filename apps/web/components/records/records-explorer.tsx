"use client";

import { rowClick } from "@/components/ui/row-click";
import { Download, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OrgTreeSelect } from "@/components/org/org-tree-select";
import { NativeSelect } from "@/components/ui/native-select";
import { csvSafeText } from "@/lib/csv";
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
  search = false,
}: {
  context: ContextOptions;
  params: ExplorerParams;
  variant: "monitoring" | "explorer";
  /** Show the search box (the table beside it must pass `q` on to the query). */
  search?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // The search box (owner's page feedback, 2026-10-11): searched on the server, since the table shows at
  // most the newest 500 records. It applies shortly after typing stops, or at once on Enter.
  const [text, setText] = useState(params.q ?? "");
  const applied = useRef(params.q ?? "");
  const latest = useRef<(value: string) => void>(() => {});
  // Whatever narrows the list beyond the organization and the period, which always have a value.
  const narrowed = ["fy", "scope", "metric", "doctype", "role", "status", "issue", "q"].some(
    (k) => params[k],
  );
  const set = (key: string, value: string) => {
    const next = new URLSearchParams();
    const merged = { ...params, org: context.orgUnitId, [key]: value };
    // A financial year replaces the single period, and vice versa.
    if (key === "fy" && value) delete merged.period;
    if (key === "period") delete merged.fy;
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    router.push(`${pathname}?${next.toString()}`);
  };
  const applyText = (value: string) => {
    const wanted = value.trim();
    if (wanted === applied.current) return;
    applied.current = wanted;
    set("q", wanted);
  };
  useEffect(() => {
    latest.current = applyText;
  });
  useEffect(() => {
    const timer = setTimeout(() => latest.current(text), 450);
    return () => clearTimeout(timer);
  }, [text]);
  const years = [...new Set(context.periods.map((p) => p.financialYear))];

  const select = (
    id: string,
    label: string,
    value: string,
    options: [string, string][],
    key: string,
    any = "All",
    // Flex share: the organization names are long, Period and Scope are short.
    width = "flex-[1_1_10rem]",
  ) => (
    <label htmlFor={id} className={`flex flex-col gap-1 text-xs text-muted-foreground ${width}`}>
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
    <div className="relative">
      {/* Laid over the gap above the bar, so showing it never moves the dropdowns. */}
      {narrowed ? (
        <Link
          href={pathname}
          onClick={() => {
            setText("");
            applied.current = "";
          }}
          className="absolute -top-[1.125rem] right-0 text-xs leading-4 font-medium text-primary-text underline underline-offset-2"
        >
          Clear filters
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">
        {search ? (
          <form
            role="search"
            className="flex min-w-56 flex-1 basis-full flex-col gap-1 text-xs text-muted-foreground"
            onSubmit={(event) => {
              event.preventDefault();
              applyText(text);
            }}
          >
            <label htmlFor="f-search">Search</label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="f-search"
                type="search"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={100}
                placeholder="Document, metric, org unit, period, person, value or unit…"
                className="px-8 text-sm text-foreground [&::-webkit-search-cancel-button]:hidden"
              />
              {text ? (
                <button
                  type="button"
                  onClick={() => {
                    setText("");
                    applyText("");
                  }}
                  className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <X className="size-4" aria-hidden />
                  <span className="sr-only">Clear the search</span>
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
        <label
          htmlFor="f-org"
          className="flex flex-[4_1_20rem] flex-col gap-1 text-xs text-muted-foreground"
        >
          Organization
          <OrgTreeSelect
            id="f-org"
            value={context.orgUnitId}
            onChange={(id) => set("org", id)}
            nodes={context.orgUnits.map((o) => ({
              id: o.id,
              name: o.name,
              parentIds: o.parentIds,
              inactive: o.status === "inactive",
            }))}
          />
        </label>
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
              "flex-[0_1_9rem]",
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
          "All",
          "flex-[0_1_7.5rem]",
        )}
        {/* Both categories on both screens (Phase 2): the activity chosen at upload, and the document
            type OCR detected or a person chose. */}
        {select(
          "f-metric",
          variant === "explorer" ? "Metric" : "Activity",
          params.metric ?? "",
          context.metrics.map((m) => [m.code, m.name]),
          "metric",
        )}
        {select(
          "f-doctype",
          "Document type",
          params.doctype ?? "",
          context.documentTypes.map((t) => [t.code, t.name]),
          "doctype",
        )}
        {variant === "monitoring"
          ? select(
              "f-role",
              "Role",
              params.role ?? "",
              context.roles.map((r) => [r.code, r.name]),
              "role",
            )
          : null}
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
    </div>
  );
}

/** Who chose a record's document type, in words. */
export const DOCUMENT_TYPE_SOURCE: Record<"ocr" | "person" | "admin", string> = {
  ocr: "OCR",
  person: "Uploader",
  admin: "Admin",
};

function valueOf(row: RecordRow) {
  if (row.resultValue !== null && row.resultUnit)
    return formatQuantity(row.resultValue, row.resultUnit);
  if (row.activityValue !== null) return formatQuantity(row.activityValue, row.activityUnit ?? "");
  return "—";
}

const csvCell = (v: string | number | null) => {
  const text = v === null ? "" : typeof v === "string" ? csvSafeText(v) : String(v);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The filtered rows as CSV, built in the browser from what is already on screen. */
function exportCsv(rows: RecordRow[], name: string) {
  const header = [
    "Document",
    "Bill no.",
    "Document type",
    "Document type chosen by",
    "Late",
    "Possible duplicate",
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
      r.billNumber,
      r.documentTypeName,
      r.documentTypeSource ? DOCUMENT_TYPE_SOURCE[r.documentTypeSource] : null,
      r.late ? "Yes" : "No",
      r.duplicate ? "Yes" : "No",
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
          {emptyMessage}
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
                    {r.billNumber || r.documentTypeName ? (
                      <span className="block text-xs text-muted-foreground">
                        {r.billNumber ? `Bill no. ${r.billNumber}` : null}
                        {r.billNumber && r.documentTypeName ? " · " : null}
                        {r.documentTypeName
                          ? `${r.documentTypeName}${r.documentTypeSource ? ` (${DOCUMENT_TYPE_SOURCE[r.documentTypeSource]})` : ""}`
                          : null}
                      </span>
                    ) : null}
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
                    {r.late ? (
                      <span className="mt-1 block text-[11px] leading-4 tracking-wide text-status-warning uppercase">
                        Late
                      </span>
                    ) : null}
                    {r.duplicate ? (
                      <span className="mt-1 block text-[11px] leading-4 tracking-wide text-status-warning uppercase">
                        Possible duplicate
                      </span>
                    ) : null}
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
