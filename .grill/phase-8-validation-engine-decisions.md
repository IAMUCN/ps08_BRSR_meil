# Grill: Phase 8 — Validation engine
Date: 2026-09-19

## Intent
Every confirmed record passes the six PRD §29 categories (format, organizational, period, evidence,
logical, anomaly) before it can be calculated. Hard failures go back to the submitter with the reason and
can be corrected on the verify screen; flags go to the Admin Validation Queue for a human decision.

## Constraints
- Rule parameters are configuration (`validation_rules`), never per-metric logic in code (plan Phase 8).
- Validation runs in the same transaction as Confirm (schema §20.3).
- Anomalies are review flags, never automatic rejections (Master Approach §23).
- No schema changes.

## Key decisions
- Decision: **typed checks, seeded configuration.** A small fixed vocabulary of check kinds lives in code
  (`allowed_units`, `range`, `billing_period_overlap`, `duplicate_invoice`, `duplicate_period`,
  `history_ratio`); their parameters, severity and metric scope are `validation_rules` rows seeded by
  migration `0015`. Structural checks that aren't configurable run as built-ins with
  `validation_rule_id` null (schema §9.4): required fields and number format; project exists, is active
  and is inside the submitter's scope; evidence attached and readable. Alternative considered: all
  built-in (violates the plan); a generic expression language (far more to build).
- Decision: **period check** passes when the verified billing date/range overlaps the reporting period;
  no overlap is a **hard fail** returned to the submitter; an unreadable billing date is a **flag**.
  Alternative considered: flag only; requiring full containment.
- Decision: **anomaly** flags a value more than 2× or less than ½ of the median of individual validated
  records for the same project + metric in up to the 12 prior periods, once records from at least 3 prior
  periods exist; otherwise it passes with "Not enough history to compare (n of 3 periods)".
  Alternative considered: ×3 / 3 periods; ×1.5 / 2 periods.
- Decision: **returned records are corrected in Phase 8** (App Flow §4.8): the verify screen reopens with
  the prior verified values, the reason at the top and the failing fields marked; re-confirm writes a new
  verification and re-runs validation from the top.
- Decision: **allowed units** — Diesel: L, Ltr, Ltrs, Litre, Litres, Liter, Liters, KL, Kilolitre; Grid
  electricity: kWh, Units (case-insensitive). Anything else is a hard fail. Normalisation is Phase 9.
- Decision: **manual exceptions are always flagged** by the evidence check, so each lands in the
  Validation Queue for a human decision.
- Decision: **notifications** — a hard fail or an Admin return notifies the submitter (`returned`, deep
  link to the verify screen); a flag notifies every active Admin (`validation_review`, deep link to the
  Validation Queue); a clean pass notifies nobody.
- Decision: **Admin review** — Accept only for flagged records, reason required → validated; Return for
  flagged records, reason required → returned to the submitter. Hard-failed records are view-only in the
  queue; only the submitter's correction clears them.

- Decision (2026-09-19, after the owner reported "the project manager can't verify anything, and the
  Approved tab never updates"): **approval is pulled forward from Phase 16 into Phase 8.** A validated
  record (clean pass or Admin-accepted flag) moves to `review_pending` with a system `submitted` approvals
  row; approvers are non-Admin `approval.decide` holders whose scope covers the project (notified
  `approval_needed`, `/app/approvals`), otherwise the Admins (`/admin/approval-queue`). Approve →
  `approved`; Return (reason ≥ 10) → back to the submitter's verify screen. The submitter or verifier can
  never decide on their own record. Reason: without it no record could ever reach Approved.
  Alternative considered: leave approval to Phase 16 and only explain the empty tab.
- Decision: **synthetic sample invoices get a unique invoice number each** (`scripts/make_sample_invoice.py`,
  `diesel_invoice_pdf(invoice_number=…)`). Reason: every sample shared `SMP-INV-2026-0042`, so each
  Confirm showed a duplicate warning that had to be ticked and every record was flagged. Duplicates are
  still tested on purpose by passing the same number.
- Decision: **records verified before validation existed are validated once** with
  `pnpm --filter web validate-pending` (same engine, one transaction per record, idempotent). Local data
  only. Alternative considered: leave them in "Validation Pending".

## Surfaced assumptions
- Duplicate invoice numbers (verified, same project + period + metric) are a **flag** and set
  `is_duplicate_flag` (plan: "reviewed not auto-rejected"). Duplicate reporting-period submission is
  seeded for Grid Electricity only — several diesel invoices in one month are normal, one grid bill per
  month is expected.
- Quantity must be greater than zero (logical, hard fail, global rule).
- Validation outcomes are system events (`user_id` null in the audit entry); Admin decisions are audited
  with the Admin as actor.
- `validation.run` is the engine called inside Confirm's transaction, not a public endpoint: a client-
  callable "run validation" would let a browser trigger lifecycle changes.
- Per-field validation icons (UI brief §12.2) come from configured rules that name a field.

## Out of scope
- Admin editing of validation rules (a later Settings/Config phase), calculation (Phase 9), multi-level
  approval chains and the approval dashboard cards (Phase 16), the Admin dashboard validation card (Phase 16).
