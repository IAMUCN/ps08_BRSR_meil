# EMEILSG --- Feature Enhancement & Implementation Roadmap

**Purpose:** Master implementation specification for Claude Code\
**Source:** `TO IMPLEMENT IN OUR EMEILSG.txt` (40 requirements)\
**Execution rule:** Implement phases in order. Do not skip dependency
checks, modify production data, or start a later phase while its
prerequisites remain unverified.

------------------------------------------------------------------------

## 1. Instructions to Claude Code

You are working on the existing EMEILSG application. Treat this document
as the authoritative enhancement backlog.

Before changing code:

1.  Inspect the existing repository, architecture, database schema,
    migrations, authentication, roles/permissions, reporting workflow,
    OCR pipeline, notification services, deployment configuration, and
    current production build.
2.  Produce a concise baseline report: existing implementation,
    incomplete features, relevant files/modules, data flows, risks, and
    dependencies.
3.  Map every requirement in this document to the existing codebase.
    Reuse existing components and services where appropriate; do not
    create parallel implementations.
4.  Identify schema/API changes and backward-compatibility requirements
    before coding.
5.  Create a phase-wise execution checklist and update it as work is
    completed.
6.  For each phase, implement, test, document, and report results before
    proceeding.
7.  Do not silently remove, rename, or alter existing functionality.
    Preserve current production behaviour unless a change is explicitly
    required.
8.  Do not expose secrets, weaken authorization, or use production data
    for destructive testing.
9.  Use migrations and backups for database changes. Keep local
    development, staging, and production configurations separate.
10. Do not claim a feature is complete until its acceptance criteria and
    regression tests pass.

### Required working method

For every task: - Explain the current behaviour and the proposed
change. - Identify affected frontend, backend, database, OCR, and
integration modules. - Check whether the feature already exists
partially. - Implement the smallest maintainable change consistent with
the existing architecture. - Add or update tests. - Run relevant tests,
linting, type checks, and build. - Record files changed, migration
details, test evidence, known limitations, and rollback instructions. -
Mark the checklist item complete only after verification.

If a requirement is ambiguous or the current architecture does not
support it safely, stop and present the specific decision needed. Do not
invent business rules.

------------------------------------------------------------------------

## 2. Priority definitions

  -----------------------------------------------------------------------
  Priority                Meaning                 Execution approach
  ----------------------- ----------------------- -----------------------
  P0 --- Critical         Security, data          Must be addressed
                          integrity,              before dependent
                          authentication,         features and production
                          database and workflow   rollout
                          correctness             

  P1 --- High             Core submission, OCR,   Implement immediately
                          approval, reporting and after foundations
                          notification            
                          functionality           

  P2 --- Medium           Analytics, automation,  Implement after core
                          usability and           workflows are stable
                          productivity            
                          improvements            

  P3 --- Later            Optional enhancements,  Implement after feature
                          presentation polish and freeze and regression
                          mobile packaging        testing
  -----------------------------------------------------------------------

Priority is not permission to ignore dependencies. The phase order below
is the required execution sequence.

------------------------------------------------------------------------

# 3. Phased implementation plan

## Phase 0 --- Repository audit, architecture mapping and baseline

**Priority: P0**

### Tasks

-   Inspect the full application and document its current architecture.
-   Map the existing user roles, organizational hierarchy, permissions,
    reporting periods, submission lifecycle and approval flow.
-   Trace how files are uploaded, stored, checked for duplication,
    processed by OCR, validated and submitted.
-   Trace report generation, report forwarding, audit logs,
    notifications and carbon-equivalent calculations.
-   Identify all external services, APIs, environment variables and
    production dependencies.
-   Establish baseline tests and record existing failures before
    modifications.

### Deliverables

-   Architecture and module map.
-   Current database and relationship overview.
-   Existing workflow diagram.
-   Requirement-to-module mapping for all 40 source requirements.
-   Risk and dependency register.
-   Baseline test/build report.

### Exit criteria

No major implementation begins until the existing behaviour and affected
modules are understood.

------------------------------------------------------------------------

## Phase 1 --- Database foundation, security and identity controls

**Priority: P0 --- Critical**

### 1.1 Local database server

-   Configure the application to use the required local database server
    instead of relying on a cloud database service.
-   Inspect the current database engine and schema before selecting the
    migration approach.
-   Prepare a complete backup and a repeatable migration procedure.
-   Migrate schema, relationships, indexes, constraints and required
    data.
-   Verify row counts, relationships, permissions, timestamps and
    application behaviour after migration.
