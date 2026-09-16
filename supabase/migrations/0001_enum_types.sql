-- Enum types used by the schema (05_BACKEND_SCHEMA.md §1: small, rarely-changing vocabularies only;
-- anything admin-configurable at runtime is a table, not an enum).

-- Identity / organization (§4.1)
create type public.org_unit_type as enum (
  'group', 'subsidiary', 'business_unit', 'region', 'project', 'site', 'department'
);
create type public.org_unit_status as enum ('active', 'inactive');

-- Reporting periods (§5.1)
create type public.reporting_period_type as enum ('monthly', 'annual');
create type public.reporting_period_status as enum ('draft', 'open', 'closed');

-- ESG configuration (§6)
create type public.metric_frequency as enum ('monthly', 'annual');
create type public.field_data_type as enum ('text', 'number', 'date', 'unit');
create type public.validation_rule_type as enum (
  'format', 'organizational', 'period', 'evidence', 'logical', 'anomaly'
);
create type public.validation_severity as enum ('hard_fail', 'flag');
create type public.formula_type as enum ('direct_multiply', 'subtract', 'custom');
create type public.formula_status as enum ('draft', 'active', 'superseded');

-- Documents & OCR (§8)
create type public.document_upload_status as enum ('uploaded', 'processing', 'ready', 'failed');
create type public.ocr_job_status as enum ('pending', 'processing', 'completed', 'failed');
create type public.ocr_field_verification_status as enum ('pending', 'confirmed', 'edited', 'rejected');

-- ESG record lifecycle (§9)
create type public.record_verification_status as enum (
  'draft', 'document_uploaded', 'ocr_completed', 'user_verified'
);
create type public.record_validation_status as enum (
  'pending', 'validated', 'flagged', 'failed', 'returned'
);
create type public.record_approval_status as enum (
  'not_submitted', 'review_pending', 'approved', 'returned', 'rejected'
);
create type public.record_calculation_status as enum ('not_applicable', 'pending', 'calculated');
create type public.data_quality_state as enum (
  'incomplete', 'complete', 'verified', 'validated', 'flagged', 'approved', 'rejected'
);
create type public.validation_result as enum ('pass', 'fail', 'flagged');
create type public.approval_action as enum ('submitted', 'approved', 'returned', 'rejected');

-- Conversion factors (§10.2)
create type public.factor_version_status as enum ('draft', 'active', 'superseded', 'retired');

-- BRSR (§11.2)
create type public.brsr_indicator_type as enum ('essential', 'leadership');

-- Reports (§13.1)
create type public.report_type as enum ('esg', 'brsr', 'consolidated');
create type public.report_run_status as enum ('pending', 'generating', 'completed', 'failed');
