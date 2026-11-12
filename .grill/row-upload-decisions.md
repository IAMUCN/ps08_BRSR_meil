# Upload by rows, typed values checked against the document (2026-11-12/13)

Jury feedback at the mid evaluation: "implement manual entry for each submission". Owner's direction (in order):
recheck a manual entry against the extracted value, flag any mismatch and ask the person to re-verify; the Upload
page becomes rows like a scholarship portal (bill type, reporting period as dropdowns, a value box, the evidence
file in the same row, "add another submission"); evidence mandatory; handle multi-page and multi-bill PDFs of the
same and of different categories; several documents under one row (toggle); travel where one PNR carries several
passengers. D59, A60, migrations `0077` (additive: typed values, drafts) and `0078` (travel), OCR `rules-17`.

## The owner's answers (asked 2026-11-12)

1. **A value is required on every row** (and on every bill typed on the separation page).
2. **Matching allowance:** a gap of 1 in the last decimal place of the less precise value, after converting both
   to one unit. Built: whole numbers must be equal (6 passengers are not 7 — there is no decimal place to be 1 out
   in); a whole number against a decimal one is a match when it is its rounding (14,210 and 14,210.4).
3. **The bill number is not typed**; only the row's numbers (and unit) are.
4. **Drafts: yes.** An unfinished Upload table is saved per person on the server (`upload_drafts`) as they type.
   Files are not part of a draft; the page says to attach them again.
5. **Travel as distance × passengers for air, rail, road and staff buses** (not only air).

## What was built

