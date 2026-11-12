# Role-wise dashboard: what to verify (for MACRO72, on the full stack)

Branch `feature-role-wise-dashboard` (local until the owner says to push). Decisions: `.grill/role-dashboard-decisions.md`.
Written on a machine with Node but **no Docker and no database**, so everything that touches Postgres is **unrun**.
Run on the machine that has the local Supabase stack (`D:\Non Newtonian Things\BRSR_MEIL`).

## Already run (on the writing machine)

| Check | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm test` (unit) | 310 / 310 |
| `pnpm lint` | 0 errors, 6 warnings (none in changed files) |
| Prettier on the changed files | clean (the repo-wide `format:check` lists ~31 other files; not from this work) |
| `pnpm build` | **not run** |

## To run (database needed)

1. `pnpm db:start`, then apply **0067** and **0068** (`supabase migration up --local`) on a database that already has 0001-0066.
   - **0068 is a DRAFT**: the owner has not approved which written BRSR answers HR and Finance may type. Read it first.
   - Migration numbers: `feature/esg-decision-intelligence` also uses 0053-0055, which `main` already has. Whoever merges second renumbers.
2. `pnpm db:test`. Expected new or changed assertions:
   - `role_dashboard_permissions.test.sql` (13, new).
   - `phase2_smoke.test.sql`: 9 system roles, 24 permissions, admin holds 24.
   - `role_permission_defaults.test.sql`: 24 permissions; HR and Finance lists now include the new permissions.
   - `chat_analyst.test.sql`: the "every role may use the chatbot" check now excludes `auditor`.
   - These counts were edited by hand and never executed; a wrong count is likely the first thing to fix.
3. `pnpm --filter web test:isolation`: the extended `cross-project.mjs` adds a user who is Corporate ESG at Project X and Project Manager at Project Q. Expect all PASS; any FAIL is a real scope leak.
4. `pnpm --filter web test:e2e` and `test:a11y`: Corporate ESG now reaches `/admin/*` pages; the sidebar changed for non-administrators.
5. `pnpm build`.

## By hand in a browser

- **Corporate ESG** (no administrator role): sidebar shows Scope 1/2/3, Data Explorer, Submission Monitoring, Carbon Analytics, Reports, Approvals. Open each: no Remind, Acknowledge, Organization link, Evidence Bundle button, OCR Retry or document-type correction. `/admin`, `/admin/conversion-factors`, `/admin/audit-trail` etc. redirect to `/app?notice=forbidden`.
- A user who is **Project Manager at A and Corporate ESG at B** sees B only on those pages.
- **Finance/CSR** assigned at the **group**: BRSR Disclosures opens, shows the yearly inputs form (with the new Net worth field) and only the finance questions. Assigned at a **project**: the page opens but the procedures refuse (FORBIDDEN).
- **HR** at the group: only the workforce questions. Saving a question they do not own is refused.
- **Assurance Reviewer** (role `auditor`, invite one via Admin -> Users): monitoring pages only, no Upload / My Submissions in the sidebar, no chatbot.
- Super Admin: unchanged (sidebar, Reports inputs form, Disclosures all questions).

## Known gaps in this step

- `evidence.read` exists but no page or procedure uses it yet (Auditor dashboard phase).
- The Auditor's audit-trail view with emails and IPs masked is not built.
- Net worth is stored with the yearly inputs and printed in the report's methodology table (unit-tested); not yet in the Excel workbook or the A-24 answer.
- Not started: the employee register, the dashboard itself.

## Capture fields and certificates (migration 0069, OCR `rules-15`)

Written without a database; **not run**. Worker unit tests (59, including 8 new in `tests/unit/test_rules15.py`) pass; Ruff and the Docker image build were not run.

1. Apply **0069** after 0067/0068, then `pnpm db:test` (new `capture_fields_and_certificates.test.sql`, 9 assertions). Also watch `audit_2.test.sql` ("no metric is left without a BRSR mapping"): the certificate metric is mapped to P6-E13 as **not applicable** to keep that invariant.
2. **Order matters:** push the migration to hosted first, then rebuild the worker image (`docker build -t traceesg-ocr-worker apps/ocr-worker`, check `EXTRACTOR_VERSION` is `rules-15`) and recreate the hosted worker container. A worker newer than the database fails every job.
3. Upload a CSR payment record with a "Number of beneficiaries" line and a procurement statement with a "Procured from within India" line: both should appear as optional fields on Verify. Upload a consent order: the type should classify (or be pickable) and Valid until should be read.
4. Known limits: **Validity (months)** is typed by the person (Verify needs exactly one required number field, and a certificate rarely prints it); no part-of-whole rule for within-India spend (the existing rule fails when the field is empty); the report still prints only the MSME share under P8-E4; certificates are not in the BRSR report.

## Employee register (migration 0070, `/app/employee-register`)

Written without a database or a browser; **not run**. `pnpm typecheck`, lint, Prettier and the unit tests (318, including 8 for the register's reading and totals) pass.

1. Apply **0070** after 0069, then `pnpm db:test` (new `employee_registers.test.sql`, 9 assertions; `phase2_smoke` and `role_permission_defaults` now expect 26 permissions and the new table).
2. In a browser as **HR** assigned at a unit:
   - sidebar shows **Employee Register**; download the template; fill a few rows (include a duplicate ID and a bad gender) -> upload is refused with the row numbers and nothing is saved;
   - a clean file -> totals appear, status "Waiting for HR to confirm"; Confirm; then as **an approver who is not the uploader or confirmer** (Corporate ESG at the same unit) Approve or Return (a note of 10+ characters);
   - uploading again for the same unit and year while one is pending replaces it; while **approved** it is refused until an approver returns it.
3. **Who has an account** (HR / Super Admin): matches the file's employee IDs to `users.employee_id`; shows ID, name, account status only (no gender, disability or wages). **Open the file** downloads it. Both write an audit entry (`employee_register.opened`, `.file_downloaded`).
4. Check nobody else gets in: a Project Manager gets 403 on `/api/employee-register`, its template and file routes; a unit outside the user's scope returns 404 on the file route.
5. Nothing person-level may reach the database: after an upload, `select totals from employee_registers` holds counts and sums only, and `audit_logs.new_value` holds the file name, hash and a head-count, never a person.
6. Limits to look at: the upload goes through a Next route handler, so a host that caps request bodies (Vercel: 4.5 MB) caps the register; a very large register may need a signed-URL upload like documents. Totals recompute from the file only at upload time. The register is not yet read by the dashboard or the report.
