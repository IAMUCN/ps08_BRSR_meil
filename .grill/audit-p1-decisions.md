# Grill: Audit fixes P1 (Scope 1 and 3 activities, travel by mode, hierarchy in the database)

Date: 2026-10-07

From `AUDIT_FIXES.md`, section P1. Sources for what to add: PRD §20 and §22, and the KT session notes
(`ps_documents/provided_docs/KT_Session_Transcript_and_Context.md`), which name stationary and mobile
combustion, process and fugitive emissions (refrigerant bought), coal grades, PNG, supplier logistics, employee
commuting and travel by flight, train and bus.

## What the owner decided (asked 2026-10-07)

- **Business travel:** separate activities per mode, **measured by distance** (passenger-km), not by spend.
- **Scope 1:** coal **by grade** and refrigerant top-ups **by gas**.
- **New Scope 3 categories:** **weight** for cement and steel; **spend** for freight and employee commuting.

## Key decisions

- **One activity per thing that needs its own factor** (migration `0035`), as Phase 11 decided for grid and
  renewable electricity: the engine never chooses a factor from a value a person typed. So a flight, a train and a
  bus are three activities; each coal grade and each gas is its own. No engine change, no schema change.
- **Scope 1 added:** coal — anthracite, bituminous, sub-bituminous, lignite (kg; tonnes accepted); LNG (kg); PNG
  (SCM); refrigerant top-ups R-22, R-32, R-410A, R-134a and SF6 (kg). A top-up is taken as what leaked. The gas
  list is a starting set; another gas is one more configuration row.
- **Refrigerants are EHS evidence** (new category "Refrigerants & Gases"), not a Project Manager's fuel bill.
- **Stationary or mobile** is recorded, not calculated: every Scope 1 fuel, old and new, has an optional field
  "Used in (generator / vehicle / equipment)". The approved factors are CO2 only, where the two do not differ.
  A split in the dashboards or report is not built.
- **Process emissions are not seeded.** No MEIL process that emits (cement or steel making, for example) is
  identified in any document; adding one later is configuration.
- **Travel by distance:** Air, Rail and Bus/Road in km (passenger-km). **A ticket rarely prints the distance, so
  the person types it** during verification; the OCR still reads the ticket number and date. The old spend-based
  activity stays for existing records, renamed "Business Travel — other modes (spend)".
- **Scope 3 added and activated** (5 of 10 categories now active): purchased goods — cement and steel by weight;
  upstream transportation — freight invoices by amount; employee commuting — contractor transport invoices by
  amount. Other purchased goods are not covered.
- **Each new Scope 3 category is its own upload category** owned by the role holding the evidence ("Purchased
  Goods & Logistics" → Procurement, "Employee Commuting" → HR), as Business Travel was in Phase 12. The Procurement
  and Workforce categories stay non-emission modules — a Phase 13 database test holds that line and caught the
  first draft.
- **All new activities map to BRSR** (Scope 1 → P6-E7, Scope 3 → P6-L2), so the "no orphaned metrics" rule holds.
- **Units:** km (and spellings, pkm) and SCM added to the engine's unit table and the OCR worker's unit pattern.
  SCM is deliberately not convertible to litres. `EXTRACTOR_VERSION` `rules-11` (also keywords for the four new
  document types, and "net weight" / "distance" as quantity labels).
- **Hierarchy rules in the database** (migration `0034`, D27): a trigger refuses a child at the same or an earlier
  level than its parent, a group that is not the root, and a level change that would put a node at or after its
  children. A cycle needs no separate check — every step up the tree is a strictly earlier level, so no path can
  return to where it started (tested: moving a node under its descendant and making it its own parent both fail).

## Factor values for the new activities: proposed 2026-10-07, awaiting the owner's approval

Nothing is entered. The owner enters factors at `/admin/conversion-factors`. All values are CO2 only for fuels
(as the approved P0-1 factors are) and the gas's own global warming potential for refrigerants.

| Activity | Value | Per | Working and source |
|---|---|---|---|
| Coal — Anthracite | 2.625 kgCO2e | kg | 26.7 TJ/Gg × 98,300 kg/TJ — IPCC 2006 Vol 2 Ch 1, Tables 1.2 and 1.4 |
| Coal — Bituminous | 2.441 kgCO2e | kg | 25.8 × 94,600 ("Other Bituminous Coal") — same tables |
| Coal — Sub-bituminous | 1.816 kgCO2e | kg | 18.9 × 96,100 — same tables |
| Coal — Lignite | 1.202 kgCO2e | kg | 11.9 × 101,000 — same tables |
| LNG | 2.693 kgCO2e | kg | 48.0 × 56,100 (natural gas) — same tables |
| Refrigerant R-32 | 677 kgCO2e | kg | GWP of HFC-32, IPCC AR5, 100-year |
| Refrigerant R-134a | 1,300 kgCO2e | kg | GWP of HFC-134a, IPCC AR5 |
| Refrigerant R-410A | 1,923.5 kgCO2e | kg | half HFC-32 (677) and half HFC-125 (3,170) by mass, IPCC AR5 |
| SF6 | 23,500 kgCO2e | kg | GWP of sulphur hexafluoride, IPCC AR5 |

- **Read from the documents on 2026-10-07:** every coal and natural gas row (IPCC 2006), and the AR5 values for
  HFC-32, HFC-125, HFC-134a and SF6 (GHG Protocol, _IPCC Global Warming Potential Values_, version 2.0, August
  2024). The 50/50 composition of R-410A is from memory, not from a document read this session.
- **IPCC defaults are world averages.** Indian coal is mostly lower-grade; a supplier's own calorific value, where
  the invoice states it, would be more accurate than the default for its grade.
- **AR5 or AR6** is the owner's choice (AR6: HFC-32 771, HFC-125 3,740, HFC-134a 1,530, SF6 24,300); the report's
  methodology note should say which.
- **Not proposed, with the reason:**
  - **PNG (per SCM):** needs the gas's density or calorific value per SCM, which the supplier's bill states;
    2.693 kgCO2 per kg × that density. No value is assumed here.
  - **R-22:** an HCFC, absent from the table read. It is controlled under the Montreal Protocol and is normally
    reported separately from Scope 1; the owner should decide whether to keep the activity at all.
  - **Travel per passenger-km (air, rail, road), cement, steel, freight and commuting per rupee:** no source was
    read this session, and none is written from memory. Candidates for the owner to check: the India GHG Program's
    transport emission factors for travel; an Indian life-cycle or industry figure for cement and steel. A
    per-rupee factor for freight or commuting may have no Indian source at all.

## Not done / follow-ups

- **No factor exists for any new activity.** Until an Admin enters them with sources, their records show "Not
  calculated yet". Refrigerant factors are the gases' global warming potentials.
- No real document of any new kind has been tried; OCR on them is untested beyond units.
- Stationary/mobile split in dashboards; process emissions; other purchased goods; downstream logistics.
