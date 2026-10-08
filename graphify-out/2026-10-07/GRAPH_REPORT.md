# Graph Report - ps08_BRSR_meil  (2026-10-07)

## Corpus Check
- 256 files · ~446,766 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1924 nodes · 3496 edges · 178 communities (122 shown, 49 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 47 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a8cd3b88`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- runAction
- createSupabaseServerClient
- verification.ts
- WorkerHarnessTest
- trpc/server.ts
- writeAudit
- processor.py
- notification-bell.tsx
- documents.ts
- __main__.py
- factors-manager.tsx
- [documentId]/page.tsx
- db
- root.ts
- organization.ts
- SEBI BRSR Reporting Format (Annexure 1)
- forgot-password-form.tsx
- components.json
- session.ts
- scripts
- extract_fields
- PS-08 ESG/BRSR Reporting Portal
- compilerOptions
- fields.py
- scope-dashboard.tsx
- web/package.json
- db.py
- periods-manager.tsx
- reporting-periods.ts
- dependencies
- roles-manager.tsx
- Product Requirements Document (PRD)
- Technical Requirements Document (TRD)
- Phase 10 Scope 1 Decisions
- Phase 5 Document Ingestion Decisions
- ocr-jobs-table.tsx
- TraceESG Evidence-First ESG Platform
- app/app/page.tsx
- button.tsx
- scripts
- provision-user.ts
- shared-types/package.json
- App Flow Deviations Document
- landing-page.tsx
- users.ts
- TraceESG Project README
- TraceESG Project Context and Progress
- devDependencies
- compilerOptions
- Evidence-First Data Collection Model
- fields_needing_attention
- web/app/layout.tsx
- TraceESG Target Personas and Roles
- Phase 2B OCR Worker Decisions
- Phase 4 Admin Foundation Decisions
- Phase 6 OCR Integration Decisions
- Phase 8 Validation Engine Decisions
- Phase 7 OCR Verification Decisions
- 2. Phase-by-Phase Plan
- BRSR Core Framework
- Configurable Multi-Entity Organization Hierarchy
- Graphify Knowledge Graph Rule
- Three Themes Shared UX Structure Decision
- esg_record_documents Many-to-Many Join Table
- organization/page.tsx
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
- 45. Demo Scenario
- UI/UX Design Brief
- 51. Final System Summary
- 2.2 Admin
- Backend Schema Document
- org-manager.tsx
- totals.ts
- 30. Approval Workflow
- top-bar.tsx
- 1. Project Objective
- 4. Flows
- 6. Color System
- 48. Key Differentiator
- 2.3 Non-Admin User (`/app/*`)
- 11. Component Library
- 6. ESG Configuration Tables
- Grill: 02_TRD.md technology stack and architecture decisions
- 42. Data Quality Model
- units.ts
- Grill: Phase 11 — Scope 2
- Grill: Phase 12 — Scope 3 foundation
- Grill: 03_APP_FLOW.md UX/navigation decisions
- Grill: 05_BACKEND_SCHEMA.md structural decisions
- Grill: 06_IMPLEMENTATION_PLAN.md structure decisions
- Grill: 04_UI_UX_DESIGN_BRIEF.md design-system decisions
- validation-queue-table.tsx
- Application Flow Document (App Flow)
- 5. Core User Journeys
- 12. Core Feature Components
- 13. Dashboard & Data Components
- 3. Identity & Access Tables
- 9. ESG Records & Lifecycle Tables
- 15. System States
- 10. Calculations & Conversion Factors
- 16. Authentication & Authorization Model
- 20. Optional: API Resource Mapping, Query Patterns, Transactions, Concurrency
- 8. Documents & OCR Tables
- 15. Scope 1
- 9. Data Submission Model
- 2. Complete Page Inventory
- 11. BRSR Tables
- 19. Triggers/Events
- 22. Evidence-First Record Structure
- 38. Api / Backend Concept
- 9. Role And Permission Matrix
- 14. Notifications & Settings
- 22. Submission/Approval Status.
- 25. Conversion Factor Engine
- 27. Unit Normalization
- 44. Practical Hackathon Implementation Strategy
- 4. User Access Model
- next.config.ts
- cn
- next
- pdfjs-dist
- radix-ui
- react
- react-dom
- shadcn
- 12. Ocr Design Principles
- 14. Common Esg Data Model
- 14. Project Roadmap
- 16. Scope 2
- 18. Hr Module
- 19. Ehs / Environment Module
- 20. Procurement Module
- 32. Admin Report Drill-Down
- 43. Mvp Priority
- 8. User Dashboard
- roles.ts

## God Nodes (most connected - your core abstractions)
1. `PS-08 ESG/BRSR Reporting Portal` - 112 edges
2. `runAction()` - 51 edges
3. `Technical Requirements Document (TRD)` - 45 edges
4. `Product Requirements Document (PRD)` - 43 edges
5. `api()` - 42 edges
6. `db()` - 34 edges
7. `requireAdminSession()` - 30 edges
8. `Button()` - 29 edges
9. `writeAudit()` - 28 edges
10. `45. Demo Scenario` - 25 edges

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

## Communities (178 total, 49 thin omitted)

### Community 0 - "runAction"
Cohesion: 0.22
Nodes (18): addAssignmentAction(), deactivateUserAction(), inviteUserAction(), reactivateUserAction(), resendInviteAction(), revokeAssignmentAction(), InviteSheet(), onSubmit() (+10 more)

### Community 1 - "createSupabaseServerClient"
Cohesion: 0.07
Nodes (37): ALLOWED_TYPES, GET(), FORWARDED_REASONS, GET(), requestPasswordReset(), ResetRequestState, ForgotPasswordForm(), metadata (+29 more)

### Community 2 - "verification.ts"
Cohesion: 0.05
Nodes (75): checkInvoiceDuplicatesAction(), confirmManualEntryAction(), confirmVerificationAction(), rejectDocumentAction(), revalidateWorkspace(), setDocumentTypeAction(), OUTCOME_ICON, Result (+67 more)

### Community 3 - "WorkerHarnessTest"
Cohesion: 0.11
Nodes (30): main(), Write a synthetic fuel invoice or electricity bill PDF with a fresh number, for…, WorkerHarnessTest, all_samples(), blank_png(), corrupted_pdf(), diesel_invoice_pdf(), _diesel_simple() (+22 more)

### Community 4 - "trpc/server.ts"
Cohesion: 0.11
Nodes (32): AdminApprovalQueuePage(), metadata, ConversionFactorsPage(), metadata, AdminProfilePage(), metadata, metadata, ReportingPeriodsPage() (+24 more)

### Community 5 - "writeAudit"
Cohesion: 0.11
Nodes (26): submitForApproval(), AuditEvent, jsonOrNull(), writeAudit(), CalculationOutcome, ENGINE_VERSION, RecordRow, runCalculation() (+18 more)

### Community 6 - "processor.py"
Cohesion: 0.12
Nodes (26): Phase 2B standalone harness: seed documents + jobs directly (SQL + Storage),…, Worker settings from the environment (02_TRD.md §33). Values come from the…, Settings, Transient failure: back to pending for another attempt., requeue_job(), LostClaim, PermanentError, Failure classes (.grill/phase-2b-ocr-worker-decisions.md — failure handling). (+18 more)

### Community 7 - "notification-bell.tsx"
Cohesion: 0.18
Nodes (14): MarkAllReadButton(), ICONS, NotificationRow(), open(), relative, relativeTime(), NotificationBell(), Popover() (+6 more)

### Community 8 - "documents.ts"
Cohesion: 0.07
Nodes (49): GET(), completeUploadAction(), FileTarget, prepareUploadAction(), DropZone(), Phase, putFile(), sha256Hex() (+41 more)

### Community 9 - "__main__.py"
Cohesion: 0.10
Nodes (20): main(), Download the pinned PaddleOCR model weights from the Hugging Face Hub into…, _load_dotenv(), load_settings(), Path, Minimal KEY=VALUE loader; real environment variables always win., capture(), JsonFormatter (+12 more)

### Community 10 - "factors-manager.tsx"
Cohesion: 0.17
Nodes (13): addFactorVersionAction(), createFactorAction(), setFactorVersionStatusAction(), VersionValues, ActivityType, current(), FactorSheet(), FactorsManager() (+5 more)

### Community 11 - "[documentId]/page.tsx"
Cohesion: 0.13
Nodes (21): metadata, OcrMonitoringPage(), formatDateTime(), metadata, MySubmissionsPage(), formatDateTime(), metadata, StatePanel() (+13 more)

### Community 12 - "db"
Cohesion: 0.16
Nodes (18): CalculationTraceView(), loadCalculations(), Sql, CalculationState, CalculationTrace, formatQuantity(), db(), ApprovalRow (+10 more)

### Community 13 - "root.ts"
Cohesion: 0.13
Nodes (23): handler(), adminProcedure, Context, createCallerFactory, createTRPCContext(), protectedProcedure, router, t (+15 more)

### Community 14 - "organization.ts"
Cohesion: 0.16
Nodes (21): RoleScopeFields(), pgErrorCode(), UploadAssignment, UploadCategory, uploadTargets(), allowedChildTypes(), canBeChildOf(), checkMove() (+13 more)

### Community 15 - "SEBI BRSR Reporting Format (Annexure 1)"
Cohesion: 0.08
Nodes (25): ICAI Sustainability Reporting Standards Board Guidance, ISSB Global Sustainability Baseline Alignment, National Guidelines on Responsible Business Conduct (NGRBC) 9 Principles, UN Sustainable Development Goals (SDGs) Mapping, BRSR Applicability for Top 1000 Listed Entities, High Value Debt Listed Entities (HVD) Applicability, BRSR vs BRR Paradigm Shift, Evolution of ESG Reporting in India (+17 more)

### Community 16 - "forgot-password-form.tsx"
Cohesion: 0.22
Nodes (11): initialState, initialState, ProfileView(), onChangePassword(), onSaveName(), Input(), Label(), AUTH_MESSAGES (+3 more)

### Community 17 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 18 - "session.ts"
Cohesion: 0.18
Nodes (12): ApprovalsPage(), metadata, WorkspaceProfilePage(), metadata, UploadPage(), AssignmentRow, DeniedReason, requireActiveSession() (+4 more)

### Community 19 - "scripts"
Cohesion: 0.10
Nodes (20): devDependencies, supabase, engines, node, name, packageManager, private, scripts (+12 more)

### Community 20 - "extract_fields"
Cohesion: 0.24
Nodes (10): ClassifyTest, ExtractFieldsTest, line(), Pure extraction/classification rules — no PaddleOCR needed (runs in CI)., values(), classify(), extract_fields(), FieldSpec (+2 more)

### Community 21 - "PS-08 ESG/BRSR Reporting Portal"
Cohesion: 0.02
Nodes (86): 10. Document Upload Workflow, 10. Esg Record Creation., 10. Modular Scope 3 Architecture., 10. Ui/Ux Specification, 11. Api-First Backend., 11. Ocr Verification Screen, 11. Security Design, 11. Validation Engine. (+78 more)

### Community 22 - "compilerOptions"
Cohesion: 0.07
Nodes (29): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+21 more)

### Community 23 - "fields.py"
Cohesion: 0.22
Nodes (17): _below_neighbor(), _find_labeled(), _find_unit_near(), _height(), _label_match(), _normalize(), _percent(), Find configured fields in OCR text lines. A field that can't be found is… (+9 more)

### Community 24 - "scope-dashboard.tsx"
Cohesion: 0.33
Nodes (11): ActivityTable(), APPROVAL, approvedOf(), BranchBars(), BranchTable(), CategoryTable(), RecordTable(), TrendBars() (+3 more)

### Community 25 - "web/package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 26 - "db.py"
Cohesion: 0.25
Nodes (17): _audit(), claim_job(), ClaimedJob, complete_job(), _confidence_threshold(), connect(), fail_job(), _finish_job() (+9 more)

### Community 27 - "periods-manager.tsx"
Cohesion: 0.18
Nodes (15): createPeriodAction(), transitionPeriodAction(), updatePeriodWindowAction(), CreatePeriodSheet(), onSubmit(), formatDate(), Pending, PeriodsManager() (+7 more)

### Community 28 - "reporting-periods.ts"
Cohesion: 0.23
Nodes (11): checkPeriodDates(), checkTransition(), PeriodDates, PeriodStatus, TransitionCheck, badRequest(), isoDate, optionalIsoDate (+3 more)

### Community 29 - "dependencies"
Cohesion: 0.10
Nodes (21): dependencies, class-variance-authority, lucide-react, postgres, server-only, sonner, @supabase/ssr, @supabase/supabase-js (+13 more)

### Community 30 - "roles-manager.tsx"
Cohesion: 0.15
Nodes (13): createRoleAction(), deleteRoleAction(), setRolePermissionsAction(), CreateRoleSheet(), onSubmit(), Result, RolePermissions(), onSubmit() (+5 more)

### Community 31 - "Product Requirements Document (PRD)"
Cohesion: 0.04
Nodes (46): 10. User Roles, 11. Organizational Model, 12. Core Product Principles, 13. Functional Requirements, 14. Feature List, 15. Detailed Feature Descriptions, 16. Core User Stories, 17. Admin User Stories (+38 more)

### Community 32 - "Technical Requirements Document (TRD)"
Cohesion: 0.04
Nodes (45): 10. OCR/Document Intelligence Technology, 11. Background Job/Queue Strategy, 12. Hosting/Deployment, 13. Third-Party Services/APIs, 14. Key Libraries, 15. State/Data-Fetching Strategy, 16. Validation Technology, 17. PDF/Report Generation Approach (+37 more)

### Community 33 - "Phase 10 Scope 1 Decisions"
Cohesion: 0.15
Nodes (13): Phase 10 Scope 1 Decisions, Evidence Lineage Drilldown Architecture, Scope 1 Fuel Metrics Configuration, Approved-Only Headline Consolidation, Zero Placeholder Factor Policy, Strict Unit Grouping Rule, Phase 9 Calculation Engine Decisions, Deterministic Calculation and Trace Storage (+5 more)

### Community 34 - "Phase 5 Document Ingestion Decisions"
Cohesion: 0.15
Nodes (13): Phase 2 Database Decisions, Permission Catalogue and RBAC Model, Server-Issued Uploads Architecture, Server-Only Configuration Writes Architecture, Server-Only Lifecycle Writes Architecture, Narrow User Display Names View, Server-Side Postgres.js Transaction Architecture, Bytes-First Upload Architecture (+5 more)

### Community 35 - "ocr-jobs-table.tsx"
Cohesion: 0.23
Nodes (13): ocrJobFieldsAction(), retryOcrJobAction(), Band, formatDateTime(), JobDrawer(), load(), OcrJobsTable(), percent() (+5 more)

### Community 36 - "TraceESG Evidence-First ESG Platform"
Cohesion: 0.17
Nodes (13): TraceESG Evidence-First ESG Platform, TRD Core Architecture Principles, TraceESG Recommended Technology Stack, Admin Control Tower Command Center, Single Organization Tree No Tenant ID Decision, Split Hosting Vercel and Render Decision, PS-08 Master System Blueprint v1.0, Dr. P. Ravi Reddy (MEIL Director) Video Briefing (+5 more)

### Community 37 - "app/app/page.tsx"
Cohesion: 0.15
Nodes (12): AdminDashboardPage(), ISSUES, KpiCard, metadata, PIPELINE_KPIS, SCOPE_KPIS, formatDate(), metadata (+4 more)

### Community 38 - "button.tsx"
Cohesion: 0.12
Nodes (18): ApprovalQueue(), decide(), recalculate(), formatDateTime(), DocumentViewer(), PdfDocument, PdfLoadingTask, ZOOM_STEPS (+10 more)

### Community 39 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, build, calculate-pending, dev, format, format:check, lint, provision-user (+4 more)

### Community 40 - "provision-user.ts"
Cohesion: 0.18
Nodes (11): activeAdminExistsQuery, assignedByEmail, displayName, email, fail(), orgCode, requireEnv(), roleCode (+3 more)

### Community 41 - "shared-types/package.json"
Cohesion: 0.17
Nodes (11): devDependencies, typescript, typescript, main, name, private, scripts, typecheck (+3 more)

### Community 42 - "App Flow Deviations Document"
Cohesion: 0.20
Nodes (11): Admin-Provisioned Accounts Model, Corporate ESG Approval Route Resolution, Data Access Layer Session Guard, Phase 3 Auth Decisions, First Admin Provisioning Script, Deviation A12 Scope 1 Dashboard and Evidence Drilldown, Deviation A1 Corporate ESG Approvals Route, Deviation A2 Auth Confirm and Set Password Routes (+3 more)

### Community 43 - "landing-page.tsx"
Cohesion: 0.07
Nodes (24): Agentation, AgentationToolbar(), CAPABILITIES, CapabilityItem, HeroCapabilityCard(), ContributorsSection(), roles, CtaFooterSection() (+16 more)

### Community 44 - "users.ts"
Cohesion: 0.28
Nodes (11): assertAdminRemovalAllowed(), assertAssignable(), badRequest(), loadNodes(), userManage, UserRow, usersRouter, UserStatus (+3 more)

### Community 45 - "TraceESG Project README"
Cohesion: 0.20
Nodes (10): CI OCR Worker Job, CI Web Job, CI Workflow, OCR Worker Runtime Dependencies, OCR Worker Dev Dependencies, pnpm Monorepo Workspace Configuration, Account Provisioning and Role Management Guide, Local Development and Environment Setup (+2 more)

### Community 46 - "TraceESG Project Context and Progress"
Cohesion: 0.20
Nodes (10): Corepack Pinned pnpm Decision, Phase 1 Project Setup Decisions, PaddleOCR Python 3.12 Worker Runtime, Next.js 16 and Tailwind v4 Stack Selection, Three-Theme Data-Theme Architecture, Project Root Agent Brief, TraceESG Core Architecture Principles, TraceESG Implementation Phase Tracker (+2 more)

### Community 47 - "devDependencies"
Cohesion: 0.10
Nodes (21): devDependencies, agentation, eslint, eslint-config-next, prettier, tailwindcss, @tailwindcss/postcss, @types/node (+13 more)

### Community 48 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, isolatedModules, module, moduleResolution, noEmit, skipLibCheck, strict, target (+2 more)

### Community 49 - "Evidence-First Data Collection Model"
Cohesion: 0.20
Nodes (10): Evidence-First Data Collection Model, Evidence Document Upload Journey, Defensibility-First UI/UX Philosophy, Canonical esg_records Table, Immutable Append-Only Lifecycle Tables, 21-Phase Sequential and Parallel Roadmap, Async OCR Non-Blocking UX Decision, Master Audit Trail and Traceability Framework (+2 more)

### Community 50 - "fields_needing_attention"
Cohesion: 0.50
Nodes (4): FieldsNeedingAttentionTest, ExtractedField, fields_needing_attention(), Found fields below the confidence threshold plus required fields that weren't…

### Community 51 - "web/app/layout.tsx"
Cohesion: 0.25
Nodes (6): TraceESG App Icon, inter, jetbrainsMono, lora, metadata, Toaster()

### Community 52 - "TraceESG Target Personas and Roles"
Cohesion: 0.25
Nodes (8): TraceESG Target Personas and Roles, Route Namespace Model (/admin and /app), user_org_assignments Table, Master Seven Role Access Model, Deviation D5: Narrow user_display_names Public View, Deviation D9: Inactive Users Have No Data Access, TraceESG Account Invitation Email Template, TraceESG Password Reset Email Template

### Community 53 - "Phase 2B OCR Worker Decisions"
Cohesion: 0.29
Nodes (7): Phase 2B OCR Worker Decisions, Deterministic OCR Extraction Engine, OCR Job Failure and Retry Policy, CPU-Friendly Mobile Model Selection, Synthetic Document Test Generation, Worker Transactional Write Scope, Six PRD Validation Categories Engine

### Community 54 - "Phase 4 Admin Foundation Decisions"
Cohesion: 0.29
Nodes (7): Three-Layer Deactivation Enforcement, Phase 4 Admin Foundation Decisions, Frozen Deactivated Organization Node Policy, Guidance Submission Windows Schema Deviation, Organization Tree Ordering Constraints, Root-Only Admin Role Assignment Rule, Admin Lockout Protection Guards

### Community 55 - "Phase 6 OCR Integration Decisions"
Cohesion: 0.29
Nodes (7): Admin OCR Job Retry Policy, Phase 6 OCR Integration Decisions, My Submissions Status Workflow Tabs, Configurable OCR Confidence Threshold (80%), Short-Polling UI Update Architecture, Pending-Job Worker Health Monitor, Worker Transactional Notification Dispatch

### Community 56 - "Phase 8 Validation Engine Decisions"
Cohesion: 0.29
Nodes (7): Admin Validation Queue and Drawer, Historical Median Anomaly Check, Approval Step Pulled Forward into Phase 8, Phase 8 Validation Engine Decisions, Returned Record Correction Workflow, Deviation A10 Approval Pulled Forward into Phase 8, Deviation A9 Validation in Confirm Transaction

### Community 57 - "Phase 7 OCR Verification Decisions"
Cohesion: 0.33
Nodes (6): Metric Activity Field and Unit Derivation, Phase 7 OCR Verification Decisions, Manual Exception Storage and Justification Flow, Authenticated PDF.js Evidence Streaming Route, Failed Document Re-upload Replacement Flow, Server-Enforced Verification Guard Rail

### Community 58 - "2. Phase-by-Phase Plan"
Cohesion: 0.06
Nodes (33): 0. AI Coding Agent Rules, 1.1 File & Folder Organization, 1. How This Plan Is Structured, 2. Phase-by-Phase Plan, 3. Milestones, 4. Critical End-to-End Test (executed progressively, per phase above — not deferred to the end), 5. Testing Strategy Summary, 6. Edge Cases — Mapped to Owning Phase (+25 more)

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

### Community 64 - "organization/page.tsx"
Cohesion: 0.40
Nodes (5): OrgManager(), renderNode(), select(), metadata, OrganizationPage()

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

### Community 105 - "45. Demo Scenario"
Cohesion: 0.08
Nodes (25): 45. Demo Scenario, Hr, Meil, Step 1:, Step 10:, Step 11:, Step 12:, Step 13: (+17 more)

### Community 106 - "UI/UX Design Brief"
Cohesion: 0.10
Nodes (19): 0. Decisions This Document Makes (read first), 10. Iconography, 14. Notifications, 16. Responsive Behavior & Mobile Considerations, 17. Accessibility, 18. UI Consistency Rules, 19. Key Screens — Admin, 1. Design Philosophy (+11 more)

### Community 107 - "51. Final System Summary"
Cohesion: 0.10
Nodes (20): 51. Final System Summary, Admin, Admin, Brsr Mapping, Calculation Engine, Confirm       Edit, Consolidation, Control Tower (+12 more)

### Community 108 - "2.2 Admin"
Cohesion: 0.11
Nodes (18): 2.2 Admin, Admin Dashboard (Control Tower), Approval Queue, Audit Trail, BRSR Mapping, Conversion Factors, ESG Data Explorer, OCR Monitoring (+10 more)

### Community 109 - "Backend Schema Document"
Cohesion: 0.11
Nodes (17): 12.1 `audit_logs`, 12. Audit Table, 13.1 `report_runs`, 13. Reports, 15. File Storage Model, 17. Sensitive Data Classification & Protection, 18. Indexes Summary, 1. Objective, Inherited Decisions, and Conventions (+9 more)

### Community 110 - "org-manager.tsx"
Cohesion: 0.32
Nodes (12): createOrgUnitAction(), moveOrgUnitAction(), orgUnitImpactAction(), setOrgUnitStatusAction(), updateOrgUnitAction(), Impact, NodeDetail(), onAddChild() (+4 more)

### Community 111 - "totals.ts"
Cohesion: 0.22
Nodes (10): ActivityTotal, ScopeBranch, scopeBreakdown, ScopeCategory, ScopeRecord, scopeTree(), Sql, TotalRow (+2 more)

### Community 112 - "30. Approval Workflow"
Cohesion: 0.14
Nodes (14): 30. Approval Workflow, Approved, Document_Uploaded, Draft, Flagged_For_Review, Included_In_Report, Incomplete, Ocr_Completed (+6 more)

### Community 113 - "top-bar.tsx"
Cohesion: 0.24
Nodes (9): ADMIN_NAV, AdminLayout(), APP_NAV, WorkspaceLayout(), ICONS, NavIcon, NavItem, Sidebar() (+1 more)

### Community 114 - "1. Project Objective"
Cohesion: 0.15
Nodes (13): 1. Project Objective, Admin Control, Bill / Source Document, Brsr Mapping, Consolidation, Esg Calculation, Extracted Data, Important Product Decision: (+5 more)

### Community 115 - "4. Flows"
Cohesion: 0.17
Nodes (12): 4.10 Report Generation Flow, 4.11 Evidence-to-BRSR Pipeline (overall reference diagram), 4.1 Auth Flow, 4.2 Logout Flow, 4.3 Session Expiration Flow, 4.4 Unauthorized Access Flow, 4.5 OCR Failure Flow, 4.6 Low-Confidence OCR Flow (+4 more)

### Community 116 - "6. Color System"
Cohesion: 0.17
Nodes (12): 6.10 Accessibility & Contrast Usage Rules for This Palette, 6.11 Scope 1/2/3 Visual Differentiation, 6.1 Core Surface & Text Tokens, 6.2 Layout Region Tokens, 6.3 Dashboard / KPI Tokens, 6.4 ESG Overview & BRSR Section Tokens, 6.5 Forms, Buttons & Inputs, 6.6 Tables (+4 more)

### Community 117 - "48. Key Differentiator"
Cohesion: 0.18
Nodes (11): 48. Key Differentiator, Brsr, Calculation, Data -> Report, Evidence, Evidence-First Esg Reporting, Ocr, Report (+3 more)

### Community 118 - "2.3 Non-Admin User (`/app/*`)"
Cohesion: 0.22
Nodes (9): 2.3 Non-Admin User (`/app/*`), My Organization/Project, My Submissions, Notifications, Profile, Submission History, Upload Document, User Dashboard (+1 more)

### Community 119 - "11. Component Library"
Cohesion: 0.25
Nodes (8): 11.1 Buttons, 11.2 Inputs / Controls, 11.3 Tables, 11.4 Cards, 11.5 Modals, 11.6 Drawers, 11.7 Badges / Status, 11. Component Library

### Community 120 - "6. ESG Configuration Tables"
Cohesion: 0.25
Nodes (8): 6.1 `esg_categories`, 6.2 `esg_metrics`, 6.3 `metric_field_requirements`, 6.4 `document_types`, 6.5 `document_type_metric_mappings`, 6.6 `validation_rules`, 6.7 `calculation_formulas`, 6. ESG Configuration Tables

### Community 121 - "Grill: 02_TRD.md technology stack and architecture decisions"
Cohesion: 0.25
Nodes (7): Constraints, Grill: 02_TRD.md technology stack and architecture decisions, Intent, Key decisions, Open questions, Out of scope, Surfaced assumptions

### Community 122 - "42. Data Quality Model"
Cohesion: 0.25
Nodes (8): 42. Data Quality Model, Approved, Complete, Flagged, Incomplete, Rejected, Validated, Verified

### Community 123 - "units.ts"
Cohesion: 0.48
Nodes (5): key(), normalize(), Normalized, sameQuantity(), UNITS

### Community 124 - "Grill: Phase 11 — Scope 2"
Cohesion: 0.29
Nodes (6): Constraints, Grill: Phase 11 — Scope 2, Intent, Key decisions, Out of scope, Surfaced assumptions

### Community 125 - "Grill: Phase 12 — Scope 3 foundation"
Cohesion: 0.29
Nodes (6): Constraints, Grill: Phase 12 — Scope 3 foundation, Intent, Key decisions, Out of scope, Surfaced assumptions

### Community 126 - "Grill: 03_APP_FLOW.md UX/navigation decisions"
Cohesion: 0.29
Nodes (6): Constraints, Grill: 03_APP_FLOW.md UX/navigation decisions, Intent, Key decisions, Out of scope, Surfaced assumptions

### Community 127 - "Grill: 05_BACKEND_SCHEMA.md structural decisions"
Cohesion: 0.29
Nodes (6): Constraints, Grill: 05_BACKEND_SCHEMA.md structural decisions, Intent, Key decisions, Out of scope, Surfaced assumptions

### Community 128 - "Grill: 06_IMPLEMENTATION_PLAN.md structure decisions"
Cohesion: 0.29
Nodes (6): Constraints, Grill: 06_IMPLEMENTATION_PLAN.md structure decisions, Intent, Key decisions, Out of scope, Surfaced assumptions

### Community 129 - "Grill: 04_UI_UX_DESIGN_BRIEF.md design-system decisions"
Cohesion: 0.29
Nodes (6): Constraints, Grill: 04_UI_UX_DESIGN_BRIEF.md design-system decisions, Intent, Key decisions, Out of scope, Surfaced assumptions

### Community 130 - "validation-queue-table.tsx"
Cohesion: 0.31
Nodes (7): reviewRecordAction(), formatDateTime(), problemTypes(), ValidationQueueTable(), decide(), ConfirmDialog(), NativeSelect()

### Community 131 - "Application Flow Document (App Flow)"
Cohesion: 0.33
Nodes (5): 0. UX Decisions This Document Makes (read first), 1. Application Model & Navigation Shell, 3. Global States (apply across pages, not repeated per-page above), Application Flow Document (App Flow), PS-08 — Evidence-First ESG/BRSR Reporting Platform (TraceESG)

### Community 132 - "5. Core User Journeys"
Cohesion: 0.33
Nodes (6): 5. Core User Journeys, Journey 1 — Project Manager uploads a diesel invoice and obtains a Scope 1 calculation, Journey 2 — Project Manager uploads an electricity bill and obtains a Scope 2 calculation, Journey 3 — HR uploads workforce evidence and verifies extracted information, Journey 4 — Admin monitors project submissions and generates a consolidated BRSR/ESG report, Journey 5 — Admin drills down from a reported value to the original supporting document

### Community 133 - "12. Core Feature Components"
Cohesion: 0.33
Nodes (6): 12.1 Upload Component, 12.2 OCR Verification Component — *critical, detailed spec*, 12.3 Evidence/Document Viewer, 12.4 Validation Result Component, 12.5 Approval Component, 12. Core Feature Components

### Community 134 - "13. Dashboard & Data Components"
Cohesion: 0.33
Nodes (6): 13.1 Dashboard KPI Cards — exact recommended set, 13.2 Charts, 13.3 Filters, 13.4 Search, 13.5 Drill-down Navigation, 13. Dashboard & Data Components

### Community 135 - "3. Identity & Access Tables"
Cohesion: 0.33
Nodes (6): 3.1 `users` (application profile, extends `auth.users`), 3.2 `roles`, 3.3 `permissions`, 3.4 `role_permissions`, 3.5 `user_org_assignments`, 3. Identity & Access Tables

### Community 136 - "9. ESG Records & Lifecycle Tables"
Cohesion: 0.33
Nodes (6): 9.1 `esg_records` — the canonical record, 9.2 `esg_record_documents`, 9.3 `verifications`, 9.4 `validation_results`, 9.5 `approvals`, 9. ESG Records & Lifecycle Tables

### Community 137 - "15. System States"
Cohesion: 0.40
Nodes (5): 15.1 Loading States, 15.2 Empty States, 15.3 Error States, 15.4 Confirmation States, 15. System States

### Community 138 - "10. Calculations & Conversion Factors"
Cohesion: 0.40
Nodes (5): 10.1 `conversion_factors`, 10.2 `conversion_factor_versions`, 10.3 `calculations`, 10.4 `calculation_inputs`, 10. Calculations & Conversion Factors

### Community 139 - "16. Authentication & Authorization Model"
Cohesion: 0.40
Nodes (5): 16.1 Authentication, 16.2 Authorization architecture, 16.3 Representative RLS Policies, 16.4 Non-RLS server-side rules, 16. Authentication & Authorization Model

### Community 140 - "20. Optional: API Resource Mapping, Query Patterns, Transactions, Concurrency"
Cohesion: 0.40
Nodes (5): 20.1 API resource mapping (tRPC procedure groups → tables, per `02_TRD.md` §22), 20.2 Example query pattern — Journey 5 drill-down, 20.3 Transaction boundaries, 20.4 Concurrency considerations, 20. Optional: API Resource Mapping, Query Patterns, Transactions, Concurrency

### Community 141 - "8. Documents & OCR Tables"
Cohesion: 0.40
Nodes (5): 8.1 `documents`, 8.2 `ocr_jobs`, 8.3 `ocr_extractions`, 8.4 `ocr_fields`, 8. Documents & OCR Tables

### Community 142 - "15. Scope 1"
Cohesion: 0.40
Nodes (5): 15. Scope 1, - Cng., - Lng., - Lpg., Ocr

### Community 143 - "9. Data Submission Model"
Cohesion: 0.40
Nodes (5): 9. Data Submission Model, - Jpg/Jpeg., - Pdf., - Png., Upload Document

### Community 144 - "2. Complete Page Inventory"
Cohesion: 0.50
Nodes (4): 2.1 Public, 2. Complete Page Inventory, Forgot/Reset Password, Login

### Community 145 - "11. BRSR Tables"
Cohesion: 0.50
Nodes (4): 11.1 `brsr_sections`, 11.2 `brsr_indicators`, 11.3 `brsr_metric_mappings`, 11. BRSR Tables

### Community 146 - "19. Triggers/Events"
Cohesion: 0.50
Nodes (4): 19.1 `updated_at` maintenance, 19.2 What is deliberately **not** a trigger, 19.3 The one exception: conversion factor immutability guard, 19. Triggers/Events

### Community 147 - "22. Evidence-First Record Structure"
Cohesion: 0.50
Nodes (4): 22. Evidence-First Record Structure, 2,500 L, 2,500 L, Passed

### Community 148 - "38. Api / Backend Concept"
Cohesion: 0.50
Nodes (4): 38. Api / Backend Concept, Brsr:, Esg:, Ocr:

### Community 149 - "9. Role And Permission Matrix"
Cohesion: 0.50
Nodes (4): 9. Role And Permission Matrix, - Ehs., - Esg., - Hr.

### Community 150 - "14. Notifications & Settings"
Cohesion: 0.67
Nodes (3): 14.1 `notifications`, 14.2 `org_settings`, 14. Notifications & Settings

### Community 151 - "22. Submission/Approval Status."
Cohesion: 0.67
Nodes (3): 22. Submission/Approval Status., P1 - SHOULD HAVE, P2 - FUTURE

### Community 152 - "25. Conversion Factor Engine"
Cohesion: 0.67
Nodes (3): 25. Conversion Factor Engine, - Cng., - Lpg.

### Community 153 - "27. Unit Normalization"
Cohesion: 0.67
Nodes (3): 27. Unit Normalization, 2.5 Kl, 2.5 Kl -> 2,500 L

### Community 154 - "44. Practical Hackathon Implementation Strategy"
Cohesion: 0.67
Nodes (3): 44. Practical Hackathon Implementation Strategy, - Hr., Ocr

### Community 155 - "4. User Access Model"
Cohesion: 0.67
Nodes (3): 4. User Access Model, A. Admin Dashboard, B. Non-Admin / Role-Based User Dashboard

### Community 177 - "roles.ts"
Cohesion: 0.40
Nodes (5): permissionProcedure(), badRequest(), roleManage, RoleMatrix, rolesRouter

## Knowledge Gaps
- **877 isolated node(s):** `printWidth`, `metadata`, `VersionValues`, `STATUS`, `ActivityType` (+872 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1044 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **49 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PS-08 ESG/BRSR Reporting Portal` connect `PS-08 ESG/BRSR Reporting Portal` to `15. Scope 1`, `9. Data Submission Model`, `22. Evidence-First Record Structure`, `38. Api / Backend Concept`, `9. Role And Permission Matrix`, `22. Submission/Approval Status.`, `25. Conversion Factor Engine`, `27. Unit Normalization`, `44. Practical Hackathon Implementation Strategy`, `4. User Access Model`, `12. Ocr Design Principles`, `14. Common Esg Data Model`, `14. Project Roadmap`, `16. Scope 2`, `18. Hr Module`, `19. Ehs / Environment Module`, `20. Procurement Module`, `32. Admin Report Drill-Down`, `43. Mvp Priority`, `8. User Dashboard`, `45. Demo Scenario`, `51. Final System Summary`, `30. Approval Workflow`, `1. Project Objective`, `48. Key Differentiator`, `42. Data Quality Model`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `Button()` connect `button.tsx` to `runAction`, `createSupabaseServerClient`, `validation-queue-table.tsx`, `ocr-jobs-table.tsx`, `verification.ts`, `app/app/page.tsx`, `notification-bell.tsx`, `documents.ts`, `factors-manager.tsx`, `[documentId]/page.tsx`, `org-manager.tsx`, `forgot-password-form.tsx`, `top-bar.tsx`, `scope-dashboard.tsx`, `periods-manager.tsx`, `roles-manager.tsx`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `runAction()` connect `runAction` to `validation-queue-table.tsx`, `ocr-jobs-table.tsx`, `verification.ts`, `trpc/server.ts`, `button.tsx`, `notification-bell.tsx`, `documents.ts`, `factors-manager.tsx`, `org-manager.tsx`, `forgot-password-form.tsx`, `periods-manager.tsx`, `roles-manager.tsx`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `printWidth`, `metadata`, `VersionValues` to the rest of the system?**
  _877 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `createSupabaseServerClient` be split into smaller, more focused modules?**
  _Cohesion score 0.07402031930333818 - nodes in this community are weakly interconnected._
- **Should `verification.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.054212454212454214 - nodes in this community are weakly interconnected._
- **Should `WorkerHarnessTest` be split into smaller, more focused modules?**
  _Cohesion score 0.10938775510204081 - nodes in this community are weakly interconnected._