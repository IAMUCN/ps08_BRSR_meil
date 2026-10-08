# Graph Report - BRSR_MEIL  (2026-10-09)

## Corpus Check
- 396 files · ~274,836 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 13 file(s) not represented in the graph (top: (none) 8, .example 2, .toml 2)

## Summary
- 2178 nodes · 5682 edges · 162 communities (118 shown, 40 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 90 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e74b7214`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- verify-workspace.tsx
- bundles.ts
- samples.py
- processor.py
- readiness-tree.tsx
- organization.ts
- db
- Phase 6 OCR Integration Decisions
- react
- organization/actions.ts
- root.ts
- theme.ts
- records.ts
- requireAdminSession
- verification.ts
- session.ts
- brsr.ts
- extract_fields
- db.py
- split_pages
- fields.py
- calculation/engine.ts
- lucide-react
- verify/[documentId]/page.tsx
- ValidationQueueTable
- SEBI BRSR Reporting Format (Annexure 1)
- profile.ts
- dependencies
- setup
- checks.ts
- createSupabaseServerClient
- scope-dashboard.tsx
- trpc/server.ts
- components.json
- api
- login/page.tsx
- scripts
- record-drawer.tsx
- web/package.json
- compilerOptions
- test_extraction.py
- validation-queue-table.tsx
- totals.ts
- sql
- scenario-f-activities.mjs
- lib.mjs
- FactorsManager
- provision-user.ts
- GitHub Actions CI Pipeline
- reporting-periods/actions.ts
- reporting-periods.ts
- scripts
- App Flow Deviation Registry
- html.ts
- scenario-d-report.mjs
- shared-types/package.json
- Phase 4 Admin Foundation Decisions
- factors-manager.tsx
- roles/actions.ts
- Backend Schema Deviation Registry
- xlsx.ts
- devDependencies
- Shared Password Policy Module
- Immutable Report Snapshot Lineage
- brsr-mapping/actions.ts
- OrgUnitBulkImport
- compilerOptions
- Scope 3 Active Categories
- PART I — STRUCTURED KT CONTEXT
- TraceESG Implementation Progress Tracker
- authorization.mjs
- Session
- scenario-a-scope1.mjs
- TraceESG Evidence-First ESG Platform
- Metric-Specific Consolidation Rules
- [trpc]/route.ts
- Phase 18 Security Review Audit
- DISCOM Electricity Extraction Rules
- admin/page.tsx
- Evidence-First Data Collection Model
- Row-Level Import Transactions
- BRSR Readiness Tree Drill-Down
- App-Level Rate Limiting
- admin/loading.tsx
- consolidation.ts
- run.mjs
- TraceESG Target Personas and Roles
- BRSR Core Framework
- Phase 1 Project Setup Decisions
- runAction
- A23: Multi-Bill PDF OCR Propose and Split Flow
- TraceESG Architecture and Overview
- Graphify Knowledge Graph Rule
- Configurable Multi-Entity Organization Hierarchy
- Three Themes Shared UX Structure Decision
- createSupabaseAdminClient
- Eight Core Product Principles
- Evidence-to-BRSR Digital Thread
- Deterministic TypeScript Calculation Engine
- Postgres-Backed Document Job Queue
- esg_record_documents Many-to-Many Join Table
- Responsive Collapsible Sidebar
- OCR Worker Runtime Dependencies
- extraction/__init__.py
- Next.js 16 Agent Rules
- eslint.config.mjs
- postcss.config.mjs
- .prettierrc.json
- Feature and UI Dual Role Development Protocol
- Corporate ESG Approval Queue Flow
- OCR Extraction Verification Flow
- Scope 1 2 3 Iconography and Color Hierarchy
- Accessible Status Color Token System
- BRSR Mapping Tables (brsr_sections, brsr_indicators, brsr_metric_mappings)
- conversion_factors and conversion_factor_versions Tables
- Immutable Append-Only Lifecycle Tables
- Two-Track A/B Build Architecture
- Pragmatic Testing Rigor Strategy
- Corporate ESG Approval Route
- Operational Traps and Guardrails
- pnpm Monorepo Workspace Configuration
- Project Open Items and Blockers
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
- Split Hosting Vercel and Render Decision
- Supabase Managed Platform Decision
- Per-User Theme Preference Decision
- Tailwind CSS and shadcn/ui Implementation Vehicle Decision
- Hierarchical Multi-Level Consolidation Engine
- documents.ts
- edge-cases.mjs
- UploadForm
- confirm-dialog.tsx
- org-units/bulk-import/page.tsx
- Grill: Closing the second audit (2026-10-08)
- SplitReview
- Audit fixes — work queue
- LevelsCard
- ocr-monitoring/page.tsx
- ApprovalQueue
- Grill: Audit fixes P0-1 to P0-3 (factors, SEBI-format report, 2023 indicator codes)
- Grill: Audit fixes P2
- audit-view.tsx
- Grill: Audit fixes P1 (Scope 1 and 3 activities, travel by mode, hierarchy in the database)
- Agentation
- route-error.tsx
- page-feedback-2026-10-09-decisions.md
- instrumentation.ts
- Grill: Audit fixes P3
- generateReportAction

## God Nodes (most connected - your core abstractions)
1. `runAction()` - 83 edges
2. `db()` - 71 edges
3. `lucide-react` - 65 edges
4. `api()` - 58 edges
5. `react` - 54 edges
6. `server-only` - 45 edges
7. `Button()` - 44 edges
8. `writeAudit()` - 43 edges
9. `requireAdminSession()` - 42 edges
10. `extract_fields()` - 37 edges

## Surprising Connections (you probably didn't know these)
- `System Edge Case Test Matrix` --conceptually_related_to--> `Phase 18 Security Review Audit`  [INFERRED]
  QA_CHECKLIST.md → SECURITY_REVIEW.md
- `TraceESG Core Architecture Principles` --rationale_for--> `D1: Server-Only Lifecycle Writes`  [INFERRED]
  PROGRESS.md → supabase/SCHEMA_DEVIATIONS.md
- `Feature and UI Dual Role Development Protocol` --conceptually_related_to--> `Phase-by-Phase Development Protocol`  [INFERRED]
  CLAUDE.md → PROGRESS.md
- `Pull Request Validation Gates` --references--> `GitHub Actions CI Pipeline`  [INFERRED]
  CLAUDE.md → .github/workflows/ci.yml
- `CI Database Migration and pgTAP Job` --references--> `Local Supabase and Migration Workflow`  [INFERRED]
  .github/workflows/ci.yml → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **BRSR Core Verification and Assurance Ecosystem** — ps_documents_provided_docs_brsr_faqs_25012025_brsr_core_framework, ps_documents_provided_docs_brsr_faqs_25012025_reasonable_assurance_mandate, ps_documents_provided_docs_background_material_on_sustainability_business_responsibility_sustainability_reporting_brsr_revised_edition_2024_icai_ssa_3000_assurance_standards, ps_documents_provided_docs_brsr_faqs_25012025_value_chain_partners_disclosure [EXTRACTED 1.00]
- **SEBI BRSR Regulatory Architecture and Governance** — ps_documents_provided_docs_business_responsibility_and_sustainability_reporting_by_listed_entitiesannexure1_p_sebi_brsr_format_circular, ps_documents_provided_docs_business_responsibility_and_sustainability_reporting_by_listed_entitiesannexure2_p_sebi_brsr_guidance_note, ps_documents_provided_docs_brsr_faqs_25012025_brsr_applicability_top_1000, ps_documents_provided_docs_background_material_on_sustainability_business_responsibility_sustainability_reporting_brsr_revised_edition_2024_ngrbc_nine_principles [EXTRACTED 1.00]
- **Evidence-to-BRSR Digital Thread Pipeline** — ps_documents_implementation_docs_master_approach_evidence_first_pipeline, ps_documents_implementation_docs_05_backend_schema_canonical_esg_records, ps_documents_implementation_docs_01_prd_evidence_to_brsr_digital_thread, ps_documents_implementation_docs_02_trd_evidence_lineage_traceability [EXTRACTED 1.00]
- **Human-in-the-Loop OCR Extraction and Verification Flow** — _grill_phase_2b_ocr_worker_decisions_deterministic_extraction, _grill_phase_6_ocr_integration_decisions_worker_notification_dispatch, _grill_phase_7_ocr_verification_decisions_verification_guard_rail [EXTRACTED 1.00]
- **Multi-Bill PDF Ingestion and Split Architecture** — context_multi_bill_pdf_support, apps_web_app_flow_deviations_a23_multi_bill_pdf_split, supabase_schema_deviations_d24_multi_bill_bundle_schema [EXTRACTED 1.00]
- **Multi-Level Hierarchical Authorization Model** — ps_documents_implementation_docs_01_prd_configurable_org_hierarchy, ps_documents_implementation_docs_02_trd_rls_authorization_architecture, ps_documents_implementation_docs_05_backend_schema_user_org_assignments_table, ps_documents_implementation_docs__grill_backend_schema_decisions_hierarchical_org_scope_inheritance [EXTRACTED 1.00]
- **Two-Track Decoupled OCR Architecture** — ps_documents_implementation_docs__grill_implementation_plan_decisions_two_track_implementation_structure, ps_documents_implementation_docs__grill_trd_tech_stack_self_hosted_paddleocr_decision, ps_documents_implementation_docs_02_trd_postgres_job_queue [EXTRACTED 1.00]
- **Authentication and Identity Defense-in-Depth** — _grill_phase_3_auth_decisions_three_layer_deactivation, _grill_password_policy_decisions_password_policy_enforcement, _grill_phase_18_audit_security_decisions_app_level_rate_limiting, _grill_bulk_import_decisions_otp_password_reset [INFERRED 0.85]
- **BRSR Evidence to Report Lineage Pipeline** — _grill_phase_13_role_modules_decisions_single_document_derived_metrics, _grill_phase_14_brsr_mapping_decisions_brsr_readiness_tree, _grill_phase_15_consolidation_decisions_metric_type_consolidation_rules, _grill_phase_17_reporting_decisions_report_snapshot_lineage [INFERRED 0.85]
- **CI Pipeline and End-to-End Test Suite Verification** — _github_workflows_ci_ci_pipeline, qa_checklist_critical_e2e_scenarios, readme_test_suites [INFERRED 0.85]
- **Corporate Sustainability Disclosure and Implementation** — ps_documents_provided_docs_l_t_brsr_report_fy2025_26_lnt_corporate_brsr_report, ps_documents_provided_docs_l_t_brsr_report_fy2025_26_lnt_energy_and_ghg_emissions_profile, ps_documents_provided_docs_business_responsibility_and_sustainability_reporting_by_listed_entitiesannexure2_p_ghg_emissions_calculation_guidance, ps_documents_provided_docs_business_responsibility_and_sustainability_report_corporate_esg_roadmap_readiness [INFERRED 0.85]
- **Multi-Bill and OCR Ingestion Pipeline** — _grill_multi_bill_pdf_decisions_bundle_document_model, _grill_multi_bill_pdf_decisions_bundle_proposal_classification, _grill_ocr_real_bills_decisions_discom_electricity_rules, _grill_ocr_real_bills_decisions_water_withdrawal_rule [INFERRED 0.85]
- **Server-Side Write Boundary and Privilege Hardening** — progress_core_architecture_rules, security_review_append_only_audit_log_trigger, supabase_schema_deviations_d1_server_only_lifecycle_writes, supabase_schema_deviations_d6_privilege_hardening [INFERRED 0.95]
- **Server-Only Transactional Security Architecture** — _grill_phase_2_database_decisions_server_only_lifecycle_writes, _grill_phase_4_admin_foundation_decisions_three_lockout_guards [INFERRED 0.95]

## Communities (162 total, 40 thin omitted)

### Community 0 - "verify-workspace.tsx"
Cohesion: 0.10
Nodes (33): checkInvoiceDuplicatesAction(), confirmManualEntryAction(), confirmVerificationAction(), rejectDocumentAction(), revalidateWorkspace(), setDocumentTypeAction(), OUTCOME_ICON, confidenceLabel() (+25 more)

### Community 1 - "bundles.ts"
Cohesion: 0.13
Nodes (18): BUNDLE_MAX_PAGES, BundlePartInput, checkBundleParts(), MAX_BUNDLE_PARTS, pagesLabel(), extractPages(), pdfPageCount(), BundleCreated (+10 more)

### Community 2 - "samples.py"
Cohesion: 0.09
Nodes (43): main(), make(), Write one synthetic PDF of several different bills, one page each, to test…, main(), Write a synthetic fuel invoice or electricity bill PDF with a fresh number, for…, WorkerHarnessTest, all_samples(), blank_png() (+35 more)

### Community 3 - "processor.py"
Cohesion: 0.07
Nodes (42): main(), Download the pinned PaddleOCR model weights from the Hugging Face Hub into…, Phase 2B standalone harness: seed documents + jobs directly (SQL + Storage),…, _load_dotenv(), load_settings(), Path, Worker settings from the environment (02_TRD.md §33). Values come from the…, Minimal KEY=VALUE loader; real environment variables always win. (+34 more)

### Community 4 - "readiness-tree.tsx"
Cohesion: 0.15
Nodes (16): reportedRecordAction(), ReportView(), openRecord(), Selected, valueText(), ReadinessTree(), TONE, valueOf() (+8 more)

### Community 5 - "organization.ts"
Cohesion: 0.08
Nodes (50): OrgManager(), renderNode(), select(), RoleScopeFields(), PASSWORD_MIN_LENGTH, pgErrorCode(), UploadAssignment, UploadCategory (+42 more)

### Community 6 - "db"
Cohesion: 0.15
Nodes (17): db(), expireStaleRuns(), finish(), notify(), ReportFailure, reportsBucket(), runReport(), STALE_MINUTES (+9 more)

### Community 7 - "Phase 6 OCR Integration Decisions"
Cohesion: 0.04
Nodes (48): Phase 10 Scope 1 Decisions, Evidence Lineage Drilldown Architecture, Scope 1 Fuel Metrics Configuration, Approved-Only Headline Consolidation, Zero Placeholder Factor Policy, Strict Unit Grouping Rule, Phase 2 Database Decisions, Permission Catalogue and RBAC Model (+40 more)

### Community 8 - "react"
Cohesion: 0.12
Nodes (32): Editing, Impact, Pending, STATUS, Result, RoleOption, STATUS, initialRequestState (+24 more)

### Community 9 - "organization/actions.ts"
Cohesion: 0.24
Nodes (14): createOrgUnitAction(), moveOrgUnitAction(), orgExpectationsAction(), orgUnitImpactAction(), setExpectationAction(), setOrgUnitStatusAction(), updateOrgUnitAction(), ExpectationsCard() (+6 more)

### Community 10 - "root.ts"
Cohesion: 0.08
Nodes (41): adminProcedure, Context, permissionProcedure(), protectedProcedure, router, t, AuditEvent, auditRouter (+33 more)

### Community 11 - "theme.ts"
Cohesion: 0.08
Nodes (31): ADMIN_NAV, AdminLayout(), APP_NAV, WorkspaceLayout(), TraceESG App Icon, inter, jetbrainsMono, metadata (+23 more)

### Community 12 - "records.ts"
Cohesion: 0.09
Nodes (36): financialYearOf(), fraction, readiness, READINESS_COMPONENTS, ReadinessKey, count(), expectationsFrom(), MissingSubmission (+28 more)

### Community 13 - "requireAdminSession"
Cohesion: 0.13
Nodes (20): AdminApprovalQueuePage(), metadata, ConversionFactorsPage(), metadata, metadata, OrganizationPage(), AdminProfilePage(), metadata (+12 more)

### Community 14 - "verification.ts"
Cohesion: 0.09
Nodes (35): submitForApproval(), AuditEvent, jsonOrNull(), writeAudit(), ActiveSession, loadCalculations(), loadCalculationsById(), Sql (+27 more)

### Community 15 - "session.ts"
Cohesion: 0.12
Nodes (18): ApprovalsPage(), metadata, FILTERS, metadata, NotificationsPage(), metadata, WorkspaceProfilePage(), metadata (+10 more)

### Community 16 - "brsr.ts"
Cohesion: 0.14
Nodes (15): indicatorStatus, STATUS_LABEL, BrsrIndicator, BrsrMapping, brsrRouter, BrsrSection, bySection(), catalogue() (+7 more)

### Community 17 - "extract_fields"
Cohesion: 0.21
Nodes (7): DiscomThermalBillTest, ExtractFieldsTest, line(), values(), extract_fields(), FieldSpec, One `metric_field_requirements` row.

### Community 18 - "db.py"
Cohesion: 0.15
Nodes (28): _audit(), BundleType, claim_job(), ClaimedJob, complete_bundle_job(), complete_job(), _confidence_threshold(), connect() (+20 more)

### Community 19 - "split_pages"
Cohesion: 0.16
Nodes (13): lines(), page(), ProposeMetricTest, Splitting a multi-bill PDF into proposed bills (no OCR engine, no database)., spans(), SplitPagesTest, BundlePart, propose_metric() (+5 more)

### Community 20 - "fields.py"
Cohesion: 0.15
Nodes (24): _below_neighbor(), _date_on_same_row(), _find_labeled(), _find_reading_period(), _find_unit_near(), _find_utility(), _height(), _label_match() (+16 more)

### Community 21 - "calculation/engine.ts"
Cohesion: 0.14
Nodes (22): activeFormula(), activityKeyFor(), CalculationOutcome, ENGINE_VERSION, RecordRow, runCalculation(), Sql, activityInput() (+14 more)

### Community 22 - "lucide-react"
Cohesion: 0.16
Nodes (18): MarkAllReadButton(), ContextPicker(), pct(), ReadinessInfo(), ICONS, NotificationRow(), open(), relative (+10 more)

### Community 23 - "verify/[documentId]/page.tsx"
Cohesion: 0.12
Nodes (23): formatDate(), metadata, UserDashboardPage(), formatDateTime(), metadata, MySubmissionsPage(), SubmissionRow(), SubmissionRowProps (+15 more)

### Community 24 - "ValidationQueueTable"
Cohesion: 0.40
Nodes (5): reviewRecordAction(), formatDateTime(), problemTypes(), ValidationQueueTable(), decide()

### Community 25 - "SEBI BRSR Reporting Format (Annexure 1)"
Cohesion: 0.08
Nodes (25): ICAI Sustainability Reporting Standards Board Guidance, ISSB Global Sustainability Baseline Alignment, National Guidelines on Responsible Business Conduct (NGRBC) 9 Principles, UN Sustainable Development Goals (SDGs) Mapping, BRSR Applicability for Top 1000 Listed Entities, High Value Debt Listed Entities (HVD) Applicability, BRSR vs BRR Paradigm Shift, Evolution of ESG Reporting in India (+17 more)

### Community 26 - "profile.ts"
Cohesion: 0.14
Nodes (30): requestPasswordReset(), ResetRequestState, verifyOtpAndSetPassword(), VerifyOtpState, VerifyOtpForm(), signIn(), signInSchema, SignInState (+22 more)

### Community 27 - "dependencies"
Cohesion: 0.08
Nodes (25): dependencies, class-variance-authority, cn, exceljs, lucide-react, next, nodemailer, pdf-lib (+17 more)

### Community 28 - "setup"
Cohesion: 0.48
Nodes (7): authAdmin(), ensureAdmin(), ensureInvited(), newPassword(), setPassword(), setup(), userId()

### Community 29 - "checks.ts"
Cohesion: 0.13
Nodes (33): aggregate(), checkAllowedUnits(), checkBillingPeriodOverlap(), checkDuplicateInvoice(), checkDuplicatePeriod(), checkEvidence(), checkFormat(), checkHistoryRatio() (+25 more)

### Community 30 - "createSupabaseServerClient"
Cohesion: 0.12
Nodes (19): ALLOWED_TYPES, GET(), FORWARDED_REASONS, GET(), setPassword(), metadata, ResetPasswordPage(), SetPasswordForm() (+11 more)

### Community 31 - "scope-dashboard.tsx"
Cohesion: 0.33
Nodes (11): ActivityTable(), APPROVAL, approvedOf(), BranchBars(), BranchTable(), CategoryTable(), RecordTable(), TrendBars() (+3 more)

### Community 32 - "trpc/server.ts"
Cohesion: 0.14
Nodes (16): BrsrMappingPage(), metadata, metadata, ScopeOnePage(), metadata, ScopeTwoPage(), metadata, ScopeThreePage() (+8 more)

### Community 33 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 34 - "api"
Cohesion: 0.15
Nodes (18): AuditFilters(), AuditTrailPage(), date(), metadata, one(), Params, uuid(), metadata (+10 more)

### Community 35 - "login/page.tsx"
Cohesion: 0.15
Nodes (18): ForgotPasswordForm(), metadata, LoginForm(), LoginPage(), metadata, RootPage(), AuthCard(), AuthNotice() (+10 more)

### Community 36 - "scripts"
Cohesion: 0.10
Nodes (20): devDependencies, supabase, engines, node, name, packageManager, private, scripts (+12 more)

### Community 37 - "record-drawer.tsx"
Cohesion: 0.11
Nodes (22): ActionResult, Option, ParsedRow, RowsPreview(), EVENT_LABELS, queueFor(), RecordDrawer(), csvCell() (+14 more)

### Community 38 - "web/package.json"
Cohesion: 0.09
Nodes (22): renderPdf(), typescript, name, private, type, version, class-variance-authority, eslint (+14 more)

### Community 39 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 40 - "test_extraction.py"
Cohesion: 0.18
Nodes (10): ClassifyTest, FieldsNeedingAttentionTest, Pure extraction/classification rules — no PaddleOCR needed (runs in CI)., classify(), ExtractedField, fields_needing_attention(), _find_implied_unit(), kWh for a consumption read under a "units …" label when the bill prints no unit. (+2 more)

### Community 41 - "validation-queue-table.tsx"
Cohesion: 0.23
Nodes (8): STRENGTH_LABEL, STRENGTH_TEXT_TONE, STRENGTH_TONE, Result, ValidationResult(), worst(), RULE_TYPES, cn

### Community 42 - "totals.ts"
Cohesion: 0.21
Nodes (11): ActivityTotal, gapOf(), ScopeBranch, scopeBreakdown, ScopeCategory, ScopeRecord, scopeTree(), Sql (+3 more)

### Community 43 - "sql"
Cohesion: 0.33
Nodes (11): prepare(), auditCount(), ensureFactors(), metricId(), one(), openPeriodId(), orgId(), roleId() (+3 more)

### Community 44 - "scenario-f-activities.mjs"
Cohesion: 0.12
Nodes (19): ACCOUNTS, close(), currentCalculation(), recordOf(), runWorker(), runWorkerOnce(), sample(), validationResults() (+11 more)

### Community 45 - "lib.mjs"
Cohesion: 0.12
Nodes (18): bundleFile, APP, check(), env, finish(), HERE, rejected(), REPO (+10 more)

### Community 46 - "FactorsManager"
Cohesion: 0.22
Nodes (12): addFactorVersionAction(), createFactorAction(), renameFactorAction(), setFactorGasesAction(), setFactorVersionStatusAction(), VersionValues, current(), FactorsManager() (+4 more)

### Community 47 - "provision-user.ts"
Cohesion: 0.17
Nodes (14): activeAdminUserIds(), assignedByEmail, displayName, email, existing, fail(), orFail(), orgCode (+6 more)

### Community 48 - "GitHub Actions CI Pipeline"
Cohesion: 0.20
Nodes (10): GitHub Actions CI Pipeline, CI Database Migration and pgTAP Job, CI OCR Worker Ruff and Unit Tests Job, CI Web Job, Pull Request Validation Gates, Hardware Memory and Port Constraints, Local Supabase and Migration Workflow, OCR Worker Python and Model Architecture (+2 more)

### Community 49 - "reporting-periods/actions.ts"
Cohesion: 0.24
Nodes (10): createPeriodAction(), transitionPeriodAction(), updatePeriodWindowAction(), CreatePeriodSheet(), onSubmit(), formatDate(), PeriodsManager(), transition() (+2 more)

### Community 50 - "reporting-periods.ts"
Cohesion: 0.23
Nodes (11): checkPeriodDates(), checkTransition(), PeriodDates, PeriodStatus, TransitionCheck, badRequest(), isoDate, optionalIsoDate (+3 more)

### Community 51 - "scripts"
Cohesion: 0.15
Nodes (13): scripts, build, calculate-pending, dev, format, format:check, lint, provision-user (+5 more)

### Community 52 - "App Flow Deviation Registry"
Cohesion: 0.18
Nodes (12): A10: Approval Step Pulled Forward to Phase 8, A11: Missing Factor Queue Blocking Behavior, A17: Control Tower Consistent Predicate Drilldown, A19: WCAG AA Color Contrast Adjustments, A1: Corporate ESG Approvals Route Split, A20: In-Browser XLSX Bulk Import Workflow, A3: Next.js Proxy vs Data Access Layer Separation, A8: OCR Verify Extraction Guards and Manual Exceptions (+4 more)

### Community 53 - "html.ts"
Cohesion: 0.06
Nodes (80): reportInputsAction(), saveReportInputsAction(), ReportInputsForm(), changeYear(), submit(), Figure, Method, accountCreatedEmailHtml() (+72 more)

### Community 54 - "scenario-d-report.mjs"
Cohesion: 0.13
Nodes (8): diesel, inputs, liveScope1, pdf, reported, scenarios, started, wasteTotal

### Community 55 - "shared-types/package.json"
Cohesion: 0.17
Nodes (11): devDependencies, typescript, typescript, main, name, private, scripts, typecheck (+3 more)

### Community 56 - "Phase 4 Admin Foundation Decisions"
Cohesion: 0.18
Nodes (11): Clean-State Test Provisioning, Curated E2E Regression Suite, pgTAP Database CI Integration, Synthetic Document Testing Principle, Three-Layer Account Deactivation, Phase 4 Admin Foundation Decisions, Frozen Deactivated Organization Node Policy, Guidance Submission Windows Schema Deviation (+3 more)

### Community 57 - "factors-manager.tsx"
Cohesion: 0.12
Nodes (19): ActivityType, FactorSheet(), STATUS, SubmitInput, ocrJobFieldsAction(), retryOcrJobAction(), Band, formatDateTime() (+11 more)

### Community 58 - "roles/actions.ts"
Cohesion: 0.33
Nodes (8): createRoleAction(), deleteRoleAction(), setRolePermissionsAction(), CreateRoleSheet(), onSubmit(), RolePermissions(), onSubmit(), run()

### Community 59 - "Backend Schema Deviation Registry"
Cohesion: 0.20
Nodes (11): A18: Report Snapshot and Evidence Breadcrumb Drilldown, D11: OCR Worker Restricted Direct DB Writes, D14: Percentage Formula Type Addition, D16: Configurable Submission Expectations Table, D17: Financial Year Reporting Support in Report Runs, D18: Result vs Activity Quantity Reporting in BRSR, D22: Hashed 6-Digit Password Reset OTPs, D4: Scoped Client Write on Notifications is_read (+3 more)

### Community 60 - "xlsx.ts"
Cohesion: 0.25
Nodes (9): downloadEmployeeTemplate(), downloadOrgUnitTemplate(), downloadWorkbook(), EMPLOYEE_HEADERS, ORG_UNIT_HEADERS, sheetWithReference(), triggerDownload(), exceljs (+1 more)

### Community 61 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, agentation, eslint, eslint-config-next, prettier, tailwindcss, @tailwindcss/postcss, @types/node (+4 more)

### Community 62 - "Shared Password Policy Module"
Cohesion: 0.20
Nodes (10): Brevo SMTP Delivery, Bulk Default Password Generator, OTP Password Reset Flow, Default Password Policy Guarantee, Universal Password Policy Enforcement, Shared Password Policy Module, Password Strength Meter Component, Supabase Auth Password Config (+2 more)

### Community 63 - "Immutable Report Snapshot Lineage"
Cohesion: 0.20
Nodes (10): CSR Section A Mapping, SEBI BRSR Annexure I Catalogue, Headless Chromium PDF Generation, Mandatory BRSR Indicator Enforcement, Immutable Report Snapshot Lineage, Report Value Type Mapping, Append-Only Audit Log Trigger, Record Lifecycle Audit Trail (+2 more)

### Community 64 - "brsr-mapping/actions.ts"
Cohesion: 0.38
Nodes (6): removeMappingAction(), saveMappingAction(), MappingSheet(), submit(), MappingTable(), remove()

### Community 65 - "OrgUnitBulkImport"
Cohesion: 0.31
Nodes (8): EmployeeBulkImport(), onDownloadResults(), onFile(), OrgUnitBulkImport(), onDownloadResults(), onFile(), downloadCsv(), parseSheetRows()

### Community 66 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, isolatedModules, module, moduleResolution, noEmit, skipLibCheck, strict, target (+1 more)

### Community 67 - "Scope 3 Active Categories"
Cohesion: 0.22
Nodes (9): Admin Scope 2 Dashboard Page, Scope Dashboard Activity Breakdown, Category Role Ownership Model, Scope 3 Active Categories, Recursive Scope Rollup Query, Spend-Based Business Travel, Weight-Based Operational Waste, Consolidation Query API (+1 more)

### Community 68 - "PART I — STRUCTURED KT CONTEXT"
Cohesion: 0.07
Nodes (26): 10. Data Model Design Expectations, 11. Data Volume, Frequency and Financial-Year Handling, 12. AI Position in the Solution, 13. Reporting Requirements, 14. Travel / Scope 3 Clarification from Q&A, 15. UI/UX, Validation and Evaluation Expectations, 16. Evaluation Data and Staging, 17. Real-World Adoption Context Mentioned by Industry (+18 more)

### Community 69 - "TraceESG Implementation Progress Tracker"
Cohesion: 0.25
Nodes (9): A6: Pre-Validation and Server-Issued Uploads, Claude Agent Working Brief, TraceESG Live Working State, TraceESG Core Architecture Principles, Phase 21 Deployment Readiness Plan, 20-Phase Implementation Matrix, TraceESG Implementation Progress Tracker, D2: Server-Only Configuration Writes (+1 more)

### Community 70 - "authorization.mjs"
Cohesion: 0.16
Nodes (12): adminOnly, anon, ensureUnit(), farPm, goneSession, token, uploads, ok() (+4 more)

### Community 72 - "scenario-a-scope1.mjs"
Cohesion: 0.17
Nodes (9): before, bytes, invoice, monitored, personal, row, subsidiary, supporting (+1 more)

### Community 73 - "TraceESG Evidence-First ESG Platform"
Cohesion: 0.25
Nodes (9): TraceESG Evidence-First ESG Platform, TRD Core Architecture Principles, TraceESG Recommended Technology Stack, Admin Control Tower Command Center, Single Organization Tree No Tenant ID Decision, PS-08 Master System Blueprint v1.0, Dr. P. Ravi Reddy (MEIL Director) Video Briefing, MEIL Conglomerate Operational Scale & Complexity (+1 more)

### Community 74 - "Metric-Specific Consolidation Rules"
Cohesion: 0.32
Nodes (8): Water Consumption to Withdrawal Mapping, Configurable Not-Greater-Than Validation, Percentage Formula Type, Role-Specific Non-Emission Metrics, Single-Document Derived Metrics, Subtract Formula Type, Indian Financial Year Consolidation Boundary, Metric-Specific Consolidation Rules

### Community 75 - "[trpc]/route.ts"
Cohesion: 0.43
Nodes (5): handler(), sameOriginRequest(), createTRPCContext(), AppRouter, req()

### Community 76 - "Phase 18 Security Review Audit"
Cohesion: 0.36
Nodes (8): F2 Append-Only Database Audit Log Trigger, F3 tRPC Mutation Origin CSRF Verification, Phase 18 Security Review Audit, F1 Per-Account and Per-IP Sign-in Throttling, F8 Supabase Auth Per-IP Deployment Action, F4 Document Upload Rate Limiting, F7 Two-Hour Signed Upload URL Accepted Risk, D19: Rate Limit Table and Append-Only Audit Trigger

### Community 77 - "DISCOM Electricity Extraction Rules"
Cohesion: 0.29
Nodes (7): Bundle Proposal Classification Engine, Split Review Screen, DISCOM Electricity Extraction Rules, DISCOM Utility Name Matching, Implied kWh Unit Rule, Renewable Electricity Metric, Zero Conversion Factor Allowance

### Community 78 - "admin/page.tsx"
Cohesion: 0.16
Nodes (13): DataExplorerPage(), metadata, AdminDashboardPage(), Card, metadata, metadata, QUEUE, SubmissionMonitoringPage() (+5 more)

### Community 79 - "Evidence-First Data Collection Model"
Cohesion: 0.29
Nodes (7): Evidence-First Data Collection Model, Evidence Document Upload Journey, Defensibility-First UI/UX Philosophy, Canonical esg_records Table, 21-Phase Sequential and Parallel Roadmap, Async OCR Non-Blocking UX Decision, Master Evidence-First Pipeline Blueprint

### Community 80 - "Row-Level Import Transactions"
Cohesion: 0.33
Nodes (6): Bulk Import Permissions, Client-Side XLSX Parsing, Row-Level Import Transactions, Bundle Document Model, Bundle Upload Guardrails, Server-Side PDF Page Cutting

### Community 81 - "BRSR Readiness Tree Drill-Down"
Cohesion: 0.33
Nodes (6): BRSR Readiness Tree Drill-Down, Mapping Applicability Flag, BRSR Readiness Composite Score, Completion Pipeline KPIs, Submission Expectations Model, URL-Driven Filter Context

### Community 82 - "App-Level Rate Limiting"
Cohesion: 0.40
Nodes (6): App-Level Rate Limiting, tRPC Origin CSRF Protection, User-Stored Theme Preference, WCAG Contrast Token Adjustments, Theme-2 Corporate Default Selection, TopBar Theme Toggle Component

### Community 84 - "consolidation.ts"
Cohesion: 0.15
Nodes (22): consolidate(), Consolidated, financialYearLabel(), financialYearRange(), InputRow, MetricInfo, ratio(), ValueRow (+14 more)

### Community 85 - "run.mjs"
Cohesion: 0.33
Nodes (4): ALL, HERE, problems, results

### Community 86 - "TraceESG Target Personas and Roles"
Cohesion: 0.33
Nodes (6): TraceESG Target Personas and Roles, Route Namespace Model (/admin and /app), user_org_assignments Table, Master Seven Role Access Model, TraceESG Account Invitation Email Template, TraceESG Password Reset Email Template

### Community 87 - "BRSR Core Framework"
Cohesion: 0.33
Nodes (6): BRSR Comprehensive, Lite and Core Architecture, ICAI Standards on Sustainability Assurance (SSA 3000), BRSR Core Framework, Reasonable Assurance Mandate for BRSR Core, Value Chain Partners Disclosures, Corporate ESG Roadmap and Assurance Readiness

### Community 88 - "Phase 1 Project Setup Decisions"
Cohesion: 0.40
Nodes (5): Corepack Pinned pnpm Decision, Phase 1 Project Setup Decisions, PaddleOCR Python 3.12 Worker Runtime, Next.js 16 and Tailwind v4 Stack Selection, Three-Theme Data-Theme Architecture

### Community 89 - "runAction"
Cohesion: 0.32
Nodes (13): addAssignmentAction(), deactivateUserAction(), deleteUserAction(), inviteUserAction(), reactivateUserAction(), resendInviteAction(), revokeAssignmentAction(), InviteSheet() (+5 more)

### Community 90 - "A23: Multi-Bill PDF OCR Propose and Split Flow"
Cohesion: 0.50
Nodes (5): A23: Multi-Bill PDF OCR Propose and Split Flow, DISCOM Bill and Water OCR Rules Context, Multi-Bill PDF Document Handling Context, Out-of-Sequence Completed Features Status, D24: Multi-Bill PDF Bundle and Split Schema

### Community 91 - "TraceESG Architecture and Overview"
Cohesion: 0.25
Nodes (9): A22: Password Policy and Live Strength Meter, Critical E2E Scenarios (A-E), System Edge Case Test Matrix, QA Identifier and Offline Recovery Findings, Phase 20 Quality Assurance Checklist, TraceESG Architecture and Overview, User Provisioning and Access Security, Monorepo Workspace Structure (+1 more)

### Community 92 - "Graphify Knowledge Graph Rule"
Cohesion: 0.50
Nodes (4): Graphify Query and Traversal Rule, Graphify Knowledge Graph Rule, Graphify AST Update Rule, Graphify Workflow

### Community 93 - "Configurable Multi-Entity Organization Hierarchy"
Cohesion: 0.50
Nodes (4): Configurable Multi-Entity Organization Hierarchy, Postgres RLS Database-Layer Authorization, org_units Recursive Hierarchy Table, Master Seven Level Organizational Model

### Community 94 - "Three Themes Shared UX Structure Decision"
Cohesion: 0.50
Nodes (4): Theme 1: Marple Warm Modern ESG, Theme 2: MEIL Corporate / Official, Theme 3: Dark Enterprise / Premium ESG, Three Themes Shared UX Structure Decision

### Community 95 - "createSupabaseAdminClient"
Cohesion: 0.36
Nodes (6): GET(), GET(), evidenceBucket(), createSupabaseAdminClient(), ReplacementTarget, documentAccess

### Community 96 - "Eight Core Product Principles"
Cohesion: 0.67
Nodes (3): Eight Core Product Principles, 15 AI Coding Agent Rules, No Manual Form Entry Architectural Rule

### Community 97 - "Evidence-to-BRSR Digital Thread"
Cohesion: 0.67
Nodes (3): Evidence-to-BRSR Digital Thread, Structural Evidence Lineage Traceability, Report Generation and Evidence Drilldown Flow

### Community 98 - "Deterministic TypeScript Calculation Engine"
Cohesion: 0.67
Nodes (3): Deterministic TypeScript Calculation Engine, TypeScript Calculation Engine Colocation Decision, Standard Carbon Equivalent Conversion Metric Need

### Community 99 - "Postgres-Backed Document Job Queue"
Cohesion: 0.67
Nodes (3): Postgres-Backed Document Job Queue, OCR Pipeline Tables (ocr_jobs, ocr_extractions, ocr_fields), Self-Hosted PaddleOCR Decision

### Community 100 - "esg_record_documents Many-to-Many Join Table"
Cohesion: 0.67
Nodes (3): esg_record_documents Many-to-Many Join Table, Standardized Storage Path Conventions, Documents to ESG Records Many-to-Many Decision

### Community 141 - "documents.ts"
Cohesion: 0.13
Nodes (32): EvidenceFiles(), add(), sha256Hex(), completeSupportingAction(), prepareSupportingAction(), recordEvidenceAction(), acceptedTypesLabel(), ascii() (+24 more)

### Community 142 - "edge-cases.mjs"
Cohesion: 0.22
Nodes (5): again, locked, staleSession(), truncated, unreadablePdf()

### Community 143 - "UploadForm"
Cohesion: 0.25
Nodes (12): completeBundleUploadAction(), completeUploadAction(), FileTarget, prepareBundleUploadAction(), prepareUploadAction(), putFile(), sha256Hex(), UploadForm() (+4 more)

### Community 144 - "confirm-dialog.tsx"
Cohesion: 0.26
Nodes (6): Dialog(), DialogContent(), DialogDescription(), DialogFooter(), DialogHeader(), DialogTitle()

### Community 145 - "org-units/bulk-import/page.tsx"
Cohesion: 0.29
Nodes (8): metadata, OrgUnitsBulkImportPage(), metadata, UsersBulkImportPage(), bulkImportOrgUnitsAction(), bulkImportOrgUnitsOptionsAction(), bulkImportUsersAction(), bulkImportUsersOptionsAction()

### Community 146 - "Grill: Closing the second audit (2026-10-08)"
Cohesion: 0.29
Nodes (6): Factors entered on the local database, Grill: Closing the second audit (2026-10-08), Migration `0038` and the code with it, Not built, and why, SDG tags on the report (owner's request, 2026-10-09), What the owner decided (asked 2026-10-08)

### Community 147 - "SplitReview"
Cohesion: 0.50
Nodes (3): confirmBundleAction(), SplitReview(), confirm()

### Community 148 - "Audit fixes — work queue"
Cohesion: 0.22
Nodes (8): Audit fixes — work queue, Checks for any fix here, Needs the owner before starting, Not code — still open from earlier (see `PROGRESS.md` §5), P0 — must fix, P1 — should fix, P2 — nice to have, P3

### Community 149 - "LevelsCard"
Cohesion: 0.48
Nodes (7): addLevelAction(), removeLevelAction(), renameLevelAction(), LevelsCard(), add(), rename(), run()

### Community 150 - "ocr-monitoring/page.tsx"
Cohesion: 0.67
Nodes (3): metadata, OcrMonitoringPage(), workerStallMinutes()

### Community 151 - "ApprovalQueue"
Cohesion: 0.43
Nodes (6): ApprovalQueue(), decide(), recalculate(), formatDateTime(), decideApprovalAction(), recalculateAction()

### Community 152 - "Grill: Audit fixes P0-1 to P0-3 (factors, SEBI-format report, 2023 indicator codes)"
Cohesion: 0.25
Nodes (7): Entered on the local database, 2026-10-07 (owner's go-ahead in chat), Grill: Audit fixes P0-1 to P0-3 (factors, SEBI-format report, 2023 indicator codes), Out of scope / follow-ups, P0-1 — Factor values: approved by the owner on 2026-10-07; entry on hosted still to do, P0-2 — The report prints SEBI's tables, P0-3 — Indicator codes follow SEBI's July-2023 BRSR format (migration `0033`, D25), What the owner decided (asked 2026-10-07)

### Community 153 - "Grill: Audit fixes P2"
Cohesion: 0.29
Nodes (6): Done, Done on the owner's instruction ("do the remaining P2 items", 2026-10-07), Grill: Audit fixes P2, Hierarchy levels are configuration (migration `0037`, D29, A25), Open items recorded, Several evidence files per record (no migration; A25)

### Community 154 - "audit-view.tsx"
Cohesion: 0.53
Nodes (5): AuditFilterValues, AuditTable(), csvCell(), exportCsv(), pretty()

### Community 155 - "Grill: Audit fixes P1 (Scope 1 and 3 activities, travel by mode, hierarchy in the database)"
Cohesion: 0.33
Nodes (5): Factor values for the new activities: proposed 2026-10-07, awaiting the owner's approval, Grill: Audit fixes P1 (Scope 1 and 3 activities, travel by mode, hierarchy in the database), Key decisions, Not done / follow-ups, What the owner decided (asked 2026-10-07)

### Community 156 - "Agentation"
Cohesion: 0.40
Nodes (4): Agentation, Frontend Usage, MCP Server & Tools, Setup & Verification

### Community 159 - "instrumentation.ts"
Cohesion: 0.50
Nodes (3): onRequestError(), register(), @sentry/nextjs

### Community 160 - "Grill: Audit fixes P3"
Cohesion: 0.50
Nodes (3): Grill: Audit fixes P3, Key decisions, Not done

### Community 161 - "generateReportAction"
Cohesion: 1.00
Nodes (3): generateReportAction(), ReportForm(), submit()

## Knowledge Gaps
- **586 isolated node(s):** `printWidth`, `metadata`, `AuditFilterValues`, `metadata`, `Params` (+581 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 818 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `postgres` connect `calculation/engine.ts` to `web/package.json`, `lib.mjs`, `verification.ts`, `checks.ts`, `createSupabaseAdminClient`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `server-only` connect `root.ts` to `bundles.ts`, `organization.ts`, `db`, `records.ts`, `documents.ts`, `verification.ts`, `session.ts`, `brsr.ts`, `calculation/engine.ts`, `profile.ts`, `checks.ts`, `createSupabaseServerClient`, `trpc/server.ts`, `web/package.json`, `totals.ts`, `reporting-periods.ts`, `html.ts`, `consolidation.ts`, `createSupabaseAdminClient`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `lucide-react` to `verify-workspace.tsx`, `readiness-tree.tsx`, `react`, `theme.ts`, `requireAdminSession`, `documents.ts`, `session.ts`, `confirm-dialog.tsx`, `ocr-monitoring/page.tsx`, `verify/[documentId]/page.tsx`, `audit-view.tsx`, `route-error.tsx`, `scope-dashboard.tsx`, `trpc/server.ts`, `api`, `record-drawer.tsx`, `web/package.json`, `validation-queue-table.tsx`, `factors-manager.tsx`, `admin/page.tsx`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `printWidth`, `metadata`, `AuditFilterValues` to the rest of the system?**
  _586 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `verify-workspace.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10104529616724739 - nodes in this community are weakly interconnected._
- **Should `bundles.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12648221343873517 - nodes in this community are weakly interconnected._
- **Should `samples.py` be split into smaller, more focused modules?**
  _Cohesion score 0.09126984126984126 - nodes in this community are weakly interconnected._