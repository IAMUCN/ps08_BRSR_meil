# Eye button: show where values were read on a document
Date: 2026-11-11

## Intent
Under the document on Verify Extraction (where My Submissions opens a document), an eye button shows every part
of the page a value was read from, coloured, and the choice sticks for the person on every document.

## Key decisions
- Decision: saved on the account (`users.show_extraction_boxes`, migration `0065`, D55), like the theme, so it holds
  on every document and device; written by `profile.setShowExtractionBoxes`, audited `user.preference_changed`.
  Owner's choice over this-browser-only.
- Decision: colours by confidence: green read confidently or confirmed by a person, amber low confidence on an
  optional field, red low confidence on a field Confirm needs; the selected value keeps the brand outline; a key
  under the viewer. Owner's choice over one colour per field.
- Decision (agent's): off by default. With it off the page behaves as before (selected and low-confidence boxes).
- Decision (agent's): the boxes load for any document the person may open once OCR has read it, not only while
  it still needs checking, so an approved submission shows them too. They reveal nothing beyond the document and
  values the page already shows.

## Surfaced assumptions
- Documents loaded directly (the earlier months of the test data) and typed-by-hand values have no positions; the
  button then says so.
