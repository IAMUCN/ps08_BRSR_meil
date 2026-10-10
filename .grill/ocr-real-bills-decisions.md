# Grill: OCR on real Indian electricity (DISCOM) bills

Date: 2026-10-03 to 2026-10-05

Found by the owner testing a real TPCODL bill (a phone photo of a thermal receipt). Outside the phase sequence.
Extractor versions `rules-5` to `rules-9` (the last one, water, came from the owner noting a water bill had no
consumption field). The OCR model read the page well (97 lines, almost all above 95 %); every
failure was in the extraction rules, which did not know this bill's wording.

## What was wrong, and the decisions

- Finding: the **running worker container was on an old image** (`rules-4`) for every hosted upload up to
  2026-10-04, so fixes in the repo changed nothing. Check `ocr_jobs.model_version`; recreate the container after any
  extraction change (CONTEXT.md §5).
- Decision (`rules-5`): consumption is also read under **"UNITS ADVANCED"**; "BILL DT" counts as a bill-date label.
- Decision (`rules-6`): the bill prints no "billing period", only `PREV: 5689 11-07-2026` and
  `PRES: 5830 13-08-2026`. **The billing period is the previous to the present meter-reading date**, used only when no
  labelled period exists. The date may be its own OCR box overlapping the label's, so it is looked up on the same row.
  A date can no longer start inside a longer number ("5830 13-08-2026" had read as "30 13-08").
- Decision (`rules-7`, owner-approved): the bill prints **no unit**. When consumption was read under a "units …" label
  and no unit is printed, the **unit is filled as kWh at a fixed confidence of 60** (below the 80 review threshold), so
  the person always acknowledges it. Source method `implied_by_label`. A printed unit always wins. This is an
  implication, not a reading; confidence is otherwise the recognition score (see Phase 2B decisions), so the value is
  fixed and visible in the stored `raw_output`.
- Decision (`rules-8`, owner chose "utility name"): Grid Electricity's optional **Source classification** is the
  **utility that supplied the power** (TPCODL on this bill), matched as a whole word against a list of known
  distribution companies (`KNOWN_UTILITIES` in `worker/extraction/profiles.py`; add a name there when a new one
  appears), topmost line first. A label such as "Energy source:" still wins when the bill has one. OCR reads the D of
  TPCODL as an O ("TPCOOL"), so a name is also matched with D and O treated alike, and that match is **capped at 70**
  so it is flagged for acknowledgement; an exact read keeps its recognition score. A name not on the list leaves the
  field blank. The field stays optional and informational (Phase 11): it does not choose a factor.

- Decision (`rules-9`, owner chose "bill's consumption goes into Water withdrawn"): the Water activity has fields
  *Water withdrawn* and *Water discharged*; consumption is calculated (withdrawn − discharged, Phase 13). A water
  utility bill prints only a "consumption" figure, so **"water consumed / water consumption / total consumption /
  consumption / usage" is read as Water withdrawn** (explicit withdrawal labels still win; "average", "rate",
  "amount", "charge", "previous" and "current reading" lines are ignored). **Discharge is not on a bill, so it stays
  empty** and, being required, the person types it (0 if none) before Confirm. "Kilolitre(s)" is now a recognised
  unit. Rejected for now: a separate stored "Water consumption" field (migration, calculation, validation and BRSR
  mapping all change) — revisit after real water bills have gone through. The field label still says "Water
  withdrawn" (label text is database configuration, not changed here).

## Checked

- Worker unit tests 28/28 and Ruff. The water rule is tested on constructed lines only — **no real water bill has
  been through it yet**. The real upload's stored OCR lines replayed through `rules-8`: consumption 141,
  unit kWh, period 11-07-2026 to 13-08-2026, source TPCODL. Image rebuilt, container recreated.
- Not done: the OCR integration harness was not re-run.

## Out of scope / known limits

- Header details washed out by glare on the photo (bill month, bill date, bill number) are often unreadable; none is
  required for electricity. A better photo reads them.
- A cropped photo of only the charges block (an upload on 2026-10-04) contains no consumption, period or unit, so
  nothing can be extracted; the person has to type them.
- The utility list is code, not configuration: moving it into the database (editable by an Admin) would follow the
  "nothing hard-coded" rule more closely and was not asked for.
