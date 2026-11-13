"use client";

import { NativeSelect } from "@/components/ui/native-select";

// A reporting-period picker that follows the financial year and today's date (owner's request, 2026-11-13):
// choose the financial year (April to March), then a period inside it that has already begun. Periods in the
// future are not offered (the one in view always stays listed). Choosing another year jumps to its latest
// begun period, so the page is never left on a month with nothing in it.

export type PeriodChoice = { id: string; label: string; startDate: string; open?: boolean };

/** The financial year a start date (YYYY-MM-DD) belongs to: April to March, named by its first calendar year. */
export const financialYearOfDate = (start: string) => {
  const year = Number(start.slice(0, 4));
  return Number(start.slice(5, 7)) < 4 ? year - 1 : year;
};

const yearLabel = (y: number) => `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`;

export function PeriodSelect({
  periods,
  value,
  onChange,
  idPrefix,
  className,
  labelClassName = "flex flex-col gap-1 text-xs text-muted-foreground",
  inline = false,
}: {
  periods: PeriodChoice[];
  value: string;
  onChange: (periodId: string) => void;
  idPrefix: string;
  className?: string;
  labelClassName?: string;
  /** Labels beside the selects (text-sm) rather than above them. */
  inline?: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const years = [...new Set(periods.map((p) => financialYearOfDate(p.startDate)))].sort(
    (a, b) => b - a,
  );
  const current = periods.find((p) => p.id === value);
  const year = current ? financialYearOfDate(current.startDate) : years[0];
  const newestFirst = (list: PeriodChoice[]) =>
    [...list].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const choices = newestFirst(
    periods.filter(
      (p) => financialYearOfDate(p.startDate) === year && (p.startDate <= today || p.id === value),
    ),
  );
  const chooseYear = (next: number) => {
    const inYear = newestFirst(periods.filter((p) => financialYearOfDate(p.startDate) === next));
    const target = inYear.find((p) => p.startDate <= today) ?? inYear[inYear.length - 1];
    if (target) onChange(target.id);
  };
  const wrap = inline ? "flex items-center gap-2 text-sm text-muted-foreground" : labelClassName;
  return (
    <>
      <label htmlFor={`${idPrefix}-year`} className={wrap}>
        Financial year
        <NativeSelect
          id={`${idPrefix}-year`}
          value={String(year)}
          onChange={(e) => chooseYear(Number(e.target.value))}
          className={className}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {yearLabel(y)}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label htmlFor={`${idPrefix}-period`} className={wrap}>
        Period
        <NativeSelect
          id={`${idPrefix}-period`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={className}
        >
          {choices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {p.open === false ? " (closed)" : ""}
            </option>
          ))}
        </NativeSelect>
      </label>
    </>
  );
}
