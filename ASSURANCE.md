# TraceESG — How the system supports assurance on BRSR Core KPIs

**What this document is.** SEBI requires listed entities to obtain independent assessment or assurance on a
defined set of key indicators, "BRSR Core". An assurer does not take a number on trust: they pick a reported
figure and ask where it came from, who checked it, and whether it could have been changed. This document
describes, KPI by KPI and control by control, what TraceESG gives them. It is written from what the system
does today; where a KPI is not yet evidence-backed it says so.

_Prepared 2026-10-09 against the repository at 41 database migrations. Sources for the KPI list: SEBI's BRSR
format as printed in the L&T FY2025-26 reference report (`ps_documents/provided_docs`), including the list of
Core KPIs in its assurance statement. SEBI's own BRSR Core annexure is not in the repository — confirm the
list against it before relying on this for a filing._

---

## 1. The principle: a figure is only as good as its evidence

Every measured figure in TraceESG starts as an uploaded document and passes through fixed stages. Nothing
reaches a report by being typed into a total.

```
Document  →  OCR proposal  →  Person verifies  →  Validation  →  Calculation  →  Second person approves  →  Roll-up  →  Report
```

Each arrow leaves a record that cannot be removed. The rest of this document is what an assurer can do with
those records.

## 2. The controls an assurer relies on

| What the assurer needs to know | How TraceESG provides it | Where to see it |
|---|---|---|
| **The figure has a source document** | A record cannot exist without an uploaded file, and cannot be verified without one (a database rule, not only a screen rule). Supporting files can be added. | Verify screen; Reports → Evidence for the financial year |
| **The document is the one that was uploaded** | Each file's SHA-256 fingerprint is computed on the server at upload and re-checked every time the file is read. A file that no longer matches is refused. | Evidence route; `documents.file_hash` |
| **The value matches the document** | OCR proposes each field with a confidence score. A person must confirm it; low-confidence and critical fields block confirmation until reviewed. Every edit keeps the extracted value, the confirmed value, who and when. | Verify screen; record history |
| **Nobody approved their own entry** | The person who uploaded or verified a record cannot approve it. Enforced in the application and in the database. | Approval queue; audit trail |
| **Obvious errors were caught** | Automatic checks on every record: required fields, allowed units, billing period inside the reporting period, duplicate invoice numbers, duplicate bills for a month, a part larger than its whole, and an anomaly check against the project's own history. Failures return to the submitter; flags go to an Admin with a recorded decision. | Validation result on each record; Validation Queue |
| **The calculation is reproducible** | A fixed formula: quantity × the factor in force for that period. The factor value used is stored with the result. The same record and factor always give the same number. | Calculation trace on each record |
| **The emission factor is justified and unchanged** | Factors are versioned with a source reference and dates. A version that any calculation has used can never be edited (the database refuses). Past periods keep the factor that applied then. | Admin → Conversion Factors; the report's methodology section |
| **Nothing was altered afterwards** | Calculations are append-only. The audit log is append-only for every role, including the server: no update, delete or truncate. Each entry records the user, before and after values, network address, browser and sign-in session. | Admin → Audit Trail (filter, expand, export CSV) |
| **The total is the sum of its parts** | Roll-ups read approved records only, through one definition used by dashboards and reports alike. Percentages and rates are recomputed from summed counts, never averaged. Records awaiting approval are shown beside the total, not in it. | Scope dashboards; Data Explorer; report consolidation table |
| **The report is frozen** | Generating a report stores a snapshot: every reported value, the records behind it, and the exact calculation each used. Later changes do not alter a generated report. Every run, including failed ones, is kept. | Reports → Past reports; Report detail |
| **The period was controlled** | Reporting periods are opened and closed by an Admin; reopening one needs a written reason and is audited. | Admin → Reporting Periods |
| **Access was restricted** | Accounts are created by an Admin only. A user sees and submits only for their own org units and their role's activities. Every table has row-level security and the browser has no write access to any of them. | Users; Roles & Permissions; `SECURITY_REVIEW.md` |

## 3. BRSR Core KPIs: what is evidence-backed today

