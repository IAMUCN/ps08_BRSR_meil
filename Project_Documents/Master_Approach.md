
# PS-08 ESG/BRSR Reporting Portal
## Implementation Approach / Master System Blueprint
**Version: 1.0**
Purpose: Base document for generating PRD, TRD, SRS, architecture, database design, API specification, UI/UX specification, testing plan, and other project documents.

## 1. Project Objective

Build a web-based ESG/BRSR reporting platform for a large, multi-entity infrastructure organization such as MEIL.

The platform must solve the core problem of collecting sustainability and BRSR-related data from a large number of projects/business units and consolidating that information into reliable, traceable ESG and BRSR outputs.

The system must be practical for the hackathon MVP but architected so it can scale from a small pilot to hundreds of projects, subsidiaries, business units and users.

The central product concept is:

###     Bill / Source Document
            |
            v
###           Ocr
            |
            v
###      Extracted Data
            |
            v
###      User Verification
            |
            v
###        Validation
            |
            v
###      Esg Calculation
            |
            v
###   Scope 1 / Scope 2 / Scope 3
            |
            v
###       Consolidation
            |
            v
###        Brsr Mapping
            |
            v
###       Admin Control
            |
            v
###       Report Generation

### Important Product Decision:
There is NO manual structured data-entry form for normal users.

The only data-submission method available to users is:
    1. Upload a valid bill/supporting document.
    2. System performs OCR/document extraction.
    3. System displays extracted details.
    4. User verifies, edits if necessary, and confirms.
    5. Confirmed information enters the validation/calculation workflow.

The system therefore follows an evidence-first data collection model.

## 2. Core Problem Being Solved

A large infrastructure organization has:
- Many subsidiaries/entities.
- Hundreds of live projects/business units.
- Multiple departments producing ESG-relevant information.
- Different source documents and operational records.
- Large volumes of monthly data.
- Need for consolidation at corporate level.
- Need to calculate emissions using appropriate conversion/emission factors.
- Need to map collected information to BRSR reporting requirements.
- Need for evidence, validation, approval and traceability.

The portal should reduce manual ESG data collection effort while improving consistency, traceability and reporting readiness.

The podcast context indicates that MEIL handles a very large project ecosystem and considers centralized collection of sustainability information from many business units a major challenge. The desired solution is comprehensive and should prioritize broad functionality and end-to-end coverage rather than perfecting only one small module.

## 3. Product Vision

Create an "Evidence-to-BRSR Digital Thread."

Every reported ESG value should be traceable through the complete chain:

    Source Document
        ->
    OCR Extraction
        ->
    User Verification
        ->
    Validated Activity Data
        ->
    Conversion Factor
        ->
    Calculation
        ->
    Scope Classification
        ->
    Organizational Consolidation
        ->
    BRSR Indicator
        ->
    Final Report

The system should not merely produce a number.
It should preserve how the number was obtained.

Example:

    Electricity Bill
        ->
    102,430 kWh extracted
        ->
    User confirms
        ->
    Validation passes
        ->
    Applicable electricity factor selected
        ->
    Scope 2 calculated
        ->
    Project total
        ->
    Subsidiary total
        ->
    Organization total
        ->
    BRSR output

## 4. User Access Model

There are two major dashboard experiences:

### A. Admin Dashboard
### B. Non-Admin / Role-Based User Dashboard

The Admin has overall control.

Non-admin users should not have unrestricted access. Their dashboard and actions are determined by:
- Role
- Assigned organization
- Assigned subsidiary/business unit
- Assigned project/site
- Reporting period
- Permission set

Do NOT hard-code the application around only "HR level" and "Project Manager level."

Instead implement:

    User
      ->
    Role
      ->
    Organization Scope
      ->
    Permissions

Example:

    User: Project Manager A
    Role: PROJECT_MANAGER
    Assigned Project: Project X
    Permissions:
       - Upload environmental documents
       - Review extracted environmental data
       - Submit Scope 1 data
       - Submit Scope 2 data
       - Submit applicable Scope 3 data
       - View own project data
       - Cannot modify HR data
       - Cannot access unrelated projects
       - Cannot generate final corporate report

## 5. Organizational Hierarchy

The database and authorization system should support a hierarchy such as:

    Group / Parent Organization
        |
        +-- Subsidiary / Entity
              |
              +-- Business Unit / Division
                    |
                    +-- Region
                          |
                          +-- Project
                                |
                                +-- Site
                                      |
                                      +-- Department

The exact hierarchy must be configurable.

The system must support:
- Multiple subsidiaries.
- Multiple projects per subsidiary.
- Multiple users per project.
- One user having different permissions in different organizational scopes.
- Future expansion without redesigning the database.

## 6. Core Roles

Minimum roles for the initial architecture:

## 1. Admin
   Full system control.

## 2. Hr
   Responsible for employee/workforce-related source documents and data.

