# EmeilSG — Database security and data isolation audit, 2026-10-12

_Companion to [`SECURITY_AUDIT_2026-10-12.md`](SECURITY_AUDIT_2026-10-12.md). Work is on branch
`feature-security-audit-fixes`, **uncommitted**. Migration `0047` is applied to the **local** database only —
it is **not on hosted**._

What was done: the live catalogue of the local database (after all 47 migrations) was read — tables, RLS,
policies, grants, views, functions, default privileges, storage — rather than only the migration text; the
access paths were then tried with separate identities at two layers: the database as the browser roles, and
the application's real procedures as a project-scoped user. RLS is described as effective below only where
a test listed in §6 exercised it.

## 1. How data is reached

There are four ways into the data, and they are not equally protected by the database:

| Path | Database identity | Bound by RLS? | What limits it |
| ---- | ----------------- | ------------- | -------------- |
| A browser calling Supabase's API with the public key | `anon` | yes | No grant on anything |
| The same, with a signed-in user's token | `authenticated` | yes | Read-only grants, RLS policies; one column writable |
| The web app's server (`lib/db.ts`, service-role client) | `postgres` / `service_role` | **no** | The procedure's own permission and scope checks; triggers and constraints |
| The OCR worker | `postgres` + service role | **no** | Its code: it writes OCR rows, job state, notifications, audit entries |
| The chatbot's lookups | `chat_reader` | yes (`using (true)` on a short list) | `SELECT` on named tables and columns, read-only transactions, scope applied by the app |

The app has **no Supabase client in the browser**; the first two paths exist only because Supabase exposes
its API to anyone holding the public key (and, for the second, their own token). So RLS here is the second
line of defence for almost everything, and the first line for the few reads the server makes as the user
(`users`, `user_org_assignments`, `roles`, `documents`, `esg_record_documents`).

There is one tenant: the MEIL organisation (several "group" roots are possible, all under the same Admins).
Isolation is **between org units inside it** — a person assigned to a unit reaches that unit and everything
beneath it.

## 2. Tables by sensitivity and ownership

48 tables, all with RLS enabled. "Scope" = visible to an Admin, or to someone whose assignments cover the org
unit (`my_org_unit_ids()`, which follows shared units).

| Class | Tables | Owner column | Browser read policy |
| ----- | ------ | ------------ | ------------------- |
| **Personal** | `users` (email, employee id) | `id` | own row, or Admin |
| | `user_org_assignments` | `user_id` | own rows, or Admin |
| | `notifications` | `user_id` | own rows, or Admin; own `is_read` writable |
| | `chat_conversations`, `chat_messages`, `password_reset_otps`, `rate_limit_events` | `user_id` / hashed bucket | none (server only) |
| **Project-owned** | `esg_records`, `documents`, `report_runs`, `submission_expectations` | `org_unit_id` | scope |
| | `esg_record_documents`, `verifications`, `validation_results`, `approvals`, `calculations` | via the record | scope of the record |
| | `calculation_inputs` | via calculation → record | scope of the record |
| | `ocr_jobs`, `ocr_extractions`, `ocr_fields` | via the document | scope of the document |
| | `document_bundle_parts` | via the document | none (server only) |
| | `carbon_credits`, `carbon_credit_transactions`, `internal_carbon_prices`, `capex_carbon_evaluations` | `org_unit_id` | none (server only) |
| **Organisation structure** | `org_units` | `id` | scope |
| | `org_unit_parents`, `org_levels` | — | none (server only) |
| **Company-sensitive** | `audit_logs` | — | Admin only |
| | `org_settings` (turnover, assurance, rate limits) | — | Admin only (since `0047`; was every signed-in user) |
| | `brsr_disclosures` | — | none (server only) |
| **Reference / configuration** | `roles`, `permissions`, `role_permissions`, `scopes`, `esg_categories`, `esg_metrics`, `metric_field_requirements`, `document_types`, `document_type_metric_mappings`, `validation_rules`, `calculation_formulas`, `conversion_factors`, `conversion_factor_versions`, `brsr_sections`, `brsr_indicators`, `brsr_metric_mappings`, `reporting_periods` | — | every signed-in user |

