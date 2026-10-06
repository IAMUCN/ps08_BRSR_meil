# Grill: Audit fixes P0-1 to P0-3 (factors, SEBI-format report, 2023 indicator codes)

Date: 2026-10-07

From the final implementation audit (`AUDIT_FIXES.md`). The owner asked for the P0 items except deployment
(P0-4), which waits until the app is finished.

## What the owner decided (asked 2026-10-07)

- **Factor values:** "I propose, you approve." A table of proposed values with sources is prepared; nothing is
  entered anywhere until the owner approves it.
- **Turnover, PPP rate, assurance:** entered **once per financial year**, not per report.
- **The form for them:** the feature role adds a plain form on the Admin Reports page; the ui role may restyle it.

## P0-3 — Indicator codes follow SEBI's July-2023 BRSR format (migration `0033`, D25)

- Checked against a report filed in the new format (L&T FY 2025-26, `ps_documents/provided_docs`), not from memory:
  employees are question 20, CSR question 24, GHG Principle 6 Essential 7, waste Essential 9, Scope 3 Leadership 2.
- Decision: **renumber in place** (`A-18`→`A-20`, `A-22`→`A-24`, `P6-E6`→`P6-E7`, `P6-E8`→`P6-E9`, `P6-L4`→`P6-L2`).
  Ids, mappings and the D18 "which value is reported" setting are untouched, so old report snapshots still resolve.
  `P1-E2`, `P3-E8`, `P6-E3`, `P8-E4` did not move. Question wording did not change.
- The code scheme stays `P6-E7` (principle, Essential/Leadership, number) rather than the audit's shorthand "Q7".
- Migration `0022` is not edited. BRSR Core (Annexure I, 9 attributes) is only partly covered — noted, not built.

## P0-2 — The report prints SEBI's tables

- **Three indicators get SEBI's layout** (`lib/reports/html.ts`, keyed by indicator code; any other indicator, or
  these three if an Admin renames them, falls back to the plain table): GHG (P6-E7), waste (P6-E9), Scope 3 (P6-L2).
  Parameter / Unit / current FY / previous FY; emissions in **metric tonnes of CO2 equivalent** (kilograms ÷ 1,000,
  arithmetic only); Scope 1 and Scope 2 as rows; intensity per rupee of turnover, adjusted for PPP, and per
  physical output; SEBI's assurance note under each table.
- **Every indicator now has a previous-year column.** The snapshot (version 2) stores the previous financial
  year's figures without their records. A single-period report has one column and prints "Financial-year reports
  only" in the intensity rows — turnover is annual.
- **Inputs no document holds** live in `org_settings` key `brsr_report_inputs`, one entry per financial year (D26):
  revenue from operations (₹ crore), PPP rate (₹ per international dollar), physical output and its unit, the
  assurance statement, an optional methodology note. Admin only, audited (`report_inputs.updated`).
  **Nothing is defaulted:** an empty input prints "Not provided".
- Intensity maths, checked against L&T's published figures in a unit test: per turnover = tCO2e ÷ ₹ crore;
  PPP-adjusted = tCO2e ÷ (₹ crore × 10 ÷ PPP rate), i.e. per million international dollars.
- **Methodology section** at the end: the boundary (org path and the number of org units under it), the method,
  **every conversion factor the reported calculations used** with its value, source, geography and dates, the
  inputs used, the assurance statement. GWP: the report says the GWPs are those of each factor's source — the app
  does not hold a break-up by gas, so it claims none.
- **Waste (P6-E9) is honest about what is captured.** The app holds the quantity on each disposal certificate.
  SEBI's break-up by waste category (A–H) and the recovered quantities are **not captured** and print as such;
  intensity is on waste disposed, and the row label says so. Capturing categories and recovery is a follow-up.

## P0-1 — Factor values: approved by the owner on 2026-10-07; entry on hosted still to do

The owner approved the table as proposed: CO2 only, with the stated densities. Factors go in through
`/admin/conversion-factors` by a signed-in Admin (never a migration, Phase 9; the audit trail names who entered
them), so they were **not** written into the hosted database directly.

| Activity | Value | Unit | Working |
|---|---|---|---|
| Grid electricity | 0.710 | kgCO2e per kWh | CEA Table S, 0.710 tCO2/MWh |
| Diesel | 2.651 | kgCO2e per L | 43.0 TJ/Gg × 74,100 kg/TJ = 3.186 kg/kg × 0.832 kg/L |
| Petrol | 2.287 | kgCO2e per L | 44.3 × 69,300 = 3.070 kg/kg × 0.745 kg/L |
| LPG | 2.985 | kgCO2e per kg | 47.3 × 63,100 |
| CNG | 2.693 | kgCO2e per kg | 48.0 × 56,100 (natural gas) |

- **Grid source:** CEA, _CO2 Baseline Database for the Indian Power Sector_, User Guide version 21.0 (November
  2025), Table S: weighted average emission factor of the Indian grid, FY 2024-25, including renewable generation.
  Read from the document on 2026-10-07.
- **Fuel source:** IPCC 2006 Guidelines for National Greenhouse Gas Inventories, Volume 2 (Energy), Chapter 1,
  Table 1.2 (default net calorific values) and Table 1.4 (default CO2 emission factors). All four rows were
  checked against the document on 2026-10-07.
- **Density** (diesel 0.832 kg/L, petrol 0.745 kg/L) is not an IPCC value; it is an assumption the owner approved.
- **All values are CO2 only** (no CH4/N2O), entered under the app's `kgCO2e` unit; each factor's notes must say so.
- Geography India; effective from 2024-04-01, so the previous financial year calculates too.
- **The hosted grid factor (0.02, "IPCC26", from 2026-09-01, used by no calculation) must be retired** before the new
  one is added: a new version starting earlier does not supersede it, and two active versions would overlap.
- **No Indian source found** for waste to landfill or spend-based business travel; those stay for the owner, and
  records of those activities stay "Not calculated yet" on hosted.

## Out of scope / follow-ups

- Waste by category and recovered quantities; disposal totalled by method (the treatment route is on each record).
- Break-up of emissions by gas; the optional sector intensity metric.
- Deployment (P0-4).