## 3. Project_Manager
   Responsible for project-level environmental/activity documents, especially Scope 1, Scope 2 and applicable Scope 3 information.

## 4. Ehs / Environment
   Responsible for environmental records such as water, waste, air emissions, safety and related evidence where applicable.

## 5. Finance / Csr
   Responsible for financial/CSR-related evidence and information where applicable.

## 6. Procurement
   Responsible for procurement/vendor-related information and evidence where applicable.

## 7. Corporate Esg / Sustainability
   Responsible for corporate-level review, monitoring, consolidation and ESG management.

Additional roles may be added later through an admin-controlled role/permission system.

## 7. Admin Dashboard

The Admin Dashboard is the central control tower.

Admin capabilities:

A. User management
- Create user.
- Edit user.
- Activate/deactivate user.
- Assign role.
- Assign organization.
- Assign subsidiary.
- Assign project/site.
- Configure permissions.

B. Organization management
- Create entities.
- Create subsidiaries.
- Create business units.
- Create projects.
- Assign projects to organizational units.
- Maintain hierarchy.

C. Reporting period management
- Create reporting period.
- Open/close reporting period.
- Define submission windows.
- Monitor pending submissions.

D. ESG data management
- View all submissions.
- View status.
- View evidence.
- View OCR extraction.
- View user verification.
- View validation results.
- View calculations.
- View approvals.
- Correct/reject/return data where authorized.

E. Conversion factor management
- Add factor.
- Edit factor.
- Version factor.
- Define source.
- Define effective date.
- Define unit.
- Define applicability.

F. BRSR configuration
- Maintain metric-to-BRSR mappings.
- Maintain indicator metadata.
- Maintain required fields.
- Maintain evidence requirements.
- Maintain calculation rules.

G. Reporting
- Generate ESG report.
- Generate BRSR report/output.
- Generate consolidated report.
- Export data.
- Filter by entity/project/period/scope.
- Drill down from report number to source evidence.

H. Monitoring
- Submission completeness.
- Evidence coverage.
- Validation status.
- Approval status.
- Anomalies.
- Missing data.
- OCR confidence.
- BRSR readiness.

## 8. User Dashboard

There is one common non-admin dashboard framework, but content changes according to role.

The user should see:
- Assigned organization/project.
- Current reporting period.
- Pending document submissions.
- OCR extraction status.
- Verification tasks.
- Returned/rejected records.
- Approved records.
- Data quality status.
- Relevant ESG categories.

The user should NOT see irrelevant modules.

Example:

HR:
- Employee-related documents.
- Workforce records.
- Training records.
- Turnover-related source documents.
- Board/KMP information where assigned.
- HR submission status.

Project Manager:
- Scope 1.
- Scope 2.
- Applicable Scope 3.
- Energy.
- Fuel.
- Electricity.
- Relevant water/waste/environmental documents.

### Ehs:
- Water.
- Waste.
- Air emissions.
- Safety.
- Environmental certifications.
- Related evidence.

Procurement:
- Vendor/procurement documents.
- MSME/local procurement evidence.
- Women-led/SHG/SC/ST-related vendor evidence where applicable.

Finance/CSR:
- CSR expenditure.
- CSR beneficiary/project evidence.
- Fines/penalties and related records where applicable.

## 9. Data Submission Model

There is ONLY ONE normal user submission method:

###     Upload Document

No manual ESG data form should be exposed to ordinary users.

Supported document types should be configurable, initially including:
### - Pdf.
### - Jpg/Jpeg.
### - Png.
- Scanned bills.
- Supporting certificates.
- Invoices.
- Meter/billing documents.
- Disposal certificates.
- Fuel invoices.
- Electricity bills.
- Relevant HR/finance/procurement supporting documents.

The exact accepted document categories should be controlled by the metric configuration.

## 10. Document Upload Workflow

Step 1:
User selects the relevant ESG category / task.

Step 2:
User uploads a valid supporting document.

Step 3:
System creates a document record.

Step 4:
System stores the original document securely.

Step 5:
OCR/document intelligence processes the document.

Step 6:
System identifies the document type.

Step 7:
System extracts relevant fields.

Step 8:
System assigns confidence scores to extracted values.

Step 9:
System shows extracted information to the user.

Step 10:
User verifies the information.

Step 11:
User can edit an incorrect extraction.

Step 12:
User confirms the final extracted information.

Step 13:
System records:
- Original value from OCR.
- User-edited value, if any.
- Final verified value.
- User ID.
- Timestamp.
- Document ID.
- OCR confidence.
- Verification status.

Step 14:
The verified data enters validation.

Step 15:
After validation, the system calculates the required ESG metric.

## 11. Ocr Verification Screen

The verification screen is critical.

Example:

    DOCUMENT: Electricity_Bill_August_2026.pdf

    Extracted Details
    --------------------------------
    Project: MEIL Project X
    Billing Period: 01-Aug-2026 to 31-Aug-2026
    Bill Number: EB-839271
    Consumption: 102,430
    Unit: kWh

    OCR Confidence:
    Consumption: 98%
    Billing Period: 96%
    Project: 94%

    [Confirm]
    [Edit]
    [Reject]

