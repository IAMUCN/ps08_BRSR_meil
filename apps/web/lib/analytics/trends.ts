// Year-wise emission trends (feature_enhancement.md 7.1, requirement 33; A47). Pure: the SQL lives in
// lib/analytics/service.ts, so the rules below are unit-tested.
//
// Rules:
//   * Approved records only (verified, validated, approved), in tCO2e. Awaiting, uncalculated and missing
//     submissions are counted and named, never read as zero.
//   * A financial year is "complete" when all 12 months have approved data and nothing is awaiting approval,
//     uncalculated or missing, and the year is over. Otherwise it says what is missing.
//   * Year against year is compared like for like: the full years when both are complete, else only the months
//     both years have data for ("same 5 months"), else not at all. The months used are always shown.
import { fyLabel, fyOf } from "../factors/source-text.ts";

export type ScopeCode = "SCOPE_1" | "SCOPE_2" | "SCOPE_3";
export const SCOPES: { code: ScopeCode; label: string }[] = [
  { code: "SCOPE_1", label: "Scope 1" },
  { code: "SCOPE_2", label: "Scope 2" },
  { code: "SCOPE_3", label: "Scope 3" },
];

export type PeriodInfo = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  type: "monthly" | "annual";
  status: string;
};

/** One activity in one period, rolled up for the chosen org unit. */
export type EmissionRow = {
  periodId: string;
  metricCode: string;
  metricName: string;
  scopeCode: ScopeCode;
  /** Approved emissions in tCO2e. */
  approvedT: number;
  approvedCount: number;
  /** Verified records not yet approved. */
  pendingCount: number;
  /** Records with no current calculation (no factor yet). */
  notCalculatedCount: number;
};

/** Expected submissions with nothing filed, per period (for the chosen org unit and everything beneath it). */
export type PeriodGap = { periodId: string; missingExpected: number };

const MONTHS = "Apr May Jun Jul Aug Sep Oct Nov Dec Jan Feb Mar".split(" ");
/** The month's place in the Indian financial year: April 0 … March 11. */
export const fyMonth = (isoDate: string) => (Number(isoDate.slice(5, 7)) + 8) % 12;
export const monthName = (index: number) => MONTHS[index];

/** "Apr–Sep" for a run of months, "Apr, Jun, Aug" otherwise. */
export function monthsLabel(months: number[]): string {
  const sorted = [...months].sort((a, b) => a - b);
  if (sorted.length === 12) return "the full year";
  if (sorted.length === 0) return "no months";
  const run = sorted.every((m, i) => i === 0 || m === sorted[i - 1] + 1);
  if (run && sorted.length > 2) return `${MONTHS[sorted[0]]}–${MONTHS[sorted.at(-1)!]}`;
  return sorted.map((m) => MONTHS[m]).join(", ");
}

/** Emissions of one thing (a scope, an activity, the total) through one financial year. */
export type Series = {
  /** tCO2e per financial-year month, from monthly periods with approved data. */
  monthly: Map<number, number>;
  /** tCO2e from annual periods, null when there are none with data. */
  annual: number | null;
  total: number;
};

const emptySeries = (): Series => ({ monthly: new Map(), annual: null, total: 0 });

export type Comparison =
  | { kind: "none"; reason: string }
  | {
      kind: "full" | "same_months";
      months: number[];
      current: number;
      previous: number;
      /** Percent change; null when the earlier figure is zero. */
      changePct: number | null;
    };

