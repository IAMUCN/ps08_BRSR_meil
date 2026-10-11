import "server-only";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { db } from "@/lib/db";
import { financialYearLabel, financialYearRange } from "@/lib/consolidation/aggregate";
import { evidenceBucket } from "@/lib/storage/evidence";
import { reportsBucket } from "@/lib/reports/generate";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type BundleScopeInput = {
  orgUnitId: string;
  periodId?: string;
  financialYear?: number;
};

import {
  sanitizeFilename,
  toCsv,
  safeArchiveDocPath,
  formatChecksums,
  buildManifestData,
  buildReadmeText,
} from "./bundle-utils";

export { sanitizeFilename, toCsv, safeArchiveDocPath, formatChecksums };

export type BundlePreview = {
  scope: {
    orgUnitName: string;
    orgUnitCode: string;
    coverageLabel: string;
  };
  counts: {
    totalRecords: number;
    approvedRecords: number;
    verifiedRecords: number;
    totalDocuments: number;
    missingEvidenceRecords: number;
    calculationsCount: number;
    factorsCount: number;
  };
  records: Array<{
    id: string;
    metricCode: string;
    metricName: string;
    orgUnitName: string;
    periodLabel: string;
    activityValue: number | null;
    activityUnit: string | null;
    calculatedValue: number | null;
    calculatedUnit: string | null;
    verificationStatus: string;
    approvalStatus: string;
    documentsCount: number;
    hasEvidence: boolean;
    primaryDocumentName: string | null;
  }>;
};

/**
 * Gathers summary statistics and preview rows for the bundle selector UI.
 */
export async function getBundlePreview(scope: BundleScopeInput): Promise<BundlePreview> {
  const sql = db();

  // 1. Resolve org units in scope (selected unit and all active descendants)
  const [orgUnits, [targetUnit]] = await Promise.all([
    sql<{ id: string; name: string; code: string }[]>`
      select o.id, o.name, o.code
      from public.org_units o
      join public.org_unit_tree t on t.descendant_id = o.id
      where t.ancestor_id = ${scope.orgUnitId} and o.deleted_at is null`,
    sql<{ name: string; code: string }[]>`
      select name, code from public.org_units where id = ${scope.orgUnitId}`,
  ]);

  if (!targetUnit) {
    throw new Error("Organization unit not found.");
  }

  const orgUnitIds = orgUnits.map((u) => u.id);

  // 2. Resolve periods in scope
  let periodIds: string[] = [];
  let coverageLabel = "All Periods";

  if (scope.financialYear) {
    const { from, to } = financialYearRange(scope.financialYear);
    coverageLabel = financialYearLabel(scope.financialYear);
    const periods = await sql<{ id: string }[]>`
      select id from public.reporting_periods where start_date >= ${from} and end_date <= ${to}`;
    periodIds = periods.map((p) => p.id);
  } else if (scope.periodId) {
    const [p] = await sql<{ label: string }[]>`
      select label from public.reporting_periods where id = ${scope.periodId}`;
    coverageLabel = p?.label ?? "Period";
    periodIds = [scope.periodId];
  }

  if (periodIds.length === 0 && (scope.financialYear || scope.periodId)) {
    return {
      scope: {
        orgUnitName: targetUnit.name,
        orgUnitCode: targetUnit.code,
        coverageLabel,
      },
      counts: {
        totalRecords: 0,
        approvedRecords: 0,
        verifiedRecords: 0,
        totalDocuments: 0,
        missingEvidenceRecords: 0,
        calculationsCount: 0,
        factorsCount: 0,
      },
      records: [],
    };
  }

  // 3. Query records with document associations and calculations
  const rows = await sql<
    {
      record_id: string;
      metric_code: string;
      metric_name: string;
      org_unit_name: string;
      period_label: string;
      activity_value: number | null;
      activity_unit: string | null;
      result_value: number | null;
      result_unit: string | null;
      verification_status: string;
      approval_status: string;
      doc_count: number;
      primary_doc_name: string | null;
    }[]
  >`
    select r.id as record_id, m.code as metric_code, m.name as metric_name,
           o.name as org_unit_name, p.label as period_label,
           r.activity_value_verified::float as activity_value, r.activity_unit,
           c.result_value::float as result_value, c.result_unit,
           r.verification_status::text as verification_status,
           r.approval_status::text as approval_status,
           coalesce(doc_stats.count, 0)::int as doc_count,
           doc_stats.primary_name as primary_doc_name
    from public.esg_records r
    join public.esg_metrics m on m.id = r.metric_id
    join public.org_units o on o.id = r.org_unit_id
    join public.reporting_periods p on p.id = r.reporting_period_id
    left join public.calculations c on c.esg_record_id = r.id and c.is_current
    left join lateral (
      select count(d.id)::int as count,
             max(d.file_name) filter (where erd.is_primary) as primary_name
      from public.esg_record_documents erd
      join public.documents d on d.id = erd.document_id and d.deleted_at is null
      where erd.esg_record_id = r.id
    ) doc_stats on true
    where r.org_unit_id in ${sql(orgUnitIds)}
      ${periodIds.length > 0 ? sql`and r.reporting_period_id in ${sql(periodIds)}` : sql``}
    order by p.start_date desc, o.name, m.name`;

  const totalRecords = rows.length;
  const approvedRecords = rows.filter((r) => r.approval_status === "approved").length;
  const verifiedRecords = rows.filter((r) => r.verification_status === "user_verified").length;
  const missingEvidenceRecords = rows.filter((r) => r.doc_count === 0).length;
  const calculationsCount = rows.filter((r) => r.result_value !== null).length;
  const totalDocuments = rows.reduce((acc, r) => acc + r.doc_count, 0);

  return {
    scope: {
      orgUnitName: targetUnit.name,
      orgUnitCode: targetUnit.code,
      coverageLabel,
    },
    counts: {
      totalRecords,
      approvedRecords,
      verifiedRecords,
      totalDocuments,
      missingEvidenceRecords,
      calculationsCount,
      factorsCount: 0, // detailed factors calculated in bundle generation
    },
    records: rows.map((r) => ({
      id: r.record_id,
      metricCode: r.metric_code,
      metricName: r.metric_name,
      orgUnitName: r.org_unit_name,
      periodLabel: r.period_label,
      activityValue: r.activity_value,
      activityUnit: r.activity_unit,
      calculatedValue: r.result_value,
      calculatedUnit: r.result_unit,
      verificationStatus: r.verification_status,
      approvalStatus: r.approval_status,
      documentsCount: r.doc_count,
      hasEvidence: r.doc_count > 0,
      primaryDocumentName: r.primary_doc_name,
    })),
  };
}

