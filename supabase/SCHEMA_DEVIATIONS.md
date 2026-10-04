# Schema Deviations

Deviations from `ps_documents/implementation_docs/05_BACKEND_SCHEMA.md`, recorded under
**Implementation Plan Rule 4** ("do not change database schema without documenting the change").
Decisions were approved on 2026-09-17; reasoning trail: `.grill/phase-2-database-decisions.md`.

Everything not listed here is implemented as written in the schema document: the 35 tables, their
columns, types, defaults, constraints and indexes, the `is_admin()` / `my_org_unit_ids()` helpers,
the §19.3 factor-version guard trigger, and the §16.3 read (SELECT) policies.

---

## D1 — Server-only lifecycle writes (security)

**Schema says (§16.3):** `esg_records_insert`, `esg_records_update` and `approvals_insert` are client
RLS write policies.

**Implemented:** clients (`anon`, `authenticated`) have **no** INSERT/UPDATE/DELETE privilege on
`esg_records`, `verifications`, `validation_results`, `approvals`, `calculations` or `audit_logs`, and
those write policies are not created. All lifecycle mutations run in server-side tRPC procedures
(service role). Every such procedure must:

1. authenticate the logged-in user;
2. take the user's identity from the authenticated session — never from client-supplied fields;
3. verify organizational/project scope;
4. verify the user's role/permission;
5. verify the record's current state;
6. enforce the explicitly allowed state transition;
7. write the mutation and its `audit_logs` row in the **same transaction**;
8. block self-approval by the record's submitter **and** verifier (§9.5);
9. derive `decided_by` (and any other acting-user column) from the session.

A client must never be able to set `approval_status`, `validation_status`, `verification_status`,
`calculation_status`, `data_quality_state`, `is_duplicate_flag`, `verified_by`, `decided_by` or any
other lifecycle-controlled field through a generic update.

**Why:** `esg_records_update` let any in-scope user update *any column* while a record was
`not_submitted`/`returned` — e.g. set `approval_status = 'approved'`, bypassing validation, the
Approval Queue and submitter≠approver. `approvals_insert` never bound `decided_by` to `auth.uid()`,
allowing approvals recorded under another user's identity. RLS restricts rows, not columns.

**Trade-off accepted:** write-path security for these tables depends on server procedure correctness
rather than RLS alone. Read-path isolation remains RLS-enforced.

## D2 — Server-only configuration writes

**Schema says (§16.3):** `factor_versions_write` lets Admin insert factor versions from the client;
other Admin-managed tables imply similar Admin write policies.

**Implemented:** no client write privilege on `org_units`, `user_org_assignments`, `roles`,
`permissions`, `role_permissions`, `reporting_periods`, `esg_categories`, `esg_metrics`,
`metric_field_requirements`, `document_types`, `document_type_metric_mappings`, `validation_rules`,
`calculation_formulas`, `scopes`, `conversion_factors`, `conversion_factor_versions`, `brsr_sections`,
`brsr_indicators`, `brsr_metric_mappings`, `org_settings`. Admin changes go through server procedures
that check `is_admin()` or the relevant permission and write the change plus its audit entry in one
transaction. Read policies unchanged.

**Why:** once clients cannot write `audit_logs` (D1), direct Admin config writes would be unaudited,
violating Master Approach §31 ("Admin modified configuration") and PRD §39.

## D3 — Server-issued uploads

**Schema says (§16.3):** `documents_insert` is a client RLS insert policy.

**Implemented:** no client insert on `documents`, `esg_record_documents` or `ocr_jobs`. Uploads run in
two server procedures, **bytes first, then rows** (amended in Phase 5,
`.grill/phase-5-document-ingestion-decisions.md`):

1. `documents.prepareUpload` verifies scope, role/category, the open reporting period, declared size and
   type, and duplicate warnings, then returns a signed upload URL for the private path
   `evidence/{org_unit_id}/{reporting_period_id}/{document_id}/original.{ext}` (§15). File bytes go from
   the browser directly to Storage.
