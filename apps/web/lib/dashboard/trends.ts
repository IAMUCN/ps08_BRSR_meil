// Multi-year KPI trends for the Control Tower (.grill/grand-finale-deliverables-decisions.md): the headline
// environmental figures of each financial year, from approved records only. Pure — the SQL lives in the
// records router — so the rule "a year with no approved data is empty, never zero" is unit-tested.
import { normalize } from "../calculation/units.ts";

/** Approved figures summed per financial year, scope, activity and unit. */
export type TrendRow = {
  financialYear: number;
  scopeCode: string | null;
  metricCode: string;
  /** The calculated result and its unit (emissions in kgCO2e or tCO2e, water in KL or m³). */
  value: number | null;
  unit: string | null;
  /** The verified quantity and its unit (waste by weight). */
  activity: number | null;
  activityUnit: string | null;
};

export type KpiTrend = {
  key: string;
  label: string;
  unit: string;
  /** One value per year in `years`; null where the year has no approved data. */
  values: (number | null)[];
};

export type KpiTrends = { years: number[]; kpis: KpiTrend[] };

/** How many financial years the dashboard shows, ending with the latest that has data. */
export const TREND_YEARS = 5;

const tonnesCo2e = (value: number, unit: string | null) => {
  const u = unit?.trim().toLowerCase();
  return u === "kgco2e" ? value / 1000 : u === "tco2e" ? value : null;
};

export function kpiTrends(rows: TrendRow[]): KpiTrends {
  if (rows.length === 0) return { years: [], kpis: [] };
  const last = Math.max(...rows.map((r) => r.financialYear));
  const first = Math.max(Math.min(...rows.map((r) => r.financialYear)), last - TREND_YEARS + 1);
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  const series = (pick: (r: TrendRow) => number | null) =>
    years.map((year) => {
      const picked = rows
        .filter((r) => r.financialYear === year)
        .map(pick)
        .filter((v): v is number => v !== null);
      return picked.length ? picked.reduce((a, b) => a + b, 0) : null;
    });
  const emissions = (scope?: string) =>
    series((r) =>
      r.scopeCode && (!scope || r.scopeCode === scope) && r.value !== null
        ? tonnesCo2e(r.value, r.unit)
        : null,
    );
  const converted = (value: number | null, unit: string | null, to: string) => {
    if (value === null || !unit) return null;
    const n = normalize(value, unit, to);
    return n.ok ? n.normalized.value : null;
  };

  const kpis: KpiTrend[] = [
    { key: "scope1", label: "Scope 1 emissions", unit: "tCO2e", values: emissions("SCOPE_1") },
    { key: "scope2", label: "Scope 2 emissions", unit: "tCO2e", values: emissions("SCOPE_2") },
    { key: "scope3", label: "Scope 3 emissions", unit: "tCO2e", values: emissions("SCOPE_3") },
    {
      key: "total",
      label: "Total emissions (Scope 1 + 2 + 3)",
      unit: "tCO2e",
      values: emissions(),
    },
    {
      key: "water",
      label: "Water consumed",
      unit: "KL",
      values: series((r) =>
        r.metricCode === "WATER_CONSUMPTION" ? converted(r.value, r.unit, "KL") : null,
      ),
    },
    {
      key: "waste",
      label: "Waste generated",
      unit: "t",
      values: series((r) => {
        if (r.metricCode !== "WASTE_DISPOSED") return null;
        const kg = converted(r.activity, r.activityUnit, "kg");
        return kg === null ? null : kg / 1000;
      }),
    },
  ];
  return { years, kpis };
}

/** Change against the previous year in percent; null when either year is empty or the base is zero. */
export const yearOnYear = (values: (number | null)[], index: number) => {
  const now = values[index];
  const before = values[index - 1];
  return now === null || before === null || before === undefined || before === 0
    ? null
    : ((now - before) / before) * 100;
};