- **Upload page** (`components/upload/row-upload.tsx`, `lib/upload/rows.ts`): one row per submission — bill type
  (the person's activities, grouped by category), reporting period (open periods, begun first, late marked),
  the value(s) (every required number of the activity: one for most, distance and passengers for travel, the
  counts of a workforce or safety statement), the unit (the activity's allowed units, its own first) and the
  evidence, required. "Submit all" sends each row as its own upload (`bundles.completeUpload` with
  `declarations`). A row then shows Reading → Recorded (Verify links per bill) / Check the bills / Failed.
- **Several documents** (row toggle): "Pages of one bill" (one record, whatever the split proposed) or "Separate
  bills — my value is their total" (one record per bill, all under one typed total). **Another bill in this file**
  adds a sub-row per bill inside a multi-bill file, each with its own type, period and value (different
  categories in one PDF are typed this way).
- **Typed values are stored apart** (`upload_declarations`, immutable by trigger, server-only) and each record
  points at its row (`esg_records.upload_declaration_id`).
- **Recorded at once when it pairs cleanly** (`bundles.autoConfirm`, called by the Upload page once the upload is
  read): bills found are paired with typed rows by activity and period (`matchBills`); the typed bill type and
  period win. A different count goes to the separation page with the reason ("2 bills were found but 1 was
  typed"). Possible duplicates do not stop it: validation flags the same file and the same bill.
- **Separation page**: each bill shows which typed row it is ("Typed on the Upload page as"); a bill no row was
  typed for gets its value typed there (stored as a new row); a typed row with no bill must be ticked "Not in this
  upload" (it stays in the record of what was typed, and the audit entry names it).
- **Verify**: each typed field shows Matches / Not read on the document (the typed value is filled in) / a
  mismatch ("You typed 1410 L at upload; the document reads 1250.00") with **Use the document's value** and **Keep
  my value**. A mismatch blocks Confirm until chosen — on the server too (`verification.confirm`). A bill of a
  typed total shows the total, what the bills add up to and links to the others.
- **Validation** (`declarationProblems`, built-in evidence check): the confirmed value must be the document's
  reading where there is one, else the typed value. Keeping the typed value against the document, or a third
  value, is a review flag naming both values. A typed total is compared with the bills' values (confirmed, else
  read) and flagged if they do not add up.
- **Travel**: `distance` and `passengers` replace the passenger-km number for BUSINESS_TRAVEL_AIR / RAIL / ROAD and
  COMMUTING_BUS; formula version 2 multiplies them (`direct_multiply` with `inputs`), version 1 superseded. The
  activity value is the product (set at Confirm); the trace stores the distance in km and the passengers as a
  count. A record verified earlier keeps its passenger-km (the engine and Verify fall back to `quantity`).
- **OCR `rules-17`**: distance and passengers labels; when no count is printed the passengers are counted from the
  numbered names ("1. MR A KUMAR", "Passenger 2: …"), capped at confidence 70 so the person acknowledges it; a
  "Passengers" heading over the list is not read as "1"; PNR / ticket number as the bill number (same-bill
  duplicate rule catches the same PNR twice); "Date of Travel" as the period.

## Decisions made while building (confirm with the owner)

1. **A total for travel** compares each typed field as a sum (total distance, total passengers). Six e-tickets of
   one trip therefore need the summed distance typed; usually such a group is one PNR and one row instead.
2. **Supporting files** (payment receipts) are still added on Verify or the record panel, not in the row.
3. **Replacing a failed or returned document** keeps the one-file form (no typed value), as before.
4. **The bundle's own period** is the first row's period; each bill is filed in its typed period.
5. **Older uploads** (no typed rows) work exactly as before on the separation page and Verify.
6. **A changed activity on Verify** compares only fields both activities share; the category-mismatch flag covers
   the rest.
7. The test data's travel tickets (`make_test_data.py`) still print passenger-km as "Distance"; regenerate them
   with distance and passengers if they are used for the demo.

## Not done / not run

- Hosted: `0077` is additive (safe under the deployed code) and is what the dev server on port 3000 needs — without
  it Upload fails with "relation public.upload_drafts does not exist" (seen 2026-11-13; applying it by script was
  blocked by the permission system: the owner runs `node "test data/_backup/hosted-0077.cjs" apply`). `0078`
  (travel) must wait for the new code to be deployed, then the `rules-17` worker image
  (`traceesg-ocr-worker:rules-17`, built locally; `:latest` not retagged, the hosted container not replaced).
- Hosted's history is at `0067`: the decision-intelligence migrations `0068`–`0076` are on no hosted database, so
  recording `0077` there leaves a gap; a plain `supabase db push` would then try `0068`–`0076`.

## Second round (2026-11-13, owner's request)

- **Manual / Automatic switch** on the Upload page (`upload-workspace.tsx`): Manual is the row table; Automatic is
  the earlier flow (drop the bills, EmeilSG finds each one; it still stops at the separation page, as before).
  Starts on Manual; each person's last choice is kept on their browser (`localStorage` "upload-mode").
- **Evidence in the same row** as the values (the last column). With **Another bill in this file**, the file moves
  to the top of the card ("Evidence file (all the bills)") and every bill line asks for **Page from / to**.
- **Pages** (migration `0079`, additive): for every bill of the file or for none; counted across the row's files in
  the order shown; no overlap. When given, the upload is cut there and recorded at once without waiting for the
  OCR's split; pages beyond the file send it to the separation page with the reason. Left empty, OCR finds the
  bills as before.
- **Eye button**: each attached file can be previewed before it is sent (in the browser, nothing uploaded), and
  each bill after it is recorded (through the document route, scope-checked).
- Built that way (confirm): Automatic is the earlier flow exactly, with the separation page step; making it fully
  automatic (record the proposed split without the person) is a separate change if wanted.
- Checked: web unit 385, database 503/503 on a fresh reset (`0001`–`0079`), `row-upload.mjs` 57/57,
  scenarios E 40/40 and F 19/19, browser `ui-row-upload.mjs` 30/30 (switch, row layout, pages, preview before and
  after, Verify, phone, axe, no console error), production build, lint, format, typecheck. The hide-the-draft-note
  change came after the build (static checks and unit tests re-run).
- Hosted: `0077` is on hosted (applied by the owner 2026-11-13). **`0079` is not** — the dev server's uploads fail
  ("column page_from does not exist") until `node "test data/_backup/hosted-0079.cjs" apply` is run.

## Third round (2026-11-13, owner's request): a real table with merged cells

- Several files under one row: every row now takes several files (the "Several documents" tick box is gone). A
  second file makes the row "separate bills — my value is their total" by default, with "pages of one bill" as the
  other choice in the row's action bar; back to one file, back to one bill.
- The rows are a table (#, Bill type, Reporting period, Value, Unit, Pages, Evidence) with an action bar under each
  submission (Another bill in this file, Description, Remove), after the owner's reference image. Spreadsheet rules:
  one activity with several files — the activity's cells are merged down and each file has its own line; one file
  with several bills — a line per bill and the Evidence cell merged down across them.
- The table has its own scroll box, not `.overflow-x-auto`: the site-wide pinned-first-column rule would misplace
  merged cells. On a phone the table scrolls sideways inside its box; the page does not.
- Checked: browser `ui-row-upload.mjs` 32/32 (both merged layouts measured by `rowspan`, screenshots looked at),
  `row-upload.mjs` 57/57, unit 385, production build, lint, format, typecheck. The period column was widened after
  the build (static checks re-run).

## Fourth round (2026-11-13, owner's request): billing period instead of reporting period

- The row asks for the bill's **billing period** (a month), not a reporting period. The record is filed in that
  month's reporting period. A month whose due date has passed — or that has closed — is still accepted; the record
  is marked a late submission (`submitted_late`), which validation flags for review as before.
- **Months offered** (`loadBillingMonths`, India time): the current financial year's months that have begun, open
  or closed, newest first. Months still to come and earlier years are not offered, and the server refuses them.
- **March exception:** last financial year's March is offered from April to June (bills for March arrive after the
  year ends). The April-to-June window is the agent's choice — confirm.
- This reverses, for typed bills only, the 2026-11-01 rule that a closed period takes no new documents (that rule
  lived in code, not in the database). A report already generated for a closed month does not change; the late
  record shows up for review. The separation page lists the same months, and a bill read with a billing date in a
  closed month of this year is proposed for that month (Automatic mode too).
- The upload itself (the container of the files) is filed under the newest open period, as before.
- No migration. Checked: `row-upload.mjs` 67/67 (months offered and refused, a closed month accepted and marked
  late, with labelled closed fixture periods on the local test database), browser `ui-row-upload.mjs` 32/32,
  scenario E 40/40, unit 385, build, lint, format, typecheck.

## Fifth round (2026-11-13, owner's request): change the reporting period on Verify

- Verify Extraction has a **Reporting period** picker (`components/verification/period-picker.tsx`,
  `verification.changePeriod`): before the values are confirmed, and when the record is returned for correction.
  The months offered are those that take uploads plus this year's billing months; the record's own month always.
- When the billing period (confirmed, else read) points to another month, a note offers **Move to <month>** in one
  click (`suggestedPeriod`, from `periodForBill`).
- Moving updates the record and its document, works out "late" again against the new month's due date (from when
  the upload arrived) and writes `record.period_changed` to the audit trail. Confirmed (not returned) and approved
  records can't be moved. The person confirms again; validation runs from the top.
- The billing period itself was already an editable field on Verify.
- No migration. Checked: `row-upload.mjs` 75/75 (returned for the wrong month, suggestion, refused month, move,
  late recomputed, audit entry, re-confirm passes, refused once confirmed), browser 33/33, unit 385, build, lint,
  format, typecheck.
- Fix (2026-11-13, owner: "Move to May 2026 didn't set it"): the move had worked on hosted (record, document and
  audit entry in May 2026), but the picker kept its first value after the page refreshed and still showed June, and
  the returned panel kept June's validation failure. The picker is now keyed by the record's month, and a record the
  checks sent back (validation failed, not a reviewer's return) is validated again in its new month in the same
  step. Checked: `row-upload.mjs` 77/77, browser 34/34 ("after Move the picker shows the new month"), unit 385.
- Follow-up (2026-11-13, owner: "the Move button isn't working"): the picker correctly showed May 2026 (Move is off
  when there is nothing to move); the panel still showed June's failure because that record was moved before moves
  re-ran the checks. Verify now shows "Check again in <month>" for a record the checks sent back and that was moved
  after they last ran (`recheckAfterMove`, `verification.recheck`: runs validation, values unchanged; a reviewer's
  return still needs Confirm). Checked: `row-upload.mjs` 81/81, browser 34/34, unit 385, build, lint, format.