The system should ideally show the document and extracted fields together so the user can verify them.

The user is not expected to calculate emissions.

The user only verifies source information.

## 12. Ocr Design Principles

OCR should be treated as an input-assistance layer, not the final authority.

Never directly trust OCR output.

Required flow:

###     Ocr
      ->
    Confidence
      ->
    Human Verification
      ->
    Validation
      ->
    Accepted Data

If confidence is low:
- Flag the field.
- Require user verification.
- Optionally require additional review for critical values.

If document type cannot be identified:
- Ask user to select the appropriate category.
- Do not calculate until required fields are available.

If a required field is missing:
- Mark record incomplete.
- Do not silently invent data.

## 13. Document-To-Metric Mapping

Every document type should be associated with one or more possible metrics.

Examples:

Electricity Bill
    ->
    Grid Electricity Consumption
    ->
    Scope 2

Diesel Invoice
    ->
    Diesel Consumption
    ->
    Scope 1

Petrol/Fuel Record
    ->
    Petrol Consumption
    ->
    Scope 1

Renewable Energy Certificate / relevant record
    ->
    Renewable Electricity
    ->
    Scope 2-related reporting

Waste Disposal Certificate
    ->
    Waste Quantity / Treatment
    ->
    Relevant waste metric / Scope 3 where applicable

Water Bill / Meter Record
    ->
    Water Withdrawal / Consumption
    ->
    Water metrics

Employee/HR supporting document
    ->
    Relevant workforce metric
    ->
    BRSR mapping

The mapping must be configurable rather than hard-coded.

## 14. Common Esg Data Model

Use a canonical ESG record rather than creating a completely separate database structure for every metric.

Conceptual ESG Record:

###     Esg_Record
      - record_id
      - organization_id
      - entity_id
      - business_unit_id
      - project_id
      - site_id
      - department_id
      - reporting_period
      - metric_id
      - category
      - activity_value
      - activity_unit
      - verified_value
      - source_document_id
      - OCR_extraction_id
      - verification_status
      - validation_status
      - approval_status
      - calculation_status
      - scope
      - emission_value
      - emission_unit
      - conversion_factor_id
      - BRSR_mapping_id
      - submitted_by
      - verified_by
      - approved_by
      - created_at
      - updated_at

This allows Scope 1, Scope 2, Scope 3 and non-emission BRSR metrics to share a common lifecycle.

## 15. Scope 1

Scope 1 is the first major emissions module.

Potential activity data:
- Diesel.
- Petrol.
### - Cng.
### - Lpg.
### - Lng.
- Coal.
- Other applicable fuels.
- Fuel used in owned/controlled equipment.
- Company-controlled vehicles where applicable.
- Generators and machinery where applicable.

Workflow:

    Fuel Document
        ->
###     Ocr
        ->
    User Verification
        ->
    Quantity + Unit
        ->
    Unit Normalization
        ->
    Applicable Emission Factor
        ->
    Calculation
        ->
    Scope 1 CO2e
        ->
    Project Total
        ->
    Organization Total

Example:

    Diesel = 2,500 L
    Factor = configurable
    Result = Diesel Quantity x Applicable Factor

Do not hard-code one factor permanently.

The conversion factor must be selected from a versioned factor database.

## 16. Scope 2

Scope 2 focuses on purchased energy/electricity.

Potential activity data:
- Grid electricity.
- Renewable electricity.
- Other purchased energy categories if applicable.

Workflow:

    Electricity Bill / Energy Document
        ->
###     Ocr
        ->
    User Verification
        ->
    kWh / relevant activity value
        ->
    Source classification
        ->
    Applicable factor / reporting treatment
        ->
    Scope 2 calculation
        ->
    Consolidation

Example:

    Electricity = 100,000 kWh
        ->
    Applicable electricity factor
        ->
    CO2e
        ->
    Scope 2

The system should distinguish grid and renewable electricity when the source evidence supports that classification.

## 17. Scope 3

Scope 3 should be implemented as a modular and extensible layer.

The podcast context indicates Scope 3 is a bonus relative to the immediate emphasis on Scope 1 and Scope 2, so implementation priority should be:

    Scope 1 + Scope 2
        ->
    Core BRSR coverage
        ->
    Basic applicable Scope 3
        ->
    Advanced Scope 3

Potential categories include:
- Purchased goods/services.
- Capital goods.
- Fuel/energy-related activities not included in Scope 1/2.
- Upstream transportation.
- Waste generated in operations.
- Business travel.
- Employee commuting.
- Upstream/downstream leased assets where applicable.
- Downstream transportation.
- Processing/use/end-of-life categories where applicable.

Scope 3 should use the same evidence-first process.

