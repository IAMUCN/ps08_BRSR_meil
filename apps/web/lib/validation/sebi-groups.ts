// SEBI's tables group records by what a person wrote on them (water source, waste category, treatment route,
// discharge destination and treatment). Text that matches no group is printed as "not stated" (classify.ts); this
// flags it at validation so it is put right before approval (owner's request, 2026-11-13). Pure.

import {
  dischargeDestination,
  dischargeTreated,
  treatmentLevel,
  wasteCategory,
  wasteRoute,
  waterSource,
} from "../reports/classify.ts";

/** The problems with one record's grouping fields; empty when every table can place it. */
export function sebiGroupProblems(
  metricCode: string,
  valueOf: (key: string) => string | null,
  dischargeKl: number | null,
): string[] {
  const problems: string[] = [];
  const said = (key: string) => valueOf(key)?.trim() || null;
  if (metricCode === "WATER_CONSUMPTION") {
    const source = said("source_classification");
    if (source && !waterSource(source)) {
      problems.push(
        `Water source "${source}" is not one of SEBI's (surface water, groundwater, third party, seawater, other).`,
      );
    }
    if ((dischargeKl ?? 0) > 0) {
      const destination = said("discharge_destination");
      if (!dischargeDestination(destination)) {
        problems.push(
          destination
            ? `Discharge destination "${destination}" is not one of SEBI's (surface water, groundwater, seawater, third party, other).`
            : "Water was discharged but where it went is not stated.",
        );
      }
      const treatment = said("discharge_treatment");
      const treated = dischargeTreated(treatment);
      if (treated === null)
        problems.push("Water was discharged but whether it was treated is not stated.");
      else if (treated && !treatmentLevel(treatment)) {
        problems.push(
          `Treatment "${treatment}" names no level (primary, secondary or tertiary), which SEBI's table asks for.`,
        );
      }
    }
  }
  if (metricCode === "WASTE_DISPOSED") {
    const category = said("waste_category");
    if (category && !wasteCategory(category)) {
      problems.push(`Waste category "${category}" is not one of SEBI's categories A to H.`);
    }
    const route = said("source_classification");
    if (route && !wasteRoute(route)) {
      problems.push(
        `Treatment route "${route}" is not one of SEBI's (recycled, re-used, other recovery, incineration, landfilling, other disposal).`,
      );
    }
  }
  return problems;
}