Views: `org_unit_tree`, `org_unit_links`, `consolidation_records` are `security_invoker` and closed to the
browser roles. `user_display_names` (id and display name of every user) is readable by every signed-in user
by design; it is the one view that runs with its owner's rights.

Storage: buckets `evidence` and `reports` are private, with no object policies — only the server reads them.

### Relationships

```
org_units ──< org_unit_parents (extra parents)        users ──< user_org_assignments >── roles ──< role_permissions >── permissions
    │                                                    │
    ├──< documents ──< ocr_jobs ──< ocr_extractions ──< ocr_fields
    │        │
    │        └──< esg_record_documents >──┐
    ├──< esg_records ─────────────────────┘──< verifications, validation_results, approvals
    │        │                               └──< calculations ──< calculation_inputs >── conversion_factor_versions
    │        └── metric (esg_metrics → category, scope) · reporting_period
    ├──< report_runs (snapshot of approved records)
    ├──< submission_expectations
    └──< carbon_credits ──< carbon_credit_transactions      internal_carbon_prices ──< capex_carbon_evaluations
```

Every project-owned row reaches an org unit through a foreign key. The only identifier columns without one are
`audit_logs.entity_id` and `notifications.related_entity_id`, which point at rows of several tables by design.

## 3. Data-access matrix

**Through the database API directly** (what a browser role can do, whatever the app thinks of the user):

| Role | SELECT | INSERT | UPDATE | DELETE |
| ---- | ------ | ------ | ------ | ------ |
| `anon` | nothing | nothing | nothing | nothing |
| `authenticated`, non-Admin | reference tables; own account, assignments, notifications; project-owned rows in scope | nothing | own `notifications.is_read` | nothing |
| `authenticated`, Admin | the above for every org unit, plus `audit_logs`, `org_settings`, all users | nothing | own `notifications.is_read` | nothing |
| `chat_reader` | named tables and columns (no people, documents, audit trail, conversations, carbon) | nothing | nothing | nothing |

**Through the application** (the server checks the permission and, for non-Admins, the org scope).
R = read, C = create, U = change, D = delete; "scope" = only inside the caller's org units; "own" = only
rows the caller created or was sent.

| Resource | Admin | Corporate ESG | Project Manager | HR | EHS | Finance / CSR | Procurement |
| -------- | ----- | ------------- | --------------- | -- | --- | ------------- | ----------- |
| Org units, levels, expected submissions | R C U D | — | — | — | — | — | — |
| Users and assignments | R C U (deactivate) | — | — | C by bulk import, scope | — | — | — |
| Roles, permissions, periods, factors, BRSR mapping, disclosures, settings | R C U D | — | — | — | — | — | — |
| Upload a document / record | — ¹ | C, scope, own categories | C, scope, own categories | same | same | same | same |
| Verify, reject, add evidence | — ¹ | U, scope ² | U, scope ² | same | same | same | same |
| Own submissions, own notifications | R | R own | R own | R own | R own | R own | R own |
| Evidence file of a record | R | R scope | R scope | R scope | R scope | R scope | R scope |
| Approve / return | U all | U scope, not own records | — | — | — | — | — |
| Validation queue | R U all | — | — | — | — | — | — |
| Scope totals, consolidation, forecast, simulator | R all | R scope | R scope | R scope | R scope | R scope | R scope |
| Control Tower figures (`monitoring.view`) | R all | R scope ³ | — | — | — | — | — |
| Reports and evidence bundle (`report.generate`) | R C all | — | — | — | — | — | — |
| Audit trail, deadlines, OCR monitoring, data explorer | R all | — | — | — | — | — | — |
| Carbon credits and prices | R C U all | R C U scope | R scope | — | — | R scope; prices C scope | — |
| Chatbot answers | all + people | scope | scope | scope | scope | scope | scope |