/** Like-for-like change of `current` against `previous`; see the rules at the top. */
export function compare(
  current: Series | undefined,
  previous: Series | undefined,
  bothComplete: boolean,
): Comparison {
  if (!current || !previous || (current.total === 0 && previous.total === 0))
    return { kind: "none", reason: "No approved data in one of the two years." };
  const pct = (a: number, b: number) => (b === 0 ? null : ((a - b) / b) * 100);
  if (bothComplete) {
    return {
      kind: "full",
      months: Array.from({ length: 12 }, (_, i) => i),
      current: current.total,
      previous: previous.total,
      changePct: pct(current.total, previous.total),
    };
  }
  if (current.annual !== null || previous.annual !== null)
    return {
      kind: "none",
      reason: "One year was reported annually and is not complete, so no months can be matched.",
    };
  const months = [...current.monthly.keys()].filter((m) => previous.monthly.has(m));
  if (months.length === 0)
    return { kind: "none", reason: "The two years have no months with data in common." };
  const sum = (s: Series) => months.reduce((acc, m) => acc + (s.monthly.get(m) ?? 0), 0);
  const a = sum(current);
  const b = sum(previous);
  return {
    kind: "same_months",
    months: months.sort((x, y) => x - y),
    current: a,
    previous: b,
    changePct: pct(a, b),
  };
}

/** A change of at least this many percent is called out as an increase or a decrease. */
export const NOTABLE_PCT = 10;

export type YearSummary = {
  financialYear: number;
  label: string;
  total: number;
  byScope: Record<ScopeCode, number>;
  monthsWithData: number[];
  pendingCount: number;
  notCalculatedCount: number;
  missingExpected: number;
  inProgress: boolean;
  complete: boolean;
  /** Why the year is not complete, in words. */
  notes: string[];
  /** Against the year before, like for like. */
  change: Comparison;
  changeByScope: Record<ScopeCode, Comparison>;
};

export type ActivityTrend = {
  metricCode: string;
  metricName: string;
  scopeCode: ScopeCode;
  /** tCO2e per year in `years`; null where the year has no approved data for it. */
  values: (number | null)[];
  /** The latest year against the one before, like for like. */
  change: Comparison;
  pendingCount: number;
  notCalculatedCount: number;
};

export type Trends = {
  years: YearSummary[];
  activities: ActivityTrend[];
};