"Evidence-backed" means the figure is produced by the pipeline in section 1 and every control in section 2
applies. "Typed" means an Admin enters the answer on BRSR Disclosures: the change is audited (who, when, old
and new text), but there is no source document, verification or calculation behind it.

| BRSR Core attribute | KPI | BRSR question | Status | Source evidence | How the figure is produced |
|---|---|---|---|---|---|
| Greenhouse gas footprint | Total Scope 1 emissions | P6-E7 | **Evidence-backed** | Fuel invoices, refrigerant and SF6 top-up records, process statements | Quantity × versioned factor, summed over approved records; broken up by gas and by source (stationary, mobile, process, fugitive) |
| | Total Scope 2 emissions | P6-E7 | **Evidence-backed** | Electricity bills, renewable certificates, steam / heat invoices | kWh × grid factor (CEA); renewable kept separate |
| | Emission intensity (per rupee of turnover, PPP-adjusted, per output) | P6-E7 | **Evidence-backed numerator**; denominator typed | Turnover, PPP rate and output entered once per year by an Admin | Total ÷ the entered denominator; an empty denominator prints "Not provided" |
| Water footprint | Total water consumption; water consumption intensity | P6-E3 | **Evidence-backed** | Water bills, meter records | Withdrawal − discharge |
| | Water discharge by destination and level of treatment | P6-E4 | **Evidence-backed** (destination and treatment are typed by the verifier on the record) | Water record | Verified discharge volume, grouped; "not stated" where the record does not say |
| Energy footprint | Total energy consumed; % from renewable sources; energy intensity | P6-E1 | **Typed** | — | Not calculated: the fuel and electricity quantities are captured, but calorific values to convert them to joules are not |
| Embracing circularity | Waste generated by category; waste recovered and disposed by route; waste intensity | P6-E9 | **Evidence-backed** | Waste disposal certificates and manifests | Verified weight, grouped by SEBI category A to H and by route; "not stated" where the certificate does not say |
| Employee well-being and safety | Safety incidents: LTIFR, recordable injuries, fatalities, high-consequence injuries | P3-E11 | **Evidence-backed** | Safety incident statements, employees and workers separately | LTIFR = lost time injuries ÷ person-hours × 1,000,000, recomputed from totals on roll-up |
| | Spending on well-being measures as % of revenue | P3-E1(c) | **Typed** | — | — |
| Gender diversity | Gross wages paid to females as % of wages paid | P5-E3(b) | **Typed** | — | — |
| | Complaints on sexual harassment (POSH) | P5-E7 | **Typed** | — | — |
| Inclusive development | Input material sourced from MSMEs / small producers | P8-E4 | **Evidence-backed** (MSME share); sourcing from within India not captured | Procurement statements | MSME spend ÷ total spend, from summed amounts |
| | Job creation in smaller towns (wages by location) | P8-E5 | **Typed** | — | — |
| Fairness with customers and suppliers | Instances of data breaches; % involving customer data | P9-E7 | **Typed** | — | — |
| | Number of days of accounts payable | P1-E8 | **Typed** | — | — |
| Open-ness of business | Concentration of purchases and sales with trading houses, dealers and related parties; loans and investments with related parties | P1-E9 | **Typed** | — | — |

**Count:** of the Core KPIs listed, the greenhouse gas, water, waste, safety and MSME figures are
evidence-backed. Energy and the wage, complaint, payables and related-party KPIs are typed. Scope 3 (P6-L2) is
evidence-backed in the system but is a leadership indicator, outside BRSR Core.

## 4. How an assurer tests a figure in TraceESG

Worked example: _"Total Scope 1 emissions, FY 2026-27: 215.7 tCO2e."_

1. **Open the report** (Admin → Reports → Past reports → Open). The Scope 1 row shows the total, its break-up
   by gas and by source, and the number of records behind it.
2. **Select the figure.** The side panel lists every contributing record: project, document, value.
3. **Pick a sample record.** The panel shows the calculation the report used: verified quantity, unit,
   the factor's name, version, value and source, the result, and the engine version.
4. **Open the document.** The original invoice opens beside the extracted fields. Compare the quantity on the
   invoice with the verified value; see whether a person edited the OCR value and who.
