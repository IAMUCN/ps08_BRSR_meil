# Grill: role-specific, analytics-first dashboard
Date: 2026-11-12

Audit that led here: chat of 2026-11-12 (existing dashboard, role-permission matrix, gap analysis, architecture).
Nothing has been built yet. Deviation numbers (D/A) are taken when the work lands, not now.

## Intent
One shared, data-driven dashboard whose tiles, data and charts follow the signed-in person's real permissions
and org scope (not role names, not the browser), in the existing EmeilSG theme: compact KPI row, a "Needs
action" band, then an analytics grid with real charts. Every number comes from the database; a tile with no
data is hidden or shows a clear empty state, never an invented figure.

## Constraints
- Hide, do not grey out. Unauthorized tiles are never sent to the browser.
- Existing role identifiers are kept (`admin` = Super Admin, `org_admin` = Administrator, `corporate_esg`,
  `project_manager`, `ehs`, `hr`, `finance_csr`, `procurement`). No renames.
- Configuration tiles (conversion factors, BRSR mapping, hierarchy configuration) are Super Admin only.
- Comparison **across the whole group** only for people assigned at group level. A person may still see a
  breakdown of the child units inside their own scope.
- Authorization is on the server; the frontend never filters unrestricted data.
- No fabricated data; zero, missing and not-reported are three different states.
- The Vercel connection pool is 3: dashboard loaders run in small batches, one batched server call, no N+1.
- Build on `main`; do not depend on `feature/esg-decision-intelligence` (it goes to `main` later; its owner
  renumbers its migrations `0053`-`0055`, which `main` already has).

## Key decisions
- Corporate ESG drill-through: open the existing **read** pages (Scope 1/2/3, Data Explorer, Submission
  Monitoring, Carbon Analytics view) to `monitoring.view` holders, scope-checked as for Administrators.
  Reason: otherwise the charts for this role link to forbidden pages. Alternative rejected: duplicate `/app`
  pages; display-only charts.
- Every mutation on those pages (send reminders, change document type, return wrong activity, acknowledge
  alert, Check now) stays Super Admin / Administrator only, hidden in the UI **and** refused by the server.
  CSV export allowed, for rows in the person's scope only.
- Reports: the pages open to `report.generate` holders on the existing permission (Corporate ESG already holds
  it, migration `0048`). Roles, permissions and behaviour otherwise unchanged. The evidence-bundle download
  stays as it is today (admin area).
- Still closed to Corporate ESG: Forecast, Simulator, Deadlines, Audit Trail, OCR Monitoring, Conversion
  Factors.
- Data capture comes **first**, then the dashboard. Evidence-backed (document, OCR, verify, approve):
  headcount by employee category and employee turnover rate (new fields on the Workforce Statement; the rate
  computed from summed counts, never averaged), CSR beneficiaries (CSR payment record), within-India
  procurement share (Procurement Statement, computed like MSME share), certificate expiry date (certificate
  document types). Typed yearly input: **net worth**, beside turnover on Admin -> Reports.
  "Vendor evidence pending" is derived from existing record states (procurement records still waiting for a
  document or in Verify); no new data.
- Finance and HR may change their own typed areas (new permissions, not role names, so a Super Admin can grant
  or withdraw them; audited with old and new values):
  - Finance/CSR: the four yearly financial inputs (turnover, PPP rate, net worth, output) and the BRSR
    Disclosure answers on finance and CSR. Group-level assignees only (one value per financial year).
  - HR: BRSR Disclosure answers on workforce, wages, training, complaints (e.g. P5-E3(b), P5-E7).
- Auditor role: create `auditor` ("Assurance Reviewer") in a migration with `audit.view`, `monitoring.view`
  and a new read-only `evidence.read`; no upload, verify, approve, report-generate, user or config rights.
  Accounts come through the existing invite flow (no new login system). Scope = assigned units and below.
  Staff email addresses and IP addresses are masked in what an Auditor sees (taken as accepted; reverse if
  not wanted). A test must call every mutation as an Auditor and expect refusal.
- "Overdue" is only: (1) an expected submission missing after its period's due date, (2) a period past its due
  date and still open, (3) an overdue deadline task from the Deadlines engine (reuse it so the page and the
  dashboard agree). Returned records and pending approvals keep their own classes whatever their age.
  "Stuck validation" = flagged and unreviewed for more than 7 days, as a setting.
  "Expired factor" = no active version covers the current financial year.
- Multi-role scope: a tile covers the units where an assignment whose role holds that tile's permission sits
  (not the flat union the session holds today). Headline numbers combine the person's whole scope
  (deduplicated; a shared unit counts once) and a per-unit breakdown bar sits beside them; a picker narrows to
  one unit; every tile carries a caption naming its scope. Same tile id is rendered once.
- Core KPI checklist: add an `is_core` flag on `brsr_indicators`, seeded from the table in `ASSURANCE.md`,
  editable by the Super Admin; the checklist is labelled "Core KPIs as listed in the L&T FY2025-26 report;
  confirm against SEBI's annexure before filing".
- Charts: our own small SVG kit (donut, radial progress, line/area, horizontal bar, stacked bar), tokens
  `--chart-1..6` in all three themes plus the existing `--scope-*` and `--status-*`; every chart has a legend,
  tooltip, units, an empty state and a text-table fallback; click-through uses real links. No new dependency.
- Layout: a compact KPI row, then a "Needs action" band (overdue, then returned, then pending; collapses to
  one line when nothing needs action), then the analytics grid in each role's importance order (does not
  reorder with counts). Ordering is one pure, unit-tested function.
