# Graph Report - BRSR_MEIL  (2026-09-20)

## Corpus Check
- 247 files · ~147,349 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 7, .example 2, .toml 2)

## Summary
- 1258 nodes · 3007 edges · 105 communities (70 shown, 31 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 48 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Emission Factor Management
- Authentication & Session Management
- Data Validation Rules & Checks
- OCR Worker Harness & Testing
- Emission Factor Management
- Approval Workflow Management
- OCR Worker Harness & Testing
- tRPC API Routers & Context
- Document Ingestion & Upload
- OCR Engine & Model Pipeline
- Emission Factor Management
- OCR Job Monitoring
- Approval Workflow Management
- tRPC API Routers & Context
- Organization Structure Management
- L&T BRSR Corporate Disclosures
- Document Ingestion & Upload
- UI Components & Layout
- Approval Workflow Management
- Package Services
- OCR Field Extraction Logic
- Document Verification Workspace
- Tsconfig Services
- OCR Field Extraction Logic
- ESG Emission Calculation Engine
- Package Services
- Db Services
- User Management & Provisioning
- Reporting Period Administration
- Package Services
- Validation Queue Operations
- tRPC API Routers & Context
- tRPC API Routers & Context
- ESG Emission Calculation Engine
- Authentication & Session Management
- OCR Job Monitoring
- BRSR Regulatory & Governance Framework
- App Shell & Navigation
- UI Components & Layout
- Package Services
- User Management & Provisioning
- Package Services
- Authentication & Session Management
- Data Validation Rules & Checks
- User Management & Provisioning
- UI Components & Layout
- Corepack Pinned Pnpm Decision
- Package Services
- Tsconfig Services
- Evidence-First Data Collection Model
- OCR Field Extraction Logic
- App Shell & Navigation
- Traceesg Target Personas And
- Data Validation Rules & Checks
- Authentication & Session Management
- Admin Ocr Job Retry
- Data Validation Rules & Checks
- Document Verification Workspace
- Proxy Services
- BRSR Regulatory & Governance Framework
- Configurable Multi-Entity Organization Hierarchy
- Graphify Query And Traversal
- UI Components & Layout
- Esg_Record_Documents Many-To-Many Join Table
- Organization Structure Management
- Eight Core Product Principles
- BRSR Regulatory & Governance Framework
- Deterministic Typescript Calculation Engine
- Postgres-Backed Document Job Queue
- Conversion_Factors And Conversion_Factor_Versions Tables
-   Init   Services
- Nextjs Agent Rules
- Eslint.Config Services
- Postcss.Config Services
- .Prettierrc Services
- Corporate Esg Approval Queue
- Ocr Extraction Verification Flow
- UI Components & Layout
- UI Components & Layout
- BRSR Regulatory & Governance Framework
- Two-Track A/B Build Architecture
- Pragmatic Testing Rigor Strategy
- Modular Scope Incremental Strategy
- Validation Queue And Anomaly
- Auto-Assumed Reporting Period Decision
- Desktop Only Drag-And-Drop Upload
- Consolidated One-Shot Report Runs
- Hierarchical Org-Scope Downward Inheritance
- Scopes Configurable Table Decision
- Dependency-Verified Parallelism Decision
- India Region Data Residency
- Single Typescript Application Runtime
- Supabase Managed Platform Decision
- UI Components & Layout
- UI Components & Layout
- Hierarchical Multi-Level Consolidation Engine
- Deviation D12 Metric Field
- Deviation D13 Org_Settingsupdated_By Nullable
- Deviation Server-Created Notifications Client
- Deviation Updated_At Trigger Coverage
- Deviation Seed Data Placement

## God Nodes (most connected - your core abstractions)
1. `runAction()` - 51 edges
2. `lucide-react` - 43 edges
3. `api()` - 38 edges
4. `react` - 35 edges
5. `db()` - 34 edges
6. `Button()` - 29 edges
7. `server-only` - 29 edges
8. `writeAudit()` - 28 edges
9. `requireAdminSession()` - 26 edges
10. `cn` - 25 edges

## Surprising Connections (you probably didn't know these)
- `Deviation D1: Server-Only Lifecycle Writes` --semantically_similar_to--> `Immutable Append-Only Lifecycle Tables`  [INFERRED] [semantically similar]
  supabase/SCHEMA_DEVIATIONS.md → ps_documents/implementation_docs/05_BACKEND_SCHEMA.md
- `Deviation A12 Scope 1 Dashboard and Evidence Drilldown` --references--> `Phase 10 Scope 1 Decisions`  [EXTRACTED]
  apps/web/APP_FLOW_DEVIATIONS.md → .grill/phase-10-scope-1-decisions.md
- `TraceESG Project Context and Progress` --references--> `Phase 10 Scope 1 Decisions`  [INFERRED]
  PROGRESS.md → .grill/phase-10-scope-1-decisions.md
- `TraceESG Project Context and Progress` --references--> `Phase 2 Database Decisions`  [INFERRED]
  PROGRESS.md → .grill/phase-2-database-decisions.md
- `TraceESG Project Context and Progress` --references--> `Phase 2B OCR Worker Decisions`  [INFERRED]
  PROGRESS.md → .grill/phase-2b-ocr-worker-decisions.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Evidence Ingestion to Scope Lineage Pipeline** — _grill_phase_5_document_ingestion_decisions_bytes_first_upload, _grill_phase_7_ocr_verification_decisions_verification_guard_rail, _grill_phase_8_validation_engine_decisions_six_validation_categories, _grill_phase_9_calculation_engine_decisions_deterministic_calculation, _grill_phase_10_scope_1_decisions_evidence_lineage_drilldown [INFERRED 0.95]
- **Server-Only Transactional Security Architecture** — _grill_phase_2_database_decisions_server_only_lifecycle_writes, _grill_phase_3_auth_decisions_postgres_js_transactions, _grill_phase_3_auth_decisions_data_access_layer_session, _grill_phase_4_admin_foundation_decisions_three_lockout_guards [INFERRED 0.95]
- **Human-in-the-Loop OCR Extraction and Verification Flow** — _grill_phase_2b_ocr_worker_decisions_deterministic_extraction, _grill_phase_6_ocr_integration_decisions_worker_notification_dispatch, _grill_phase_7_ocr_verification_decisions_verification_guard_rail [EXTRACTED 1.00]
- **Evidence-to-BRSR Digital Thread Pipeline** — ps_documents_implementation_docs_master_approach_evidence_first_pipeline, ps_documents_implementation_docs_05_backend_schema_canonical_esg_records, ps_documents_implementation_docs_01_prd_evidence_to_brsr_digital_thread, ps_documents_implementation_docs_02_trd_evidence_lineage_traceability [EXTRACTED 1.00]
- **Two-Track Decoupled OCR Architecture** — ps_documents_implementation_docs__grill_implementation_plan_decisions_two_track_implementation_structure, ps_documents_implementation_docs__grill_trd_tech_stack_self_hosted_paddleocr_decision, ps_documents_implementation_docs_02_trd_postgres_job_queue, render_traceesg_ocr_worker [EXTRACTED 1.00]
- **Multi-Level Hierarchical Authorization Model** — ps_documents_implementation_docs_01_prd_configurable_org_hierarchy, ps_documents_implementation_docs_02_trd_rls_authorization_architecture, ps_documents_implementation_docs_05_backend_schema_user_org_assignments_table, ps_documents_implementation_docs__grill_backend_schema_decisions_hierarchical_org_scope_inheritance [EXTRACTED 1.00]
- **SEBI BRSR Regulatory Architecture and Governance** — ps_documents_provided_docs_business_responsibility_and_sustainability_reporting_by_listed_entitiesannexure1_p_sebi_brsr_format_circular, ps_documents_provided_docs_business_responsibility_and_sustainability_reporting_by_listed_entitiesannexure2_p_sebi_brsr_guidance_note, ps_documents_provided_docs_brsr_faqs_25012025_brsr_applicability_top_1000, ps_documents_provided_docs_background_material_on_sustainability_business_responsibility_sustainability_reporting_brsr_revised_edition_2024_ngrbc_nine_principles [EXTRACTED 1.00]
- **BRSR Core Verification and Assurance Ecosystem** — ps_documents_provided_docs_brsr_faqs_25012025_brsr_core_framework, ps_documents_provided_docs_brsr_faqs_25012025_reasonable_assurance_mandate, ps_documents_provided_docs_background_material_on_sustainability_business_responsibility_sustainability_reporting_brsr_revised_edition_2024_icai_ssa_3000_assurance_standards, ps_documents_provided_docs_brsr_faqs_25012025_value_chain_partners_disclosure [EXTRACTED 1.00]
- **Corporate Sustainability Disclosure and Implementation** — ps_documents_provided_docs_l_t_brsr_report_fy2025_26_lnt_corporate_brsr_report, ps_documents_provided_docs_l_t_brsr_report_fy2025_26_lnt_energy_and_ghg_emissions_profile, ps_documents_provided_docs_business_responsibility_and_sustainability_reporting_by_listed_entitiesannexure2_p_ghg_emissions_calculation_guidance, ps_documents_provided_docs_business_responsibility_and_sustainability_report_corporate_esg_roadmap_readiness [INFERRED 0.85]

## Communities (105 total, 31 thin omitted)

### Community 0 - "Emission Factor Management"
Cohesion: 0.05
Nodes (67): addFactorVersionAction(), createFactorAction(), setFactorVersionStatusAction(), VersionValues, current(), FactorsManager(), setStatus(), formatDate() (+59 more)

### Community 1 - "Authentication & Session Management"
Cohesion: 0.08
Nodes (39): ALLOWED_TYPES, GET(), FORWARDED_REASONS, GET(), requestPasswordReset(), ResetRequestState, ForgotPasswordForm(), metadata (+31 more)

### Community 2 - "Data Validation Rules & Checks"
Cohesion: 0.08
Nodes (45): confidenceLabel(), FieldRow(), aggregate(), checkAllowedUnits(), checkBillingPeriodOverlap(), checkDuplicateInvoice(), checkDuplicatePeriod(), checkEvidence() (+37 more)

### Community 3 - "OCR Worker Harness & Testing"
Cohesion: 0.12
Nodes (22): main(), Write a synthetic diesel invoice PDF with a fresh invoice number, for manual…, WorkerHarnessTest, all_samples(), blank_png(), corrupted_pdf(), diesel_invoice_pdf(), _diesel_simple() (+14 more)

### Community 4 - "Emission Factor Management"
Cohesion: 0.10
Nodes (29): AdminApprovalQueuePage(), metadata, ConversionFactorsPage(), metadata, metadata, OrganizationPage(), AdminProfilePage(), metadata (+21 more)

### Community 5 - "Approval Workflow Management"
Cohesion: 0.10
Nodes (30): submitForApproval(), AuditEvent, jsonOrNull(), writeAudit(), CalculationOutcome, ENGINE_VERSION, RecordRow, runCalculation() (+22 more)

### Community 6 - "OCR Worker Harness & Testing"
Cohesion: 0.12
Nodes (26): Phase 2B standalone harness: seed documents + jobs directly (SQL + Storage),…, Worker settings from the environment (02_TRD.md §33). Values come from the…, Settings, Transient failure: back to pending for another attempt., requeue_job(), LostClaim, PermanentError, Failure classes (.grill/phase-2b-ocr-worker-decisions.md — failure handling). (+18 more)

### Community 7 - "tRPC API Routers & Context"
Cohesion: 0.10
Nodes (24): ADMIN_NAV, AdminLayout(), APP_NAV, WorkspaceLayout(), MarkAllReadButton(), ICONS, NotificationRow(), open() (+16 more)

### Community 8 - "Document Ingestion & Upload"
Cohesion: 0.11
Nodes (26): completeUploadAction(), FileTarget, prepareUploadAction(), putFile(), sha256Hex(), UploadForm(), checkFile(), complete() (+18 more)

### Community 9 - "OCR Engine & Model Pipeline"
Cohesion: 0.10
Nodes (20): main(), Download the pinned PaddleOCR model weights from the Hugging Face Hub into…, _load_dotenv(), load_settings(), Path, Minimal KEY=VALUE loader; real environment variables always win., capture(), JsonFormatter (+12 more)

### Community 10 - "Emission Factor Management"
Cohesion: 0.12
Nodes (18): ActivityType, FactorSheet(), STATUS, SubmitInput, Pending, STATUS, Result, Sheet() (+10 more)

### Community 11 - "OCR Job Monitoring"
Cohesion: 0.13
Nodes (22): metadata, OcrMonitoringPage(), formatDateTime(), metadata, MySubmissionsPage(), formatDateTime(), metadata, StatePanel() (+14 more)

### Community 12 - "Approval Workflow Management"
Cohesion: 0.14
Nodes (22): loadCalculations(), Sql, CalculationState, CalculationTrace, approvalsRouter, decide, RETURN_REASON_MIN, scopeFilter() (+14 more)

### Community 13 - "tRPC API Routers & Context"
Cohesion: 0.16
Nodes (20): OcrJobStatus, adminProcedure, Context, protectedProcedure, router, t, dashboardRouter, OpenPeriod (+12 more)

### Community 14 - "Organization Structure Management"
Cohesion: 0.17
Nodes (21): UploadAssignment, UploadCategory, uploadTargets(), allowedChildTypes(), canBeChildOf(), checkMove(), descendantIds(), isFrozen() (+13 more)

### Community 15 - "L&T BRSR Corporate Disclosures"
Cohesion: 0.08
Nodes (25): ICAI Sustainability Reporting Standards Board Guidance, ISSB Global Sustainability Baseline Alignment, National Guidelines on Responsible Business Conduct (NGRBC) 9 Principles, UN Sustainable Development Goals (SDGs) Mapping, BRSR Applicability for Top 1000 Listed Entities, High Value Debt Listed Entities (HVD) Applicability, BRSR vs BRR Paradigm Shift, Evolution of ESG Reporting in India (+17 more)

### Community 16 - "Document Ingestion & Upload"
Cohesion: 0.21
Nodes (13): initialState, initialState, Button(), buttonVariants, Input(), Label(), DropZone(), Phase (+5 more)

### Community 17 - "UI Components & Layout"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 18 - "Approval Workflow Management"
Cohesion: 0.15
Nodes (16): ApprovalsPage(), metadata, FILTERS, metadata, NotificationsPage(), formatDate(), metadata, UserDashboardPage() (+8 more)

### Community 19 - "Package Services"
Cohesion: 0.10
Nodes (20): devDependencies, supabase, engines, node, name, packageManager, private, scripts (+12 more)

### Community 20 - "OCR Field Extraction Logic"
Cohesion: 0.24
Nodes (10): ClassifyTest, ExtractFieldsTest, line(), Pure extraction/classification rules — no PaddleOCR needed (runs in CI)., values(), classify(), extract_fields(), FieldSpec (+2 more)

### Community 21 - "Document Verification Workspace"
Cohesion: 0.16
Nodes (15): GET(), ActiveSession, publicEnv, publicEnvSchema, evidenceBucket(), createSupabaseAdminClient(), fileInput, loadUploadOptions() (+7 more)

### Community 22 - "Tsconfig Services"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 23 - "OCR Field Extraction Logic"
Cohesion: 0.22
Nodes (17): _below_neighbor(), _find_labeled(), _find_unit_near(), _height(), _label_match(), _normalize(), _percent(), Find configured fields in OCR text lines. A field that can't be found is… (+9 more)

### Community 24 - "ESG Emission Calculation Engine"
Cohesion: 0.20
Nodes (13): CalculationTraceView(), APPROVAL, approvedOf(), BranchBars(), BranchTable(), RecordTable(), ScopeDashboard(), TrendBars() (+5 more)

### Community 25 - "Package Services"
Cohesion: 0.11
Nodes (18): typescript, name, private, type, version, class-variance-authority, eslint, eslint-config-next (+10 more)

### Community 26 - "Db Services"
Cohesion: 0.25
Nodes (17): _audit(), claim_job(), ClaimedJob, complete_job(), _confidence_threshold(), connect(), fail_job(), _finish_job() (+9 more)

### Community 27 - "User Management & Provisioning"
Cohesion: 0.17
Nodes (14): Impact, Result, RoleOption, RoleScopeFields(), STATUS, ConfirmDialog(), NativeSelect(), StatusBadge() (+6 more)

### Community 28 - "Reporting Period Administration"
Cohesion: 0.18
Nodes (15): pgErrorCode(), checkPeriodDates(), checkTransition(), PeriodDates, PeriodStatus, TransitionCheck, permissionProcedure(), badRequest() (+7 more)

### Community 29 - "Package Services"
Cohesion: 0.11
Nodes (18): dependencies, class-variance-authority, cn, lucide-react, next, pdfjs-dist, postgres, radix-ui (+10 more)

### Community 30 - "Validation Queue Operations"
Cohesion: 0.19
Nodes (11): reviewRecordAction(), formatDateTime(), problemTypes(), ValidationQueueTable(), decide(), DocumentViewer(), PdfDocument, PdfLoadingTask (+3 more)

### Community 31 - "tRPC API Routers & Context"
Cohesion: 0.25
Nodes (10): recordTraceAction(), metadata, ScopeOnePage(), handler(), createCallerFactory, createTRPCContext(), AppRouter, ActionResult (+2 more)

### Community 32 - "tRPC API Routers & Context"
Cohesion: 0.24
Nodes (12): db(), ScopeBranch, scopeBreakdown, ScopeRecord, Sql, TotalRow, totalsOf(), UnitTotal (+4 more)

### Community 33 - "ESG Emission Calculation Engine"
Cohesion: 0.15
Nodes (13): Phase 10 Scope 1 Decisions, Evidence Lineage Drilldown Architecture, Scope 1 Fuel Metrics Configuration, Approved-Only Headline Consolidation, Zero Placeholder Factor Policy, Strict Unit Grouping Rule, Phase 9 Calculation Engine Decisions, Deterministic Calculation and Trace Storage (+5 more)

### Community 34 - "Authentication & Session Management"
Cohesion: 0.15
Nodes (13): Phase 2 Database Decisions, Permission Catalogue and RBAC Model, Server-Issued Uploads Architecture, Server-Only Configuration Writes Architecture, Server-Only Lifecycle Writes Architecture, Narrow User Display Names View, Server-Side Postgres.js Transaction Architecture, Bytes-First Upload Architecture (+5 more)

### Community 35 - "OCR Job Monitoring"
Cohesion: 0.28
Nodes (11): ocrJobFieldsAction(), retryOcrJobAction(), Band, formatDateTime(), JobDrawer(), load(), OcrJobsTable(), percent() (+3 more)

### Community 36 - "BRSR Regulatory & Governance Framework"
Cohesion: 0.17
Nodes (13): TraceESG Evidence-First ESG Platform, TRD Core Architecture Principles, TraceESG Recommended Technology Stack, Admin Control Tower Command Center, Single Organization Tree No Tenant ID Decision, Split Hosting Vercel and Render Decision, PS-08 Master System Blueprint v1.0, Dr. P. Ravi Reddy (MEIL Director) Video Briefing (+5 more)

### Community 37 - "App Shell & Navigation"
Cohesion: 0.18
Nodes (8): AdminDashboardPage(), ISSUES, KpiCard, metadata, PIPELINE_KPIS, SCOPE_KPIS, NOTICES, NoticeToast()

### Community 38 - "UI Components & Layout"
Cohesion: 0.26
Nodes (6): Dialog(), DialogContent(), DialogDescription(), DialogFooter(), DialogHeader(), DialogTitle()

### Community 39 - "Package Services"
Cohesion: 0.17
Nodes (12): scripts, build, calculate-pending, dev, format, format:check, lint, provision-user (+4 more)

### Community 40 - "User Management & Provisioning"
Cohesion: 0.18
Nodes (11): activeAdminExistsQuery, assignedByEmail, displayName, email, fail(), orgCode, requireEnv(), roleCode (+3 more)

### Community 41 - "Package Services"
Cohesion: 0.17
Nodes (11): devDependencies, typescript, typescript, main, name, private, scripts, typecheck (+3 more)

### Community 42 - "Authentication & Session Management"
Cohesion: 0.20
Nodes (11): Admin-Provisioned Accounts Model, Corporate ESG Approval Route Resolution, Data Access Layer Session Guard, Phase 3 Auth Decisions, First Admin Provisioning Script, Deviation A12 Scope 1 Dashboard and Evidence Drilldown, Deviation A1 Corporate ESG Approvals Route, Deviation A2 Auth Confirm and Set Password Routes (+3 more)

### Community 43 - "Data Validation Rules & Checks"
Cohesion: 0.35
Nodes (7): OUTCOME_ICON, Result, ValidationResult(), worst(), FieldEntry, cn, lucide-react

### Community 44 - "User Management & Provisioning"
Cohesion: 0.36
Nodes (9): assertAdminRemovalAllowed(), assertAssignable(), badRequest(), loadNodes(), userManage, usersRouter, checkAdminRemoval(), checkRoleAtNode() (+1 more)

### Community 45 - "UI Components & Layout"
Cohesion: 0.20
Nodes (10): CI OCR Worker Job, CI Web Job, CI Workflow, OCR Worker Runtime Dependencies, OCR Worker Dev Dependencies, pnpm Monorepo Workspace Configuration, Account Provisioning and Role Management Guide, Local Development and Environment Setup (+2 more)

### Community 46 - "Corepack Pinned Pnpm Decision"
Cohesion: 0.20
Nodes (10): Corepack Pinned pnpm Decision, Phase 1 Project Setup Decisions, PaddleOCR Python 3.12 Worker Runtime, Next.js 16 and Tailwind v4 Stack Selection, Three-Theme Data-Theme Architecture, Project Root Agent Brief, TraceESG Core Architecture Principles, TraceESG Implementation Phase Tracker (+2 more)

### Community 47 - "Package Services"
Cohesion: 0.20
Nodes (10): devDependencies, eslint, eslint-config-next, prettier, tailwindcss, @tailwindcss/postcss, @types/node, @types/react (+2 more)

### Community 48 - "Tsconfig Services"
Cohesion: 0.20
Nodes (9): compilerOptions, isolatedModules, module, moduleResolution, noEmit, skipLibCheck, strict, target (+1 more)

### Community 49 - "Evidence-First Data Collection Model"
Cohesion: 0.20
Nodes (10): Evidence-First Data Collection Model, Evidence Document Upload Journey, Defensibility-First UI/UX Philosophy, Canonical esg_records Table, Immutable Append-Only Lifecycle Tables, 21-Phase Sequential and Parallel Roadmap, Async OCR Non-Blocking UX Decision, Master Audit Trail and Traceability Framework (+2 more)

### Community 50 - "OCR Field Extraction Logic"
Cohesion: 0.50
Nodes (4): FieldsNeedingAttentionTest, ExtractedField, fields_needing_attention(), Found fields below the confidence threshold plus required fields that weren't…

### Community 51 - "App Shell & Navigation"
Cohesion: 0.29
Nodes (5): TraceESG App Icon, inter, jetbrainsMono, metadata, Toaster()

### Community 52 - "Traceesg Target Personas And"
Cohesion: 0.25
Nodes (8): TraceESG Target Personas and Roles, Route Namespace Model (/admin and /app), user_org_assignments Table, Master Seven Role Access Model, Deviation D5: Narrow user_display_names Public View, Deviation D9: Inactive Users Have No Data Access, TraceESG Account Invitation Email Template, TraceESG Password Reset Email Template

### Community 53 - "Data Validation Rules & Checks"
Cohesion: 0.29
Nodes (7): Phase 2B OCR Worker Decisions, Deterministic OCR Extraction Engine, OCR Job Failure and Retry Policy, CPU-Friendly Mobile Model Selection, Synthetic Document Test Generation, Worker Transactional Write Scope, Six PRD Validation Categories Engine

### Community 54 - "Authentication & Session Management"
Cohesion: 0.29
Nodes (7): Three-Layer Deactivation Enforcement, Phase 4 Admin Foundation Decisions, Frozen Deactivated Organization Node Policy, Guidance Submission Windows Schema Deviation, Organization Tree Ordering Constraints, Root-Only Admin Role Assignment Rule, Admin Lockout Protection Guards

### Community 55 - "Admin Ocr Job Retry"
Cohesion: 0.29
Nodes (7): Admin OCR Job Retry Policy, Phase 6 OCR Integration Decisions, My Submissions Status Workflow Tabs, Configurable OCR Confidence Threshold (80%), Short-Polling UI Update Architecture, Pending-Job Worker Health Monitor, Worker Transactional Notification Dispatch

### Community 56 - "Data Validation Rules & Checks"
Cohesion: 0.29
Nodes (7): Admin Validation Queue and Drawer, Historical Median Anomaly Check, Approval Step Pulled Forward into Phase 8, Phase 8 Validation Engine Decisions, Returned Record Correction Workflow, Deviation A10 Approval Pulled Forward into Phase 8, Deviation A9 Validation in Confirm Transaction

### Community 57 - "Document Verification Workspace"
Cohesion: 0.33
Nodes (6): Metric Activity Field and Unit Derivation, Phase 7 OCR Verification Decisions, Manual Exception Storage and Justification Flow, Authenticated PDF.js Evidence Streaming Route, Failed Document Re-upload Replacement Flow, Server-Enforced Verification Guard Rail

### Community 58 - "Proxy Services"
Cohesion: 0.40
Nodes (5): config, isProtected(), PROTECTED_PREFIXES, proxy(), @supabase/ssr

### Community 59 - "BRSR Regulatory & Governance Framework"
Cohesion: 0.33
Nodes (6): BRSR Comprehensive, Lite and Core Architecture, ICAI Standards on Sustainability Assurance (SSA 3000), BRSR Core Framework, Reasonable Assurance Mandate for BRSR Core, Value Chain Partners Disclosures, Corporate ESG Roadmap and Assurance Readiness

### Community 60 - "Configurable Multi-Entity Organization Hierarchy"
Cohesion: 0.40
Nodes (5): Configurable Multi-Entity Organization Hierarchy, Postgres RLS Database-Layer Authorization, org_units Recursive Hierarchy Table, Master Seven Level Organizational Model, Deviation D6: Database Privilege Hardening (Revoke DML)

### Community 61 - "Graphify Query And Traversal"
Cohesion: 0.50
Nodes (4): Graphify Query and Traversal Rule, Graphify Knowledge Graph Rule, Graphify AST Update Rule, Graphify Workflow

### Community 62 - "UI Components & Layout"
Cohesion: 0.50
Nodes (4): Theme 1: Marple Warm Modern ESG, Theme 2: MEIL Corporate / Official, Theme 3: Dark Enterprise / Premium ESG, Three Themes Shared UX Structure Decision

### Community 63 - "Esg_Record_Documents Many-To-Many Join Table"
Cohesion: 0.50
Nodes (4): esg_record_documents Many-to-Many Join Table, Standardized Storage Path Conventions, Documents to ESG Records Many-to-Many Decision, Deviation D3: Server-Issued Signed Uploads (Bytes First)

### Community 64 - "Organization Structure Management"
Cohesion: 1.33
Nodes (3): OrgManager(), renderNode(), select()

### Community 65 - "Eight Core Product Principles"
Cohesion: 0.67
Nodes (3): Eight Core Product Principles, 15 AI Coding Agent Rules, No Manual Form Entry Architectural Rule

### Community 66 - "BRSR Regulatory & Governance Framework"
Cohesion: 0.67
Nodes (3): Evidence-to-BRSR Digital Thread, Structural Evidence Lineage Traceability, Report Generation and Evidence Drilldown Flow

### Community 67 - "Deterministic Typescript Calculation Engine"
Cohesion: 0.67
Nodes (3): Deterministic TypeScript Calculation Engine, TypeScript Calculation Engine Colocation Decision, Standard Carbon Equivalent Conversion Metric Need

### Community 68 - "Postgres-Backed Document Job Queue"
Cohesion: 0.67
Nodes (3): Postgres-Backed Document Job Queue, OCR Pipeline Tables (ocr_jobs, ocr_extractions, ocr_fields), Self-Hosted PaddleOCR Decision

### Community 69 - "Conversion_Factors And Conversion_Factor_Versions Tables"
Cohesion: 0.67
Nodes (3): conversion_factors and conversion_factor_versions Tables, Two-Table Conversion Factor Versioning Decision, Deviation D2: Server-Only Configuration Writes

## Knowledge Gaps
- **361 isolated node(s):** `printWidth`, `metadata`, `VersionValues`, `STATUS`, `ActivityType` (+356 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 508 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `lucide-react` connect `Data Validation Rules & Checks` to `Authentication & Session Management`, `OCR Job Monitoring`, `Emission Factor Management`, `App Shell & Navigation`, `UI Components & Layout`, `tRPC API Routers & Context`, `Emission Factor Management`, `OCR Job Monitoring`, `Document Ingestion & Upload`, `Approval Workflow Management`, `ESG Emission Calculation Engine`, `Package Services`, `User Management & Provisioning`, `Validation Queue Operations`, `tRPC API Routers & Context`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `server-only` connect `Approval Workflow Management` to `tRPC API Routers & Context`, `Authentication & Session Management`, `Data Validation Rules & Checks`, `Emission Factor Management`, `Approval Workflow Management`, `tRPC API Routers & Context`, `Organization Structure Management`, `User Management & Provisioning`, `Document Verification Workspace`, `Package Services`, `Reporting Period Administration`, `tRPC API Routers & Context`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `react` connect `Document Ingestion & Upload` to `Authentication & Session Management`, `OCR Job Monitoring`, `Emission Factor Management`, `App Shell & Navigation`, `UI Components & Layout`, `tRPC API Routers & Context`, `Emission Factor Management`, `OCR Job Monitoring`, `Data Validation Rules & Checks`, `Approval Workflow Management`, `ESG Emission Calculation Engine`, `Package Services`, `User Management & Provisioning`, `Validation Queue Operations`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `printWidth`, `metadata`, `VersionValues` to the rest of the system?**
  _361 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Emission Factor Management` be split into smaller, more focused modules?**
  _Cohesion score 0.05017543859649123 - nodes in this community are weakly interconnected._
- **Should `Authentication & Session Management` be split into smaller, more focused modules?**
  _Cohesion score 0.07542087542087542 - nodes in this community are weakly interconnected._
- **Should `Data Validation Rules & Checks` be split into smaller, more focused modules?**
  _Cohesion score 0.07896575821104122 - nodes in this community are weakly interconnected._