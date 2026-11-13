// Validation checks (PRD §29, Master Approach §23; .grill/phase-8-validation-engine-decisions.md).
// Pure functions, one section per rule category. Which checks apply to which metric, their parameters and
// their severity are configuration (validation_rules rows, migration 0015) — nothing here is per-metric.

export type RuleType = "format" | "organizational" | "period" | "evidence" | "logical" | "anomaly";
export type Outcome = "pass" | "fail" | "flagged";
export type Severity = "hard_fail" | "flag";

export const RULE_TYPES: { key: RuleType; label: string }[] = [
  { key: "format", label: "Format" },
  { key: "organizational", label: "Organizational" },
  { key: "period", label: "Period" },
  { key: "evidence", label: "Evidence" },
  { key: "logical", label: "Logical" },
  { key: "anomaly", label: "Anomaly" },
];

/** A check's verdict before severity is applied; `forceFlag` = "can't tell, a person should look". */
export type Verdict = { ok: boolean; message: string; forceFlag?: boolean };

/** Failing configured checks take the rule's severity; `forceFlag` verdicts are always review flags. */
export function outcomeOf(verdict: Verdict, severity: Severity): Outcome {
  if (verdict.ok) return "pass";
  if (verdict.forceFlag) return "flagged";
  return severity === "hard_fail" ? "fail" : "flagged";
}

/** Record status from all results (plan Phase 8): any fail → failed; else any flag → flagged. */
export function aggregate(outcomes: Outcome[]): "validated" | "flagged" | "failed" {
  if (outcomes.includes("fail")) return "failed";
  if (outcomes.includes("flagged")) return "flagged";
  return "validated";
}

const numberFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
export const formatNumber = (value: number) =>
  numberFormat
    .formatToParts(value)
    .map((part) => part.value)
    .join("");

// --- Format ------------------------------------------------------------------------------------

export type FieldValue = {
  key: string;
  label: string;
  dataType: string;
  required: boolean;
  value: string | null;
};

export function parseNumber(text: string | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[\s,]/g, "");
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
}

/** Built-in: every required field has a value and number fields are numbers. */
export function checkFormat(fields: FieldValue[]): Verdict {
  const problems: string[] = [];
  for (const field of fields) {
    const value = field.value?.trim() ?? "";
    if (!value) {
      if (field.required) problems.push(`${field.label} is missing`);
      continue;
    }
    if (field.dataType === "number" && parseNumber(value) === null) {
      problems.push(`${field.label} "${value}" is not a number`);
    }
  }
  return problems.length
    ? { ok: false, message: `${problems.join("; ")}.` }
    : { ok: true, message: "All required fields are present and well-formed." };
}

// --- Organizational ----------------------------------------------------------------------------

/** Built-in: the project/site still exists, is active, and is inside the submitter's assignments. */
export function checkOrganizational(input: {
  orgUnitName: string;
  active: boolean;
  inSubmitterScope: boolean;
}): Verdict {
  if (!input.active) {
    return {
      ok: false,
      message: `${input.orgUnitName} is deactivated — records can't be accepted for it.`,
    };
  }
  if (!input.inSubmitterScope) {
    return {
      ok: false,
      message: `${input.orgUnitName} is outside the submitter's current assignment.`,
    };
  }
  return {
    ok: true,
    message: `${input.orgUnitName} is active and within the submitter's assignment.`,
  };
}

// --- Period ------------------------------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "05-Sep-2026", "01/08/2026", "5.9.26" → UTC date, or null. Day first, as on Indian documents. */
export function parseDate(text: string): Date | null {
  const match = text.trim().match(/^(\d{1,2})[-/. ]([A-Za-z]{3,9}|\d{1,2})[-/. ](\d{2}|\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = /^\d+$/.test(match[2])
    ? Number(match[2]) - 1
    : MONTHS.indexOf(match[2].slice(0, 3).toLowerCase());
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCMonth() === month ? date : null; // rejects 31-Feb
}

/** A single billing date or a "from to until" range; null when it can't be read. */
export function parseBillingPeriod(text: string | null): { start: Date; end: Date } | null {
  if (!text?.trim()) return null;
  const parts = text.split(/\s*(?:\bto\b|\btill\b|\buntil\b|–|—|\s-\s)\s*/i).filter(Boolean);
  if (parts.length === 1) {
    const date = parseDate(parts[0]);
    return date ? { start: date, end: date } : null;
  }
  if (parts.length !== 2) return null;
  const [start, end] = parts.map(parseDate);
  return start && end && start <= end ? { start, end } : null;
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const dayLabel = (date: Date) =>
  `${String(date.getUTCDate()).padStart(2, "0")} ${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;

/** Configured `billing_period_overlap`: the billing date/range must touch the reporting period. */
export function checkBillingPeriodOverlap(
  billingText: string | null,
  period: { label: string; startDate: string; endDate: string },
): Verdict {
  const billing = parseBillingPeriod(billingText);
  if (!billing) {
    return {
      ok: false,
      forceFlag: true,
      message: `Couldn't read the billing date "${billingText ?? ""}" — review it against the document.`,
    };
  }
  const start = new Date(`${period.startDate}T00:00:00Z`);
  const end = new Date(`${period.endDate}T00:00:00Z`);
  const shown =
    billing.start.getTime() === billing.end.getTime()
      ? dayLabel(billing.start)
      : `${dayLabel(billing.start)} – ${dayLabel(billing.end)}`;
  if (billing.end < start || billing.start > end) {
    return {
      ok: false,
      message: `Billing period ${shown} is outside ${period.label} — correct the date or upload the document in the right period.`,
    };
  }
  return { ok: true, message: `Billing period ${shown} falls in ${period.label}.` };
}

