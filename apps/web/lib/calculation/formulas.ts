// Formula definitions (schema §6.7, .grill/phase-13-role-modules-decisions.md). Pure: which verified fields
// a formula reads and what it does with them. `custom` stays reserved and is never evaluated.

export type FormulaDefinition =
  /**
   * The activity value times the factor. With `product`, the activity value is those verified fields
   * multiplied (travel: distance x passengers = passenger-km, migration 0077).
   */
  | { op: "multiply_by_factor"; product?: string[] }
  | { op: "subtract"; inputs: [string, string] }
  /** part ÷ whole × scale. 100 is a percentage; 1,000,000 a rate per million (LTIFR, migration 0041). */
  | { op: "percentage"; part: string; whole: string; scale: number };

/** Reads a stored formula_type + formula_definition; null when the pair isn't one this build evaluates. */
export function parseFormula(type: string, definition: unknown): FormulaDefinition | null {
  const def = (definition ?? {}) as Record<string, unknown>;
  const key = (v: unknown) => typeof v === "string" && v.length > 0;
  if (type === "direct_multiply") {
    // Version 1 of the travel formulas named the activity value itself; that is not a product.
    const inputs = Array.isArray(def.inputs)
      ? def.inputs.filter((k) => k !== "activity_value")
      : [];
    if (inputs.length >= 2 && inputs.every(key)) {
      return { op: "multiply_by_factor", product: inputs as string[] };
    }
    return { op: "multiply_by_factor" };
  }
  if (type === "subtract" && Array.isArray(def.inputs) && def.inputs.length === 2) {
    const [a, b] = def.inputs;
    if (key(a) && key(b)) return { op: "subtract", inputs: [a as string, b as string] };
  }
  if (type === "percentage" && key(def.part) && key(def.whole)) {
    const scale = typeof def.scale === "number" && def.scale > 0 ? def.scale : 100;
    return { op: "percentage", part: def.part as string, whole: def.whole as string, scale };
  }
  return null;
}

/** The field keys a formula reads, in the order the trace lists them. */
export function formulaInputs(formula: FormulaDefinition): string[] {
  if (formula.op === "subtract") return formula.inputs;
  if (formula.op === "percentage") return [formula.whole, formula.part];
  return formula.product ?? [];
}

/** The fields multiplied into the activity value (travel), or null. */
export function productInputs(formula: FormulaDefinition | null): string[] | null {
  return formula?.op === "multiply_by_factor" && formula.product ? formula.product : null;
}

/** The product of a product formula's verified inputs; null when one is missing or not a number. */
export function productOf(values: readonly (number | null)[]): number | null {
  if (values.length === 0 || values.some((v) => v === null)) return null;
  // Rounded to 6 decimals so 1150 x 6 is 6900, not 6899.999999.
  return Math.round((values as number[]).reduce((a, b) => a * b, 1) * 1e6) / 1e6;
}

/**
 * The field that is the record's activity value: the whole of a percentage, the first input of a
 * subtraction (total employees, water withdrawn). null = the single-number convention applies.
 */
export function activityInput(formula: FormulaDefinition | null): string | null {
  if (!formula || formula.op === "multiply_by_factor") return null;
  return formulaInputs(formula)[0] ?? null;
}

/** Applies a multi-input formula to verified values already in one unit. */
export function evaluate(
  formula: Extract<FormulaDefinition, { op: "subtract" | "percentage" }>,
  values: Record<string, number>,
): { ok: true; value: number } | { ok: false; reason: string } {
  if (formula.op === "subtract")
    return { ok: true, value: values[formula.inputs[0]] - values[formula.inputs[1]] };
  const whole = values[formula.whole];
  if (whole === 0)
    return {
      ok: false,
      reason: `The total is zero, so no ${formula.scale === 100 ? "percentage" : "rate"} can be derived.`,
    };
  return { ok: true, value: (values[formula.part] / whole) * formula.scale };
}