Example employee commuting approach:

    Supporting employee/travel document
        ->
    OCR / extraction
        ->
    User verification
        ->
    Transport mode
        ->
    Distance/frequency where available
        ->
    Applicable factor
        ->
    Scope 3 estimate

Do not force all Scope 3 categories into the MVP if evidence/data availability is insufficient.

## 18. Hr Module

HR provides employee/workforce source documents through upload and verification.

Potential HR data:
- Board members by gender.
- KMP count by gender.
- Permanent employees.
- Other employees.
- Permanent workers.
- Other workers.
- Gender distribution.
- Employee turnover.
- Training.
- Percentage trained.
- Other relevant BRSR HR indicators.

The system extracts information from supporting documents and maps the verified information to the relevant metrics.

HR does not manually calculate BRSR percentages.

Example:

    HR Source Document
        ->
###     Ocr
        ->
    Verify employee counts
        ->
    Validation
        ->
    Calculation engine
        ->
    Gender percentage / turnover / training metric
        ->
    BRSR mapping

## 19. Ehs / Environment Module

Potential information:
- Electricity/energy where assigned.
- Fuel.
- Water withdrawal.
- Water consumption.
- Wastewater discharge.
- Waste generation.
- Waste recovery/recycling/reuse.
- Waste disposal.
- Air emissions.
- Safety indicators.
- Environmental certifications.

Water example:

    Water Bill / Meter Record
        ->
###     Ocr
        ->
    Verify withdrawal
        ->
    Validation
        ->
    Water calculation
        ->
    BRSR output

The Inputs material identifies water withdrawal by source and water consumption as withdrawal minus discharge where applicable.

Waste categories can include:
- Plastic.
- E-waste.
- Biomedical.
- Construction and demolition.
- Battery.
- Other hazardous waste.
- Other non-hazardous waste.
- Other applicable categories.

## 20. Procurement Module

Potential source information:
- Local procurement.
- MSME procurement.
- SHG procurement.
- Women-led entities.
- SC/ST-related procurement where applicable.
- Vendor classifications.
- Supporting vendor certificates/registration records.
- Preferential procurement policy.

Workflow:

    Procurement document
        ->
###     Ocr
        ->
    Verify vendor/value/classification
        ->
    Validation
        ->
    Calculation
        ->
    BRSR mapping

## 21. Finance / Csr Module

Potential information:
- CSR expenditure.
- CSR spend in aspirational districts where applicable.
- CSR beneficiaries.
- Vulnerable/marginalized beneficiary information.
- Fines and penalties.
- Supporting payment records.
- Court orders.
- Other relevant financial evidence.

The user uploads source evidence.
OCR extracts required information.
User verifies it.
The system validates and maps it.

## 22. Evidence-First Record Structure

Every important ESG record should maintain a complete evidence trail.

Example:

    ESG Record #MEIL-2026-08-00125

    Project:
    Project X

    Metric:
    Diesel Consumption

    Period:
    August 2026

    OCR Value:
###     2,500 L

    Verified Value:
###     2,500 L

    Evidence:
    Diesel_Invoice_Aug_2026.pdf

    Submitted By:
    User A

    Verified By:
    User A

    Validation:
###     Passed

    Conversion Factor:
    Factor ID / Version

    Calculated Emission:
    X tCO2e

    Scope:
    Scope 1

    BRSR Mapping:
    Relevant indicator

    Approval:
    Approved

The system must preserve this lineage.

## 23. Validation Engine

Validation happens after user verification and before final calculation/reporting.

Validation categories:

A. Format validation
- Numeric values.
- Dates.
- Units.
- Required fields.

B. Organizational validation
- Project exists.
- User has permission.
- Document belongs to assigned organization/project where detectable.

C. Period validation
- Document date matches reporting period.
- Duplicate reporting period submissions flagged.

D. Evidence validation
- Required evidence attached.
- Document readable.
- Required information present.

E. Logical validation
- Negative quantities where not permitted.
- Impossible units.
- Invalid conversions.
- Inconsistent values.

F. Historical/anomaly validation
- Compare with previous periods.
- Flag unusually high/low values.
- Compare against project history where enough data exists.

An anomaly should generally be a REVIEW FLAG, not an automatic rejection, because legitimate operational changes can occur.

## 24. Ai / Ocr Role

AI should be used where it reduces manual effort, not where deterministic rules are safer.

Good AI use cases:
- OCR/document extraction.
- Document classification.
- Field extraction.
- Missing-field detection.
- Anomaly detection.
- Duplicate document detection.
- Natural-language search/query.
- Assistance in identifying likely metric mapping.

Do NOT use generative AI as the sole authority for regulatory emission calculations.

Calculations should be deterministic and reproducible.

AI output should always be reviewable where it affects reported data.

## 25. Conversion Factor Engine

Create a dedicated Conversion Factor Database.

Each factor should contain:

    factor_id
    factor_name
    activity_type
    source
    value
    input_unit
    output_unit
    geography/applicability
    standard/reference
    version
    effective_from
    effective_to
    status
    notes