/** Configured `duplicate_invoice`: other verified records with the same invoice number. */
export function checkDuplicateInvoice(
  invoice: string | null,
  matches: number,
  where: string,
): Verdict {
  if (!invoice?.trim()) return { ok: true, message: "No invoice number to compare." };
  return matches > 0
    ? {
        ok: false,
        message: `Invoice number ${invoice.trim()} is already recorded ${matches === 1 ? "once" : `${matches} times`} for ${where}.`,
      }
    : {
        ok: true,
        message: `Invoice number ${invoice.trim()} is not recorded elsewhere for ${where}.`,
      };
}

/**
 * Built-in (Phase 3): OCR found that the document clearly looks like another activity's type than the one
 * chosen at upload. A review flag: the reviewer returns it as the wrong activity, or accepts it.
 */
export function checkDocumentKind(
  suggestion: { typeName: string; activities: string[] } | null,
  chosenActivity: string,
): Verdict {
  if (!suggestion) {
    return { ok: true, message: `The document matches ${chosenActivity}.` };
  }
  const activities = suggestion.activities.length
    ? ` (used for ${suggestion.activities.join(", ")})`
    : "";
  const likely = suggestion.activities.length
    ? ` It may belong to ${suggestion.activities.join(" or ")}.`
    : "";
  return {
    ok: false,
    forceFlag: true,
    message: `Category mismatch: this looks like ${/^[aeiou]/i.test(suggestion.typeName) ? "an" : "a"} ${suggestion.typeName}${activities}, suggested by OCR, but it was uploaded as ${chosenActivity}.${likely} If the activity is wrong, return it as the wrong activity.`,
  };
}

/** Another record a new one is compared with, named so a reviewer can find it. */
export type OtherRecord = {
  metricName: string;
  orgUnitName: string;
  periodLabel: string;
  submittedBy: string;
  /** ISO date the other record's document was uploaded. */
  uploadedOn: string;
};

function describe(other: OtherRecord): string {
  return `${other.metricName} for ${other.orgUnitName}, ${other.periodLabel}, uploaded by ${other.submittedBy} on ${other.uploadedOn}`;
}

/**
 * Built-in (migration 0056): uploaded after the period's due date. Always a review flag, never a failure: a
 * person decides in the Validation Queue whether the late record is accepted.
 */
export function checkLate(input: { late: boolean; dueOn: string; uploadedOn: string }): Verdict {
  return input.late
    ? {
        ok: false,
        forceFlag: true,
        message: `Late submission: due on ${input.dueOn}, uploaded on ${input.uploadedOn}.`,
      }
    : { ok: true, message: `Uploaded on time (due on ${input.dueOn}).` };
}

/**
 * Built-in: the identical file (same SHA-256) is evidence for another record that is still live, in any
 * period. A file name is never compared. A re-upload of the record it replaces is not a duplicate.
 */
export function checkSameFile(others: OtherRecord[]): Verdict {
  if (others.length === 0) return { ok: true, message: "No other record has this exact file." };
  const more = others.length > 1 ? ` (and ${others.length - 1} more)` : "";
  return {
    ok: false,
    forceFlag: true,
    message: `Same file as ${describe(others[0])}${more}.`,
  };
}

/**
 * Configured `duplicate_invoice` (owner's rule of 2026-11-07): another live record of the same activity with
 * the same bill number and, where both have one, the same billing period — in any unit and any period. A
 * scan and a photo of one bill are caught here, where the file fingerprints differ.
 */
export function checkSameBill(billNumber: string | null, others: OtherRecord[]): Verdict {
  if (!billNumber?.trim()) return { ok: true, message: "No bill number to compare." };
  if (others.length === 0) {
    return { ok: true, message: `Bill number ${billNumber.trim()} is not recorded elsewhere.` };
  }
  const more = others.length > 1 ? ` (and ${others.length - 1} more)` : "";
  return {
    ok: false,
    message: `Looks like the same bill (no. ${billNumber.trim()}) as ${describe(others[0])}${more}.`,
  };
}

/** Configured `duplicate_period`: another verified record for the same project, period and activity. */
export function checkDuplicatePeriod(matches: number, what: string, where: string): Verdict {
  return matches > 0
    ? {
        ok: false,
        message: `${matches === 1 ? "Another" : `${matches} other`} ${what} ${matches === 1 ? "record already exists" : "records already exist"} for ${where}.`,
      }
    : { ok: true, message: `First ${what} record for ${where}.` };
}

