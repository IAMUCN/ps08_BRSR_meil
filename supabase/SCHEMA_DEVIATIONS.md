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

## D25 — BRSR indicator codes renumbered to SEBI's July-2023 format (migration `0033`)

**Schema says:** nothing about which edition of the BRSR format the indicator codes follow. Migration `0022`
seeded them from the May-2021 format.

**Implemented:** five rows of `brsr_indicators` are renumbered in place — `A-18`→`A-20`, `A-22`→`A-24`,
`P6-E6`→`P6-E7`, `P6-E8`→`P6-E9`, `P6-L4`→`P6-L2` — with their descriptions. Ids, mappings and D18's
`reported_value` are unchanged, so snapshots of earlier reports keep resolving. `0022` is not edited.

**Why:** the final audit found the codes followed a superseded format (AUDIT_FIXES.md P0-3). Decision:
`.grill/audit-p0-decisions.md`.

**Differs from the SEBI PDF in the repository:** `ps_documents/provided_docs` holds SEBI's Annexure I in its
May-2021 numbering (greenhouse gases Essential 6, waste Essential 8, Scope 3 Leadership 4), and that PDF is the
one shared with the hackathon teams. The app follows the current numbering (7, 9, Leadership 2), as companies file
today (L&T's FY 2025-26 report, same folder), and the report footer says "as updated in July 2023". The questions
and tables are the same; only the numbers moved.

## D26 — `org_settings` key `brsr_report_inputs`; report snapshot version 2 (no migration)

**Schema says:** §13.1 `report_runs.snapshot_data` holds the reported values; nothing holds turnover, the PPP
rate or an assurance statement.

**Implemented:** an `org_settings` row with key `brsr_report_inputs`, value `{ "<FY start year>": { turnoverCr,
pppRate, physicalOutput, physicalOutputUnit, assurance, methodologyNote } }`, written by the Admin procedure
`reports.saveInputs` (audited as `report_inputs.updated`); the row does not exist until an Admin saves. The
snapshot gains `previous` (the previous financial year's figures, without records), `inputs` (both years),
`factors` (each conversion factor version the reported calculations used) and `orgUnitCount`; `version` is 2.
Version-1 snapshots are still readable — the report page uses only fields both versions have.

**Why:** SEBI's GHG, waste and Scope 3 tables need intensity per rupee of turnover, a PPP-adjusted intensity, a
previous-year column and an assurance note (AUDIT_FIXES.md P0-2). Decision: `.grill/audit-p0-decisions.md`.

## D27 — Hierarchy rules enforced by a trigger on `org_units` (migration `0034`)

**Schema says:** §4.1 gives `org_units` a self-referencing `parent_id` and the check that only a group may be a
root; the level ordering is described but not enforced.

**Implemented:** trigger `trg_enforce_org_hierarchy` (before insert, or update of `parent_id` / `unit_type`): a
child's `unit_type` must come strictly after its parent's in the enum's declared order, a group is never a child,
and a node's level cannot be changed to one at or after a child's. Violations raise `23514`. This makes cycles
impossible as well. Existing rows are not re-checked. The app's own checks (`lib/org/rules.ts`) are unchanged and
still give the friendly messages.

**Why:** the final audit inserted a project under a project, a subsidiary under a project and a cycle directly
(AUDIT_FIXES.md P1). Decision: `.grill/audit-p1-decisions.md`.

## D28 — Calculations append-only; `audit_logs` gains `ip_address`, `user_agent`, `session_id` (migration `0036`)

**Schema says:** §10.3 calculations are append-only by convention ("never updated, a new row is written"); §12.1
`audit_logs` has no column for where an action came from.

**Implemented:** triggers on `calculations` and `calculation_inputs` refuse DELETE, TRUNCATE and every UPDATE
except retiring a calculation (`is_current`), for every role. `audit_logs` gains three nullable text columns,
written by `writeAudit` from the request when a person acted.

**Why:** the final audit could delete a calculation directly and found approved records whose calculation rows
were gone; and it asked for the address, session and browser on audit entries (AUDIT_FIXES.md P2). Decision:
`.grill/audit-p2-decisions.md`.

## D29 — `org_levels` table; `org_units.unit_type` is a level code, not an enum (migration `0037`)

**Schema says:** §4.1 `org_units.unit_type` is the enum `org_unit_type` with seven fixed values.

**Implemented:** table `org_levels (id, code, label, sort_order)`, seeded with the seven levels under the same
codes; `org_units.unit_type` is `text` with a foreign key to `org_levels.code`; the enum type is dropped. A
trigger on `org_levels` keeps a level's code and position fixed, keeps `group` as the root level and refuses a
level before it. The hierarchy trigger of D27 compares positions from the table. Server-only: RLS on, no
policies, no grants to browser roles.

**Why:** PRD §11 says adding a hierarchy level is configuration; the final audit found it needed a migration
and a code change (AUDIT_FIXES.md P2). Decision: `.grill/audit-p2-decisions.md`.

## D30 — `conversion_factor_versions.gases`, `esg_metrics.emission_source`, evidence guard (migration `0038`)

**Schema says:** §10.2 a factor version has a value, units, source and geography; §6.2 a metric has a scope; no
rule in the database ties a verified record to a document.

**Implemented:** `conversion_factor_versions.gases` (nullable text, up to 60 characters): the gases the value
covers, as its source states. `esg_metrics.emission_source` (nullable; `combustion`, `process` or `fugitive`),
set for every Scope 1 activity. A trigger on `esg_records` refuses the change to `user_verified` when the record
has no row in `esg_record_documents`. The same migration adds activities and the `P6-E6` indicator as
configuration (no schema change).

**Why:** SEBI's greenhouse gas table asks for a break-up by gas "if available", and the KT session asks for
stationary, mobile, process and fugitive emissions to be told apart; the second audit found six local records
with no document. `gases` is not frozen by the factor-version guard (D-§19.3): it is a disclosure, not part of
a calculation. Decision: `.grill/audit-2-decisions.md`.

## D31 — `brsr_indicators.sdg_goals` (migration `0039`)

**Schema says:** §11.2 an indicator has a code, question text and type.

**Implemented:** `sdg_goals smallint[]`, not null, default empty, each value 1 to 17: the UN Sustainable
Development Goals the indicator is tagged with. Seeded for the ten indicators.

**Why:** the owner asked for SDG tags on the report (2026-10-09). The mapping is indicative, not SEBI's.
Decision: `.grill/audit-2-decisions.md`.

## D32 — The full BRSR format: question kinds and typed answers (migration `0040`)

**Schema says:** §11.2 an indicator has a code, question text and type; values come from mapped metrics.

**Implemented:** `brsr_indicators.answer_kind` (`data` or `statement`), `principle` (1 to 9), `part` (the
sub-heading in Sections A and B) and `sort_order`; all 146 questions of SEBI's format seeded. A new table
`brsr_disclosures` (question, financial year, answer, who and when; one row per question per year; server-only)
holds the answers an Admin types.

**Why:** the owner asked for a report like the L&T reference, which answers every question. Most questions are
written statements with no source document. Decision: `.grill/full-brsr-report-decisions.md`.

## D33 — A rate's scale in the percentage formula (migration `0041`)

**Schema says:** §10.3 a `percentage` formula is part ÷ whole × 100.

**Implemented:** the formula definition may carry `"scale"`; absent, it is 100. The lost time injury frequency
rate uses 1,000,000. The result's unit is the metric's own when the scale is not 100.

**Why:** safety incidents (BRSR P3-E11) are a rate per million person-hours; a new formula type would have
repeated the percentage's roll-up rule. Decision: `.grill/safety-and-water-discharge-decisions.md`.

## D34 — A read-only database role and saved conversations for the ESG data analyst

**Schema says:** nothing; `05_BACKEND_SCHEMA.md` has no chatbot, and §3 names two database roles for the
application (the browser's and the server's).

**Implemented (migration `0042`):**

- A third role, `chat_reader`, used only by the chatbot's lookups through `CHAT_DATABASE_URL`. It holds
  `SELECT` on a named list — reporting periods, scopes, metrics, formulas, field requirements, calculations
  and their inputs, conversion factors, validation results, the two consolidation views, and the columns of
  org units, records, factor versions and expected submissions that do not name a person — and a
  `SELECT … USING (true)` policy on each of those tables. Its transactions are read-only by default and time
  out after 10 seconds. It has no password in the migration; one is set by hand where the chatbot is used.
- Two server-only tables, `chat_conversations` and `chat_messages` (RLS on, no policies, no browser grants,
  no access for `chat_reader`): a person's saved questions and answers, kept 90 days from the last message.
- A permission, `chat.use`, held by every role that existed when the migration ran; an Admin grants or
  removes it per role on Roles & Permissions.

**Why:** the owner chose the strongest separation for a feature that hands a language model a way to ask for
data: whatever the model is talked into, the database refuses writes and holds nothing about people,
documents, OCR text, the audit log, settings or reports for it. The brief for the feature asked for reads
through RLS; here the server has always read through its own connection and checked org scope in code (D1),
and the consolidation views are closed to the browser role on purpose, so scope stays in server code and the
role bounds what can be reached at all. Decision: `.grill/chat-analyst-decisions.md`; overview: `CHATBOT.md`.

## D35 — A report run may cover a custom range of reporting periods (migration `0043`)

**Schema:** §13.1 gives `report_runs` one `reporting_period_id`; D17 added `financial_year`.

**Now:** two more columns, `period_from` and `period_to` (dates). A run covers exactly one of: a reporting
period, a financial year, or a range — every reporting period lying wholly between the two dates. The check
constraint `report_runs_one_coverage` was replaced to say so (both dates or neither, start not after end).

**Why:** the owner asked for reports over a custom period (2026-10-11). Records belong to reporting periods,
so a range of periods is the only custom period that reports exactly what was recorded. Decision:
`.grill/chat-admin-access-decisions.md`.

## D36 — An org unit may have more than one parent; several groups (migration `0044`)

**Schema:** §3 gives `org_units` one `parent_id`: a tree with one root.

**Now:** `parent_id` is the unit's main parent; a new table `org_unit_parents (org_unit_id, parent_id)` holds
each further parent. A trigger keeps the level rule for them (parent strictly earlier), keeps both in the
same group and refuses a parent the unit already has. `org_unit_tree` follows both kinds of link, one row
per ancestor–descendant pair; a new view `org_unit_links` lists every link; `my_org_unit_ids()` follows both.
The table and views are closed to the browser; `chat_reader` may read them. More than one row may have no
parent (several groups) — the schema always allowed it, the app now does.

**Why:** the owner asked for a project run by two subsidiaries to sit under both, counted in full in each and
once at the group, and for more than one group (2026-10-11). Decision:
`.grill/shared-org-units-decisions.md`.

## D37 — Carbon credits registry ledger, anti-double-counting reconciliation, and internal carbon pricing (migration `0046`)

**Schema:** `05_BACKEND_SCHEMA.md` originally specified Scope 1/2/3 operational accounting without carbon market offsets or capital expenditure shadow pricing.

**Implemented (migration `0046`):**
- `carbon_credits`: Registry batches (India CCTS, Verra VCS, Gold Standard, I-REC, BEE ESCerts, Internal Shadow) with serial ranges, vintage, methodology, verifier, and lifecycle statuses (`MINTED`, `HELD`, `TRANSFERRED`, `RETIRED`).
- `carbon_credit_transactions`: Append-only transactional ledger tracking internal retirements against reporting periods/scopes, and transfers to external counterparties. Immutability enforced via database trigger preventing any UPDATE or DELETE.
- `internal_carbon_prices`: Enterprise and subsidiary shadow carbon pricing schedules per tCO2e (benchmark ₹2,500/tCO2e seeded for root entity).
- `capex_carbon_evaluations`: Project proposals evaluating NPV, IRR, and payback with shadow price monetizing avoided emissions.
- Three permissions: `carbon_credit.view`, `carbon_credit.manage`, `icp.manage`.

**Why:** Roadmap requirement for Carbon Markets - Credit Tracking & Double-Counting Prevention and Internal Carbon Pricing CapEx Evaluator for SEBI BRSR net emissions reporting.

## D38 — Data isolation rules enforced by the database for every writer (migration `0047`)

**Schema says:** nothing on these points; RLS scopes the browser roles and the application is trusted for the rest.

**Built:** six additions, none of which changes a legitimate workflow (database audit of 2026-10-12,
`DATABASE_AUDIT_2026-10-12.md`):

- `esg_records.org_unit_id` / `submitted_by` and `documents.org_unit_id` / `uploaded_by` cannot change once filed.
- An evidence link (`esg_record_documents`) must join a record and a document of the same org unit.
- A carbon-credit batch cannot have more retired and transferred than it holds; a retirement must name its
  period, beneficiary and scope, a transfer its counterparty (constraints added `NOT VALID`); one active
  internal carbon price per org unit.
- `chat_reader` no longer reads the four carbon tables (no chatbot lookup uses them).
- `org_settings` is readable by Admins only (it now holds turnover, assurance details and rate limits).
- Browser roles lose the unused `MAINTAIN` privilege; trigger functions are not executable by them; every
  function in `public` has a fixed search path.

**Why:** the application's own connection and the service role bypass RLS, so rules about ownership and the
ledger have to live in triggers and constraints to hold for every writer. Each section of the migration lists
its own undo.

## Documentation cross-reference errors noticed (no schema impact)

- §16.4 refers to "a trigger (§17.3)"; the trigger is in §19.3.
- §3.1 refers to "a narrow view, §14.5"; no §14.5 exists (addressed by D5).

## D39 — Default permissions of the seeded roles reviewed (migration `0048`)

**Change:** Corporate ESG / Sustainability also holds `validation.review` and `report.generate`. No permission
is added to or removed from the catalogue; no other role changes; custom roles are untouched.

**Why:** the owner asked for each role's permissions to follow how the roles work in a real organisation
(`.grill/role-permissions-decisions.md` has the full table). The corporate sustainability team approves and
monitors, and needs the two steps between: settling flagged values and producing the report. Both are limited
to the person's org scope. Organisation-wide configuration stays with Admin.

## D40 — A role can upload on behalf of another role (migration `0049`)

**Change:** `roles.uploads_for_role_id` (nullable, references `roles`, not itself).

**Why:** the schema gives each ESG category one owning role, and only that role is offered the category's
activities on Upload. The owner added an Employee role whose people file the bills their Project Manager is
responsible for; a custom role owns no category and was offered nothing. The column lends one role's
categories to another for uploading without taking them away (`.grill/employee-uploads-decisions.md`).

## D41 — Super Admins and scoped Administrators (migration `0050`)

**Change:** a new system role `org_admin` ("Administrator") with eleven of the existing permissions and none
of the configuration ones; the `admin` role is renamed "Super Admin"; a setting `super_admin_limit` (2); a
trigger function `enforce_super_admin_limit()` on `user_org_assignments` and on `users`.

**Why:** the schema has one global Admin role and nothing limits how many people hold it — the hosted project
had five within three weeks. The owner decided (2026-10-13, `.grill/scoped-admin-onboarding-decisions.md`)
that group-wide configuration belongs to at most two Super Admins and that everyone else who administers is
limited to the org unit they are assigned at and everything beneath it.

**How it is enforced:** `is_admin()` and every policy that calls it are unchanged and keep meaning the Super
Admin, so nothing opened to an Administrator by accident. Their reach is the org scope the app already had
(`lib/auth/scope.ts`), checked in each procedure; who may hand out which role where is one pure rule
(`lib/users/rules.ts`: `checkGrant`, `checkAccountReach`). The limit counts unrevoked `admin` assignments on
active, undeleted accounts under a transaction-scoped lock, so two grants at once cannot both pass; a
deactivated Super Admin frees a place and cannot be reactivated while it is taken. The migration refuses to
run on a database that is already over the limit.

## D42 — Invitation links (migration `0051`)

**Schema document:** has no invitation table; accounts were to be invited by Supabase Auth's own email.

**What exists:** `public.user_invitations` (`user_id`, `token_hash`, `created_by`, `created_at`,
`expires_at`, `consumed_at`, `revoked_at`), server-only (RLS on, no policy, no browser grant), and the
setting `org_settings.invitation_valid_hours` (24).

**Why:** Supabase's invite link is used up, and signs the person in, by a plain GET, which mail scanners
perform; and since A36 new accounts were emailed a temporary password. The owner decided no password is
ever emailed (`.grill/scoped-admin-onboarding-decisions.md`).

**Rules the database holds for every writer:** only a SHA-256 can be stored as the token; an account has at
most one link that is neither used nor revoked; a link is used or revoked, never both; a used or revoked
link cannot be changed; a link's account, token and expiry cannot be changed.

**Undo:** drop the table and `guard_user_invitation()`, delete the setting.

## D43 — Session time limits (migration `0052`)

**Schema document:** sessions are Supabase Auth's; no table.

**What exists:** `public.user_sessions` (one row per sign-in, keyed by the `session_id` claim of the access
token: `user_id`, `started_at`, `last_activity_at`, `ended_at`, `ended_reason`), server-only; the functions
`session_limits()` and `touch_session(session, user, activity)`, not callable by the browser roles; the
setting `org_settings.session_limits` (`{"idle_minutes": 180, "absolute_minutes": 720}`).

**Why:** a Supabase session lives for as long as its refresh token is used. The owner decided on 3 hours
without activity and 12 hours in all, enforced by the app.

**Behaviour:** `touch_session` registers a session seen for the first time, ends one past either limit
(for good: an ended session never becomes active again) and, only when told the person did something,
moves the idle clock. A session id belongs to the person it started with. A missing or senseless setting
gives the default limits. Rows older than 30 days are removed when someone signs out.

**Undo:** drop the two functions and the table, delete the setting.

## D44 — Reporting periods close by themselves; a pop-up marker per account (migration `0053`, 2026-11-01)

`close_expired_reporting_periods()` closes an open period past `submission_closes_on` (else `end_date`), India
time, with a system audit entry and a `period_closed` notification to Super Admins; `pg_cron` runs it every five
minutes (`close-expired-reporting-periods`). Records are not touched. `users.notifications_seen_at` records how
far pop-ups have reached, so each notification pops up once per account. The schema specified manual open and
close only. `.grill/org-tree-users-notifications-periods-decisions.md`.

## D45 — One signed-in session per account (migration `0055`, 2026-11-07)

`user_sessions` gains `user_agent`, `ip_address`, `replaced_by` and the ending `replaced`. `live_sessions()` lists a
person's sign-ins that are within both time limits and still known to Supabase Auth. `start_session()` (the
sign-in form) refuses to start beside a live sign-in unless told to replace it; replacing ends the others as
`replaced`, deletes their `auth.sessions` rows (refresh tokens cascade) and writes `auth.session_replaced` to the
audit log with both devices, in one transaction; refusing deletes the new `auth.sessions` row. `touch_session_single()`
is `touch_session()` for code from this migration on: a session it has never seen replaces the others, so a sign-in
that skipped the form cannot sit beside another. `touch_session()` itself is unchanged, so code built before keeps
its behaviour. The specification allows any number of sessions. feature_enhancement.md requirements 18 and 32;
`.grill/feature-enhancement-roadmap-decisions.md`.

**Undo:** in the migration's header.

## D46 — Several open periods, late uploads, bill number (migration `0056`, 2026-11-07)

The one-open-period unique index is dropped: several periods may be open at once and the uploader picks one.
`reporting_periods.late_uploads_until` (after the due date `submission_closes_on`, uploads are accepted and marked
late until this day); `reporting_period_late()`, `reporting_period_locked()` and `reporting_period_today()`;
`close_expired_reporting_periods()` closes a period when its late window ends (a period without the date closes on
its due date, as before). `esg_records.submitted_late` (fixed at upload) and `esg_records.bill_number` (the confirmed
invoice number, written by validation; existing ones back-filled). `documents.document_type_source` ('person',
'admin'; null with a type = chosen by OCR). Validation adds built-in Late and Same-file checks; the configured
`duplicate_invoice` check now means "same bill" across every unit and period (bill number + billing period +
activity). feature_enhancement.md Phase 2; `.grill/feature-enhancement-roadmap-decisions.md`.

**Undo:** in the migration's footer.

## D47 — Grid Electricity records its bill number (migration `0057`, 2026-11-08)

An optional `invoice_number` field ("Bill number") for Grid Electricity, so the same-bill check and the Bill no.
column work for electricity bills; the utility in Source classification stands in for the supplier. OCR rules-14
also stores `page_sizes`, `classification.mismatch` and `diagnostics` in `ocr_extractions.raw_output` (no schema
change). feature_enhancement.md Phase 3; `.grill/feature-enhancement-roadmap-decisions.md`.

## D48 — Forwarding a report for verification (migration `0058`, 2026-11-08)

`report_forwards`: one row per step of a report travelling up the organisation (from unit, to unit — null for the
Super Admins — who forwarded, an optional note, the previous step, and the decision: pending, verified or returned
with a reason). One open step per report and receiver; server-only. The receivers are the Administrators of the
next unit up that has any (lib/reports/forwarding.ts). The audit log is now readable by everyone through the app,
scoped: own entries, plus an Administrator's units' entries (lib/trpc/routers/audit.ts); no schema change for that.
feature_enhancement.md Phase 4; `.grill/feature-enhancement-roadmap-decisions.md`.

**Undo:** `drop table public.report_forwards`.

## D49 — Deadline reminder schedule and sends (migration `0059`, 2026-11-08)

`org_settings.reminder_schedule`: the days before a period's due date on which reminders go out and which of them
also by email (default 7 to 0 days in the app, email on 7, 5, 3 and the due day; India time). `reminder_sends`: one
row per reminder per period, kind (owner, digest), recipient, schedule day and channel, unique on those five, with
its status (sending, sent, failed), attempts (a failed email is tried once more), the number missing and the units it
covers. Server-only (RLS on, no browser grants). Written by lib/reminders/run.ts, called daily by Vercel Cron
(/api/cron/reminders, protected by `CRON_SECRET`) or by a Super Admin's Run now. feature_enhancement.md Phase 5;
`.grill/feature-enhancement-roadmap-decisions.md`.

**Undo:** `drop table public.reminder_sends; delete from public.org_settings where key = 'reminder_schedule';`

## D50 — Factor sources, factor approval and carbon-credit links (migration `0060`, 2026-11-08)

`conversion_factor_versions` gains `source_url` (https only), `source_publisher`, `financial_year` ("2026-27"),
`source_retrieved_on`, `value_origin` (manual or fetched), `source_content_sha256`, `approved_by`, `approved_at`,
`self_approved` and `review_note`. A check keeps the approver consistent (self-approved only by the person who entered
it, and only when marked so); a trigger refuses a version entering use (inserted active, or a draft switched on)
without an approver, and any change to an approval once made. Versions active before the migration are untouched (no
approver). `org_settings.factor_source_hosts`: the official sites a link may be fetched from. `carbon_credit_links`:
outside sites for exploring or trading credits (https only, unique address, last check), server-only.
feature_enhancement.md Phase 6; `.grill/feature-enhancement-roadmap-decisions.md`.

**Undo:** in the header of `0060_factor_sources_approval_credit_links.sql`.

## D51 — Emission threshold alerts (migration `0061`, 2026-11-09)

`org_settings.emission_alert_settings` (daily check on/off, threshold per scope in percent, earlier years needed,
smallest increase in tCO2e, how far back a closed period is checked). `emission_alerts`: one row per org unit,
reporting period and scope whose approved emissions came out above the mean of the same period in up to three
earlier financial years by more than the threshold; it keeps the measured figure, the average, the threshold and the
periods averaged, which a trigger keeps unchanged; an alert is acknowledged once, with who, when and a note.
`emission_alert_sends`: one row per alert, person and channel, claimed before sending. Both tables server-only.
feature_enhancement.md Phase 7; `.grill/feature-enhancement-roadmap-decisions.md`.

**Undo:** in the header of `0061_emission_alerts.sql`.

## D52 — Report templates (migration `0062`, 2026-11-09)

`report_runs.template` ('brsr', 'brsr_core', 'ghg', 'summary'; default 'brsr', which is what every earlier run
printed) and `report_runs.workbook_path` (a run id with `.xlsx`, for the GHG inventory's Excel workbook). The private
`reports` bucket accepts `.xlsx` beside `.pdf`. feature_enhancement.md Phase 8.1;
`.grill/feature-enhancement-roadmap-decisions.md`.

**Undo:** in the header of `0062_report_templates.sql`.

## D53 — Document description (migration `0063`, 2026-11-11)

`documents.description`: optional text, at most 500 characters (check `documents_description_length`), typed by
the uploader on Upload and changeable by them (`documents.setDescription`, audited `document.description_changed`)
until the record is approved or rejected. A bill cut out of a multi-bill PDF copies the PDF's description. No
browser write grant. Owner's request; `.grill/upload-description-progress-decisions.md`.

**Undo:** `alter table public.documents drop column description;`

## D54 — Conversion factors per financial year (migration `0064`, 2026-11-11)

`conversion_factor_versions.effective_from` is always 1 April and `effective_to` (now required) always 31 March:
a trigger rounds any written date to its financial year, with check constraints behind it. A version after its
last year is inherited until a newer one starts (the engine ignores `effective_to` when choosing). Existing rows
were moved to year boundaries (old dates in `factor.version_years_set` audit entries). Owner's decision;
`.grill/factor-financial-years-decisions.md`.

**Undo:** in the header of `0064_factor_financial_years.sql`.

## D55 — The eye button's choice on the account (migration `0065`, 2026-11-11)

`users.show_extraction_boxes boolean not null default false`: Verify Extraction draws where each value was read,
coloured by confidence. Server-written (`profile.setShowExtractionBoxes`), audited. Owner's request;
`.grill/extraction-boxes-toggle-decisions.md`.

**Undo:** `alter table public.users drop column show_extraction_boxes;`

## D56 — Demo requests (migration `0066`, 2026-11-11)

`demo_requests` (name, email, phone, created, contacted at / by): server-written, RLS on with no policy and no
browser grants, listed for Super Admins. `org_settings.demo_video` holds the YouTube id of the video shown after a
request. Owner's request; `.grill/demo-requests-decisions.md`.

**Undo:** in the header of `0066_demo_requests.sql`.

## D57 — One upload for every bill: bill identifiers, per-bill period, original files (migration `0067`, 2026-11-12)

`document_bundle_parts` gains `billing_period` and `bill_number` (what OCR read on each proposed bill) and
`reporting_period_id` (the period the uploader filed it in). New `document_bundle_sources`: the files of one
upload in order, with name, type, size, SHA-256, storage path and the upload pages each one is. Server-only (RLS on,
no browser grants). `.grill/merged-upload-decisions.md`.
