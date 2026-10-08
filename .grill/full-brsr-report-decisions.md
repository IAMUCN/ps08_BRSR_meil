# Grill: The full BRSR format in the report (2026-10-09)

Date: 2026-10-09

The owner asked for the report to be checked against the L&T reference (`ps_documents/provided_docs/L&T BRSR
Report FY2025-26.pdf`) and "the 17 SDGs as per SEBI", and for the app to produce a report like the reference.

## What was found

- **Neither SEBI's format nor the L&T report mentions the SDGs.** Both annexures and the full L&T text were
  searched: no match. SEBI's report is organised by the nine NGRBC principles. The 17 goals appear only in the
  KT session, whose notes call them background, not the implementation specification.
- The L&T report is the complete format: Section A (26 questions), Section B (12), Section C (nine principles,
  essential and leadership indicators). The app's report had the ten indicators it measures.
- The provider's stated scope is Section C, Scope 1 to 3, with evidence; other sections are "for extra value".

## What the owner decided (asked 2026-10-09)

- **Full BRSR like L&T.** Every question of Sections A, B and C is printed in SEBI's order. The app fills what
  it measures; an Admin types the rest once per financial year; a question left empty prints "Not reported".
- **All 17 goals are listed** in the SDG table; a goal with no tagged question says "No indicator in this
  report". The table keeps its line that SEBI does not prescribe the mapping.
- This is an exception to upload-only (`.grill/audit-2-decisions.md`): **typed entry is for written statements
  only** (company details, policies, yes/no, descriptions). Figures the app measures are never typed.

## How it is built (migration `0040`, D32, A28)

- **146 questions as configuration** in `brsr_indicators`: A 26, B 12, C 108 (by principle: 11, 9, 21, 5, 16, 21,
  3, 11, 11). Wording and numbering are SEBI's **as printed in the L&T FY2025-26 report**, which follows the
  format in force (it has the assurance questions A-14/A-15 and Green Credits, P6-L8, that the 2021 annexure in
  the repository lacks). Multi-part questions (a, b, c) are one question with the parts in its text.
- Each question is `data` (answered from approved records through metric mappings — the ten that already
  existed) or `statement` (typed). The rule that a report fails when a required indicator has no mapping
  applies to `data` questions only.
- **Typed answers** live in `brsr_disclosures`, one per question per financial year, server-only, changed
  through `brsr.saveDisclosure` (Admin, audited as `brsr.disclosure_saved`; an empty answer clears it).
  A `data` question may carry one too; it prints under its figures as a note.
- **Admin → BRSR Disclosures** (`/admin/disclosures`): pick the financial year, open a section, type and save
  each answer. It counts answered against total.
- **The report** (snapshot version 4) prints Section A and B under SEBI's sub-headings and Section C principle
  by principle, essential before leadership. A single-period report uses the answers of the financial year its
  period falls in. Reports generated earlier still open as they were.
- BRSR Mapping and readiness list only the measured questions, so readiness % is unchanged.
- **SDG tags** were extended to the new questions — again the agent's own reading, in the migration. Goals 2
  (Zero Hunger) and 14 (Life Below Water) have no question tagged.

## Limits, stated plainly

- **An answer is free text.** SEBI's tables for the written questions (employees by category, complaints,
  wages) are typed as text, not as structured tables; L&T prints real tables.
- **Three numeric Principle 6 questions are typed, not measured, for now:** energy in joules (P6-E1), water
  discharge (P6-E4), water in stressed areas (P6-L1). The app does not capture the data to compute them.
  Typing a figure there goes against "measured data is never typed"; it is the owner's call whether to type
  them or leave "Not reported" until the app captures them.
- A written question cannot be turned into a measured one from the screen; that needs a migration.
- Previous-year answers are not printed beside the current year for written questions.

## Checked

Web unit 93/93, database 218/218 (new `full_brsr_format.test.sql`, three stale expectations updated), lint,
typecheck, format; a report built from the local database with the real snapshot code and read (146 questions,
headings in order, typed answers, all 17 goals). **Not run:** the end-to-end suite, a browser click-through of
BRSR Disclosures (its save procedure was not executed), the production build — the machine had 0.7 GB free.
