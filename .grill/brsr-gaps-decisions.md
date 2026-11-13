# Gaps against the L&T BRSR (2026-11-13)

The owner shared a gap list (tables L&T has that the report lacked, notes and assurance, and formula issues), had
every item checked against the code and hosted, and said "do all of them". D60, A61, migrations `0085`–`0087`.

## The owner's answers (asked 2026-11-13)

1. **SEBI's tables no document carries** (workforce, women, turnover rate, locations, markets, complaints, payable
   days, related parties, well-being, retirement, parental leave, training, wages): **typed tables with Excel
   import.**
2. **Zero values:** **allowed, flagged for review.**
3. **Calorific values for energy in GJ:** **configuration, the agent proposes** (nothing counts until approved).
4. **Approval % on the Control Tower:** **kept as it is** (approved ÷ validated).

## What was built

### Stage 1: formulas
- **Zero** (`0085`): the global range rule is `min: 0` with `flag_zero`. A zero passes the format check and goes to
  the Validation Queue ("…is zero — confirm the document really shows no usage"). Negatives still fail. A key on
  the existing check, not a new check type: code from before the migration ignores the key (a zero then just
  passes), where an unknown check type would flag every record.
- **Anomaly check:** a zero median no longer gives "Infinity×": zero again is in line; anything else, or a zero
  against a usual level, is flagged with a plain sentence.
- **PPP:** `pppRevenueMnUsd` returns nothing for a rate that is not positive.
- **Capex payback:** `paysBackOnlyWithCarbon` when the savings alone never pay back but the carbon value does; the
  Carbon Credits screen says "Pays back only with the carbon value" (engine, router and simulator).

### Stage 2: energy (P6-E1)
- **Units:** kJ, MJ, GJ, TJ convert to and from kWh (1 kWh = 3.6 MJ).
- **Calorific values** are conversion factors named `ENERGY:<activity>` with result unit GJ: the same source,
  financial-year and Super Admin approval steps. The emission engine looks factors up by the activity's own code,
  so it never reads them. Offered for every fuel and steam whose unit is not already energy.
- **Proposed values** (`lib/energy/calorific.ts`, shown on the form, never stored by themselves): IPCC 2006 Vol. 2
  Ch. 1 Table 1.2 default NCVs — LPG 0.0473, natural gas (CNG, LNG) 0.048, anthracite 0.0267, other bituminous
  0.0258, sub-bituminous 0.0189, lignite 0.0119 GJ/kg; diesel 0.035776 GJ/L (43.0 TJ/Gg × 0.832 kg/L, the density
  the diesel emission factor implies); petrol 0.033004 GJ/L (44.3 TJ/Gg × 0.745 kg/L, a typical density, not
  IPCC's). PNG (per SCM) and steam: no proposal — they need the supplier's figures.
- **The table:** renewable / non-renewable × electricity / fuel / other sources, totals, intensity per ₹ crore,
  PPP-adjusted and per output, both years. Electricity: grid non-renewable, renewable renewable. Fuel: Scope 1
  Fuel & Energy (all non-renewable today). Other: purchased steam, heat and cooling. Approved records with no
  approved calorific value are left out and named under the table.

### Stage 3: water, waste, procurement
- **P6-E3:** withdrawal by SEBI's five sources (read from the water record's source), total withdrawal, total
  consumption (withdrawn less discharged) and its intensities.
- **P6-E4:** under "With treatment", the level (primary / secondary / tertiary), read from the treatment text
  people already enter (RO and UF are tertiary; STP, ETP, MBBR and SBR secondary).
- **P6-E9:** under each recovery and disposal operation, the tonnes per category.
- **P8-E4:** "Directly sourced from MSMEs" and "Directly from within India" as % of purchases (the second over the
  statements that state it).
- **Required fields** (`0086`): water source; waste category and treatment route; MSME's within-India spend. Two
  database tests from earlier work held them optional and were updated.
- **Flag:** text these tables can't place (an unknown source, category or route; a discharge with no destination,
  no treatment, or treated with no level) is a review flag at validation, so it is put right before approval.

### Stage 4: notes and assurance
- Per financial year, with the other report inputs (no migration): PPP source and the date read; the assurance
  provider and level (reasonable / limited), printed under each BRSR Core table; a "reason for the change from the
  previous year" for each of the eight computed tables, printed under it.

### Stage 5: typed tables (`0087`)
- 17 questions laid out as SEBI's tables (`lib/brsr-tables/definitions.ts`): A-18, A-19, A-20 (both parts), A-21,
  A-22 (three years), A-25, P1-E8, P1-E9, P3-E1 (a, b, c), P3-E2, P3-E5, P3-E8, P3-E13, P5-E3, P5-E6, P5-E7, P8-E5.
  Totals and percentages are worked out, never stored or typed.
- BRSR Disclosures has a "SEBI tables" section: each table editable, with a note under it; **Download Excel** (one
  workbook, a sheet per table, filled with what is saved) and **Import from Excel** (every sheet saved together;
  a sheet whose rows or columns were moved is refused, naming the row).
- Who: as for written answers — Super Admins all; HR and Finance the questions migration `0081` gives them.
- The report prints each table for the years it asks for, newest first, with its note.

## Decisions made while building (confirm)
1. Calorific values are physical constants, so a first value may be entered for an earlier year (the factor rule
   already allows a first entry back in time).
2. Petrol's density (0.745 kg/L) is a typical value, not IPCC's; the form says so.
3. All fuels are non-renewable (no biofuel activity exists); a renewable fuel would need a new activity.
4. Typed tables are printed one financial year per block, not side by side.
5. A-20 and P3-E8 are "data" questions with no `owning_permission`, so only a Super Admin types them today.
6. The yearly review on Conversion Factors does not list calorific values (they rarely change).

## Not done / not run
- Hosted: `0085`, `0086`, `0087` are not applied. They are additive or configuration; order with the code is free
  except that `0086` makes four fields required for whoever verifies next.
