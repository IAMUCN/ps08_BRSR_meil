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

## Capture decisions, answers of 2026-11-12 (later the same day)
- **Certificates:** one generic "Certificate with expiry date" plus Consent to Operate, Consent to Establish,
  Hazardous Waste Authorization, Fire NOC and ISO 14001/45001; shared fields (certificate number, issuing
  authority, valid from, valid to); no calculation; dashboard window 60 days. The owner does not know what EHS
  tracks today, so the list is the common compliance certificates and is editable data.
- **Headcount and turnover: option B, a separate employee register with no logins** (supersedes "new fields on
  the Workforce Statement" above). HR uploads the register as the evidence document. Reason: the BRSR needs
  about 30 headcount numbers, SEBI's Annexure I names the "Employee Master / Register" as the assurance source
  for gender wages, and job creation in smaller towns needs each person's place of employment; accounts exist
  only for people who log in, so counting them would print a wrong headcount. Alternatives rejected: attributes
  on accounts (undercounts unless everyone has an account); aggregate counts typed or read from a statement
  (about 30 fragile OCR fields).
- **Core KPI list:** seeded from SEBI Annexure I (circular SEBI/HO/CFD/CFD-SEC-2/P/CIR/2023/122, 12 July 2023,
  read from SEBI's own PDF), not from `ASSURANCE.md`, which is to be corrected: safety is permanent disabilities,
  LTIFR and fatalities (not recordable or high-consequence injuries); the MSME KPI includes sourcing from within
  India. Core questions in our database: P6-E7, P6-E3, P6-E4, P6-E1, P6-E9, P3-E1(c), P3-E11, P5-E3(b), P5-E7,
  P8-E4, P8-E5, P9-E7, P1-E8, P1-E9. Label: "SEBI Annexure I, 12 July 2023". Later revisions (December 2024
  industry standards) were not checked.
- **Finance / HR mapping:** drafted in chat, **not yet approved**. EHS and Procurement typed-answer permissions
  not yet asked for; safety and P6 stay Super Admin-only until then.

## Open questions (added)
- Employee register: store person-level rows in the database, or only the counts computed from the upload with
  the original file kept as private evidence? Recommended: counts only (data minimisation).
- Employee register: how it passes the approval flow, who may upload it, per-period snapshot, retention, and
  what an Auditor sees.

## Employee register: decided (2026-11-12)
- **Counts only, no person-level rows in the database.** HR uploads the register (Excel); the server computes the
  totals once (headcount by employee/worker, permanent/other, gender, differently-abled; leavers; opening and
  closing headcount; wages by gender and by place-of-employment class) and saves only those, with the original
  file kept as private evidence (hash-checked like every document). A person verifies the computed totals
  before they count; they then go through the normal validation and approval flow.
- **Super Admin and HR can open the uploaded register when they need it** (by permission, not role name, so a
  Super Admin can grant or withdraw it), inside their org scope.
- **That view says which people in the register have an EmeilSG account and which do not**, matched on employee
  ID against `users.employee_id`, worked out when the view is opened from the file and never stored. Defaults
  (not yet confirmed): it shows employee ID, name if the register has one, and account status (none / active /
  deactivated); it does not show wages, gender or disability; it counts "N of M have an account". It does not
  invite anyone.
- Not given access unless the owner says so: Administrators, Corporate ESG, Auditor (an Auditor would get the
  aggregates and the verified totals, with the file only if a permission is granted).
- Defaults proposed for the rest (not yet confirmed): one register per org unit per financial year, "as at"
  31 March, with leavers during the year; a unit's figure is the sum of its children's registers.

## Capture fields and certificates built (2026-11-12, migration 0069, OCR rules-15; unverified)
- CSR beneficiaries: optional number field on the CSR payment record. Within-India procurement: optional number
  field on the Procurement Statement (not a second activity); the share is Sum(india_spend) / Sum(total_spend)
  over approved records, computed by the dashboard query. No part-of-whole rule (it fails on an empty field).
- Certificates: category "Environmental Compliance" (EHS), activity COMPLIANCE_CERTIFICATE, six document types
  (generic, consent to operate, consent to establish, hazardous waste authorization, fire NOC, ISO). Fields:
  number, issuing authority, valid from, valid until, validity in months. Validity in months is the one
  required number field Verify needs and is typed by the person. Mapped to P6-E13 as not applicable.
- Employee register, net worth printing in the report, and the report's within-India sub-part are still to do.

## Employee register built (2026-11-12, migration 0070; unverified against a database)
- Counts only, as decided: `employee_registers` holds totals (headcount by employee/worker, permanent/other,
  gender, differently abled; permanent opening, closing and leavers; wages by gender and in smaller towns); the
  file is in the private `registers` bucket. Totals are as at 31 March; turnover is leavers over the average of
  opening and closing headcount, recomputed from summed counts.
- Flow: HR uploads (a file with any unusable row is refused whole, with row numbers), HR confirms the totals, an
  approver who is neither the uploader nor the confirmer approves or returns (enforced in the procedure and by a
  database constraint). One live register per unit and year; an approved one must be returned before a new upload.
- Permissions: `employee_register.manage` and `.view` for the Super Admin and HR; approving uses `approval.decide`.
  Opening the file or the account-status view is audited. The account-status view shows ID, name and account
  status only.
- Not yet: the dashboard and the report do not read the registers; net worth, the within-India sub-part and the
  report's P8-E4 are still to do.

## Phase 2 built (2026-11-12): registry, visibility, ordering, API (unverified against a database)
- `lib/dashboard/tiles.ts` (pure): the tile registry (9 tiles so far), who sees what from permissions and where they are held
  (a tile covers the units where a role holding its permission is assigned), each tile once for a multi-role user, the "Needs action"
  band (overdue, then returned or failed, then pending; only tiles with something to do) and the overview in registry order, and a
  concurrency limiter (three tiles load at a time because the host pool is small).
- `lib/dashboard/loaders.ts`: one loader per tile, queries limited to the tile scope on the server, shared work cached per request and never
  across scopes; a failing tile degrades to an error card. `dashboard.tiles` is one batched call. `validation-review` is only offered to
  administrators because its page is theirs.
- Shown on `/app` and `/admin` above the old content. Next: chart kit and tokens (Phase 3), role content (Phase 4), common tiles and drill-downs
  (Phase 5), tests (Phase 6).

## Phase 3 built (2026-11-12): chart kit and tokens (unverified in a browser)
- The reference screenshot never arrived; built from the description (own SVG, no library, KPI row + band + grid kept). Replace the look if
  the screenshot shows something else.
- `lib/charts/geometry.ts` (pure, 9 tests): polar/arc paths, donut layout, nice ticks, scales, line paths that break at a missing value,
  stacked layout, Indian number grouping.
- `components/charts/`: `DonutChart`, `RadialChart`, `LineChart`, `BarChart` (stacked with several series), `BarList`. Each chart: a title,
  a legend that also prints values, a tooltip on hover and focus, marks that are real `<a>` links when given an `href`, a "View as table"
  fold with the same figures, and an empty message instead of a chart of zeros. A missing value is a gap, never zero; a percentage with
  nothing to measure is "—".
- Tokens `--chart-1..6` per theme (`app/globals.css`), checked by `tests/chart-tokens.test.ts` (3:1 on card and page, pairwise distinct).
- First use: the Reporting completion tile draws four rings. The other tiles stay plain cards until Phase 4 gives them their role content.
- Duplicates: removed on `/app` (period and the two task cards). On `/admin` kept, because the Issues list and pipeline follow the
  org/period picker and the tiles do not yet; Phase 4 makes the tiles follow it and then removes the rows.

## Phase 4a built (2026-11-12): Group Overview from the owner's reference (unverified against a database or in a browser)
- The owner attached the reference (a Group Overview: a row of figures, an emissions donut with a scope list and a trend, completion rings by
  level, a hierarchy with progress, performance per unit, pending actions). Their steer: charts, but not full charts, with text beside them.
  Every picture here has its figures as text next to it, plus the "View as table" fold on the donut and line charts.
- New tiles (`monitoring.view`): `emissions`, `structure` (figure cards), `emissions-overview`, `completion-by-level`, `hierarchy-status`,
  `unit-performance` ("wide" cards in an Analysis section; the figure cards stay in the Overview grid). "Pending actions" is the existing
  Needs-your-attention band.
- A unit is finished when it has expected submissions in its subtree and all are approved; nothing expected is shown as "Nothing expected", not
  0 % or 100 %. Emissions are approved records in kgCO2e or tCO2e, in tonnes; other units are not added in.
- `lib/dashboard/overview.ts` (pure, 5 tests) shapes the SQL rows; `loaders.ts` holds the queries; `components/dashboard/tile-charts.tsx` draws them.
- Still to do in Phase 4: the other roles' content (Project Manager, EHS, HR, Finance, Procurement, Auditor) and the Super Admin extras.

## Phase 4b built (2026-11-13): role-specific tiles and Super Admin extras (unverified against a database or in a browser)
- A tile can be keyed on a role code (an assignment of that role) as well as a permission, for the work a role owns; the same tile id is shown once
  to someone with several of the roles, each role's units kept apart. Super Admin and Administrator do not get the functional roles' tiles unless
  assigned the role (decision above).
- Functional roles (Project Manager, EHS, HR, Finance/CSR, Procurement) get "Your area's records" and "Missing in your area"; Project Manager also
  gets the emissions of their units; HR the employee register; EHS compliance certificates; Finance the yearly financial inputs (through
  `financial_inputs.manage`); the Auditor evidence coverage (through `evidence.read`, with the Group Overview tiles it already gets through
  `monitoring.view`); everyone with `monitoring.view` BRSR readiness; the Super Admin factors, people and access, and reports and audit activity.
- Procurement's "vendor evidence pending" is the "To verify" part of its records donut (no new data), as decided.
- Certificates: expired within 90 days or expiring within 60 days (the owner's window) are listed; older expired ones are history.
- Not done: Administrator's people-and-access tile, Finance disclosure answers tile, hierarchy configuration tile (Super Admin only), collapsible
  hierarchy rows, removing the old `/admin` cards, EHS and Procurement typed-answer permissions (the owner has not decided).

## Phase 5 built (2026-11-13): tiles follow the org picker; duplicates removed (unverified)
- `dashboard.tiles({ periodId, orgUnitId })`: the chosen unit narrows each unit-based tile by intersection with its own scope (`narrowScope`, pure,
  tested). Tiles marked `global` (system health, factors, people and access, reports and audit activity) and own-record tiles do not narrow.
- Removed on `/admin`: pipeline cards, BRSR Readiness card, two Issues rows, all of which a tile now carries. The owner asked for the duplicates to go.
- Left for the owner: a chatbot tile, the Deadlines engine as a source of "overdue", and a picker on `/app`.

## Phase 6 built (2026-11-13): tests (written, not run; no database or browser on this machine)
- Unit (run, pass): every registered tile has a loader and the reverse (read from the loaders' source), ids and ranks are unique, plus the earlier visibility,
  multi-role, narrowing, ordering, chart-geometry, chart-token and overview tests (358 in all).
- `tests/e2e/role-dashboard.mjs` (API, in the suite) and `tests/e2e/ui-role-dashboard.mjs` (browser, run on its own) as described in
  ROLE_DASHBOARD_VERIFY.md. Not run.
