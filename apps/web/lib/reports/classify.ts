// Reads the free text a person verified on a document ("Used in: DG set", "Treatment route: Landfill",
// "Waste category: E-waste") into the groups SEBI's tables ask for. Text that matches nothing is returned as
// null and the report prints it as "not stated" — it is never guessed into a group.

export type CombustionUse = "stationary" | "mobile";

const MOBILE =
  /vehicle|truck|car\b|cars\b|bus\b|fleet|transport|tipper|dumper|tanker|mobile|two.?wheeler/i;
const STATIONARY =
  /generator|genset|\bdg\b|boiler|furnace|kiln|heater|pump|compressor|equipment|plant|canteen|kitchen|stationary/i;

/** Stationary or mobile combustion, from the "Used in" field of a fuel record. */
export function combustionUse(text: string | null | undefined): CombustionUse | null {
  if (!text?.trim()) return null;
  if (MOBILE.test(text)) return "mobile";
  if (STATIONARY.test(text)) return "stationary";
  return null;
}

/** SEBI's waste categories (Principle 6, Essential Indicator 9), in the order of its table. */
export const WASTE_CATEGORIES = [
  ["A", "Plastic waste"],
  ["B", "E-waste"],
  ["C", "Bio-medical waste"],
  ["D", "Construction and demolition waste"],
  ["E", "Battery waste"],
  ["F", "Radioactive waste"],
  ["G", "Other hazardous waste"],
  ["H", "Other non-hazardous waste"],
] as const;
export type WasteCategory = (typeof WASTE_CATEGORIES)[number][0];

export function wasteCategory(text: string | null | undefined): WasteCategory | null {
  const t = text?.trim().toLowerCase();
  if (!t) return null;
  // "A" … "H" typed as the letter itself.
  if (/^[a-h]$/.test(t)) return t.toUpperCase() as WasteCategory;
  if (/plastic/.test(t)) return "A";
  if (/e-?\s?waste|electronic/.test(t)) return "B";
  if (/bio-?\s?medical/.test(t)) return "C";
  if (/construction|demolition|c\s?&\s?d\b|debris/.test(t)) return "D";
  if (/batter/.test(t)) return "E";
  if (/radio-?active/.test(t)) return "F";
  // "non-hazardous" contains "hazardous": test it first.
  if (/non-?\s?hazardous/.test(t)) return "H";
  if (/hazardous/.test(t)) return "G";
  return null;
}

/** SEBI's recovery and disposal operations, in the order of its table. */
export const WASTE_ROUTES = [
  ["recovered", "recycled", "Recycled"],
  ["recovered", "reused", "Re-used"],
  ["recovered", "other_recovery", "Other recovery operations"],
  ["disposed", "incineration", "Incineration"],
  ["disposed", "landfilling", "Landfilling"],
  ["disposed", "other_disposal", "Other disposal operations"],
] as const;
export type WasteRoute = (typeof WASTE_ROUTES)[number][1];

export function wasteRoute(text: string | null | undefined): WasteRoute | null {
  const t = text?.trim().toLowerCase();
  if (!t) return null;
  if (/recycl/.test(t)) return "recycled";
  if (/re-?\s?use/.test(t)) return "reused";
  if (/recover|compost|co-?\s?process/.test(t)) return "other_recovery";
  if (/inciner/.test(t)) return "incineration";
  if (/land-?\s?fill/.test(t)) return "landfilling";
  if (/dispos|tsdf|treatment/.test(t)) return "other_disposal";
  return null;
}

/** SEBI's water-discharge destinations (Principle 6, Essential Indicator 4), in the order of its table. */
export const DISCHARGE_DESTINATIONS = [
  ["surface", "To surface water"],
  ["ground", "To groundwater"],
  ["sea", "To seawater"],
  ["third_party", "Sent to third parties"],
  ["other", "Others"],
] as const;
export type DischargeDestination = (typeof DISCHARGE_DESTINATIONS)[number][0];

export function dischargeDestination(text: string | null | undefined): DischargeDestination | null {
  const t = text?.trim().toLowerCase();
  if (!t) return null;
  if (/sea|marine|ocean/.test(t)) return "sea";
  if (/ground|bore|recharge|soak|percolat/.test(t)) return "ground";
  if (/surface|river|lake|stream|canal|nala|nallah|pond|storm/.test(t)) return "surface";
  if (/third|municipal|sewer|sewage|cetp|tanker|common effluent/.test(t)) return "third_party";
  if (/other|land|irrigation|garden|green belt/.test(t)) return "other";
  return null;
}

/** Whether the water was treated before discharge: "None" / "Untreated" is no; a stated level is yes. */
export function dischargeTreated(text: string | null | undefined): boolean | null {
  const t = text?.trim().toLowerCase();
  if (!t) return null;
  if (/^(no|none|nil|na|n\/a)\b|untreated|no treatment|without treatment/.test(t)) return false;
  return true;
}

/** How far discharged water was treated (SEBI asks for the level), from the same treatment text. */
export const TREATMENT_LEVELS = [
  ["primary", "Primary treatment"],
  ["secondary", "Secondary treatment"],
  ["tertiary", "Tertiary treatment"],
] as const;
export type TreatmentLevel = (typeof TREATMENT_LEVELS)[number][0];

export function treatmentLevel(text: string | null | undefined): TreatmentLevel | null {
  const t = text?.trim().toLowerCase();
  if (!t || dischargeTreated(t) === false) return null;
  // The highest level named wins: "secondary and tertiary" is tertiary.
  if (/tertiary|\bro\b|reverse osmosis|ultra-?\s?filtration|\buf\b|advanced/.test(t))
    return "tertiary";
  if (/secondary|biological|activated sludge|\bstp\b|\betp\b|mbbr|sbr/.test(t)) return "secondary";
  if (/primary|settling|sedimentation|screening|oil.?(and|&).?grease/.test(t)) return "primary";
  return null;
}

/** SEBI's water-withdrawal sources (Principle 6, Essential Indicator 3), in the order of its table. */
export const WATER_SOURCES = [
  ["surface", "Surface water"],
  ["ground", "Groundwater"],
  ["third_party", "Third party water"],
  ["sea", "Seawater / desalinated water"],
  ["other", "Others"],
] as const;
export type WaterSource = (typeof WATER_SOURCES)[number][0];

export function waterSource(text: string | null | undefined): WaterSource | null {
  const t = text?.trim().toLowerCase();
  if (!t) return null;
  if (/sea|desal|marine|ocean/.test(t)) return "sea";
  if (/ground|bore|tube.?well|well\b|aquifer/.test(t)) return "ground";
  if (
    /third|municipal|corporation|board|jal|supply|tanker|utility|authority|piped|metro water/.test(
      t,
    )
  ) {
    return "third_party";
  }
  if (/surface|river|lake|reservoir|canal|dam|stream|pond|rain/.test(t)) return "surface";
  if (/other/.test(t)) return "other";
  return null;
}
