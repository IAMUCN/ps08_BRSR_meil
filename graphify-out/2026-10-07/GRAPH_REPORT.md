# Graph Report - BRSR_MEIL  (2026-10-05)

## Corpus Check
- 380 files · ~229,876 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 13 file(s) not represented in the graph (top: (none) 8, .example 2, .toml 2)

## Summary
- 1972 nodes · 5181 edges · 141 communities (99 shown, 38 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 83 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- tRPC API Router & Procedures (1)
- Multi-Bill PDF Splitting & Bundles (1)
- Multi-Bill PDF Splitting & Bundles (2)
- OCR Worker Test Suite (1)
- Data Approval Workflow Engine (1)
- Organizational Hierarchy Actions (1)
- tRPC API Router & Procedures (2)
- Data Validation & Review Queue (1)
- Login & Password Reset Actions (1)
- Bulk Data Import & Provisioning (1)
- tRPC API Router & Procedures (3)
- UI Shell & Theme Toggle (1)
- ESG Control Tower & Completion KPIs (1)
- Data Approval Workflow Engine (2)
- Data Validation & Review Queue (2)
- Bulk Data Import & Provisioning (2)
- SEBI BRSR Annexure Mapping (1)
- DISCOM Utility & Tariff Extraction (1)
- Multi-Bill PDF Splitting & Bundles (3)
- Multi-Bill PDF Splitting & Bundles (4)
- DISCOM Utility & Tariff Extraction (2)
- GHG Calculation Engine Formulas (1)
- ESG Control Tower & Completion KPIs (2)
- Page Rules Module
- Data Validation & Review Queue (3)
- BRSR Regulatory Standards (1)
- Login & Password Reset Actions (2)
- tRPC API Router & Procedures (4)
- Accounts Auditcount Module
- tRPC API Router & Procedures (5)
- tRPC API Router & Procedures (6)
- Scope Html Module
- Data Validation & Review Queue (4)
- Aliases Tailwind Module
- tRPC API Router & Procedures (7)
- Login & Password Reset Actions (3)
- Package Dependencies & Tooling (1)
- Bulk Data Import & Provisioning (3)
- Package Dependencies & Tooling (2)
- Tsconfig Compileroptions Module
- OCR Worker Test Suite (2)
- Login & Password Reset Actions (4)
- Password Security & Policy Control (1)
- Multi-Bill PDF Splitting & Bundles (5)
- Scenario Scope Module (1)
- Multi-Bill PDF Splitting & Bundles (6)
- Factors Conversion Module
- Organizational Hierarchy Actions (2)
- Password Security & Policy Control (2)
- Periods Reporting Module
- tRPC API Router & Procedures (8)
- User Provisioning & Auth Policies
- Bulk Data Import & Provisioning (4)
- Totals Scope Module
- Scenario Report Module
- Package Dependencies & Tooling (3)
- CI Regression & E2E Testing
- Ocr Monitoring Module
- Roles Manager Module
- OCR Job Queue & Supabase Storage
- Bulk Data Import & Provisioning (5)
- Package Dependencies & Tooling (4)
- Bulk Data Import & Provisioning (6)
- SEBI BRSR Annexure Mapping (2)
- SEBI BRSR Annexure Mapping (3)
- Bulk Data Import & Provisioning (7)
- Package Dependencies & Tooling (5)
- Scope 2 Indirect Emissions Architecture
- Audit Trail Module
- Dashboard KPIs & Readiness Metrics (1)
- Authorization Adminonly Module
- Login & Password Reset Actions (5)
- Scenario Scope Module (2)
- ESG Control Tower & Completion KPIs (3)
- Role Modules & Derived Metrics
- tRPC API Router & Procedures (9)
- Audit Log Immutability & CSRF (1)
- Multi-Bill PDF Splitting & Bundles (7)
- Page Notice Module
- BRSR Regulatory Standards (2)
- Bulk Data Import & Provisioning (8)
- SEBI BRSR Annexure Mapping (4)
- Audit Log Immutability & CSRF (2)
- Loading Page Module
- Chromium Puppeteer Module
- Run All Module
- BRSR Regulatory Standards (3)
- Dashboard KPIs & Readiness Metrics (2)
- Phase Project Module
- Multi-Bill PDF Splitting & Bundles (8)
- Multi-Bill PDF Splitting & Bundles (9)
- Checklist Critical Module
- Graphify Rule Module
- BRSR Regulatory Standards (4)
- BRSR Regulatory Standards (5)
- Orgmanager Organization Module
- BRSR Regulatory Standards (6)
- BRSR Regulatory Standards (7)
- GHG Calculation Engine Formulas (2)
- BRSR Regulatory Standards (8)
- BRSR Regulatory Standards (9)
- UI Shell & Theme Toggle (2)
- Package Dependencies & Tooling (6)
- OCR Layout & Extraction Profiles
- Rules Claude Module
- Eslint Config Module
- Config Postcss Module
- Prettierrc Printwidth Module
- Development Protocol Module
- Data Approval Workflow Engine (3)
- BRSR Regulatory Standards (10)
- BRSR Regulatory Standards (11)
- BRSR Regulatory Standards (12)
- SEBI BRSR Annexure Mapping (5)
- BRSR Regulatory Standards (13)
- BRSR Regulatory Standards (14)
- BRSR Regulatory Standards (15)
- BRSR Regulatory Standards (16)
- Data Approval Workflow Engine (4)
- Operational Traps Module
- Pnpm Workspace Module
- Open Blockers Module
- Scope 3 Value Chain Emissions
- Data Validation & Review Queue (5)
- BRSR Regulatory Standards (17)
- BRSR Regulatory Standards (18)
- BRSR Regulatory Standards (19)
- BRSR Regulatory Standards (20)
- BRSR Regulatory Standards (21)
- BRSR Regulatory Standards (22)
- BRSR Regulatory Standards (23)
- BRSR Regulatory Standards (24)
- BRSR Regulatory Standards (25)
- BRSR Regulatory Standards (26)
- BRSR Regulatory Standards (27)
- BRSR Regulatory Standards (28)
- BRSR Regulatory Standards (29)

## God Nodes (most connected - your core abstractions)
1. `runAction()` - 72 edges
2. `db()` - 70 edges
3. `lucide-react` - 64 edges
4. `api()` - 56 edges
5. `react` - 50 edges
6. `server-only` - 44 edges
7. `writeAudit()` - 42 edges
8. `requireAdminSession()` - 42 edges
9. `Button()` - 41 edges
10. `extract_fields()` - 35 edges

## Surprising Connections (you probably didn't know these)
- `System Edge Case Test Matrix` --conceptually_related_to--> `Phase 18 Security Review Audit`  [INFERRED]
  QA_CHECKLIST.md → SECURITY_REVIEW.md
- `TraceESG Core Architecture Principles` --rationale_for--> `D1: Server-Only Lifecycle Writes`  [INFERRED]
  PROGRESS.md → supabase/SCHEMA_DEVIATIONS.md
- `VerifyOtpForm()` --indirect_call--> `verifyOtpAndSetPassword()`  [INFERRED]
  apps/web/app/forgot-password/forgot-password-form.tsx → apps/web/app/forgot-password/actions.ts
- `WCAG Contrast Token Adjustments` --semantically_similar_to--> `App-Level Rate Limiting`  [INFERRED] [semantically similar]
  .grill/phase-19-ui-polish-decisions.md → .grill/phase-18-audit-security-decisions.md
- `Pull Request Validation Gates` --references--> `GitHub Actions CI Pipeline`  [INFERRED]
  CLAUDE.md → .github/workflows/ci.yml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Server-Only Transactional Security Architecture** — _grill_phase_2_database_decisions_server_only_lifecycle_writes, _grill_phase_4_admin_foundation_decisions_three_lockout_guards [INFERRED 0.95]
- **Human-in-the-Loop OCR Extraction and Verification Flow** — _grill_phase_2b_ocr_worker_decisions_deterministic_extraction, _grill_phase_6_ocr_integration_decisions_worker_notification_dispatch, _grill_phase_7_ocr_verification_decisions_verification_guard_rail [EXTRACTED 1.00]
- **Multi-Level Hierarchical Authorization Model** — ps_documents_implementation_docs_01_prd_configurable_org_hierarchy, ps_documents_implementation_docs_02_trd_rls_authorization_architecture, ps_documents_implementation_docs_05_backend_schema_user_org_assignments_table, ps_documents_implementation_docs__grill_backend_schema_decisions_hierarchical_org_scope_inheritance [EXTRACTED 1.00]
- **Two-Track Decoupled OCR Architecture** — ps_documents_implementation_docs__grill_implementation_plan_decisions_two_track_implementation_structure, ps_documents_implementation_docs__grill_trd_tech_stack_self_hosted_paddleocr_decision, ps_documents_implementation_docs_02_trd_postgres_job_queue [EXTRACTED 1.00]
- **Evidence-to-BRSR Digital Thread Pipeline** — ps_documents_implementation_docs_master_approach_evidence_first_pipeline, ps_documents_implementation_docs_05_backend_schema_canonical_esg_records, ps_documents_implementation_docs_01_prd_evidence_to_brsr_digital_thread, ps_documents_implementation_docs_02_trd_evidence_lineage_traceability [EXTRACTED 1.00]
- **BRSR Core Verification and Assurance Ecosystem** — ps_documents_provided_docs_brsr_faqs_25012025_brsr_core_framework, ps_documents_provided_docs_brsr_faqs_25012025_reasonable_assurance_mandate, ps_documents_provided_docs_background_material_on_sustainability_business_responsibility_sustainability_reporting_brsr_revised_edition_2024_icai_ssa_3000_assurance_standards, ps_documents_provided_docs_brsr_faqs_25012025_value_chain_partners_disclosure [EXTRACTED 1.00]
- **SEBI BRSR Regulatory Architecture and Governance** — ps_documents_provided_docs_business_responsibility_and_sustainability_reporting_by_listed_entitiesannexure1_p_sebi_brsr_format_circular, ps_documents_provided_docs_business_responsibility_and_sustainability_reporting_by_listed_entitiesannexure2_p_sebi_brsr_guidance_note, ps_documents_provided_docs_brsr_faqs_25012025_brsr_applicability_top_1000, ps_documents_provided_docs_background_material_on_sustainability_business_responsibility_sustainability_reporting_brsr_revised_edition_2024_ngrbc_nine_principles [EXTRACTED 1.00]
- **Corporate Sustainability Disclosure and Implementation** — ps_documents_provided_docs_l_t_brsr_report_fy2025_26_lnt_corporate_brsr_report, ps_documents_provided_docs_l_t_brsr_report_fy2025_26_lnt_energy_and_ghg_emissions_profile, ps_documents_provided_docs_business_responsibility_and_sustainability_reporting_by_listed_entitiesannexure2_p_ghg_emissions_calculation_guidance, ps_documents_provided_docs_business_responsibility_and_sustainability_report_corporate_esg_roadmap_readiness [INFERRED 0.85]
- **Authentication and Identity Defense-in-Depth** — _grill_phase_3_auth_decisions_three_layer_deactivation, _grill_password_policy_decisions_password_policy_enforcement, _grill_phase_18_audit_security_decisions_app_level_rate_limiting, _grill_bulk_import_decisions_otp_password_reset [INFERRED 0.85]
- **BRSR Evidence to Report Lineage Pipeline** — _grill_phase_13_role_modules_decisions_single_document_derived_metrics, _grill_phase_14_brsr_mapping_decisions_brsr_readiness_tree, _grill_phase_15_consolidation_decisions_metric_type_consolidation_rules, _grill_phase_17_reporting_decisions_report_snapshot_lineage [INFERRED 0.85]
- **Multi-Bill and OCR Ingestion Pipeline** — _grill_multi_bill_pdf_decisions_bundle_document_model, _grill_multi_bill_pdf_decisions_bundle_proposal_classification, _grill_ocr_real_bills_decisions_discom_electricity_rules, _grill_ocr_real_bills_decisions_water_withdrawal_rule [INFERRED 0.85]
- **Multi-Bill PDF Ingestion and Split Architecture** — context_multi_bill_pdf_support, apps_web_app_flow_deviations_a23_multi_bill_pdf_split, supabase_schema_deviations_d24_multi_bill_bundle_schema [EXTRACTED 1.00]
- **Server-Side Write Boundary and Privilege Hardening** — progress_core_architecture_rules, security_review_append_only_audit_log_trigger, supabase_schema_deviations_d1_server_only_lifecycle_writes, supabase_schema_deviations_d6_privilege_hardening [INFERRED 0.95]
- **CI Pipeline and End-to-End Test Suite Verification** — _github_workflows_ci_ci_pipeline, qa_checklist_critical_e2e_scenarios, readme_test_suites [INFERRED 0.85]

## Communities (141 total, 38 thin omitted)

### Community 0 - "tRPC API Router & Procedures (1)"
Cohesion: 0.07
Nodes (60): confidenceLabel(), FieldRow(), fieldEntry, invoiceDuplicates(), loadDocument(), loadFields(), lockPendingRecord(), notFound() (+52 more)

### Community 1 - "Multi-Bill PDF Splitting & Bundles (1)"
Cohesion: 0.06
Nodes (59): completeBundleUploadAction(), completeUploadAction(), FileTarget, prepareBundleUploadAction(), prepareUploadAction(), putFile(), sha256Hex(), UploadForm() (+51 more)

### Community 2 - "Multi-Bill PDF Splitting & Bundles (2)"
Cohesion: 0.09
Nodes (43): main(), make(), Write one synthetic PDF of several different bills, one page each, to test…, main(), Write a synthetic fuel invoice or electricity bill PDF with a fresh number, for…, WorkerHarnessTest, all_samples(), blank_png() (+35 more)

### Community 3 - "OCR Worker Test Suite (1)"
Cohesion: 0.07
Nodes (42): main(), Download the pinned PaddleOCR model weights from the Hugging Face Hub into…, Phase 2B standalone harness: seed documents + jobs directly (SQL + Storage),…, _load_dotenv(), load_settings(), Path, Worker settings from the environment (02_TRD.md §33). Values come from the…, Minimal KEY=VALUE loader; real environment variables always win. (+34 more)

### Community 4 - "Data Approval Workflow Engine (1)"
Cohesion: 0.09
Nodes (33): reportedRecordAction(), ReportView(), openRecord(), Selected, valueText(), ApprovalQueue(), decide(), recalculate() (+25 more)

### Community 5 - "Organizational Hierarchy Actions (1)"
Cohesion: 0.09
Nodes (44): pgErrorCode(), UploadAssignment, UploadCategory, uploadTargets(), accountCreatedEmailHtml(), allowedChildTypes(), canBeChildOf(), checkMove() (+36 more)

### Community 6 - "tRPC API Router & Procedures (2)"
Cohesion: 0.09
Nodes (40): GET(), GET(), getSessionContext, consolidate(), Consolidated, Figure, financialYearLabel(), financialYearOf() (+32 more)

### Community 7 - "Data Validation & Review Queue (1)"
Cohesion: 0.04
Nodes (48): Phase 10 Scope 1 Decisions, Evidence Lineage Drilldown Architecture, Scope 1 Fuel Metrics Configuration, Approved-Only Headline Consolidation, Zero Placeholder Factor Policy, Strict Unit Grouping Rule, Phase 2 Database Decisions, Permission Catalogue and RBAC Model (+40 more)

### Community 8 - "Login & Password Reset Actions (1)"
Cohesion: 0.11
Nodes (24): initialState, initialState, RouteError(), subscribe(), Button(), buttonVariants, Dialog(), DialogContent() (+16 more)

### Community 9 - "Bulk Data Import & Provisioning (1)"
Cohesion: 0.11
Nodes (41): createOrgUnitAction(), moveOrgUnitAction(), orgExpectationsAction(), orgUnitImpactAction(), setExpectationAction(), setOrgUnitStatusAction(), updateOrgUnitAction(), ExpectationsCard() (+33 more)

### Community 10 - "tRPC API Router & Procedures (3)"
Cohesion: 0.09
Nodes (36): OcrJobStatus, adminProcedure, Context, createCallerFactory, protectedProcedure, router, t, AuditEvent (+28 more)

### Community 11 - "UI Shell & Theme Toggle (1)"
Cohesion: 0.08
Nodes (30): ADMIN_NAV, AdminLayout(), APP_NAV, WorkspaceLayout(), TraceESG App Icon, inter, jetbrainsMono, metadata (+22 more)

### Community 12 - "ESG Control Tower & Completion KPIs (1)"
Cohesion: 0.10
Nodes (33): fraction, readiness, READINESS_COMPONENTS, ReadinessKey, count(), expectationsFrom(), MissingSubmission, missingSubmissions() (+25 more)

### Community 13 - "Data Approval Workflow Engine (2)"
Cohesion: 0.12
Nodes (27): AdminApprovalQueuePage(), metadata, ConversionFactorsPage(), metadata, DataExplorerPage(), metadata, metadata, OrganizationPage() (+19 more)

### Community 14 - "Data Validation & Review Queue (2)"
Cohesion: 0.11
Nodes (26): submitForApproval(), AuditEvent, jsonOrNull(), writeAudit(), globalForDb, Tx, permissionProcedure(), ApprovalRow (+18 more)

### Community 15 - "Bulk Data Import & Provisioning (2)"
Cohesion: 0.12
Nodes (22): metadata, ApprovalsPage(), metadata, FILTERS, metadata, NotificationsPage(), metadata, OrgUnitsBulkImportPage() (+14 more)

### Community 16 - "SEBI BRSR Annexure Mapping (1)"
Cohesion: 0.11
Nodes (25): indicatorStatus, STATUS_LABEL, loadCalculations(), loadCalculationsById(), Sql, traces(), db(), BrsrIndicator (+17 more)

### Community 17 - "DISCOM Utility & Tariff Extraction (1)"
Cohesion: 0.22
Nodes (7): DiscomThermalBillTest, ExtractFieldsTest, line(), values(), extract_fields(), FieldSpec, One `metric_field_requirements` row.

### Community 18 - "Multi-Bill PDF Splitting & Bundles (3)"
Cohesion: 0.15
Nodes (28): _audit(), BundleType, claim_job(), ClaimedJob, complete_bundle_job(), complete_job(), _confidence_threshold(), connect() (+20 more)

### Community 19 - "Multi-Bill PDF Splitting & Bundles (4)"
Cohesion: 0.16
Nodes (13): lines(), page(), ProposeMetricTest, Splitting a multi-bill PDF into proposed bills (no OCR engine, no database)., spans(), SplitPagesTest, BundlePart, propose_metric() (+5 more)

### Community 20 - "DISCOM Utility & Tariff Extraction (2)"
Cohesion: 0.15
Nodes (24): _below_neighbor(), _date_on_same_row(), _find_labeled(), _find_reading_period(), _find_unit_near(), _find_utility(), _height(), _label_match() (+16 more)

### Community 21 - "GHG Calculation Engine Formulas (1)"
Cohesion: 0.15
Nodes (21): activeFormula(), activityKeyFor(), CalculationOutcome, ENGINE_VERSION, RecordRow, runCalculation(), Sql, activityInput() (+13 more)

### Community 22 - "ESG Control Tower & Completion KPIs (2)"
Cohesion: 0.15
Nodes (18): MarkAllReadButton(), ContextPicker(), pct(), ReadinessInfo(), ICONS, NotificationRow(), open(), relative (+10 more)

### Community 23 - "Page Rules Module"
Cohesion: 0.14
Nodes (21): formatDate(), metadata, UserDashboardPage(), formatDateTime(), metadata, MySubmissionsPage(), formatDateTime(), metadata (+13 more)

### Community 24 - "Data Validation & Review Queue (3)"
Cohesion: 0.16
Nodes (19): reviewRecordAction(), formatDateTime(), problemTypes(), ValidationQueueTable(), decide(), checkInvoiceDuplicatesAction(), confirmManualEntryAction(), confirmVerificationAction() (+11 more)

### Community 25 - "BRSR Regulatory Standards (1)"
Cohesion: 0.08
Nodes (25): ICAI Sustainability Reporting Standards Board Guidance, ISSB Global Sustainability Baseline Alignment, National Guidelines on Responsible Business Conduct (NGRBC) 9 Principles, UN Sustainable Development Goals (SDGs) Mapping, BRSR Applicability for Top 1000 Listed Entities, High Value Debt Listed Entities (HVD) Applicability, BRSR vs BRR Paradigm Shift, Evolution of ESG Reporting in India (+17 more)

### Community 26 - "Login & Password Reset Actions (2)"
Cohesion: 0.22
Nodes (20): requestPasswordReset(), verifyOtpAndSetPassword(), signIn(), signInSchema, SignInState, resolveSession(), passwordResetOtpEmailHtml(), sendEmail() (+12 more)

### Community 27 - "tRPC API Router & Procedures (4)"
Cohesion: 0.08
Nodes (24): dependencies, class-variance-authority, cn, exceljs, lucide-react, next, nodemailer, pdf-lib (+16 more)

### Community 28 - "Accounts Auditcount Module"
Cohesion: 0.19
Nodes (23): ACCOUNTS, auditCount(), authAdmin(), currentCalculation(), ensureAdmin(), ensureFactors(), ensureInvited(), HERE (+15 more)

### Community 29 - "tRPC API Router & Procedures (5)"
Cohesion: 0.13
Nodes (18): AuditFilterValues, AuditTable(), csvCell(), exportCsv(), pretty(), generateReportAction(), ReportForm(), submit() (+10 more)

### Community 30 - "tRPC API Router & Procedures (6)"
Cohesion: 0.15
Nodes (16): ALLOWED_TYPES, GET(), FORWARDED_REASONS, GET(), signOutAction(), publicEnv, publicEnvSchema, createSupabaseServerClient() (+8 more)

### Community 31 - "Scope Html Module"
Cohesion: 0.17
Nodes (18): ActivityTable(), approvedOf(), BranchBars(), BranchTable(), CategoryTable(), RecordTable(), TrendBars(), escapeHtml() (+10 more)

### Community 32 - "Data Validation & Review Queue (4)"
Cohesion: 0.15
Nodes (13): BrsrMappingPage(), metadata, metadata, ScopeOnePage(), metadata, ScopeTwoPage(), metadata, ScopeThreePage() (+5 more)

### Community 33 - "Aliases Tailwind Module"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 34 - "tRPC API Router & Procedures (7)"
Cohesion: 0.15
Nodes (15): metadata, OcrMonitoringPage(), metadata, ReportsPage(), STATUS, when(), metadata, ReportDetailPage() (+7 more)

### Community 35 - "Login & Password Reset Actions (3)"
Cohesion: 0.18
Nodes (16): LoginForm(), LoginPage(), metadata, RootPage(), AuthNotice(), AUTH_MESSAGES, isLoginReason(), LOGIN_NOTICES (+8 more)

### Community 36 - "Package Dependencies & Tooling (1)"
Cohesion: 0.10
Nodes (20): devDependencies, supabase, engines, node, name, packageManager, private, scripts (+12 more)

### Community 37 - "Bulk Data Import & Provisioning (3)"
Cohesion: 0.16
Nodes (14): ActionResult, Option, ParsedRow, ActionResult, NodeOption, ParsedRow, RowsPreview(), StageBadge() (+6 more)

### Community 38 - "Package Dependencies & Tooling (2)"
Cohesion: 0.10
Nodes (19): typescript, name, private, type, version, class-variance-authority, eslint, eslint-config-next (+11 more)

### Community 39 - "Tsconfig Compileroptions Module"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 40 - "OCR Worker Test Suite (2)"
Cohesion: 0.19
Nodes (10): ClassifyTest, FieldsNeedingAttentionTest, Pure extraction/classification rules — no PaddleOCR needed (runs in CI)., classify(), ExtractedField, fields_needing_attention(), _find_implied_unit(), kWh for a consumption read under a "units …" label when the bill prints no unit. (+2 more)

### Community 41 - "Login & Password Reset Actions (4)"
Cohesion: 0.15
Nodes (12): ResetRequestState, VerifyOtpState, ForgotPasswordForm(), initialRequestState, initialVerifyState, VerifyOtpForm(), metadata, metadata (+4 more)

### Community 42 - "Password Security & Policy Control (1)"
Cohesion: 0.21
Nodes (13): setPassword(), SetPasswordState, PasswordStrengthMeter(), STRENGTH_LABEL, STRENGTH_TEXT_TONE, STRENGTH_TONE, PASSWORD_MIN_LENGTH, PASSWORD_RULES (+5 more)

### Community 43 - "Multi-Bill PDF Splitting & Bundles (5)"
Cohesion: 0.18
Nodes (13): ensureUnit(), again, locked, prepare(), staleSession(), truncated, metricId(), ok() (+5 more)

### Community 44 - "Scenario Scope Module (1)"
Cohesion: 0.15
Nodes (11): recordOf(), rejected(), RUN, sample(), validationResults(), acceptIfFlagged(), before, bill() (+3 more)

### Community 45 - "Multi-Bill PDF Splitting & Bundles (6)"
Cohesion: 0.15
Nodes (11): bundleFile, APP, check(), env, finish(), sampleBundle(), section(), body (+3 more)

### Community 46 - "Factors Conversion Module"
Cohesion: 0.20
Nodes (12): addFactorVersionAction(), createFactorAction(), setFactorVersionStatusAction(), VersionValues, ActivityType, current(), FactorSheet(), FactorsManager() (+4 more)

### Community 47 - "Organizational Hierarchy Actions (2)"
Cohesion: 0.17
Nodes (14): activeAdminUserIds(), assignedByEmail, displayName, email, existing, fail(), orFail(), orgCode (+6 more)

### Community 48 - "Password Security & Policy Control (2)"
Cohesion: 0.15
Nodes (14): GitHub Actions CI Pipeline, CI Database Migration and pgTAP Job, CI OCR Worker Ruff and Unit Tests Job, CI Web Job, A22: Password Policy and Live Strength Meter, Pull Request Validation Gates, Hardware Memory and Port Constraints, TraceESG Architecture and Overview (+6 more)

### Community 49 - "Periods Reporting Module"
Cohesion: 0.25
Nodes (12): createPeriodAction(), transitionPeriodAction(), updatePeriodWindowAction(), CreatePeriodSheet(), onSubmit(), formatDate(), Pending, PeriodsManager() (+4 more)

### Community 50 - "tRPC API Router & Procedures (8)"
Cohesion: 0.23
Nodes (11): checkPeriodDates(), checkTransition(), PeriodDates, PeriodStatus, TransitionCheck, badRequest(), isoDate, optionalIsoDate (+3 more)

### Community 51 - "User Provisioning & Auth Policies"
Cohesion: 0.15
Nodes (13): scripts, build, calculate-pending, dev, format, format:check, lint, provision-user (+5 more)

### Community 52 - "Bulk Data Import & Provisioning (4)"
Cohesion: 0.18
Nodes (12): A10: Approval Step Pulled Forward to Phase 8, A11: Missing Factor Queue Blocking Behavior, A17: Control Tower Consistent Predicate Drilldown, A19: WCAG AA Color Contrast Adjustments, A1: Corporate ESG Approvals Route Split, A20: In-Browser XLSX Bulk Import Workflow, A3: Next.js Proxy vs Data Access Layer Separation, A8: OCR Verify Extraction Guards and Manual Exceptions (+4 more)

### Community 53 - "Totals Scope Module"
Cohesion: 0.21
Nodes (11): ActivityTotal, gapOf(), ScopeBranch, scopeBreakdown, ScopeCategory, ScopeRecord, scopeTree(), Sql (+3 more)

### Community 54 - "Scenario Report Module"
Cohesion: 0.17
Nodes (7): close(), diesel, liveScope1, pdf, reported, scenarios, started

### Community 55 - "Package Dependencies & Tooling (3)"
Cohesion: 0.17
Nodes (11): devDependencies, typescript, typescript, main, name, private, scripts, typecheck (+3 more)

### Community 56 - "CI Regression & E2E Testing"
Cohesion: 0.18
Nodes (11): Clean-State Test Provisioning, Curated E2E Regression Suite, pgTAP Database CI Integration, Synthetic Document Testing Principle, Three-Layer Account Deactivation, Phase 4 Admin Foundation Decisions, Frozen Deactivated Organization Node Policy, Guidance Submission Windows Schema Deviation (+3 more)

### Community 57 - "Ocr Monitoring Module"
Cohesion: 0.36
Nodes (9): ocrJobFieldsAction(), retryOcrJobAction(), Band, formatDateTime(), JobDrawer(), load(), OcrJobsTable(), percent() (+1 more)

### Community 58 - "Roles Manager Module"
Cohesion: 0.35
Nodes (9): createRoleAction(), deleteRoleAction(), setRolePermissionsAction(), CreateRoleSheet(), onSubmit(), Result, RolePermissions(), onSubmit() (+1 more)

### Community 59 - "OCR Job Queue & Supabase Storage"
Cohesion: 0.20
Nodes (11): A18: Report Snapshot and Evidence Breadcrumb Drilldown, D11: OCR Worker Restricted Direct DB Writes, D14: Percentage Formula Type Addition, D16: Configurable Submission Expectations Table, D17: Financial Year Reporting Support in Report Runs, D18: Result vs Activity Quantity Reporting in BRSR, D22: Hashed 6-Digit Password Reset OTPs, D4: Scoped Client Write on Notifications is_read (+3 more)

### Community 60 - "Bulk Data Import & Provisioning (5)"
Cohesion: 0.25
Nodes (9): downloadEmployeeTemplate(), downloadOrgUnitTemplate(), downloadWorkbook(), EMPLOYEE_HEADERS, ORG_UNIT_HEADERS, sheetWithReference(), triggerDownload(), exceljs (+1 more)

### Community 61 - "Package Dependencies & Tooling (4)"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, eslint-config-next, prettier, tailwindcss, @tailwindcss/postcss, @types/node, @types/nodemailer (+3 more)

### Community 62 - "Bulk Data Import & Provisioning (6)"
Cohesion: 0.20
Nodes (10): Brevo SMTP Delivery, Bulk Default Password Generator, OTP Password Reset Flow, Default Password Policy Guarantee, Universal Password Policy Enforcement, Shared Password Policy Module, Password Strength Meter Component, Supabase Auth Password Config (+2 more)

### Community 63 - "SEBI BRSR Annexure Mapping (2)"
Cohesion: 0.20
Nodes (10): CSR Section A Mapping, SEBI BRSR Annexure I Catalogue, Headless Chromium PDF Generation, Mandatory BRSR Indicator Enforcement, Immutable Report Snapshot Lineage, Report Value Type Mapping, Append-Only Audit Log Trigger, Record Lifecycle Audit Trail (+2 more)

### Community 64 - "SEBI BRSR Annexure Mapping (3)"
Cohesion: 0.33
Nodes (8): removeMappingAction(), saveMappingAction(), Editing, MappingSheet(), submit(), MappingTable(), remove(), ConfirmDialog()

### Community 65 - "Bulk Data Import & Provisioning (7)"
Cohesion: 0.31
Nodes (8): EmployeeBulkImport(), onDownloadResults(), onFile(), OrgUnitBulkImport(), onDownloadResults(), onFile(), downloadCsv(), parseSheetRows()

### Community 66 - "Package Dependencies & Tooling (5)"
Cohesion: 0.20
Nodes (9): compilerOptions, isolatedModules, module, moduleResolution, noEmit, skipLibCheck, strict, target (+1 more)

### Community 67 - "Scope 2 Indirect Emissions Architecture"
Cohesion: 0.22
Nodes (9): Admin Scope 2 Dashboard Page, Scope Dashboard Activity Breakdown, Category Role Ownership Model, Scope 3 Active Categories, Recursive Scope Rollup Query, Spend-Based Business Travel, Weight-Based Operational Waste, Consolidation Query API (+1 more)

### Community 68 - "Audit Trail Module"
Cohesion: 0.31
Nodes (7): AuditFilters(), AuditTrailPage(), date(), metadata, one(), Params, uuid()

### Community 69 - "Dashboard KPIs & Readiness Metrics (1)"
Cohesion: 0.25
Nodes (9): A6: Pre-Validation and Server-Issued Uploads, Claude Agent Working Brief, TraceESG Live Working State, TraceESG Core Architecture Principles, Phase 21 Deployment Readiness Plan, 20-Phase Implementation Matrix, TraceESG Implementation Progress Tracker, D2: Server-Only Configuration Writes (+1 more)

### Community 70 - "Authorization Adminonly Module"
Cohesion: 0.22
Nodes (6): adminOnly, anon, farPm, goneSession, token, uploads

### Community 72 - "Scenario Scope Module (2)"
Cohesion: 0.22
Nodes (6): before, bytes, invoice, monitored, row, subsidiary

### Community 73 - "ESG Control Tower & Completion KPIs (3)"
Cohesion: 0.25
Nodes (9): TraceESG Evidence-First ESG Platform, TRD Core Architecture Principles, TraceESG Recommended Technology Stack, Admin Control Tower Command Center, Single Organization Tree No Tenant ID Decision, PS-08 Master System Blueprint v1.0, Dr. P. Ravi Reddy (MEIL Director) Video Briefing, MEIL Conglomerate Operational Scale & Complexity (+1 more)

### Community 74 - "Role Modules & Derived Metrics"
Cohesion: 0.32
Nodes (8): Water Consumption to Withdrawal Mapping, Configurable Not-Greater-Than Validation, Percentage Formula Type, Role-Specific Non-Emission Metrics, Single-Document Derived Metrics, Subtract Formula Type, Indian Financial Year Consolidation Boundary, Metric-Specific Consolidation Rules

### Community 75 - "tRPC API Router & Procedures (9)"
Cohesion: 0.43
Nodes (5): handler(), sameOriginRequest(), createTRPCContext(), AppRouter, req()

### Community 76 - "Audit Log Immutability & CSRF (1)"
Cohesion: 0.36
Nodes (8): F2 Append-Only Database Audit Log Trigger, F3 tRPC Mutation Origin CSRF Verification, Phase 18 Security Review Audit, F1 Per-Account and Per-IP Sign-in Throttling, F8 Supabase Auth Per-IP Deployment Action, F4 Document Upload Rate Limiting, F7 Two-Hour Signed Upload URL Accepted Risk, D19: Rate Limit Table and Append-Only Audit Trigger

### Community 77 - "Multi-Bill PDF Splitting & Bundles (7)"
Cohesion: 0.29
Nodes (7): Bundle Proposal Classification Engine, Split Review Screen, DISCOM Electricity Extraction Rules, DISCOM Utility Name Matching, Implied kWh Unit Rule, Renewable Electricity Metric, Zero Conversion Factor Allowance

### Community 78 - "Page Notice Module"
Cohesion: 0.33
Nodes (4): Card, metadata, NOTICES, NoticeToast()

### Community 79 - "BRSR Regulatory Standards (2)"
Cohesion: 0.29
Nodes (7): Evidence-First Data Collection Model, Evidence Document Upload Journey, Defensibility-First UI/UX Philosophy, Canonical esg_records Table, 21-Phase Sequential and Parallel Roadmap, Async OCR Non-Blocking UX Decision, Master Evidence-First Pipeline Blueprint

### Community 80 - "Bulk Data Import & Provisioning (8)"
Cohesion: 0.33
Nodes (6): Bulk Import Permissions, Client-Side XLSX Parsing, Row-Level Import Transactions, Bundle Document Model, Bundle Upload Guardrails, Server-Side PDF Page Cutting

### Community 81 - "SEBI BRSR Annexure Mapping (4)"
Cohesion: 0.33
Nodes (6): BRSR Readiness Tree Drill-Down, Mapping Applicability Flag, BRSR Readiness Composite Score, Completion Pipeline KPIs, Submission Expectations Model, URL-Driven Filter Context

### Community 82 - "Audit Log Immutability & CSRF (2)"
Cohesion: 0.40
Nodes (6): App-Level Rate Limiting, tRPC Origin CSRF Protection, User-Stored Theme Preference, WCAG Contrast Token Adjustments, Theme-2 Corporate Default Selection, TopBar Theme Toggle Component

### Community 84 - "Chromium Puppeteer Module"
Cohesion: 0.33
Nodes (3): renderPdf(), puppeteer-core, @sparticuz/chromium

### Community 85 - "Run All Module"
Cohesion: 0.33
Nodes (4): ALL, HERE, problems, results

### Community 86 - "BRSR Regulatory Standards (3)"
Cohesion: 0.33
Nodes (6): TraceESG Target Personas and Roles, Route Namespace Model (/admin and /app), user_org_assignments Table, Master Seven Role Access Model, TraceESG Account Invitation Email Template, TraceESG Password Reset Email Template

### Community 87 - "Dashboard KPIs & Readiness Metrics (2)"
Cohesion: 0.33
Nodes (6): BRSR Comprehensive, Lite and Core Architecture, ICAI Standards on Sustainability Assurance (SSA 3000), BRSR Core Framework, Reasonable Assurance Mandate for BRSR Core, Value Chain Partners Disclosures, Corporate ESG Roadmap and Assurance Readiness

### Community 88 - "Phase Project Module"
Cohesion: 0.40
Nodes (5): Corepack Pinned pnpm Decision, Phase 1 Project Setup Decisions, PaddleOCR Python 3.12 Worker Runtime, Next.js 16 and Tailwind v4 Stack Selection, Three-Theme Data-Theme Architecture

### Community 89 - "Multi-Bill PDF Splitting & Bundles (8)"
Cohesion: 0.50
Nodes (3): confirmBundleAction(), SplitReview(), confirm()

### Community 90 - "Multi-Bill PDF Splitting & Bundles (9)"
Cohesion: 0.50
Nodes (5): A23: Multi-Bill PDF OCR Propose and Split Flow, DISCOM Bill and Water OCR Rules Context, Multi-Bill PDF Document Handling Context, Out-of-Sequence Completed Features Status, D24: Multi-Bill PDF Bundle and Split Schema

### Community 91 - "Checklist Critical Module"
Cohesion: 0.40
Nodes (5): Critical E2E Scenarios (A-E), System Edge Case Test Matrix, QA Identifier and Offline Recovery Findings, Phase 20 Quality Assurance Checklist, Test Suites and E2E Harness Execution

### Community 92 - "Graphify Rule Module"
Cohesion: 0.50
Nodes (4): Graphify Query and Traversal Rule, Graphify Knowledge Graph Rule, Graphify AST Update Rule, Graphify Workflow

### Community 93 - "BRSR Regulatory Standards (4)"
Cohesion: 0.50
Nodes (4): Configurable Multi-Entity Organization Hierarchy, Postgres RLS Database-Layer Authorization, org_units Recursive Hierarchy Table, Master Seven Level Organizational Model

### Community 94 - "BRSR Regulatory Standards (5)"
Cohesion: 0.50
Nodes (4): Theme 1: Marple Warm Modern ESG, Theme 2: MEIL Corporate / Official, Theme 3: Dark Enterprise / Premium ESG, Three Themes Shared UX Structure Decision

### Community 95 - "Orgmanager Organization Module"
Cohesion: 1.33
Nodes (3): OrgManager(), renderNode(), select()

### Community 96 - "BRSR Regulatory Standards (6)"
Cohesion: 0.67
Nodes (3): Eight Core Product Principles, 15 AI Coding Agent Rules, No Manual Form Entry Architectural Rule

### Community 97 - "BRSR Regulatory Standards (7)"
Cohesion: 0.67
Nodes (3): Evidence-to-BRSR Digital Thread, Structural Evidence Lineage Traceability, Report Generation and Evidence Drilldown Flow

### Community 98 - "GHG Calculation Engine Formulas (2)"
Cohesion: 0.67
Nodes (3): Deterministic TypeScript Calculation Engine, TypeScript Calculation Engine Colocation Decision, Standard Carbon Equivalent Conversion Metric Need

### Community 99 - "BRSR Regulatory Standards (8)"
Cohesion: 0.67
Nodes (3): Postgres-Backed Document Job Queue, OCR Pipeline Tables (ocr_jobs, ocr_extractions, ocr_fields), Self-Hosted PaddleOCR Decision

### Community 100 - "BRSR Regulatory Standards (9)"
Cohesion: 0.67
Nodes (3): esg_record_documents Many-to-Many Join Table, Standardized Storage Path Conventions, Documents to ESG Records Many-to-Many Decision

## Knowledge Gaps
- **509 isolated node(s):** `printWidth`, `metadata`, `AuditFilterValues`, `metadata`, `Params` (+504 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 727 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `postgres` connect `Data Validation & Review Queue (2)` to `tRPC API Router & Procedures (1)`, `Multi-Bill PDF Splitting & Bundles (1)`, `Package Dependencies & Tooling (2)`, `GHG Calculation Engine Formulas (1)`, `Accounts Auditcount Module`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `Login & Password Reset Actions (1)` to `Data Approval Workflow Engine (1)`, `Bulk Data Import & Provisioning (1)`, `UI Shell & Theme Toggle (1)`, `Data Approval Workflow Engine (2)`, `Bulk Data Import & Provisioning (2)`, `ESG Control Tower & Completion KPIs (2)`, `Page Rules Module`, `Data Validation & Review Queue (3)`, `tRPC API Router & Procedures (5)`, `Data Validation & Review Queue (4)`, `tRPC API Router & Procedures (7)`, `Bulk Data Import & Provisioning (3)`, `Package Dependencies & Tooling (2)`, `Login & Password Reset Actions (4)`, `Password Security & Policy Control (1)`, `Factors Conversion Module`, `Periods Reporting Module`, `Ocr Monitoring Module`, `Roles Manager Module`, `SEBI BRSR Annexure Mapping (3)`, `Page Notice Module`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `server-only` connect `tRPC API Router & Procedures (3)` to `tRPC API Router & Procedures (1)`, `Multi-Bill PDF Splitting & Bundles (1)`, `Organizational Hierarchy Actions (1)`, `tRPC API Router & Procedures (2)`, `Package Dependencies & Tooling (2)`, `ESG Control Tower & Completion KPIs (1)`, `Data Approval Workflow Engine (2)`, `Data Validation & Review Queue (2)`, `Bulk Data Import & Provisioning (2)`, `SEBI BRSR Annexure Mapping (1)`, `tRPC API Router & Procedures (8)`, `Chromium Puppeteer Module`, `GHG Calculation Engine Formulas (1)`, `Totals Scope Module`, `Login & Password Reset Actions (2)`, `tRPC API Router & Procedures (6)`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `printWidth`, `metadata`, `AuditFilterValues` to the rest of the system?**
  _509 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `tRPC API Router & Procedures (1)` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Multi-Bill PDF Splitting & Bundles (1)` be split into smaller, more focused modules?**
  _Cohesion score 0.060528559249786874 - nodes in this community are weakly interconnected._
- **Should `Multi-Bill PDF Splitting & Bundles (2)` be split into smaller, more focused modules?**
  _Cohesion score 0.09126984126984126 - nodes in this community are weakly interconnected._