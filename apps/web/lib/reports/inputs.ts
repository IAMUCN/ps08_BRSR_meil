// What the SEBI tables need that no source document holds: turnover, the PPP rate, physical output and the
// assurance statement, entered by an Admin once per financial year (.grill/audit-p0-decisions.md, D26).
// Stored in org_settings under REPORT_INPUTS_KEY as { "<FY start year>": FyInputs }. Pure — no server
// imports — so the renderer, the form and the tests share it. A value nobody entered stays null and prints
// as "Not provided"; it is never defaulted.

export const REPORT_INPUTS_KEY = "brsr_report_inputs";

export type FyInputs = {
  /** Revenue from operations, in ₹ crore. */
  turnoverCr: number | null;
  /** Purchasing power parity conversion rate: ₹ per international dollar (IMF). */
  pppRate: number | null;
  /** Net worth at the end of the year, in ₹ crore (BRSR Section A, CSR details; from the audited balance sheet). */
  netWorthCr: number | null;
  /** Physical output for the year, in physicalOutputUnit — the entity chooses the measure. */
  physicalOutput: number | null;
  physicalOutputUnit: string | null;
  /** The answer to SEBI's note: was there independent assessment / assurance, and by whom. */
  assurance: string | null;
  /** Anything the entity states about method: GWP set, consolidation approach, exclusions. */
  methodologyNote: string | null;
  /** Where the PPP rate came from (e.g. "IMF World Economic Outlook") and when it was read (2026-11-13). */
  pppSource?: string | null;
  /** YYYY-MM-DD. */
  pppAccessedOn?: string | null;
  /** The assurance provider and level, printed under each BRSR Core table (2026-11-13). */
  assurer?: string | null;
  assuranceLevel?: "reasonable" | "limited" | null;
  /** Why a figure moved from the previous year, by indicator code (SEBI tables only; 2026-11-13). */
  changeNotes?: Record<string, string>;
};

/** The SEBI tables a year-on-year note can be written for, in report order. */
export const CHANGE_NOTE_INDICATORS: [string, string][] = [
  ["P3-E11", "Safety incidents"],
  ["P6-E1", "Energy"],
  ["P6-E3", "Water withdrawal and consumption"],
  ["P6-E4", "Water discharge"],
  ["P6-E7", "Scope 1 and 2 emissions"],
  ["P6-E9", "Waste"],
  ["P6-L2", "Scope 3 emissions"],
  ["P8-E4", "Purchases from MSMEs and within India"],
];

export const EMPTY_INPUTS: FyInputs = {
  turnoverCr: null,
  pppRate: null,
  netWorthCr: null,
  physicalOutput: null,
  physicalOutputUnit: null,
  assurance: null,
  methodologyNote: null,
  pppSource: null,
  pppAccessedOn: null,
  assurer: null,
  assuranceLevel: null,
  changeNotes: {},
};

/** Revenue adjusted for PPP, in million international dollars: ₹ crore × 10⁷ ÷ rate ÷ 10⁶. */
/** Revenue in PPP million USD; null when the PPP rate is missing or not positive (a division by it). */
export const pppRevenueMnUsd = (turnoverCr: number, pppRate: number) =>
  pppRate > 0 ? (turnoverCr * 10) / pppRate : null;

/** A quantity per unit of a denominator; null when either side is missing or the denominator is not positive. */
export const intensity = (quantity: number | null, per: number | null | undefined) =>
  quantity === null || per === null || per === undefined || !(per > 0) ? null : quantity / per;
