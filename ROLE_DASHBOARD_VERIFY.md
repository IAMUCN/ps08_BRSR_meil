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

## Dashboard tiles: registry, visibility, ordering, API (Phase 2)

Written without a database or a browser; **not run**. Typecheck, lint, Prettier and the unit tests (330, including 11 in
`tests/dashboard-tiles.test.ts` for the registry, visibility, multi-role merging and ordering) pass.

1. `pnpm --filter web test:isolation`: new probes `dashboard.tiles()` for every persona and two checks for the Corporate ESG + Project
   Manager user (the tiles never cover Project Q; the approval tile is offered from the Corporate ESG role).
2. The loaders in `lib/dashboard/loaders.ts` are plain SQL checked only by the type checker. Please run `dashboard.tiles` against a database
   with data and compare each count with the page it links to: Documents to verify and Returned (My Submissions tabs), Pending approvals
   (Approval Queue), Flagged for review (Validation Queue), Missing submissions (Submission Monitoring), System health (OCR Monitoring).
   Columns relied on: `esg_records.verified_by`, `validation_results.evaluated_at`, `ocr_jobs.status`, `documents.created_at`,
   `notifications.is_read`, `org_unit_tree`, `reporting_period_today()`, `reporting_period_late()`, `reporting_period_locked()`.
3. In a browser, `/app` and `/admin` show a "Needs your attention" band and an "Overview" grid above the old cards:
   - Project Manager: only Reporting period, Documents to verify, Returned, Unread notifications.
   - Corporate ESG: also Pending approvals, Missing submissions, Reporting completion, scoped to its unit (the caption says which).
   - Administrator with `validation.review`: also Flagged for review. Super Admin: also System health.
   - A tile whose query fails shows "could not be loaded" instead of breaking the page (check the server log line `dashboard tile ... failed`).
4. Ordering: make a record overdue/returned/pending and check the band order is overdue, then returned or failed, then pending.