2. `documents.completeUpload` re-reads the stored object, recomputes SHA-256, checks the file structure
   and real type, re-checks scope/category/period under shared advisory locks, then creates `documents`,
   `esg_records`, `esg_record_documents`, `ocr_jobs` and the audit entry in one transaction. Rejected
   bytes are removed from Storage.

The bucket (migration `0012`) is private, limited to 50 MB and PDF/JPG/PNG, and has no `storage.objects`
policies for clients.

**Why:** one upload spans several tables and an audited event (Master §31 "User uploaded document");
a lone client `documents` insert cannot be atomic with them. Creating rows only after the bytes are
verified means an OCR job never points at a missing or corrupted file. The originally planned order
(rows first, then the signed URL) left orphan jobs whenever an upload was cancelled or failed.

## D4 — Notifications

**Schema says (§16.3):** notifications follow the generic org-scope pattern.

**Implemented:** notifications are server-created. Read: own rows (`user_id = auth.uid()`) or Admin
(per `03_APP_FLOW.md` §2.3 "User sees only their own notifications"; `notifications` has no
`org_unit_id` to scope by). The **only direct client write in the database** is marking one's own
notification read: column-level `GRANT UPDATE (is_read)` plus an own-row update policy.

## D5 — `user_display_names` view

**Schema says (§3.1):** display names are exposed "via a narrow view (§14.5)" — §14.5 does not exist.

**Implemented:** view `public.user_display_names (id, display_name)`, readable by any authenticated
user, unscoped by decision; all write privileges withheld (simple views are auto-updatable). The
`users` table keeps its self-or-Admin read policy. The view runs with its owner's rights by design.

## D6 — Privilege hardening

Not stated in the schema document; required to make D1–D5 hold at the privilege layer rather than
only by absence of policies:

- `anon` has no privileges on any public table or view (all routes require login, `03_APP_FLOW.md` §1).
- `authenticated` has SELECT only (RLS filters rows); INSERT/UPDATE/DELETE/TRUNCATE revoked everywhere.
- Default privileges revoked the same way, so tables added by later migrations start locked down.
- Security-definer helpers (`is_admin`, `my_org_unit_ids`) and trigger functions set
  `search_path = ''` and use schema-qualified names; `EXECUTE` revoked from `anon`/`public`.
- `my_org_unit_ids()` uses `UNION` instead of §16.2's `UNION ALL`, so a malformed cyclic hierarchy
  terminates instead of recursing indefinitely. Result set is unchanged for a valid tree.

## D7 — `updated_at` trigger coverage

**Schema says (§19.1):** attach `set_updated_at` to mutable tables including `reporting_periods` and
`esg_metrics`.

**Implemented:** attached to the tables that actually have an `updated_at` column — `users`,
`org_units`, `esg_records`, `org_settings`. `reporting_periods` (§5.1) and `esg_metrics` (§6.2) define
no `updated_at` column; none was added (Rule 4: no column additions).

## D8 — Seed data placement and scope

**Plan says (Phase 2):** seed data as `supabase/migrations/NNNN_seed.sql`, including "basic applicable
Scope 3 categories per PRD §22 MVP list".

**Implemented:**
- `0009_seed_reference_data.sql` (every environment): 7 roles, the approved 14-permission catalogue
  and role mappings, `SCOPE_1`/`SCOPE_2`/`SCOPE_3`, the single root org unit **MEIL**, and the Diesel /
  Grid Electricity category, metrics, document types and mappings.
- `supabase/seed.sql` (local `db reset` only, never `db push`): the test hierarchy under MEIL
  (Subsidiary A → Project X → Project X Site 1) and one open reporting period.
- **No Scope 3 child categories** — PRD §22 has no MVP list; categories are selected and seeded in
  Phase 12 (which already lists "new `scopes` child rows under `SCOPE_3`").

## D9 — Inactive users have no data access (migration `0010`)

**Schema says (§16.2):** `is_admin()` and `my_org_unit_ids()` check active (unrevoked) assignments only.

