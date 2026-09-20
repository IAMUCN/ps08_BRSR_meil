// How a scope total reads on screen. No server imports — client components use it too.

const number = (value: number, maximumFractionDigits: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits })
    .formatToParts(value)
    .map((p) => p.value)
    .join("");

/**
 * A total in its stored unit. For a kilogram unit the tonne figure follows in brackets — 1 t = 1000 kg is
 * arithmetic, not an emission factor, so the engine's result is untouched and only the reading changes
 * (.grill/phase-10-scope-1-decisions.md).
 */
export function formatTotal(value: number, unit: string): string {
  const stored = `${number(value, 2)} ${unit}`;
  const trimmed = unit.trim();
  const isKilograms = trimmed.slice(0, 2).toLowerCase() === "kg";
  if (!isKilograms || Math.abs(value) < 1000) return stored;
  return `${stored} (${number(value / 1000, 3)} t${trimmed.slice(2)})`;
}

/** Short form for a table cell or a bar label. */
export const formatCompact = (value: number, unit: string) => `${number(value, 2)} ${unit}`;
