// Unit normalisation (TRD §27): a supported-unit table and pure functions, no database lookup. These are
// physical constants (1 KL = 1000 L), not policy — conversion *factors*, which are policy, live in
// `conversion_factor_versions` and are never hard-coded. Spellings match what Phase 8's allowed-units rule
// accepts, so anything validation lets through, calculation can normalise.

/** How many canonical units one of the written unit is worth. */
const UNITS: Record<string, { canonical: string; multiplier: number }> = {
  // Volume → litres
  l: { canonical: "L", multiplier: 1 },
  ltr: { canonical: "L", multiplier: 1 },
  ltrs: { canonical: "L", multiplier: 1 },
  litre: { canonical: "L", multiplier: 1 },
  litres: { canonical: "L", multiplier: 1 },
  liter: { canonical: "L", multiplier: 1 },
  liters: { canonical: "L", multiplier: 1 },
  kl: { canonical: "L", multiplier: 1000 },
  kilolitre: { canonical: "L", multiplier: 1000 },
  kilolitres: { canonical: "L", multiplier: 1000 },
  // Mass → kilograms (CNG and LPG are billed by weight)
  kg: { canonical: "kg", multiplier: 1 },
  kgs: { canonical: "kg", multiplier: 1 },
  kilogram: { canonical: "kg", multiplier: 1 },
  kilograms: { canonical: "kg", multiplier: 1 },
  t: { canonical: "kg", multiplier: 1000 },
  mt: { canonical: "kg", multiplier: 1000 },
  tonne: { canonical: "kg", multiplier: 1000 },
  tonnes: { canonical: "kg", multiplier: 1000 },
  // Currency, for spend-based activities (Scope 3 business travel). Not a physical constant: an
  // identity mapping of the spellings an invoice prints, so a spend factor (kgCO2e per rupee) applies.
  inr: { canonical: "INR", multiplier: 1 },
  rs: { canonical: "INR", multiplier: 1 },
  rupees: { canonical: "INR", multiplier: 1 },
  // Energy → kilowatt-hours
  kwh: { canonical: "kWh", multiplier: 1 },
  units: { canonical: "kWh", multiplier: 1 },
  unit: { canonical: "kWh", multiplier: 1 },
  mwh: { canonical: "kWh", multiplier: 1000 },
};

export type Normalized = { value: number; unit: string };

const key = (unit: string) => unit.trim().toLowerCase().replace(/\./g, "");

/**
 * Converts a verified value into the metric's canonical unit. Returns a reason instead of a number when
 * the unit is unknown or belongs to another quantity — calculation stops, it never guesses (Phase 9 DoD).
 */
export function normalize(
  value: number,
  unit: string,
  canonicalUnit: string,
): { ok: true; normalized: Normalized } | { ok: false; reason: string } {
  const from = UNITS[key(unit)];
  if (!from) {
    return { ok: false, reason: `Unit "${unit}" is not a unit this engine can convert.` };
  }
  const target = UNITS[key(canonicalUnit)];
  if (!target || target.canonical !== from.canonical) {
    return {
      ok: false,
      reason: `Unit "${unit}" cannot be converted to the metric's unit "${canonicalUnit}".`,
    };
  }
  return {
    ok: true,
    normalized: { value: (value * from.multiplier) / target.multiplier, unit: canonicalUnit },
  };
}

/** True when a factor's input unit measures the same quantity as the normalised value's unit. */
export function sameQuantity(a: string, b: string): boolean {
  const x = UNITS[key(a)];
  const y = UNITS[key(b)];
  return !!x && !!y && x.canonical === y.canonical;
}
