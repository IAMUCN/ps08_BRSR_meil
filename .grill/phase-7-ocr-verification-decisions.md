# Grill: Phase 7 — OCR verification
Date: 2026-09-17

## Intent
Build Verify Extraction (`/app/verify/[documentId]`): the original document beside the extracted fields,
click-to-edit values with confidence, a guard rail that provably blocks Confirm until every flagged field is
reviewed, Confirm and Reject, the OCR-failure paths (re-upload or manual exception), and the "document type
not identified" picker — the human-in-the-loop checkpoint the evidence-first model depends on.

## Constraints
- No schema changes (plan: "None beyond Phase 2").
- The guard rail is enforced on the server, not only in the UI (plan Phase 7 test requirement).
- Evidence is never public and never deleted.
- Validation (Phase 8), calculation (Phase 9) and approval (Phase 16) are not built here and must not be
  implied by any status shown.

## Key decisions
- Decision: **viewer = pdf.js (`pdfjs-dist`) on canvas + `<img>` for images, bytes streamed by an
  auth-checked route** (`/api/documents/[documentId]/file`: session + RLS scope on every request, private,
  no-store, sandboxed). Own floating zoom/page toolbar (UI brief §12.2), reusable as the Evidence Viewer
  (§12.3). Alternative considered: short-lived signed URLs (usable by anyone holding them until expiry);
  the browser's built-in PDF viewer (toolbar doesn't match the brief).
- Decision: **activity value = the metric's single required `number` field; unit = its `unit` field**
  (from `metric_field_requirements`). Confirm writes `activity_value_raw` (parsed OCR value),
  `activity_value_verified` and `activity_unit`. A metric without exactly one required number field can't be
  confirmed (clear configuration error). Alternative considered: hard-coded field keys; a new config column.
- Decision: **manual exception values live in a manual `ocr_extractions` row** for the failed job
  (`raw_output.source = "manual_exception"`) with `ocr_fields` whose `extracted_value`/`confidence` are null
  and `verified_value` is what the user typed. `verifications.is_manual_exception = true`,
  `ocr_extraction_id` null (schema §9.3), justification in `notes`. Alternative considered: record-level
  values only (invoice number/billing period unqueryable for Phase 8); a new table (schema deviation).
- Decision: **re-upload replaces the failed record.** "Re-upload a clearer copy" opens Upload pre-filled
  (same project + activity); on completion the same transaction marks the failed record rejected with
  "Replaced by <file>", sets the new document's `related_document_id`, and audits it. Alternative
  considered: link only, user rejects the old record by hand.
- Decision: **reporting period is read-only in Phase 7**, shown next to the extracted billing period so a
  mismatch is visible; Phase 8's period check flags mismatches. Alternative considered: moving records into
  closed periods (bypasses period close); a one-option picker.
- Decision: **Confirm rules (client and server):** every flagged field (found below the threshold, no
  threshold configured, or `is_critical`) edited or marked "Looks correct"; every required field has a value
  (missing ones typed in and marked "Not from OCR"); number fields parse (commas allowed) and are not
  negative; a document type is selected. Richer checks stay in Phase 8. Alternative considered: guard rail
  only.
- Decision: **after Confirm** the record is `user_verified`, `data_quality_state = verified`,
  `validation_status` still `pending`; My Submissions shows it under **Processing** with a "Validation
  Pending" badge; toast "Verified — validation in progress." Alternative considered: Validated tab with a
  pending badge (overstates the state).
- Decision: **invoice-number duplicate: warn in Phase 7, flag in Phase 8.** The verify screen checks the
  invoice number as entered against confirmed records for the same project + period + metric and requires
  acknowledgment; the server re-checks at Confirm. Phase 8 writes the validation result and
  `is_duplicate_flag`. Follows App Flow §2.3 (higher authority than the plan's placement).
- Decision: **who may verify:** the uploader, or a `record.verify` holder whose scope covers the record
  (RLS). Everyone else gets the §4.4 no-access redirect. Alternative considered: uploader only.
- Decision: **manual exception** requires a written justification (≥ 20 characters), all required fields,
  a document type, and a confirmation modal. Admin sees a "Manual Exception" badge on OCR Monitoring; My
  Submissions shows it too. Alternative considered: no modal.
- Decision: **Reject** = modal with a reason (≥ 10 characters) → `data_quality_state = rejected`, the
  extraction's fields `rejected`, audit entry carrying the reason; document kept; record appears under
  Rejected with the reason. Allowed while the record awaits verification (OCR completed or failed).
  Alternative considered: also soft-deleting the document.
- Decision: **edits are saved only on Confirm** (one audited transaction); leaving with unsaved changes
  prompts. Alternative considered: server-side drafts.

## Surfaced assumptions
- The document-type choice is saved immediately (audited) — it's a classification of the evidence, not a
  verified value.
- The invoice-number check uses the `invoice_number` field key wherever a metric defines one.
- Confidence is compared against the threshold at the time of Confirm (not at extraction time).
- A disabled Confirm explains itself with visible helper text rather than a hover-only tooltip (disabled
  buttons don't receive hover/focus; the brief's intent is "explain why").
- Rows outside Needs Verification also open `/app/verify/[documentId]`, which shows a read-only summary until
  record detail views exist.

## Out of scope
- Validation results and the per-field validation icon (Phase 8), returned-record re-verification (§4.8,
  arrives with returns), calculation, approval, Submission History.