Examples of factor categories:
- Diesel.
- Petrol.
### - Cng.
### - Lpg.
- Coal/lignite where applicable.
- Grid electricity.
- Other fuels/activities.

The exact factor values and standards must be verified against authoritative references during implementation.

The application should not bury factor values inside frontend code.

Admin or authorized ESG personnel should be able to manage factor versions.

## 26. Calculation Engine

Calculations must be centralized.

Conceptual pipeline:

    Verified Activity Data
            ->
    Unit Normalization
            ->
    Factor Selection
            ->
    Formula
            ->
    Result
            ->
    Scope Classification
            ->
    Store Calculation Trace

Every calculated value should preserve:
- Input value.
- Input unit.
- Normalized value.
- Factor ID.
- Factor version.
- Formula/version.
- Output.
- Calculation timestamp.
- Calculation engine version.

This allows the result to be reproduced later.

## 27. Unit Normalization

Users should not be responsible for converting units.

The system should normalize supported units.

Examples:
- Litres.
- kg.
- tonnes.
- kWh.
- MWh.
- Nm3.
- Other configured units.

Example:

    User document:
###     2.5 Kl

    System:
###     2.5 Kl -> 2,500 L

    Then:
    2,500 L -> emission calculation

The original extracted value must remain stored alongside the normalized value.

## 28. Brsr Mapping Engine

BRSR should be treated as a mapping/configuration layer.

Each metric should contain:
- Metric ID.
- Metric name.
- Description.
- Unit.
- Frequency.
- Source type.
- Evidence requirement.
- Validation rules.
- Calculation rule.
- Scope where applicable.
- BRSR section.
- BRSR indicator/question.
- Reporting type.
- Applicability.

Concept:

    Source Document
        ->
    ESG Metric
        ->
    Calculated/Verified Value
        ->
    BRSR Indicator
        ->
    Report

If reporting requirements change, mappings can be updated without rewriting the complete application.

The BRSR material should be used as the authoritative basis for the exact indicator structure and mapping during implementation.

## 29. Reporting Period And Consolidation

Users submit source information for a reporting period.

Recommended operational model:

    Monthly source submission
        ->
    Monthly validation
        ->
    Monthly approval
        ->
    Annual aggregation
        ->
    BRSR reporting

Consolidation hierarchy:

    Site
      ->
    Project
      ->
    Business Unit
      ->
    Subsidiary
      ->
    Organization / Group

The same metric must be aggregatable at each level where applicable.

Admin should be able to filter by:
- Reporting year.
- Month.
- Entity.
- Subsidiary.
- Project.
- Region.
- Department.
- Scope.
- Metric.

## 30. Approval Workflow

Recommended workflow:

###     Draft
       ->
###     Document_Uploaded
       ->
###     Ocr_Completed
       ->
###     User_Verified
       ->
###     Validation_Pending
       ->
###     Validated
       ->
###     Review_Pending
       ->
###     Approved
       ->
###     Included_In_Report

Possible alternate states:

###     Rejected
###     Returned_For_Correction
###     Incomplete
###     Flagged_For_Review

The exact approval chain should be configurable by metric/role.

## 31. Audit Trail

Every material action should be logged.

Audit event examples:

    User uploaded document
    OCR processed document
    OCR extracted field
    User changed extracted field
    User verified data
    Validation passed/failed
    Factor selected
    Calculation executed
    Record returned
    Record approved
    Admin modified configuration
    Report generated

Each audit event should include:
- Event ID.
- User.
- Timestamp.
- Action.
- Record ID.
- Old value where relevant.
- New value where relevant.
- Reason where relevant.

Never silently overwrite important historical information.

## 32. Admin Report Drill-Down

A major feature should be report-to-source traceability.

Example:

    BRSR Scope 1 Total
          |
          +-- Subsidiary A
          |      |
          |      +-- Project X
          |             |
          |             +-- Diesel
          |                    |
###           |                    +-- 2,500 L
          |                    |
          |                    +-- Calculation
          |                    |
          |                    +-- Invoice.pdf
          |
          +-- Subsidiary B
                 ...

The admin should be able to move from the consolidated result back to the supporting records.

## 33. Admin Control Tower

The main admin dashboard should focus on reporting readiness, not only attractive charts.

Suggested indicators:

    Total Organizations
    Total Projects
    Active Users
    Submission Completion %
    Evidence Coverage %
    Validation Completion %
    Approval Completion %
    Scope 1 Completion %
    Scope 2 Completion %
    Scope 3 Completion %
    BRSR Readiness %

Issue panel:

    Projects with missing submissions
    Records missing evidence
    Low-confidence OCR records
    Validation failures
    Anomalous values
    Pending approvals
    Incomplete BRSR indicators

All cards should be clickable/drillable.

## 34. Brsr Readiness Score

A configurable readiness indicator can combine:

