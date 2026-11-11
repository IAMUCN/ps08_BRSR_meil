import "server-only";
import type { db, Tx } from "@/lib/db";
import { stageOf } from "@/lib/records/stage";
import type { StatusTone } from "@/components/ui/status-badge";

// The expected submissions of one org unit for one period, with where each stands (owner's request,
// 2026-11-11; .grill/upload-description-progress-decisions.md). Shown on Upload beside the form: every
// expected activity of the unit (other roles' too), ticked once a document for it is on record in the period,
// with the stage of the newest one. A rejected record does not count.

type Sql = Tx | ReturnType<typeof db>;

export type ExpectedItem = {
  metricId: string;
  metricName: string;
  categoryName: string;
  /** Top-level scope (SCOPE_1/2/3) or null for an activity that is not an emission. */
  scopeCode: string | null;
  submitted: boolean;
  /** Records on file for it in the period (not rejected). */
  records: number;
  /** The newest record's stage, when there is one. */
  stage: { label: string; tone: StatusTone } | null;
  /** When the newest record was uploaded (ISO). */
  lastUploadAt: string | null;
};

export type ExpectedProgress = { items: ExpectedItem[]; submitted: number; total: number };

export async function expectedProgress(
  sql: Sql,
  orgUnitId: string,
  periodId: string,
): Promise<ExpectedProgress> {
  const rows = await sql<
    {
      metric_id: string;
      metric_name: string;
      category_name: string;
      scope_code: string | null;
      records: number;
      verification: string | null;
      validation: string | null;
      approval: string | null;
      quality: string | null;
      last_at: Date | null;
    }[]
  >`
    with recursive up as (
      select id, id as top_id from public.scopes where parent_scope_id is null
      union all
      select s.id, up.top_id from public.scopes s join up on s.parent_scope_id = up.id)
    select m.id as metric_id, m.name as metric_name, cat.name as category_name, top.code as scope_code,
           (select count(*)::int from public.esg_records r
             where r.org_unit_id = e.org_unit_id and r.metric_id = e.metric_id
               and r.reporting_period_id = ${periodId} and r.data_quality_state <> 'rejected') as records,
           newest.verification_status::text as verification, newest.validation_status::text as validation,
           newest.approval_status::text as approval, newest.data_quality_state::text as quality,
           newest.created_at as last_at
    from public.submission_expectations e
    join public.esg_metrics m on m.id = e.metric_id and m.deleted_at is null
    join public.esg_categories cat on cat.id = m.category_id
    -- Only the activities that apply to this kind of period (metric frequency = period type).
    join public.reporting_periods p on p.id = ${periodId} and p.period_type::text = m.frequency::text
    left join up on up.id = m.scope_id
    left join public.scopes top on top.id = up.top_id
    left join lateral (
      select r.verification_status, r.validation_status, r.approval_status, r.data_quality_state,
             r.created_at
      from public.esg_records r
      where r.org_unit_id = e.org_unit_id and r.metric_id = e.metric_id
        and r.reporting_period_id = ${periodId} and r.data_quality_state <> 'rejected'
      order by r.created_at desc limit 1
    ) newest on true
    where e.org_unit_id = ${orgUnitId}
    order by coalesce(top.code, 'ZZ'), cat.name, m.name`;

  const items = rows.map((r): ExpectedItem => ({
    metricId: r.metric_id,
    metricName: r.metric_name,
    categoryName: r.category_name,
    scopeCode: r.scope_code,
    submitted: r.records > 0,
    records: r.records,
    stage: r.verification
      ? stageOf({
          verification: r.verification,
          validation: r.validation ?? "",
          approval: r.approval ?? "",
          quality: r.quality ?? "",
        })
      : null,
    lastUploadAt: r.last_at?.toISOString() ?? null,
  }));
  return { items, submitted: items.filter((i) => i.submitted).length, total: items.length };
}