- Tiles are links to the existing filtered pages (existing URL params); no new detail pages.

## Surfaced assumptions
- Corporate ESG approves anything in its org scope, not particular categories (that is how `0009`/`0050`
  work). Project Managers and the functional roles do not approve unless an Admin grants `approval.decide`.
- EHS, HR, Finance and Procurement hold identical permissions today, so their tiles key on the categories the
  role owns (`esg_categories.owning_role_id`) as well as on permission.
- Super Admin and Administrator do not get the functional-role tiles (HR, EHS, Finance, Procurement).
- An Administrator keeps the people-and-access tile and a read-only unit tree; the hierarchy-configuration tile
  is Super Admin only (spec conflict resolved this way).
- Completion charts depend on configured expected submissions; on hosted only MSRTC, BEST and Olectra have
  them, so most unit-completion charts will show an empty state until more are configured.
- The existing `records.summary` header counts (organizations, projects, active users) are group-wide and
  count only `unit_type = 'subsidiary'`: a leak for Administrators and stale; fixed in Phase 0.

## Open questions
- The reference screenshot was not attached; the layout follows the description. Attach it before Phase 3.
- Which document types carry certificates that expire (waste disposal certificate, consent to operate, other?).
- The exact employee categories for headcount (permanent / other, employee / worker, management level?) and
  how turnover is defined (leavers over average headcount, per BRSR).
- Which financial inputs and which written-answer questions belong to Finance and which to HR (the mapping of
  BRSR questions to the two permissions).
- SEBI's BRSR Core annexure, to check the seeded Core KPI list.
- Whether Corporate ESG should ever get reminders (not now).

## Out of scope
- Merging or depending on `feature/esg-decision-intelligence`.
- A second factor, MFA, or any new login system.
- Opening Forecast, Simulator, Deadlines, Audit Trail, OCR Monitoring or Conversion Factors to Corporate ESG.
- Hardcoding the Core KPI list; adding a chart library; placeholder tiles.
- Hosted changes (migrations, worker replacement) without the owner's explicit go at each step.

## Proposed order (one phase at a time, stop for a go-ahead after each)
0. Backend authorization: permission-scope helper (units where a permission is held), scoped header counts,
   read pages and Reports opened to `monitoring.view` / `report.generate` holders with mutations closed,
   isolation tests. Branch `feature-role-dashboard` (a branch called `feature` exists, so no slash).
C. Capture: migrations `0067`+ (new permissions, `auditor` role and `evidence.read`, `is_core`, new fields,
   net worth input), OCR rules and worker rebuild, Verify fields, tests. Hosted only with a go.
1. Registry, visibility, multi-role aggregation, urgency ordering, batched dashboard API.
2. Chart kit and tokens.
3. Role content: Admin, Administrator, Corporate ESG, Project Manager, EHS, HR, Finance/CSR, Procurement,
   Auditor.
4. Common tiles and drill-downs (period, my tasks, returned, notifications, chatbot).
5. Tests: roles, multi-role, scope, unauthorized API calls, ordering, empty/loading/error, three themes,
   desktop/tablet/mobile, a11y suite, regression.

## Phase 0 built (2026-11-12, branch `feature-role-wise-dashboard`, local commits only, nothing pushed)
- `lib/auth/scope.ts`: `scopedOrgUnitIds`, `inOrgScope`, `defaultOrgUnitId`, `assertOrgScope` take an optional
  permission; only assignments whose role holds it count. Without it, behaviour is unchanged.
- `lib/auth/workspace.ts` (pure rules) and `requireAdminWorkspaceSession` / `requireMonitoringSession` /
  `requireReportsSession` in `lib/auth/session.ts`. The `/admin` layout admits anyone with a page there; every
  page still guards itself.
- Opened to `monitoring.view`: Scope 1/2/3, Data Explorer, Submission Monitoring, Carbon Analytics
  (`scope.getTotal`, `records.search|missing|detail`, `analytics.units|overview|byUnit|alerts`), scoped to the
  units where a role of theirs holds `monitoring.view`. Reports pages opened to `report.generate`, scoped to
  where that permission is held (reports router, file route, bundle route, report forwarding).
- Still Administrator / Super Admin only, in the UI and on the server: send reminders, change document type,
  return wrong activity, retry OCR, acknowledge alert, alert thresholds, AI wording, the evidence-bundle page,
  Organization links. A record's detail carries `viewer.canAct` and `viewer.canViewAudit` for the drawer.
- `lib/dashboard/summary.ts`: header counts (organizations, projects, active users) now count the chosen
  subtree only. "Organizations" still counts `unit_type = 'subsidiary'`; the headline row is redefined in the
  dashboard phase.
- Corporate ESG's sidebar offers those pages (`workspaceNavFor`).
- Checked: new unit tests `tests/workspace-access.test.ts` (8) and `tests/scope-permission.test.ts` (5) pass;
  the other unit tests pass except three files that cannot load here (`jszip`, `setimmediate` not installed);
  Prettier clean on every changed file; `tsc` reports no error from any line changed (84 errors elsewhere come
  from older library versions in this checkout's `node_modules`).
- **Not run:** ESLint (its install is incomplete here); a full build; the database-backed isolation test
  (`pnpm --filter web test:isolation`, extended with a Corporate ESG + Project Manager user, written but not
  executed: no Docker or local database on this machine); the end-to-end suite; any browser view. Node is not
  installed on this machine, so tests ran under Bun.
