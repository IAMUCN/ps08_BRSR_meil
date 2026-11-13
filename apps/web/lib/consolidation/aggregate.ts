// How each metric type consolidates (.grill/phase-15-consolidation-decisions.md). Pure: the SQL layer hands
// in per-node sums from the consolidation views; this decides how they combine.
//   calculated → sum of results per unit (never mixing units)
//   percentage → Σ part ÷ Σ whole × 100, never a sum or average of percentages
//   recorded   → sum of verified amounts, normalised to the metric's unit where possible
import { normalize } from "../calculation/units.ts";

export type Method = "sum" | "ratio" | "recorded";

export type ValueRow = {
  unit: string | null;
  approved: number;
  awaiting: number;
  records: number;
  notCalculated: number;
};

export type InputRow = { key: string; approved: number; awaiting: number };

export type MetricInfo = {
  unit: string;
  requiresCalculation: boolean;
  /** Set for percentage metrics: the field keys and their labels. */
  ratio: {
    part: string;
    whole: string;
    partLabel: string;
    wholeLabel: string;
    /** part ÷ whole × scale; 100 (a percentage) when absent. */
    scale?: number;
  } | null;
};

export type Figure = {
  unit: string;
  approved: number | null;
  awaiting: number | null;
  records: number;
};

export type Consolidated = {
  method: Method;
  figures: Figure[];
  notCalculated: number;
  /** Percentages only: the summed counts the figure was derived from. */
  basis: {
    partLabel: string;
    wholeLabel: string;
    approved: { part: number; whole: number };
    awaiting: { part: number; whole: number };
  } | null;
};

const ratio = (part: number, whole: number, scale = 100) =>
  whole === 0 ? null : (part / whole) * scale;

export function consolidate(
  info: MetricInfo,
  values: ValueRow[],
  inputs: InputRow[],
): Consolidated {
  const notCalculated = values.reduce((n, v) => n + v.notCalculated, 0);
  const counted = values.filter((v) => v.unit !== null);
  const records = counted.reduce((n, v) => n + v.records, 0);

  if (info.ratio) {
    const sum = (key: string, field: "approved" | "awaiting") =>
      inputs.filter((i) => i.key === key).reduce((n, i) => n + i[field], 0);
    const approved = {
      part: sum(info.ratio.part, "approved"),
      whole: sum(info.ratio.whole, "approved"),
    };
    const awaiting = {
      part: sum(info.ratio.part, "awaiting"),
      whole: sum(info.ratio.whole, "awaiting"),
    };
    return {
      method: "ratio",
      figures: records
        ? [
            {
              unit: (info.ratio.scale ?? 100) === 100 ? "%" : info.unit,
              approved: ratio(approved.part, approved.whole, info.ratio.scale),
              awaiting: ratio(awaiting.part, awaiting.whole, info.ratio.scale),
              records,
            },
          ]
        : [],
      notCalculated,
      basis: {
        partLabel: info.ratio.partLabel,
        wholeLabel: info.ratio.wholeLabel,
        approved,
        awaiting,
      },
    };
  }

  // Calculated results are already in their result unit; recorded amounts may be written "Rs" or "INR".
  const figures: Figure[] = [];
  for (const v of counted) {
    let unit = v.unit!;
    let scale = 1;
    if (!info.requiresCalculation) {
      const n = normalize(1, unit, info.unit);
      if (n.ok) {
        unit = info.unit;
        scale = n.normalized.value;
      }
    }
    let figure = figures.find((f) => f.unit === unit);
    if (!figure) {
      figure = { unit, approved: 0, awaiting: 0, records: 0 };
      figures.push(figure);
    }
    figure.approved! += v.approved * scale;
    figure.awaiting! += v.awaiting * scale;
    figure.records += v.records;
  }
  return {
    method: info.requiresCalculation ? "sum" : "recorded",
    figures,
    notCalculated,
    basis: null,
  };
}

/** Indian financial year (April–March) a date falls in, by its starting calendar year. */
export function financialYearOf(isoDate: string): number {
  const [year, month] = isoDate.split("-").map(Number);
  return month >= 4 ? year : year - 1;
}

export const financialYearLabel = (startYear: number) =>
  `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;

// Written out, not left to the runtime's locale data ("Sep" in one version is "Sept" in the next).
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const day = (iso: string) =>
  `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
/**
 * The quarter of a financial year (April-March): Q1 April-June, Q2 July-September, Q3 October-December,
 * Q4 January-March. The dates are the first and last day of its three months.
 */
export function quarterRange(startYear: number, quarter: 1 | 2 | 3 | 4) {
  const firstMonth = [4, 7, 10, 1][quarter - 1]!;
  const year = quarter === 4 ? startYear + 1 : startYear;
  const lastMonth = firstMonth + 2;
  const lastDay = new Date(Date.UTC(year, lastMonth, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${year}-${pad(firstMonth)}-01`,
    to: `${year}-${pad(lastMonth)}-${pad(lastDay)}`,
  };
}

/** The quarter a range is exactly, as { startYear, quarter }; null for any other range. */
export function quarterOfRange(from: string, to: string) {
  const startYear = financialYearOf(from);
  for (const quarter of [1, 2, 3, 4] as const) {
    const q = quarterRange(startYear, quarter);
    if (q.from === from && q.to === to) return { startYear, quarter };
  }
  return null;
}

/** A custom range of reporting periods as the reports name it: "1 Aug 2026 to 30 Sep 2026". A whole quarter
 *  is named as one: "Q2 FY 2026-27 (1 Jul 2026 to 30 Sep 2026)". */
export const rangeLabel = (from: string, to: string) => {
  const plain = `${day(from)} to ${day(to)}`;
  const q = quarterOfRange(from, to);
  return q ? `Q${q.quarter} ${financialYearLabel(q.startYear)} (${plain})` : plain;
};

/** The first and last day of a financial year, as ISO dates. */
export const financialYearRange = (startYear: number) => ({
  from: `${startYear}-04-01`,
  to: `${startYear + 1}-03-31`,
});
