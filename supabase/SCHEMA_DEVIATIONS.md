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

**Implemented:** no client insert on `documents`, `esg_record_documents` or `ocr_jobs`. The Phase 5
upload procedure verifies scope, role/category, and the open reporting period; creates `documents`,
`ocr_jobs`, `esg_records` and `esg_record_documents` plus the audit entry in one transaction; and
returns a short-lived signed upload URL for the private path
`evidence/{org_unit_id}/{reporting_period_id}/{document_id}/original.{ext}` (§15). File bytes go from
the browser directly to Storage; the bucket stays private.

**Why:** one upload spans several tables and an audited event (Master §31 "User uploaded document");
a lone client `documents` insert cannot be atomic with them.

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

## Documentation cross-reference errors noticed (no schema impact)

- §16.4 refers to "a trigger (§17.3)"; the trigger is in §19.3.
- §3.1 refers to "a narrow view, §14.5"; no §14.5 exists (addressed by D5).
