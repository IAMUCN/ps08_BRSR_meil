import "server-only";
import { db, type Tx } from "../db.ts";
import { REPORT_INPUTS_KEY, type FyInputs } from "../reports/inputs.ts";
import {
  computeEsgFeatures,
  type ActivityContext,
  type EsgFeatureSet,
  type VerifiedRecordInput,
} from "./engine.ts";

type Sql = Tx | ReturnType<typeof db>;

export type FeatureServiceParams = {
  orgUnitId: string;
  reportingPeriodId: string;
};

/**
 * Service to load all raw submissions, filter to verified data, pull activity/size context,
 * and compute the complete ESG feature vector.
 */
export async function getEsgFeaturesForUnit(
  sql: Sql,
  params: FeatureServiceParams,
): Promise<EsgFeatureSet> {
  const { orgUnitId, reportingPeriodId } = params;

  // 1. Fetch Organization Unit
  const [orgUnit] = await sql<{ id: string; name: string; code: string }[]>`
    select id, name, code from public.org_units where id = ${orgUnitId} and deleted_at is null
  `;
  if (!orgUnit) {
    throw new Error(`Organization unit ${orgUnitId} not found.`);
  }

  // 2. Fetch Current & Chronologically Preceding Period
  const periods = await sql<{ id: string; label: string; start_date: string; end_date: string }[]>`
    select id, label, start_date::text, end_date::text
    from public.reporting_periods
    order by start_date asc
  `;

  const currentIndex = periods.findIndex((p) => p.id === reportingPeriodId);
  if (currentIndex === -1) {
    throw new Error(`Reporting period ${reportingPeriodId} not found.`);
  }
  const currentPeriod = periods[currentIndex]!;
  const prevPeriod = currentIndex > 0 ? periods[currentIndex - 1]! : null;

  // 3. Query All Submitted Records for Current Period (Verified + Pending + Flagged for QA metrics)
  const currentRecordsRaw = await sql<
    {
      id: string;
      metric_code: string;
      scope_code: string | null;
      value: number;
      value_unit: string;
      calculated_tco2e: number | null;
      verification_status: string;
      validation_status: string;
      approval_status: string;
      has_document_evidence: boolean;
      ocr_confidence: number | null;
    }[]
  >`
    select
      r.id,
      m.code as metric_code,
      coalesce(parent_scope.code, s.code) as scope_code,
      coalesce(r.activity_value_verified, r.activity_value_normalized, 0)::float as value,
      coalesce(r.activity_unit, m.unit) as value_unit,
      case
        when c.result_value is not null then
          case
            when c.result_unit = 'tCO2e' then c.result_value::float
            when c.result_unit = 'kgCO2e' then (c.result_value / 1000.0)::float
            else c.result_value::float
          end
        else null
      end as calculated_tco2e,
      r.verification_status::text as verification_status,
      r.validation_status::text as validation_status,
      r.approval_status::text as approval_status,
      exists(
        select 1 from public.esg_record_documents erd
        where erd.esg_record_id = r.id
      ) as has_document_evidence,
      (
        select min(f.confidence) from public.ocr_fields f
        join public.ocr_extractions ox on ox.id = f.ocr_extraction_id
        join public.esg_record_documents erd on erd.document_id = ox.document_id
        where erd.esg_record_id = r.id
      )::float as ocr_confidence
    from public.esg_records r
    join public.esg_metrics m on m.id = r.metric_id
    left join public.scopes s on s.id = m.scope_id
    left join public.scopes parent_scope on parent_scope.id = s.parent_scope_id
    left join lateral (
      select result_value, result_unit
      from public.calculations calc
      where calc.esg_record_id = r.id and calc.is_current = true
      limit 1
    ) c on true
    where r.org_unit_id = ${orgUnitId}
      and r.reporting_period_id = ${currentPeriod.id}
  `;

  const allRecords: VerifiedRecordInput[] = currentRecordsRaw.map((r) => ({
    id: r.id,
    metricCode: r.metric_code,
    scopeCode: r.scope_code as "SCOPE_1" | "SCOPE_2" | "SCOPE_3" | null,
    value: r.value,
    valueUnit: r.value_unit,
    calculatedTco2e: r.calculated_tco2e,
    verificationStatus: r.verification_status as VerifiedRecordInput["verificationStatus"],
    validationStatus: r.validation_status as VerifiedRecordInput["validationStatus"],
    approvalStatus: r.approval_status as VerifiedRecordInput["approvalStatus"],
    hasDocumentEvidence: r.has_document_evidence,
    ocrConfidence: r.ocr_confidence,
  }));

  // 4. Activity & Size Context (Turnover, Physical Output from org_settings inputs)
  const fyYear = currentPeriod.start_date.slice(0, 4);
  const [settingsRow] = await sql<{ value: Record<string, FyInputs> }[]>`
    select value from public.org_settings where key = ${REPORT_INPUTS_KEY} limit 1
  `;
  const fyInputs = settingsRow?.value?.[fyYear];

  const activityContext: ActivityContext = {
    productionVolume: fyInputs?.physicalOutput ?? null,
    productionUnit: fyInputs?.physicalOutputUnit ?? null,
    turnoverInrCr: fyInputs?.turnoverCr ?? null,
  };

  // 5. Compute Previous Period Features (if previous period exists)
  let prevFeatures: EsgFeatureSet | null = null;
  if (prevPeriod) {
    const prevRecordsRaw = await sql<
      {
        id: string;
        metric_code: string;
        scope_code: string | null;
        value: number;
        value_unit: string;
        calculated_tco2e: number | null;
        verification_status: string;
        validation_status: string;
        approval_status: string;
        has_document_evidence: boolean;
        ocr_confidence: number | null;
      }[]
    >`
      select
        r.id,
        m.code as metric_code,
        coalesce(parent_scope.code, s.code) as scope_code,
        coalesce(r.activity_value_verified, r.activity_value_normalized, 0)::float as value,
        coalesce(r.activity_unit, m.unit) as value_unit,
        case
          when c.result_value is not null then
            case
              when c.result_unit = 'tCO2e' then c.result_value::float
              when c.result_unit = 'kgCO2e' then (c.result_value / 1000.0)::float
              else c.result_value::float
            end
          else null
        end as calculated_tco2e,
        r.verification_status::text as verification_status,
        r.validation_status::text as validation_status,
        r.approval_status::text as approval_status,
        exists(select 1 from public.esg_record_documents erd where erd.esg_record_id = r.id) as has_document_evidence,
        null::float as ocr_confidence
      from public.esg_records r
      join public.esg_metrics m on m.id = r.metric_id
      left join public.scopes s on s.id = m.scope_id
      left join public.scopes parent_scope on parent_scope.id = s.parent_scope_id
      left join lateral (
        select result_value, result_unit from public.calculations calc
        where calc.esg_record_id = r.id and calc.is_current = true limit 1
      ) c on true
      where r.org_unit_id = ${orgUnitId} and r.reporting_period_id = ${prevPeriod.id}
    `;

    const prevInputs: VerifiedRecordInput[] = prevRecordsRaw.map((r) => ({
      id: r.id,
      metricCode: r.metric_code,
      scopeCode: r.scope_code as "SCOPE_1" | "SCOPE_2" | "SCOPE_3" | null,
      value: r.value,
      valueUnit: r.value_unit,
      calculatedTco2e: r.calculated_tco2e,
      verificationStatus: r.verification_status as VerifiedRecordInput["verificationStatus"],
      validationStatus: r.validation_status as VerifiedRecordInput["validationStatus"],
      approvalStatus: r.approval_status as VerifiedRecordInput["approvalStatus"],
      hasDocumentEvidence: r.has_document_evidence,
      ocrConfidence: r.ocr_confidence,
    }));

    prevFeatures = computeEsgFeatures({
      reportingPeriodLabel: prevPeriod.label,
      allSubmittedRecords: prevInputs,
      activityContext,
    });
  }

  // 6. Fetch Historical Emissions Series (Past approved periods)
  const historicalRows = await sql<{ tco2e: number }[]>`
    select coalesce(sum(
      case
        when c.result_unit = 'tCO2e' then c.result_value::float
        when c.result_unit = 'kgCO2e' then (c.result_value / 1000.0)::float
        else c.result_value::float
      end
    ), 0)::float as tco2e
    from public.esg_records r
    join public.reporting_periods p on p.id = r.reporting_period_id
    join public.calculations c on c.esg_record_id = r.id and c.is_current = true
    where r.org_unit_id = ${orgUnitId}
      and r.verification_status = 'user_verified'
      and r.approval_status = 'approved'
      and p.start_date < ${currentPeriod.start_date}
    group by p.id, p.start_date
    order by p.start_date asc
  `;
  const historicalEmissionsSeries = historicalRows.map((h) => h.tco2e);

  // 7. Compute & Return Full Feature Vector
  return computeEsgFeatures({
    reportingPeriodLabel: currentPeriod.label,
    orgUnitId: orgUnit.id,
    orgUnitName: orgUnit.name,
    allSubmittedRecords: allRecords,
    activityContext,
    previousPeriodFeatures: prevFeatures,
    historicalEmissionsSeries,
  });
}