-   Keep development, staging and production configurations isolated.
-   Ensure the migration does not conflict with the recent build or
    production build.

### 1.2 Security audit and data integrity

Perform a systematic security audit focused on prevention of
unauthorized data access and manipulation.

Review at minimum: - SQL injection and unsafe query construction. - XSS
and unsafe rendering of uploaded or extracted content. - CSRF protection
where applicable. - File upload validation, size/type limits and safe
storage. - Broken object-level authorization (BOLA/IDOR). - Server-side
permission enforcement. - Rate limiting and abuse protection. -
JWT/session secret handling and secure cookie/token practices. -
Password hashing and reset flows. - CORS configuration. - Webhook
signature verification, if webhooks are used. - Database access
controls, constraints and row-level security where supported. -
Auditability of sensitive changes and administrative actions.

Add tests that attempt unauthorized access and unauthorized data
modification.

### 1.3 Login and concurrent-session restrictions

-   Enforce **one active login at a time for the Super Admin account**.
-   Enforce the requirement that multiple logins from a single device
    are not allowed.
-   Inspect the existing session model and define the exact scope of the
    device restriction before implementation.
-   Handle session revocation, logout, expired sessions and concurrent
    login attempts safely.
-   Show a clear message when a login is rejected because an active
    session already exists.
-   Do not rely only on frontend checks; enforce restrictions on the
    server.

### 1.4 Permissions terminology

-   Rename user-facing permission labels from technical schema/action
    names to understandable actions.
-   Example: `.upload` becomes **Upload documents**.
-   Preserve internal permission identifiers and authorization logic
    unless a schema migration is genuinely required.
-   Review all role and permission screens for consistent human-readable
    labels.

### Exit criteria

-   Local database is verified with backup and rollback procedure.
-   Security findings are documented and critical vulnerabilities are
    fixed.
-   Session restrictions work server-side.
-   Existing roles and permissions continue to work.
-   No unauthorized user can read or modify another user's protected
    data.

------------------------------------------------------------------------

## Phase 2 --- Submission lifecycle, duplicate handling and reporting periods

**Priority: P0/P1 --- Critical core workflow**

### 2.1 Define reporting and submission periods

-   Define the financial year, reporting period, submission period and
    allowed submission window.
-   Determine whether organizations can configure periods or whether
    they are centrally configured.
-   Do not hard-code assumptions until the current business rules are
    confirmed.
-   Define how late submissions, reopened periods, multiple submissions
    and period changes are handled.
-   Make the applicable period and deadline visible to users.

### 2.2 Submission lifecycle

Implement or refine a clear, traceable lifecycle:

1.  User uploads a document.
2.  System records the upload and displays its status.
3.  OCR scanning begins.
4.  OCR output and extracted fields are presented for review.
5.  End user validates or corrects extracted data.
6.  User submits the validated submission.
7.  The authorized upper-level officer reviews and validates it.
8.  The submission is approved, rejected or returned for correction,
    with status and reason recorded.

The UI must clearly communicate the current stage, responsible role and
next action.

### 2.3 Duplicate detection and file storage

-   Investigate the existing duplicate-detection behaviour.
-   Determine whether files are flagged by filename, file content, hash,
    OCR output, reporting period or a combination.
-   Do not automatically reject a file solely because its filename
    matches another file.
-   Define duplicate rules for:
    -   Same filename and same reporting period.
    -   Same filename across different reporting periods.
    -   Different filenames with identical file content.
    -   Same document uploaded again after correction.
    -   Similar OCR content that may represent a duplicate.
-   Establish whether files are replaced, versioned or stored
    separately. Never overwrite a prior submission without an explicit,
    auditable rule.
-   Store upload metadata, file hash, uploader, timestamp, organization,
    reporting period, version and processing status.
-   Show the user/admin why a submission was flagged and allow an
    authorized review decision.
-   Preserve original files and the history of
    corrections/resubmissions.

### 2.4 Submission monitoring

-   Simplify the admin and employee submission-monitoring interfaces.
-   Make pending, submitted, processing, rejected, returned and approved
    states easy to understand.
-   Display relevant document details, reporting period, uploader,
    submission date, current stage and next action.
-   Add category-wise filters based on OCR-detected document categories,
    such as electricity bills, diesel bills and other bills.
-   Allow administrators to review and correct an automatically
    suggested category.

### Exit criteria

-   Submission lifecycle is documented and works end to end.
-   Duplicate cases are tested and do not cause silent overwrites.
-   Reporting-period rules are explicit and consistently enforced.
-   Admin and employee monitoring screens show correct, role-appropriate
    information.

------------------------------------------------------------------------

