// Energy for BRSR P6-E1 (owner's request, 2026-11-13; .grill/brsr-gaps-decisions.md). Electricity and heat
// convert to joules by a physical constant; fuel needs its calorific value (energy per litre or kilogram), which
// is configuration: a conversion factor named `ENERGY:<activity code>` whose result unit is GJ, entered with its
// source and approved like any factor. The calculation of emissions never reads these: it looks factors up by
// the activity's own code.

/** The activity type a calorific value is stored under. */
export const ENERGY_PREFIX = "ENERGY:";
export const energyKey = (metricCode: string) => `${ENERGY_PREFIX}${metricCode}`;
export const isEnergyKey = (activityType: string) => activityType.startsWith(ENERGY_PREFIX);
export const metricOfEnergyKey = (activityType: string) => activityType.slice(ENERGY_PREFIX.length);

/** kWh to GJ: 1 kWh = 3.6 MJ. */
export const GJ_PER_KWH = 0.0036;

/** Where an activity's energy goes in SEBI's P6-E1 table. Null: not energy. */
export type EnergyRow = { renewable: boolean; kind: "electricity" | "fuel" | "other" };
export function energyRowOf(
  metricCode: string,
  scopeCode: string | null,
  categoryName: string | null,
): EnergyRow | null {
  if (metricCode === "RENEWABLE_ELECTRICITY") return { renewable: true, kind: "electricity" };
  if (metricCode === "GRID_ELECTRICITY") return { renewable: false, kind: "electricity" };
  if (metricCode === "PURCHASED_STEAM" || metricCode === "PURCHASED_HEAT_COOLING") {
    return { renewable: false, kind: "other" };
  }
  // Fuels burnt on site: Scope 1 Fuel & Energy (diesel, petrol, CNG, LPG, LNG, PNG, coal). None is renewable.
  if (scopeCode === "SCOPE_1" && categoryName === "Fuel & Energy") {
    return { renewable: false, kind: "fuel" };
  }
  return null;
}

/**
 * Values proposed for the Conversion Factors form (owner's choice: "I propose"): IPCC 2006 Guidelines, Volume 2,
 * Chapter 1, Table 1.2 default net calorific values. Nothing is stored from here: a Super Admin saves one as a
 * draft and another approves it. Per-litre values multiply IPCC's per-kilogram value by a density that IPCC does
 * not give, stated in the note so it can be checked. PNG (per standard cubic metre) and steam have no proposal:
 * they need the supplier's own figures.
 */
export const PROPOSED_CALORIFIC_VALUES: Record<
  string,
  { value: number; inputUnit: string; note: string }
> = {
  DIESEL_CONSUMPTION: {
    value: 0.035776,
    inputUnit: "L",
    note: "Gas/Diesel Oil NCV 43.0 TJ/Gg (= 0.0430 GJ/kg) x density 0.832 kg/L — the density implied by the diesel emission factor of 2.651 kgCO2e/L. Check the density against your supplier's.",
  },
  PETROL_CONSUMPTION: {
    value: 0.033004,
    inputUnit: "L",
    note: "Motor Gasoline NCV 44.3 TJ/Gg (= 0.0443 GJ/kg) x density 0.745 kg/L (typical for Indian petrol; not an IPCC value). Check the density against your supplier's.",
  },
  LPG_CONSUMPTION: {
    value: 0.0473,
    inputUnit: "kg",
    note: "Liquefied Petroleum Gases NCV 47.3 TJ/Gg.",
  },
  CNG_CONSUMPTION: { value: 0.048, inputUnit: "kg", note: "Natural Gas NCV 48.0 TJ/Gg." },
  LNG_CONSUMPTION: { value: 0.048, inputUnit: "kg", note: "Natural Gas NCV 48.0 TJ/Gg." },
  COAL_ANTHRACITE: { value: 0.0267, inputUnit: "kg", note: "Anthracite NCV 26.7 TJ/Gg." },
  COAL_BITUMINOUS: {
    value: 0.0258,
    inputUnit: "kg",
    note: "Other Bituminous Coal NCV 25.8 TJ/Gg.",
  },
  COAL_SUB_BITUMINOUS: {
    value: 0.0189,
    inputUnit: "kg",
    note: "Sub-Bituminous Coal NCV 18.9 TJ/Gg.",
  },
  COAL_LIGNITE: { value: 0.0119, inputUnit: "kg", note: "Lignite NCV 11.9 TJ/Gg." },
};
export const PROPOSED_SOURCE = {
  reference:
    "IPCC 2006 Guidelines for National Greenhouse Gas Inventories, Vol. 2, Ch. 1, Table 1.2 (default net calorific values)",
  publisher: "IPCC",
  url: "https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_1_Ch1_Introduction.pdf",
};
