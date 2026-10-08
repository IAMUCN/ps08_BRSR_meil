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
  ratio: { part: string; whole: string; partLabel: string; wholeLabel: string } | null;
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

const ratio = (part: number, whole: number) => (whole === 0 ? null : (part / whole) * 100);

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
              unit: "%",
              approved: ratio(approved.part, approved.whole),
              awaiting: ratio(awaiting.part, awaiting.whole),
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

/** The first and last day of a financial year, as ISO dates. */
export const financialYearRange = (startYear: number) => ({
  from: `${startYear}-04-01`,
  to: `${startYear + 1}-03-31`,
});
