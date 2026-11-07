# EmeilSG (BRSR_MEIL) — database documentation

What is in `database_dump.sql`, how the database is organised, and how its parts relate.

## 1. In short

| | |
|---|---|
| Engine | **PostgreSQL 17** (the source runs 17.6), hosted on **Supabase** |
| What the dump is | **A sanitised dump**: the complete application schema and its data, with personal data pseudonymised, secrets and private conversations left out, and uploaded files not included (section 7) |
| Source | The project's hosted Supabase database, read on 2026-11-05. It is a development and demonstration database: test accounts and synthetic test documents, not MEIL's production records |
| Source of truth for the schema | 53 migrations in `supabase/migrations/` (`0001_enum_types.sql` to `0053_period_auto_close_and_notification_seen.sql`), all applied and recorded on the source |
| Application schema | `public`: 50 tables, 4 views, 26 enum types, 21 functions, 24 triggers, 149 indexes, 50 primary keys, 92 foreign keys, 23 unique and 37 check constraints, 51 row-level security policies |
| Size | 2.8 MB of SQL, about 10,000 lines; 4,111 data rows in `public` |

## 2. How the application uses the database

- **The web app** (Next.js, `apps/web`) reads and writes through its own server-side connection. Every write
  is checked on the server for the user's session, role and organisational scope, and writes an audit entry in
  the same transaction.
- **The browser never writes.** The `authenticated` and `anon` roles have no write privilege on any table
  (only `notifications` can be marked read). Read access is limited by row-level security to the org units a
  user is assigned to.
- **The OCR worker** (Python, `apps/ocr-worker`) polls `ocr_jobs` and writes extractions back.
- **The chatbot** reads through a separate database role, `chat_reader`, which can select a named list of
  tables and nothing else. It cannot read `users`, the audit log, documents or OCR text.
- **Sign-in** is Supabase Auth: `public.users.id` is the id of the account in `auth.users`.

## 3. Tables by area

### Organisation, people and access

| Table | Rows | Purpose |
|---|---|---|
| `org_levels` | 7 | Hierarchy levels (group, subsidiary, project, …) as configuration |
| `org_units` | 13 | The organisation tree: each unit has a main parent (`parent_id`) and a level |
| `org_unit_parents` | 1 | Extra parents of a unit that sits under more than one (shared units) |
| `users` | 34 | Application profile of each account (name, email, employee id, theme) — **pseudonymised** |
| `roles` | 10 | Roles, e.g. Super Admin (`admin`), Administrator (`org_admin`), Project Manager, HR, EHS |
| `permissions` | 20 | Permission codes, e.g. `user.manage`, `approval.decide`, `report.generate` |
| `role_permissions` | 64 | Which role holds which permission |
| `user_org_assignments` | 40 | A user holds a role **at** an org unit, and with it that unit and everything beneath |
| `user_invitations` | 0 (left out) | Hashes of one-time invitation links |
| `user_sessions` | 0 (left out) | Per-sign-in clocks for idle and absolute session limits |
| `password_reset_otps` | 0 (left out) | Hashes of one-time reset codes |
| `rate_limit_events` | 0 (left out) | Counters for sign-in, upload and invitation limits |

### Configuration and reference data