**Implemented:** both helpers additionally require `users.is_active = true`. A deactivated user holding
an unexpired session token therefore reads nothing through RLS immediately. This is the database
layer of the three-layer deactivation decision (Auth ban in the Phase 4 deactivate procedure; app-layer
`is_active` check in the Data Access Layer) — `.grill/phase-3-auth-decisions.md`.

**Why:** Supabase session tokens stay valid until expiry and refresh tokens can renew them; without this,
deactivation would not take effect for data access until the token lapsed.

## D10 — Reporting period submission window columns (migration `0011`)

**Schema says (§5.1):** `reporting_periods` has `start_date`/`end_date` (the period covered), `status`,
`opened_at`, `closed_at` — no submission window.

**Implemented:** two nullable columns, `submission_opens_on date` and `submission_closes_on date`, with a
check that the close date is on or after the open date. They are **guidance dates**: uploads remain gated
by the manual `status = 'open'` (one open period at a time); the dates drive due-date display, the
Phase 6 "reporting deadline approaching" notification and Control Tower missing-submission logic.

**Why:** Master Approach §7C lists "Define submission windows" as an Admin capability and
`03_APP_FLOW.md` §2.2 lists "Set submission-window dates", but the schema had nowhere to store them.
Automatic scheduling was rejected (no scheduler component; collides with the single-open-period
constraint) — `.grill/phase-4-admin-foundation-decisions.md`.

## D11 — The OCR worker is a second trusted server-side writer (Phase 2B)

**D1 says:** lifecycle mutations run in server-side tRPC procedures.

**Implemented:** the Python OCR worker (`apps/ocr-worker`, service connection) also writes, within a
narrow, fixed scope and always with its audit entries in the same transaction (`user_id` null — system
events, Master Approach §31):

- `ocr_jobs` claim/status/retry/error fields; `ocr_extractions` and `ocr_fields` (extracted values and
  confidence only — never `verified_value`, `verification_status` or `verified_by`);
- `documents.upload_status` (processing → ready | failed) and `documents.document_type_id` when the
  document is confidently classified among the types mapped to its metric;
- `esg_records.verification_status` from `document_uploaded` to `ocr_completed` only (guarded by the
  current state). Validation, approval, calculation and activity-value columns are never touched.
- `notifications` (added in Phase 6): one outcome notification for the uploader — `verification_needed`,
  `low_confidence` or `ocr_failed` — in the same transaction as the job result.

**Why:** TRD §22 makes the worker ↔ app boundary the shared tables — there is no endpoint to call — and
Phase 7 needs `document_type_id` and a completed record state after OCR. Decision:
`.grill/phase-2b-ocr-worker-decisions.md`.

## D12 — `metric_field_requirements` seeded early (migration `0013`)

**Plan says:** field requirements are seeded in Phases 10 (Diesel) and 11 (Grid Electricity).

**Implemented:** the Diesel (quantity, unit, invoice_number, billing_period) and Grid Electricity
(consumption, unit, billing_period, optional source_classification) rows are seeded in Phase 2B, with the
field keys named in the plan, so the OCR worker reads *which* fields to extract from configuration.
`is_critical` is left false for Phases 10–11 to decide.

## D13 — `org_settings.updated_by` nullable; OCR threshold seeded (migration `0014`)

**Schema says (§14.2):** `updated_by uuid not null`.

**Implemented:** `updated_by` is nullable, and `ocr_confidence_threshold = 80` (percent, the
`ocr_fields.confidence` scale) is seeded with `updated_by` null, meaning "system default". Admin changes
(Settings page, later phase) always set it.

**Why:** the threshold must exist as configuration from the first upload (TRD §23: not hard-coded), but a
migration runs before any user exists, so a not-null `updated_by` made seeding impossible. Decision:
`.grill/phase-6-ocr-integration-decisions.md`.

## D14 — `percentage` formula type (migration `0020`)

**Schema says (§6.7):** `formula_type enum(direct_multiply, subtract, custom)`, `custom` reserved.

