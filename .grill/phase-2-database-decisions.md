# Grill: Phase 2 — Database decisions
Date: 2026-09-17

## Intent
Build Phase 2 of `06_IMPLEMENTATION_PLAN.md` — the full `05_BACKEND_SCHEMA.md` schema as migrations, RLS, triggers, helpers and seed data — without inventing requirements, and close the RLS write vulnerabilities found while planning it.

## Constraints
- Local Supabase stack (Docker) first; migrations pushed to the hosted project only after user review, with `supabase login`/`link` run by the user.
- Hosted project: development-only, **South Asia (Mumbai, ap-south-1)** — recreated from an original Northeast Asia project because real MEIL data will eventually live there (TRD §2 principle 7, §12).
- **Synthetic documents only until Phase 18** (audit + security hardening); no real MEIL evidence, HR/CSR records or bills before that.
- No edits to `ps_documents/`; schema deviations recorded outside it (Implementation Plan Rule 4).
- Minimum change: no redesign of unrelated schema components.

## Key decisions
- Decision: **Server-only lifecycle writes** — approved security deviation from `05_BACKEND_SCHEMA.md` §16.3. Clients get no direct write access to `esg_records`, `verifications`, `validation_results`, `approvals`, `calculations`, `audit_logs`. Every lifecycle mutation is a server-side tRPC procedure that: authenticates the user; takes identity from the session, never client fields; verifies org/project scope; verifies role/permission; verifies current state; enforces the allowed transition; writes the mutation and its audit entry in one transaction; blocks submitter self-approval (and verifier self-approval, per corrected schema §9.5); derives `decided_by` from the session. Reason: §16.3's `esg_records_update` policy allowed any in-scope user to set lifecycle columns (e.g. `approval_status = 'approved'`) directly, and `approvals_insert` never bound `decided_by` to `auth.uid()`. Alternative considered: column grants + transition-guard triggers — rejected (puts workflow logic in SQL; §19.2 avoids status triggers).
- Decision: **Server-only configuration writes.** No client insert/update/delete on Admin-configured tables (`org_units`, `user_org_assignments`, `roles`, `permissions`, `role_permissions`, `reporting_periods`, `esg_categories`, `esg_metrics`, `metric_field_requirements`, `document_types`, `document_type_metric_mappings`, `validation_rules`, `calculation_formulas`, `scopes`, `conversion_factors`, `conversion_factor_versions`, `brsr_sections`, `brsr_indicators`, `brsr_metric_mappings`, `org_settings`); writes go through permission-checked server procedures with a same-transaction audit entry. Reason: once clients can't write `audit_logs`, direct Admin config writes (e.g. §16.3 `factor_versions_write`) would be unaudited, violating Master §31 / PRD §39. Read policies unchanged.
- Decision: **Server-issued uploads.** No client insert on `documents`, `esg_record_documents`, `ocr_jobs`. The Phase 5 upload procedure creates those rows + `esg_records` + audit entry in one transaction and returns a short-lived signed upload URL for the private `evidence/` path; bytes go browser → Storage directly (avoids Vercel request-size limits). Bucket stays private. Alternative considered: keep client `documents_insert` and add other rows afterwards — rejected (non-atomic, orphan/unaudited uploads).
- Decision: **Notifications:** server-created; the only client write in the database is marking one's own notification read (column-level `UPDATE (is_read)` grant + own-row RLS). Not an audited action per Master §31.
- Decision: **OCR tables** (`ocr_jobs`, `ocr_extractions`, `ocr_fields`) get scoped read policies only; the worker writes with the service role. Not an additional deviation — the schema specifies only the read pattern for them.
- Decision: **`user_display_names` view** (`id`, `display_name` only), readable by any authenticated user, unscoped; `users` table stays self-or-Admin readable. Fills the undefined "narrow view §14.5" referenced by schema §3.1. Alternative considered: scope-filtered view — rejected as costly for low-sensitivity data.
- Decision: **Permission catalogue** (approved as-is): Admin — `org.manage`, `user.manage`, `role.manage`, `period.manage`, `settings.manage`, `factor.manage`, `brsr_mapping.manage`, `validation.review`, `report.generate`, `audit.view`, plus everything below; Admin + Corporate ESG — `approval.decide`, `monitoring.view`; all roles — `document.upload`, `record.verify`. Category-to-role restriction stays with `esg_categories.owning_role_id`; row visibility stays with org-scope RLS.
- Decision: **Scopes seed:** `SCOPE_1`, `SCOPE_2`, `SCOPE_3` parent only; Scope 3 child categories deferred to Phase 12. Reason: Plan Phase 2 cites a "PRD §22 MVP list" that doesn't exist; Phase 12 is where categories are selected. Alternative considered: seed all ten Master §17 categories inactive.
- Decision: Commit Phase 1 as its own local commit before starting Phase 2.

## Surfaced assumptions
- With server-only writes, write-path security for lifecycle/config tables rests on server procedure correctness rather than RLS alone — a conscious trade against TRD §8's "database refuses it" ideal; read-path isolation remains RLS-enforced.
- Docker also runs another project's containers (`suraksha_postgres` :5432, `suraksha_backend` :8000); Supabase local ports (54321–54327) don't conflict, but ~5.7 GB Docker memory is shared.

## Open questions
- Whether the original Northeast Asia Supabase project was deleted (not confirmed).
- Hosted project API key labels (anon/service_role vs publishable/secret) — needed when the app is connected.

## Out of scope
- Pushing migrations to the hosted Mumbai project during Phase 2 (after user review only).
- Scope 3 categories, conversion factor values, BRSR indicators (later phases).
- tRPC procedures themselves (Phase 3+); Phase 2 only removes client write paths.