¹ An Admin works in `/admin` and holds the permission, but is offered no upload target. ² The uploader, or a
holder of `record.verify` who can see the document. ³ The pages are Admin-only; the procedure now also
refuses a unit outside the holder's scope.

A custom role can be given any permission on Roles & Permissions. `org.manage`, `user.manage`, `role.manage`,
`period.manage`, `factor.manage`, `brsr_mapping.manage`, `settings.manage` and `audit.view` are
**organisation-wide by nature** — whoever holds them acts on the whole organisation. Every other permission
is limited to the holder's org scope, which §6 tests with a role holding all of them.

## 4. Findings

| ID | Sev. | Finding | Status |
| -- | ---- | ------- | ------ |
| D-01 | High | Procedures reading through the server's connection without an org-scope check (deadlines, carbon credits, Control Tower figures, report reads, evidence bundle). The database cannot catch this: that connection bypasses RLS. | Fixed in the application — F-01, F-03, F-04, F-06, F-11 of the companion report |
| D-02 | Medium | The validation queue (`validation.review`) had no scope check. Latent: only Admin holds the permission. | Fixed (`routers/validation.ts`) |
| D-03 | Medium | `org_settings` was readable by every signed-in user through the database API, and now holds turnover, assurance details and rate limits. | Fixed (`0047` §5) |
| D-04 | Medium | Nothing in the database stopped a record or document being moved to another org unit or re-attributed to another person; scope hangs off those columns. No code does it today. | Fixed (`0047` §1) |
| D-05 | Medium | An evidence link could join a record and a document of different org units, which would show a document to another project's people. No code does it today. | Fixed (`0047` §2) |
| D-06 | Medium | The carbon ledger's anti-double-counting rule lived only in the application: two requests together, or any other writer, could over-draw a batch. A retirement could omit what it offsets. Two prices could be active for one unit. | Fixed (`0047` §3) |
| D-07 | Low | `chat_reader` was granted the four carbon tables (counterparty names, registry accounts) though no chatbot lookup reads them; the grant sat inside `exception when others then null`, which would also hide a failure. | Fixed (`0047` §4) |
| D-08 | Low | Browser roles held `MAINTAIN` on 36 tables (a PostgreSQL 17 default) and could execute three trigger functions; two functions had no fixed search path. None reachable through the API today. | Fixed (`0047` §6) |
| D-09 | Low | `user_display_names` gives every signed-in user the id and display name of every user, deactivated ones included. | Open — by design (screens show who submitted and approved); narrow it to people in scope if MEIL wants |
| D-10 | Low | Reference and configuration tables, including conversion factors and their sources, are readable by every signed-in user. | Open — accepted earlier (F9 of `SECURITY_REVIEW.md`) |
| D-11 | Low | `service_role` and the app's `postgres` connection are all-powerful; the web app does not use a narrower role of its own. | Open — a dedicated application role is a deployment-time change |
| D-12 | Info | Functions: only `is_admin()` and `my_org_unit_ids()` are `SECURITY DEFINER`; both pin `search_path` to empty, take no arguments, and are not callable by `anon`. No function uses dynamic SQL. | No action |
| D-13 | Info | Aggregates and exports: consolidation, reports, bundle, forecast, simulator and the chatbot read `consolidation_records` / `org_unit_tree`; each is called only after a scope check (tested in §6). | No action |

## 5. Migration `0047_data_isolation_hardening.sql`