**Implemented:** a fourth value, `percentage` — part ÷ whole × 100, with
`formula_definition = {"part": "<field_key>", "whole": "<field_key>"}`. `subtract` is implemented as
specified (`{"inputs": ["withdrawal", "discharge"]}`); `custom` is still never evaluated.

**Why:** BRSR HR and procurement indicators are shares (% women, % trained, MSME share of spend) that
HR and Procurement must not calculate themselves (Master Approach §18). A named type keeps each formula
reviewable instead of turning `custom` into an expression language. Decision:
`.grill/phase-13-role-modules-decisions.md`.

## D15 — `brsr_metric_mappings.is_applicable` (migration `0022`)

**Schema says (§11.3):** `id`, `esg_metric_id`, `brsr_indicator_id`, `mapping_notes`.

**Implemented:** plus `is_applicable boolean not null default true`.

**Why:** `03_APP_FLOW.md` §2.2 BRSR Mapping lists "mark a mapping's applicability" as a primary action, and
the schema has nowhere to store it. Switching a mapping off keeps its history and notes; the readiness tree
ignores it. Decision: `.grill/phase-14-brsr-mapping-decisions.md`.

## D16 — `submission_expectations` (migration `0024`)

**Schema says:** nothing — no table records which submissions are expected.

**Implemented:** `submission_expectations (id, org_unit_id, metric_id, created_by, created_at)`, unique per
org unit and metric; RLS read like the org unit, server-only writes. `org_settings.brsr_readiness_weights`
holds the BRSR Readiness % weights.

**Why:** UI brief §13.1's Submission Completion % ("of expected submissions this period"), the Scope 1/2/3
Completion % cards and the "projects with missing submissions" issue all need a denominator, and deriving
it from history would never report a project that has not submitted at all. Decision:
`.grill/phase-16-control-tower-decisions.md`.

## D17 — `report_runs` covers a period or a financial year (migration `0025`)

**Schema says (§13.1):** `reporting_period_id uuid not null`.

**Implemented:** `reporting_period_id` is nullable and `financial_year integer` (the April–March year by its
starting calendar year) sits beside it; a check constraint requires exactly one. A private `reports`
storage bucket holds the rendered PDFs.

**Why:** BRSR is an annual disclosure, and the owner chose reports by period or financial year; a year is
many monthly periods, which one foreign key can't express. Decision:
`.grill/phase-17-reporting-decisions.md`.

## D18 — `brsr_metric_mappings.reported_value` (migration `0026`)

**Schema says (§11.3):** a mapping links a metric to an indicator, nothing about which of the metric's values
the indicator reports.

**Implemented:** `reported_value text not null default 'result'`, `'result'` or `'activity'`: the calculated
result (emissions, water consumed, a percentage) or the verified quantity. The waste → P6-E8 mapping reports
the quantity; its emissions go to P6-L4.

**Why:** found while checking the first generated report (Phase 17): P6-E8 asks for waste in metric tonnes,
but reporting every metric's calculated result printed the waste's emissions there. Decision:
`.grill/phase-17-reporting-decisions.md`.

## D19 — `rate_limit_events` and an append-only trigger on `audit_logs` (migration `0027`)

**Schema says:** nothing about rate limiting; `audit_logs` is "append-only" (§12.1) without saying how.

**Implemented:** `rate_limit_events (id, bucket, created_at)` — one row per counted attempt in a hashed
bucket (failed sign-ins per account and per client address, upload preparations per user); server-only.
Triggers on `audit_logs` refuse UPDATE, DELETE and TRUNCATE for every role. `audit_logs.created_at` defaults
to `clock_timestamp()` instead of `now()`, so the entries one transaction writes keep the order they happened.

**Why:** the security review found sign-in throttling effectively global (Supabase sees the app server's one
address) and the audit log protected only by grants. Decision: `.grill/phase-18-audit-security-decisions.md`;
review: `SECURITY_REVIEW.md`.

## D20 — `users.theme` (migration `0028`)

