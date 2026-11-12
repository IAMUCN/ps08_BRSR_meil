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
- The net-worth value is stored with the other yearly inputs but not printed in the report yet.
- Not started: employee register, certificate expiry, within-India share, CSR beneficiaries, OCR rule changes (`rules-15`), the dashboard itself.