## Phase 3 --- OCR, document intelligence and verification experience

**Priority: P1 --- High**

### 3.1 Unified OCR and submission monitoring

-   Merge the relevant admin views of Submission Monitoring and OCR
    Monitoring into a coherent workflow.
-   The original uploaded document must be accessible as an attachment
    from the admin submission view.
-   Show a PDF preview in Submission Monitoring instead of displaying
    only the PDF filename.
-   Provide appropriate image/PDF viewing and zoom controls.
-   Add zoom functionality to the extraction verification page.
-   Improve OCR Monitoring UI with clear status indicators, highlights
    and colour coding.

### 3.2 OCR extraction and document classification

-   Automatically identify bill/document categories, including
    electricity bills, diesel bills and other supported bill types.
-   Suggest the detected category to the admin; retain human
    confirmation/correction.
-   Investigate why OCR sometimes fails to extract the billing period
    from images.
-   Add diagnostics for unreadable, missing or ambiguous billing-period
    values.
-   Improve extraction confidence display and make uncertain fields easy
    to identify.
-   Do not silently invent missing values.

### 3.3 OCR-to-Excel verification interface

Build an improved image/PDF-to-Excel recreation and verification
interface: - Recreate extracted tabular data in an editable
spreadsheet-like view. - Mark low-confidence cells in red or another
clear warning treatment. - Highlight the corresponding region in the
source document when a cell is selected. - Keep source-document and
extracted-data views synchronized. - Allow the end user to correct
low-confidence values directly in the table. - Make the review,
correction and final submission steps explicit. - Preserve original OCR
output and corrected values for audit purposes.

### 3.4 Handwritten note recognition

-   Add handwriting recognition for handwritten notes included in
    submissions.
-   Integrate handwriting extraction with the existing OCR pipeline
    rather than creating an unrelated upload workflow.
-   Recreate recognized data in a one-to-one Excel-like structure where
    the source format supports it.
-   Use OpenCV or a suitable image-processing approach to identify/box
    low-confidence regions.
-   Allow users to tap/select a low-confidence cell and override its
    value.
-   Retain the original document region, extracted value, confidence and
    corrected value.
-   Treat handwriting recognition as assisted data entry; require user
    validation before final submission.
-   Use the reference/page diagram supplied by Nihar when it becomes
    available. Do not assume its contents before it is provided.

### Exit criteria

-   Original document preview and OCR output are accessible from the
    submission workflow.
-   Category suggestions and billing-period extraction are testable.
-   Low-confidence values are identifiable and correctable.
-   Source-to-table highlighting works.
-   Handwritten recognition is validated against representative samples
    and never silently submits uncertain values.

------------------------------------------------------------------------

## Phase 4 --- Approval hierarchy, report forwarding and audit trail

**Priority: P1 --- High**

### 4.1 Forward reports to upper-level verification

-   Add an option for an authorized report creator/admin to forward a
    generated project report to the appropriate upper-level officer for
    verification.
-   Example: an EV project admin generates a report and forwards it to
    the designated verification authority.
-   Resolve the recipient from the existing organizational hierarchy and
    permissions.
-   Record who forwarded the report, to whom, when, and its status.
-   Support review outcomes such as verified, rejected or returned for
    correction, according to the existing business process.
-   Notify relevant users when action is required.
-   Prevent unauthorized forwarding or approval.

### 4.2 Audit trail and user logs

-   Allow every user to view their own activity logs.
-   Implement role-specific audit-trail access.
-   Support hierarchy-aware visibility so users can view only logs they
    are authorized to access.
-   Provide views/filters for:
    -   My logs.
    -   Logs I am permitted to access.
    -   People under my organizational/role hierarchy.
    -   User role.
    -   Date/time range and relevant action.
-   Display the user's role alongside their audit entries where
    permitted.
-   Add a search bar to the Audit Trail page.
-   Ensure audit logs are tamper-resistant and capture sensitive
    actions, including uploads, edits, approvals, forwarding, permission
    changes and administrative operations.

### Exit criteria

-   Report forwarding follows the organizational hierarchy.
-   Approval and forwarding events are auditable.
-   Users can access their own logs and only the additional logs
    permitted by their role.
-   Search and filters return correct results without leaking
    unauthorized records.

------------------------------------------------------------------------

## Phase 5 --- Deadlines, reminders and notification system

**Priority: P1 --- High**

### 5.1 Reporting deadline reminders

Reuse the existing reporting-deadline window and notification
infrastructure where possible.

Support: - One-week-before reminder. - Five-days-before reminder. -
Three-days-before reminder. - Same-day reminder. - Daily reminders
during the final reminder window, where configured.

