// Deterministic helpers for the chat tools (.grill/chat-analyst-decisions.md): which reporting periods a
// phrase like "previous month" means, and how two figures compare. Pure, so the rules are unit-tested and
// never depend on what a language model says.
import {
  financialYearLabel,
  financialYearOf,
  financialYearRange,
} from "../consolidation/aggregate.ts";

export type Period = {
  id: string;
  label: string;
  /** ISO dates, inclusive. */
  start: string;
  end: string;
  /** monthly or annual. */
  type: string;
};

export const PRESETS = [
  "this_month",
  "previous_month",
  "current_financial_year",
  "previous_financial_year",
  "year_to_date",
  "till_date",
] as const;

/** One of: a preset, a financial year (its starting calendar year), two dates, or a period's label. */
export type PeriodSpec = {
  preset?: (typeof PRESETS)[number];
  financial_year?: number;
  from?: string;
  to?: string;
  label?: string;
};

export type ResolvedPeriods =
  | { ok: true; periods: Period[]; label: string; note: string | null }
  | { ok: false; error: string };

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** The reporting period a day falls in; the shortest one when a month and a year both cover it. */
const containing = (periods: Period[], day: string) =>
  periods
    .filter((p) => p.start <= day && day <= p.end)
    .sort((a, b) => (a.end > b.end ? 1 : -1))
    .slice(0, 1);

const inYear = (periods: Period[], startYear: number) => {
  const { from, to } = financialYearRange(startYear);
  return periods.filter((p) => p.start >= from && p.end <= to);
};

/**
 * Reporting periods are whole months (or years) and financial years run April to March, so every phrase
 * resolves to whole periods; `note` says so when that differs from what was asked. An empty list is a valid
 * answer ("no reporting period covers that"), not an error.
 */
export function resolvePeriods(spec: PeriodSpec, all: Period[], today: string): ResolvedPeriods {
  const periods = [...all].sort((a, b) => (a.start > b.start ? 1 : -1));
  const none = (what: string): ResolvedPeriods => ({
    ok: true,
    periods: [],
    label: what,
    note: `No reporting period exists for ${what}.`,
  });

  if (spec.label) {
    const wanted = spec.label.trim().toLowerCase();
    const found = periods.filter((p) => p.label.toLowerCase() === wanted);
    return found.length
      ? { ok: true, periods: found, label: found[0].label, note: null }
      : { ok: false, error: `No reporting period is called "${spec.label.slice(0, 60)}".` };
  }
  if (spec.financial_year !== undefined) {
    const label = financialYearLabel(spec.financial_year);
    const found = inYear(periods, spec.financial_year);
    return found.length ? { ok: true, periods: found, label, note: null } : none(label);
  }
  if (spec.from || spec.to) {
    if (!spec.from || !spec.to) return { ok: false, error: "A date range needs both dates." };
    if (spec.from > spec.to) return { ok: false, error: "The range ends before it starts." };
    const found = periods.filter((p) => p.start <= spec.to! && p.end >= spec.from!);
    if (!found.length) return none(`${spec.from} to ${spec.to}`);
    const start = found[0].start;
    const end = found[found.length - 1].end;
    return {
      ok: true,
      periods: found,
      label: found.length === 1 ? found[0].label : `${start} to ${end}`,
      note:
        start === spec.from && end === spec.to
          ? null
          : `Data is kept per reporting period, so this covers ${start} to ${end}, not ${spec.from} to ${spec.to}.`,
    };
  }

  const year = financialYearOf(today);
  switch (spec.preset) {
    case "this_month": {
      const found = containing(periods, today);
      return found.length
        ? { ok: true, periods: found, label: found[0].label, note: null }
        : none(`this month (${today.slice(0, 7)})`);
    }
    case "previous_month": {
      // The day before this month begins, whether or not this month has a reporting period yet.
      const day = addDays(`${today.slice(0, 7)}-01`, -1);
      const found = containing(periods, day);
      return found.length
        ? { ok: true, periods: found, label: found[0].label, note: null }
        : none(`the previous month (${day.slice(0, 7)})`);
    }
    case "current_financial_year":
    case "previous_financial_year": {
      const startYear = spec.preset === "current_financial_year" ? year : year - 1;
      const label = financialYearLabel(startYear);
      const found = inYear(periods, startYear);
      return found.length ? { ok: true, periods: found, label, note: null } : none(label);
    }
    case "year_to_date": {
      const label = `${financialYearLabel(year)} to date`;
      const found = inYear(periods, year).filter((p) => p.start <= today);
      return found.length
        ? {
            ok: true,
            periods: found,
            label,
            note: "Year to date is the financial year (April to March) up to the current reporting period.",
          }
        : none(label);
    }
    case "till_date": {
      const found = periods.filter((p) => p.start <= today);
      return found.length
        ? {
            ok: true,
            periods: found,
            label: `All reporting periods to date (${found[0].start} to ${found[found.length - 1].end})`,
            note: null,
          }
        : none("any date so far");
    }
    default:
      return {
        ok: false,
        error: "Say which period: a preset, a financial year, two dates or a label.",
      };
  }
}

export type Change = { difference: number | null; percent: number | null; note: string | null };

/** `current` against `baseline`. A missing side or a zero baseline gives no percentage, and says why. */
export function percentChange(current: number | null, baseline: number | null): Change {
  if (current === null || baseline === null) {
    return {
      difference: null,
      percent: null,
      note: "One side has no data, so no change can be calculated. Missing data is not zero.",
    };
  }
  const difference = current - baseline;
  if (baseline === 0) {
    return {
      difference,
      percent: null,
      note: "The value being compared against is zero, so a percentage change is not defined.",
    };
  }
  return { difference, percent: (difference / baseline) * 100, note: null };
}

/** Emission results in tonnes of CO2 equivalent; null for any other unit (never added in). */
export const tonnesCo2e = (value: number, unit: string) => {
  const u = unit.trim().toLowerCase();
  return u === "kgco2e" ? value / 1000 : u === "tco2e" ? value : null;
};
