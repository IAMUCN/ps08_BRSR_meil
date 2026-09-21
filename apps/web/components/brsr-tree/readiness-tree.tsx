"use client";

import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CalculationTraceView } from "@/components/calculation/calculation-trace";
import { DocumentViewer } from "@/components/document-viewer/document-viewer";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { STATUS_LABEL, type IndicatorStatus } from "@/lib/brsr/readiness";
import { formatQuantity, type CalculationState } from "@/lib/calculation/trace";
import type { ReadinessRecord, ReadinessView } from "@/lib/trpc/routers/brsr";

// BRSR readiness (UI brief §21): an expandable tree, not a chart — Section → Indicator (status) → ESG metric
// → the period's records with their calculation → the original document. The same component will carry
// the report drill-down (Phase 17).

const TONE: Record<IndicatorStatus, StatusTone> = {
  complete: "success",
  partial: "warning",
  missing: "error",
  not_mapped: "neutral",
};

export function ReadinessTree({
  view,
  loadRecord,
}: {
  view: ReadinessView;
  loadRecord: (recordId: string) => Promise<CalculationState>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(() => new Set(view.sections.map((s) => s.code)));
  const [selected, setSelected] = useState<{ record: ReadinessRecord; metric: string } | null>(
    null,
  );
  const [trace, setTrace] = useState<CalculationState | null>(null);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function openRecord(record: ReadinessRecord, metric: string) {
    setSelected({ record, metric });
    setTrace(null);
    setTrace(await loadRecord(record.recordId));
  }

  const indicators = view.sections.flatMap((s) => s.indicators);
  const counts = (Object.keys(STATUS_LABEL) as IndicatorStatus[])
    .map((status) => ({ status, n: indicators.filter((i) => i.status === status).length }))
    .filter((c) => c.n > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {indicators.length} indicators for {view.periodLabel}, organisation-wide:{" "}
          {counts.map((c) => `${c.n} ${STATUS_LABEL[c.status].toLowerCase()}`).join(" · ")}.
          Complete means every mapped metric has an approved record.
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor="brsr-period" className="text-sm text-muted-foreground">
            Period
          </label>
          <NativeSelect
            id="brsr-period"
            value={view.periodId}
            onChange={(e) =>
              router.push(`/admin/brsr-mapping?tab=readiness&period=${e.target.value}`)
            }
          >
            {view.periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <ul aria-label="BRSR readiness" className="rounded-md border">
        {view.sections.map((section) => (
          <li key={section.code} className="border-b last:border-b-0">
            <Toggle open={open.has(section.code)} onClick={() => toggle(section.code)} depth={0}>
              <span className="font-semibold text-brsr-heading">
                Section {section.code} — {section.name}
              </span>
            </Toggle>
            {open.has(section.code) ? (
              <ul>
                {section.indicators.map((indicator) => (
                  <li key={indicator.id} className="border-t">
                    <Toggle
                      open={open.has(indicator.id)}
                      onClick={() => toggle(indicator.id)}
                      depth={1}
                      trailing={
                        <StatusBadge tone={TONE[indicator.status]}>
                          {STATUS_LABEL[indicator.status]}
                        </StatusBadge>
                      }
                    >
                      <span className="shrink-0 rounded-sm border border-brsr-badge bg-brsr-badge/15 px-1.5 font-mono text-xs whitespace-nowrap">
                        {indicator.code}
                      </span>
                      <span className="min-w-0 text-left text-sm">{indicator.questionText}</span>
                    </Toggle>
                    {open.has(indicator.id) ? (
                      <ul>
                        {indicator.metrics.length === 0 ? (
                          <li className="py-2 pr-3 pl-16 text-sm text-muted-foreground">
                            No metric feeds this indicator.
                          </li>
                        ) : null}
                        {indicator.metrics.map((metric) => {
                          const key = `${indicator.id}:${metric.metricId}`;
                          return (
                            <li key={key} className="border-t border-dashed">
                              <Toggle
                                open={open.has(key)}
                                onClick={() => toggle(key)}
                                depth={2}
                                trailing={
                                  <span className="text-xs whitespace-nowrap text-muted-foreground">
                                    {metric.applicable
                                      ? `${metric.approved} approved · ${metric.pending} awaiting approval`
                                      : "Not applicable"}
                                  </span>
                                }
                              >
                                <span className="text-sm font-medium">{metric.metricName}</span>
                                {metric.notes ? (
                                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                                    {metric.notes}
                                  </span>
                                ) : null}
                              </Toggle>
                              {open.has(key) ? (
                                <ul className="pb-2">
                                  {metric.records.length === 0 ? (
                                    <li className="py-1.5 pr-3 pl-24 text-sm text-muted-foreground">
                                      No approved or pending records in {view.periodLabel}.
                                    </li>
                                  ) : null}
                                  {metric.records.map((record) => (
                                    <li
                                      key={record.recordId}
                                      className="flex items-center gap-3 py-1.5 pr-3 pl-24 text-sm"
                                    >
                                      <button
                                        type="button"
                                        className="flex min-w-0 items-center gap-1.5 text-left underline-offset-2 hover:underline"
                                        onClick={() => openRecord(record, metric.metricName)}
                                      >
                                        <FileText
                                          className="size-4 shrink-0 text-muted-foreground"
                                          strokeWidth={1.5}
                                          aria-hidden
                                        />
                                        <span className="truncate">
                                          {record.fileName ?? "Record without a document"}
                                        </span>
                                      </button>
                                      <span className="text-xs text-muted-foreground">
                                        {record.orgUnitName}
                                      </span>
                                      <span className="ml-auto font-mono text-xs">
                                        {valueOf(record)}
                                      </span>
                                      <StatusBadge
                                        tone={
                                          record.approvalStatus === "approved"
                                            ? "success"
                                            : "warning"
                                        }
                                      >
                                        {record.approvalStatus === "approved"
                                          ? "Approved"
                                          : "Pending approval"}
                                      </StatusBadge>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-[720px] max-w-full">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.record.fileName ?? selected.metric}</SheetTitle>
                <SheetDescription>
                  {selected.metric} · {selected.record.orgUnitName} · {view.periodLabel}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 overflow-y-auto px-4 pb-6">
                {trace ? (
                  trace.trace || selected.record.resultValue !== null ? (
                    <CalculationTraceView state={trace} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      A recorded amount — this metric needs no calculation. Verified value:{" "}
                      <span className="font-mono">{valueOf(selected.record)}</span>
                    </p>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">Loading the calculation…</p>
                )}
                {selected.record.documentId && selected.record.mimeType ? (
                  <DocumentViewer
                    src={`/api/documents/${selected.record.documentId}/file`}
                    mimeType={selected.record.mimeType}
                    fileName={selected.record.fileName ?? "Evidence"}
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

/** The calculated result when there is one, else the verified amount. */
function valueOf(record: ReadinessRecord) {
  if (record.resultValue !== null && record.resultUnit) {
    return formatQuantity(record.resultValue, record.resultUnit);
  }
  if (record.activityValue !== null) {
    return formatQuantity(record.activityValue, record.activityUnit ?? "");
  }
  return "—";
}

function Toggle({
  open,
  onClick,
  depth,
  trailing,
  children,
}: {
  open: boolean;
  onClick: () => void;
  depth: number;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <div
      className="flex items-center gap-3 py-2 pr-3"
      style={{ paddingLeft: `${12 + depth * 24}px` }}
    >
      <button
        type="button"
        onClick={onClick}
        aria-expanded={open}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
        {children}
      </button>
      {trailing}
    </div>
  );
}