The source requirements mention both a one-week daily reminder window
and specific 5-day, 3-day and same-day reminders. Reconcile these into a
single configurable schedule. Avoid duplicate emails for the same event
and recipient.

### 5.2 Parent-child deadline reminders

-   Support reminders across parent and child organizational entities.
-   Start reminders one week before the deadline and continue through
    the deadline day.
-   Respect the organizational hierarchy and each entity's applicable
    reporting deadline.
-   Make the reminder status visible to authorized administrators.

### 5.3 Email notifications and visual representation

-   Send email-based notifications for upcoming deadlines.
-   Reuse the existing reporting deadline window rather than building a
    separate deadline system.
-   Add a visual representation of deadlines/reminder status if it fits
    the existing UI.
-   Track notification delivery/attempt status where supported.
-   Make reminder schedules configurable and timezone-aware.
-   Ensure retries do not create repeated duplicate messages.

### Exit criteria

-   Reminder schedules are tested at each configured interval.
-   Parent-child notifications target the correct recipients.
-   Duplicate notification prevention works.
-   Deadline status is visible and consistent with the reporting period.

------------------------------------------------------------------------

## Phase 6 --- Carbon factors, external references and carbon-credit links

**Priority: P1/P2 --- High/Medium**

### 6.1 Conversion-factor source references

-   In **Conversion Factors → Add Factor**, allow a source-reference
    URL/link.
-   Store the source URL, publisher/reference details, effective
    financial year and retrieval date where available.
-   Explore automatic fetching from a supplied link to extract the
    carbon-equivalent value and other required factor data.
-   Show fetched values for review before saving.
-   Validate units, geography, category, financial year and source
    reliability.
-   Keep manual entry and correction available.
-   Never silently replace an approved factor with scraped data.

### 6.2 SEBI/API-based annual factor updates

-   Investigate whether an official SEBI API or another authoritative
    supported source provides the required carbon-equivalent factors.
-   Verify API existence, access, licensing, response format, coverage
    and financial-year applicability before integration.
-   If no suitable API exists, document the limitation and propose an
    approved source/manual import workflow.
-   Store historical factors by financial year; do not overwrite
    historical calculation inputs.
-   Add an admin review/approval step for new or updated factors.

### 6.3 Carbon-credit reference and redirect

-   Add a carbon-credit reference section that explains where users can
    explore or purchase carbon credits.
-   If a verified provider or marketplace is available, provide a clear
    external redirect.
-   Do not imply that EMEILSG itself sells, certifies or guarantees
    carbon credits.
-   Validate external links and clearly identify third-party
    destinations.

### Exit criteria

-   Factor source references are stored and visible.
-   Any automated extraction is reviewable and auditable.
-   Financial-year history is preserved.
-   External carbon-credit links are verified and clearly presented.

------------------------------------------------------------------------

## Phase 7 --- Carbon analytics, trends and proactive alerts

**Priority: P2 --- Medium**

### 7.1 Year-wise emission trends

-   Show carbon-emission trends by financial year using available
    historical data.
-   Identify patterns and meaningful increases/decreases.
-   Make comparisons period-aware and consistent with the selected
    reporting scope.
-   Clearly indicate when historical data is incomplete or not
    comparable.

### 7.2 Policy/action recommendations

-   Use observed emission patterns to suggest practical reduction
    policies or actions.
-   Example: if travel expenses/emissions are unusually high in a
    reporting period, suggest reviewing travel practices or introducing
    a travel-regulation policy.
-   Recommendations must be explainable and tied to the underlying data.
-   Present suggestions as decision support, not automatic policy
    changes.

### 7.3 Emission threshold alerts

-   Define an expected average/baseline using an agreed methodology.
-   Alert the admin when emissions exceed the expected average or
    configured threshold.
-   Show the measured value, baseline, difference, period and affected
    entity.
-   Avoid alerts when the data is incomplete or the comparison is
    invalid.
-   Allow authorized configuration of thresholds if required.

### Exit criteria

-   Year-wise charts use verified data.
-   Recommendations include a clear reason and relevant evidence.
-   Threshold alerts are tested and delivered to the correct admins.

------------------------------------------------------------------------

## Phase 8 --- Reporting templates and dashboard usability

**Priority: P2 --- Medium**

### 8.1 Report generation templates

-   Provide 3--4 report-generation templates.
-   Make the template choice available during report generation.
-   Reuse the existing report data and permissions.
-   Ensure all templates contain accurate values and required sections.
-   Test exports and formatting across representative reports.

