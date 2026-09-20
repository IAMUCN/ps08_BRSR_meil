// The stored calculation as the UI shows it (UI brief §12.5 "input → factor → output", §14 drill-down).
// Plain types and formatting only — no server imports, so client components can use them.

export type CalculationTrace = {
  inputValue: number;
  inputUnit: string;
  normalizedValue: number;
  normalizedUnit: string;
  factorValue: number | null;
  factorInputUnit: string | null;
  factorOutputUnit: string | null;
  factorName: string | null;
  factorVersion: number | null;
  factorSource: string | null;
  resultValue: number;
  resultUnit: string;
  scopeName: string | null;
  engineVersion: string;
  calculatedAt: string;
};

/** What a record's calculation looks like right now: done, waiting on configuration, or not applicable. */
export type CalculationState = {
  trace: CalculationTrace | null;
  /** Why there is no calculation yet, taken from the engine's last attempt. */
  blockedReason: string | null;
};

/** Numbers in a trace are data, not prose: full precision up to 6 decimals, grouped for reading. */
export function formatQuantity(value: number, unit: string): string {
  const formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 6 })
    .formatToParts(value)
    .map((p) => p.value)
    .join("");
  return `${formatted} ${unit}`;
}
