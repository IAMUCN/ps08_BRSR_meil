# Backend Schema Document
## PS-08 — Evidence-First ESG/BRSR Reporting Platform (EmeilSG)

**Document ID:** 05_BACKEND_SCHEMA.md
**Version:** 1.0
**Status:** Draft for review — migration-ready
**Source of truth, in order:** `Master_Approach.md` → `01_PRD.md` → `02_TRD.md` → `03_APP_FLOW.md`. Target platform: **Supabase Postgres** (per `02_TRD.md` §6). This document does not re-decide what those documents already settled — see §1 for what's inherited versus decided here.

**Full reasoning trail:** `.grill/backend-schema-decisions.md`.

---

## 1. Objective, Inherited Decisions, and Conventions

**Objective:** a complete, implementable schema such that every reported ESG/BRSR value is traceable through `Document → OCR Extraction → User Verification → ESG Record → Validation → Conversion Factor → Calculation → Scope → BRSR Mapping → Report`, with authorization enforced at the database layer.

**Inherited, not re-decided here:**
- One canonical `esg_records` table serving both emission and non-emission metrics (`Master_Approach.md` §14).
- One self-referencing `org_units` hierarchy table, configurable depth (`02_TRD.md` §29).
- Single organization tree per deployment — **no `tenant_id` column anywhere** in this schema (confirmed this session; see grill log).
- `documents` ↔ `esg_records` is many-to-many via a join table (confirmed this session).

**Conventions used throughout:**
- Primary keys: `id uuid primary key default gen_random_uuid()`.
- Timestamps: `created_at timestamptz not null default now()`; `updated_at timestamptz not null default now()` where a row is ever mutated (maintained by a shared trigger, §16.1).
- **Append-only / immutable tables** (no UPDATE or DELETE permitted at the application layer, enforced by omitting those grants in RLS): `audit_logs`, `calculations`, `calculation_inputs`, `ocr_extractions`, `verifications`, `approvals`, `validation_results`. History is preserved by inserting new rows, never mutating old ones — this is the concrete mechanism behind "never silently overwrite important historical data" (`Master_Approach.md` §31).
- **Soft-delete tables** (`deleted_at timestamptz null`, never hard-deleted from the app): `documents`, `org_units`, `users` (profile row), `esg_metrics`, `brsr_indicators`. Evidence and configuration history must survive a "deactivation."
- Money/quantity values: `numeric` (never `float`/`double precision`) — this is a regulatory-calculation product; floating-point rounding error is not acceptable here.
- Enums are implemented as Postgres `enum` types where the vocabulary is small and rarely changes (documented per-table); anything the product needs to be **admin-configurable at runtime** (scopes, BRSR indicators, validation rules, roles) is a **table**, not an enum — this is the direct schema expression of "configuration over hard-coding" (`Master_Approach.md` §46).
- `org_units.unit_type` is implemented as an enum rather than a further lookup table — a deliberate simplification given the 7-level reference hierarchy is stable; if arbitrary, runtime-configurable level *types* become a real requirement, the upgrade path is replacing this enum with an `org_unit_types` lookup table. Flagged here, not silently decided.

---

## 2. Entity List — Deviations From the Suggested Set

Per the brief's own instruction not to blindly create every suggested table, these deviations are made and explained (full reasoning in the grill log):

| Suggested | Actual | Why |
|---|---|---|
| `user_roles` + `user_assignments` | `user_org_assignments` (one table) | Role is inherently scoped per org assignment — a user's role at Project X and role at Project Y are two different real-world facts, correctly modeled as two rows in one table, not a join across two separate concepts. |
| `document_metric_mappings` | `document_type_metric_mappings` | Same concept, precise naming (maps document *types*, not individual documents, to metrics). |
| `conversion_factors` (single, self-versioning) | `conversion_factors` + `conversion_factor_versions` | Calculations must reference an immutable specific version; a self-versioning table makes that reference ambiguous once edited. |
| `scopes` | `scopes` (kept, but as a real configurable table, not an enum) | Required specifically to support modular, admin-addable Scope 3 categories without a schema migration. |
| `brsr_reporting_values` | *(not created as a standalone table)* | Current BRSR values are always derivable live from `esg_records` + `brsr_metric_mappings`; a separate "current values" table would need constant sync and risks staleness. Point-in-time values are captured inside `report_runs` output instead. |
| `reports` + `report_runs` | `report_runs` (one table) | Nothing in `03_APP_FLOW.md` describes a reusable saved report *configuration* distinct from a one-shot generation — every report is a run. |
| `calculation_inputs` | kept, as designed | Genuinely needed: some formulas combine multiple named inputs (e.g., water consumption = withdrawal − discharge, per `Master_Approach.md` §19), which a single flat `calculations` row can't represent cleanly. |

---

## 3. Identity & Access Tables

### 3.1 `users` (application profile, extends `auth.users`)

Supabase Auth owns `auth.users` (credentials, sessions) per `02_TRD.md` §7. This table holds the application-level profile, one row per `auth.users` row.

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK, FK → `auth.users.id` | 1:1 with Supabase Auth user |
| `display_name` | `text` | No | — | | |
| `email` | `text` | No | — | Unique | Denormalized from `auth.users` for convenient querying |
| `is_active` | `boolean` | No | `true` | | Admin deactivate/activate (PRD §17 A) |
| `created_at` | `timestamptz` | No | `now()` | | |
| `updated_at` | `timestamptz` | No | `now()` | | |
| `deleted_at` | `timestamptz` | Yes | `null` | | Soft-delete only |

**Indexes:** `email` (unique, already covered). **Security:** row is readable by the user themself and by Admin (RLS, §14); never readable cross-user by non-admins beyond what's needed for "Submitted by / Verified by" display names (exposed via a narrow view, §14.5).

### 3.2 `roles`

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `code` | `text` | No | — | Unique | e.g. `admin`, `hr`, `project_manager`, `ehs`, `finance_csr`, `procurement`, `corporate_esg` |
| `name` | `text` | No | — | | Display label |
| `description` | `text` | Yes | `null` | | |
| `is_system_role` | `boolean` | No | `false` | | Seeded roles vs. Admin-created ones — supports PRD's "additional roles addable" requirement without code changes |
| `created_at` | `timestamptz` | No | `now()` | | |

**Seed data:** the 7 roles listed in every source document are inserted as `is_system_role = true` rows — the schema does not hard-code role names anywhere else; every reference is by FK to this table.

### 3.3 `permissions`

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `code` | `text` | No | — | Unique | e.g. `document.upload`, `record.verify`, `factor.manage`, `report.generate`, `approval.decide` |
| `description` | `text` | Yes | `null` | | |

### 3.4 `role_permissions`

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `role_id` | `uuid` | No | — | PK (composite), FK → `roles.id` | |
| `permission_id` | `uuid` | No | — | PK (composite), FK → `permissions.id` | |

**Cardinality:** many-to-many between `roles` and `permissions`.

### 3.5 `user_org_assignments`

