import "server-only";
import { indicatorStatus } from "@/lib/brsr/readiness";
import { fraction, readiness, type Fraction, type Readiness } from "@/lib/dashboard/kpis";
import type { db, Tx } from "@/lib/db";
import { issueCondition, recordsFrom, type Issue, type RecordFilters } from "@/lib/records/search";

// The Admin Control Tower's numbers (UI brief §13.1, Master Approach §33) for one org node's subtree and one
// period. Record counts use the same predicates Submission Monitoring lists with (lib/records/search.ts).

type Sql = Tx | ReturnType<typeof db>;

export type ScopeKpi = {
  code: "SCOPE_1" | "SCOPE_2" | "SCOPE_3";
  name: string;
  completion: Fraction;
  categories: { active: number; total: number } | null;
};

export type Summary = {
  header: { organizations: number; projects: number; activeUsers: number };
  pipeline: {
    submission: Fraction;
    evidence: Fraction;
    validation: Fraction;
    approval: Fraction;
  };
  scopes: ScopeKpi[];
  readiness: Readiness;
  issues: Record<Issue | "missing_submissions" | "incomplete_indicators", number>;
  /** Expectations are configured at all under this node (else the completion cards explain why "—"). */
  expectations: number;
};

const count = async (sql: Sql, f: RecordFilters, extra?: ReturnType<typeof issueCondition>) => {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n ${recordsFrom(sql, f)} ${extra ? sql`and ${extra}` : sql``}`;
  return row.n;
};

/** Expectations under the node that apply to the period (metric frequency = period type). */
export function expectationsFrom(sql: Sql, orgUnitId: string, periodId: string) {
  return sql`
    from public.submission_expectations e
    join public.org_unit_tree t on t.descendant_id = e.org_unit_id and t.ancestor_id = ${orgUnitId}
    join public.esg_metrics m on m.id = e.metric_id and m.deleted_at is null
    join public.reporting_periods p on p.id = ${periodId}
      and p.period_type::text = m.frequency::text
    join public.org_units o on o.id = e.org_unit_id and o.deleted_at is null`;
}

/** Records that satisfy an expectation: same unit, metric and period, not rejected. */
const submitted = (sql: Sql, periodId: string, approvedOnly = false) => sql`
  exists (select 1 from public.esg_records r
          where r.org_unit_id = e.org_unit_id and r.metric_id = e.metric_id
            and r.reporting_period_id = ${periodId} and r.data_quality_state <> 'rejected'
            ${approvedOnly ? sql`and r.approval_status = 'approved'` : sql``})`;

export async function summary(sql: Sql, orgUnitId: string, periodId: string): Promise<Summary> {
  const f: RecordFilters = { orgUnitId, periodIds: [periodId] };

  const [header] = await sql<{ organizations: number; projects: number; active_users: number }[]>`
    select
      (select count(*) from public.org_units where unit_type = 'subsidiary' and deleted_at is null)::int
        as organizations,
      (select count(*) from public.org_units where unit_type = 'project' and deleted_at is null)::int
        as projects,
      (select count(*) from public.users where is_active and deleted_at is null)::int as active_users`;

  const [records, readable, verified, passed, approved] = await Promise.all([
    count(sql, f),
    count(sql, f, sql`not ${issueCondition(sql, "missing_evidence")}`),
    count(sql, f, sql`r.verification_status = 'user_verified'`),
    count(sql, f, sql`r.validation_status = 'validated'`),
    count(sql, f, sql`r.validation_status = 'validated' and r.approval_status = 'approved'`),
  ]);

  const expectationRows = await sql<
    { scope_code: string | null; submitted: boolean; approved: boolean; org_unit_id: string }[]
  >`
    select (select code from public.scopes s
             where s.id = coalesce((select parent_scope_id from public.scopes where id = m.scope_id),
                                   m.scope_id)) as scope_code,
           ${submitted(sql, periodId)} as submitted,
           ${submitted(sql, periodId, true)} as approved,
           e.org_unit_id
    ${expectationsFrom(sql, orgUnitId, periodId)}`;
  const expected = (scope?: string) =>
    expectationRows.filter((r) => scope === undefined || r.scope_code === scope);

  const [scope3] = await sql<{ active: number; total: number }[]>`
    select count(*) filter (where child.is_active)::int as active, count(*)::int as total
    from public.scopes child join public.scopes parent on parent.id = child.parent_scope_id
    where parent.code = 'SCOPE_3'`;

  const scopes: ScopeKpi[] = (
    [
      ["SCOPE_1", "Scope 1"],
      ["SCOPE_2", "Scope 2"],
      ["SCOPE_3", "Scope 3"],
    ] as const
  ).map(([code, name]) => {
    const rows = expected(code);
    return {
      code,
      name,
      completion: fraction(rows.filter((r) => r.approved).length, rows.length),
      categories: code === "SCOPE_3" ? scope3 : null,
    };
  });

  // Indicator readiness for this node: each mapped metric covered when it has an approved record.
  const mapped = await sql<{ indicator_id: string; is_applicable: boolean; approved: number }[]>`
    select x.brsr_indicator_id as indicator_id, x.is_applicable,
           (select count(*) from public.esg_records r
             join public.org_unit_tree t on t.descendant_id = r.org_unit_id and t.ancestor_id = ${orgUnitId}
             where r.metric_id = x.esg_metric_id and r.reporting_period_id = ${periodId}
               and r.approval_status = 'approved' and r.data_quality_state <> 'rejected')::int as approved
    from public.brsr_metric_mappings x
    join public.brsr_indicators i on i.id = x.brsr_indicator_id and i.deleted_at is null`;
  const statuses = [...new Set(mapped.map((m) => m.indicator_id))].map((id) =>
    indicatorStatus(
      mapped
        .filter((m) => m.indicator_id === id)
        .map((m) => ({ applicable: m.is_applicable, approved: m.approved })),
    ),
  );
  const countedIndicators = statuses.filter((s) => s !== "not_mapped");
  const indicators = fraction(
    countedIndicators.filter((s) => s === "complete").length,
    countedIndicators.length,
  );

  const pipeline = {
    submission: fraction(expected().filter((r) => r.submitted).length, expected().length),
    evidence: fraction(readable, records),
    validation: fraction(passed, verified),
    approval: fraction(approved, passed),
  };

  const [weights] = await sql<{ value: Record<string, number> | null }[]>`
    select value from public.org_settings where key = 'brsr_readiness_weights'`;

  const [lowConfidence, validationFailed, anomalies, pendingApproval] = await Promise.all(
    (["low_confidence", "validation_failed", "anomaly", "pending_approval"] as const).map((issue) =>
      count(sql, { ...f, issue }),
    ),
  );

  return {
    header: {
      organizations: header.organizations,
      projects: header.projects,
      activeUsers: header.active_users,
    },
    pipeline,
    scopes,
    readiness: readiness(
      {
        submission: pipeline.submission.value,
        evidence: pipeline.evidence.value,
        validation: pipeline.validation.value,
        approval: pipeline.approval.value,
        indicators: indicators.value,
      },
      weights?.value ?? {},
    ),
    issues: {
      missing_submissions: new Set(
        expected()
          .filter((r) => !r.submitted)
          .map((r) => r.org_unit_id),
      ).size,
      missing_evidence: records - readable,
      low_confidence: lowConfidence,
      validation_failed: validationFailed,
      anomaly: anomalies,
      pending_approval: pendingApproval,
      incomplete_indicators: countedIndicators.length - indicators.numerator,
    },
    expectations: expected().length,
  };
}

export type MissingSubmission = {
  orgUnitId: string;
  orgUnitName: string;
  metricName: string;
  categoryName: string;
};

/** Expectations under the node with nothing submitted for the period — the "missing submissions" list. */
export async function missingSubmissions(
  sql: Sql,
  orgUnitId: string,
  periodId: string,
): Promise<MissingSubmission[]> {
  const rows = await sql<
    { org_unit_id: string; org_unit_name: string; metric_name: string; category_name: string }[]
  >`
    select e.org_unit_id, o.name as org_unit_name, m.name as metric_name, cat.name as category_name
    ${expectationsFrom(sql, orgUnitId, periodId)}
    join public.esg_categories cat on cat.id = m.category_id
    where not ${submitted(sql, periodId)}
    order by o.name, m.name`;
  return rows.map((r) => ({
    orgUnitId: r.org_unit_id,
    orgUnitName: r.org_unit_name,
    metricName: r.metric_name,
    categoryName: r.category_name,
  }));
}
