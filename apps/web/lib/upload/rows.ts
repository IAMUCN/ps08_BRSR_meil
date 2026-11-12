// The Upload page's rows (owner's request after the mid evaluation, 2026-11-12; .grill/row-upload-decisions.md).
// Pure: what a row is, whether it is ready to submit, what it declares to the server, and what a draft keeps.

import { entryProblem, type DeclarationMode, type EntryField } from "../declarations/compare.ts";

/** How a row's files hold its bills. */
export type RowMode =
  /** One file, one bill (the default). */
  | "one"
  /** Several files that are the pages of one bill. */
  | "pages_of_one"
  /** Several separate bills; the values typed are their total. */
  | "total"
  /** A file (or files) holding several bills, each typed on its own line. */
  | "each";

/** One bill typed under a row whose file holds several. */
export type BillLine = {
  id: string;
  metricId: string;
  periodId: string;
  values: Record<string, string>;
  /** Which pages of the row's files this bill is ("each" rows; optional, all lines or none). */
  pageFrom?: string;
  pageTo?: string;
};

export type UploadRow = BillLine & {
  mode: RowMode;
  /** The second and later bills of an "each" row; the row itself is the first. */
  more: BillLine[];
  description: string;
};

/** What the rows need to know about an activity. */
export type RowMetric = {
  id: string;
  name: string;
  entryFields: EntryField[];
  unitKey: string | null;
  units: string[];
};

export const MAX_ROWS = 25;

export function newLine(id: string, periodId: string): BillLine {
  return { id, metricId: "", periodId, values: {} };
}

export function newRow(id: string, periodId: string): UploadRow {
  return { ...newLine(id, periodId), mode: "one", more: [], description: "" };
}

/** A line's values when its activity changes: the unit defaults to the activity's own. */
export function valuesFor(metric: RowMetric | undefined): Record<string, string> {
  return metric?.unitKey && metric.units[0] ? { [metric.unitKey]: metric.units[0] } : {};
}

/** The first problem with one bill line, or null. */
export function lineProblem(line: BillLine, metric: RowMetric | undefined): string | null {
  if (!line.metricId || !metric) return "Choose the bill type.";
  if (!line.periodId) return "Choose the reporting period.";
  const problem = entryProblem(metric.entryFields, line.values);
  if (problem) return problem;
  if (metric.unitKey && !(line.values[metric.unitKey] ?? "").trim()) return "Choose the unit.";
  return null;
}

/** The first problem with a row, files included (evidence is required), or null when it can be submitted. */
export function rowProblem(
  row: UploadRow,
  fileCount: number,
  metricOf: (id: string) => RowMetric | undefined,
): string | null {
  const own = lineProblem(row, metricOf(row.metricId));
  if (own) return own;
  if (row.mode === "each") {
    for (const [i, line] of row.more.entries()) {
      const problem = lineProblem(line, metricOf(line.metricId));
      if (problem) return `Bill ${i + 2}: ${problem.charAt(0).toLowerCase()}${problem.slice(1)}`;
    }
  }
  if (row.mode === "each") {
    const problem = pagesProblem([row, ...row.more]);
    if (problem) return problem;
  }
  if (fileCount === 0) return "Attach the evidence — every submission needs its document.";
  if ((row.mode === "pages_of_one" || row.mode === "total") && fileCount < 2) {
    return row.mode === "total"
      ? "Attach each bill: separate bills need a file each."
      : "Attach every page of the bill.";
  }
  return null;
}

const pageNumber = (text: string | undefined) => {
  const t = (text ?? "").trim();
  return /^\d+$/.test(t) && Number(t) >= 1 ? Number(t) : null;
};
const hasPages = (line: BillLine) => !!(line.pageFrom ?? "").trim() || !!(line.pageTo ?? "").trim();

/** Pages of the bills in one file: for all of them or none, each a valid range, none overlapping. */
export function pagesProblem(lines: BillLine[]): string | null {
  const given = lines.filter(hasPages);
  if (given.length === 0) return null;
  if (given.length !== lines.length) return "Give the pages of every bill in the file, or of none.";
  const owner = new Map<number, number>();
  for (const [i, line] of lines.entries()) {
    const from = pageNumber(line.pageFrom);
    const to = pageNumber(line.pageTo);
    if (from === null || to === null || to < from) {
      return `Bill ${i + 1}: enter its first and last page, the last not before the first.`;
    }
    for (let page = from; page <= to; page++) {
      const other = owner.get(page);
      if (other !== undefined) return `Bills ${other + 1} and ${i + 1} both include page ${page}.`;
      owner.set(page, i);
    }
  }
  return null;
}

/** The declarations a row sends with its upload (bundles.completeUpload). */
export function declarationsOf(row: UploadRow): {
  metricId: string;
  reportingPeriodId: string;
  mode: DeclarationMode;
  values: Record<string, string>;
  pageFrom?: number;
  pageTo?: number;
}[] {
  const paged = row.mode === "each" && [row, ...row.more].every(hasPages);
  const one = (line: BillLine, mode: DeclarationMode) => ({
    metricId: line.metricId,
    reportingPeriodId: line.periodId,
    mode,
    values: Object.fromEntries(Object.entries(line.values).map(([k, v]) => [k, v.trim()])),
    ...(paged ? { pageFrom: pageNumber(line.pageFrom)!, pageTo: pageNumber(line.pageTo)! } : {}),
  });
  if (row.mode === "each") return [row, ...row.more].map((line) => one(line, "bill"));
  if (row.mode === "pages_of_one" || row.mode === "total") return [one(row, row.mode)];
  return [one(row, "bill")];
}

/** A row kept in a draft: everything but its files. Anything malformed is dropped on the way back. */
export function rowsFromDraft(data: unknown, validPeriods: Set<string>): UploadRow[] {
  if (!Array.isArray(data)) return [];
  const text = (v: unknown) => (typeof v === "string" ? v.slice(0, 500) : "");
  const values = (v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([, x]) => typeof x === "string")
            .map(([k, x]) => [k, (x as string).slice(0, 50)]),
        )
      : {};
  const line = (v: Record<string, unknown>): BillLine => ({
    id: text(v.id) || crypto.randomUUID(),
    metricId: text(v.metricId),
    periodId: validPeriods.has(text(v.periodId)) ? text(v.periodId) : "",
    values: values(v.values),
    pageFrom: text(v.pageFrom).slice(0, 3),
    pageTo: text(v.pageTo).slice(0, 3),
  });
  const modes: RowMode[] = ["one", "pages_of_one", "total", "each"];
  return data
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .slice(0, MAX_ROWS)
    .map((v) => ({
      ...line(v),
      mode: modes.includes(v.mode as RowMode) ? (v.mode as RowMode) : "one",
      more: Array.isArray(v.more)
        ? v.more.filter((x): x is Record<string, unknown> => !!x && typeof x === "object").map(line)
        : [],
      description: text(v.description),
    }));
}

/** Whether a row holds anything worth keeping in a draft. */
export function rowTouched(row: UploadRow): boolean {
  return (
    !!row.metricId ||
    !!row.description.trim() ||
    Object.values(row.values).some((v) => v.trim()) ||
    row.more.length > 0
  );
}
