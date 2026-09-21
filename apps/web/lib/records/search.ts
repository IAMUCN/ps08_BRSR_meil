import "server-only";
import type { db, Tx } from "@/lib/db";

// One definition of every record filter and issue (.grill/phase-16-control-tower-decisions.md). The Control
// Tower counts with these predicates and Submission Monitoring / the Data Explorer list with the same ones,
// so a card saying "3 records missing evidence" always lands on exactly those 3 records.

type Sql = Tx | ReturnType<typeof db>;

export const ISSUES = [
  "missing_evidence",
  "low_confidence",
  "validation_failed",
  "anomaly",
  "pending_approval",
] as const;
export type Issue = (typeof ISSUES)[number];

export const STATUSES = [
  "processing",
  "needs_verification",
  "not_validated",
  "flagged",
  "failed",
  "pending_approval",
  "approved",
  "returned",
  "rejected",
] as const;
export type Status = (typeof STATUSES)[number];

export type RecordFilters = {
  /** The node whose whole subtree is searched. */
  orgUnitId: string;
  periodIds: string[];
  scopeCode?: string;
  metricCode?: string;
  /** The role that owns the metric's category (PM, HR, EHS …). */
  roleCode?: string;
  status?: Status;
  issue?: Issue;
};

/** SQL condition for an issue, over `r` (esg_records) and `d` (its primary document). */
export function issueCondition(sql: Sql, issue: Issue) {
  switch (issue) {
    case "missing_evidence":
      // Evidence Coverage counts records whose document was read by OCR; anything else is missing.
      return sql`(d.id is null or d.upload_status <> 'ready')`;
    case "low_confidence":
      // Waiting for verification with a field below the threshold or a required field not found.
      return sql`(r.verification_status = 'ocr_completed' and exists (
        select 1 from public.ocr_extractions e
        join public.ocr_fields f on f.ocr_extraction_id = e.id
        left join public.metric_field_requirements req
          on req.metric_id = r.metric_id and req.field_key = f.field_key
        where e.document_id = d.id
          and ((f.extracted_value is null and coalesce(req.is_required, false))
            or (f.extracted_value is not null and f.confidence < coalesce((
                  select (value #>> '{}')::numeric from public.org_settings
                  where key = 'ocr_confidence_threshold'), 101)))))`;
    case "validation_failed":
      return sql`r.validation_status = 'failed'`;
    case "anomaly":
      // Still flagged, and the latest validation run flagged it as an anomaly.
      return sql`(r.validation_status = 'flagged' and exists (
        select 1 from public.validation_results vr
        where vr.esg_record_id = r.id and vr.rule_type = 'anomaly' and vr.result = 'flagged'
          and vr.evaluated_at = (select max(evaluated_at) from public.validation_results
                                 where esg_record_id = r.id)))`;
    case "pending_approval":
      return sql`r.approval_status = 'review_pending'`;
  }
}

function statusCondition(sql: Sql, status: Status) {
  switch (status) {
    case "processing":
      return sql`r.verification_status in ('draft', 'document_uploaded')`;
    case "needs_verification":
      return sql`r.verification_status = 'ocr_completed'`;
    case "not_validated":
      // Verified but not (yet) through validation: the gap in Validation Completion.
      return sql`(r.verification_status = 'user_verified' and r.validation_status <> 'validated')`;
    case "flagged":
      return sql`r.validation_status = 'flagged'`;
    case "failed":
      return sql`r.validation_status = 'failed'`;
    case "pending_approval":
      return sql`r.approval_status = 'review_pending'`;
    case "approved":
      return sql`r.approval_status = 'approved'`;
    case "returned":
      return sql`(r.approval_status = 'returned' or r.validation_status = 'returned')`;
    case "rejected":
      return sql`r.data_quality_state = 'rejected'`;
  }
}

/**
 * The FROM/WHERE shared by every records query: `r` records in the node's subtree and periods, `m` metric,
 * `cat` its category, `d` primary document, `c` current calculation, `o` org unit, `p` period, `u`
 * submitter. Rejected records are excluded unless the status filter asks for them.
 */