| Table | Rows | Purpose |
|---|---|---|
| `scopes` | 13 | Scope 1, 2, 3 and the Scope 3 categories |
| `esg_categories` | 12 | Groups of activities, each owned by a role |
| `esg_metrics` | 47 | ESG activities (diesel, grid electricity, water, headcount, …) |
| `metric_field_requirements` | 210 | The fields OCR must read for each activity |
| `document_types` / `document_type_metric_mappings` | 20 / 47 | Kinds of evidence document and which activities they serve |
| `validation_rules` | 64 | Configured checks (units, ranges, duplicates, anomalies) |
| `calculation_formulas` | 42 | How each activity is calculated (multiply, subtract, percentage) |
| `conversion_factors` / `conversion_factor_versions` | 31 / 31 | Emission factors with source references, versioned by date |
| `reporting_periods` | 2 | Monthly or annual periods, with a submission window |
| `submission_expectations` | 6 | What each org unit must submit per period |
| `org_settings` | 7 | Settings as JSON: rate limits, session limits, OCR threshold, report inputs |
| `brsr_sections` / `brsr_indicators` | 3 / 146 | SEBI's BRSR format: Sections A, B and C, all questions |
| `brsr_metric_mappings` | 49 | Which activity answers which BRSR indicator |
| `brsr_disclosures` | 23 | Written answers to BRSR questions (from MEIL's public website and filings) |
| `internal_carbon_prices` | 1 | Internal carbon price |

### Evidence, extraction and the record lifecycle

| Table | Rows | Purpose |
|---|---|---|
| `documents` | 78 | Uploaded evidence: storage path, file name, SHA-256 fingerprint, type |
| `document_bundle_parts` | 15 | How a multi-bill PDF was split into separate bills |
| `ocr_jobs` | 78 | OCR queue, status and the extractor version used |
| `ocr_extractions` | 78 | Raw OCR output per document (lines, boxes, scores) as JSON |
| `ocr_fields` | 332 | Each extracted field, its confidence, and the value a person verified |
| `esg_records` | 72 | One activity for one org unit in one period, with its lifecycle states |
| `esg_record_documents` | 72 | Evidence files attached to a record |
| `verifications` | 71 | A person's confirmation of the extracted values |
| `validation_results` | 608 | Result of each validation check on each record |
| `calculations` / `calculation_inputs` | 57 / 32 | Append-only calculation results, with the factor version and inputs used |
| `approvals` | 128 | Submit, approve and return decisions |

### Reporting, audit and notifications

| Table | Rows | Purpose |
|---|---|---|
| `report_runs` | 13 | Generated BRSR reports with a JSON snapshot of every reported value |
| `audit_logs` | 1,277 | Append-only log of every material action — **pseudonymised** |
| `notifications` | 257 | In-app notifications |
| `chat_conversations` / `chat_messages` | 0 / 0 (left out) | Saved chatbot conversations |

### Carbon credits (built, unused in this data)

`carbon_credits`, `carbon_credit_transactions` and `capex_carbon_evaluations` are empty in the source.

## 4. Key relationships

The chain that gives every reported number its lineage, from report back to document:

```
report_runs.snapshot_data ──▶ brsr_indicators ◀── brsr_metric_mappings ──▶ esg_metrics
                                                                             │
esg_records (org_unit_id, reporting_period_id, metric_id, scope_id, submitted_by)
   │── calculations (conversion_factor_version_id, calculation_formula_id) ── calculation_inputs
   │── validation_results (validation_rule_id)
   │── verifications (ocr_extraction_id)
   │── approvals
   └── esg_record_documents ──▶ documents ──▶ ocr_jobs ──▶ ocr_extractions ──▶ ocr_fields
```

Organisation and access:

```
org_levels ◀── org_units (parent_id ──▶ org_units) ◀── org_unit_parents (extra parents)
users (id ──▶ auth.users) ◀── user_org_assignments ──▶ org_units, roles ◀── role_permissions ──▶ permissions
```

Foreign keys per table (92 in all; only `users.id → auth.users.id` leaves the `public` schema):

| Table | References |
|---|---|
| approvals | esg_records, users |
| audit_logs | users |
| brsr_disclosures | brsr_indicators, users |
| brsr_indicators | brsr_sections |
| brsr_metric_mappings | brsr_indicators, esg_metrics |
| calculation_formulas | esg_metrics |
| calculation_inputs | calculations, esg_records |
| calculations | calculation_formulas, conversion_factor_versions, esg_records, scopes |
| capex_carbon_evaluations | internal_carbon_prices, org_units, users |
| carbon_credit_transactions | carbon_credits, documents, org_units, reporting_periods, users |
| carbon_credits | documents, org_units |
| chat_conversations / chat_messages | users / chat_conversations |
| conversion_factor_versions | conversion_factors, users |
| document_bundle_parts | document_types, documents, esg_metrics |
| document_type_metric_mappings | document_types, esg_metrics |
| documents | document_types, documents (replaces), org_units, reporting_periods, users |
| esg_categories | roles |
| esg_metrics | esg_categories, scopes |
| esg_record_documents | documents, esg_records, users |
| esg_records | esg_metrics, org_units, reporting_periods, scopes, users |
| internal_carbon_prices | org_units |
| metric_field_requirements | esg_metrics |
| notifications | users |
| ocr_extractions | documents, ocr_jobs |
| ocr_fields | ocr_extractions, users |
| ocr_jobs | documents |
| org_settings | users |
| org_unit_parents | org_units, users |
| org_units | org_levels, org_units |
| password_reset_otps, user_invitations, user_sessions | users |
| report_runs | org_units, reporting_periods, users |
| role_permissions | permissions, roles |
| roles | roles (uploads on behalf of) |
| scopes | scopes (Scope 3 categories under Scope 3) |
| submission_expectations | esg_metrics, org_units, users |
| user_org_assignments | org_units, roles, users |
| users | **auth.users** |
| validation_results | esg_records, validation_rules |
| validation_rules | esg_metrics |
| verifications | esg_records, ocr_extractions, users |

## 5. Views

| View | What it is |
|---|---|
| `org_unit_tree` | Every org unit paired with itself and every unit beneath it, through all parents |
| `org_unit_links` | Every parent–child link: main parents and extra parents together |
| `consolidation_records` | What counts in a roll-up: verified, non-rejected records, once per ancestor, with their current result |
| `user_display_names` | Names only, for showing who did something without exposing email addresses |

## 6. Rules the database itself enforces

Functions (21) and the triggers (24) that call them:

| Rule | Where |
|---|---|
| The audit log can never be changed or emptied | `prevent_audit_log_change` on `audit_logs` |
| Calculations and their inputs are append-only | `prevent_calculation_change` on `calculations`, `calculation_inputs` |
| A factor version used by a calculation cannot change | `prevent_referenced_factor_version_mutation` |
| A record's or document's org unit and submitter cannot change | `prevent_ownership_change` |
| A record cannot be verified without a document | `require_record_document` |
| Evidence stays inside one org unit | `enforce_record_document_org` |
| No cycles, no child at or above its parent's level, one parent list per unit | `enforce_org_hierarchy`, `enforce_org_unit_parent`, `guard_org_levels` |
| At most two Super Admins | `enforce_super_admin_limit` on `users` and `user_org_assignments` |
| An invitation link's account, token and expiry cannot be changed | `guard_user_invitation` |
| A carbon credit batch cannot be over-drawn; its ledger is append-only | `enforce_carbon_credit_balance`, `prevent_carbon_transactions_change` |
| Session time limits | `touch_session`, `session_limits` (called by the app on every request) |
| Reporting periods close after their deadline | `close_expired_reporting_periods`, scheduled every 5 minutes with `pg_cron` |
| Row-level security helpers | `is_admin()`, `my_org_unit_ids()`, `org_unit_root()` |

**Row-level security** is enabled on all 50 tables. The 51 policies are read policies (`SELECT`) for
`authenticated` scoped to the user's org units, read policies for `chat_reader` on the tables the chatbot may
see, and one `UPDATE` policy that lets a user mark their own notifications read.

**Enum types (26)** hold the lifecycle states, for example `record_verification_status` (draft →
document_uploaded → ocr_completed → user_verified), `record_validation_status`, `record_approval_status`,
`reporting_period_status` (draft, open, closed) and `factor_version_status`.

## 7. What was changed or left out, and why

| Item | Treatment | Why |
|---|---|---|
| `users` names, emails, employee ids | Replaced by `User 001` … `User 034`, `user001@example.invalid` …, `EMP-001` …, in order of creation | Personal data. Ids and every relation are kept |
| The same names, emails and ids inside audit values, notifications, approval reasons, report snapshots, OCR text, file names | Replaced by the same pseudonyms | So the history still reads consistently |
| Any other email address | `redacted@example.invalid` | Personal data |
| `audit_logs.ip_address`, `user_agent`, `session_id` | Emptied (all 1,277 rows) | Personal data and session identifiers |
| `password_reset_otps`, `user_invitations`, `user_sessions`, `rate_limit_events` | Structure kept, no rows | Hashes of secrets and security counters |
| `chat_conversations`, `chat_messages` | Structure kept, no rows | Private conversations |
| `auth.users` (Supabase's sign-in table) | Not copied. The dump creates one placeholder per user: id and pseudonymous email only, **no password** | Holds password hashes; the placeholders keep the foreign key from `users` intact |
| Uploaded files (Supabase Storage, 94 objects) | Not included; `documents.storage_path` still names where each file was | Files are not database rows. The two private buckets themselves are created |
| Other Supabase schemas (`auth`, `storage`, `cron`, `vault`, …) | Not dumped | Supabase's own, created by Supabase; not application schema |
| `supabase_migrations.schema_migrations` | Not dumped | Supabase CLI bookkeeping; the dump corresponds to migrations `0001`–`0053` |

Kept as they are: organisation units (MEIL's companies and projects, public information), configuration and
reference data, BRSR disclosures (taken from MEIL's public website and filings), and the test documents' OCR
output (synthetic sample bills made for testing).

## 8. Where things are in the dump file

1. Header and `BEGIN`.
2. What the schema needs outside itself: the `chat_reader` role (no login), the extensions, and the
   `auth.users` placeholders.
3. The `public` schema from `pg_dump` 17.6: enum types, functions, tables, views, data (`INSERT` statements
   with column names, 100 rows each), constraints, indexes, triggers, policies, then privileges.
4. The two storage buckets.
5. The `pg_cron` job.
6. `COMMIT`.
