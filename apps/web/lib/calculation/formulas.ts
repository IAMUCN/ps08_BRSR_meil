// Formula definitions (schema §6.7, .grill/phase-13-role-modules-decisions.md). Pure: which verified fields
// a formula reads and what it does with them. `custom` stays reserved and is never evaluated.

export type FormulaDefinition =
  | { op: "multiply_by_factor" }
  | { op: "subtract"; inputs: [string, string] }
  | { op: "percentage"; part: string; whole: string };

/** Reads a stored formula_type + formula_definition; null when the pair isn't one this build evaluates. */
export function parseFormula(type: string, definition: unknown): FormulaDefinition | null {
  const def = (definition ?? {}) as Record<string, unknown>;
  const key = (v: unknown) => typeof v === "string" && v.length > 0;
  if (type === "direct_multiply") return { op: "multiply_by_factor" };
  if (type === "subtract" && Array.isArray(def.inputs) && def.inputs.length === 2) {
    const [a, b] = def.inputs;
    if (key(a) && key(b)) return { op: "subtract", inputs: [a as string, b as string] };
  }
  if (type === "percentage" && key(def.part) && key(def.whole)) {
    return { op: "percentage", part: def.part as string, whole: def.whole as string };
  }
  return null;
}

/** The field keys a formula reads, in the order the trace lists them. */
export function formulaInputs(formula: FormulaDefinition): string[] {
  if (formula.op === "subtract") return formula.inputs;
  if (formula.op === "percentage") return [formula.whole, formula.part];
  return [];
}

/**
 * The field that is the record's activity value: the whole of a percentage, the first input of a
 * subtraction (total employees, water withdrawn). null = the single-number convention applies.
 */
export function activityInput(formula: FormulaDefinition | null): string | null {
  return formula ? (formulaInputs(formula)[0] ?? null) : null;
}

/** Applies a multi-input formula to verified values already in one unit. */
export function evaluate(
  formula: Exclude<FormulaDefinition, { op: "multiply_by_factor" }>,
  values: Record<string, number>,
): { ok: true; value: number } | { ok: false; reason: string } {
  if (formula.op === "subtract")
    return { ok: true, value: values[formula.inputs[0]] - values[formula.inputs[1]] };
  const whole = values[formula.whole];
  if (whole === 0)
    return { ok: false, reason: "The total is zero, so no percentage can be derived." };
  return { ok: true, value: (values[formula.part] / whole) * 100 };
}