**Schema says:** nothing; the UI brief (§4) and App Flow (Profile) say the chosen theme is "persisted
per-user … synced to the profile record".

**Implemented:** `users.theme text not null default 'theme-1'`, checked to `theme-1`/`theme-2`/`theme-3`.
Readable by the user's own session like the rest of their row; changed only by the server
(`profile.setTheme`, audited `user.theme_changed`).

**Why:** so the choice follows the user to another device. Decision:
`.grill/phase-19-ui-polish-decisions.md`.

## D21 — `users.employee_id` and two bulk-import permissions (migration `0029`)

**Schema says:** nothing — bulk import isn't in any implementation-plan phase; the owner requested it
directly mid-session.

**Implemented:** `users.employee_id text`, nullable, unique when present (partial unique index) — only the
bulk-import path writes it, the single Admin "Invite user" form is untouched. Two new rows in
`permissions`: `user.bulk_import` and `org.bulk_import`, following the existing permission-code gate
pattern exactly (`permissionProcedure`), not a hard-coded role check. Admin gets both (migration `0009`'s
"every permission" pattern, repeated for just these two since that cross join already ran); `hr` gets
`user.bulk_import` by default; `org.bulk_import` starts unassigned, reassignable by an Admin from the
existing Roles & Permissions matrix.

**Why:** decision `.grill/bulk-import-decisions.md`.

## D22 — `password_reset_otps` (migration `0030`)

**Schema says:** nothing; Phase 3's auth decisions assumed Supabase Auth's own reset-link email, which only
reaches the Supabase team on the hosted project — the same reason bulk-import passwords need Brevo instead
of an invite link.

**Implemented:** `password_reset_otps (id, user_id, code_hash, expires_at, consumed_at, attempts,
created_at)` — server-only (RLS on, no policies, no browser grants), same shape as `rate_limit_events`
(D19). A 6-digit code is hashed before storage, expires in 10 minutes, and is capped at 5 wrong guesses.

**Why:** decision `.grill/bulk-import-decisions.md`. Replaces `resetPasswordForEmail`'s reset-link email for
`/forgot-password` only; `/reset-password` (invite / first-password-set) is unaffected.

## D23 — `users.theme` default changed to `theme-2` (migration `0031`)

**Schema says:** nothing (see D20).

**Implemented:** the column's default moves from `theme-1` to `theme-2`; the constraint and the column
itself are unchanged. Existing rows are left as they are — this only changes what a newly provisioned
account gets before anyone chooses for themselves.

**Why:** the owner asked for the "blue, red, white" theme (`theme-2`, labelled Corporate) to be the default,
not the peach/coral one (`theme-1`). Decision: `.grill/theme-toggle-decisions.md`.

## D24 — Multi-bill PDFs: `documents.is_bundle`, `documents.bundle_document_id`, `document_bundle_parts` (migration `0032`)

**Schema says:** nothing — one document is one record's evidence; a PDF holding several bills isn't covered.
Requested directly by the owner.

**Implemented:** `documents.is_bundle` (default false) marks an uploaded multi-bill PDF, which is a document of
its own with no record; `documents.bundle_document_id` points each bill cut from it back at it.
`document_bundle_parts (id, bundle_document_id, part_number, page_from, page_to, proposed_document_type_id,
proposed_metric_id, status, created_document_id)` holds the OCR's proposed split and, after the uploader confirms,
the confirmed one (`proposed` / `created` / `skipped`). Server-only like `rate_limit_events` (RLS on, no policies,
no browser grants). Each kept bill is an ordinary document, record and OCR job; nothing downstream changed.

**Why:** the owner wants one upload to fill several bills separately; the person still confirms the split.
Decision: `.grill/multi-bill-pdf-decisions.md`.

## Documentation cross-reference errors noticed (no schema impact)

- §16.4 refers to "a trigger (§17.3)"; the trigger is in §19.3.
- §3.1 refers to "a narrow view, §14.5"; no §14.5 exists (addressed by D5).