### 8.2 Dashboard and chart fixes

-   Fix the chart/table toggle for Scope 1, Scope 2 and Scope 3.
-   Ensure each toggle switches the correct data presentation and
    retains relevant filters.
-   Improve the Ask button at the top of the UI, including its
    glow/visual treatment and overall interaction design.
-   Improve the landing page visual design while preserving clarity,
    accessibility and performance.

### 8.3 Search improvements

-   Add a search bar to the Audit Trail page if not already delivered in
    Phase 4.
-   Add context-aware search across relevant application sections.
-   Search results must respect user roles and permissions.
-   Make the search scope clear and provide useful empty/no-result
    states.

### Exit criteria

-   All three scope chart/table toggles work.
-   Three or four report templates are available and verified.
-   Search results are permission-aware.
-   Landing page and Ask button changes pass responsive and
    accessibility checks.

------------------------------------------------------------------------

## Phase 9 --- Navigation, responsive UI and mobile application

**Priority: P2/P3 --- Medium/Later**

### 9.1 Mobile-responsive web UI

-   Optimize the existing application for mobile screens.
-   Move Import and the most frequently used tabs/actions to a bottom
    navigation area where appropriate.
-   Move less frequently used sections into a three-bar/hamburger menu.
-   Fix page scrolling, nested/section-level scrolling, tab scrolling
    and layout issues.
-   Ensure tables, charts, modals, forms, file previews and verification
    screens remain usable on mobile.
-   Remove the unwanted cursor appearance when tapping or interacting on
    mobile, including normal mobile browser view and desktop-site mode,
    without breaking legitimate text selection or accessibility.

### 9.2 Fully functional mobile application

-   Do this only after feature finalization and responsive-web
    stabilization.
-   Evaluate Capacitor or another suitable approach to package the web
    application as a mobile app.
-   Verify authentication, file upload, camera/gallery access if needed,
    notifications, navigation, deep links and session handling.
-   Do not treat a webview wrapper as proof that all mobile workflows
    work.
-   Test on supported Android/iOS devices and document platform
    limitations.

### Exit criteria

-   Core workflows are usable on mobile browsers.
-   Navigation and scrolling are consistent.
-   Mobile packaging is attempted only after feature freeze and passes
    device-level tests.

------------------------------------------------------------------------

## Phase 10 --- Help centre, documentation and final release readiness

**Priority: P2/P3 --- Medium/Later**

### 10.1 FAQ and documentation

Create a help/documentation section that includes: - Frequently asked
questions. - Website/application blueprint. - User roles and
responsibilities. - Organizational hierarchy. - Process-flow diagrams. -
Submission and OCR workflow. - Report generation and verification
workflow. - Reporting periods and deadlines. - Carbon-factor
management. - Common errors and troubleshooting.

Keep documentation aligned with the actual implemented product. Do not
document planned features as if they already exist.

### 10.2 Final release validation

-   Run full regression tests across all roles and organizational
    levels.
-   Test local database backup and restore.
-   Verify upload, OCR, correction, duplicate detection, submission,
    approval, forwarding, reporting and notifications end to end.
-   Run security tests and review audit logs.
-   Test desktop, tablet and mobile layouts.
-   Verify report exports and all supported templates.
-   Check external integrations and API failure handling.
-   Review performance for large files and larger data volumes.
-   Prepare deployment, rollback and operational documentation.

### Exit criteria

-   All P0/P1 acceptance criteria pass.
-   Known limitations are documented.
-   No unresolved critical security or data-integrity issue remains.
-   Release checklist, backup and rollback procedure are ready.

------------------------------------------------------------------------

# 4. Consolidated priority register --- all 40 source requirements

