# Grill: Safety incidents and water discharge from records (2026-10-09)

Date: 2026-10-09

After the full BRSR format went in, three numeric Section C questions were still typed. The owner asked for
two of them to be built — safety incidents (P3-E11) and water discharge (P6-E4) — and left energy in joules
(P6-E1) out for now.

## Safety incidents (P3-E11)

- **Two activities, owned by EHS:** "Safety incidents — employees" and "Safety incidents — workers". SEBI's
  table splits the two, so each is its own activity rather than a free-text field to classify.
- **Evidence:** a Safety Incident Statement for the period (new document type). Six required fields:
  person-hours worked, lost time injuries, total recordable injuries, fatalities, high consequence injuries,
  statement period. Zero is a valid count.
- **Result:** the lost time injury frequency rate, lost time injuries per one million person-hours worked
  (SEBI's definition). It is the existing percentage formula with its scale stated (`"scale": 1000000`); the
  engine and the roll-up read the scale, default 100. A roll-up re-derives the rate from summed injuries and
  summed hours, never from averaged rates. `ENGINE_VERSION` is unchanged: no existing result changes.
- **Validation:** lost time injuries above recordable injuries fail; fatalities above them are flagged for a
  reviewer (registers differ on whether a fatality is counted as recordable); a second statement for the same
  project and period is flagged.
- **Report:** SEBI's table — LTIFR, recordable injuries, fatalities, high consequence injuries, for employees
  and for workers, current and previous year. A category with no approved statement prints a dash.
- **OCR:** labels for the five counts and keywords for the document type (`EXTRACTOR_VERSION` `rules-13`), and
  a sample statement (`make_sample_invoice.py --kind safety`).

## Water discharge (P6-E4)

- **Two optional fields on the water record:** "Discharged to" and "Treatment before discharge". A water bill
  does not print them, so the person who verifies the record types them; OCR does not look for them.
- **Report:** SEBI's table — surface water, groundwater, seawater, third parties, others, each split into no
  treatment and with treatment, and the total. The free text is read into SEBI's groups by
  `lib/reports/classify.ts`; **text that matches no group, or a record that says nothing, is printed as
  "not stated", never guessed.** The volume is the verified "Water discharged" field in kilolitres.
- "None", "Nil", "Untreated" mean no treatment; any other stated level counts as treated.

## Limits

- SEBI asks for the level of treatment to be named; the table shows only "with treatment".
- A creek or a drain whose end is not said is not classified.
- Safety: rehabilitated workers (P3-L3) and the other safety questions are still typed.
- Energy in joules (P6-E1) and water in stressed areas (P6-L1) are still typed.
- Until the hosted worker runs `rules-13`, the six values on a safety statement are typed by hand there.

## Checked

Web unit 96/96, worker unit 44/44 and Ruff, database 225/225 (new `safety_and_water_discharge.test.sql`),
lint, typecheck, format. Both report tables were built by the real snapshot code from approved records in the
local database, inside a transaction that was rolled back (LTIFR and a third-party treated discharge came out
right). **Not run:** an upload of a safety statement through the app, the end-to-end suite, the OCR on the
sample statement (the labels were tested on text lines, not on the rendered PDF), the production build.
