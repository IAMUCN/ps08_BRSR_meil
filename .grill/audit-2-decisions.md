# Grill: Closing the second audit (2026-10-08)

Date: 2026-10-08

The second audit (2026-10-07, repeated 2026-10-08, reported in chat) scored the app 72/100. The owner asked for
everything except deployment to be closed.

## What the owner decided (asked 2026-10-08)

- **The demo runs on the hosted project.** It needs a signed-in Admin; the owner will invite a second Admin for
  the agent to use. Not done yet — hosted is unchanged.
- **Upload-only stays.** No typed-entry form is added. The KT session speaks of "data entry forms" and the Master
  Approach forbids them; the owner keeps the Master Approach's rule. The answer to give an evaluator: a person
  uploads the document, confirms or corrects every value on the verify screen, and types values by hand only when
  OCR fails (manual exception).
- **Factors:** the agent researches published sources, enters the values on the **local** database, and lists them
  for the owner to review. Nothing goes to hosted without the owner.
- **Commits:** local commits on `feature`, not pushed.

## Factors entered on the local database

Entered through the app's Admin procedures as the local E2E Admin, effective from 2024-04-01. Every row was read
from the document named, on 2026-10-08 unless marked. **Indian-government sources** are CEA (grid) and the
Ministry of Steel. The India GHG Program papers are by WRI India, CII and TERI — India-specific, built with Indian
Railways, IOCL and airport data, but **not government publications**, dated 2015 and marked "for stakeholder
consultation"; no later India-specific edition was found. Fuel and coal values are IPCC defaults.

| Activity | Value (kgCO2e per) | Source | Read? |
|---|---|---|---|
| Grid electricity | 0.710 / kWh | CEA CO2 Baseline Database, User Guide v21.0, Table S | 2026-10-07 |
| Diesel, petrol, LPG, CNG | 2.651 / L, 2.287 / L, 2.985 / kg, 2.693 / kg | IPCC 2006 Vol 2 Ch 1, Tables 1.2 and 1.4 | 2026-10-07 |
| Coal: anthracite, bituminous, sub-bituminous, lignite | 2.625, 2.441, 1.816, 1.202 / kg | same IPCC tables | 2026-10-07 |
| LNG | 2.693 / kg | same IPCC tables (natural gas) | 2026-10-07 |
| R-32, R-134a, R-410A, SF6 | 677, 1,300, 1,923.5, 23,500 / kg | GHG Protocol GWP values v2.0 (Aug 2024), AR5 | 2026-10-07 |
| R-22 | 1,760 / kg | same document, AR5 | **search summary only** |
| Process CO2 | 1 / kg | identity: the statement gives the CO2 mass | n/a |
| Business travel, air | 0.121 / passenger-km | India GHG Program, air paper, 2015 | yes |
| Business travel, rail | 0.007837 / passenger-km | India GHG Program, rail paper, 2015 (non-suburban, 2014-15) | yes |
| Business travel, bus; commuting by bus | 0.015161 / passenger-km | India GHG Program, road paper, 2015 | yes |
| Road freight, light / medium / heavy truck | 0.3070, 0.5928, 0.7375 / vehicle-km | same road paper | yes |
| Steel purchased | 2.54 / kg | Ministry of Steel, Rajya Sabha Unstarred Q. 1429, 6 Dec 2024 | yes |
| Cement purchased | 0.63 / kg | NITI Aayog roadmap, **as quoted by CSE** "Cementing Transition" | the CSE report only |

Things the owner should know before accepting them:

- The rail paper itself uses **2.651 kg CO2 per litre of diesel**, citing IPCC — the same value as the approved
  diesel factor.
- **The bus factor is for intracity buses.** The source says it does not apply to intercity travel. It fits
  employee commuting; for business travel by bus it is an approximation and the factor's notes say so.
- **Steel and cement are sector-average production intensities**, used for material bought. A supplier's own
  figure is better where one exists.
