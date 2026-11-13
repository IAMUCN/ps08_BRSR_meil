# Product Requirements Document (PRD)
## PS-08 — Evidence-First ESG/BRSR Reporting Platform

**Document ID:** 01_PRD.md
**Version:** 1.0
**Status:** Draft for review
**Source of Truth:** `Master_Approach.md` (PS-08 ESG/BRSR Reporting Portal — Implementation Approach / Master System Blueprint, v1.0). This PRD does not replace, contradict, or simplify any decision made in that document — it translates it into product requirements.

---

## 1. Document Purpose

This PRD defines **what** the PS-08 ESG/BRSR Reporting Platform must do and **why**, for a large, multi-entity infrastructure organization such as MEIL. It is intended for product stakeholders, designers, and engineering leads to align on scope, users, features, and acceptance criteria before technical design begins.

This document is deliberately **not** a technical design document. Architecture, database schema, API contracts, and technology-stack choices belong in `02_TRD.md` and related downstream documents (see [Section 41](#41-future-scalability-considerations) and the document set defined in `Master_Approach.md` §49).

Where a requirement depends on exact regulatory wording (e.g., specific BRSR indicator codes, exact conversion factor values, exact reporting formats), this PRD marks it explicitly as **[VERIFY AGAINST AUTHORITATIVE BRSR SOURCE]** rather than inventing it. Authoritative sources include the current SEBI BRSR format/circulars and the BRSR reference material already collected in `ps_documents/provided_docs/`.

---

## 2. Product Name

**Working name:** EmeilSG — *ESG/BRSR Evidence Platform*

(The Master Approach does not fix a product name; "EmeilSG" is a working title chosen to reflect the evidence-first differentiator. It may be renamed without affecting any requirement in this document.)

---

## 3. Product Tagline

**"Every reported number has a source. Every source is a document."**

---

## 4. Executive Summary

EmeilSG is a web-based ESG/BRSR reporting platform for large, multi-entity infrastructure organizations. It solves the problem of collecting sustainability and BRSR-relevant data from hundreds of projects, business units, and departments, and consolidating that data into reliable, auditable ESG and BRSR outputs.

The platform's defining product decision is that **normal users never manually fill an ESG data-entry form.** Instead, users upload the source document they already have — a fuel invoice, an electricity bill, a waste disposal certificate, an HR record — and the system extracts the relevant data via OCR/document intelligence, presents it for human verification, and only then allows it to flow into validation, calculation, scope classification, consolidation, and BRSR mapping.

Every number the platform reports carries its full lineage back to the original document. This **evidence-first model** is the product's core differentiator versus generic ESG dashboards or spreadsheet-based data collection.

The platform must be architected to scale from a small pilot (one organization, a handful of projects) to an enterprise deployment (multiple subsidiaries, hundreds of projects, thousands of users) without redesign — through configuration (organizational hierarchy, roles/permissions, metrics, conversion factors, BRSR mappings) rather than hard-coding.

---

## 5. Problem Statement

Large infrastructure organizations such as MEIL operate through many subsidiaries and hundreds of concurrent projects, each generating sustainability-relevant records (fuel purchases, electricity bills, water/waste records, HR data, procurement records, CSR spend) through different departments and different source systems.

Today this data is typically collected manually — spreadsheets, emails, physical bills — with no consistent structure, no enforced evidence trail, and no reliable way to trace a reported BRSR number back to the document that justifies it. This creates:

- **High manual effort** to collect, re-key, and reconcile ESG data every reporting period.
- **Inconsistency** across projects and subsidiaries in how the same metric is calculated or classified.
- **Weak auditability** — reported numbers cannot easily be defended with supporting evidence when questioned by auditors, assurance providers, or regulators.
- **Reporting risk** — incomplete or unverifiable data discovered late in the reporting cycle, close to filing deadlines.
- **No scalable data model** — organizations often build one-off spreadsheets or forms per project, which does not scale to hundreds of projects.

EmeilSG addresses this by making the **document the unit of data entry**, and by building traceability into the data model from day one rather than as an afterthought.

---

## 6. Background/Context

This platform is designed for organizations of the scale and structure of MEIL: multiple subsidiaries/entities, multiple business units, and a very large, fluctuating portfolio of live infrastructure projects, each producing operational records relevant to Scope 1, Scope 2, applicable Scope 3, water, waste, HR/workforce, procurement, and CSR/finance data.

Reference material informing this PRD (see `ps_documents/provided_docs/`) includes SEBI BRSR background and FAQ material, sample listed-entity BRSR annexures, a peer BRSR report (L&T FY2025-26) demonstrating multi-entity BRSR reporting in practice, and a podcast transcript describing the operational challenge of centralizing sustainability data collection across many business units. These sources establish that:

- BRSR reporting is structured into **Section A, Section B, and Section C**, with Section C further divided into **Essential** and **Leadership** indicators. **[VERIFY AGAINST AUTHORITATIVE BRSR SOURCE]** for exact section/indicator numbering used in implementation.
- Peer organizations report ESG/BRSR data across multiple entities and multiple functional contributors (HR, EHS, finance, procurement), consistent with the role model in this PRD.
- Assurance practice emphasizes data collection/collation/calculation methodology, source consistency, audit trails, and internal controls — reinforcing the evidence-first requirement.

This PRD treats `Master_Approach.md` as authoritative for product decisions and treats the BRSR/regulatory source material as authoritative for exact indicator content, to be confirmed during BRSR mapping configuration rather than hard-coded into this PRD.

---

## 7. Product Vision

Create an **"Evidence-to-BRSR Digital Thread"**: a single, unbroken chain connecting every reported ESG/BRSR value back to the document that proves it.

```
Source Document → OCR Extraction → User Verification → Validated Activity Data
   → Conversion Factor → Calculation → Scope Classification
   → Organizational Consolidation → BRSR Indicator → Final Report
```

The system does not merely produce a number — it preserves *how* the number was obtained, permanently and reproducibly.

---

## 8. Core Value Proposition

| For | EmeilSG provides |
|---|---|
| **Field users** (PM, HR, EHS, Procurement, Finance/CSR) | A single, simple action — upload the document you already have — instead of learning and filling ESG forms. |
| **Corporate ESG/Sustainability teams** | Consistent, comparable, centrally consolidated data across every project and subsidiary, with visibility into completeness and readiness at any time, not only at filing deadline. |
| **Admins/platform owners** | A scalable, configuration-driven platform (roles, hierarchy, factors, BRSR mappings) that does not need to be re-engineered as the organization adds subsidiaries or projects. |
| **Auditors/assurance providers** | Full drill-down from any reported BRSR number to its original supporting document, with a complete audit trail of every edit and approval. |
| **The organization** | Reduced ESG data-collection effort, improved data quality and consistency, and materially improved BRSR reporting readiness and defensibility. |

---

## 9. Target Users / Personas

1. **Project Manager (PM)** — owns project-level operational documents (fuel, electricity, applicable Scope 3 evidence) for one or more assigned projects. Needs a fast, low-friction way to submit monthly evidence without ESG domain expertise.
2. **HR User** — provides employee/workforce-related source documents (headcount, gender distribution, turnover, training records) for an assigned organizational scope.
3. **EHS/Environment User** — provides environmental records: water, waste, air emissions, safety, and environmental certifications for assigned project(s)/site(s).
4. **Finance/CSR User** — provides CSR expenditure, beneficiary, and fines/penalties evidence for an assigned scope.
5. **Procurement User** — provides vendor/procurement-related evidence (local/MSME/women-led/SHG/SC-ST procurement records) for an assigned scope.
6. **Corporate ESG/Sustainability User** — reviews and monitors consolidated ESG/BRSR readiness across entities; may have elevated read/review access without full Admin configuration rights (see [Section 10](#10-user-roles)). Cross-entity visibility is achieved the same way any org-scope is granted — Admin assigns this user's `user_org_assignments` row at a high node (Subsidiary or Group) rather than a single Project, and the standard scope-cascades-to-descendants rule (`05_BACKEND_SCHEMA.md` §16.2) does the rest; there is no separate "global" flag or mechanism.
7. **Admin** — platform owner: configures organization hierarchy, users, roles/permissions, reporting periods, conversion factors, BRSR mappings; monitors submissions/OCR/validation/approval across the organization; generates and drills down into reports.
8. **Auditor / Assurance Reviewer** (secondary/future persona) — a read-only, evidence-drill-down consumer of the platform's audit trail; not necessarily a distinct login in the MVP, but a use case the evidence model must support (see [Section 36](#36-out-of-scope-items) for MVP boundary).

---

## 10. User Roles

Roles are **permission-driven and scalable** — the platform must not hard-code behavior around a fixed set of role names. The following are the initial minimum role set (per `Master_Approach.md` §6), each mapped to `User → Role → Organization Scope → Permissions`:

| Role | Primary Responsibility |
|---|---|
| **Admin** | Full system control: users, roles, permissions, hierarchy, reporting periods, factors, BRSR mappings, reports, audit trail. |
| **HR** | Employee/workforce-related source documents and BRSR HR indicators. |
| **Project Manager** | Project-level Scope 1, Scope 2, and applicable Scope 3 evidence. |
| **EHS / Environment** | Water, waste, air emissions, safety, environmental certification evidence. |
| **Finance / CSR** | CSR expenditure, beneficiary, fines/penalties, and related financial evidence. |
| **Procurement** | Procurement/vendor evidence, including local/MSME/women-led/SHG/SC-ST classifications where applicable. |
| **Corporate ESG / Sustainability** | Cross-entity monitoring, consolidation review, reporting readiness oversight. |

Additional roles must be addable later through admin-controlled role/permission configuration, without code changes.

**Permission model:** every user's effective access is the product of Role × Organization Scope (which entity/subsidiary/BU/project/site/department they are assigned to) × Reporting Period × explicit Permission set. A user may hold different roles/permissions in different organizational scopes (e.g., PM on Project X, read-only reviewer on Project Y).

---

## 11. Organizational Model

The platform must support a **configurable** organizational hierarchy, not a fixed number of hard-coded levels:

```
Group / Parent Organization
  └─ Subsidiary / Entity
       └─ Business Unit / Division
            └─ Region
                 └─ Project
                      └─ Site
                           └─ Department
```

Requirements:

- Multiple subsidiaries, multiple projects per subsidiary, multiple users per project.
- A user can hold different permissions in different organizational scopes simultaneously.
- The hierarchy must be extensible without redesigning the underlying data model (e.g., adding a new subsidiary or a new intermediate level must be a configuration action, not a development task).
- Data submitted at any level must be aggregatable upward through every level above it (see [Section 31](#31-consolidation-requirements)).

---

## 12. Core Product Principles

These principles govern every feature decision in this PRD and must not be violated by any later design document:

1. **Evidence-first, not form-first.** Normal users never manually key ESG values into a form. The only user data-submission action is document upload → verify extracted data.
2. **OCR assists; it never decides.** Extracted values are provisional until a human confirms them. OCR output must never automatically become final reported data.
3. **Calculations are deterministic and reproducible.** No generative AI in the regulatory calculation path. Every calculated value must be re-derivable from its stored inputs.
4. **Configuration over hard-coding.** Organizational hierarchy, roles, metrics, conversion factors, and BRSR mappings are all admin-configurable, not hard-coded into the application.
5. **Nothing reported is unexplainable.** Every material ESG/BRSR value must be traceable back to its original source document.
6. **Least privilege.** Users see and act only within their assigned organizational scope and role permissions.
7. **Nothing important is silently overwritten.** Edits, corrections, and status changes are logged, not destructive.
8. **Scope 1 and Scope 2 are the core priority; Scope 3 is modular.** Scope 3 categories are added incrementally as evidence and data availability allow, without redesigning the platform.

---

## 13. Functional Requirements

Functional requirements are detailed by module in Sections 19–35. At a system level, the platform must support the following functional pillars:

- Authentication and role/permission-based authorization.
- Organizational hierarchy management.
- User and role management with organizational-scope assignment.
- Reporting period management (creation, open/close, submission windows).
- Document upload, secure storage, and metadata capture.
- OCR/document-intelligence extraction with confidence scoring.
- Human verification/edit/confirm workflow for extracted data.
- Validation engine (format, organizational, period, evidence, logical, and anomaly checks).
- Centralized, deterministic calculation engine (Scope 1/2/3).
- Versioned conversion/emission factor management.
- Configurable BRSR metric-to-indicator mapping.
- Multi-level consolidation (Site → Project → Business Unit → Subsidiary → Organization/Group, plus Region/Department where a deployment populates them — see §31).
- Approval workflow with configurable states.
- Full audit trail of all material actions.
- Report generation with drill-down from reported value to source document.
- Admin control-tower monitoring (completeness, evidence coverage, validation, approval, BRSR readiness).
- Notifications for pending tasks, low-confidence extractions, validation failures, and deadlines.
- Duplicate document/record detection.
- Data quality state tracking per record.

---

## 14. Feature List

### Must Have / MVP (P0)

1. Authentication and session management.
2. Admin Dashboard (control tower).
3. Role-based, permission-driven user dashboard.
4. Configurable organization/project hierarchy management.
5. User creation and role/organization-scope assignment.
6. Document upload (single method of user data submission).
7. OCR/document-intelligence extraction.
8. OCR verification screen: view document + extracted fields, edit, confirm/reject.
9. Secure evidence (document) storage with metadata.
10. Canonical ESG record creation and lifecycle tracking.
11. Validation engine (format, organizational, period, evidence, logical checks; anomaly flagging).
12. Conversion/emission factor database (versioned, configurable).
13. Scope 1 calculation.
14. Scope 2 calculation.
15. Basic applicable Scope 3 categories (a modular subset — not the full GHG Protocol Scope 3 category set).
16. HR data workflow (upload → OCR → verify → validate → map to BRSR HR indicators).
17. Water/waste basic workflow.
18. BRSR metric-to-indicator mapping engine (configurable, not hard-coded).
19. Multi-level consolidation (Site → Project → BU → Subsidiary → Organization).
20. Admin report generation with evidence drill-down.
21. Audit trail (all material actions).
22. Submission/validation/approval status tracking and visibility.
22a. Basic in-app notifications (verification required, low confidence, returned, approval required/decided, missing documents) — per `02_TRD.md` §28's MVP scope; only the email channel is deferred to P1.

### Should Have (P1)

*(Note: OCR confidence-gated verification, anomaly detection, and duplicate detection are **not** listed here — they are core P0 behavior, required by §19 rule 9, §29's Validation Engine, and §39's acceptance criteria, and are already covered by P0 items 8 and 11 in §14 above. An earlier draft of this list incorrectly duplicated them as P1; corrected per audit finding C1.)*

- Advanced/extended Scope 3 categories beyond the MVP basic set.
- Data quality dashboard (completeness, evidence coverage, validation, approval, BRSR coverage).
- BRSR readiness score/dashboard (internal management indicator, explicitly not an official regulatory score).
- Batch/bulk document ingestion (e.g., multiple bills at once) where feasible.
- Email notifications for pending tasks, low confidence, validation failures, deadlines. (Basic **in-app** notifications are P0 — see item 22a above; only the email channel is deferred.)

### Nice to Have / Future (P2)

- ERP/source-system connectors (e.g., SAP/Oracle) for automated activity-data ingestion.
- IoT meter integrations for automated utility readings.
- Automated recurring document ingestion (e.g., email-inbox bill capture).
- External supplier/vendor self-service portal.
- Mobile application.
- Advanced AI assistant (natural-language querying across ESG data).
- Predictive ESG analytics / forecasting.
- Multi-country/multi-geography conversion-factor management.

---

## 15. Detailed Feature Descriptions

**Document Upload & Category Selection** — The user selects the ESG activity/category relevant to their role and assigned scope (e.g., "Diesel Purchase," "Electricity Bill," "Water Meter Reading"), then uploads a supporting document. Supported document types are configurable (initially PDF, JPG/JPEG, PNG) and the accepted categories per metric are also configurable, not hard-coded.

**OCR Extraction** — On upload, the document is processed to identify document type (if not already selected) and extract relevant fields, each with a confidence score. This runs asynchronously so the user is not blocked waiting for extraction.

**Verification Screen** — Presents the source document alongside the extracted fields and their confidence scores. The user can Confirm, Edit, or Reject each field/record. Low-confidence fields must be visually flagged and require explicit user attention before confirmation.

**Validation Engine** — After verification, the record passes through format, organizational, period, evidence, logical, and historical/anomaly checks before it is eligible for calculation. Anomalies are review flags, not automatic rejections (legitimate operational variance can occur).

**Calculation Engine** — A centralized service applies unit normalization, selects the applicable versioned conversion factor, applies the formula, and produces the emission/metric result plus scope classification. The full calculation trace (input, normalized value, factor ID/version, formula version, output, timestamp) is stored for reproducibility.

**Conversion Factor Management (Admin)** — Admin/authorized ESG personnel maintain a versioned factor database (factor ID, activity type, value, input/output units, source/reference, geography/applicability, effective dates, status). The application never hard-codes factor values in the frontend or business logic.

**BRSR Mapping Engine (Admin)** — Admin maintains metric-to-BRSR-indicator mappings as configuration data, so BRSR reporting-requirement changes do not require rewriting the application.

**Consolidation** — Verified, validated, and calculated records roll up automatically through every populated level of the configured hierarchy (Site through Project, Business Unit, Subsidiary, to Organization/Group, plus Region/Department where used — see §31), filterable by period, entity, scope, and metric.

**Admin Report Generation & Drill-Down** — Admin generates consolidated ESG/BRSR reports and can click any reported value to drill down through BRSR indicator → ESG metric → calculation → verified activity data → original source document.

**Audit Trail** — Every material action (upload, OCR processing, field edit, verification, validation result, factor selection, calculation, approval, rejection, configuration change, report generation) is logged with user, timestamp, action, record ID, and before/after values where relevant.

---

## 16. Core User Stories

- As a **user with an assigned ESG responsibility**, I want to upload the source document I already have, so that I don't need to learn how to fill an ESG-specific form.
- As a **user**, I want to see exactly what the system extracted from my document before it becomes final, so that I can trust the data is correct before it is reported.
- As a **user**, I want to correct an OCR extraction error, so that inaccurate machine reading doesn't get reported as fact.
- As a **user**, I want to see the status of everything I've submitted (pending, verified, validated, approved, returned), so that I know what still needs my action.
- As an **Admin**, I want to configure the organization hierarchy, roles, and permissions, so that the platform fits our actual organizational structure without custom development.
- As an **Admin**, I want to see reporting completeness and evidence coverage across all projects at any time, so that I am not surprised by gaps close to a filing deadline.
- As an **Admin**, I want to drill down from any reported BRSR number to the original document, so that I can defend the number to an auditor or regulator.

---

## 17. Admin User Stories

- As an Admin, I want to create and manage users, and assign each user a role and an organizational scope, so that access is scoped correctly from day one.
- As an Admin, I want to create/edit the organization hierarchy (entities, subsidiaries, business units, projects, sites), so that the platform reflects our real structure and can grow as we add projects.
- As an Admin, I want to create and open/close reporting periods, so that data submission windows are controlled and predictable.
- As an Admin, I want to view all submissions, their OCR extraction, verification, validation, and approval status across the organization, so that I can monitor reporting health centrally.
- As an Admin, I want to add, edit, and version conversion/emission factors, so that calculations stay current with authoritative sources without code changes.
- As an Admin, I want to maintain BRSR metric-to-indicator mappings, so that changes in BRSR reporting requirements do not require rebuilding the application.
- As an Admin, I want to generate consolidated ESG/BRSR reports filtered by entity/project/period/scope, so that I can produce the outputs needed for corporate reporting.
- As an Admin, I want to correct, reject, or return a record with a reason, so that data-quality issues are resolved without silently altering history.
- As an Admin, I want to view the full audit trail of a record, so that I can answer "who changed this and when" for any reported value.
- As an Admin, I want to see a control-tower view of completion percentages and outstanding issues (missing submissions, low-confidence OCR, validation failures, pending approvals), so that I can act on reporting risk proactively.

## 18. Non-Admin User Stories

- As a **Project Manager**, I want to upload my project's diesel invoice and electricity bill, so that Scope 1 and Scope 2 data is captured without me needing to calculate emissions myself.
- As a **Project Manager**, I want to see only my assigned project(s) and relevant categories, so that I am not confused by irrelevant modules.
- As an **HR user**, I want to upload workforce records (headcount, gender distribution, training), so that HR-related BRSR indicators are populated from source evidence rather than manual entry.
- As an **EHS user**, I want to upload water meter readings and waste disposal certificates, so that environmental metrics are captured accurately from source documents.
- As a **Procurement user**, I want to upload vendor/procurement documents including MSME/women-led vendor evidence, so that procurement-related BRSR indicators are supported by evidence.
- As a **Finance/CSR user**, I want to upload CSR expenditure and beneficiary records, so that CSR-related BRSR indicators are populated with traceable evidence.
- As any **non-admin user**, I want to be notified when a record I submitted is returned for correction, so that I can act quickly and keep my project's data current.
- As a **Corporate ESG/Sustainability user**, I want to view consolidated status across entities (read/review access), so that I can monitor group-level BRSR readiness.

---

## 19. OCR/Document Workflow Requirements

1. The only user-facing data-submission mechanism is document upload; no manual ESG value entry form is exposed to non-admin users.
2. Accepted document types are configurable (MVP baseline: PDF, JPG/JPEG, PNG).
3. Upon upload, the system creates a document record and stores the original file securely before OCR runs.
4. OCR/document intelligence identifies document type (if not user-selected) and extracts relevant fields.
5. Each extracted field carries a confidence score.
6. The verification screen must present the source document and extracted fields together.
7. The user must be able to: **Confirm**, **Edit**, or **Reject** the extraction.
8. The system must record, per field: OCR-original value, user-edited value (if any), final verified value, verifying user, timestamp, document ID, OCR confidence, and verification status.
9. If confidence is low, the field must be flagged and require explicit user verification (and may optionally require additional review for critical values — configurable).
10. If document type cannot be identified, the user must be prompted to select the category manually; calculation must not proceed until required fields are available.
11. If a required field is missing, the record is marked **Incomplete** — the system must never silently invent or infer a missing value.
12. Only user-confirmed data may proceed to validation; OCR output alone is never sufficient.

---

## 20. Scope 1 Requirements

- Supported activity data includes (configurable list): diesel, petrol, CNG, LPG, LNG, coal, and other applicable fuels used in owned/controlled equipment, company-controlled vehicles, generators, and machinery, where applicable.
- Workflow: Fuel document → OCR → user verification → quantity + unit → unit normalization → applicable versioned emission factor → calculation → Scope 1 CO2e → project total → organization total.
- The conversion factor applied must always be selected from the versioned Conversion Factor Database — never hard-coded in application logic.
- Exact fuel-category coverage and applicable emission-factor sources must be **[VERIFIED AGAINST AUTHORITATIVE SOURCE]** during factor-database setup.

## 21. Scope 2 Requirements

- Supported activity data includes: grid electricity, renewable electricity, and other purchased energy categories where applicable.
- Workflow: Electricity/energy document → OCR → user verification → activity value (kWh or equivalent) → source classification (grid vs. renewable, where evidence supports it) → applicable factor/reporting treatment → Scope 2 calculation → consolidation.
- The system must distinguish grid vs. renewable electricity when the source evidence supports that classification, since this affects the applicable reporting treatment.

## 22. Scope 3 Requirements

- Scope 3 is a **modular and extensible** layer, implemented after core Scope 1/2/BRSR coverage is solid.
- MVP scope: a **basic set of applicable categories only** — not the full standard Scope 3 category list. Category selection for MVP should be based on evidence availability, agreed during implementation planning.
- Candidate categories for future/advanced coverage (per `Master_Approach.md` §17): purchased goods/services, capital goods, fuel/energy-related activities not in Scope 1/2, upstream transportation, waste generated in operations, business travel, employee commuting, upstream/downstream leased assets, downstream transportation, processing/use/end-of-life categories — where applicable and where evidence supports collection.
- Scope 3 follows the same evidence-first process as Scope 1/2 (document → OCR → verification → applicable factor → estimate).
- The platform must not force all Scope 3 categories into the MVP if evidence/data availability is insufficient for a given category.

## 23. HR Requirements

- HR provides employee/workforce-related source documents via the standard upload → OCR → verify → validate → calculate → BRSR-map workflow.
- Candidate HR data points (per `Master_Approach.md` §18): board members by gender, KMP count by gender, permanent/other employees, permanent/other workers, gender distribution, employee turnover, training records/percentage trained, and other BRSR HR indicators. **[VERIFY exact indicator set AGAINST AUTHORITATIVE BRSR SOURCE]**.
- HR users do not manually calculate BRSR percentages — the calculation engine derives them from verified counts.

## 24. EHS/Environment Requirements

- Covers: electricity/energy (where assigned to EHS rather than PM), fuel, water withdrawal, water consumption, wastewater discharge, waste generation, waste recovery/recycling/reuse, waste disposal, air emissions, safety indicators, and environmental certifications.
- Water example workflow: water bill/meter record → OCR → verify withdrawal → validation → water calculation → BRSR output. Water consumption may be derived as withdrawal minus discharge where applicable data exists.
- Waste categories (configurable, examples per `Master_Approach.md` §19): plastic, e-waste, biomedical, construction & demolition, battery, other hazardous, other non-hazardous, and other applicable categories.

## 25. Procurement Requirements

- Covers: local procurement, MSME procurement, SHG procurement, women-led entities, SC/ST-related procurement (where applicable), vendor classifications, supporting vendor certificates/registration records, and preferential-procurement-policy evidence.
- Workflow: procurement document → OCR → verify vendor/value/classification → validation → calculation → BRSR mapping.

## 26. Finance/CSR Requirements

- Covers: CSR expenditure, CSR spend in aspirational districts (where applicable), CSR beneficiaries (including vulnerable/marginalized beneficiary information where applicable), fines and penalties, supporting payment records, court orders, and other relevant financial evidence.
- Workflow: standard evidence-first flow (upload → OCR extraction → user verification → validation → mapping).

## 27. BRSR Mapping/Reporting Requirements

- BRSR is a **configuration/mapping layer**, not hard-coded questions scattered through the application.
- Each ESG metric configuration must include (per `Master_Approach.md` §28): metric ID, name, description, unit, frequency, source type, evidence requirement, validation rules, calculation rule, applicable scope (if any), BRSR section, BRSR indicator/question, reporting type, and applicability.
- Concept: Source Document → ESG Metric → Calculated/Verified Value → BRSR Indicator → Report.
- If BRSR reporting requirements change, Admin must be able to update mappings without requiring application code changes.
- Exact BRSR section/indicator structure (Section A/B/C, Essential/Leadership indicators) must be **[VERIFIED AGAINST AUTHORITATIVE BRSR SOURCE]** and configured accordingly — this PRD does not fix indicator codes.

## 28. Evidence/Audit Requirements

- Every important ESG record must maintain a complete evidence trail: source document, OCR value, verified value, evidence file reference, submitted-by/verified-by users, validation result, conversion factor (ID/version), calculated result, scope, BRSR mapping, and approval status (per the example structure in `Master_Approach.md` §22).
- Every material action must generate an audit-log entry: event ID, user, timestamp, action, record ID, old value (where relevant), new value (where relevant), reason (where relevant).
- The system must never silently overwrite historically important information.
- Documents must not be casually deletable, since they may constitute evidence for reported values; deletion/retention policy is Admin-controlled.

## 29. Validation Requirements

Validation runs after user verification and before calculation/reporting, across these categories:

- **Format validation** — numeric values, dates, units, required fields.
- **Organizational validation** — project exists; user has permission; document belongs to the assigned organization/project where detectable.
- **Period validation** — document date matches the reporting period; duplicate reporting-period submissions are flagged.
- **Evidence validation** — required evidence attached; document readable; required information present.
- **Logical validation** — no negative quantities where not permitted; no impossible units; no invalid conversions; no internally inconsistent values.
- **Historical/anomaly validation** — comparison with previous periods; unusually high/low values flagged; comparison against project history where sufficient data exists.

Anomalies are **review flags**, not automatic rejections, because legitimate operational changes can occur.

## 30. Calculation Engine Requirements

- All calculations are centralized in a single calculation engine — not duplicated per module or per frontend screen.
- Pipeline: Verified Activity Data → Unit Normalization → Factor Selection → Formula → Result → Scope Classification → Stored Calculation Trace.
- Each calculated value must persist: input value, input unit, normalized value, factor ID, factor version, formula/version, output, calculation timestamp, and calculation-engine version — sufficient to reproduce the result later.
- Calculations must be **deterministic and reproducible**; generative AI must never be the sole authority for a regulatory calculation.
- Users are never responsible for unit conversion — the system normalizes supported units (e.g., litres, kg, tonnes, kWh, MWh, Nm³, and other configured units) while retaining the original extracted value alongside the normalized value.

## 31. Consolidation Requirements

- Recommended operational cadence: monthly source submission → monthly validation → monthly approval → annual aggregation → BRSR reporting.
- Consolidation rolls up through every level of the configured organizational hierarchy (§11) generically — Department and Site records aggregate up through Project, optional Region, Business Unit, Subsidiary, to Organization/Group. No fixed subset of levels is hard-coded; whatever levels a given deployment configures participate in the same roll-up (per `Master_Approach.md` §29, corrected per audit finding C3).
- The same metric must be aggregatable at every level of the hierarchy where applicable.
- Admin must be able to filter consolidated views by reporting year, month, entity, subsidiary, project, region, department, scope, and metric.

## 32. Notifications/Status Requirements

- The system must notify users about: new submission tasks, OCR verification required, low-confidence extractions, validation failures, records returned for correction, approvals required, approaching reporting deadlines, and missing documents.
- Admin must see organization-level pending-task visibility (not just their own tasks).
- Every record must expose a clear status to its owner and to Admin, following a configurable approval-state lifecycle (see below).

**Recommended status lifecycle** (per `Master_Approach.md` §30 — exact chain configurable by metric/role):

```
Draft → Document_Uploaded → OCR_Completed → User_Verified → Validation_Pending
  → Validated → Review_Pending → Approved → Included_In_Report
```
Alternate states: `Rejected`, `Returned_For_Correction`, `Incomplete`, `Flagged_For_Review`.

## 33. Security/Access Requirements (Product Level)

- Authentication required for all users.
- Role-based access control combined with organization/project-level authorization (users only access records within their assigned scope).
- Secure storage of uploaded documents; encrypted data in transit.
- Secure handling of credentials and session management.
- Full audit logging of material actions (see [Section 28](#28-evidenceaudit-requirements)).
- Admin-only configuration actions (hierarchy, roles/permissions, factors, BRSR mappings, reporting periods).
- Least-privilege permission model as the default posture.

*(Detailed technical security design — encryption standards, authentication mechanisms, token handling, infrastructure hardening — belongs in the Security Design document, not this PRD.)*

## 34. Reporting/Dashboard Requirements

**Admin Control Tower** should surface, at minimum: total organizations, total projects, active users, submission-completion %, evidence-coverage %, validation-completion %, approval-completion %, Scope 1/2/3 completion %, and BRSR readiness %, plus an issue panel: projects with missing submissions, records missing evidence, low-confidence OCR records, validation failures, anomalous values, pending approvals, and incomplete BRSR indicators. All cards/indicators should be clickable/drillable to underlying records.

**Report generation** must support: generating ESG reports, BRSR report/output, and consolidated reports; exporting data; filtering by entity/project/period/scope; and drilling down from any reported number to its source evidence (see [Section 39](#39-acceptance-criteria-for-major-features)).

**User dashboard** surfaces only what's relevant to the logged-in user's role and scope: assigned organization/project, current reporting period, pending document submissions, OCR extraction status, verification tasks, returned/rejected records, approved records, data-quality status, and relevant ESG categories. Irrelevant modules must not be shown.

## 35. Data Quality/Readiness Requirements

- Each ESG record carries a data-quality state: `Complete`, `Incomplete`, `Verified`, `Validated`, `Flagged`, `Approved`, `Rejected`.
- At organization level, the platform must show: completeness, evidence coverage, validation status, approval status, and BRSR coverage.
- A configurable **BRSR Readiness Score** may combine data completeness, evidence completeness, validation completion, approval completion, required-indicator coverage, and outstanding exceptions. This score is an **internal management/readiness indicator only** — it must never be presented as an official regulatory score.
- Duplicate detection should attempt to identify: the same bill uploaded twice, the same invoice number, the same document hash, and the same project + period + metric combination. Possible duplicates are **flagged for review**, never silently discarded.

---

## 36. Out-of-Scope Items

The following are explicitly out of scope for this product (per `Master_Approach.md` §47), and must not be built:

- A generic ESG dashboard with no evidence trail behind reported numbers.
- Manual CO2e/emissions calculation by end users.
- Large manual ESG data-entry forms as the normal submission path.
- Hard-coded conversion factors embedded in frontend code.
- Hard-coded BRSR questions scattered throughout the UI.
- Unrestricted, org-wide data access for every user regardless of role/scope.
- Automatic trust of OCR output without human verification.
- Use of generative AI as the sole authority for a regulatory calculation.
- Hundreds of project-specific bespoke forms.
- A full ERP replacement.
- A distinct auditor/external-reviewer login and portal (evidence drill-down capability is required, but a separate external-facing auditor product is out of scope for the MVP; Admin can export/share drill-down views manually).
- Automated ERP/IoT/source-system integrations (P2/future — see [Section 14](#14-feature-list)).
- Exact, fixed BRSR indicator wording/codes — these are configuration data to be populated from the authoritative BRSR source, not hard-coded product requirements in this PRD.

---

## 37. MVP Boundaries

The MVP must demonstrate a **complete vertical slice** end-to-end, then replicate the same framework across modules — rather than fully building every enterprise feature. Per `Master_Approach.md` §44–45, the reference vertical slice is:

```
User → Upload Electricity Bill → OCR → Verify → Validation
  → Scope 2 Calculation → Project Total → Admin Dashboard
  → Consolidated Report → Evidence Drill-down
```

The MVP must then extend the same framework (not bespoke rebuilds) to: diesel/Scope 1, HR, water, waste, and one or two Scope 3 categories.

MVP feature boundary = the **Must Have / MVP (P0)** list in [Section 14](#14-feature-list). Everything in Should Have (P1) and Nice to Have (P2) is explicitly deferred.

The recommended demo scenario (Admin sets up org/users → PM uploads diesel invoice and electricity bill → OCR extracts → PM verifies → system validates/calculates Scope 1 and Scope 2 → HR and EHS submit their evidence → Admin views Control Tower → Admin generates a BRSR/ESG report → Admin drills down from a reported number back to the original bill) should be achievable end-to-end in the MVP without any manual data re-entry step.

---

## 38. Success Metrics

- **100% of reported Scope 1/Scope 2 values in the MVP demo are traceable** to an original source document via drill-down, with zero manually-keyed ESG values.
- **Time to submit one piece of evidence** (upload → verify → confirm) is short enough that a non-technical field user can complete it without training beyond a brief walkthrough.
- **OCR verification-required rate**: proportion of extracted fields below the confidence threshold that correctly get flagged for mandatory review (target: no low-confidence field reaches calculation unverified).
- **Submission completeness %** and **evidence coverage %** visible on the Admin Control Tower, trending upward across successive reporting periods for a given pilot project set.
- **Zero silent data loss/overwrite incidents** — every edit to a verified or approved value is captured in the audit trail.
- **Drill-down success rate**: 100% of consolidated report values allow Admin to reach the originating document in a bounded number of clicks (target: ≤ described in acceptance criteria, [Section 39](#39-acceptance-criteria-for-major-features)).
- **Framework reuse**: each additional metric/category added after the first vertical slice (e.g., diesel after electricity) requires configuration, not new bespoke screens/logic.

---

## 39. Acceptance Criteria for Major Features

**Document Upload & OCR Verification**
- Given a user with an assigned category, when they upload a supported document type, the system creates a document record, stores the original file, and triggers OCR extraction without blocking the UI.
- Given OCR has produced extracted fields, when the user opens the verification screen, the original document and extracted fields (with confidence scores) are shown together.
- Given a field's confidence is below the configured threshold, the user cannot confirm the record without explicitly reviewing that field.
- Given the user edits an extracted value, the system retains both the original OCR value and the edited value, tagged with the editing user and timestamp.

**Validation**
- Given a verified record, the system runs format, organizational, period, evidence, logical, and anomaly checks before the record becomes eligible for calculation.
- Given an anomaly is detected, the record is flagged for review, not automatically rejected.

**Calculation**
- Given a validated record, the calculation engine selects the applicable versioned conversion factor and produces a scope-classified result, persisting the full calculation trace.
- Given the same input record and same factor version, the calculation is reproducible and yields an identical result.

**Consolidation & Reporting**
- Given validated/approved records across multiple projects, the system correctly aggregates the same metric at Site, Project, Business Unit, Subsidiary, and Organization levels.
- Given a generated consolidated report, Admin can click any reported value and reach, in sequence: BRSR indicator → ESG metric → calculation → verified activity data → original supporting document.

**Access Control**
- Given a non-admin user, they can view and act only on records within their assigned organizational scope and role permissions; attempts to access out-of-scope records are denied.

**Audit Trail**
- Given any material action (upload, edit, verify, validate, calculate, approve, reject, configuration change), an audit-log entry is created capturing user, timestamp, action, record ID, and old/new values where applicable.

**Admin Configuration**
- Given Admin updates a conversion factor or BRSR mapping, the change is versioned and does not alter the calculation trace of previously calculated records.

---

## 40. Risks and Assumptions

**Risks**

- **OCR accuracy risk** on varied, sometimes poor-quality scanned documents (handwritten/stamped bills) may increase the manual-verification burden if not managed with clear low-confidence workflows.
- **Regulatory-content risk**: exact BRSR indicator structure and required conversion-factor values are not fixed in this PRD and must be confirmed from authoritative sources before go-live; using incorrect factors/mappings would compromise reporting accuracy. Mitigated by treating both as versioned configuration data, not code.
- **Adoption risk**: field users (PM, HR, EHS, Procurement, Finance/CSR) may have varying digital literacy; the upload-and-verify flow must remain simple enough to require minimal training.
- **Scale risk**: an organization the size of MEIL may generate very high submission volumes; asynchronous OCR processing and background workers are assumed necessary (architectural detail deferred to TRD).
- **Data completeness risk**: incomplete Scope 3 evidence may leave gaps in BRSR coverage; the modular Scope 3 approach is intended to manage this risk by not overcommitting scope in the MVP.
- **Duplicate/conflicting submissions**: multiple users or repeated uploads for the same period/metric could create data-quality issues if duplicate detection is not effective.

**Assumptions**

- `Master_Approach.md` is the authoritative product blueprint for this PRD; where this PRD is silent, that document governs.
- Exact BRSR indicator codes, sections, and required fields will be finalized from the authoritative BRSR source material during BRSR-mapping configuration, not invented here.
- Exact conversion/emission factor values and standards will be sourced from authoritative references during conversion-factor-database setup, not invented here.
- Reporting cadence is monthly at the operational/source level with annual roll-up for BRSR, per `Master_Approach.md` §29, unless a later document revises this.
- Technology stack, architecture, and infrastructure choices are deliberately out of scope for this PRD and will be defined in `02_TRD.md`.

---

## 41. Future Scalability Considerations

Per `Master_Approach.md` §46, the platform must scale without redesign by following these principles, which this PRD's requirements are written to support:

1. Configuration over hard-coding (hierarchy, roles, metrics, factors, BRSR mappings).
2. Role-based access over fixed user types.
3. Organization hierarchy over flat project lists.
4. A metric catalogue over separate forms/modules per data type.
5. Document-driven ingestion over manual entry.
6. A single central calculation engine rather than per-module calculation logic.
7. Versioned conversion factors.
8. Configurable BRSR mapping.
9. Asynchronous OCR processing.
10. A modular Scope 3 architecture that can absorb new categories incrementally.
11. Evidence lineage and audit logging built into the data model from the start, not bolted on later.

Future-phase capabilities anticipated (not committed for MVP): ERP/IoT source-system integrations, a supplier/vendor self-service portal, a mobile application, an advanced natural-language ESG assistant, predictive ESG analytics, and multi-country/multi-geography conversion-factor management (see [Section 14, P2](#14-feature-list)).

---

*End of 01_PRD.md. Downstream documents (TRD, SRS, database design, API specification, OCR specification, calculation-engine specification, BRSR mapping document, role/permission matrix, UI/UX specification, security design, testing plan, deployment plan, roadmap) should be generated from this PRD together with `Master_Approach.md`, per the document set defined in `Master_Approach.md` §49.*