Every numbered item below maps to a requirement in the uploaded source
file. Combined items are grouped for implementation, but none are
intentionally dropped.

  ----------------------------------------------------------------------------------------
              Source \# Requirement                      Priority         Planned phase
  --------------------- -------------------------------- ---------------- ----------------
                      1 Original uploaded document       P1               3
                        accessible as attachment; unify                   
                        Submission Monitoring and OCR                     
                        Monitoring admin views                            

                      2 PDF preview in Submission        P1               3
                        Monitoring instead of filename                    
                        only                                              

                      3 Mobile UI/navigation, bottom     P2               9
                        tabs, menu and scrolling fixes                    

                      4 Simplify pending-approval UI for P1               2
                        admin and employee                                

                      5 Fix Scope 1, 2 and 3 chart/table P2               8
                        toggles                                           

                      6 Improve top Ask button UI and    P2               8
                        glow                                              

                      7 Conversion-factor source URL and P1/P2            6
                        possible automatic factor                         
                        extraction                                        

                      8 Remove unwanted mobile tap       P2               9
                        cursor in mobile and                              
                        desktop-site views                                

                      9 Forward generated reports to     P1               4
                        upper-level verification                          

                     10 Reporting reminders at 5 days, 3 P1               5
                        days and same day; email and                      
                        visual status                                     

                     11 Show/hide password icon on       P1/P2            1 or 8\*
                        forgot-password page                              

                     12 Audit Trail search bar           P1               4

                     13 Human-readable permission/action P0               1
                        labels                                            

                     14 Fully functional mobile          P3               9
                        application using Capacitor or                    
                        equivalent after feature                          
                        finalization                                      

                     15 Handwritten-note recognition,    P2               3
                        Excel recreation, OpenCV                          
                        confidence boxes and manual                       
                        correction                                        

                     16 Parent-child reminders from one  P1               5
                        week before through deadline day                  

                     17 Investigate SEBI                 P1/P2            6
                        API/authoritative source for                      
                        financial-year carbon-equivalent                  
                        updates                                           

                     18 Restrict Super Admin to one      P0               1
                        active login                                      

                     19 Context-aware search bar         P2               8

                     20 Security audit to prevent data   P0               1
                        manipulation                                      

                     21 FAQ, documentation, website      P2               10
                        blueprint, roles and process                      
                        flow                                              

                     22 Improve duplicate review flow;   P0/P1            2
                        show upload, OCR scan, end-user                   
                        validation, submit and                            
                        upper-level validation                            

                     23 Define same-name file            P0               2
                        storage/replacement and                           
                        duplicate handling across                         
                        periods                                           

                     24 One-week reminder window with    P1               5
                        daily notifications                               

                     25 Submission monitoring category   P1               2/3
                        filters based on OCR-detected                     
                        bill type                                         

                     26 Improve OCR Monitoring UI,       P1               3
                        highlights, colour coding and                     
                        OpenCV support                                    

                     27 Investigate billing-period       P1               3
                        extraction failure from images                    

                     28 Automatic bill/document category P1               3
                        detection                                         

                     29 All users can see their own logs P1               4

                     30 Role- and hierarchy-specific     P1               4
                        audit access, people/role                         
                        filters                                           

                     31 Provide 3--4 report-generation   P2               8
                        templates                                         

                     32 Prevent multiple logins on a     P0               1
                        single device                                     

                     33 Year-wise carbon trends and      P2               7
                        evidence-based policy/action                      
                        suggestions                                       

                     34 Alert admin when emissions       P2               7
                        exceed expected average                           

                     35 Carbon-credit reference and      P2               6
                        verified external purchase                        
                        redirect, if available                            

                     36 Zoom in on photo in extraction   P1               3
                        verification page                                 

                     37 Local database server            P0               1

                     38 OCR image/PDF-to-Excel           P1               3
                        recreation, low-confidence red                    
                        cells, synchronized document                      
                        highlight and user verification                   

                     39 Define                           P0               2
                        financial/reporting/submission                    
                        periods and allowed submission                    
                        window                                            

                     40 Improve landing-page UI/UX       P2               8
  ----------------------------------------------------------------------------------------

\* The password visibility control is a small authentication UX fix.
Implement it alongside the relevant sign-in/forgot-password screen when
that module is inspected; do not delay security-critical password-reset
work.

------------------------------------------------------------------------

# 5. Cross-phase dependencies and decisions

Resolve these before the affected implementation is finalized:

1.  **Database engine and hosting:** Confirm the current engine,
    local-server target, backup format and production migration
    strategy.
2.  **Session restriction scope:** Confirm whether "single device
    multiple login should not be allowed" means one account per device,
    one session per account, or one session per device/account pair. The
    Super Admin single-login requirement is explicit and separate.
3.  **Reporting calendar:** Confirm financial year, reporting period,
    submission window, grace period and who can configure them.
4.  **Reminder schedule:** Reconcile daily reminders during the one-week
    window with the 5-day, 3-day and same-day reminders. Define
    deduplication and recipient rules.
5.  **Duplicate policy:** Confirm whether matching content across
    different periods should be a warning, a block or an allowed
    resubmission. Preserve original records.
6.  **Organizational hierarchy:** Confirm parent-child relationships and
    which roles can forward, view, approve and receive reminders.
7.  **Carbon-factor sources:** Verify official source/API availability,
    permitted use, data coverage, units and financial-year mapping
    before automation.
8.  **Handwriting reference:** Obtain the page diagram/reference
    mentioned in the source before finalizing the handwriting-review
    interaction.
