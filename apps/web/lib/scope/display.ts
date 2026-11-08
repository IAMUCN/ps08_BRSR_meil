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

/**
 * One figure to draw a bar from (feature_enhancement.md 8.2): emission totals in kgCO2e and tCO2e are added up
 * in tonnes; otherwise the first unit is drawn and the others are named, never added to it. Null when there is
 * nothing approved.
 */
export function barValue(
  totals: { unit: string; approved: number }[],
): { value: number; unit: string; leftOut: string[] } | null {
  const withData = totals.filter((t) => t.approved !== 0);
  if (withData.length === 0) return null;
  const tonnes = (unit: string) => {
    const u = unit.trim().toLowerCase();
    return u === "kgco2e" ? 1 / 1000 : u === "tco2e" ? 1 : null;
  };
  if (withData.every((t) => tonnes(t.unit) !== null))
    return {
      value: withData.reduce((sum, t) => sum + t.approved * tonnes(t.unit)!, 0),
      unit: "tCO2e",
      leftOut: [],
    };
  const [first, ...rest] = withData;
  return { value: first.approved, unit: first.unit, leftOut: rest.map((t) => t.unit) };
}
