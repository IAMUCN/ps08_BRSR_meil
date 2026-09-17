# Grill: Phase 2B — OCR worker decisions
Date: 2026-09-17

## Intent
A standalone Python worker that picks up pending `ocr_jobs`, reads the evidence file from private Storage,
runs PaddleOCR, and writes confidence-scored field extractions back — provably correct through its own
test harness without `apps/web` running (`06_IMPLEMENTATION_PLAN.md` Phase 2B; TRD §10, §11, §23).

## Constraints
- Extraction assists, never decides: the worker never marks anything verified, validated or calculated.
- A field that can't be found is stored as missing (`extracted_value` null), never guessed.
- Synthetic documents only until Phase 18.
- CPU only; model weights fetched ahead of time into `OCR_MODEL_PATH`, never at runtime in production (TRD §35).
- Service-role credentials stay in the worker's environment; no endpoint is exposed.

## Key decisions
- Decision: **PP-OCR text + deterministic extraction rules.** Text lines with recognition confidence;
  versioned rules (label synonyms, number/date/unit patterns, nearest value right of / below the label)
  pick fields. Reason: reproducible, cheap on CPU, no external service. Alternatives considered:
  PP-StructureV3 (heavy on CPU, still needs rules), PP-ChatOCR (external LLM, non-deterministic).
- Decision: **seed `metric_field_requirements` for Diesel and Grid Electricity now** (data-only migration,
  field keys as named in the plan: Diesel — quantity, unit, invoice_number, billing_period; Grid —
  consumption, unit, billing_period, source_classification). The worker extracts what the record's metric
  requires; label synonyms/patterns live in worker extraction profiles keyed by `field_key`. Phases 10–11
  set `is_critical` and add the remaining metrics. Alternative considered: field lists only in the worker.
- Decision: **worker write scope** (one transaction per job): `ocr_extractions`, `ocr_fields`, `ocr_jobs`
  status, `documents.upload_status` (processing → ready | failed), `documents.document_type_id` when the
  document is confidently classified among the metric's mapped document types, `esg_records.verification_status`
  → `ocr_completed`, and system audit entries (`user_id` null — Master §31 "OCR processed document").
  Never validation, approval or calculation fields. Alternative considered: OCR tables + job status only
  (TRD §22 literal), with an app-side follow-up in Phase 6.
- Decision: **PP-OCRv5 mobile detection + English mobile recognition.** CPU-friendly per TRD §10; the needed
  values on bills/invoices are printed in English/digits. Alternatives considered: server models (slower),
  Indian-script recognition (more models, not needed for the target fields).
- Decision: **failure handling.** Unreadable/empty/unsupported files and "no text found" fail immediately with
  a user-readable `error_message`; transient errors (storage, database, model runtime) return the job to
  `pending` up to 3 attempts (`retry_count`), then fail; jobs stuck in `processing` over 15 minutes are
  reclaimed and count as an attempt. Alternative considered: fail everything immediately.
- Decision: **synthetic samples generated at test time** by a Python script (clean PDF, PNG, rotated/noisy
  "scan", corrupted file), watermarked SAMPLE with fictitious vendors; tests assert extracted values equal the
  drawn values. No binary fixtures in git. Alternative considered: committed sample files.

## Surfaced assumptions
- Confidence stored in `ocr_fields.confidence` is a percentage (0–100) derived from the recognition score of
  the text the value came from; the confidence threshold itself is app configuration used in Phase 7.
- Classification only chooses among document types mapped to the record's metric (the user already chose the
  activity at upload); if the text doesn't support one, `document_type_id` stays null for the Phase 7 picker.
- `psycopg` (Postgres) and `sentry-sdk` (TRD §19) are added to `requirements.txt`; Sentry is a no-op when
  `SENTRY_DSN` is empty.

## Out of scope
- Deployment/Dockerfile and baking weights into an image (Phase 6), UI status badges and notifications
  (Phase 6), verification (Phase 7), Indian-script OCR, invoice-number duplicate check (Phase 8).