Known limits: the old cards still sit below the tiles (some duplicate them) until Phases 3-4 replace them; tiles are plain cards (no
charts yet); "stuck" is a constant of 7 days (`STUCK_DAYS`), to become a setting; the approval count excludes the viewer's own records
(a Super Admin's marked self-approval is not counted); tiles for factors, BRSR readiness, reports and audit activity, users and
hierarchy, scope donut and trends, and all role-specific tiles (EHS, HR, Finance, Procurement, Auditor, Project Manager charts) are not built.

## Chart kit and duplicate cards removed (Phase 3)

Written without a database or a browser; **not seen on a screen**. Typecheck, ESLint, Prettier and the unit tests (342, 12 new in
`tests/chart-geometry.test.ts` and `tests/chart-tokens.test.ts`) pass.

1. `/app` (Project Manager): the old "Current reporting period" card and the two task cards are gone; the Reporting period, Documents to
   verify and Returned tiles carry them. Check the tiles show the same counts as My Submissions' tabs, and that "Your project's emissions"
   and "Your assignments" still show below. The period tile names the first open period and "N more open"; the old card listed all of them.
2. `/admin`: nothing was removed. The Issues list and pipeline cards follow the org/period picker; the Pending approvals, Missing submissions
   and Reporting completion tiles do not yet, so removing the rows would lose the picker. Phase 4 makes the tiles follow the picker, then the
   duplicate rows go.
3. Reporting completion tile (Corporate ESG, Administrators, Super Admin) now draws four rings (Submission, Evidence, Validation, Approval).
   Check each ring against the number printed in its middle and the sentence above, in all three themes; a step with nothing to measure shows
   "—" and an empty ring, never 0 % or 100 %.
4. The chart kit itself (`components/charts/`: `DonutChart`, `RadialChart`, `LineChart`, `BarChart` (stacked when given several series),
   `BarList`) is used by no page yet except the rings. Phase 4 uses it. Please look at it once on a scratch page or in Storybook-like use:
   tooltips on hover and on keyboard focus, a mark with `href` is a real link, "View as table" lists the same figures, an empty chart says so,
   and `--chart-1..6` are readable in Special, Corporate and Dark.
5. Colours: `--chart-1..6` in `app/globals.css` (all three themes), tested for 3:1 against the card and the page and for not being mistakable
   for each other (`tests/chart-tokens.test.ts`). A person has not looked at them side by side.

## Group Overview tiles (Phase 4a, from the owner's reference screenshot)

Written without a database or a browser; **the SQL has not been run and nothing has been seen on a screen**. Typecheck, ESLint, Prettier,
the production build and the unit tests (347, 5 new in `tests/dashboard-overview.test.ts`) pass.

Six new tiles for anyone holding `monitoring.view` (Super Admin, Administrator, Corporate ESG), each limited to the units where a role of
theirs holds the permission: **Total emissions** and **Organisation** (figure cards), and in a new "Analysis" section **Emissions overview**
(donut by scope with a text legend of value and share, plus a trend line), **Reporting completion by level** (a ring per hierarchy level, with
"x / y"), **Organisational hierarchy and reporting status** (top units and the units directly beneath, bar and "NN % · x of y") and
**Performance by unit** (completion bar and tCO2e per unit directly beneath the top). The reporting-completion rings became an Analysis card.

1. Run `dashboard.tiles` on a database with approved emissions and expectations and compare:
   - Total emissions and the donut with Scope 1/2/3 on `/admin/scope-1`, `-2`, `-3` for the same org and period (tonnes: kg is divided by 1000;
     a record in any other unit is not counted). The trend is the latest six periods with approved emissions, oldest first.
   - Completion by level and the hierarchy rows with Submission Monitoring's "missing submissions" for the same unit. A unit counts as finished
     when it has expected submissions in its subtree and every one is approved; units with none expected are left out, never shown as 0 %.
   - Level names come from `org_levels`; nothing is hard-coded.
2. Columns relied on: `consolidation_records.*`, `scopes.parent_scope_id/code`, `reporting_periods.start_date/label/period_type`,
   `submission_expectations`, `org_levels.label/sort_order`, `org_units.parent_id/unit_type/deleted_at`, `org_unit_tree`.
3. Check as a Corporate ESG user assigned to one subsidiary: no unit outside it appears in any tile (the extended isolation test covers
   Project Q for the mixed user). Check at phone width that the cards stack and nothing scrolls sideways, and in all three themes that the
   donut, rings and bars are readable.
4. Not built: collapsible rows in the hierarchy list (it shows the top units and the units directly beneath, at most 12 rows, and says how many
   are not shown); the Project Manager, EHS, HR, Finance, Procurement and Auditor role content; the Super Admin extras (factors, BRSR
   readiness, reports and audit activity, users and hierarchy).
5. On `/admin` the Issues list and the four pipeline cards still sit below the tiles: they follow the org/period picker and the tiles do not.

## Role-specific tiles and Super Admin extras (Phase 4b)

Written without a database or a browser; **the SQL has not been run and nothing has been seen on a screen**. Typecheck, ESLint, Prettier,
the production build and the unit tests (354) pass. No migration.

New visibility rule: a tile may be keyed on a role code (an assignment of that role), not only on a permission. A Super Admin does not get
these (they are a functional role's own work); each role's tile covers only the units where that role is assigned.

| Tile | Who | What it shows |
|---|---|---|
| Your area's records | Project Manager, EHS, HR, Finance/CSR, Procurement | Donut of the records in the categories the role owns, by My Submissions state, with the figures as text |
| Missing in your area | same | Expected submissions of those categories not yet filed, top 5 as a list (a Procurement "vendor evidence pending" reading is the "To verify" slice) |
| Emissions of your units | Project Manager | The scope donut and trend for the units where they are assigned (no links: they cannot open the scope pages) |
| Employee register | `employee_register.view` (HR, Super Admin) | Registers of the period's financial year by status, and the approved headcount |
| Compliance certificates | EHS | Certificates expired in the last 90 days or expiring within 60, from the verified `valid_to` field |
| Yearly financial inputs | `financial_inputs.manage` (Finance, Super Admin) | Which of turnover, PPP rate, net worth and output are provided for the financial year |
| Evidence coverage | `evidence.read` (Auditor) | Evidence, validation and approval rings; read-only |
| BRSR readiness | `monitoring.view` | Readiness per top unit with its parts; an internal indicator |
| Conversion factors | Super Admin | Factors covering today, with no version covering today, drafts awaiting approval |
| People and access | Super Admin | Active people, invitations waiting and expired unused |
| Reports and audit activity | Super Admin | Reports generated and failed (30 days), audit events (7 days) |

1. Run `dashboard.tiles` for a user of each role and compare: the donut with My Submissions for the same units and period (the tab rule is the same,
   but the population is every record of the role's categories in its units, not only the person's own); the missing list with Submission Monitoring's
   missing view; the certificate list with the Verify field values; factor counts with Conversion Factors; invitation counts with Users.
2. Columns relied on: `esg_categories.owning_role_id`, `roles.code`, `ocr_extractions.extracted_at`, `ocr_fields.field_key/verified_value`,
   `employee_registers.status/totals/financial_year`, `org_settings.value` under `brsr_report_inputs`, `conversion_factor_versions.status/effective_from/effective_to`,
   `user_invitations.consumed_at/revoked_at/expires_at`, `report_runs.status/requested_at`, `audit_logs.created_at`.
3. Check `cross-project.mjs`: the mixed user (Corporate ESG at Project X, Project Manager at Project Q) now gets the Project Manager tiles for Q and none of the
   permission tiles for Q (the check was updated for that).
4. Certificates: the verified `valid_to` text is read as 2026-03-31, 31/03/2026, 31-03-2026 or 31.03.2026; anything else shows no state. A renewal is a new
   certificate, so an old one is not matched to its successor: expired ones older than 90 days are not shown. Please confirm that reading with EHS.
5. Not built: an Administrator's people-and-access tile (the Super Admin one counts everyone); the Finance disclosure-answers tile; the hierarchy
   configuration tile; collapsible hierarchy rows; the removal of the old `/admin` cards.