export function recordsFrom(sql: Sql, f: RecordFilters) {
  const scope = f.scopeCode
    ? sql`and m.scope_id in (with recursive sc as (
          select id from public.scopes where code = ${f.scopeCode}
          union all select s.id from public.scopes s join sc on s.parent_scope_id = sc.id)
        select id from sc)`
    : sql``;
  return sql`
    from public.esg_records r
    join public.org_unit_tree t on t.descendant_id = r.org_unit_id and t.ancestor_id = ${f.orgUnitId}
    join public.esg_metrics m on m.id = r.metric_id
    join public.esg_categories cat on cat.id = m.category_id
    left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
    left join public.documents d on d.id = erd.document_id and d.deleted_at is null
    left join public.calculations c on c.esg_record_id = r.id and c.is_current
    join public.org_units o on o.id = r.org_unit_id
    join public.reporting_periods p on p.id = r.reporting_period_id
    join public.users u on u.id = r.submitted_by
    where r.reporting_period_id in ${sql(f.periodIds.length ? f.periodIds : ["00000000-0000-0000-0000-000000000000"])}
      ${f.status === "rejected" ? sql`` : sql`and r.data_quality_state <> 'rejected'`}
      ${scope}
      ${f.metricCode ? sql`and m.code = ${f.metricCode}` : sql``}
      ${f.roleCode ? sql`and cat.owning_role_id = (select id from public.roles where code = ${f.roleCode})` : sql``}
      ${f.status ? sql`and ${statusCondition(sql, f.status)}` : sql``}
      ${f.issue ? sql`and ${issueCondition(sql, f.issue)}` : sql``}`;
}

export type RecordRow = {
  recordId: string;
  documentId: string | null;
  fileName: string | null;
  mimeType: string | null;
  orgUnitName: string;
  periodLabel: string;
  metricName: string;
  categoryName: string;
  submittedBy: string;
  submittedAt: string;
  verificationStatus: string;
  validationStatus: string;
  approvalStatus: string;
  dataQualityState: string;
  activityValue: number | null;
  activityUnit: string | null;
  resultValue: number | null;
  resultUnit: string | null;
};

// ponytail: capped at 500 rows (newest first); page or narrow the filters if a period grows past that.
export const RECORD_LIMIT = 500;

export async function searchRecords(sql: Sql, f: RecordFilters): Promise<RecordRow[]> {
  const rows = await sql<
    {
      record_id: string;
      document_id: string | null;
      file_name: string | null;
      mime_type: string | null;
      org_unit_name: string;
      period_label: string;
      metric_name: string;
      category_name: string;
      submitted_by: string;
      created_at: Date;
      verification_status: string;
      validation_status: string;
      approval_status: string;
      data_quality_state: string;
      activity_value: number | null;
      activity_unit: string | null;
      result_value: number | null;
      result_unit: string | null;
    }[]
  >`
    select r.id as record_id, d.id as document_id, d.file_name, d.mime_type, o.name as org_unit_name,
           p.label as period_label, m.name as metric_name, cat.name as category_name,
           u.display_name as submitted_by, r.created_at,
           r.verification_status::text, r.validation_status::text, r.approval_status::text,
           r.data_quality_state::text,
           r.activity_value_verified::float as activity_value, r.activity_unit,
           c.result_value::float as result_value, c.result_unit
    ${recordsFrom(sql, f)}
    order by r.created_at desc
    limit ${RECORD_LIMIT}`;
  return rows.map((r) => ({
    recordId: r.record_id,
    documentId: r.document_id,
    fileName: r.file_name,
    mimeType: r.mime_type,
    orgUnitName: r.org_unit_name,
    periodLabel: r.period_label,
    metricName: r.metric_name,
    categoryName: r.category_name,
    submittedBy: r.submitted_by,
    submittedAt: r.created_at.toISOString(),
    verificationStatus: r.verification_status,
    validationStatus: r.validation_status,
    approvalStatus: r.approval_status,
    dataQualityState: r.data_quality_state,
    activityValue: r.activity_value,
    activityUnit: r.activity_unit,
    resultValue: r.result_value,
    resultUnit: r.result_unit,
  }));
}