The single source of truth for **who can do what, where** — every RLS policy in this schema ultimately reads from this table.

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `user_id` | `uuid` | No | — | FK → `users.id` | |
| `org_unit_id` | `uuid` | No | — | FK → `org_units.id` | |
| `role_id` | `uuid` | No | — | FK → `roles.id` | |
| `assigned_by` | `uuid` | No | — | FK → `users.id` | Admin who made the assignment |
| `assigned_at` | `timestamptz` | No | `now()` | | |
| `revoked_at` | `timestamptz` | Yes | `null` | | Soft-revoke — never delete an assignment row, to preserve "who could do what, when" history |
| — | — | — | — | Unique `(user_id, org_unit_id, role_id)` where `revoked_at is null` | Prevents duplicate active assignments |

**Cardinality:** one user can have many active assignments (different roles at different org nodes) — many-to-many between `users` and `org_units`, disambiguated by `role_id`. **Indexes:** `(user_id)`, `(org_unit_id)`, partial index on `(user_id, org_unit_id) where revoked_at is null`.

**Security:** this table is the authorization root — write access restricted to Admin only (both RLS and application layer); every other table's RLS policy transitively depends on this one being correct.

---

## 4. Organization Table

### 4.1 `org_units`

Single, self-referencing, configurable-depth hierarchy (`02_TRD.md` §29) — replaces the seven separate tables (`organizations`, `entities`, `business_units`, `regions`, `projects`, `sites`, `departments`) the brief listed as a starting point.

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `parent_id` | `uuid` | Yes | `null` | FK → `org_units.id` | `null` only for the single root (Group) |
| `unit_type` | `enum(group, subsidiary, business_unit, region, project, site, department)` | No | — | | See §1 trade-off note |
| `name` | `text` | No | — | | |
| `code` | `text` | Yes | `null` | Unique where not null | Short reference code, e.g. project code |
| `status` | `enum(active, inactive)` | No | `'active'` | | Deactivation, not deletion |
| `created_at` | `timestamptz` | No | `now()` | | |
| `updated_at` | `timestamptz` | No | `now()` | | |
| `deleted_at` | `timestamptz` | Yes | `null` | | |
| — | — | — | — | **Check:** root row (`parent_id is null`) must have `unit_type = 'group'`; exactly one such row expected at the application layer (not DB-enforced beyond this check, since a second root would be a data-entry error, not a valid state to hard-block at the constraint level — validated by Admin UI + a periodic integrity check instead) | |

**Cardinality:** one parent → many children (tree). **Indexes:** `(parent_id)`, `(unit_type)`, `(status)`.