- Data completeness.
- Evidence completeness.
- Validation completion.
- Approval completion.
- Required indicator coverage.
- Outstanding exceptions.

Example:

    BRSR Readiness
    84%

The score should be clearly defined and configurable.

It must not be represented as an official regulatory score.

It is an internal management/readiness indicator.

## 35. Security And Access Control

Minimum requirements:

- Authentication.
- Role-based access control.
- Organization/project-level authorization.
- Secure document storage.
- Encrypted data in transit.
- Secure handling of credentials.
- Session management.
- Audit logging.
- Admin-only configuration actions.
- Least-privilege permissions.

Users should only access records belonging to their authorized organizational scope.

## 36. Document Storage

Store:
- Original uploaded document.
- Document metadata.
- OCR output.
- Extracted fields.
- Verification result.
- Link to ESG record.

Metadata should include:
- Document ID.
- File type.
- Upload timestamp.
- Uploaded by.
- Organization.
- Project.
- Reporting period.
- Document category.
- OCR status.
- Verification status.

Documents should not be deleted casually because they may be evidence for reported values.

Deletion/retention policies should be admin controlled.

## 37. Database Conceptual Entities

Minimum conceptual entities:

    User
    Role
    Permission
    Organization
    Entity/Subsidiary
    BusinessUnit
    Region
    Project
    Site
    Department

    ReportingPeriod

    ESGMetric
    ESGRecord
    ESGCategory

    Document
    DocumentType
    OCRExtraction
    OCRField

    Verification
    ValidationResult
    Approval

    ConversionFactor
    ConversionFactorVersion

    Calculation
    CalculationFormula

    BRSRSection
    BRSRIndicator
    BRSRMapping

    AuditLog

    Report
    ReportRun

The exact physical schema will be defined in the TRD/database document.

## 38. Api / Backend Concept

Backend responsibilities:

Authentication:
    login
    logout
    session/token handling

Users:
    CRUD users
    role assignment
    permissions

Organizations:
    hierarchy management

Documents:
    upload
    retrieve
    metadata
    OCR processing status

### Ocr:
    submit document
    process extraction
    retrieve extracted fields
    confidence scores

Verification:
    verify
    edit
    reject

Validation:
    run validation
    retrieve validation results

### Esg:
    retrieve records
    metric mapping
    status

Calculation:
    calculate
    retrieve calculation trace

Factors:
    retrieve factor
    admin factor management
    versioning

### Brsr:
    mappings
    indicator status
    reporting values

Reports:
    generate
    status
    download/export

Audit:
    retrieve authorized audit events

## 39. Frontend Modules

Admin application:

    Login
    Admin Dashboard
    Organization Management
    User Management
    Role & Permission Management
    Project Management
    Reporting Periods
    Document Monitoring
    OCR Review Monitoring
    ESG Data Monitoring
    Validation Queue
    Approval Queue
    Conversion Factors
    BRSR Mapping
    Reports
    Audit Trail
    System Settings

User application:

    Login
    My Dashboard
    My Projects / Organization
    Upload Document
    OCR Verification
    Submission History
    Returned Records
    Approved Records
    Data Status
    Notifications

Role-specific navigation is permission driven.

## 40. Notification System

The system should notify users about:

- New submission tasks.
- OCR verification required.
- Low-confidence extraction.
- Validation failure.
- Record returned.
- Approval required.
- Reporting deadline approaching.
- Missing documents.

Admin should see organization-level pending tasks.

## 41. Duplicate Detection

The system should attempt to identify:
- Same bill uploaded twice.
- Same invoice number.
- Same document hash.
- Same project + period + metric combination.
- Duplicate source records.

Possible duplicate should be flagged for review rather than silently discarded.

## 42. Data Quality Model

Each record can have a data quality state:

###     Complete
###     Incomplete
###     Verified
###     Validated
###     Flagged
###     Approved
###     Rejected

At organization level, show:

    Completeness
    Evidence Coverage
    Validation
    Approval
    BRSR Coverage

This allows the admin to identify where reporting risk exists.

## 43. Mvp Priority

Because the hackathon emphasizes comprehensive end-to-end functionality, the MVP should prioritize breadth and working integration.

### P0 - MUST HAVE

## 1. Authentication.
## 2. Admin Dashboard.
## 3. Role-Based User Dashboard.
## 4. Organization/Project Hierarchy.
## 5. User-Role Assignment.
## 6. Document Upload.
## 7. Ocr Extraction.
## 8. Ocr Verification/Edit/Confirm.
## 9. Evidence Storage.
## 10. Esg Record Creation.
## 11. Validation Engine.
## 12. Conversion Factor Database.
## 13. Scope 1 Calculation.
## 14. Scope 2 Calculation.
## 15. Basic Applicable Scope 3.
## 16. Hr Data Workflow.
## 17. Water/Waste Basic Workflow.
## 18. Brsr Metric Mapping.
## 19. Consolidation.
## 20. Admin Report Generation.
## 21. Audit Trail.
## 22. Submission/Approval Status.

