"use client";

import { AlertTriangle, ChevronRight, FileText } from "lucide-react";
import { useState } from "react";
import { Toggle } from "@/components/brsr-tree/tree-toggle";
import { CalculationTraceView } from "@/components/calculation/calculation-trace";
import { DocumentViewer } from "@/components/document-viewer/document-viewer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatQuantity, type CalculationState } from "@/lib/calculation/trace";
import { formatTotal } from "@/lib/scope/display";
import type {
  ReportedIndicator,
  ReportedMetric,
  ReportedRecord,
  Snapshot,
} from "@/lib/reports/snapshot";
import { reportedRecordAction } from "../actions";

// Report Detail / Drill-down (03_APP_FLOW.md §2.2, Journey 5; UI brief §13.5/§21): the report's own values,
// each clickable, expanding in place — Report Value → BRSR Indicator → ESG Metric → Calculation → Verified
// Activity Data → Original Document — without leaving the report. The trace shown is the exact calculation
// row the report used.

const valueText = (figures: { unit: string; value: number | null }[]) =>
  figures.length === 0
    ? "No approved data"
    : figures.map((f) => (f.value === null ? "—" : formatTotal(f.value, f.unit))).join(" · ");

type Selected = { indicator: ReportedIndicator; metric: ReportedMetric; record: ReportedRecord };

export function ReportView({ snapshot }: { snapshot: Snapshot }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Selected | null>(null);
  const [detail, setDetail] = useState<{
    available: boolean;
    calculation: CalculationState | null;
    recalculatedSince: boolean;
  } | null>(null);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function openRecord(s: Selected) {
    setSelected(s);
    setDetail(null);
    const result = await reportedRecordAction({
      recordId: s.record.recordId,
      calculationId: s.record.calculationId,
    });
    setDetail(
      result.ok ? result.data : { available: false, calculation: null, recalculatedSince: false },
    );
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="ghg-heading" className="space-y-2">
        <h2 id="ghg-heading" className="text-sm font-semibold text-brsr-heading">
          Greenhouse gas emissions summary
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {snapshot.scopes.map((s) => (
            <div key={s.code} className="rounded-md border bg-card p-3">
              <p className="text-xs text-muted-foreground">{s.name} · approved</p>
              <p className="font-mono text-lg font-semibold">{valueText(s.figures)}</p>
            </div>
          ))}
        </div>
      </section>

      <ul aria-label="Reported BRSR indicators" className="rounded-md border">
        {snapshot.sections.map((section) => (
          <li key={section.code} className="border-b last:border-b-0">
            <p className="px-3 py-2 font-semibold text-brsr-heading">
              Section {section.code} — {section.name}
            </p>
            <ul>
              {section.indicators.map((indicator) => (
                <li key={indicator.id} className="border-t">
                  <Toggle
                    open={open.has(indicator.id)}
                    onClick={() => toggle(indicator.id)}
                    depth={1}
                    trailing={
                      <span className="text-right font-mono text-xs whitespace-nowrap">
                        {indicator.metrics.length === 1
                          ? valueText(indicator.metrics[0].figures)
                          : `${indicator.metrics.length} metrics`}
                      </span>
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
                          No metric is mapped to this indicator.
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
                                <span className="font-mono text-sm font-semibold whitespace-nowrap">
                                  {valueText(metric.figures)}
                                </span>
                              }
                            >
                              <span className="text-sm font-medium">{metric.name}</span>
                              {metric.basis && metric.figures.length ? (
                                <span className="text-xs text-muted-foreground">
                                  {metric.basis.partLabel} {metric.basis.part} of{" "}
                                  {metric.basis.wholeLabel} {metric.basis.whole}
                                </span>
                              ) : null}
                            </Toggle>
                            {open.has(key) ? (
                              <ul className="pb-2">
                                {metric.records.length === 0 ? (
                                  <li className="py-1.5 pr-3 pl-24 text-sm text-muted-foreground">
                                    No approved records contributed.
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
                                      onClick={() => openRecord({ indicator, metric, record })}
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
                                      {record.value !== null
                                        ? formatQuantity(record.value, record.unit ?? "")
                                        : "—"}
                                    </span>
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
          </li>
        ))}
      </ul>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-[760px] max-w-full">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.record.fileName ?? selected.metric.name}</SheetTitle>
                <SheetDescription asChild>
                  <nav aria-label="Drill-down path" className="flex flex-wrap items-center gap-1">
                    {[
                      `Reported ${valueText(selected.metric.figures)}`,
                      selected.indicator.code,
                      selected.metric.name,
                      "Calculation",
                      "Verified activity data",
                      "Original document",
                    ].map((step, i) => (
                      <span key={step} className="flex items-center gap-1">
                        {i > 0 ? <ChevronRight className="size-3" aria-hidden /> : null}
                        {step}
                      </span>
                    ))}
                  </nav>
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 overflow-y-auto px-4 pb-6">
                {detail === null ? (
                  <p className="text-sm text-muted-foreground">Loading the reported record…</p>
                ) : !detail.available ? (
                  <p className="flex items-center gap-2 rounded-md border border-status-error/40 bg-status-error/5 px-3 py-2 text-sm">
                    <AlertTriangle className="size-4 text-status-error" aria-hidden />
                    Source record unavailable — it no longer exists in TraceESG.
                  </p>
                ) : (
                  <>
                    {detail.recalculatedSince ? (
                      <p className="rounded-md border border-status-warning/40 bg-status-warning/5 px-3 py-2 text-sm">
                        This record has been recalculated since the report was generated. Below is
                        the calculation the report used.
                      </p>
                    ) : null}
                    {detail.calculation ? (
                      <CalculationTraceView state={detail.calculation} />
                    ) : (
                      <p className="text-sm">
                        A recorded amount — no calculation. Verified value:{" "}
                        <span className="font-mono">
                          {selected.record.value !== null
                            ? formatQuantity(selected.record.value, selected.record.unit ?? "")
                            : "—"}
                        </span>
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {selected.record.orgUnitName} · contributed{" "}
                      <span className="font-mono">
                        {selected.record.value !== null
                          ? formatQuantity(selected.record.value, selected.record.unit ?? "")
                          : "—"}
                      </span>{" "}
                      to this figure
                    </p>
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
                  </>
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