9.  **Search scope:** Define which entities and fields context-aware
    search should cover and ensure every query is permission-filtered.
10. **Mobile target:** Confirm supported platforms and device
    capabilities before selecting Capacitor or another packaging method.

Do not block unrelated work unnecessarily, but do not make irreversible
assumptions on these decisions.

------------------------------------------------------------------------

# 6. Global acceptance and quality gates

Every phase must satisfy the following applicable gates:

-   **Functional:** User stories and acceptance criteria pass.
-   **Authorization:** Every endpoint and data query enforces role,
    hierarchy and object-level access on the server.
-   **Data integrity:** Migrations, constraints, versioning and rollback
    are verified.
-   **Auditability:** Important state changes and approvals are
    traceable.
-   **Usability:** Clear labels, helpful errors, loading states and
    empty states are present.
-   **Responsive:** Relevant workflows work at desktop, tablet and
    mobile breakpoints.
-   **Reliability:** API, OCR, email and external-service failures are
    handled without data loss.
-   **Testing:** Unit, integration and end-to-end tests are added or
    updated.
-   **Regression:** Existing features continue to work.
-   **Documentation:** Configuration, migrations, operational behaviour
    and known limitations are recorded.

## Required phase completion report

At the end of each phase, Claude must provide:

1.  Phase status: Complete / Partially complete / Blocked.
2.  Requirements implemented, mapped to source requirement numbers.
3.  Files/modules changed.
4.  Database migrations and data impact, if any.
5.  Tests executed and their actual results.
6.  Screenshots or evidence for UI changes where useful.
7.  Security and regression findings.
8.  Remaining issues and decisions required.
9.  Backup/rollback instructions for risky changes.
10. Exact next steps for the next phase.

------------------------------------------------------------------------

# 7. Final instruction

Work through **Phase 0 → Phase 10 in order**. Within each phase,
prioritize P0 before P1, then P2/P3 where applicable. Do not begin
mobile-app packaging before feature finalization. Do not perform
destructive database migration or production changes without a verified
backup and an explicit go-ahead.

The objective is a stable, secure, auditable and maintainable EMEILSG
application---not merely a collection of UI changes. Preserve existing
working functionality, avoid duplicate systems, and verify each
enhancement against the actual application before marking it complete.

------------------------------------------------------------------------

# Appendix A. Implementation status (maintained by Claude Code)

The specification above is unchanged. This appendix tracks progress.
Statuses: NOT STARTED, IN PROGRESS, BLOCKED, COMPLETED, VERIFIED.
"Found in Phase 0" records what already existed before this roadmap
began. Evidence: `FEATURE_ENHANCEMENT_AUDIT_2026-11-07.md`.