/** Series per financial year for each key a row belongs to (TOTAL, its scope, its metric). */
export function seriesByYear(
  periods: PeriodInfo[],
  rows: EmissionRow[],
  keysOf: (row: EmissionRow) => string[],
): Map<number, Map<string, Series>> {
  const byId = new Map(periods.map((p) => [p.id, p]));
  const out = new Map<number, Map<string, Series>>();
  for (const row of rows) {
    const period = byId.get(row.periodId);
    if (!period || row.approvedCount === 0) continue;
    const fy = fyOf(period.startDate);
    const year = out.get(fy) ?? new Map<string, Series>();
    out.set(fy, year);
    for (const key of keysOf(row)) {
      const s = year.get(key) ?? emptySeries();
      year.set(key, s);
      if (period.type === "annual") s.annual = (s.annual ?? 0) + row.approvedT;
      else {
        const m = fyMonth(period.startDate);
        s.monthly.set(m, (s.monthly.get(m) ?? 0) + row.approvedT);
      }
      s.total += row.approvedT;
    }
  }
  return out;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function buildTrends(input: {
  periods: PeriodInfo[];
  rows: EmissionRow[];
  gaps: PeriodGap[];
  /** Today's date in India, YYYY-MM-DD. */
  today: string;
  /** How many years to show, ending with the latest that has data. */
  maxYears?: number;
}): Trends {
  const { periods, rows, gaps, today, maxYears = 5 } = input;
  const byId = new Map(periods.map((p) => [p.id, p]));
  const fyOfPeriod = (id: string) => {
    const p = byId.get(id);
    return p ? fyOf(p.startDate) : null;
  };
  const series = seriesByYear(periods, rows, (r) => ["TOTAL", r.scopeCode, r.metricCode]);

  const touched = new Set<number>();
  for (const r of rows) {
    const fy = fyOfPeriod(r.periodId);
    if (fy !== null && (r.approvedCount || r.pendingCount || r.notCalculatedCount)) touched.add(fy);
  }
  if (touched.size === 0) return { years: [], activities: [] };
  const last = Math.max(...touched);
  const first = Math.max(Math.min(...touched), last - maxYears + 1);
  const fys = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  const summaries: YearSummary[] = [];
  for (const fy of fys) {
    const year = series.get(fy);
    const total = year?.get("TOTAL");
    const months = total
      ? total.annual !== null
        ? Array.from({ length: 12 }, (_, i) => i)
        : [...total.monthly.keys()].sort((a, b) => a - b)
      : [];
    const inYear = rows.filter((r) => fyOfPeriod(r.periodId) === fy);
    const pendingCount = inYear.reduce((a, r) => a + r.pendingCount, 0);
    const notCalculatedCount = inYear.reduce((a, r) => a + r.notCalculatedCount, 0);
    const missingExpected = gaps
      .filter((g) => fyOfPeriod(g.periodId) === fy)
      .reduce((a, g) => a + g.missingExpected, 0);
    const inProgress = today <= `${fy + 1}-03-31`;
    const notes: string[] = [];
    if (inProgress) notes.push("The year is not over yet.");
    if (months.length < 12)
      notes.push(
        months.length === 0
          ? "No approved data yet."
          : `Approved data for ${months.length} of 12 months (${monthsLabel(months)}).`,
      );
    if (pendingCount) notes.push(`${pendingCount} record(s) awaiting approval are not counted.`);
    if (notCalculatedCount)
      notes.push(
        `${notCalculatedCount} record(s) could not be calculated (no factor) and are not counted.`,
      );
    if (missingExpected) notes.push(`${missingExpected} expected submission(s) were never filed.`);
    const complete = notes.length === 0;
    summaries.push({
      financialYear: fy,
      label: `FY ${fyLabel(fy)}`,
      total: round(total?.total ?? 0),
      byScope: {
        SCOPE_1: round(year?.get("SCOPE_1")?.total ?? 0),
        SCOPE_2: round(year?.get("SCOPE_2")?.total ?? 0),
        SCOPE_3: round(year?.get("SCOPE_3")?.total ?? 0),
      },
      monthsWithData: months,
      pendingCount,
      notCalculatedCount,
      missingExpected,
      inProgress,
      complete,
      notes,
      change: { kind: "none", reason: "The first year shown." },
      changeByScope: {
        SCOPE_1: { kind: "none", reason: "The first year shown." },
        SCOPE_2: { kind: "none", reason: "The first year shown." },
        SCOPE_3: { kind: "none", reason: "The first year shown." },
      },
    });
  }
  for (let i = 1; i < summaries.length; i++) {
    const now = summaries[i];
    const before = summaries[i - 1];
    const both = now.complete && before.complete;
    const a = series.get(now.financialYear);
    const b = series.get(before.financialYear);
    now.change = compare(a?.get("TOTAL"), b?.get("TOTAL"), both);
    for (const s of SCOPES)
      now.changeByScope[s.code] = compare(a?.get(s.code), b?.get(s.code), both);
  }

  // Activities with any approved figure in the years shown, biggest in the latest year first.
  const latest = summaries.at(-1)!;
  const previous = summaries.at(-2);
  const metrics = new Map<string, EmissionRow>();
  for (const r of rows) if (!metrics.has(r.metricCode)) metrics.set(r.metricCode, r);
  const activities: ActivityTrend[] = [];
  for (const [code, sample] of metrics) {
    const values = fys.map((fy) => {
      const s = series.get(fy)?.get(code);
      return s ? round(s.total) : null;
    });
    if (values.every((v) => v === null)) continue;
    const inLatest = rows.filter(
      (r) => r.metricCode === code && fyOfPeriod(r.periodId) === latest.financialYear,
    );
    activities.push({
      metricCode: code,
      metricName: sample.metricName,
      scopeCode: sample.scopeCode,
      values,
      change: previous
        ? compare(
            series.get(latest.financialYear)?.get(code),
            series.get(previous.financialYear)?.get(code),
            latest.complete && previous.complete,
          )
        : { kind: "none", reason: "Only one year has data." },
      pendingCount: inLatest.reduce((a, r) => a + r.pendingCount, 0),
      notCalculatedCount: inLatest.reduce((a, r) => a + r.notCalculatedCount, 0),
    });
  }
  activities.sort((x, y) => (y.values.at(-1) ?? -1) - (x.values.at(-1) ?? -1));
  return { years: summaries, activities };
}
