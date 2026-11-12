// Typed values against the document (owner's request, 2026-11-12; .grill/row-upload-decisions.md). Pure and
// with relative imports: the Upload page, Verify, the server and the validation engine (plain Node) share it.
//
// A person types each bill's values on the Upload page before OCR has read it; OCR then reads the evidence.
// Two independent readings of one bill: where they agree the value counts as checked, where they differ the
// person must choose on Verify, and keeping the typed value against the document's is flagged for review.

import { normalize } from "../calculation/units.ts";

export type DeclarationMode = "bill" | "pages_of_one" | "total";

/** Numbers as people type them ("1,250.00"); null when it isn't a non-negative number. */
export function readNumber(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  const cleaned = text.replace(/[\s,]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Decimal places as written: "12.50" is 2, "1,250" is 0. */
export function decimalsOf(text: string): number {
  const cleaned = text.replace(/[\s,]/g, "");
  const dot = cleaned.indexOf(".");
  return dot < 0 ? 0 : cleaned.length - dot - 1;
}

/** A value with the unit it is in (null = no unit, or a count). */
export type Reading = { text: string; unit: string | null };

/**
 * Whether two written values are the same amount. Converted to one unit where both units are known and
 * measure the same thing (0.85 KL is 850 L). Then the agreed allowance (owner, 2026-11-12): a gap of 1 in the
 * last decimal place of the less precise of the two, so 12.35 and 12.34 match. Whole numbers must be equal
 * (6 passengers are not 7); a whole number against a decimal one is a match when it is the rounding of it.
 * null when either is not a number, or the units can't be compared (litres against kilograms).
 */
export function sameAmount(a: Reading, b: Reading): boolean | null {
  const x = readNumber(a.text);
  const y = readNumber(b.text);
  if (x === null || y === null) return null;
  let converted = x;
  if (a.unit && b.unit && a.unit.trim().toLowerCase() !== b.unit.trim().toLowerCase()) {
    const n = normalize(x, a.unit, b.unit);
    if (!n.ok) return null;
    converted = n.normalized.value;
  }
  const places = Math.min(decimalsOf(a.text), decimalsOf(b.text));
  // Whole numbers have no decimal place to be 1 out in: 6 passengers and 7 are different. A whole number
  // against a decimal one only allows rounding (14,210 and 14,210.4).
  const precise = Math.max(decimalsOf(a.text), decimalsOf(b.text));
  const allowance = places > 0 ? 10 ** -places : precise > 0 ? 0.5 : 0;
  return Math.abs(converted - y) <= allowance + 1e-9 * Math.max(1, Math.abs(y));
}

export type TypedStatus = "match" | "mismatch" | "not_read";

/** One typed number against what OCR read for the same field. */
export function typedStatus(typed: Reading, read: Reading | null): TypedStatus {
  if (!read || readNumber(read.text) === null) return "not_read";
  return sameAmount(typed, read) === true ? "match" : "mismatch";
}

/**
 * Whether the value confirmed on Verify needs a reviewer, for one typed field of a bill:
 * - the document was read: the confirmed value must be the document's. A typed value kept against the
 *   document's, or a third value, is flagged — so is a reading where both were the same and the person
 *   then changed it.
 * - the document gave nothing: the confirmed value must be the typed one.
 * Returns the reason when flagged, else null.
 */
export function confirmedProblem(input: {
  label: string;
  typed: Reading;
  read: Reading | null;
  confirmed: Reading;
}): string | null {
  const { label, typed, read, confirmed } = input;
  const show = (r: Reading) => `${r.text}${r.unit ? ` ${r.unit}` : ""}`;
  if (read && readNumber(read.text) !== null) {
    if (sameAmount(confirmed, read) === true) return null;
    return sameAmount(confirmed, typed) === true
      ? `${label}: ${show(typed)} was typed at upload and kept, but the document reads ${show(read)}.`
      : `${label}: confirmed as ${show(confirmed)}; the document reads ${show(read)} and ${show(typed)} was typed at upload.`;
  }
  if (sameAmount(confirmed, typed) === true) return null;
  return `${label}: ${show(typed)} was typed at upload but ${show(confirmed)} was confirmed, and the document gave no value to check either against.`;
}

/**
 * A total typed for several separate bills against those bills. `bills` holds each bill's best value so far:
 * the confirmed one, else what OCR read, else null (not read yet). Converted to the typed unit.
 * Returns: "waiting" while a bill has no value; else whether the sum matches, and the sum.
 */
export function totalStatus(
  typed: Reading,
  bills: (Reading | null)[],
): { status: "waiting" } | { status: "match" | "mismatch"; sum: number; places: number } {
  let sum = 0;
  let places = decimalsOf(typed.text);
  for (const bill of bills) {
    const value = bill ? readNumber(bill.text) : null;
    if (!bill || value === null) return { status: "waiting" };
    let converted = value;
    if (
      bill.unit &&
      typed.unit &&
      bill.unit.trim().toLowerCase() !== typed.unit.trim().toLowerCase()
    ) {
      const n = normalize(value, bill.unit, typed.unit);
      if (!n.ok) return { status: "mismatch", sum: Number.NaN, places };
      converted = n.normalized.value;
    }
    sum += converted;
    places = Math.min(places, decimalsOf(bill.text));
  }
  const rounded = Math.round(sum * 1e6) / 1e6;
  const same = sameAmount(typed, { text: String(rounded), unit: typed.unit });
  return { status: same ? "match" : "mismatch", sum: rounded, places };
}

// --- Declared bills against the bills OCR found --------------------------------------------------------

/** A bill the person declared on the Upload page (a row or a sub-row), in their order. */
export type DeclaredBill = {
  index: number;
  metricId: string;
  periodId: string;
  mode: DeclarationMode;
};

/** A bill the worker found in the upload, in page order. */
export type FoundBill = {
  index: number;
  /** The activity OCR took it to be; null when it could not tell. */
  metricId: string | null;
  /** The reporting period its billing period points to; null when unreadable. */
  periodId: string | null;
};

export type BillMatch = {
  /** For each found bill, the declared bill it is (index into declared), or null: not declared. */
  assignment: (number | null)[];
  /** Declared bills no found bill was matched to. */
  unmatched: number[];
  /** True when every found bill has a declared bill and every declared bill a found one. */
  clean: boolean;
};

/**
 * Pairs the bills found in one upload with the bills declared for it.
 * - "pages of one bill": the whole upload is that one bill (the caller merges the pages).
 * - "total": every found bill belongs to the one declaration.
 * - otherwise one to one: the same activity and period first, then the same period, then the same activity,
 *   then in order. An activity OCR is sure of that differs from the declared one still pairs (it is flagged
 *   as a category mismatch on Verify), but only when nothing better is left.
 */
export function matchBills(declared: DeclaredBill[], found: FoundBill[]): BillMatch {
  if (declared.length === 1 && declared[0].mode !== "bill") {
    return {
      assignment: found.map(() => 0),
      unmatched: found.length ? [] : [0],
      clean: found.length > 0,
    };
  }
  const assignment: (number | null)[] = found.map(() => null);
  const taken = new Set<number>();
  const passes: ((d: DeclaredBill, f: FoundBill) => boolean)[] = [
    (d, f) => d.metricId === f.metricId && d.periodId === f.periodId,
    (d, f) => d.periodId === f.periodId && f.metricId === null,
    (d, f) => d.metricId === f.metricId && f.periodId === null,
    (d, f) => f.metricId === null && f.periodId === null,
    (d, f) => d.periodId === f.periodId,
    (d, f) => d.metricId === f.metricId,
    () => true,
  ];
  for (const fits of passes) {
    for (const f of found) {
      if (assignment[f.index] !== null) continue;
      const d = declared.find((x) => !taken.has(x.index) && fits(x, f));
      if (d) {
        assignment[f.index] = d.index;
        taken.add(d.index);
      }
    }
  }
  const unmatched = declared.filter((d) => !taken.has(d.index)).map((d) => d.index);
  return {
    assignment,
    unmatched,
    clean: unmatched.length === 0 && assignment.every((a) => a !== null),
  };
}

// --- Which fields a row asks for --------------------------------------------------------------------

export type EntryField = { key: string; label: string };

/**
 * The values a row asks for: every required number field of the activity, in the order given (quantity for
 * most, distance and passengers for travel, the counts of a workforce statement). The unit is chosen
 * separately.
 */
export function entryFieldsOf(
  requirements: { key: string; label: string; dataType: string; required: boolean }[],
): EntryField[] {
  return requirements
    .filter((r) => r.dataType === "number" && r.required)
    .map((r) => ({ key: r.key, label: r.label }));
}

/** The unit spellings shown in a row's unit list, from the activity's allowed units. */
const PREFERRED: Record<string, string> = {
  l: "L",
  kl: "KL",
  kg: "kg",
  t: "tonne",
  mt: "tonne",
  tonne: "tonne",
  tonnes: "tonne",
  inr: "INR",
  km: "km",
  scm: "SCM",
  nm3: "Nm3",
  kwh: "kWh",
  mwh: "MWh",
  m3: "m³",
  "m³": "m³",
};

export function unitChoices(allowed: string[], metricUnit: string): string[] {
  const nice = new Set<string>();
  for (const unit of allowed) {
    const shown = PREFERRED[unit.trim().toLowerCase().replace(/\./g, "")];
    if (shown) nice.add(shown);
  }
  const first = PREFERRED[metricUnit.trim().toLowerCase()] ?? metricUnit;
  const list = nice.size ? [...nice] : allowed.length ? [...new Set(allowed)] : [metricUnit];
  return [first, ...list.filter((u) => u !== first)].filter((u, i, all) => all.indexOf(u) === i);
}

/** The first problem with one row's typed values, or null. */
export function entryProblem(fields: EntryField[], values: Record<string, string>): string | null {
  for (const field of fields) {
    const text = (values[field.key] ?? "").trim();
    if (!text) return `Type the ${field.label.toLowerCase()}.`;
    if (readNumber(text) === null) return `${field.label}: enter a number, e.g. 1250.50.`;
  }
  return null;
}
