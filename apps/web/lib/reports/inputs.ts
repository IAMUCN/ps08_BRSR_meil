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
  /** Physical output for the year, in physicalOutputUnit — the entity chooses the measure. */
  physicalOutput: number | null;
  physicalOutputUnit: string | null;
  /** The answer to SEBI's note: was there independent assessment / assurance, and by whom. */
  assurance: string | null;
  /** Anything the entity states about method: GWP set, consolidation approach, exclusions. */
  methodologyNote: string | null;
};

export const EMPTY_INPUTS: FyInputs = {
  turnoverCr: null,
  pppRate: null,
  physicalOutput: null,
  physicalOutputUnit: null,
  assurance: null,
  methodologyNote: null,
};

/** Revenue adjusted for PPP, in million international dollars: ₹ crore × 10⁷ ÷ rate ÷ 10⁶. */
export const pppRevenueMnUsd = (turnoverCr: number, pppRate: number) => (turnoverCr * 10) / pppRate;

/** A quantity per unit of a denominator; null when either side is missing or the denominator is not positive. */
export const intensity = (quantity: number | null, per: number | null | undefined) =>
  quantity === null || per === null || per === undefined || !(per > 0) ? null : quantity / per;