**Relationship example (per brief's requested format):**
```
org_units.parent_id → org_units.id
```
Many org units belong to one parent org unit (self-referential tree; a Subsidiary has one parent Group, a Project has one parent Business Unit or Region, etc., per the configured depth).

**Security:** readable by any authenticated user for nodes within their assigned scope + descendants (§14); writable by Admin only.

---

## 5. Reporting Periods

### 5.1 `reporting_periods`

Global (not per-org-unit) — one calendar of periods applies platform-wide, per `Master_Approach.md` §29's monthly-submission model.

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `label` | `text` | No | — | Unique | e.g. `"August 2026"` |
| `period_type` | `enum(monthly, annual)` | No | `'monthly'` | | |
| `start_date` | `date` | No | — | | |
| `end_date` | `date` | No | — | | |
| `status` | `enum(draft, open, closed)` | No | `'draft'` | | Upload blocked (§0.4 of `03_APP_FLOW.md`) unless exactly one period has `status = 'open'` |
| `opened_at` | `timestamptz` | Yes | `null` | | |
| `closed_at` | `timestamptz` | Yes | `null` | | |
| — | — | — | — | **Check:** `end_date > start_date` | |
| — | — | — | — | Partial unique index `unique (status) where status = 'open'` — DB-level backstop for the "at most one open period" invariant, matching the rigor already used for `is_primary`/`is_current` elsewhere in this schema (added per audit Minor finding: this was previously application-layer-only) | |

**Indexes:** `(status)` (the "which period is currently open" lookup is hot-path, hit on every upload); the partial unique index above doubles as this lookup's index.

---

## 6. ESG Configuration Tables

### 6.1 `esg_categories`

Drives the "select ESG activity/category" step (`03_APP_FLOW.md` Upload Document page).

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `name` | `text` | No | — | | e.g. "Fuel & Energy," "Water," "Waste," "Workforce," "Procurement," "CSR/Finance" |
| `owning_role_id` | `uuid` | Yes | `null` | FK → `roles.id` | Which role primarily submits this category — drives role-scoped category lists. `null` = visible to every role's Upload category list (least-restrictive default, consistent with "configuration over hard-coding"), not hidden from all roles. |
| `description` | `text` | Yes | `null` | | |

### 6.2 `esg_metrics`

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `category_id` | `uuid` | No | — | FK → `esg_categories.id` | |
| `code` | `text` | No | — | Unique | e.g. `DIESEL_CONSUMPTION`, `GRID_ELECTRICITY`, `EMPLOYEE_HEADCOUNT` |
| `name` | `text` | No | — | | |
| `unit` | `text` | No | — | | Canonical/normalized unit for this metric (e.g. `L`, `kWh`, `count`) |
| `scope_id` | `uuid` | Yes | `null` | FK → `scopes.id` | `null` for non-emission BRSR metrics — this is exactly the polymorphism the canonical `esg_records` design (§9) is built to absorb without separate tables |
| `requires_conversion_factor` | `boolean` | No | `false` | | |
| `requires_calculation` | `boolean` | No | `false` | | Some metrics (e.g., raw headcount) are reported as verified values with no calculation step |
| `frequency` | `enum(monthly, annual)` | No | `'monthly'` | | |
| `description` | `text` | Yes | `null` | | |
| `deleted_at` | `timestamptz` | Yes | `null` | | |

**Indexes:** `(category_id)`, `(scope_id)`.

### 6.3 `metric_field_requirements`

Defines what OCR/verification fields a metric expects — drives which `ocr_fields` are treated as required/critical on the Verify Extraction screen.

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `metric_id` | `uuid` | No | — | FK → `esg_metrics.id` | |
| `field_key` | `text` | No | — | | e.g. `quantity`, `unit`, `invoice_number`, `billing_period` |
| `field_label` | `text` | No | — | | Display label |
| `data_type` | `enum(text, number, date, unit)` | No | — | | |
| `is_required` | `boolean` | No | `true` | | Missing → record `Incomplete` (`03_APP_FLOW.md` §4.5) |
| `is_critical` | `boolean` | No | `false` | | Critical fields always require explicit user acknowledgment before Confirm — **regardless of confidence score**, not via a separate/lower numeric threshold (single global `org_settings.ocr_confidence_threshold` still governs the amber-flag/percentage display for every field, critical or not). Clarified per audit finding M1; see `03_APP_FLOW.md` §4.6. |
| — | — | — | — | Unique `(metric_id, field_key)` | |

### 6.4 `document_types`

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `code` | `text` | No | — | Unique | e.g. `ELECTRICITY_BILL`, `DIESEL_INVOICE`, `WATER_METER_RECORD` |
| `name` | `text` | No | — | | |
| `accepted_mime_types` | `text[]` | No | `'{application/pdf,image/jpeg,image/png}'` | | Per `Master_Approach.md` §9 |
| `description` | `text` | Yes | `null` | | |

### 6.5 `document_type_metric_mappings`

Many-to-many — per `Master_Approach.md` §13, a document type maps to one or more possible metrics, and (implicitly) a metric can be evidenced by more than one document type.

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `document_type_id` | `uuid` | No | — | PK (composite), FK → `document_types.id` | |
| `metric_id` | `uuid` | No | — | PK (composite), FK → `esg_metrics.id` | |

### 6.6 `validation_rules`

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `metric_id` | `uuid` | Yes | `null` | FK → `esg_metrics.id` | `null` = applies globally across all metrics |
| `rule_type` | `enum(format, organizational, period, evidence, logical, anomaly)` | No | — | | Matches PRD §29's six categories |
| `rule_definition` | `jsonb` | No | — | | Structured rule parameters (e.g., `{"min": 0}` for a non-negative check) — deliberately data-driven rather than a hard-coded function per metric |
| `severity` | `enum(hard_fail, flag)` | No | `'hard_fail'` | | Anomalies are `flag` (review, not auto-reject) per `Master_Approach.md` §23 |
| `description` | `text` | Yes | `null` | | |
| `is_active` | `boolean` | No | `true` | | |

**Indexes:** `(metric_id)`, `(rule_type)`.

### 6.7 `calculation_formulas`

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `metric_id` | `uuid` | No | — | FK → `esg_metrics.id` | |
| `version` | `integer` | No | `1` | | |
| `formula_type` | `enum(direct_multiply, subtract, custom)` | No | `'direct_multiply'` | | `direct_multiply` = activity × factor (Scope 1/2 common case); `subtract` = e.g. water consumption = withdrawal − discharge; `custom` reserved, not built for MVP |
| `formula_definition` | `jsonb` | No | — | | e.g. `{"inputs": ["withdrawal", "discharge"], "op": "subtract"}` |
| `effective_from` | `date` | No | — | | |
| `effective_to` | `date` | Yes | `null` | | |
| `status` | `enum(draft, active, superseded)` | No | `'draft'` | | |
| — | — | — | — | Unique `(metric_id, version)` | |

**Indexes:** `(metric_id, status)`.

---

## 7. Scopes

### 7.1 `scopes`

A configurable lookup, not an enum, specifically so Scope 3 categories can be added as data (`02_TRD.md` §29's modular-Scope-3 requirement).

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `code` | `text` | No | — | Unique | `SCOPE_1`, `SCOPE_2`, `SCOPE_3_PURCHASED_GOODS`, `SCOPE_3_EMPLOYEE_COMMUTING`, etc. |
| `parent_scope_id` | `uuid` | Yes | `null` | FK → `scopes.id` | Scope 3 categories reference the `SCOPE_3` row as parent |
| `name` | `text` | No | — | | |
| `is_active` | `boolean` | No | `true` | | New Scope 3 categories can be inserted `is_active = false` and enabled later without touching application code |
| `sort_order` | `integer` | No | `0` | | |

**Seed data:** `SCOPE_1`, `SCOPE_2`, `SCOPE_3` (parent row) inserted at setup; basic applicable Scope 3 categories (PRD §22 MVP scope) inserted as children, advanced categories inserted later, `is_active = false` until enabled.

---

## 8. Documents & OCR Tables

### 8.1 `documents`

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `org_unit_id` | `uuid` | No | — | FK → `org_units.id` | Scope the document belongs to |
| `reporting_period_id` | `uuid` | No | — | FK → `reporting_periods.id` | Auto-assigned at upload (§0.4 of `03_APP_FLOW.md`), editable during verification |
| `document_type_id` | `uuid` | Yes | `null` | FK → `document_types.id` | May be `null` until OCR/user identifies it (`03_APP_FLOW.md` §4.5) |
| `storage_path` | `text` | No | — | | See §12 |
| `file_name` | `text` | No | — | | Original filename |
| `mime_type` | `text` | No | — | | |
| `file_size_bytes` | `bigint` | No | — | | |
| `file_hash` | `text` | No | — | | SHA-256, for duplicate detection (`Master_Approach.md` §41) |
| `uploaded_by` | `uuid` | No | — | FK → `users.id` | |
| `upload_status` | `enum(uploaded, processing, ready, failed)` | No | `'uploaded'` | | |
| `related_document_id` | `uuid` | Yes | `null` | FK → `documents.id` | Optional lightweight cross-reference (e.g., a certificate loosely related to a bill) — distinct from the formal `esg_record_documents` evidence link, §9.2 |
| `created_at` | `timestamptz` | No | `now()` | | |
| `deleted_at` | `timestamptz` | Yes | `null` | | Soft-delete only — documents are evidence, never hard-deleted (`Master_Approach.md` §36) |

**Indexes:** `(org_unit_id)`, `(reporting_period_id)`, `(document_type_id)`, `(uploaded_by)`, `(file_hash)` (duplicate-detection lookups), `(created_at)`.

**Security:** file content itself lives in Supabase Storage (§12), never directly public; this row's `storage_path` is only resolvable to a signed URL by the backend after an RLS-equivalent authorization check.

### 8.2 `ocr_jobs`

Corresponds to `02_TRD.md` §11's `document_jobs` job-queue table.

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `document_id` | `uuid` | No | — | FK → `documents.id` | |
| `status` | `enum(pending, processing, completed, failed)` | No | `'pending'` | | Polled by the Python OCR worker |
| `model_version` | `text` | Yes | `null` | | PaddleOCR model identifier, set on completion |
| `started_at` | `timestamptz` | Yes | `null` | | |
| `completed_at` | `timestamptz` | Yes | `null` | | |
| `error_message` | `text` | Yes | `null` | | Populated on `failed` (`03_APP_FLOW.md` §4.5) |
| `retry_count` | `integer` | No | `0` | | |

**Indexes:** `(status)` (hot path — worker polls this), `(document_id)`.

### 8.3 `ocr_extractions`

Append-only — one row per completed OCR job.

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `ocr_job_id` | `uuid` | No | — | FK → `ocr_jobs.id`, Unique | 1:1 with a completed job |
| `document_id` | `uuid` | No | — | FK → `documents.id` | Denormalized for direct querying |
| `raw_output` | `jsonb` | No | — | | Full raw model output, for debugging/reproducibility — never shown directly in UI, but preserved |
| `extracted_at` | `timestamptz` | No | `now()` | | |

**Indexes:** `(document_id)`.

### 8.4 `ocr_fields`

The core per-field extraction + verification record (PRD §19, TRD §23).

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `ocr_extraction_id` | `uuid` | No | — | FK → `ocr_extractions.id` | |
| `field_key` | `text` | No | — | | Matches `metric_field_requirements.field_key` where applicable |
| `field_label` | `text` | No | — | | |
| `extracted_value` | `text` | Yes | `null` | | Raw OCR value — `null` if the field wasn't found (§4.5, missing field ≠ invented value) |
| `confidence` | `numeric(5,2)` | Yes | `null` | | 0–100, `null` if not applicable |
| `verified_value` | `text` | Yes | `null` | | Set on user confirm/edit |
| `verification_status` | `enum(pending, confirmed, edited, rejected)` | No | `'pending'` | | |
| `verified_by` | `uuid` | Yes | `null` | FK → `users.id` | |
| `verified_at` | `timestamptz` | Yes | `null` | | |
| — | — | — | — | Unique `(ocr_extraction_id, field_key)` | |

**Indexes:** `(ocr_extraction_id)`, `(confidence)` (low-confidence monitoring queries).

**Note on field-edit history:** an edit to `verified_value` is captured via `audit_logs` (old/new value), not a separate correction-history table on `ocr_fields` — this row always represents the *current* verified value; the audit log carries the "who changed what, from what, when" history, consistent with §1's append-only-audit-log pattern rather than duplicating history in two places.

---

## 9. ESG Records & Lifecycle Tables

### 9.1 `esg_records` — the canonical record

Designed to serve both emission-related activity data and non-emission BRSR metrics (per the brief's explicit requirement), by making scope/calculation nullable rather than building separate tables per type.

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `org_unit_id` | `uuid` | No | — | FK → `org_units.id` | |
| `reporting_period_id` | `uuid` | No | — | FK → `reporting_periods.id` | |
| `metric_id` | `uuid` | No | — | FK → `esg_metrics.id` | |
| `scope_id` | `uuid` | Yes | `null` | FK → `scopes.id` | Denormalized from `esg_metrics.scope_id` at creation for query convenience; `null` for non-emission metrics — **this nullability is the whole mechanism enabling one canonical table instead of polymorphic per-type tables** |
| `activity_value_raw` | `numeric` | Yes | `null` | | As OCR extracted it, before any human edit |
| `activity_value_verified` | `numeric` | Yes | `null` | | After user confirm/edit — the authoritative "what actually happened" value |
| `activity_unit` | `text` | Yes | `null` | | Unit as verified (pre-normalization) |
| `activity_value_normalized` | `numeric` | Yes | `null` | | After unit normalization (TRD §27) |
| `normalized_unit` | `text` | Yes | `null` | | Canonical unit, matches `esg_metrics.unit` |
| `submitted_by` | `uuid` | No | — | FK → `users.id` | |
| `verified_by` | `uuid` | Yes | `null` | FK → `users.id` | |
| `verification_status` | `enum(draft, document_uploaded, ocr_completed, user_verified)` | No | `'draft'` | | Mirrors `Master_Approach.md` §30's early states |
| `validation_status` | `enum(pending, validated, flagged, failed, returned)` | No | `'pending'` | | |
| `approval_status` | `enum(not_submitted, review_pending, approved, returned, rejected)` | No | `'not_submitted'` | | Denormalized "current state" — full history lives in `approvals` (§9.5) |
| `calculation_status` | `enum(not_applicable, pending, calculated)` | No | `'not_applicable'` | | `not_applicable` for metrics where `requires_calculation = false` |
| `data_quality_state` | `enum(incomplete, complete, verified, validated, flagged, approved, rejected)` | No | `'incomplete'` | | PRD §35's per-record data-quality state |
| `is_duplicate_flag` | `boolean` | No | `false` | | Set by duplicate-detection logic, reviewed not auto-discarded (`Master_Approach.md` §41) |
| `created_at` | `timestamptz` | No | `now()` | | |
| `updated_at` | `timestamptz` | No | `now()` | | |
| — | — | — | — | **Check:** `activity_value_verified is null or activity_value_verified >= 0` (no negative quantities where not permitted, PRD §29E — metric-specific exceptions handled by `validation_rules`, this is the DB-level backstop) | |

**Indexes:** `(org_unit_id)`, `(reporting_period_id)`, `(metric_id)`, `(scope_id)`, `(submitted_by)`, `(validation_status)`, `(approval_status)`, `(created_at)` — this is the most heavily queried table in the system; composite index `(org_unit_id, reporting_period_id, metric_id)` supports the consolidation queries in §13.

**Relationship examples:**
```
esg_records.org_unit_id → org_units.id        (many records belong to one org unit)
esg_records.metric_id   → esg_metrics.id      (many records belong to one metric)
esg_records.scope_id    → scopes.id           (many records belong to one scope, or none)
```

### 9.2 `esg_record_documents`

The many-to-many evidence link, per this session's confirmed decision.

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `esg_record_id` | `uuid` | No | — | PK (composite), FK → `esg_records.id` | |
| `document_id` | `uuid` | No | — | PK (composite), FK → `documents.id` | |
| `is_primary` | `boolean` | No | `false` | | The document whose OCR extraction originally drove the record's creation |
| `added_by` | `uuid` | No | — | FK → `users.id` | |
| `added_at` | `timestamptz` | No | `now()` | | |
| — | — | — | — | **Check:** at most one `is_primary = true` row per `esg_record_id` (enforced via a partial unique index `unique (esg_record_id) where is_primary`) | |

**Cardinality:** many-to-many — one document can support many records (a combined bill), one record can have many documents ("add another document"). **MVP scope note (added per audit Dependency-Problem finding):** the Verify Extraction page is keyed by `documentId` (`03_APP_FLOW.md` §2.3, `/app/verify/[documentId]`) and `ocr_fields` are extracted per-document, not per-record — there is no UX anywhere in `03_APP_FLOW.md` or `06_IMPLEMENTATION_PLAN.md` for splitting one document's extracted fields across multiple `esg_records`. The one-document-supports-many-records case ("a combined bill") is therefore **not buildable in the MVP** even though the schema's many-to-many join table permits it structurally — MVP upload (`06_IMPLEMENTATION_PLAN.md` Phase 5) always creates exactly one `esg_records` row per upload, with `is_primary = true` on its single document. The join table's full many-to-many capacity (splitting one document across several records) is reserved for a future phase that would need its own dedicated verification UX; until that UX exists, treat "one document → one record" as the only supported path, and "one record → many documents" (add supporting evidence to an existing record) as the only many-sided case actually exercised.

### 9.3 `verifications`

The verification *event* (the Confirm action as a whole), distinct from per-field state in `ocr_fields`. Append-only.

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `esg_record_id` | `uuid` | No | — | FK → `esg_records.id` | |
| `ocr_extraction_id` | `uuid` | Yes | `null` | FK → `ocr_extractions.id` | `null` if this was a flagged manual-exception entry (`03_APP_FLOW.md` §4.5) |
| `verified_by` | `uuid` | No | — | FK → `users.id` | |
| `verified_at` | `timestamptz` | No | `now()` | | |
| `is_manual_exception` | `boolean` | No | `false` | | True when OCR failed and a human entered values directly — flagged for Admin visibility per the UI brief |
| `notes` | `text` | Yes | `null` | | |

**Indexes:** `(esg_record_id)`.

### 9.4 `validation_results`

One row per rule evaluation, append-only.

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `esg_record_id` | `uuid` | No | — | FK → `esg_records.id` | |
| `validation_rule_id` | `uuid` | Yes | `null` | FK → `validation_rules.id` | `null` for a built-in structural check not backed by a configurable rule row |
| `rule_type` | `enum(format, organizational, period, evidence, logical, anomaly)` | No | — | | Denormalized for fast filtering |
| `result` | `enum(pass, fail, flagged)` | No | — | | |
| `message` | `text` | Yes | `null` | | |
| `evaluated_at` | `timestamptz` | No | `now()` | | |

**Indexes:** `(esg_record_id)`, `(result)`.

### 9.5 `approvals`

Append-only history of approval decisions; `esg_records.approval_status` is the denormalized current state.

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `esg_record_id` | `uuid` | No | — | FK → `esg_records.id` | |
| `action` | `enum(submitted, approved, returned, rejected)` | No | — | | |
| `decided_by` | `uuid` | Yes | `null` | FK → `users.id` | `null` for the `submitted` action (system/auto-transition) |
| `decided_at` | `timestamptz` | No | `now()` | | |
| `reason` | `text` | Yes | `null` | | Required at the application layer for `returned`/`rejected` |
| — | — | — | — | **Check** (application-enforced, see §14.4): `decided_by` must not equal `esg_records.submitted_by` **and** must not equal the `verified_by` of that record's latest `verifications` row, for `action in ('approved','returned')` — self-approval prevention covers both submitter and verifier, per `03_APP_FLOW.md` §4.9 and `04_UI_UX_DESIGN_BRIEF.md` §12.5 (corrected per audit finding C2 — the prior version of this constraint checked `submitted_by` only) | |

**Indexes:** `(esg_record_id)`, `(decided_by)`.

---

## 10. Calculations & Conversion Factors

### 10.1 `conversion_factors`

The factor *concept* — stable identity across versions.

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `activity_type` | `text` | No | — | | e.g. `DIESEL`, `GRID_ELECTRICITY` |
| `name` | `text` | No | — | | |
| `created_at` | `timestamptz` | No | `now()` | | |

### 10.2 `conversion_factor_versions`

The actual versioned, effective-dated values — calculations FK here, never to `conversion_factors` directly.

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `conversion_factor_id` | `uuid` | No | — | FK → `conversion_factors.id` | |
| `version_number` | `integer` | No | — | | |
| `value` | `numeric` | No | — | | |
| `input_unit` | `text` | No | — | | |
| `output_unit` | `text` | No | — | | |
| `source_reference` | `text` | No | — | | **[VERIFY AGAINST AUTHORITATIVE SOURCE]** at data-entry time, per PRD §20/§40 |
| `geography` | `text` | Yes | `null` | | Applicability region |
| `effective_from` | `date` | No | — | | |
| `effective_to` | `date` | Yes | `null` | | |
| `status` | `enum(draft, active, superseded, retired)` | No | `'draft'` | | |
| `notes` | `text` | Yes | `null` | | |
| `created_by` | `uuid` | No | — | FK → `users.id` | |
| `created_at` | `timestamptz` | No | `now()` | | |
| — | — | — | — | Unique `(conversion_factor_id, version_number)` | |
| — | — | — | — | **Check:** `effective_to is null or effective_to > effective_from` | |

**Immutability rule:** once a version row has been referenced by any `calculations` row, its `value`/`input_unit`/`output_unit` are never updated — a correction creates a **new** version row and marks the old one `superseded`. Enforced at the application layer (and optionally a trigger raising an exception on attempted mutation of a referenced version, §16.3).

**Indexes:** `(conversion_factor_id, status)`, `(effective_from, effective_to)` (the "which version was effective on date X" lookup, hit on every calculation).

### 10.3 `calculations`

Append-only calculation trace, per TRD §24/§30.

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `esg_record_id` | `uuid` | No | — | FK → `esg_records.id` | |
| `conversion_factor_version_id` | `uuid` | Yes | `null` | FK → `conversion_factor_versions.id` | `null` for metrics not requiring a factor |
| `calculation_formula_id` | `uuid` | Yes | `null` | FK → `calculation_formulas.id` | |
| `input_value` | `numeric` | No | — | | |
| `input_unit` | `text` | No | — | | |
| `normalized_value` | `numeric` | No | — | | |
| `normalized_unit` | `text` | No | — | | |
| `factor_value_snapshot` | `numeric` | Yes | `null` | | The actual numeric factor value used, copied at calculation time — belt-and-suspenders reproducibility even if the version row is later inspected in a different context |
| `result_value` | `numeric` | No | — | | |
| `result_unit` | `text` | No | — | | |
| `scope_id` | `uuid` | Yes | `null` | FK → `scopes.id` | |
| `engine_version` | `text` | No | — | | Calculation-engine code version, for reproducibility |
| `calculated_at` | `timestamptz` | No | `now()` | | |
| `is_current` | `boolean` | No | `true` | | Marks the latest calculation for this record; a recalculation (e.g., after a returned-and-corrected record) inserts a new row and flips the prior row's flag |
| — | — | — | — | Partial unique index `(esg_record_id) where is_current` | At most one current calculation per record |

**Indexes:** `(esg_record_id)`, `(is_current)`, `(scope_id)`.

### 10.4 `calculation_inputs`

Only needed for multi-input formulas (e.g., water withdrawal − discharge, `Master_Approach.md` §19).

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `calculation_id` | `uuid` | No | — | FK → `calculations.id` | |
| `input_key` | `text` | No | — | | e.g. `withdrawal`, `discharge` |
| `input_value` | `numeric` | No | — | | |
| `input_unit` | `text` | No | — | | |
| `source_esg_record_id` | `uuid` | Yes | `null` | FK → `esg_records.id` | When an input is itself sourced from a separate verified record rather than the same one |

---

## 11. BRSR Tables

### 11.1 `brsr_sections`

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `code` | `text` | No | — | Unique | `A`, `B`, `C` — **[VERIFY AGAINST AUTHORITATIVE BRSR SOURCE]** |
| `name` | `text` | No | — | | |

### 11.2 `brsr_indicators`

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `section_id` | `uuid` | No | — | FK → `brsr_sections.id` | |
| `code` | `text` | No | — | Unique | **[VERIFY AGAINST AUTHORITATIVE BRSR SOURCE]** |
| `question_text` | `text` | No | — | | |
| `indicator_type` | `enum(essential, leadership)` | Yes | `null` | | Section C only, per `Master_Approach.md` §50 |
| `description` | `text` | Yes | `null` | | |
| `deleted_at` | `timestamptz` | Yes | `null` | | |

### 11.3 `brsr_metric_mappings`

Many-to-many, per TRD §26.

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `esg_metric_id` | `uuid` | No | — | FK → `esg_metrics.id` | |
| `brsr_indicator_id` | `uuid` | No | — | FK → `brsr_indicators.id` | |
| `mapping_notes` | `text` | Yes | `null` | | |
| — | — | — | — | Unique `(esg_metric_id, brsr_indicator_id)` | |

**Cardinality:** one metric can feed multiple BRSR indicators; one indicator can be fed by multiple metrics.

---

## 12. Audit Table

### 12.1 `audit_logs`

Append-only, covers every material event listed in the brief (upload, OCR completion, field correction, verification, validation, calculation, factor change, approval, rejection, mapping change, report generation, admin configuration change).

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `event_type` | `text` | No | — | | e.g. `document.uploaded`, `ocr_field.edited`, `record.verified`, `validation.evaluated`, `factor_version.created`, `approval.decided`, `brsr_mapping.changed`, `report_run.generated`, `org_setting.changed` |
| `entity_type` | `text` | No | — | | e.g. `esg_record`, `document`, `conversion_factor_version` |
| `entity_id` | `uuid` | No | — | | Not a formal FK (§1 note on polymorphism below) |
| `user_id` | `uuid` | Yes | `null` | FK → `users.id` | `null` for system-initiated events (e.g., OCR worker completion) |
| `old_value` | `jsonb` | Yes | `null` | | |
| `new_value` | `jsonb` | Yes | `null` | | |
| `reason` | `text` | Yes | `null` | | |
| `created_at` | `timestamptz` | No | `now()` | | |

**On polymorphism:** `entity_id` intentionally has no formal foreign key, since it references different tables depending on `entity_type` — this is the one deliberate, justified use of a polymorphic-style reference in this schema. It's acceptable here specifically because `audit_logs` is a write-once log, never joined for business logic (only queried by `entity_type + entity_id` for a specific record's history, or filtered by `user_id`/`created_at` for general audit browsing) — a real FK would require either one nullable FK column per possible entity type (unwieldy, given the number of tables audited) or a formal single-table-inheritance scheme that adds real complexity for no query benefit here. Every other relationship in this schema uses a proper FK.

**Indexes:** `(entity_type, entity_id)` (the "history of this specific record" lookup), `(user_id)`, `(created_at)`.

**Security:** insert-only from the application's service role (never client-writable); read access restricted to Admin (§14).

---

## 13. Reports

### 13.1 `report_runs`

One row per generated report (consolidates the brief's suggested `reports` + `report_runs` into one table — see §2).

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `requested_by` | `uuid` | No | — | FK → `users.id` | |
| `org_unit_id` | `uuid` | No | — | FK → `org_units.id` | Consolidation scope for this run |
| `reporting_period_id` | `uuid` | No | — | FK → `reporting_periods.id` | |
| `report_type` | `enum(esg, brsr, consolidated)` | No | — | | |
| `status` | `enum(pending, generating, completed, failed)` | No | `'pending'` | | Non-blocking generation (`03_APP_FLOW.md` §4.10) |
| `storage_path` | `text` | Yes | `null` | | Rendered PDF location in Storage, set on completion |
| `snapshot_data` | `jsonb` | Yes | `null` | | Point-in-time BRSR/ESG values as of generation — the mechanism replacing a standalone `brsr_reporting_values` table (§2). **Must include the list of contributing `esg_record_id`s per BRSR indicator/metric it reports** (e.g. `{"indicators": [{"brsr_indicator_id": "...", "esg_record_ids": ["...", "..."]}]}`) — this is what makes Master §30's `Included_In_Report` lifecycle state answerable ("was record X included in report run Y") without adding a denormalized status column to `esg_records` itself. Added per audit Missing-Requirement finding. |
| `error_message` | `text` | Yes | `null` | | |
| `requested_at` | `timestamptz` | No | `now()` | | |
| `completed_at` | `timestamptz` | Yes | `null` | | |

**Indexes:** `(org_unit_id, reporting_period_id)`, `(status)`, `(requested_by)`.

---

## 14. Notifications & Settings

### 14.1 `notifications`

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `user_id` | `uuid` | No | — | FK → `users.id` | |
| `type` | `text` | No | — | | e.g. `verification_needed`, `low_confidence`, `returned`, `approval_needed`, `approved`, `deadline_approaching` |
| `title` | `text` | No | — | | |
| `message` | `text` | No | — | | |
| `related_entity_type` | `text` | Yes | `null` | | |
| `related_entity_id` | `uuid` | Yes | `null` | | Same polymorphic-reference justification as `audit_logs` (§12.1) — drives the deep-link target, never joined for business logic |
| `deep_link_path` | `text` | No | — | | e.g. `/app/verify/{documentId}` per `03_APP_FLOW.md` §0.2 |
| `is_read` | `boolean` | No | `false` | | |
| `created_at` | `timestamptz` | No | `now()` | | |

**Indexes:** `(user_id, is_read)`, `(created_at)`.

### 14.2 `org_settings`

Simple key-value config store, backs the Admin Settings page (`03_APP_FLOW.md` §2.2).

| Column | Type | Nullable | Default | PK/FK/Unique | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` | No | — | PK | |
| `key` | `text` | No | — | Unique | e.g. `ocr_confidence_threshold`, `document_retention_days` |
| `value` | `jsonb` | No | — | | |
| `updated_by` | `uuid` | No | — | FK → `users.id` | |
| `updated_at` | `timestamptz` | No | `now()` | | |

---

## 15. File Storage Model

Per `02_TRD.md` §9, Supabase Storage — private bucket, signed URLs, no public bucket URLs ever reach the client.

**Bucket structure:**
```
evidence/                              (private bucket)
  {org_unit_id}/
    {reporting_period_id}/
      {document_id}/
        original.{ext}
```

**Path naming rationale:** grouping by `org_unit_id` then `reporting_period_id` means a storage-level access boundary (e.g., a bucket policy or prefix-based rule) can mirror the RLS org-scoping logic exactly, and it keeps a project's/period's evidence physically co-located for bulk export/retention operations. The `document_id` leaf directory (rather than a flat filename) avoids collisions and keeps the original filename recoverable from `documents.file_name` without encoding it into the path.

**Document metadata:** lives in the `documents` table (§8.1) — Storage holds only the bytes; nothing about org scope, type, or status is inferred from the storage path alone at query time (the DB row is always the source of truth), the path structure is for physical organization and coarse-grained bucket policy only.

**Access control:** no `documents` row's file is ever served via a public/permanent URL. Every access goes through: (1) the requesting user's RLS-equivalent authorization check against `user_org_assignments` for the document's `org_unit_id`, then (2) a **short-lived signed URL** (Supabase Storage's `createSignedUrl`, TTL ~5 minutes) generated server-side and handed to the client. The signed URL itself carries no separate authorization — the authorization already happened before it was minted; the short TTL bounds the exposure if a URL is ever inadvertently logged or shared.

**Retention:** documents are never hard-deleted from Storage or the `documents` table by normal application flows — `deleted_at` soft-delete only, consistent with `Master_Approach.md` §36 ("documents should not be deleted casually because they may be evidence for reported values"). Actual purge (if ever needed for a real retention-policy/legal-hold reason) is an explicit, logged Admin/DBA operation, not an app feature, and is out of scope for MVP.

---

## 16. Authentication & Authorization Model

### 16.1 Authentication

Supabase Auth (per `02_TRD.md` §7) — JWT-based, `auth.uid()` available inside every RLS policy.

### 16.2 Authorization architecture

Two layers, per `02_TRD.md` §8:

1. **Row-Level Security (primary)** — the database itself refuses queries outside a user's scope; a bug in application code cannot leak cross-project data.
2. **Application-level checks (secondary)** — for actions that aren't pure row visibility (e.g., "can this role trigger report generation," self-approval prevention).

**Core SQL helper functions** (all `security definer`, used throughout the RLS policies below):

```sql
-- Is the current user a global Admin?
create or replace function is_admin() returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from user_org_assignments uoa
    join roles r on r.id = uoa.role_id
    where uoa.user_id = auth.uid()
      and uoa.revoked_at is null
      and r.code = 'admin'
  );
$$;

-- All org_units the current user can see: their assigned nodes PLUS every descendant
-- (assignment scope cascades downward, per this session's confirmed decision)
create or replace function my_org_unit_ids() returns setof uuid
language sql security definer stable as $$
  with recursive scoped as (
    select ou.id from org_units ou
    join user_org_assignments uoa on uoa.org_unit_id = ou.id
    where uoa.user_id = auth.uid() and uoa.revoked_at is null
    union all
    select child.id from org_units child
    join scoped s on child.parent_id = s.id
  )
  select id from scoped;
$$;
```

### 16.3 Representative RLS Policies

```sql
-- esg_records: read within scope or Admin
create policy esg_records_select on esg_records for select
  using (is_admin() or org_unit_id in (select my_org_unit_ids()));

-- esg_records: insert only within scope, by the submitter themself
create policy esg_records_insert on esg_records for insert
  with check (
    org_unit_id in (select my_org_unit_ids())
    and submitted_by = auth.uid()
  );

-- esg_records: update restricted to pre-approval states, within scope
create policy esg_records_update on esg_records for update
  using (
    (is_admin() or org_unit_id in (select my_org_unit_ids()))
    and approval_status in ('not_submitted', 'returned')
  );
-- no DELETE policy exists — esg_records are never deleted, only superseded/returned.

-- conversion_factor_versions: readable by anyone with scope-appropriate access,
-- writable only by Admin (or explicitly authorized ESG personnel role, if granted)
create policy factor_versions_select on conversion_factor_versions for select
  using (true); -- factors are global reference data, not org-scoped

create policy factor_versions_write on conversion_factor_versions for insert
  with check (is_admin());
-- UPDATE intentionally has no policy beyond Admin, and the application layer
-- additionally refuses to mutate a version once referenced by any calculation (§10.2).

-- approvals: insert restricted to Admin/Corporate ESG role, self-approval blocked
-- for BOTH the submitter and the verifier (03_APP_FLOW.md §4.9 / UI brief §12.5;
-- corrected per audit finding C2 — verified_by was previously unchecked)
create policy approvals_insert on approvals for insert
  with check (
    exists (
      select 1 from user_org_assignments uoa
      join roles r on r.id = uoa.role_id
      where uoa.user_id = auth.uid()
        and uoa.revoked_at is null
        and r.code in ('admin', 'corporate_esg')
    )
    and decided_by <> (select submitted_by from esg_records where id = approvals.esg_record_id)
    and decided_by <> coalesce(
      (select v.verified_by from verifications v
        where v.esg_record_id = approvals.esg_record_id
        order by v.verified_at desc limit 1),
      '00000000-0000-0000-0000-000000000000'
    )
  );

-- audit_logs: insert-only from service role; read restricted to Admin
create policy audit_logs_select on audit_logs for select
  using (is_admin());
-- INSERT is performed exclusively via the backend's service-role connection
-- (bypasses RLS by design — service role, not a client-facing policy), never
-- directly by an authenticated client role.

-- documents: same org-scope pattern as esg_records
create policy documents_select on documents for select
  using (is_admin() or org_unit_id in (select my_org_unit_ids()));

create policy documents_insert on documents for insert
  with check (
    org_unit_id in (select my_org_unit_ids())
    and uploaded_by = auth.uid()
  );
```

Every other org-scoped table (`ocr_jobs`, `ocr_extractions`, `ocr_fields`, `verifications`, `validation_results`, `esg_record_documents`, `notifications`) follows the same `is_admin() or <scope check via a join back to org_unit_id>` pattern — not repeated in full here for brevity, but each must be implemented identically at migration time, not improvised per-table.

### 16.4 Non-RLS server-side rules

- **Approval decision cannot equal the submitter or the verifier** — enforced both by the RLS `with check` above and redundantly in application code (defense in depth, since this is a genuine trust-boundary requirement per `03_APP_FLOW.md` §4.9, not merely a UX nicety).
- **Reporting-period upload gate** — the application layer refuses document upload if no `reporting_periods` row has `status = 'open'`, rather than relying solely on a DB constraint (a friendlier, more specific error message is needed than a raw constraint violation).
- **Conversion factor version immutability once referenced** — enforced by a trigger (§17.3) as the authoritative backstop, since this is a correctness-critical rule that must hold even if application code has a bug.

---

## 17. Sensitive Data Classification & Protection

| Category | Examples | Protection |
|---|---|---|
| **Authentication data** | Passwords, session tokens, JWTs | Never touches this schema at all — entirely owned by Supabase Auth (`auth.*` schema), never duplicated into application tables. |
| **PII — employee/workforce data** | HR-submitted headcount, gender distribution, individual employee records referenced in `ocr_fields`/`esg_records` for HR-category metrics | Scoped by the same RLS org-scoping as everything else (an HR record is only visible within its org scope + Admin); additionally, HR-category `esg_categories` should be reviewed for whether any field ever captures an identifiable individual (the BRSR HR indicators described in `Master_Approach.md` §18 are aggregate counts, not named-individual records — if a future indicator requires named individuals, that field should be flagged and access further restricted at the application layer, not assumed safe by default). |
| **Original documents** | Bills, invoices, HR statements, certificates | Private Storage bucket, signed URLs only, RLS-equivalent check before every signed URL is minted (§15). |
| **Internal company data** | Conversion factors, calculation formulas, BRSR mapping configuration, org hierarchy | Not secret in the sense of PII, but commercially sensitive — readable broadly within the app (factors are global reference data per §16.3) but writable by Admin only; the *document evidence* backing any given number remains org-scoped even though the *factor* used to calculate it is global. |
| **Audit log contents** | `old_value`/`new_value` snapshots, which may themselves contain any of the above | `audit_logs` read access restricted to Admin only (§16.3) — the audit log is not broadly readable just because the record it describes might be. |
| **Financial/CSR data** | CSR expenditure, fines/penalties records | Same org-scoped RLS pattern as any other `esg_records` row under the Finance/CSR category — no separate mechanism, since the organizational-scope model already provides the right boundary (Finance data for Project X is invisible to a user scoped only to Project Y). |

---

## 18. Indexes Summary

Beyond the per-table indexes already specified, the following composite indexes support the platform's most common query shapes directly:

| Index | Table | Supports |
|---|---|---|
| `(org_unit_id, reporting_period_id, metric_id)` | `esg_records` | Consolidation roll-ups through every level of the configured `org_units` tree, generically (TRD §29; corrected per audit finding C3 — not a fixed subset of levels) |
| `(org_unit_id, reporting_period_id, validation_status)` | `esg_records` | Submission/Validation Monitoring pages |
| `(org_unit_id, reporting_period_id, approval_status)` | `esg_records` | Approval Queue |
| `(document_id)` | `ocr_jobs`, `ocr_extractions` | OCR pipeline joins |
| `(entity_type, entity_id)` | `audit_logs` | Per-record audit history / drill-down |
| `(effective_from, effective_to)` | `conversion_factor_versions` | "Which version was effective on date X" — hit on every calculation |
| `(user_id, is_read)` | `notifications` | Notification bell/list |
| `(file_hash)` | `documents` | Duplicate detection |

---

## 19. Triggers/Events

Used deliberately, not by default — per the brief's own caution against overusing triggers where application logic is more maintainable.

### 19.1 `updated_at` maintenance

A single shared trigger function, applied to every mutable table (`users`, `org_units`, `esg_records`, `reporting_periods`, `esg_metrics`, `org_settings`, etc.):

```sql
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
-- attached per-table: create trigger trg_set_updated_at before update on <table>
--   for each row execute function set_updated_at();
```

This is the one trigger pattern used everywhere without exception — it's mechanical, has no business logic, and application code should never be trusted to remember to set `updated_at` manually.

### 19.2 What is deliberately **not** a trigger

- **Audit logging** — handled by a shared **application-layer** helper function called explicitly at every material action (per `02_TRD.md` §27's design), not a generic table-level trigger. A blanket audit trigger on every table would capture *that* a row changed but not *why* (the business reason, the user-facing action name) — which is exactly the information `audit_logs.event_type`/`reason` needs, and which only application code has context for.
- **Status cascades** (e.g., updating `esg_records.approval_status` when an `approvals` row is inserted) — handled in the same application transaction that inserts the `approvals` row, not a trigger, because the application already needs to run other logic in that same transaction (sending a notification, per §19.3) and splitting that across a trigger plus application code makes the actual sequence of events harder to reason about for a hackathon-timeline team.
- **Notification generation** — application-layer, triggered from the same service functions that change status (upload, OCR completion, validation, approval decision), for the same reason.

### 19.3 The one exception: conversion factor immutability guard

```sql
create or replace function prevent_referenced_factor_version_mutation() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from calculations where conversion_factor_version_id = old.id) then
    if new.value <> old.value or new.input_unit <> old.input_unit or new.output_unit <> old.output_unit then
      raise exception 'Cannot mutate a conversion_factor_version already referenced by a calculation — create a new version instead';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_guard_factor_version before update on conversion_factor_versions
  for each row execute function prevent_referenced_factor_version_mutation();
```

This one **is** a DB-level trigger, deliberately, because it's a correctness invariant (reproducibility of past calculations) that must hold even against a future application-code bug — the one place in this schema where "the database itself refuses it" is worth the trigger's added complexity.

---

## 20. Optional: API Resource Mapping, Query Patterns, Transactions, Concurrency

### 20.1 API resource mapping (tRPC procedure groups → tables, per `02_TRD.md` §22)

| tRPC namespace | Primary tables touched |
|---|---|
| `documents.upload` | `documents`, `ocr_jobs`, `audit_logs` |
| `verification.confirm` | `ocr_fields`, `esg_records`, `verifications`, `validation_results`, `audit_logs`, `notifications` |
| `factors.manage` | `conversion_factors`, `conversion_factor_versions` |
| `approvals.decide` | `approvals`, `esg_records`, `notifications`, `audit_logs` |
| `reports.generate` | `report_runs`, (read-only across `esg_records`, `calculations`, `brsr_metric_mappings`) |

### 20.2 Example query pattern — Journey 5 drill-down

```sql
-- Given a report_run and a BRSR indicator, walk down to the original document
select
  d.id as document_id, d.storage_path,
  v.verified_at, v.verified_by,
  c.input_value, c.result_value, c.engine_version,
  er.id as esg_record_id
from esg_records er
join calculations c on c.esg_record_id = er.id and c.is_current
join verifications v on v.esg_record_id = er.id
join esg_record_documents erd on erd.esg_record_id = er.id and erd.is_primary
join documents d on d.id = erd.document_id
join brsr_metric_mappings bmm on bmm.esg_metric_id = er.metric_id
where bmm.brsr_indicator_id = $1
  and er.reporting_period_id = $2
  and er.org_unit_id in (select my_org_unit_ids()); -- RLS enforces this anyway; explicit for clarity
```

### 20.3 Transaction boundaries

- **Verify → Validate:** the `verifications` insert, `ocr_fields.verified_value` updates, and the initial `validation_results` inserts happen in one transaction — a record should never be left in a state where it's marked verified but validation hasn't been attempted.
- **Approval decision:** the `approvals` insert and the `esg_records.approval_status` update happen in one transaction — these must never diverge (an approval row existing that doesn't match the record's current denormalized status would be a real bug).
- **Calculation:** inserting a new `calculations` row and flipping the prior row's `is_current = false` happen in one transaction, guarded by the partial unique index (§10.3) as a hard backstop against a race producing two "current" calculations.

### 20.4 Concurrency considerations

- **OCR worker polling** (`ocr_jobs`, status `pending`): the worker's poll-and-claim query should use `select ... for update skip locked` when picking up a job, so multiple worker instances (horizontal scaling, per `02_TRD.md` §29) never double-process the same job.
- **Reporting period close:** closing a period (`reporting_periods.status → 'closed'`) while a document is mid-upload for that period is a real race; the application layer re-checks period status inside the same transaction that creates the `documents`/`esg_records` rows, not just at the initial UI gate, to avoid a document silently landing in a period that closed moments earlier.

---

*End of 05_BACKEND_SCHEMA.md. See `.grill/backend-schema-decisions.md` for the reasoning behind the single-tenant and many-to-many document/record decisions made this session. Next in the document set per `Master_Approach.md` §49: API specification and OCR/document-intelligence specification, both of which should treat this schema as their fixed contract rather than re-deriving table structure.*
