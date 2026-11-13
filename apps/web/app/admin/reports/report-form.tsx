"use client";

import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PeriodOptions } from "@/components/ui/period-select";
import { quarterRange } from "@/lib/consolidation/aggregate";
import { REPORT_TEMPLATES, TEMPLATE_INFO, type ReportTemplate } from "@/lib/reports/templates";
import type { ReportOptions } from "@/lib/trpc/routers/reports";
import { generateReportAction } from "./actions";

// UI brief §14: "a simple parameter form (period + org scope) … generation itself uses the non-blocking
// pattern, never a modal wizard".
/** What the form starts on when the page was opened with a selection in its address (the chatbot does). */
export type ReportPreset = {
  orgUnitId?: string;
  periodId?: string;
  financialYear?: number;
  from?: string;
  to?: string;
  template?: ReportTemplate;
};

const QUARTER_NAMES = ["1st", "2nd", "3rd", "4th"];
const QUARTER_MONTHS = ["April–June", "July–September", "October–December", "January–March"];

export function ReportForm({
  options,
  preset = {},
}: {
  options: ReportOptions;
  preset?: ReportPreset;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // A preset value that is not on a list is ignored, never submitted.
  const known = <T,>(list: T[], value: T | undefined) =>
    value !== undefined && list.includes(value) ? value : undefined;
  const periodIds = options.periods.map((p) => p.id);
  // Periods are listed newest first: the range starts at the earliest one on or after `from`.
  const rangeStart = preset.from
    ? options.periods.findLast((p) => p.start >= preset.from!)?.id
    : undefined;
  const rangeEnd = preset.to ? options.periods.find((p) => p.end <= preset.to!)?.id : undefined;
  const [orgUnitId, setOrgUnitId] = useState(
    known(
      options.orgUnits.map((o) => o.id),
      preset.orgUnitId,
    ) ??
      options.orgUnits[0]?.id ??
      "",
  );
  const [coverage, setCoverage] = useState<"period" | "year" | "quarter" | "range">(
    rangeStart && rangeEnd ? "range" : preset.financialYear !== undefined ? "year" : "period",
  );
  const [periodId, setPeriodId] = useState(
    known(periodIds, preset.periodId) ?? options.defaultPeriodId ?? "",
  );
  const [year, setYear] = useState(
    String(
      known(
        options.financialYears.map((y) => y.startYear),
        preset.financialYear,
      ) ??
        options.defaultFinancialYear ??
        "",
    ),
  );
  // Quarters of the chosen financial year (Q1 April-June ... Q4 January-March); only ones that have begun.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const quarterOptions = ([1, 2, 3, 4] as const).filter(
    (q) => quarterRange(Number(year), q).from <= today,
  );
  const [quarter, setQuarter] = useState<string>(
    String(quarterOptions[quarterOptions.length - 1] ?? 1),
  );
  const chosenQuarter = quarterOptions.includes(Number(quarter) as 1 | 2 | 3 | 4)
    ? (Number(quarter) as 1 | 2 | 3 | 4)
    : (quarterOptions[quarterOptions.length - 1] ?? 1);
  const [template, setTemplate] = useState<ReportTemplate>(
    preset.template && REPORT_TEMPLATES.includes(preset.template) ? preset.template : "brsr",
  );
  const [fromId, setFromId] = useState(rangeStart ?? options.defaultPeriodId ?? "");
  const [toId, setToId] = useState(rangeEnd ?? options.defaultPeriodId ?? "");

  function submit(event: FormEvent) {
    event.preventDefault();
    const from = options.periods.find((p) => p.id === fromId)?.start;
    const to = options.periods.find((p) => p.id === toId)?.end;
    if (coverage === "range" && (!from || !to || from > to)) {
      toast.error("The first period of the range must not be after the last.");
      return;
    }
    startTransition(async () => {
      const result = await generateReportAction(
        coverage === "period"
          ? { orgUnitId, periodId, template }
          : coverage === "year"
            ? { orgUnitId, financialYear: Number(year), template }
            : coverage === "quarter"
              ? { orgUnitId, ...quarterRange(Number(year), chosenQuarter), template }
              : { orgUnitId, from, to, template },
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Generating the ${TEMPLATE_INFO[template].label.toLowerCase()}… you'll be notified when it's ready.`,
      );
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-4 rounded-md border bg-card p-4"
      aria-label="Generate a report"
    >
      <div className="w-full space-y-2">
        <Label htmlFor="report-template">Template</Label>
        <NativeSelect
          id="report-template"
          value={template}
          onChange={(e) => setTemplate(e.target.value as ReportTemplate)}
          aria-describedby="report-template-help"
        >
          {REPORT_TEMPLATES.map((t) => (
            <option key={t} value={t}>
              {TEMPLATE_INFO[t].label}
            </option>
          ))}
        </NativeSelect>
        <p id="report-template-help" className="text-sm text-muted-foreground">
          {TEMPLATE_INFO[template].description}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="report-org">Organization scope</Label>
        <NativeSelect
          id="report-org"
          value={orgUnitId}
          onChange={(e) => setOrgUnitId(e.target.value)}
        >
          {options.orgUnits.map((o) => (
            <option key={o.id} value={o.id}>
              {`${"  ".repeat(o.depth)}${o.name}`}
            </option>
          ))}
        </NativeSelect>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Covering</legend>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="coverage"
              checked={coverage === "period"}
              onChange={() => setCoverage("period")}
            />
            One period
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="coverage"
              checked={coverage === "year"}
              onChange={() => setCoverage("year")}
            />
            Financial year
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="coverage"
              checked={coverage === "quarter"}
              onChange={() => setCoverage("quarter")}
            />
            Quarter
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="coverage"
              checked={coverage === "range"}
              onChange={() => setCoverage("range")}
            />
            Custom period
          </label>
        </div>
      </fieldset>
      {coverage === "range" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="report-from">From period</Label>
            <NativeSelect
              id="report-from"
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
            >
              <PeriodOptions periods={options.periods} />
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-to">To period</Label>
            <NativeSelect id="report-to" value={toId} onChange={(e) => setToId(e.target.value)}>
              <PeriodOptions periods={options.periods} />
            </NativeSelect>
          </div>
        </>
      ) : coverage === "period" ? (
        <div className="space-y-2">
          <Label htmlFor="report-period">Reporting period</Label>
          <NativeSelect
            id="report-period"
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
          >
            <PeriodOptions periods={options.periods} />
          </NativeSelect>
        </div>
      ) : coverage === "quarter" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="report-quarter-year">Financial year (April–March)</Label>
            <NativeSelect
              id="report-quarter-year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              {options.financialYears.map((y) => (
                <option key={y.startYear} value={y.startYear}>
                  {y.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-quarter">Quarter</Label>
            <NativeSelect
              id="report-quarter"
              value={String(chosenQuarter)}
              onChange={(e) => setQuarter(e.target.value)}
            >
              {quarterOptions.map((q) => (
                <option key={q} value={q}>
                  {QUARTER_NAMES[q - 1]} quarter ({QUARTER_MONTHS[q - 1]})
                </option>
              ))}
            </NativeSelect>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="report-year">Financial year (April–March)</Label>
          <NativeSelect id="report-year" value={year} onChange={(e) => setYear(e.target.value)}>
            {options.financialYears.map((y) => (
              <option key={y.startYear} value={y.startYear}>
                {y.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <Button type="submit" disabled={pending || !orgUnitId}>
        <FileText aria-hidden />
        Generate {TEMPLATE_INFO[template].label}
      </Button>
    </form>
  );
}