- R-410A's 50/50 composition is the standard blend, not a value read from the GWP document.
- The India GHG Program's rail paper prints two years; the later one (2014-15) is used.

**No factor, and why:**

- **PNG** (per SCM): needs the gas's density or calorific value, which the supplier's bill states.
- **Purchased steam, heat and cooling:** the factor is the supplier's own.
- **Freight, commuting and travel by spend (per rupee), and waste:** no credible published Indian source was
  found. The distance-based activities above exist so these can be reported with a sourced factor instead. On
  local, waste and travel-by-spend still hold synthetic test factors (the end-to-end suite needs them); they must
  not be entered on hosted.

## Migration `0038` and the code with it

- **Activities as configuration** (the pattern of `0035`): process CO2 (Scope 1); purchased steam and purchased
  heat / cooling (Scope 2); road freight by light, medium and heavy truck, in and out, by distance (downstream
  transport becomes active — 6 of 10 Scope 3 categories); employee commuting by bus in passenger-km. The
  spend-based activities stay for existing records.
- **Air emissions other than GHG** (SEBI P6-E6): NOx, SOx and particulate matter as recorded amounts from a stack
  monitoring report — no factor, no calculation. New indicator `P6-E6`.
- **Process emissions** are one activity whose quantity is the CO2 mass a process statement gives. No MEIL process
  is named in any document, so nothing more specific is invented.
- **Waste (P6-E9):** an optional field "Waste category" on the certificate. The report fills SEBI's table from
  it and from the existing "Treatment route": generated by category A to H, recovered by operation, disposed by
  operation. Free text is read into SEBI's groups by `lib/reports/classify.ts`; **text that matches nothing is
  printed as "not stated", never guessed.** Optional, not required, so existing certificates still confirm.
- **Break-up by gas:** a factor version states the gases its value covers (`conversion_factor_versions.gases`,
  D30). The report groups each scope's total on it; a factor that does not say is shown as "gases not stated".
  It can be set on a version already in use — it is a disclosure, not part of the number.
- **Stationary, mobile, process, fugitive:** a Scope 1 activity says how it emits (`esg_metrics.emission_source`,
  D30). Combustion is split into stationary and mobile per record from the "Used in" field; a record that does
  not say is shown as "use not stated".
- **Consolidation table** in the report: each direct child of the reported org unit with its own roll-up, what is
  recorded on the node itself, and the total.
- **Part of a year:** a financial-year report whose periods cover fewer days than the year says how many, and
  from when to when.
- **Evidence guard** (D30): a record cannot become verified without a linked document, for every writer.
- **Normal cubic metres** (Master Approach §27): Nm3 converts to SCM by 288.15 / 273.15 and is accepted for PNG.
- **Factor names can be changed** (`factors.rename`, audited); the values of its versions cannot.
- **Deadline reminder** (PRD §32): written the first time a user's bell loads within three days of an open
  period's closing date, once per period. There is no scheduler; this is the simplest thing that works.
- **Scripts only from the app's own origin** (Content-Security-Policy `script-src 'self' 'unsafe-inline'`).
  Inline scripts stay allowed: Next's own bootstrap and the theme script need them; a nonce-based policy would
  force every page to render dynamically.
- Snapshot version 3. Reports generated earlier still open; their snapshot simply has no break-ups.

## Not built, and why

- **A typed-entry form:** the owner's decision above.
- **Energy in joules (P6-E1), water discharge by destination (P6-E4):** each needs data the app does not capture
  (calorific values per fuel with a source; discharge destination and treatment level). Outside the KT's core
  (Scope 1, 2, 3). Not started.
- **OCR for the new document types:** the worker has no keywords for a process statement, a steam invoice or a
  stack monitoring report, and no label for "waste category". The person picks the document type and types the
  value; nothing is guessed. A worker change means rebuilding and replacing the hosted container.
- **The industry's promised list of reports** is still not in the repository.
- **`ESG` and `consolidated` report types** (PRD §34): the one BRSR report now carries the consolidation table;
  no second format is built without knowing what it should contain.