5. **Check the factor.** Admin → Conversion Factors shows the version, its source reference and dates, and
   that it is locked because calculations used it.
6. **Check the approvals.** The record's audit history lists upload, extraction, each field confirmation,
   validation result, calculation, queueing and approval, each with the user, time, network address and
   session. The uploader and the approver are different people.
7. **Re-perform the total.** Admin → Data Explorer, filtered to Scope 1 and the financial year, exports every
   record with its value; the sum of approved records equals the report's figure.
8. **Check completeness.** Submission Monitoring → missing submissions lists expected submissions with nothing
   filed, per org unit and period — what is _not_ in the total.

The same eight steps apply to Scope 2, water, waste, safety incidents and MSME sourcing.

## 5. What can be handed to an assurer

| Item | From |
|---|---|
| The report as filed (PDF), with methodology, boundary and factor sources | Reports → Past reports → Download PDF |
| Every evidence file for the financial year, with its record, project, period and status | Reports → Evidence for the year |
| Every record with its values and status (CSV) | Submission Monitoring; Data Explorer |
| The audit trail, filtered by user, action, record or dates (CSV) | Audit Trail |
| A single record's full history | Record drawer → View audit history |
| Factor versions and their sources | Conversion Factors; the report's methodology section |
| The security review | `SECURITY_REVIEW.md` |

A read-only assurer role does not exist yet; today an assurer would be given an account with the audit and
monitoring permissions, or work alongside an Admin.

## 6. Limits an assurer should be told about

- **Typed KPIs have no evidence chain.** The Core KPIs marked "Typed" in section 3 are audited statements, not
  verified figures. A supporting file cannot yet be attached to a typed answer.
- **Emission factors:** the grid factor (CEA) and steel factor (Ministry of Steel) are Indian-government
  figures. Fuel and coal factors are IPCC 2006 defaults; transport factors come from a 2015 India-specific
  study that is not a government publication. Four activities have no factor and do not calculate: piped
  natural gas, purchased steam / heat, spend-based activities, and waste emissions.
- **Manual exceptions:** when OCR cannot read a document, a person may type the values with a written
  justification. These records are always flagged and are identifiable in OCR Monitoring.
- **Unclassified text:** waste category, disposal route, discharge destination and treatment are read from free
  text. Text that matches no SEBI group is reported as "not stated", never guessed.
- **OCR has been tried on synthetic documents and one real electricity bill only.**
- **Intensity denominators** (turnover, PPP rate, output) are entered by an Admin, audited, with no document.
- **No independent re-performance tool:** the assurer re-adds totals from the CSV export; the system does not
  produce a signed assurance pack.

## 7. Where each control lives (for a technical reviewer)

| Control | Implementation | Tested by |
|---|---|---|
| Evidence required to verify | Trigger `trg_require_record_document` (migration `0038`) | `audit_2.test.sql` |
| File fingerprint checked on read | `app/api/documents/[documentId]/file/route.ts` | End-to-end Scenario A |
| Verification guard rail | `lib/verification/`, verify screen | End-to-end Scenarios A–C |
| Validation checks | `lib/validation/`, `validation_rules` | `validation-checks.test.ts`, `phase8_validation_rules.test.sql`, edge-case suite |
| No self-approval | `lib/approvals/workflow.ts`; browser role has no write on approvals | Authorization suite; database tests |
| Deterministic calculation, factor snapshot | `lib/calculation/engine.ts` (`calc-1.1.0`) | Scenario D recomputes every stored calculation |
| Used factor versions locked | Database trigger (Phase 9) | `phase9_calculation.test.sql` |
| Calculations append-only | Migration `0036` | `phase9_calculation.test.sql` |
| Audit log append-only, with context | Migrations `0027`, `0036` | `phase18_audit_security.test.sql`; end-to-end Scenario A |
| One roll-up definition | Views `org_unit_tree`, `consolidation_records` (`0023`) | `consolidation.test.ts`; Phase 15 tests |
| Report snapshot and drill-down | `lib/reports/snapshot.ts` (version 4), report detail | Scenario D |
| Row-level security, no browser writes | Every migration; `phase2_smoke.test.sql` | Database tests |