// --- Evidence ----------------------------------------------------------------------------------

/** Built-in: evidence is attached and was read by OCR; hand-entered values are always reviewed. */
export function checkEvidence(input: { attached: boolean; manualException: boolean }): Verdict {
  if (!input.attached) return { ok: false, message: "No evidence document is attached." };
  if (input.manualException) {
    return {
      ok: false,
      forceFlag: true,
      message:
        "Values were entered manually — the document could not be read. Review against the file.",
    };
  }
  return { ok: true, message: "Evidence is attached and was read by OCR." };
}

// --- Logical -----------------------------------------------------------------------------------

/** Configured `range`: bounds on a numeric field. */
export function checkRange(
  value: number | null,
  label: string,
  bounds: { min?: number; min_exclusive?: number; max?: number; flag_zero?: boolean },
): Verdict {
  if (value === null) return { ok: false, message: `${label} is not a number.` };
  // A zero is accepted but a person confirms it (owner's decision, 2026-11-13; migration 0085): a month with
  // no usage is real, and so is a misread amount.
  if (bounds.flag_zero && value === 0) {
    return {
      ok: false,
      forceFlag: true,
      message: `${label} is zero — confirm the document really shows no usage for this period.`,
    };
  }
  if (bounds.min_exclusive !== undefined && !(value > bounds.min_exclusive)) {
    return {
      ok: false,
      message: `${label} must be greater than ${formatNumber(bounds.min_exclusive)}.`,
    };
  }
  if (bounds.min !== undefined && value < bounds.min) {
    return { ok: false, message: `${label} must be at least ${formatNumber(bounds.min)}.` };
  }
  if (bounds.max !== undefined && value > bounds.max) {
    return { ok: false, message: `${label} must be at most ${formatNumber(bounds.max)}.` };
  }
  return { ok: true, message: `${label} ${formatNumber(value)} is within the allowed range.` };
}

/** Configured `not_greater_than`: a part can't exceed its whole (women ≤ total, discharge ≤ withdrawal). */
export function checkNotGreaterThan(
  part: { label: string; value: number | null },
  whole: { label: string; value: number | null },
): Verdict {
  if (part.value === null || whole.value === null) {
    return { ok: false, message: `${part.label} and ${whole.label} must both be numbers.` };
  }
  return part.value > whole.value
    ? {
        ok: false,
        message: `${part.label} (${formatNumber(part.value)}) is more than ${whole.label} (${formatNumber(whole.value)}).`,
      }
    : { ok: true, message: `${part.label} is within ${whole.label}.` };
}

/** Configured `allowed_units`: the unit must be one of the configured spellings (case-insensitive). */
export function checkAllowedUnits(
  unit: string | null,
  allowed: string[],
  metricName: string,
): Verdict {
  const value = unit?.trim() ?? "";
  if (allowed.some((u) => u.toLowerCase() === value.toLowerCase())) {
    return { ok: true, message: `Unit ${value} is valid for ${metricName}.` };
  }
  return {
    ok: false,
    message: `Unit "${value || "(empty)"}" isn't valid for ${metricName} — use one of ${allowed.join(", ")}.`,
  };
}

// --- Anomaly -----------------------------------------------------------------------------------

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Configured `history_ratio`: compare with the median of this project's validated records for the same
 * activity in prior periods. Too little history passes — there is nothing to compare against yet.
 */
export function checkHistoryRatio(
  value: number | null,
  history: { periodId: string; value: number }[],
  params: { max_ratio: number; min_periods: number },
): Verdict {
  const periods = new Set(history.map((h) => h.periodId)).size;
  if (value === null) return { ok: true, message: "No value to compare with history." };
  if (periods < params.min_periods) {
    return {
      ok: true,
      message: `Not enough history to compare (${periods} of ${params.min_periods} periods).`,
    };
  }
  const typical = median(history.map((h) => h.value));
  // A usual level of zero can't be a ratio (it used to read "Infinity×"): zero again is in line, anything
  // else is worth a look.
  if (typical === 0) {
    return value === 0
      ? { ok: true, message: `Zero, as in this project's history (${periods} periods).` }
      : {
          ok: false,
          message: `${formatNumber(value)} where this project's usual level is zero (median over ${periods} periods).`,
        };
  }
  if (value === 0) {
    return {
      ok: false,
      message: `Zero where this project's usual level is ${formatNumber(typical)} (median over ${periods} periods).`,
    };
  }
  const ratio = value / typical;
  if (ratio > params.max_ratio || ratio < 1 / params.max_ratio) {
    const factor = ratio >= 1 ? `${ratio.toFixed(1)}× above` : `${(1 / ratio).toFixed(1)}× below`;
    return {
      ok: false,
      message: `${formatNumber(value)} is ${factor} this project's usual level (median ${formatNumber(typical)} over ${periods} periods).`,
    };
  }
  return {
    ok: true,
    message: `In line with this project's history (median ${formatNumber(typical)} over ${periods} periods).`,
  };
}
