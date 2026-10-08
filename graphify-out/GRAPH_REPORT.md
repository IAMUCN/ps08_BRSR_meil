# Graph Report - BRSR_MEIL  (2026-09-30)

## Corpus Check
- 350 files · ~213,763 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 7, .example 2, .toml 2)

## Summary
- 1862 nodes · 4785 edges · 140 communities (103 shown, 33 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 65 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `654d5496`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- runAction
- login/page.tsx
- verification.ts
- WorkerHarnessTest
- requireAdminSession
- writeAudit
- processor.py
- theme-toggle.tsx
- documents.ts
- test_worker_harness.py
- users-manager.tsx
- app/submissions/page.tsx
- calculation/engine.ts
- root.ts
- organization.ts
- SEBI BRSR Reporting Format (Annexure 1)
- lucide-react
- components.json
- session.ts
- scripts
- extract_fields
- db
- compilerOptions
- fields.py
- html.ts
- web/package.json
- db.py
- scope-dashboard.tsx
- reporting-periods.ts
- dependencies
- validation-queue-table.tsx
- trpc/server.ts
- totals.ts
- Phase 10 Scope 1 Decisions
- Phase 5 Document Ingestion Decisions
- ocr-jobs-table.tsx
- TraceESG Evidence-First ESG Platform
- admin/page.tsx
- confirm-dialog.tsx
- scripts
- provision-user.ts
- shared-types/package.json
- App Flow Deviations Document
- lib.mjs
- users.ts
- Phase 2B OCR Worker Decisions
- TraceESG Project Context and Progress
- devDependencies
- compilerOptions
- Evidence-First Data Collection Model
- fields_needing_attention
- samples.py
- TraceESG Target Personas and Roles
- summary.ts
- Phase 4 Admin Foundation Decisions
- Phase 6 OCR Integration Decisions
- Phase 8 Validation Engine Decisions
- org-unit-bulk-import.tsx
- createSupabaseServerClient
- BRSR Core Framework
- Configurable Multi-Entity Organization Hierarchy
- Graphify Knowledge Graph Rule
- Three Themes Shared UX Structure Decision
- esg_record_documents Many-to-Many Join Table
- OrgManager
- Eight Core Product Principles
- Evidence-to-BRSR Digital Thread
- Deterministic TypeScript Calculation Engine
- Postgres-Backed Document Job Queue
- conversion_factors and conversion_factor_versions Tables
- extraction/__init__.py
- Next.js 16 Agent Rules
- eslint.config.mjs
- postcss.config.mjs
- .prettierrc.json
- Corporate ESG Approval Queue Flow
- OCR Extraction Verification Flow
- Scope 1 2 3 Iconography and Color Hierarchy
- Accessible Status Color Token System
- BRSR Mapping Tables (brsr_sections, brsr_indicators, brsr_metric_mappings)
- Two-Track A/B Build Architecture
- Pragmatic Testing Rigor Strategy
- Modular Scope 3 Incremental Strategy
- Validation Queue and Anomaly Review Flow
- Auto-Assumed Reporting Period Decision
- Desktop Only Drag-and-Drop Upload MVP
- Consolidated One-Shot Report Runs Decision
- Hierarchical Org-Scope Downward Inheritance Decision
- Scopes Configurable Table Decision
- Dependency-Verified Parallelism Decision
- India Region Data Residency Decision
- Single TypeScript Application Runtime Decision
- Supabase Managed Platform Decision
- Per-User Theme Preference Decision
- Tailwind CSS and shadcn/ui Implementation Vehicle Decision
- Hierarchical Multi-Level Consolidation Engine
- Deviation D12: Metric Field Requirements Seeded Early
- Deviation D13: org_settings.updated_by Nullable for Seed
- Deviation D4: Server-Created Notifications & Client Read Update
- Deviation D7: updated_at Trigger Coverage Hardening
- Deviation D8: Seed Data Placement & Scope
- profile.ts
- snapshot.ts
- org-manager.tsx
- upload-form.tsx
- password-policy.ts
- TraceESG Project README
- periods-manager.tsx
- [documentId]/page.tsx
- brsr.ts
- audit-trail/page.tsx
- reset-password/page.tsx
- factors-manager.tsx
- VerifyWorkspace
- roles/actions.ts
- [trpc]/route.ts
- routers/audit.ts
- Grill: Phase 15 — Consolidation
- Grill: Phase 17 — Reporting
- brsr-mapping/actions.ts
- ApprovalQueue
- Grill: Phase 11 — Scope 2
- Grill: Phase 12 — Scope 3 foundation
- Grill: Phase 13 — Role-specific modules (HR, EHS, Procurement, Finance/CSR)
- Grill: Phase 14 — BRSR mapping
- Grill: Phase 16 — Admin Control Tower
- Grill: Phase 18 — Audit and security hardening
- admin/loading.tsx
- pdf.ts
- run.mjs
- Grill: Bulk import (employees, org units) + OTP password reset
- Grill: Phase 19 — UI polish and responsive behavior
- route-error.tsx
- Grill: Password composition rules + live strength meter
- Grill: Phase 20 — Testing and edge cases
- Grill: Theme toggle moved to the top bar; default changed

## God Nodes (most connected - your core abstractions)
1. `runAction()` - 69 edges
2. `db()` - 68 edges
3. `lucide-react` - 62 edges
4. `api()` - 54 edges
5. `react` - 49 edges
6. `requireAdminSession()` - 42 edges
7. `server-only` - 42 edges
8. `writeAudit()` - 40 edges
9. `Button()` - 39 edges
10. `next` - 34 edges

## Surprising Connections (you probably didn't know these)
- `Deviation D1: Server-Only Lifecycle Writes` --semantically_similar_to--> `Immutable Append-Only Lifecycle Tables`  [INFERRED] [semantically similar]
  supabase/SCHEMA_DEVIATIONS.md → ps_documents/implementation_docs/05_BACKEND_SCHEMA.md
- `Deviation A12 Scope 1 Dashboard and Evidence Drilldown` --references--> `Phase 10 Scope 1 Decisions`  [EXTRACTED]
  apps/web/APP_FLOW_DEVIATIONS.md → .grill/phase-10-scope-1-decisions.md
- `TraceESG Project Context and Progress` --references--> `Phase 10 Scope 1 Decisions`  [INFERRED]
  PROGRESS.md → .grill/phase-10-scope-1-decisions.md
- `TraceESG Project Context and Progress` --references--> `Phase 9 Calculation Engine Decisions`  [INFERRED]
  PROGRESS.md → .grill/phase-9-calculation-engine-decisions.md
- `TraceESG Project Context and Progress` --references--> `Phase 2 Database Decisions`  [INFERRED]
  PROGRESS.md → .grill/phase-2-database-decisions.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **BRSR Core Verification and Assurance Ecosystem** — ps_documents_provided_docs_brsr_faqs_25012025_brsr_core_framework, ps_documents_provided_docs_brsr_faqs_25012025_reasonable_assurance_mandate, ps_documents_provided_docs_background_material_on_sustainability_business_responsibility_sustainability_reporting_brsr_revised_edition_2024_icai_ssa_3000_assurance_standards, ps_documents_provided_docs_brsr_faqs_25012025_value_chain_partners_disclosure [EXTRACTED 1.00]
- **SEBI BRSR Regulatory Architecture and Governance** — ps_documents_provided_docs_business_responsibility_and_sustainability_reporting_by_listed_entitiesannexure1_p_sebi_brsr_format_circular, ps_documents_provided_docs_business_responsibility_and_sustainability_reporting_by_listed_entitiesannexure2_p_sebi_brsr_guidance_note, ps_documents_provided_docs_brsr_faqs_25012025_brsr_applicability_top_1000, ps_documents_provided_docs_background_material_on_sustainability_business_responsibility_sustainability_reporting_brsr_revised_edition_2024_ngrbc_nine_principles [EXTRACTED 1.00]
- **Evidence-to-BRSR Digital Thread Pipeline** — ps_documents_implementation_docs_master_approach_evidence_first_pipeline, ps_documents_implementation_docs_05_backend_schema_canonical_esg_records, ps_documents_implementation_docs_01_prd_evidence_to_brsr_digital_thread, ps_documents_implementation_docs_02_trd_evidence_lineage_traceability [EXTRACTED 1.00]
- **Human-in-the-Loop OCR Extraction and Verification Flow** — _grill_phase_2b_ocr_worker_decisions_deterministic_extraction, _grill_phase_6_ocr_integration_decisions_worker_notification_dispatch, _grill_phase_7_ocr_verification_decisions_verification_guard_rail [EXTRACTED 1.00]
- **Multi-Level Hierarchical Authorization Model** — ps_documents_implementation_docs_01_prd_configurable_org_hierarchy, ps_documents_implementation_docs_02_trd_rls_authorization_architecture, ps_documents_implementation_docs_05_backend_schema_user_org_assignments_table, ps_documents_implementation_docs__grill_backend_schema_decisions_hierarchical_org_scope_inheritance [EXTRACTED 1.00]
- **Two-Track Decoupled OCR Architecture** — ps_documents_implementation_docs__grill_implementation_plan_decisions_two_track_implementation_structure, ps_documents_implementation_docs__grill_trd_tech_stack_self_hosted_paddleocr_decision, ps_documents_implementation_docs_02_trd_postgres_job_queue, render_traceesg_ocr_worker [EXTRACTED 1.00]
- **Corporate Sustainability Disclosure and Implementation** — ps_documents_provided_docs_l_t_brsr_report_fy2025_26_lnt_corporate_brsr_report, ps_documents_provided_docs_l_t_brsr_report_fy2025_26_lnt_energy_and_ghg_emissions_profile, ps_documents_provided_docs_business_responsibility_and_sustainability_reporting_by_listed_entitiesannexure2_p_ghg_emissions_calculation_guidance, ps_documents_provided_docs_business_responsibility_and_sustainability_report_corporate_esg_roadmap_readiness [INFERRED 0.85]
- **Evidence Ingestion to Scope Lineage Pipeline** — _grill_phase_5_document_ingestion_decisions_bytes_first_upload, _grill_phase_7_ocr_verification_decisions_verification_guard_rail, _grill_phase_8_validation_engine_decisions_six_validation_categories, _grill_phase_9_calculation_engine_decisions_deterministic_calculation, _grill_phase_10_scope_1_decisions_evidence_lineage_drilldown [INFERRED 0.95]
- **Server-Only Transactional Security Architecture** — _grill_phase_2_database_decisions_server_only_lifecycle_writes, _grill_phase_3_auth_decisions_postgres_js_transactions, _grill_phase_3_auth_decisions_data_access_layer_session, _grill_phase_4_admin_foundation_decisions_three_lockout_guards [INFERRED 0.95]

## Communities (140 total, 33 thin omitted)

### Community 0 - "runAction"
Cohesion: 0.17
Nodes (20): addFactorVersionAction(), createFactorAction(), VersionValues, addAssignmentAction(), deactivateUserAction(), deleteUserAction(), inviteUserAction(), reactivateUserAction() (+12 more)

### Community 1 - "login/page.tsx"
Cohesion: 0.18
Nodes (17): GET(), LoginForm(), LoginPage(), metadata, RootPage(), isLoginReason(), LOGIN_NOTICES, ADMIN_ROLE (+9 more)

### Community 2 - "verification.ts"
Cohesion: 0.06
Nodes (64): confidenceLabel(), FieldRow(), ActiveSession, OcrJobStatus, fieldEntry, invoiceDuplicates(), loadDocument(), loadFields() (+56 more)

### Community 3 - "WorkerHarnessTest"
Cohesion: 0.26
Nodes (4): WorkerHarnessTest, blank_png(), corrupted_pdf(), PDF header and trailer (passes the upload-time structure check) around an…

### Community 4 - "requireAdminSession"
Cohesion: 0.15
Nodes (16): ConversionFactorsPage(), metadata, metadata, OrganizationPage(), AdminProfilePage(), metadata, metadata, ReportingPeriodsPage() (+8 more)

### Community 5 - "writeAudit"
Cohesion: 0.11
Nodes (25): submitForApproval(), AuditEvent, jsonOrNull(), writeAudit(), runCalculation(), globalForDb, Tx, permissionProcedure() (+17 more)

### Community 6 - "processor.py"
Cohesion: 0.16
Nodes (21): Settings, LostClaim, PermanentError, Failure classes (.grill/phase-2b-ocr-worker-decisions.md — failure handling)., Another worker reclaimed this job (it looked stale); drop our result., Retrying won't help (unreadable file, no text). `str(error)` is shown to the…, May succeed on a later attempt (storage, database, model runtime)., TransientError (+13 more)

### Community 7 - "theme-toggle.tsx"
Cohesion: 0.06
Nodes (48): ADMIN_NAV, AdminLayout(), APP_NAV, WorkspaceLayout(), MarkAllReadButton(), TraceESG App Icon, inter, jetbrainsMono (+40 more)

### Community 8 - "documents.ts"
Cohesion: 0.08
Nodes (41): completeUploadAction(), FileTarget, prepareUploadAction(), putFile(), sha256Hex(), UploadForm(), checkFile(), complete() (+33 more)

### Community 9 - "test_worker_harness.py"
Cohesion: 0.10
Nodes (22): main(), Download the pinned PaddleOCR model weights from the Hugging Face Hub into…, Phase 2B standalone harness: seed documents + jobs directly (SQL + Storage),…, _load_dotenv(), load_settings(), Path, Worker settings from the environment (02_TRD.md §33). Values come from the…, Minimal KEY=VALUE loader; real environment variables always win. (+14 more)

### Community 10 - "users-manager.tsx"
Cohesion: 0.12
Nodes (19): Editing, reportedRecordAction(), ReportView(), openRecord(), Selected, valueText(), Result, RoleOption (+11 more)

### Community 11 - "app/submissions/page.tsx"
Cohesion: 0.16
Nodes (18): metadata, OcrMonitoringPage(), formatDate(), metadata, UserDashboardPage(), formatDateTime(), metadata, MySubmissionsPage() (+10 more)

### Community 12 - "calculation/engine.ts"
Cohesion: 0.14
Nodes (22): activeFormula(), activityKeyFor(), CalculationOutcome, ENGINE_VERSION, RecordRow, Sql, activityInput(), evaluate() (+14 more)

### Community 13 - "root.ts"
Cohesion: 0.11
Nodes (31): searchRecords(), adminProcedure, Context, protectedProcedure, router, t, ConsolidationView, input (+23 more)

### Community 14 - "organization.ts"
Cohesion: 0.21
Nodes (20): RoleScopeFields(), allowedChildTypes(), canBeChildOf(), checkMove(), descendantIds(), isFrozen(), MoveCheck, ORG_UNIT_TYPES (+12 more)

### Community 15 - "SEBI BRSR Reporting Format (Annexure 1)"
Cohesion: 0.08
Nodes (25): ICAI Sustainability Reporting Standards Board Guidance, ISSB Global Sustainability Baseline Alignment, National Guidelines on Responsible Business Conduct (NGRBC) 9 Principles, UN Sustainable Development Goals (SDGs) Mapping, BRSR Applicability for Top 1000 Listed Entities, High Value Debt Listed Entities (HVD) Applicability, BRSR vs BRR Paradigm Shift, Evolution of ESG Reporting in India (+17 more)

### Community 16 - "lucide-react"
Cohesion: 0.19
Nodes (16): Result, initialRequestState, initialVerifyState, initialState, initialState, PasswordStrengthMeter(), STRENGTH_LABEL, STRENGTH_TEXT_TONE (+8 more)

### Community 17 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 18 - "session.ts"
Cohesion: 0.10
Nodes (24): ApprovalsPage(), metadata, FILTERS, metadata, NotificationsPage(), metadata, OrgUnitsBulkImportPage(), metadata (+16 more)

### Community 19 - "scripts"
Cohesion: 0.10
Nodes (20): devDependencies, supabase, engines, node, name, packageManager, private, scripts (+12 more)

### Community 20 - "extract_fields"
Cohesion: 0.23
Nodes (10): ClassifyTest, ExtractFieldsTest, line(), Pure extraction/classification rules — no PaddleOCR needed (runs in CI)., values(), classify(), extract_fields(), FieldSpec (+2 more)

### Community 21 - "db"
Cohesion: 0.16
Nodes (25): GET(), financialYearLabel(), financialYearOf(), financialYearRange(), db(), expireStaleRuns(), finish(), notify() (+17 more)

### Community 22 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 23 - "fields.py"
Cohesion: 0.19
Nodes (18): _below_neighbor(), _find_labeled(), _find_unit_near(), _height(), _label_match(), _normalize(), _percent(), Find configured fields in OCR text lines. A field that can't be found is… (+10 more)

### Community 24 - "html.ts"
Cohesion: 0.18
Nodes (17): ActivityTable(), approvedOf(), BranchBars(), BranchTable(), CategoryTable(), RecordTable(), TrendBars(), escapeHtml() (+9 more)

### Community 25 - "web/package.json"
Cohesion: 0.10
Nodes (20): typescript, name, private, type, version, class-variance-authority, eslint, eslint-config-next (+12 more)

### Community 26 - "db.py"
Cohesion: 0.22
Nodes (19): _audit(), claim_job(), ClaimedJob, complete_job(), _confidence_threshold(), connect(), fail_job(), _finish_job() (+11 more)

### Community 27 - "scope-dashboard.tsx"
Cohesion: 0.14
Nodes (19): CalculationTraceView(), EVENT_LABELS, queueFor(), RecordDrawer(), csvCell(), ExplorerParams, exportCsv(), STATUS_LABELS (+11 more)

### Community 28 - "reporting-periods.ts"
Cohesion: 0.23
Nodes (11): checkPeriodDates(), checkTransition(), PeriodDates, PeriodStatus, TransitionCheck, badRequest(), isoDate, optionalIsoDate (+3 more)

### Community 29 - "dependencies"
Cohesion: 0.09
Nodes (23): dependencies, class-variance-authority, cn, exceljs, lucide-react, next, nodemailer, pdfjs-dist (+15 more)

### Community 30 - "validation-queue-table.tsx"
Cohesion: 0.15
Nodes (16): reviewRecordAction(), formatDateTime(), problemTypes(), ValidationQueueTable(), decide(), DocumentViewer(), PdfDocument, PdfLoadingTask (+8 more)

### Community 31 - "trpc/server.ts"
Cohesion: 0.15
Nodes (19): AdminApprovalQueuePage(), metadata, BrsrMappingPage(), metadata, metadata, ScopeOnePage(), metadata, ScopeTwoPage() (+11 more)

### Community 32 - "totals.ts"
Cohesion: 0.21
Nodes (11): ActivityTotal, gapOf(), ScopeBranch, scopeBreakdown, ScopeCategory, ScopeRecord, scopeTree(), Sql (+3 more)

### Community 33 - "Phase 10 Scope 1 Decisions"
Cohesion: 0.15
Nodes (13): Phase 10 Scope 1 Decisions, Evidence Lineage Drilldown Architecture, Scope 1 Fuel Metrics Configuration, Approved-Only Headline Consolidation, Zero Placeholder Factor Policy, Strict Unit Grouping Rule, Phase 9 Calculation Engine Decisions, Deterministic Calculation and Trace Storage (+5 more)

### Community 34 - "Phase 5 Document Ingestion Decisions"
Cohesion: 0.15
Nodes (13): Phase 2 Database Decisions, Permission Catalogue and RBAC Model, Server-Issued Uploads Architecture, Server-Only Configuration Writes Architecture, Server-Only Lifecycle Writes Architecture, Narrow User Display Names View, Server-Side Postgres.js Transaction Architecture, Bytes-First Upload Architecture (+5 more)

### Community 35 - "ocr-jobs-table.tsx"
Cohesion: 0.36
Nodes (9): ocrJobFieldsAction(), retryOcrJobAction(), Band, formatDateTime(), JobDrawer(), load(), OcrJobsTable(), percent() (+1 more)

### Community 36 - "TraceESG Evidence-First ESG Platform"
Cohesion: 0.17
Nodes (13): TraceESG Evidence-First ESG Platform, TRD Core Architecture Principles, TraceESG Recommended Technology Stack, Admin Control Tower Command Center, Single Organization Tree No Tenant ID Decision, Split Hosting Vercel and Render Decision, PS-08 Master System Blueprint v1.0, Dr. P. Ravi Reddy (MEIL Director) Video Briefing (+5 more)

### Community 37 - "admin/page.tsx"
Cohesion: 0.15
Nodes (15): DataExplorerPage(), metadata, AdminDashboardPage(), Card, metadata, metadata, QUEUE, SubmissionMonitoringPage() (+7 more)

### Community 38 - "confirm-dialog.tsx"
Cohesion: 0.26
Nodes (6): Dialog(), DialogContent(), DialogDescription(), DialogFooter(), DialogHeader(), DialogTitle()

### Community 39 - "scripts"
Cohesion: 0.15
Nodes (13): scripts, build, calculate-pending, dev, format, format:check, lint, provision-user (+5 more)

### Community 40 - "provision-user.ts"
Cohesion: 0.17
Nodes (14): activeAdminUserIds(), assignedByEmail, displayName, email, existing, fail(), orFail(), orgCode (+6 more)

### Community 41 - "shared-types/package.json"
Cohesion: 0.17
Nodes (11): devDependencies, typescript, typescript, main, name, private, scripts, typecheck (+3 more)

### Community 42 - "App Flow Deviations Document"
Cohesion: 0.20
Nodes (11): Admin-Provisioned Accounts Model, Corporate ESG Approval Route Resolution, Data Access Layer Session Guard, Phase 3 Auth Decisions, First Admin Provisioning Script, Deviation A12 Scope 1 Dashboard and Evidence Drilldown, Deviation A1 Corporate ESG Approvals Route, Deviation A2 Auth Confirm and Set Password Routes (+3 more)

### Community 43 - "lib.mjs"
Cohesion: 0.05
Nodes (72): adminOnly, anon, ensureUnit(), farPm, goneSession, token, uploads, again (+64 more)

### Community 44 - "users.ts"
Cohesion: 0.18
Nodes (18): pgErrorCode(), accountCreatedEmailHtml(), badRequest(), rolesRouter, assertAdminRemovalAllowed(), assertAssignable(), badRequest(), BulkImportRow (+10 more)

### Community 45 - "Phase 2B OCR Worker Decisions"
Cohesion: 0.14
Nodes (14): CI OCR Worker Job, CI Web Job, CI Workflow, Phase 2B OCR Worker Decisions, Deterministic OCR Extraction Engine, OCR Job Failure and Retry Policy, CPU-Friendly Mobile Model Selection, Synthetic Document Test Generation (+6 more)

### Community 46 - "TraceESG Project Context and Progress"
Cohesion: 0.20
Nodes (10): Corepack Pinned pnpm Decision, Phase 1 Project Setup Decisions, PaddleOCR Python 3.12 Worker Runtime, Next.js 16 and Tailwind v4 Stack Selection, Three-Theme Data-Theme Architecture, Project Root Agent Brief, TraceESG Core Architecture Principles, TraceESG Implementation Phase Tracker (+2 more)

### Community 47 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, eslint-config-next, prettier, tailwindcss, @tailwindcss/postcss, @types/node, @types/nodemailer (+3 more)

### Community 48 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, isolatedModules, module, moduleResolution, noEmit, skipLibCheck, strict, target (+1 more)

### Community 49 - "Evidence-First Data Collection Model"
Cohesion: 0.20
Nodes (10): Evidence-First Data Collection Model, Evidence Document Upload Journey, Defensibility-First UI/UX Philosophy, Canonical esg_records Table, Immutable Append-Only Lifecycle Tables, 21-Phase Sequential and Parallel Roadmap, Async OCR Non-Blocking UX Decision, Master Audit Trail and Traceability Framework (+2 more)

### Community 50 - "fields_needing_attention"
Cohesion: 0.50
Nodes (4): FieldsNeedingAttentionTest, ExtractedField, fields_needing_attention(), Found fields below the confidence threshold plus required fields that weren't…

### Community 51 - "samples.py"
Cohesion: 0.13
Nodes (36): main(), Write a synthetic fuel invoice or electricity bill PDF with a fresh number, for…, all_samples(), csr_payment_pdf(), diesel_invoice_pdf(), _diesel_simple(), _diesel_table(), _electricity() (+28 more)

### Community 52 - "TraceESG Target Personas and Roles"
Cohesion: 0.25
Nodes (8): TraceESG Target Personas and Roles, Route Namespace Model (/admin and /app), user_org_assignments Table, Master Seven Role Access Model, Deviation D5: Narrow user_display_names Public View, Deviation D9: Inactive Users Have No Data Access, TraceESG Account Invitation Email Template, TraceESG Password Reset Email Template

### Community 53 - "summary.ts"
Cohesion: 0.10
Nodes (29): indicatorStatus, STATUS_LABEL, fraction, readiness, READINESS_COMPONENTS, ReadinessKey, count(), expectationsFrom() (+21 more)

### Community 54 - "Phase 4 Admin Foundation Decisions"
Cohesion: 0.29
Nodes (7): Three-Layer Deactivation Enforcement, Phase 4 Admin Foundation Decisions, Frozen Deactivated Organization Node Policy, Guidance Submission Windows Schema Deviation, Organization Tree Ordering Constraints, Root-Only Admin Role Assignment Rule, Admin Lockout Protection Guards

### Community 55 - "Phase 6 OCR Integration Decisions"
Cohesion: 0.15
Nodes (13): Admin OCR Job Retry Policy, Phase 6 OCR Integration Decisions, My Submissions Status Workflow Tabs, Configurable OCR Confidence Threshold (80%), Short-Polling UI Update Architecture, Pending-Job Worker Health Monitor, Worker Transactional Notification Dispatch, Metric Activity Field and Unit Derivation (+5 more)

### Community 56 - "Phase 8 Validation Engine Decisions"
Cohesion: 0.29
Nodes (7): Admin Validation Queue and Drawer, Historical Median Anomaly Check, Approval Step Pulled Forward into Phase 8, Phase 8 Validation Engine Decisions, Returned Record Correction Workflow, Deviation A10 Approval Pulled Forward into Phase 8, Deviation A9 Validation in Confirm Transaction

### Community 57 - "org-unit-bulk-import.tsx"
Cohesion: 0.10
Nodes (27): ActionResult, EmployeeBulkImport(), onDownloadResults(), onFile(), Option, ParsedRow, ActionResult, NodeOption (+19 more)

### Community 58 - "createSupabaseServerClient"
Cohesion: 0.15
Nodes (14): ALLOWED_TYPES, GET(), FORWARDED_REASONS, GET(), signOutAction(), publicEnv, publicEnvSchema, createSupabaseServerClient() (+6 more)

### Community 59 - "BRSR Core Framework"
Cohesion: 0.33
Nodes (6): BRSR Comprehensive, Lite and Core Architecture, ICAI Standards on Sustainability Assurance (SSA 3000), BRSR Core Framework, Reasonable Assurance Mandate for BRSR Core, Value Chain Partners Disclosures, Corporate ESG Roadmap and Assurance Readiness

### Community 60 - "Configurable Multi-Entity Organization Hierarchy"
Cohesion: 0.40
Nodes (5): Configurable Multi-Entity Organization Hierarchy, Postgres RLS Database-Layer Authorization, org_units Recursive Hierarchy Table, Master Seven Level Organizational Model, Deviation D6: Database Privilege Hardening (Revoke DML)

### Community 61 - "Graphify Knowledge Graph Rule"
Cohesion: 0.50
Nodes (4): Graphify Query and Traversal Rule, Graphify Knowledge Graph Rule, Graphify AST Update Rule, Graphify Workflow

### Community 62 - "Three Themes Shared UX Structure Decision"
Cohesion: 0.50
Nodes (4): Theme 1: Marple Warm Modern ESG, Theme 2: MEIL Corporate / Official, Theme 3: Dark Enterprise / Premium ESG, Three Themes Shared UX Structure Decision

### Community 63 - "esg_record_documents Many-to-Many Join Table"
Cohesion: 0.50
Nodes (4): esg_record_documents Many-to-Many Join Table, Standardized Storage Path Conventions, Documents to ESG Records Many-to-Many Decision, Deviation D3: Server-Issued Signed Uploads (Bytes First)

### Community 64 - "OrgManager"
Cohesion: 1.33
Nodes (3): OrgManager(), renderNode(), select()

### Community 65 - "Eight Core Product Principles"
Cohesion: 0.67
Nodes (3): Eight Core Product Principles, 15 AI Coding Agent Rules, No Manual Form Entry Architectural Rule

### Community 66 - "Evidence-to-BRSR Digital Thread"
Cohesion: 0.67
Nodes (3): Evidence-to-BRSR Digital Thread, Structural Evidence Lineage Traceability, Report Generation and Evidence Drilldown Flow

### Community 67 - "Deterministic TypeScript Calculation Engine"
Cohesion: 0.67
Nodes (3): Deterministic TypeScript Calculation Engine, TypeScript Calculation Engine Colocation Decision, Standard Carbon Equivalent Conversion Metric Need

### Community 68 - "Postgres-Backed Document Job Queue"
Cohesion: 0.67
Nodes (3): Postgres-Backed Document Job Queue, OCR Pipeline Tables (ocr_jobs, ocr_extractions, ocr_fields), Self-Hosted PaddleOCR Decision

### Community 69 - "conversion_factors and conversion_factor_versions Tables"
Cohesion: 0.67
Nodes (3): conversion_factors and conversion_factor_versions Tables, Two-Table Conversion Factor Versioning Decision, Deviation D2: Server-Only Configuration Writes

### Community 105 - "profile.ts"
Cohesion: 0.17
Nodes (24): requestPasswordReset(), ResetRequestState, verifyOtpAndSetPassword(), VerifyOtpState, VerifyOtpForm(), signIn(), signInSchema, SignInState (+16 more)

### Community 106 - "snapshot.ts"
Cohesion: 0.12
Nodes (25): key(), normalize(), Normalized, sameQuantity(), UNITS, consolidate(), Consolidated, Figure (+17 more)

### Community 107 - "org-manager.tsx"
Cohesion: 0.21
Nodes (18): createOrgUnitAction(), moveOrgUnitAction(), orgExpectationsAction(), orgUnitImpactAction(), setExpectationAction(), setOrgUnitStatusAction(), updateOrgUnitAction(), ExpectationsCard() (+10 more)

### Community 108 - "upload-form.tsx"
Cohesion: 0.17
Nodes (12): AuditFilterValues, AuditTable(), csvCell(), exportCsv(), pretty(), generateReportAction(), ReportForm(), submit() (+4 more)

### Community 109 - "password-policy.ts"
Cohesion: 0.19
Nodes (12): setPassword(), SetPasswordState, PASSWORD_MIN_LENGTH, PASSWORD_RULES, passwordPolicyMessage(), PasswordRule, passwordStrength(), PasswordStrengthLabel (+4 more)

### Community 110 - "TraceESG Project README"
Cohesion: 0.13
Nodes (13): 1. Critical end-to-end scenarios (plan §4), 2. Edge cases (plan §6), 3. Testing categories (plan §5), 4. Findings, 5. Not covered here, TraceESG — QA checklist (Phase 20), Account Provisioning and Role Management Guide, Local Development and Environment Setup (+5 more)

### Community 111 - "periods-manager.tsx"
Cohesion: 0.25
Nodes (12): createPeriodAction(), transitionPeriodAction(), updatePeriodWindowAction(), CreatePeriodSheet(), onSubmit(), formatDate(), Pending, PeriodsManager() (+4 more)

### Community 112 - "[documentId]/page.tsx"
Cohesion: 0.19
Nodes (11): metadata, ReportsPage(), STATUS, when(), formatDateTime(), metadata, StatePanel(), VerifyPage() (+3 more)

### Community 113 - "brsr.ts"
Cohesion: 0.16
Nodes (13): BrsrIndicator, BrsrMapping, brsrRouter, BrsrSection, bySection(), catalogue(), IndicatorRow, manage (+5 more)

### Community 114 - "audit-trail/page.tsx"
Cohesion: 0.22
Nodes (10): AuditFilters(), AuditTrailPage(), date(), metadata, one(), Params, uuid(), metadata (+2 more)

### Community 115 - "reset-password/page.tsx"
Cohesion: 0.20
Nodes (8): ForgotPasswordForm(), metadata, metadata, ResetPasswordPage(), SetPasswordForm(), AuthCard(), AuthNotice(), noticeTone

### Community 116 - "factors-manager.tsx"
Cohesion: 0.25
Nodes (9): setFactorVersionStatusAction(), ActivityType, current(), FactorSheet(), FactorsManager(), setStatus(), formatDate(), STATUS (+1 more)

### Community 117 - "VerifyWorkspace"
Cohesion: 0.38
Nodes (8): checkInvoiceDuplicatesAction(), confirmManualEntryAction(), confirmVerificationAction(), rejectDocumentAction(), revalidateWorkspace(), setDocumentTypeAction(), VerifyWorkspace(), saveDocumentType()

### Community 118 - "roles/actions.ts"
Cohesion: 0.33
Nodes (8): createRoleAction(), deleteRoleAction(), setRolePermissionsAction(), CreateRoleSheet(), onSubmit(), RolePermissions(), onSubmit(), run()

### Community 119 - "[trpc]/route.ts"
Cohesion: 0.43
Nodes (5): handler(), sameOriginRequest(), createTRPCContext(), AppRouter, req()

### Community 120 - "routers/audit.ts"
Cohesion: 0.29
Nodes (7): AuditEvent, auditRouter, filters, RecordHistory, Row, toEvent(), view

### Community 121 - "Grill: Phase 15 — Consolidation"
Cohesion: 0.25
Nodes (7): Constraints, Grill: Phase 15 — Consolidation, How each metric type consolidates, Intent, Key decisions, Out of scope, Surfaced assumptions

### Community 122 - "Grill: Phase 17 — Reporting"
Cohesion: 0.25
Nodes (7): Found while verifying, Grill: Phase 17 — Reporting, How a report stays true to itself, Intent, Key decisions, Out of scope, Surfaced assumptions

### Community 123 - "brsr-mapping/actions.ts"
Cohesion: 0.38
Nodes (6): removeMappingAction(), saveMappingAction(), MappingSheet(), submit(), MappingTable(), remove()

### Community 124 - "ApprovalQueue"
Cohesion: 0.43
Nodes (6): ApprovalQueue(), decide(), recalculate(), formatDateTime(), decideApprovalAction(), recalculateAction()

### Community 125 - "Grill: Phase 11 — Scope 2"
Cohesion: 0.29
Nodes (6): Constraints, Grill: Phase 11 — Scope 2, Intent, Key decisions, Out of scope, Surfaced assumptions

### Community 126 - "Grill: Phase 12 — Scope 3 foundation"
Cohesion: 0.29
Nodes (6): Constraints, Grill: Phase 12 — Scope 3 foundation, Intent, Key decisions, Out of scope, Surfaced assumptions

### Community 127 - "Grill: Phase 13 — Role-specific modules (HR, EHS, Procurement, Finance/CSR)"
Cohesion: 0.29
Nodes (6): Constraints, Grill: Phase 13 — Role-specific modules (HR, EHS, Procurement, Finance/CSR), Intent, Key decisions, Out of scope, Surfaced assumptions

### Community 128 - "Grill: Phase 14 — BRSR mapping"
Cohesion: 0.29
Nodes (6): Constraints, Grill: Phase 14 — BRSR mapping, Intent, Key decisions, Out of scope, Surfaced assumptions

### Community 129 - "Grill: Phase 16 — Admin Control Tower"
Cohesion: 0.29
Nodes (6): Definitions (for the node's subtree and the chosen period), Grill: Phase 16 — Admin Control Tower, Intent, Key decisions, Out of scope, Surfaced assumptions

### Community 130 - "Grill: Phase 18 — Audit and security hardening"
Cohesion: 0.29
Nodes (6): Found while reviewing, Grill: Phase 18 — Audit and security hardening, Intent, Key decisions, Out of scope, Surfaced assumptions

### Community 132 - "pdf.ts"
Cohesion: 0.33
Nodes (3): renderPdf(), puppeteer-core, @sparticuz/chromium

### Community 133 - "run.mjs"
Cohesion: 0.33
Nodes (4): ALL, HERE, problems, results

### Community 134 - "Grill: Bulk import (employees, org units) + OTP password reset"
Cohesion: 0.33
Nodes (5): Grill: Bulk import (employees, org units) + OTP password reset, Intent, Key decisions, Out of scope, Surfaced assumptions / simplifications (ponytail)

### Community 135 - "Grill: Phase 19 — UI polish and responsive behavior"
Cohesion: 0.33
Nodes (5): Grill: Phase 19 — UI polish and responsive behavior, Intent, Key decisions, Out of scope, Surfaced assumptions

### Community 137 - "Grill: Password composition rules + live strength meter"
Cohesion: 0.40
Nodes (4): Grill: Password composition rules + live strength meter, Intent, Key decisions, Out of scope

### Community 138 - "Grill: Phase 20 — Testing and edge cases"
Cohesion: 0.40
Nodes (4): Grill: Phase 20 — Testing and edge cases, Intent, Key decisions, Surfaced assumptions

### Community 139 - "Grill: Theme toggle moved to the top bar; default changed"
Cohesion: 0.40
Nodes (4): Grill: Theme toggle moved to the top bar; default changed, Intent, Key decisions, Out of scope

## Knowledge Gaps
- **538 isolated node(s):** `printWidth`, `metadata`, `AuditFilterValues`, `metadata`, `Params` (+533 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 732 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `postgres` connect `writeAudit` to `web/package.json`, `verification.ts`, `lib.mjs`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `lucide-react` to `requireAdminSession`, `theme-toggle.tsx`, `route-error.tsx`, `users-manager.tsx`, `app/submissions/page.tsx`, `session.ts`, `web/package.json`, `scope-dashboard.tsx`, `validation-queue-table.tsx`, `trpc/server.ts`, `ocr-jobs-table.tsx`, `admin/page.tsx`, `confirm-dialog.tsx`, `org-unit-bulk-import.tsx`, `org-manager.tsx`, `upload-form.tsx`, `periods-manager.tsx`, `[documentId]/page.tsx`, `audit-trail/page.tsx`, `factors-manager.tsx`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `server-only` connect `root.ts` to `verification.ts`, `pdf.ts`, `writeAudit`, `documents.ts`, `calculation/engine.ts`, `organization.ts`, `session.ts`, `db`, `web/package.json`, `reporting-periods.ts`, `trpc/server.ts`, `totals.ts`, `users.ts`, `summary.ts`, `createSupabaseServerClient`, `profile.ts`, `snapshot.ts`, `brsr.ts`, `routers/audit.ts`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **What connects `printWidth`, `metadata`, `AuditFilterValues` to the rest of the system?**
  _538 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `verification.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.062342342342342344 - nodes in this community are weakly interconnected._
- **Should `writeAudit` be split into smaller, more focused modules?**
  _Cohesion score 0.11397849462365592 - nodes in this community are weakly interconnected._
- **Should `theme-toggle.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.055944055944055944 - nodes in this community are weakly interconnected._