export type GeneratedBundleResult = {
  buffer: Buffer;
  filename: string;
  manifest: Record<string, unknown>;
  recordCount: number;
  documentCount: number;
};

/**
 * Generates the full Audit Evidence Bundle ZIP package.
 */
export async function generateAuditEvidenceBundle(
  scope: BundleScopeInput,
  user: { id: string; displayName: string; role?: string },
): Promise<GeneratedBundleResult> {
  const sql = db();
  const bundleId = crypto.randomUUID();
  const generatedAt = new Date().toISOString();

  // 1. Resolve org units
  const [orgUnits, [targetUnit]] = await Promise.all([
    sql<{ id: string; name: string; code: string; unit_type: string }[]>`
      select o.id, o.name, o.code, o.unit_type
      from public.org_units o
      join public.org_unit_tree t on t.descendant_id = o.id
      where t.ancestor_id = ${scope.orgUnitId} and o.deleted_at is null`,
    sql<{ id: string; name: string; code: string; unit_type: string }[]>`
      select id, name, code, unit_type from public.org_units where id = ${scope.orgUnitId}`,
  ]);

  if (!targetUnit) throw new Error("Target organization unit not found.");
  const orgUnitIds = orgUnits.map((u) => u.id);

  // 2. Resolve periods
  let periodIds: string[] = [];
  let coverageLabel = "All Periods";

  if (scope.financialYear) {
    const { from, to } = financialYearRange(scope.financialYear);
    coverageLabel = financialYearLabel(scope.financialYear);
    const periods = await sql<{ id: string; label: string }[]>`
      select id, label from public.reporting_periods where start_date >= ${from} and end_date <= ${to}`;
    periodIds = periods.map((p) => p.id);
  } else if (scope.periodId) {
    const [p] = await sql<{ id: string; label: string }[]>`
      select id, label from public.reporting_periods where id = ${scope.periodId}`;
    coverageLabel = p?.label ?? "Selected Period";
    periodIds = [scope.periodId];
  }

  // 3. Collect ESG records with metrics and org context
  const records = await sql<
    {
      id: string;
      org_unit_id: string;
      org_unit_name: string;
      org_unit_code: string;
      reporting_period_id: string;
      period_label: string;
      metric_id: string;
      metric_code: string;
      metric_name: string;
      scope_code: string | null;
      scope_name: string | null;
      activity_value: number | null;
      activity_unit: string | null;
      verification_status: string;
      validation_status: string;
      approval_status: string;
      data_quality_state: string;
      source: string | null;
      verified_by: string | null;
      verified_at: Date | null;
      approved_by: string | null;
      approved_at: Date | null;
      created_at: Date;
    }[]
  >`
    select r.id, r.org_unit_id, o.name as org_unit_name, o.code as org_unit_code,
           r.reporting_period_id, p.label as period_label,
           r.metric_id, m.code as metric_code, m.name as metric_name,
           coalesce(parent_scope.code, sc.code) as scope_code,
           coalesce(parent_scope.name, sc.name) as scope_name,
           r.activity_value_verified::float as activity_value, r.activity_unit,
           r.verification_status::text as verification_status,
           r.validation_status::text as validation_status,
           r.approval_status::text as approval_status,
           r.data_quality_state::text as data_quality_state,
           ver.source, u_v.display_name as verified_by, ver.verified_at,
           ap.approved_by, ap.approved_at, r.created_at
    from public.esg_records r
    join public.esg_metrics m on m.id = r.metric_id
    left join public.scopes sc on sc.id = m.scope_id
    left join public.scopes parent_scope on parent_scope.id = sc.parent_scope_id
    join public.org_units o on o.id = r.org_unit_id
    join public.reporting_periods p on p.id = r.reporting_period_id
    left join public.users u_v on u_v.id = r.verified_by
    left join lateral (
      select v.verified_at,
             case when v.is_manual_exception then 'manual exception' else 'document, verified by a person' end as source
      from public.verifications v where v.esg_record_id = r.id
      order by v.verified_at desc limit 1
    ) ver on true
    left join lateral (
      select u.display_name as approved_by, a.decided_at as approved_at
      from public.approvals a left join public.users u on u.id = a.decided_by
      where a.esg_record_id = r.id and a.action::text = 'approved'
      order by a.decided_at desc limit 1
    ) ap on true
    where r.org_unit_id in ${sql(orgUnitIds)}
      ${periodIds.length > 0 ? sql`and r.reporting_period_id in ${sql(periodIds)}` : sql``}
    order by p.start_date, o.name, m.name`;

  const recordIds = records.map((r) => r.id);

  // 4. Collect calculations and conversion factor versions
  type CalculationRow = {
    id: string;
    esg_record_id: string;
    formula_type: string | null;
    result_value: number | null;
    result_unit: string | null;
    version: number;
    calculated_at: Date;
    calculated_by: string | null;
    trace_log: unknown;
  };

  type CalcInputRow = {
    calculation_id: string;
    input_key: string;
    input_value: number;
    unit: string;
    factor_version_id: string | null;
    factor_name: string | null;
    factor_value: number | null;
    factor_unit: string | null;
    factor_version: number | null;
    source_reference: string | null;
    source_url: string | null;
  };

  type DocumentRow = {
    document_id: string;
    record_id: string;
    is_primary: boolean;
    file_name: string;
    mime_type: string;
    file_size_bytes: number;
    file_hash: string;
    storage_path: string;
    uploaded_by: string;
    uploaded_at: Date;
    ocr_job_status: string | null;
    model_version: string | null;
  };

  type ExtractionRow = {
    document_id: string;
    field_key: string;
    extracted_value: string;
    confidence_score: number;
    page_number: number | null;
  };

  const calculations: CalculationRow[] =
    recordIds.length === 0
      ? []
      : await sql<CalculationRow[]>`
          select c.id, c.esg_record_id, f.formula_type::text as formula_type,
                 c.result_value::float as result_value, c.result_unit,
                 coalesce(f.version, 1) as version, c.calculated_at,
                 c.engine_version as calculated_by,
                 jsonb_build_object(
                   'engine_version', c.engine_version,
                   'input_value', c.input_value, 'input_unit', c.input_unit,
                   'normalized_value', c.normalized_value, 'normalized_unit', c.normalized_unit,
                   'factor_value', c.factor_value_snapshot,
                   'conversion_factor_version_id', c.conversion_factor_version_id) as trace_log
          from public.calculations c
          left join public.calculation_formulas f on f.id = c.calculation_formula_id
          where c.esg_record_id in ${sql(recordIds)} and c.is_current`;

  const calculationIds = calculations.map((c) => c.id);

  const calculationInputs: CalcInputRow[] =
    calculationIds.length === 0
      ? []
      : await sql<CalcInputRow[]>`
          select c.id as calculation_id, coalesce(ci.input_key, 'activity') as input_key,
                 coalesce(ci.input_value, c.normalized_value)::float as input_value,
                 coalesce(ci.input_unit, c.normalized_unit) as unit,
                 c.conversion_factor_version_id as factor_version_id,
                 cf.name as factor_name, c.factor_value_snapshot::float as factor_value,
                 case when cfv.id is null then null
                      else cfv.output_unit || ' per ' || cfv.input_unit end as factor_unit,
                 cfv.version_number as factor_version,
                 cfv.source_reference, null::text as source_url
          from public.calculations c
          left join public.calculation_inputs ci on ci.calculation_id = c.id
          left join public.conversion_factor_versions cfv on cfv.id = c.conversion_factor_version_id
          left join public.conversion_factors cf on cf.id = cfv.conversion_factor_id
          -- A calculation that multiplies one activity value by a factor stores no input rows: it is
          -- listed once, with its normalised value, so every factor used appears in the bundle.
          where c.id in ${sql(calculationIds)}
            and (ci.id is not null or c.conversion_factor_version_id is not null)`;

  // 5. Collect documents, joins and OCR extractions
  const documents: DocumentRow[] =
    recordIds.length === 0
      ? []
      : await sql<DocumentRow[]>`
          select d.id as document_id, erd.esg_record_id as record_id, erd.is_primary,
                 d.file_name, d.mime_type, d.file_size_bytes, d.file_hash,
                 d.storage_path, u.display_name as uploaded_by, d.created_at as uploaded_at,
                 j.status::text as ocr_job_status, j.model_version
          from public.esg_record_documents erd
          join public.documents d on d.id = erd.document_id and d.deleted_at is null
          join public.users u on u.id = d.uploaded_by
          left join lateral (
            select status, model_version from public.ocr_jobs
            where document_id = d.id order by started_at desc nulls last limit 1
          ) j on true
          where erd.esg_record_id in ${sql(recordIds)}`;

  const documentIds = [...new Set(documents.map((d) => d.document_id))];

  const extractions: ExtractionRow[] =
    documentIds.length === 0
      ? []
      : await sql<ExtractionRow[]>`
          select e.document_id, f.field_key, coalesce(f.extracted_value, '') as extracted_value,
                 coalesce(f.confidence, 0)::float as confidence_score, null::int as page_number
          from public.ocr_fields f
          join public.ocr_extractions e on e.id = f.ocr_extraction_id
          where e.document_id in ${sql(documentIds)}`;

  // 6. Collect BRSR metric mappings
  const brsrMappings = await sql<
    {
      metric_code: string;
      indicator_code: string;
      indicator_name: string;
      principle: number;
      indicator_type: string;
      is_applicable: boolean;
    }[]
  >`
    select m.code as metric_code, ind.code as indicator_code, ind.question_text as indicator_name,
           ind.principle, ind.indicator_type::text as indicator_type, bmm.is_applicable
    from public.brsr_metric_mappings bmm
    join public.esg_metrics m on m.id = bmm.esg_metric_id
    join public.brsr_indicators ind on ind.id = bmm.brsr_indicator_id
    order by ind.code`;

  // 7. Collect audit events for these records and documents
  const allEntityIds = [...new Set([...recordIds, ...documentIds, ...calculationIds])];
  const auditEvents =
    allEntityIds.length === 0
      ? []
      : await sql<
          {
            id: string;
            event_type: string;
            entity_type: string;
            entity_id: string;
            user_name: string | null;
            created_at: Date;
            new_value: unknown;
          }[]
        >`
          select a.id, a.event_type, a.entity_type, a.entity_id::text,
                 u.display_name as user_name, a.created_at, a.new_value
          from public.audit_logs a
          left join public.users u on u.id = a.user_id
          where a.entity_id in ${sql(allEntityIds)}
          order by a.created_at asc`;

  // 8. Collect existing generated BRSR report PDF if available
  const existingReports = await sql<
    {
      id: string;
      storage_path: string | null;
      status: string;
      financial_year: number | null;
      completed_at: Date | null;
    }[]
  >`
    select id, storage_path, status::text, financial_year, completed_at
    from public.report_runs
    where org_unit_id = ${scope.orgUnitId}
      and status = 'completed' and storage_path is not null
      ${scope.financialYear ? sql`and financial_year = ${scope.financialYear}` : sql``}
      ${scope.periodId ? sql`and reporting_period_id = ${scope.periodId}` : sql``}
    order by completed_at desc
    limit 1`;

  // 9. Build in-memory ZIP package using JSZip
  const zip = new JSZip();
  const fileManifest: Array<{ path: string; size: number; sha256: string }> = [];

  const addFile = (path: string, content: string | Uint8Array | Buffer) => {
    const buf = Buffer.isBuffer(content)
      ? content
      : typeof content === "string"
        ? Buffer.from(content, "utf8")
        : Buffer.from(content);
    const hash = createHash("sha256").update(buf).digest("hex");
    fileManifest.push({ path, size: buf.length, sha256: hash });
    zip.file(path, buf);
  };

  // --- A. Metrics Data (CSV & JSON) ---
  const metricsCsvHeaders = [
    "record_id",
    "org_unit_code",
    "org_unit_name",
    "reporting_period",
    "scope",
    "metric_code",
    "metric_name",
    "activity_value",
    "activity_unit",
    "calculated_emissions_tco2e",
    "verification_status",
    "validation_status",
    "approval_status",
    "data_quality_state",
    "source",
    "verified_by",
    "verified_at",
    "approved_by",
    "approved_at",
    "created_at",
  ];

  const calcMap = new Map(calculations.map((c) => [c.esg_record_id, c]));

  const metricsCsvRows = records.map((r) => {
    const c = calcMap.get(r.id);
    return [
      r.id,
      r.org_unit_code,
      r.org_unit_name,
      r.period_label,
      r.scope_name ?? r.scope_code ?? "—",
      r.metric_code,
      r.metric_name,
      r.activity_value,
      r.activity_unit,
      c?.result_value ?? null,
      r.verification_status,
      r.validation_status,
      r.approval_status,
      r.data_quality_state,
      r.source,
      r.verified_by,
      r.verified_at?.toISOString() ?? "",
      r.approved_by,
      r.approved_at?.toISOString() ?? "",
      r.created_at.toISOString(),
    ];
  });

  addFile("data/metrics.csv", toCsv(metricsCsvHeaders, metricsCsvRows));
  addFile(
    "data/metrics.json",
    JSON.stringify(
      records.map((r) => {
        const c = calcMap.get(r.id);
        return {
          ...r,
          calculated_result: c ? { value: c.result_value, unit: c.result_unit } : null,
        };
      }),
      null,
      2,
    ),
  );

  // --- B. Documents Data (CSV) ---
  const documentsCsvHeaders = [
    "document_id",
    "record_id",
    "is_primary",
    "file_name",
    "mime_type",
    "file_size_bytes",
    "file_hash_sha256",
    "uploaded_by",
    "uploaded_at",
    "ocr_status",
    "ocr_model_version",
  ];
  const documentsCsvRows = documents.map((d) => [
    d.document_id,
    d.record_id,
    d.is_primary,
    d.file_name,
    d.mime_type,
    d.file_size_bytes,
    d.file_hash,
    d.uploaded_by,
    d.uploaded_at.toISOString(),
    d.ocr_job_status ?? "none",
    d.model_version ?? "none",
  ]);
  addFile("data/documents.csv", toCsv(documentsCsvHeaders, documentsCsvRows));

  // --- C. Calculations Data (CSV) ---
  const calculationsCsvHeaders = [
    "calculation_id",
    "record_id",
    "formula_type",
    "result_value",
    "result_unit",
    "version",
    "calculated_at",
    "calculated_by",
  ];
  const calculationsCsvRows = calculations.map((c) => [
    c.id,
    c.esg_record_id,
    c.formula_type,
    c.result_value,
    c.result_unit,
    c.version,
    c.calculated_at.toISOString(),
    c.calculated_by,
  ]);
  addFile("data/calculations.csv", toCsv(calculationsCsvHeaders, calculationsCsvRows));

  // --- D. Emission Factors Data (CSV) ---
  const factorsCsvHeaders = [
    "calculation_id",
    "input_key",
    "input_value",
    "unit",
    "factor_name",
    "factor_version",
    "factor_value",
    "factor_unit",
    "source_reference",
    "source_url",
  ];
  const factorsCsvRows = calculationInputs.map((ci) => [
    ci.calculation_id,
    ci.input_key,
    ci.input_value,
    ci.unit,
    ci.factor_name,
    ci.factor_version,
    ci.factor_value,
    ci.factor_unit,
    ci.source_reference,
    ci.source_url,
  ]);
  addFile("data/emission-factors.csv", toCsv(factorsCsvHeaders, factorsCsvRows));

  // --- E. Validation Results Data (CSV) ---
  const validationCsvHeaders = [
    "record_id",
    "metric_code",
    "validation_status",
    "data_quality_state",
  ];
  const validationCsvRows = records.map((r) => [
    r.id,
    r.metric_code,
    r.validation_status,
    r.data_quality_state,
  ]);
  addFile("data/validation-results.csv", toCsv(validationCsvHeaders, validationCsvRows));

  // --- F. Approvals Data (CSV) ---
  const approvalsCsvHeaders = [
    "record_id",
    "metric_code",
    "approval_status",
    "approved_by",
    "approved_at",
  ];
  const approvalsCsvRows = records.map((r) => [
    r.id,
    r.metric_code,
    r.approval_status,
    r.approved_by,
    r.approved_at?.toISOString() ?? "",
  ]);
  addFile("data/approvals.csv", toCsv(approvalsCsvHeaders, approvalsCsvRows));

  // --- G. Audit Events Data (CSV) ---
  const auditCsvHeaders = [
    "event_id",
    "event_type",
    "entity_type",
    "entity_id",
    "user",
    "timestamp",
  ];
  const auditCsvRows = auditEvents.map((a) => [
    a.id,
    a.event_type,
    a.entity_type,
    a.entity_id,
    a.user_name ?? "system",
    a.created_at.toISOString(),
  ]);
  addFile("data/audit-events.csv", toCsv(auditCsvHeaders, auditCsvRows));

  // --- H. BRSR Mappings Data (CSV) ---
  const brsrCsvHeaders = [
    "metric_code",
    "indicator_code",
    "indicator_name",
    "principle",
    "indicator_type",
    "is_applicable",
  ];
  const brsrCsvRows = brsrMappings.map((bm) => [
    bm.metric_code,
    bm.indicator_code,
    bm.indicator_name,
    bm.principle,
    bm.indicator_type,
    bm.is_applicable,
  ]);
  addFile("data/brsr-mappings.csv", toCsv(brsrCsvHeaders, brsrCsvRows));

  // --- I. Traceability Lineage Graph (JSON) ---
  const docExtractionsMap = new Map<string, ExtractionRow[]>();
  for (const ext of extractions) {
    const list = docExtractionsMap.get(ext.document_id) ?? [];
    list.push(ext);
    docExtractionsMap.set(ext.document_id, list);
  }

  const recordDocsMap = new Map<string, DocumentRow[]>();
  for (const doc of documents) {
    const list = recordDocsMap.get(doc.record_id) ?? [];
    list.push(doc);
    recordDocsMap.set(doc.record_id, list);
  }

  const calcInputsMap = new Map<string, CalcInputRow[]>();
  for (const inp of calculationInputs) {
    const list = calcInputsMap.get(inp.calculation_id) ?? [];
    list.push(inp);
    calcInputsMap.set(inp.calculation_id, list);
  }

  const missingEvidenceRecords: Array<{
    record_id: string;
    metric_code: string;
    metric_name: string;
    org_unit_name: string;
    period_label: string;
    verification_status: string;
    reason: string;
  }> = [];

  const traceabilityGraph = records.map((r) => {
    const docs = recordDocsMap.get(r.id) ?? [];
    const calc = calcMap.get(r.id);
    const inputs = calc ? (calcInputsMap.get(calc.id) ?? []) : [];
    const hasEvidence = docs.length > 0;

    if (!hasEvidence) {
      missingEvidenceRecords.push({
        record_id: r.id,
        metric_code: r.metric_code,
        metric_name: r.metric_name,
        org_unit_name: r.org_unit_name,
        period_label: r.period_label,
        verification_status: r.verification_status,
        reason: "No evidence document linked in esg_record_documents join table",
      });
    }

    return {
      recordId: r.id,
      metric: {
        code: r.metric_code,
        name: r.metric_name,
        scope: r.scope_name ?? r.scope_code ?? "—",
      },
      organization: {
        id: r.org_unit_id,
        code: r.org_unit_code,
        name: r.org_unit_name,
      },
      reportingPeriod: {
        id: r.reporting_period_id,
        label: r.period_label,
      },
      activityRecord: {
        value: r.activity_value,
        unit: r.activity_unit,
        verificationStatus: r.verification_status,
        verifiedBy: r.verified_by,
        verifiedAt: r.verified_at?.toISOString() ?? null,
        validationStatus: r.validation_status,
        approvalStatus: r.approval_status,
        dataQualityState: r.data_quality_state,
      },
      calculation: calc
        ? {
            id: calc.id,
            formulaType: calc.formula_type,
            resultValue: calc.result_value,
            resultUnit: calc.result_unit,
            calculatedAt: calc.calculated_at.toISOString(),
            factors: inputs.map((inp) => ({
              key: inp.input_key,
              factorName: inp.factor_name,
              factorVersion: inp.factor_version,
              factorValue: inp.factor_value,
              factorUnit: inp.factor_unit,
              sourceReference: inp.source_reference,
            })),
          }
        : null,
      evidenceDocuments: docs.map((d) => {
        const extList = docExtractionsMap.get(d.document_id) ?? [];
        const ext = d.file_name.split(".").pop() ?? "bin";
        const safeDocPath = `evidence/documents/${d.document_id}.${ext}`;
        return {
          documentId: d.document_id,
          fileName: d.file_name,
          archivePath: safeDocPath,
          fileHashSha256: d.file_hash,
          isPrimary: d.is_primary,
          uploadedBy: d.uploaded_by,
          uploadedAt: d.uploaded_at.toISOString(),
          ocrStatus: d.ocr_job_status,
          ocrExtractions: extList.map((e) => ({
            field: e.field_key,
            value: e.extracted_value,
            confidence: e.confidence_score,
            page: e.page_number,
          })),
        };
      }),
      hasMissingEvidence: !hasEvidence,
    };
  });

  addFile("data/traceability.json", JSON.stringify(traceabilityGraph, null, 2));

  // --- I. Missing Evidence Summary (CSV) ---
  const missingEvidenceHeaders = [
    "record_id",
    "metric_code",
    "metric_name",
    "org_unit_name",
    "period_label",
    "verification_status",
    "reason",
  ];
  const missingEvidenceRows = missingEvidenceRecords.map((m) => [
    m.record_id,
    m.metric_code,
    m.metric_name,
    m.org_unit_name,
    m.period_label,
    m.verification_status,
    m.reason,
  ]);
  addFile("limitations/missing-evidence.csv", toCsv(missingEvidenceHeaders, missingEvidenceRows));

  // --- J. Physical Evidence Files from Storage ---
  const supabase = createSupabaseAdminClient();
  const bucket = evidenceBucket();
  const downloadedDocs = new Set<string>();

  for (const doc of documents) {
    if (downloadedDocs.has(doc.document_id)) continue;
    downloadedDocs.add(doc.document_id);

    try {
      const { data, error } = await supabase.storage.from(bucket).download(doc.storage_path);
      if (error || !data) {
        missingEvidenceRecords.push({
          record_id: doc.record_id,
          metric_code: "—",
          metric_name: doc.file_name,
          org_unit_name: "—",
          period_label: "—",
          verification_status: "storage_missing",
          reason: `Storage file could not be read: ${error?.message ?? "unknown"}`,
        });
        continue;
      }

      const bytes = new Uint8Array(await data.arrayBuffer());
      const computedHash = createHash("sha256").update(Buffer.from(bytes)).digest("hex");

      const archiveFilename = safeArchiveDocPath(doc.document_id, doc.file_name);

      if (computedHash !== doc.file_hash) {
        missingEvidenceRecords.push({
          record_id: doc.record_id,
          metric_code: "—",
          metric_name: doc.file_name,
          org_unit_name: "—",
          period_label: "—",
          verification_status: "fingerprint_mismatch",
          reason: `File hash in storage (${computedHash}) did not match upload fingerprint (${doc.file_hash})`,
        });
      }

      addFile(archiveFilename, bytes);
    } catch (err) {
      missingEvidenceRecords.push({
        record_id: doc.record_id,
        metric_code: "—",
        metric_name: doc.file_name,
        org_unit_name: "—",
        period_label: "—",
        verification_status: "error",
        reason: `Unexpected download error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // --- K. Existing BRSR Report PDF (if available) ---
  const reportRow = existingReports[0];
  if (reportRow && reportRow.storage_path) {
    try {
      const { data } = await supabase.storage
        .from(reportsBucket())
        .download(reportRow.storage_path);
      if (data) {
        const reportBytes = new Uint8Array(await data.arrayBuffer());
        addFile("reports/brsr-report.pdf", reportBytes);
      }
    } catch {
      // Non-fatal if report PDF is not in storage
    }
  }

  // --- L. README.md ---
  const countsData = {
    totalRecords: records.length,
    approvedRecords: records.filter((r) => r.approval_status === "approved").length,
    verifiedRecords: records.filter((r) => r.verification_status === "user_verified").length,
    documentsCount: downloadedDocs.size,
    calculationsCount: calculations.length,
    missingEvidenceCount: missingEvidenceRecords.length,
    auditEventsCount: auditEvents.length,
  };

  const readmeText = buildReadmeText({
    bundleId,
    generatedAt,
    orgName: targetUnit.name,
    orgCode: targetUnit.code,
    coverageLabel,
    userName: user.displayName,
    userRole: user.role ?? "User",
    counts: countsData,
  });
  addFile("README.md", readmeText);

  // --- M. Manifest.json ---
  const manifestData = buildManifestData({
    bundleId,
    generatedAt,
    scope: {
      organization: {
        id: targetUnit.id,
        code: targetUnit.code,
        name: targetUnit.name,
        type: targetUnit.unit_type,
      },
      coverage: coverageLabel,
      financialYear: scope.financialYear ?? null,
      reportingPeriodId: scope.periodId ?? null,
      requestedBy: {
        id: user.id,
        name: user.displayName,
        role: user.role ?? null,
      },
    },
    counts: countsData,
    files: fileManifest,
  });
  addFile("manifest.json", JSON.stringify(manifestData, null, 2));

  // --- N. Checksums.sha256 ---
  addFile("checksums.sha256", formatChecksums(fileManifest));

  // Generate ZIP Buffer
  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const safeOrg = sanitizeFilename(targetUnit.code || targetUnit.name);
  const safePeriod = sanitizeFilename(coverageLabel);
  const filename = `traceesg-evidence-bundle-${safeOrg}-${safePeriod}.zip`;

  return {
    buffer: zipBuffer,
    filename,
    manifest: manifestData,
    recordCount: records.length,
    documentCount: downloadedDocs.size,
  };
}