### P1 - SHOULD HAVE

- OCR confidence scoring.
- Anomaly detection.
- Duplicate detection.
- Advanced Scope 3.
- Data quality dashboard.
- BRSR readiness dashboard.
- Excel/document batch ingestion if feasible.
- Notifications.

### P2 - FUTURE

- SAP/Oracle connectors.
- IoT meter integrations.
- Automated recurring document ingestion.
- Supplier portal.
- Mobile application.
- Advanced AI assistant.
- Predictive ESG analytics.
- Multi-country factor management.

## 44. Practical Hackathon Implementation Strategy

Do not attempt to build every enterprise feature fully.

Build a complete vertical slice:

    User
      ->
    Upload Electricity Bill
      ->
###     Ocr
      ->
    Verify
      ->
    Validation
      ->
    Scope 2 Calculation
      ->
    Project Total
      ->
    Admin Dashboard
      ->
    Consolidated Report
      ->
    Evidence Drill-down

Then replicate the same framework for:
- Diesel / Scope 1.
### - Hr.
- Water.
- Waste.
- One or two Scope 3 categories.

The framework should be reusable rather than implementing every metric separately.

## 45. Demo Scenario

Recommended hackathon demo:

### Step 1:
Admin creates:
###     Meil
    Subsidiary A
    Project X

### Step 2:
Admin creates users:
    HR User
    Project Manager
    EHS User

### Step 3:
Project Manager logs in.

### Step 4:
Project Manager uploads:
    Diesel invoice.

### Step 5:
OCR extracts:
    Fuel type = Diesel
    Quantity = 2,500 L
    Date/period
    Invoice number
    Supplier

### Step 6:
Project Manager verifies extracted information.

### Step 7:
System validates the record.

### Step 8:
Calculation engine selects the applicable factor.

### Step 9:
System calculates Scope 1 emissions.

### Step 10:
Project Manager uploads electricity bill.

### Step 11:
OCR extracts electricity consumption.

### Step 12:
User verifies.

### Step 13:
System calculates Scope 2.

### Step 14:
HR user uploads workforce evidence.

### Step 15:
OCR extracts employee data.

### Step 16:
System calculates applicable HR indicators.

### Step 17:
EHS uploads water/waste evidence.

### Step 18:
System extracts and verifies.

### Step 19:
Admin opens Control Tower.

Admin sees:
    Project X
       Scope 1
       Scope 2
       Water
       Waste
###        Hr
       Evidence
       Validation
       Approval

### Step 20:
Admin generates BRSR/ESG report.

### Step 21:
Admin clicks a reported number.

### Step 22:
System drills down:

    Report Value
       ->
    BRSR Indicator
       ->
    ESG Metric
       ->
    Calculation
       ->
    Verified Activity Data
       ->
    Original Bill

This should be the signature demo.

## 46. Scalability Principles

The architecture should scale without redesign.

Principles:

## 1. Configuration Over Hard-Coding.
## 2. Role-Based Access Over Fixed User Types.
## 3. Organization Hierarchy Over Flat Project Lists.
## 4. Metric Catalogue Over Separate Forms/Modules.
## 5. Document-Driven Ingestion Over Manual Entry.
## 6. Central Calculation Engine.
## 7. Versioned Conversion Factors.
## 8. Configurable Brsr Mapping.
## 9. Asynchronous Ocr Processing.
## 10. Modular Scope 3 Architecture.
## 11. Api-First Backend.
## 12. Evidence Lineage.
## 13. Audit Logs.
## 14. Database Indexing For Organization/Project/Period Queries.
## 15. Object Storage For Documents.
## 16. Background Workers For Ocr And Heavy Processing.

## 47. What Should Not Be Built

Do NOT:
- Build a generic dashboard with no evidence trail.
- Make users manually calculate CO2e.
- Make users manually fill large ESG forms.
- Hard-code conversion factors in frontend code.
- Hard-code BRSR questions throughout the UI.
- Give every user access to every project.
- Trust OCR without user verification.
- Use AI as the sole calculation authority.
- Build 300 project-specific forms.
- Build a full ERP replacement.
- Spend most hackathon time on visual polish while core BRSR coverage is incomplete.

## 48. Key Differentiator

The primary differentiator is:

###     Evidence-First Esg Reporting

Traditional conceptual flow:

###     Data -> Report

Proposed flow:

###     Evidence
       ->
###     Ocr
       ->
###     Verified Data
       ->
###     Validation
       ->
###     Calculation
       ->
###     Scope
       ->
###     Brsr
       ->
###     Report

Every reported value has a traceable origin.

USP statement:

"An evidence-first, role-based ESG/BRSR platform that converts source documents into verified ESG data, calculates Scope 1, Scope 2 and applicable Scope 3 emissions, consolidates information across organizational levels, and provides administrators with traceable BRSR-ready reporting."

