"use client";

import { rowClick } from "@/components/ui/row-click";
import {
  ChevronDown,
  Download,
  ExternalLink,
  Eye,
  FileStack,
  FileText,
  FolderTree,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OrgTreeSelect } from "@/components/org/org-tree-select";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { csvSafeText } from "@/lib/csv";
import { formatQuantity } from "@/lib/calculation/trace";
import { pagesLabel } from "@/lib/documents/bundle";
import { groupSubmissions, type SubmissionGroup } from "@/lib/ocr/rules";
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

/** What OCR made of the document (Phase 3: OCR Monitoring folded in), with its colour. */
export const OCR_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  reading: { label: "Reading", tone: "neutral" },
  read: { label: "Read", tone: "success" },
  attention: { label: "Needs attention", tone: "warning" },
  failed: { label: "Failed", tone: "error" },
  manual: { label: "Manual entry", tone: "warning" },
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
  // Anything that differs from what the page shows with no filters (owner's page feedback, 2026-11-11: one
  // Reset filters button back to the caller's own unit and the current open period).
  const narrowed =
    ["fy", "scope", "metric", "doctype", "role", "status", "issue", "q", "ocr", "from", "to"].some(
      (k) => params[k],
    ) ||
    context.orgUnitId !== context.defaultOrgUnitId ||
    context.periodId !== context.defaultPeriodId;
  const scopeOf = new Map(context.metrics.map((m) => [m.code, m.scopeCode]));
  const set = (key: string, value: string) => {
    const next = new URLSearchParams();
    const merged = { ...params, org: context.orgUnitId, [key]: value };
    // A financial year replaces the single period, and vice versa.
    if (key === "fy" && value) delete merged.period;
    if (key === "period") delete merged.fy;
    // An activity belongs to one scope: choosing it sets the scope, and a scope drops an activity outside it.
    if (key === "metric" && value && scopeOf.get(value)) merged.scope = scopeOf.get(value)!;
    if (key === "scope" && value && merged.metric && scopeOf.get(merged.metric) !== value)
      delete merged.metric;
    // A From after To would match nothing; move the other end along with it.
    if (key === "from" && value && merged.to && merged.to < value) merged.to = value;
    if (key === "to" && value && merged.from && merged.from > value) merged.from = value;
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    router.push(`${pathname}?${next.toString()}`);
  };
  const reset = () => {
    setText("");
    applied.current = "";
    router.push(pathname);
  };
  // The Activity list follows the Scope (owner's page feedback, 2026-11-11): only that scope's activities, or
  // every activity grouped by scope when none is chosen.
  const activityGroups = (
    params.scope
      ? [[params.scope, context.metrics.filter((m) => m.scopeCode === params.scope)] as const]
      : (
          [
            ["SCOPE_1", "Scope 1"],
            ["SCOPE_2", "Scope 2"],
            ["SCOPE_3", "Scope 3"],
            [null, "Other activities"],
          ] as const
        ).map(
          ([code, label]) => [label, context.metrics.filter((m) => m.scopeCode === code)] as const,
        )
  ).filter(([, list]) => list.length);
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
  // Submission Monitoring: pick the financial year, then a period inside it that has already begun (a period in
  // the future has nothing to show). The year is only a picker narrowing the list, kept in the address as year.
  const today = new Date().toISOString().slice(0, 10);
  const currentPeriod = context.periods.find((p) => p.id === context.periodId);
  const pickedYear = Number(params.year) || currentPeriod?.financialYear || years[0];
  const periodChoices = context.periods.filter(
    (p) => p.financialYear === pickedYear && (p.startDate <= today || p.id === context.periodId),
  );
  const chooseYear = (value: string) => {
    const inYear = context.periods.filter(
      (p) => p.financialYear === Number(value) && p.startDate <= today,
    );
    const target = inYear[0] ?? context.periods.find((p) => p.financialYear === Number(value));
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      ...params,
      org: context.orgUnitId,
      year: value,
      period: target?.id,
    };
    delete merged.fy;
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    router.push(`${pathname}?${next.toString()}`);
  };

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
    <div>
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
                placeholder="Document, description, metric, org unit, period, person, value or unit…"
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
        {variant === "monitoring" ? (
          <label
            htmlFor="f-year"
            className="flex flex-[0_0_9rem] flex-col gap-1 text-xs text-muted-foreground"
          >
            Financial year
            <NativeSelect
              id="f-year"
              value={String(pickedYear)}
              onChange={(e) => chooseYear(e.target.value)}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {`FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`}
                </option>
              ))}
            </NativeSelect>
          </label>
        ) : null}
        {!params.fy
          ? select(
              "f-period",
              "Period",
              context.periodId,
              (variant === "monitoring" ? periodChoices : context.periods).map((p) => [
                p.id,
                p.label,
              ]),
              "period",
              "",
              // Wide enough for a label like "September 2026" with the arrow (owner's feedback, 2026-11-11).
              "flex-[0_0_12rem]",
            )
          : null}
        {/* Upload date (owner's page feedback, 2026-11-11): the same day in both for one day's uploads. */}
        <label
          htmlFor="f-from"
          className="flex flex-[0_0_9.5rem] flex-col gap-1 text-xs text-muted-foreground"
        >
          Uploaded from
          <Input
            id="f-from"
            type="date"
            value={params.from ?? ""}
            max={params.to || undefined}
            onChange={(e) => set("from", e.target.value)}
            className="text-sm text-foreground"
          />
        </label>
        <label
          htmlFor="f-to"
          className="flex flex-[0_0_9.5rem] flex-col gap-1 text-xs text-muted-foreground"
        >
          Uploaded to
          <Input
            id="f-to"
            type="date"
            value={params.to ?? ""}
            min={params.from || undefined}
            onChange={(e) => set("to", e.target.value)}
            className="text-sm text-foreground"
          />
        </label>
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
        {/* The Document type filter was removed (owner's page feedback, 2026-11-11): every activity has
            exactly one document type, so it repeated this one. A `doctype` in the URL still filters. */}
        <label
          htmlFor="f-metric"
          className="flex flex-[1_1_12rem] flex-col gap-1 text-xs text-muted-foreground"
        >
          {variant === "explorer" ? "Metric" : "Activity"}
          <NativeSelect
            id="f-metric"
            value={params.metric ?? ""}
            onChange={(e) => set("metric", e.target.value)}
          >
            <option value="">All</option>
            {params.scope
              ? activityGroups.flatMap(([, list]) =>
                  list.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.name}
                    </option>
                  )),
                )
              : activityGroups.map(([label, list]) => (
                  <optgroup key={label} label={label}>
                    {list.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
          </NativeSelect>
        </label>
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
              "f-ocr",
              "OCR",
              params.ocr ?? "",
              Object.entries(OCR_LABELS).map(([k, v]) => [k, v.label]),
              "ocr",
            )
          : null}
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
        {narrowed ? (
          <Button type="button" variant="outline" onClick={reset} className="h-10">
            <RotateCcw aria-hidden />
            Reset filters
          </Button>
        ) : null}
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
    "Description",
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
    "Submitter role",
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
      r.description,
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
      [r.submitterRoles, r.onBehalfOf ? `for ${r.onBehalfOf}` : null].filter(Boolean).join(" · "),
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

function activitySummary(records: RecordRow[]): string {
  const unique = Array.from(new Set(records.map((r) => r.metricName)));
  if (unique.length === 1) return unique[0];
  if (unique.length <= 2) return unique.join(", ");
  return `${unique[0]}, ${unique[1]} +${unique.length - 2} more`;
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
      ? ["Document", "ESG activity", "Org unit", "Period", "Submitted by", "OCR", "Status"]
      : ["Document", "Metric", "Org unit", "Period", "Value", "Status"];

  const groups = groupSubmissions(rows);
  const bundleGroups = groups.filter(
    (g): g is Extract<SubmissionGroup<RecordRow>, { type: "bundle" }> => g.type === "bundle",
  );

  // Dropped down by default
  const [expandedBundles, setExpandedBundles] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const b of bundleGroups) {
      initial[b.bundleDocumentId] = true;
    }
    return initial;
  });

  const isExpanded = (bundleId: string) => expandedBundles[bundleId] !== false;

  const toggleBundle = (bundleId: string) => {
    setExpandedBundles((prev) => ({
      ...prev,
      [bundleId]: prev[bundleId] === false ? true : false,
    }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const b of bundleGroups) {
      next[b.bundleDocumentId] = true;
    }
    setExpandedBundles(next);
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const b of bundleGroups) {
      next[b.bundleDocumentId] = false;
    }
    setExpandedBundles(next);
  };

  const allExpanded = bundleGroups.every((b) => isExpanded(b.bundleDocumentId));
  const noneExpanded =
    bundleGroups.length > 0 && bundleGroups.every((b) => !isExpanded(b.bundleDocumentId));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {rows.length} record(s){truncated ? " — showing the newest 500; narrow the filters" : ""}
        </p>
        <div className="flex items-center gap-2">
          {variant === "monitoring" && bundleGroups.length > 0 ? (
            <div className="mr-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <FolderTree className="size-3.5 text-primary" aria-hidden />
              <span>
                {bundleGroups.length} multi-bill {bundleGroups.length === 1 ? "PDF" : "PDFs"}
              </span>
              <span className="select-none text-muted-foreground/40">·</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={expandAll}
                disabled={allExpanded}
                className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Expand all
              </Button>
              <span className="select-none text-muted-foreground/40">·</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={collapseAll}
                disabled={noneExpanded}
                className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Collapse all
              </Button>
            </div>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={rows.length === 0}
            onClick={() =>
              exportCsv(rows, variant === "monitoring" ? "submissions" : "esg-records")
            }
          >
            <Download aria-hidden />
            Export CSV
          </Button>
        </div>
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
              {variant === "monitoring"
                ? groups.map((group) => {
                    if (group.type === "single") {
                      const r = group.record;
                      return (
                        <tr
                          key={r.recordId}
                          onClick={rowClick(() => setSelected(r.recordId))}
                          className="cursor-pointer border-t border-table-border bg-table-row even:bg-table-row-alt hover:bg-table-row-hover"
                        >
                          <td className="px-3 py-2.5">
                            <div className="flex items-start gap-2">
                              <FileText
                                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                                aria-hidden
                              />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    className="text-left font-medium underline-offset-2 hover:underline"
                                    onClick={() => setSelected(r.recordId)}
                                  >
                                    {r.fileName ?? "Record without a document"}
                                  </button>
                                  {r.documentId ? (
                                    <a
                                      href={`/api/documents/${r.documentId}/file`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-0.5 text-[11px] font-normal text-muted-foreground hover:text-foreground"
                                      title="Open single bill PDF in new tab"
                                    >
                                      <span className="underline">Single PDF</span>
                                      <ExternalLink className="size-2.5" aria-hidden />
                                    </a>
                                  ) : null}
                                </div>
                                {r.description ? (
                                  <span
                                    className="block max-w-80 truncate text-xs text-foreground"
                                    title={r.description}
                                  >
                                    {r.description}
                                  </span>
                                ) : null}
                                {r.billNumber || r.documentTypeName ? (
                                  <span className="block text-xs text-muted-foreground">
                                    {r.billNumber ? `Bill no. ${r.billNumber}` : null}
                                    {r.billNumber && r.documentTypeName ? " · " : null}
                                    {r.documentTypeName
                                      ? `${r.documentTypeName}${r.documentTypeSource ? ` (${DOCUMENT_TYPE_SOURCE[r.documentTypeSource]})` : ""}`
                                      : null}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            {r.metricName}
                            <span className="block text-xs text-muted-foreground">
                              {r.categoryName}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">{r.orgUnitName}</td>
                          <td className="px-3 py-2.5">{r.periodLabel}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">
                            <span className="font-sans text-sm">
                              {r.submittedBy}
                              {r.submitterRoles || r.onBehalfOf ? (
                                <span className="block text-xs text-muted-foreground">
                                  {[r.submitterRoles, r.onBehalfOf ? `for ${r.onBehalfOf}` : null]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            {OCR_LABELS[r.ocrState] ? (
                              <StatusBadge tone={OCR_LABELS[r.ocrState].tone}>
                                {OCR_LABELS[r.ocrState].label}
                              </StatusBadge>
                            ) : (
                              <span className="text-xs text-muted-foreground">No document</span>
                            )}
                            {r.ocrState === "failed" && r.ocrError ? (
                              <span className="mt-1 block max-w-48 text-xs leading-4 text-muted-foreground">
                                {r.ocrError}
                              </span>
                            ) : null}
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
                      );
                    }

                    // Bundle Parent + Children
                    const expanded = isExpanded(group.bundleDocumentId);

                    return (
                      <tbody key={`bundle-group-${group.bundleDocumentId}`} className="contents">
                        {/* Parent Row: Main Combined PDF */}
                        <tr
                          onClick={() => toggleBundle(group.bundleDocumentId)}
                          className="cursor-pointer border-t-2 border-table-border bg-surface-subtle/80 hover:bg-table-row-hover font-medium transition-colors select-none"
                        >
                          <td className="px-3 py-3">
                            <div className="flex items-start gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleBundle(group.bundleDocumentId);
                                }}
                                className="mt-0.5 rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-expanded={expanded}
                                aria-label={
                                  expanded
                                    ? `Collapse bills for ${group.bundleFileName}`
                                    : `Expand bills for ${group.bundleFileName}`
                                }
                              >
                                <ChevronDown
                                  className={cn(
                                    "size-4 transition-transform duration-200",
                                    !expanded && "-rotate-90 text-muted-foreground/70",
                                  )}
                                  aria-hidden
                                />
                              </button>
                              <FileStack
                                className="mt-0.5 size-4.5 shrink-0 text-primary"
                                aria-hidden
                              />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <a
                                    href={`/api/documents/${group.bundleDocumentId}/file`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="font-semibold text-primary underline-offset-4 hover:underline inline-flex items-center gap-1"
                                    title="Open combined main PDF with all recorded bills"
                                  >
                                    <span>{group.bundleFileName}</span>
                                    <ExternalLink
                                      className="size-3 text-muted-foreground"
                                      aria-hidden
                                    />
                                  </a>
                                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary whitespace-nowrap">
                                    Combined PDF · {group.records.length}{" "}
                                    {group.records.length === 1 ? "bill" : "bills"}
                                    {group.bundleTotalParts &&
                                    group.bundleTotalParts > group.records.length
                                      ? ` (${group.bundleTotalParts} total recorded)`
                                      : ""}
                                  </span>
                                </div>
                                {group.bundleDescription ? (
                                  <span
                                    className="mt-0.5 block max-w-sm truncate text-xs font-normal text-muted-foreground"
                                    title={group.bundleDescription}
                                  >
                                    {group.bundleDescription}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-muted-foreground font-normal">
                            {activitySummary(group.records)}
                          </td>
                          <td className="px-3 py-3 font-normal">{group.orgUnitName}</td>
                          <td className="px-3 py-3 font-normal">{group.periodLabel}</td>
                          <td className="px-3 py-3 font-sans text-sm font-normal">
                            {group.records[0]?.submittedBy}
                            {group.records[0]?.submitterRoles || group.records[0]?.onBehalfOf ? (
                              <span className="block text-xs text-muted-foreground">
                                {[
                                  group.records[0]?.submitterRoles,
                                  group.records[0]?.onBehalfOf
                                    ? `for ${group.records[0]?.onBehalfOf}`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-3">
                            <StatusBadge tone="neutral">Combined Document</StatusBadge>
                          </td>
                          <td className="px-3 py-3">
                            <div
                              className="flex flex-wrap items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="h-7 px-2.5 text-xs font-normal gap-1"
                              >
                                <a
                                  href={`/api/documents/${group.bundleDocumentId}/file`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="View main combined PDF with all recorded bills"
                                >
                                  <Eye className="size-3.5" aria-hidden /> View Main PDF
                                </a>
                              </Button>
                              <Link
                                href={`/app/upload/split/${group.bundleDocumentId}`}
                                className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline whitespace-nowrap"
                                title="View recorded bills split breakdown"
                              >
                                All recorded bills
                              </Link>
                            </div>
                          </td>
                        </tr>

                        {/* Child Rows: Individual Recorded Bills */}
                        {expanded &&
                          group.records.map((r, idx) => {
                            const isLast = idx === group.records.length - 1;
                            const pageLabelText =
                              r.pageFrom && r.pageTo ? pagesLabel(r.pageFrom, r.pageTo) : null;

                            return (
                              <tr
                                key={r.recordId}
                                onClick={rowClick(() => setSelected(r.recordId))}
                                className="cursor-pointer border-t border-table-border/60 bg-table-row/60 hover:bg-table-row-hover/90"
                              >
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-2 pl-6 sm:pl-7">
                                    <span
                                      className="font-mono text-xs text-muted-foreground/60 select-none shrink-0"
                                      aria-hidden
                                    >
                                      {isLast ? "└──" : "├──"}
                                    </span>
                                    <FileText
                                      className="size-3.5 shrink-0 text-muted-foreground"
                                      aria-hidden
                                    />
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <button
                                          type="button"
                                          className="text-left font-medium text-primary-text underline-offset-2 hover:underline"
                                          onClick={() => setSelected(r.recordId)}
                                        >
                                          {r.fileName ?? "Record without a document"}
                                        </button>
                                        {pageLabelText ? (
                                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground whitespace-nowrap">
                                            {pageLabelText}
                                          </span>
                                        ) : null}
                                        {r.documentId ? (
                                          <a
                                            href={`/api/documents/${r.documentId}/file`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="inline-flex items-center gap-0.5 text-[11px] font-normal text-muted-foreground hover:text-foreground ml-1"
                                            title="View cut single PDF"
                                          >
                                            <span className="underline">Single PDF</span>
                                            <ExternalLink className="size-2.5" aria-hidden />
                                          </a>
                                        ) : null}
                                      </div>
                                      {r.description &&
                                      r.description !== group.bundleDescription ? (
                                        <span
                                          className="mt-0.5 block max-w-80 truncate text-xs font-normal text-muted-foreground"
                                          title={r.description}
                                        >
                                          {r.description}
                                        </span>
                                      ) : null}
                                      {r.billNumber || r.documentTypeName ? (
                                        <span className="block text-xs text-muted-foreground">
                                          {r.billNumber ? `Bill no. ${r.billNumber}` : null}
                                          {r.billNumber && r.documentTypeName ? " · " : null}
                                          {r.documentTypeName
                                            ? `${r.documentTypeName}${r.documentTypeSource ? ` (${DOCUMENT_TYPE_SOURCE[r.documentTypeSource]})` : ""}`
                                            : null}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5">
                                  {r.metricName}
                                  <span className="block text-xs text-muted-foreground">
                                    {r.categoryName}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5">{r.orgUnitName}</td>
                                <td className="px-3 py-2.5">{r.periodLabel}</td>
                                <td className="px-3 py-2.5 font-mono text-xs">
                                  <span className="font-sans text-sm">
                                    {r.submittedBy}
                                    {r.submitterRoles || r.onBehalfOf ? (
                                      <span className="block text-xs text-muted-foreground">
                                        {[
                                          r.submitterRoles,
                                          r.onBehalfOf ? `for ${r.onBehalfOf}` : null,
                                        ]
                                          .filter(Boolean)
                                          .join(" · ")}
                                      </span>
                                    ) : null}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5">
                                  {OCR_LABELS[r.ocrState] ? (
                                    <StatusBadge tone={OCR_LABELS[r.ocrState].tone}>
                                      {OCR_LABELS[r.ocrState].label}
                                    </StatusBadge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      No document
                                    </span>
                                  )}
                                  {r.ocrState === "failed" && r.ocrError ? (
                                    <span className="mt-1 block max-w-48 text-xs leading-4 text-muted-foreground">
                                      {r.ocrError}
                                    </span>
                                  ) : null}
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
                            );
                          })}
                      </tbody>
                    );
                  })
                : rows.map((r) => (
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
                        {r.description ? (
                          <span
                            className="block max-w-80 truncate text-xs text-foreground"
                            title={r.description}
                          >
                            {r.description}
                          </span>
                        ) : null}
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
                        <span className="block text-xs text-muted-foreground">
                          {r.categoryName}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{r.orgUnitName}</td>
                      <td className="px-3 py-2.5">{r.periodLabel}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{valueOf(r)}</td>
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