| § | Change | Effect on existing rows | Undo |
| - | ------ | ----------------------- | ---- |
| 1 | Triggers: a record's `org_unit_id` / `submitted_by` and a document's `org_unit_id` / `uploaded_by` cannot change | none | drop the two triggers and the function |
| 2 | Trigger: an evidence link joins a record and document of the same org unit | none (local data has no such link; **check hosted before pushing**, query below) | drop the trigger and the function |
| 3 | Trigger: a batch cannot be over-drawn; two `NOT VALID` check constraints; unique index on the active price per org unit (skipped with a notice if data already has two) | none | drop the trigger, constraints, index |
| 4 | `chat_reader` loses the carbon tables; four policies dropped | — | re-grant and re-create from `0046` |
| 5 | `org_settings` readable by Admins only | — | re-create the policy with `using (true)` |
| 6 | `MAINTAIN` revoked from browser roles; three trigger functions not executable by them; search path fixed on two functions | — | re-grant |

No table, column or row is dropped, and the OCR worker reads nothing this migration changes — it can be pushed
without replacing the worker. Before pushing to hosted, run (read-only) and expect `0`:

```sql
select count(*) from public.esg_record_documents erd
join public.esg_records r on r.id = erd.esg_record_id
join public.documents d on d.id = erd.document_id
where r.org_unit_id <> d.org_unit_id;
```

## 6. Tests

| Test | What it tries | Result |
| ---- | ------------- | ------ |
| `supabase/tests/database/audit_3_data_isolation.test.sql` (new, 41 checks) | As `anon`: select, insert, update, delete on **every** table. As a Project Manager and as an Admin through the browser role: insert, update, delete, truncate on every table. A Project Manager reading a sibling project's record, document, link, org unit; other people's accounts, assignments, notifications; the audit trail and settings; fifteen server-only tables and views. The one browser write (`is_read`) on own and others' rows. Function privileges. Each `0047` rule as the server's own role. | **41 / 41** |
| Whole database suite (`pnpm db:test`) | 28 files | **312 / 312** (271 before) |
| `apps/web/tests/isolation/cross-project.mjs` (new; `pnpm --filter web test:isolation`) | The app's real procedures, called as someone scoped to Project X with a sibling project's ids — 53 calls, twice: as a Project Manager, and holding every scoped permission a custom role could be given. Reads, uploads, approvals, validation, reports, bundle preview, carbon credits, bulk import, chat, notifications. Then checks the sibling project is unchanged. | **107 / 107**: 73 refused, 33 returned nothing of the other project, the project unchanged |
| Web unit tests | includes the chatbot's scope tests (`tests/chat.test.ts`: an out-of-scope unit reads as non-existent) | **188 / 188** |
| Lint, typecheck, format | | pass |

**Not tested:**
- Procedures that read as the signed-in user through Supabase (verification, record evidence, the two file
  routes) cannot run outside a request; their boundary is the `documents` policy, which the database test
  exercises, but the procedures themselves were not called.
- `0047` on a **fresh** database (`db reset`) — it was applied on top of the existing local one. CI will do
  the fresh run when the branch is pushed.
- Anything on hosted. The end-to-end suite. A question through the real chatbot model.
- `chat_reader`'s column-level limits were read from the catalogue and are covered by the existing
  `chat_analyst.test.sql`, not re-tried here.

## 7. Controls outside the code (dashboard and infrastructure)

- [ ] **Push `0047` to hosted** — the owner's go-ahead, after the check query in §5.
- [ ] Rotate the hosted database password (shared in chat earlier) and keep `DATABASE_URL` and the
      service-role key in the host's secret store only.
- [ ] Hosted Auth: sign-ups off, 12-character password policy with all four character classes, per-IP limits
      raised as `SECURITY_REVIEW.md` F8 says.
- [ ] `chat_reader`: set its password in the SQL editor; it must stay without `BYPASSRLS` and without any
      grant beyond `SELECT`.
- [ ] Consider a dedicated database role for the web app with only the privileges it needs (D-11), and
      leaving `service_role` to Storage and Auth administration.
- [ ] Backups: confirm who can restore or download them in the Supabase dashboard; a backup carries
      everything RLS protects.
- [ ] Supabase's Data API exposes the `public` schema; if nothing will ever call it from a browser, it can be
      limited or switched off in the dashboard (the server reads a few tables through it as the user — test
      before changing).