## Phases

  Phase   Status        Notes
  ------- ------------- ------------------------------------------------
  0       COMPLETED     Audit 2026-11-07; plan approved by the owner
  1       COMPLETED     2026-11-07, branch
                        feature-session-takeover-security, uncommitted;
                        migration 0055 on the local database only
                        (hosted needs the owner's go-ahead)
  2       COMPLETED     2026-11-08, same branch, uncommitted; migration
                        0056 on local and hosted (2026-11-08)
  3       COMPLETED     2026-11-08 except 3.4 (handwriting: waiting for
                        bus-ticket photos); uncommitted; migration 0057
                        and the rules-14 worker on hosted (2026-11-08)
  4       COMPLETED     2026-11-08, uncommitted; migration 0058 on
                        local and hosted (2026-11-08)
  5       COMPLETED     2026-11-08, uncommitted; migration 0059 on
                        hosted (2026-11-08); needs CRON_SECRET
                        on Vercel and a deploy
  6       COMPLETED     2026-11-08, uncommitted; migration 0060 on
                        hosted 2026-11-09
  7       COMPLETED     2026-11-09, uncommitted; migration 0061 on
                        hosted 2026-11-09
  8--10   NOT STARTED

## Requirements

  \#   Found in Phase 0                Status        Notes
  ---- ------------------------------- ------------- ----------------------------
  1    Partial                         COMPLETED     one monitoring page; document
                                                     and OCR in the record panel
  2    Partial                         COMPLETED     thumbnail on approval rows;
                                                     bill beside its values
  3    Missing                         NOT STARTED   ui lane
  4    Partial                         COMPLETED     one list, row Approve/Return,
                                                     stage tracker
  5    Partial, cause found            NOT STARTED
  6    Exists                          NOT STARTED   ui lane
  7    Partial                         COMPLETED     source link, publisher, FY,
                                                     read date; fetch from official
                                                     sites, value picked by a person
  8    Partial, conflicts with the     IN PROGRESS   ui lane: "hide custom cursor
       pen-laptop cursor fix                         on mobile" merged on ucn
                                                     main 2026-11-07 (debbcce);
                                                     not yet checked
  9    Missing                         COMPLETED     forward up the hierarchy;
                                                     verify or return; trail
  10   Partial                         COMPLETED     schedule 7..0 days, in-app and
                                                     email; daily Vercel Cron
  11   Partial                         COMPLETED     show/hide on forgot-password,
                                                     reset-password and Profile
  12   Missing                         COMPLETED     search bar on Audit Trail
                                                     and My Activity
  13   Partial                         COMPLETED     20 approved names; codes off
                                                     Roles & Permissions
  14   Missing                         NOT STARTED   after feature freeze
  15   Missing                         BLOCKED       = conductor-written bus tickets;
                                                     waiting for 3-5 real photos
  16   Partial                         COMPLETED     Administrators' summary by
                                                     unit; Super Admins on email days
  17   Missing                         COMPLETED     no SEBI API exists (recorded);
                                                     yearly review, drafts approved
                                                     by a second Super Admin
  18   Missing                         COMPLETED     one session per account for
                                                     everyone, with the takeover
                                                     question (migration 0055)
  19   Partial                         NOT STARTED
  20   Partial                         COMPLETED     re-check of code since
                                                     2026-10-12: 1 Low fixed,
                                                     3 Low recorded
  21   Missing                         NOT STARTED
  22   Partial                         COMPLETED     duplicate flags in the
                                                     Validation Queue; stage tracker
  23   Exists (no overwrite)           COMPLETED     policy decided and enforced;
                                                     re-upload = new version
  24   Missing                         COMPLETED     sent log on Reporting
                                                     Deadlines; never sent twice
  25   Missing                         COMPLETED     Document type and Activity
                                                     filters; Admin correction
  26   Partial                         COMPLETED     OCR column, colours, filter,
                                                     banner, Retry in the panel
  27   Unknown                         COMPLETED     cause found on hosted photos
                                                     (date glued to reading); fixed
                                                     in rules-14; reason stored
  28   Partial                         COMPLETED     OCR checks every type; a
                                                     mismatch is flagged
  29   Missing                         COMPLETED     My Activity for everyone
  30   Missing                         COMPLETED     Administrators see their
                                                     units' entries; roles shown
  31   Missing                         NOT STARTED
  32   Missing                         COMPLETED     decided: one device per
                                                     account (same as 18)
  33   Partial                         COMPLETED     Carbon Analytics: year-wise by
                                                     scope and activity, like for
                                                     like; rule-based suggestions,
                                                     AI wording on request
  34   Partial                         COMPLETED     same period of earlier years;
                                                     daily check, in-app and email
                                                     to the unit's Administrators
  35   Partial                         COMPLETED     preset, editable outside links;
                                                     addresses checked; no-sale notice
  36   Exists                          COMPLETED     zoom kept; boxes follow zoom
  37   Partial (dump ready)            BLOCKED       deferred by the owner
                                                     until after the HoD demo
  38   Missing                         COMPLETED     field grid: red cells, boxes
                                                     on the document, Excel
  39   Exists (mostly)                 COMPLETED     several open periods; due and
                                                     late dates; Late flag
  40   Exists                          NOT STARTED   ui lane

## Added to Phase 10 by the owner (2026-11-07)

-   **Database connections for production (owner's request, 2026-11-07).**
    Status: NOT STARTED.
    -   Today the session pooler (port 5432) allows 15 clients, shared by
        the live site, every developer's machine and the OCR worker;
        `EMAXCONNSESSION` errors appear under normal use. Hosted allows
        60 connections in all (smallest compute size); the recommended
        pool size there is 24.
    -   Production gets its own Supabase project, with no developer
        machine connected to it.
    -   Find and fix why the app hangs on the transaction pooler (port
        6543), then move the Vercel deployment to it and test on Vercel.
        Reproduced on 2026-11-07 from a laptop, so it is not specific to
        Vercel: through port 6543, whenever more queries are in flight
        than the pool has open connections, the queued ones never return
        (a single query, sequential queries and transactions work).
        Turning off postgres.js pipelining (`max_pipeline: 1`) and type
        fetching (`fetch_types: false`) did not help; the session pooler
        runs the same 20 parallel queries in 0.3 s. This is the likely
        cause of the October report stall on Vercel.
    -   The OCR worker stays on the session pooler (one long-running
        connection).
