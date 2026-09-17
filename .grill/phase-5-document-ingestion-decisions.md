# Grill: Phase 5 — Document ingestion decisions
Date: 2026-09-17

## Intent
Let an assigned user upload an evidence document into their scope for the open reporting period, stored
privately and recorded with correct metadata (document, draft ESG record, evidence link, pending OCR job,
audit entry), without OCR yet — per `06_IMPLEMENTATION_PLAN.md` Phase 5, `03_APP_FLOW.md` §2.3 Upload
Document and `04_UI_UX_DESIGN_BRIEF.md` §12.1.

## Constraints
- Original evidence is preserved byte-for-byte: no compression or transformation of the stored file.
- Bucket stays private; no client insert on `documents`, `esg_record_documents`, `ocr_jobs` (D3).
- Open period, scope and category re-checked on the server at completion, not only in the UI.
- Synthetic documents only until Phase 18.

## Key decisions
- Decision: **50 MB maximum file size**, enforced in the browser, on the server and on the bucket, and
  shown on the drop zone. Reason: generous for multi-page scans while staying inside Supabase's per-file
  cap and keeping server checks and CPU OCR bounded. Alternative considered: no limit with background
  compression — rejected: compression changes the evidence bytes and hash, doesn't shorten the user's
  upload, and the platform cap still exists (just with a worse error). A smaller OCR-only derivative can
  be added in Phases 2B/6 if large files are common.
- Decision: **bytes first, then rows.** The server issues a signed upload URL for
  `evidence/{org_unit_id}/{reporting_period_id}/{document_id}/original.{ext}`; the browser uploads
  directly (real progress bar and cancel); a completion procedure re-reads the stored object, recomputes
  SHA-256, checks structure, re-checks period/scope/category, then creates `documents`, `esg_records`,
  `esg_record_documents`, `ocr_jobs` and the audit entry in one transaction. Rejected files are removed
  from storage. Reason: an OCR job can never point at a missing file. Alternatives considered: rows first
  (D3's original order — leaves orphan jobs on cancel/failure); upload through the Next.js server
  (Vercel's ~4.5 MB request body limit). Amends D3's ordering.
- Decision: **upload target = assigned node or any active descendant**, picker shown only when there is
  more than one choice; frozen (deactivated) nodes excluded. Reason: matches the read scope RLS already
  grants. Alternative considered: exact assigned nodes only.
- Decision: **identical-file check is organization-wide with a non-revealing message** ("This file has
  already been uploaded"); acknowledging it continues and sets `esg_records.is_duplicate_flag`. Reason:
  catches the same bill filed by two projects (double counting). Alternative considered: user's own scope
  only.
- Decision: **same project + period + metric is a warning only.** The user acknowledges "Project X already
  has N Diesel Consumption records for September 2026"; it does not set `is_duplicate_flag`. Reason:
  several invoices per metric per month is normal; flagging each would flood reviewers. The "same invoice"
  check is the invoice-number check after OCR (Phase 7).
- Decision: **corruption check = structural, no new dependencies.** File type detected from content, not
  the browser's claim; PDF needs `%PDF-` header and `%%EOF` trailer, PNG needs signature and `IEND`, JPEG
  needs SOI and EOI markers; password-protected (encrypted) PDFs are rejected because OCR cannot read them.
  Deeper damage is caught by the OCR worker as a failed job (Phase 2B backstop). Alternative considered:
  full parse with a PDF/image library.

## Surfaced assumptions
- Accepted types for an upload = union of `accepted_mime_types` of the document types mapped to the chosen
  metric; `documents.document_type_id` stays null until OCR/user identifies it (schema §8.1).
- The user picks a metric (grouped by category) because `esg_records.metric_id` is required; categories are
  filtered by `owning_role_id` (null = every role) against the user's upload-capable roles at that node.
- After success the user returns to the Dashboard (My Submissions arrives in Phase 6).
- Abandoned uploads (browser closed before completion) can leave an unrecorded object in storage; nothing
  references it. Cleanup is deferred.

## Out of scope
- Compression or derivative files, mobile camera capture, invoice-number duplicate check (Phase 7), OCR
  processing (Phases 2B/6).