## 49. Documents That Should Be Generated From This Master Approach

This master document should be used as the source for generating the following project documents:

## 1. Prd - Product Requirements Document
   Focus:
   - Problem.
   - Users.
   - Features.
   - User journeys.
   - Functional requirements.
   - Non-functional requirements.
   - MVP scope.

## 2. Trd - Technical Requirements/Technical Design Document
   Focus:
   - Architecture.
   - Backend.
   - Frontend.
   - OCR pipeline.
   - Calculation engine.
   - Database.
   - APIs.
   - Security.
   - Scalability.

## 3. Srs - Software Requirements Specification
   Focus:
   - Functional requirements.
   - Actors.
   - Use cases.
   - System behavior.
   - Validation.
   - Error handling.

## 4. Database Design Document
   Focus:
   - ER model.
   - Tables.
   - Relationships.
   - Keys.
   - Indexes.
   - Audit structure.

## 5. Api Specification
   Focus:
   - Endpoints.
   - Authentication.
   - Request/response schemas.
   - Error codes.
   - Authorization.

## 6. Ocr / Document Intelligence Specification
   Focus:
   - Supported documents.
   - Extraction pipeline.
   - OCR confidence.
   - Field mapping.
   - Verification.
   - Failure handling.

## 7. Esg Calculation Engine Specification
   Focus:
   - Scope 1.
   - Scope 2.
   - Scope 3.
   - Units.
   - Factors.
   - Formulas.
   - Versioning.
   - Calculation trace.

## 8. Brsr Mapping Document
   Focus:
   - BRSR sections.
   - Indicators.
   - Required data.
   - Evidence.
   - Source roles.
   - Mapping rules.

## 9. Role And Permission Matrix
   Focus:
   - Admin.
###    - Hr.
   - Project Manager.
###    - Ehs.
   - Finance.
   - Procurement.
###    - Esg.
   - Organization-level access.

## 10. Ui/Ux Specification
    Focus:
    - Admin dashboard.
    - User dashboard.
    - Upload.
    - OCR verification.
    - Validation.
    - Approval.
    - Reporting.
    - Drill-down.

## 11. Security Design
    Focus:
    - Authentication.
    - Authorization.
    - Document security.
    - Audit logs.
    - Data protection.

## 12. Testing Document
    Focus:
    - Unit tests.
    - OCR tests.
    - Calculation tests.
    - Role/access tests.
    - Integration tests.
    - Report tests.
    - Security tests.

## 13. Deployment Document
    Focus:
    - Environments.
    - Infrastructure.
    - Database.
    - Object storage.
    - OCR worker.
    - Monitoring.
    - Backup.

## 14. Project Roadmap
    Focus:
###     - Mvp.
    - Hackathon version.
    - Phase 2.
    - Enterprise scaling.

## 50. Source-Based Requirement Notes

The supporting Inputs document establishes:
- Monthly input collection at project/unit level.
- Annual roll-up.
- Evidence-backed records.
- Potential source systems including ERP, IoT meters and custom logs.
- Responsibility distributed across functions such as HR, project/EHS, finance and procurement.
- Scope 1 and Scope 2 activity-data calculations.
- Water and waste reporting.
- Employee/workforce data.
- Procurement/CSR/compliance/customer-related information.
- Existing commercial ESG platforms as feature benchmarks.

The source material also indicates that BRSR reporting contains Section A, Section B and Section C, with Essential and Leadership indicators under Section C.

The L&T material demonstrates that ESG/BRSR reporting can involve multiple entities/subsidiaries and multiple functional contributors.

Assurance-related source material emphasizes the importance of data collection/collation/calculation methodology, source consistency, audit trails and internal controls.

For implementation, exact BRSR indicators, factor values, regulatory wording and reporting formats must be taken from the authoritative current source documents rather than invented in this architecture document.

## 51. Final System Summary

The final system is:

###                     Admin
                      |
###               Control Tower
                      |
###           User / Role Management
                      |
        +-------------+-------------+
        |             |             |
###        Hr       Project Manager    Ehs
        |             |             |
        +-------------+-------------+
                      |
###                Upload Document
                      |
###                      Ocr
                      |
###              Extract Information
                      |
###              User Verification
                 /         \
###              Confirm       Edit
                 \         /
###                   Validation
                      |
###               Esg Record Created
                      |
###               Calculation Engine
                 /    |    \
###              Scope1 Scope2 Scope3
                 \    |    /
###                   Consolidation
                      |
###                 Brsr Mapping
                      |
###                   Admin
                      |
###                Report Generation
                      |
###              Traceable Evidence
                      |
###              Original Document

The central design principle is:

"Users provide evidence. The system extracts, validates, calculates and maps it. Admin controls, consolidates and reports it."

This approach removes manual ESG form filling, reduces data-entry burden, preserves source evidence, supports Scope 1/2/3, handles role-based organizational workflows, and provides a scalable foundation for BRSR reporting.