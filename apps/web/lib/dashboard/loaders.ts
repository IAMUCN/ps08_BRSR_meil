import "server-only";
import { fraction, type Fraction } from "@/lib/dashboard/kpis";
import { summary } from "@/lib/dashboard/summary";
import {
  areaCounts,
  certificateState,
  emissionFigures,
  fyStartYear,
  hierarchyRows,
  levelRings,
  percent,
  type EmissionRow,
  type UnitRow,
} from "./overview";
import { sumTotals, type RegisterTotals } from "@/lib/register/register";
import { REPORT_INPUTS_KEY, type FyInputs } from "@/lib/reports/inputs";
import { loadUploadOptions } from "@/lib/trpc/routers/documents";
import { expectedProgress } from "@/lib/upload/progress";
import type { db } from "@/lib/db";
import { submissionTab, type RecordStatus } from "@/lib/ocr/rules";
import {
  buildFacts,
  TILE_PERMISSIONS,
  TILE_ROLES,
  type Facts,
  type ResolvedTile,
  type TileChart,
  type TileData,
  type TileScope,
  type Urgency,
} from "./tiles";

// The data behind each tile (.grill/role-dashboard-decisions.md, Phase 2). Written without a database to run
// it on: the queries use columns other code in this repository already reads, and are checked only by the
// type checker so far (ROLE_DASHBOARD_VERIFY.md). Every query is limited to the tile's scope here, on the
// server; nothing is filtered in the browser.

type Sql = ReturnType<typeof db>;

/** Units and activities shown per unit on the Expected submissions tile (the rest are counted, not listed). */
const EXPECTED_UNITS = 3;
const EXPECTED_ITEMS = 15;

/** Records flagged by validation and unreviewed for longer than this are "stuck" (a setting later). */
export const STUCK_DAYS = 7;

/** Who the dashboard is for. */
export type Viewer = { userId: string; isAdmin: boolean; isOrgAdmin: boolean };

export async function loadFacts(sql: Sql, viewer: Viewer): Promise<Facts> {
  if (viewer.isAdmin) return buildFacts({ ...viewer, grants: [], subtree: {} });
  const grants = await sql<{ permission: string; org_unit_id: string; at_group: boolean }[]>`
    select p.code as permission, uoa.org_unit_id, (o.unit_type::text = 'group') as at_group
    from public.user_org_assignments uoa
    join public.role_permissions rp on rp.role_id = uoa.role_id
    join public.permissions p on p.id = rp.permission_id and p.code = any(${TILE_PERMISSIONS}::text[])
    join public.org_units o on o.id = uoa.org_unit_id and o.deleted_at is null
    where uoa.user_id = ${viewer.userId} and uoa.revoked_at is null`;
  const roleGrants = await sql<{ role: string; org_unit_id: string }[]>`
    select ro.code as role, uoa.org_unit_id::text as org_unit_id
    from public.user_org_assignments uoa
    join public.roles ro on ro.id = uoa.role_id and ro.code = any(${TILE_ROLES}::text[])
    join public.org_units o on o.id = uoa.org_unit_id and o.deleted_at is null
    where uoa.user_id = ${viewer.userId} and uoa.revoked_at is null`;
  const assigned = [
    ...new Set([...grants.map((g) => g.org_unit_id), ...roleGrants.map((g) => g.org_unit_id)]),
  ];
  const tree = assigned.length
    ? await sql<{ ancestor_id: string; descendant_id: string }[]>`
        select ancestor_id, descendant_id from public.org_unit_tree
        where ancestor_id = any(${assigned}::uuid[])`
    : [];
  const subtree: Record<string, string[]> = {};
  for (const row of tree) (subtree[row.ancestor_id] ??= []).push(row.descendant_id);
  return buildFacts({
    ...viewer,
    grants: grants.map((g) => ({
      permission: g.permission,
      orgUnitId: g.org_unit_id,
      atGroup: g.at_group,
    })),
    roleGrants: roleGrants.map((g) => ({ role: g.role, orgUnitId: g.org_unit_id })),
    subtree,
  });
}

export type LoaderContext = {
  sql: Sql;
  viewer: Viewer;
  scope: TileScope;
  periodId: string | null;
  /** Work shared by several tiles (one run per request). */
  memo: <T>(key: string, fn: () => Promise<T>) => Promise<T>;
};

type Result = Omit<TileData, "id" | "title" | "scopeLabel">;

/** Shared work is cached per request, but never across tiles with different scopes. */
/** The units a scope covers; null for the whole group and for a person's own records. */
const unitsOf = (scope: TileScope): string[] | null =>
  scope.kind === "units"
    ? scope.units
    : scope.kind === "roles"
      ? [...new Set(scope.grants.flatMap((g) => g.units))]
      : null;

const scopeKey = (scope: TileScope) => {
  const units = unitsOf(scope);
  return units ? `units:${[...units].sort().join(",")}` : scope.kind;
};

/** `r.org_unit_id` limited to the tile's units; everything for the whole group. */
const inUnits = (sql: Sql, scope: TileScope) => {
  const units = unitsOf(scope);
  return units ? sql`r.org_unit_id = any(${units}::uuid[])` : sql`true`;
};

/** The top units of a scope (units with no other unit of the scope above them), with their names. */
async function roots(ctx: LoaderContext): Promise<{ id: string; name: string }[]> {
  const { sql, scope } = ctx;
  const units = unitsOf(scope);
  return ctx.memo(`roots:${scopeKey(scope)}`, async () =>
    units
      ? sql<{ id: string; name: string }[]>`
          select o.id, o.name from public.org_units o
          where o.id = any(${units}::uuid[]) and o.deleted_at is null
            and not exists (
              select 1 from public.org_unit_tree t
              where t.descendant_id = o.id and t.ancestor_id <> o.id
                and t.ancestor_id = any(${units}::uuid[]))
          order by o.name`
      : sql<{ id: string; name: string }[]>`
          select id, name from public.org_units
          where parent_id is null and deleted_at is null order by name`,
  );
}

export async function scopeLabel(ctx: LoaderContext): Promise<string> {
  if (ctx.scope.kind === "self") return "Your own records";
  const top = await roots(ctx);
  if (ctx.scope.kind === "all") return top.length > 1 ? `All ${top.length} groups` : "Whole group";
  const names = top.slice(0, 3).map((r) => r.name);
  return `${names.join(", ")}${top.length > 3 ? ` +${top.length - 3} more` : ""}`;
}

type OpenPeriod = { label: string; due_on: string; days_left: number; late: boolean };

const openPeriods = (ctx: LoaderContext) =>
  ctx.memo(
    "open-periods",
    () =>
      ctx.sql<OpenPeriod[]>`
      select rp.label,
             coalesce(rp.submission_closes_on, rp.end_date)::text as due_on,
             (coalesce(rp.submission_closes_on, rp.end_date) - public.reporting_period_today())::int as days_left,
             public.reporting_period_late(rp) as late
      from public.reporting_periods rp
      where rp.status = 'open' and not public.reporting_period_locked(rp)
        and rp.start_date <= (now() at time zone 'Asia/Kolkata')::date
      order by rp.start_date desc`,
  );

type OwnRecord = {
  verification_status: RecordStatus["verificationStatus"];
  validation_status: RecordStatus["validationStatus"];
  approval_status: RecordStatus["approvalStatus"];
  data_quality_state: string;
  job_status: RecordStatus["jobStatus"];
};

const ownTabs = (ctx: LoaderContext) =>
  ctx.memo("own-tabs", async () => {
    // The same population as My Submissions, counted with the same tab rule.
    const rows = await ctx.sql<OwnRecord[]>`
      select r.verification_status, r.validation_status, r.approval_status, r.data_quality_state,
             j.status as job_status
      from public.esg_records r
      join public.reporting_periods p on p.id = r.reporting_period_id
      left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
      left join public.documents d on d.id = erd.document_id and d.deleted_at is null
      left join public.ocr_jobs j on j.document_id = d.id
      where r.submitted_by = ${ctx.viewer.userId}
        and (p.status = 'open'
             or (r.approval_status not in ('approved', 'rejected') and r.data_quality_state <> 'rejected'))`;
    const tabs = rows.map((r) =>
      submissionTab({
        verificationStatus: r.verification_status,
        validationStatus: r.validation_status,
        approvalStatus: r.approval_status,
        dataQualityState: r.data_quality_state,
        jobStatus: r.job_status,
      }),
    );
    return {
      needsVerification: tabs.filter((t) => t === "needs_verification").length,
      returned: tabs.filter((t) => t === "returned").length,
    };
  });

const stuckValidations = (ctx: LoaderContext) =>
  ctx.sql<{ flagged: number; stuck: number }[]>`
    select count(*)::int as flagged,
           count(*) filter (where (select max(vr.evaluated_at) from public.validation_results vr
                                    where vr.esg_record_id = r.id)
                                  < now() - make_interval(days => ${STUCK_DAYS}))::int as stuck
    from public.esg_records r
    where r.validation_status = 'flagged' and r.data_quality_state <> 'rejected'
      and r.approval_status not in ('approved', 'rejected') and ${inUnits(ctx.sql, ctx.scope)}`;

/** Summary figures per top unit of the scope for the period, summed (percentages are recomputed from counts). */
const summaries = (ctx: LoaderContext) =>
  ctx.memo(`summaries:${scopeKey(ctx.scope)}:${ctx.periodId}`, async () => {
    if (!ctx.periodId) return [];
    const periodId = ctx.periodId;
    const top = await roots(ctx);
    return Promise.all(top.map((r) => summary(ctx.sql, r.id, periodId)));
  });

// --- Group Overview data (Phase 4) ---------------------------------------------------------------------------

/** Approved emissions in tonnes CO2e per scope and period for the scope's top units (roll-ups include everything beneath). */
const emissionRows = (ctx: LoaderContext) =>
  ctx.memo(`emissions:${scopeKey(ctx.scope)}`, async () => {
    const ids = (await roots(ctx)).map((r) => r.id);
    if (ids.length === 0) return [] as EmissionRow[];
    // ponytail: two top units that share a unit would count it twice; a shared unit sits under one group today.
    return ctx.sql<EmissionRow[]>`
      select s.code as scope_code, rp.id::text as period_id, rp.label, rp.start_date::text as start_date,
             sum(case lower(btrim(cr.value_unit))
                   when 'kgco2e' then cr.value / 1000.0
                   when 'tco2e' then cr.value end)::float as tonnes
      from public.consolidation_records cr
      join public.esg_metrics m on m.id = cr.metric_id
      join public.scopes sc on sc.id = m.scope_id
      join public.scopes s on s.id = coalesce(sc.parent_scope_id, sc.id)
           and s.code in ('SCOPE_1', 'SCOPE_2', 'SCOPE_3')
      join public.reporting_periods rp on rp.id = cr.reporting_period_id
      where cr.org_unit_id = any(${ids}::uuid[]) and cr.approval_status = 'approved'
      group by s.code, rp.id, rp.label, rp.start_date`;
  });

/** Every unit of the scope with what is expected and approved in its subtree for the period. */
const unitRows = (ctx: LoaderContext) =>
  ctx.memo(`unit-rows:${scopeKey(ctx.scope)}:${ctx.periodId}`, async () => {
    if (!ctx.periodId) return [] as UnitRow[];
    const { sql, scope, periodId } = { ...ctx, periodId: ctx.periodId };
    return sql<UnitRow[]>`
      with exp as (
        select e.org_unit_id,
               exists (select 1 from public.esg_records r
                        where r.org_unit_id = e.org_unit_id and r.metric_id = e.metric_id
                          and r.reporting_period_id = ${periodId} and r.approval_status = 'approved'
                          and r.data_quality_state <> 'rejected') as approved
        from public.submission_expectations e
        join public.esg_metrics m on m.id = e.metric_id and m.deleted_at is null
        join public.reporting_periods p on p.id = ${periodId} and p.period_type::text = m.frequency::text
        join public.org_units o on o.id = e.org_unit_id and o.deleted_at is null
      )
      select u.id::text, u.name, u.parent_id::text, u.unit_type as level, l.label as level_label,
             l.sort_order as level_order,
             count(exp.org_unit_id)::int as expected,
             count(*) filter (where exp.approved)::int as approved
      from public.org_units u
      join public.org_levels l on l.code = u.unit_type
      left join public.org_unit_tree t on t.ancestor_id = u.id
      left join exp on exp.org_unit_id = t.descendant_id
      where u.deleted_at is null
        and ${unitsOf(scope) ? sql`u.id = any(${unitsOf(scope)}::uuid[])` : sql`true`}
      group by u.id, u.name, u.parent_id, u.unit_type, l.label, l.sort_order`;
  });

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Where a tile link goes: the chosen period, and the one top unit when there is just one. */
const linkQuery = (ctx: LoaderContext, rootIds: string[]) =>
  [ctx.periodId ? `period=${ctx.periodId}` : "", rootIds.length === 1 ? `org=${rootIds[0]}` : ""]
    .filter(Boolean)
    .join("&");

/**
 * The scope donut and trend. `links` is false for roles that cannot open the scope pages (a Project Manager),
 * whose slices are then plain text.
 */
async function emissionsOverview(ctx: LoaderContext, links: boolean): Promise<Result> {
  const rows = await emissionRows(ctx);
  const f = emissionFigures(rows, ctx.periodId);
  const q = linkQuery(
    ctx,
    (await roots(ctx)).map((r) => r.id),
  );
  const scopeHref = (n: number) => `/admin/scope-${n}${q ? `?${q}` : ""}`;
  return {
    urgency: 3,
    count: null,
    summary:
      f.total > 0
        ? `${round1(f.total)} tCO2e approved${f.periodLabel ? ` in ${f.periodLabel}` : ""}: ${f.slices
            .map((s) => `${s.label} ${round1(s.value)}`)
            .join(", ")}.`
        : "No approved emissions yet in this period.",
    href: links ? `/admin/scope-1${q ? `?${q}` : ""}` : "/app/submissions",
    chart: {
      kind: "emissions",
      unit: "tCO2e",
      total: round1(f.total),
      periodLabel: f.periodLabel ?? "",
      slices: f.slices.map((s, i) => ({
        ...s,
        value: round1(s.value),
        href: links ? scopeHref(i + 1) : undefined,
      })),
      trend: f.trend,
    },
  };
}

/** The day the period starts (or today when there is no period): its financial year is the one a tile is about. */
const fyOf = (ctx: LoaderContext) =>
  ctx.memo(`fy:${ctx.periodId}`, async () => {
    const [row] = await ctx.sql<{ day: string }[]>`
      select coalesce((select start_date from public.reporting_periods where id = ${ctx.periodId}),
                      public.reporting_period_today())::text as day`;
    return fyStartYear(row.day);
  });

const fyLabel = (fy: number) => `${fy}-${String((fy + 1) % 100).padStart(2, "0")}`;

type AreaGrant = { role: string; units: string[] };
const areaGrants = (ctx: LoaderContext): AreaGrant[] =>
  ctx.scope.kind === "roles" ? ctx.scope.grants : [];

/** Expected submissions in the categories the person's roles own, not yet filed for the period. */
const missingInArea = (ctx: LoaderContext) =>
  ctx.memo(`missing-area:${JSON.stringify(areaGrants(ctx))}:${ctx.periodId}`, async () => {
    const periodId = ctx.periodId;
    if (!periodId) return [];
    const seen = new Map<string, { unit: string; activity: string }>();
    for (const g of areaGrants(ctx)) {
      const rows = await ctx.sql<
        { unit_id: string; unit: string; metric_id: string; activity: string }[]
      >`
        select o.id::text as unit_id, o.name as unit, m.id::text as metric_id, m.name as activity
        from public.submission_expectations e
        join public.esg_metrics m on m.id = e.metric_id and m.deleted_at is null
        join public.esg_categories c on c.id = m.category_id
        join public.roles ro on ro.id = c.owning_role_id and ro.code = ${g.role}
        join public.reporting_periods p on p.id = ${periodId} and p.period_type::text = m.frequency::text
        join public.org_units o on o.id = e.org_unit_id and o.deleted_at is null
        where e.org_unit_id = any(${g.units}::uuid[])
          and not exists (select 1 from public.esg_records r
                           where r.org_unit_id = e.org_unit_id and r.metric_id = e.metric_id
                             and r.reporting_period_id = ${periodId} and r.data_quality_state <> 'rejected')
        order by o.name, m.name`;
      for (const r of rows)
        seen.set(`${r.unit_id}|${r.metric_id}`, { unit: r.unit, activity: r.activity });
    }
    return [...seen.values()];
  });

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const pct = (f: Fraction) => (f.value === null ? null : Math.round(f.value));
const addFractions = (list: Fraction[]): Fraction =>
  fraction(
    list.reduce((a, f) => a + f.numerator, 0),
    list.reduce((a, f) => a + f.denominator, 0),
  );

export const LOADERS: Record<string, (ctx: LoaderContext) => Promise<Result>> = {
  period: async (ctx) => {
    const periods = await openPeriods(ctx);
    if (periods.length === 0) {
      return {
        urgency: 3,
        count: 0,
        summary: "No reporting period is open.",
        href: "/app/upload",
      };
    }
    const late = periods.filter((p) => p.late);
    const soon = periods.filter((p) => !p.late && p.days_left <= 7);
    const first = periods[0];
    const urgency: Urgency = late.length > 0 ? 0 : soon.length > 0 ? 2 : 3;
    const when = first.late
      ? "past its due date"
      : first.days_left <= 0
        ? "due today"
        : `due in ${plural(first.days_left, "day", "days")}`;
    return {
      urgency,
      count: late.length + soon.length,
      summary: `${first.label}: ${when} (${first.due_on})${periods.length > 1 ? `, and ${periods.length - 1} more open` : ""}.`,
      href: "/app/upload",
    };
  },

  "my-tasks": async (ctx) => {
    const { needsVerification } = await ownTabs(ctx);
    return {
      urgency: needsVerification > 0 ? 2 : 3,
      count: needsVerification,
      summary:
        needsVerification > 0
          ? `${plural(needsVerification, "document is", "documents are")} waiting for you to verify.`
          : "Nothing is waiting for you to verify.",
      href: "/app/submissions?tab=needs_verification",
    };
  },

  returned: async (ctx) => {
    const { returned } = await ownTabs(ctx);
    return {
      urgency: returned > 0 ? 1 : 3,
      count: returned,
      summary:
        returned > 0
          ? `${plural(returned, "record was", "records were")} returned and need correcting.`
          : "Nothing was returned to you.",
      href: "/app/submissions?tab=returned",
    };
  },

  notifications: async (ctx) => {
    const [row] = await ctx.sql<{ n: number }[]>`
      select count(*)::int as n from public.notifications
      where user_id = ${ctx.viewer.userId} and not is_read`;
    return {
      urgency: 3,
      count: row.n,
      summary:
        row.n > 0
          ? `${plural(row.n, "unread notification", "unread notifications")}.`
          : "No unread notifications.",
      href: "/app/notifications",
    };
  },

  "approval-queue": async (ctx) => {
    const { sql, viewer, scope } = ctx;
    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from public.esg_records r
      where r.approval_status = 'review_pending' and r.data_quality_state <> 'rejected'
        and ${inUnits(sql, scope)}
        and r.submitted_by <> ${viewer.userId}
        and (r.verified_by is null or r.verified_by <> ${viewer.userId})`;
    return {
      urgency: row.n > 0 ? 2 : 3,
      count: row.n,
      summary:
        row.n > 0
          ? `${plural(row.n, "record is", "records are")} waiting for your decision.`
          : "No record is waiting for your decision.",
      href: viewer.isAdmin || viewer.isOrgAdmin ? "/admin/approval-queue" : "/app/approvals",
    };
  },

  "validation-review": async (ctx) => {
    const [row] = await stuckValidations(ctx);
    return {
      urgency: row.stuck > 0 ? 0 : row.flagged > 0 ? 2 : 3,
      count: row.flagged,
      summary:
        row.flagged > 0
          ? `${plural(row.flagged, "record is", "records are")} flagged for review${row.stuck > 0 ? `, ${row.stuck} for more than ${STUCK_DAYS} days` : ""}.`
          : "Nothing is flagged for review.",
      href: "/admin/validation-queue",
    };
  },

  "system-health": async (ctx) => {
    const { sql } = ctx;
    const [ocr] = await sql<{ failed: number; stalled: number }[]>`
      select
        (select count(*)::int from public.ocr_jobs j
          join public.documents d on d.id = j.document_id
          join public.esg_record_documents erd on erd.document_id = d.id and erd.is_primary
          join public.esg_records r on r.id = erd.esg_record_id
          where j.status = 'failed' and r.verification_status <> 'user_verified'
            and r.data_quality_state <> 'rejected') as failed,
        (select count(*)::int from public.ocr_jobs j
          join public.documents d on d.id = j.document_id
          where j.status = 'pending' and d.deleted_at is null
            and d.created_at < now() - interval '5 minutes') as stalled`;
    const [validation] = await stuckValidations(ctx);
    const total = ocr.failed + ocr.stalled + validation.stuck;
    return {
      urgency: validation.stuck > 0 ? 0 : ocr.failed + ocr.stalled > 0 ? 1 : 3,
      count: total,
      summary:
        total > 0
          ? `${ocr.failed} OCR failures, ${ocr.stalled} uploads waiting over 5 minutes, ${validation.stuck} validations stuck over ${STUCK_DAYS} days.`
          : "OCR and validation are running normally.",
      href: "/admin/ocr-monitoring",
      figures: [
        { label: "OCR failures", value: ocr.failed },
        { label: "Uploads waiting over 5 minutes", value: ocr.stalled },
        { label: `Validations stuck over ${STUCK_DAYS} days`, value: validation.stuck },
      ],
    };
  },

  "missing-submissions": async (ctx) => {
    if (!ctx.periodId) {
      return {
        urgency: 3,
        count: 0,
        summary: "No reporting period to measure.",
        href: "/admin/submissions",
      };
    }
    const list = await summaries(ctx);
    const missing = list.reduce((a, s) => a + s.issues.missing_submissions, 0);
    const late = (await openPeriods(ctx)).some((p) => p.late);
    return {
      urgency: missing === 0 ? 3 : late ? 0 : 2,
      count: missing,
      summary:
        missing > 0
          ? `${plural(missing, "expected submission is", "expected submissions are")} missing${late ? ", and the period is past due" : ""}.`
          : "Every expected submission has been filed.",
      href: `/admin/submissions?issue=missing_submissions&period=${ctx.periodId}`,
    };
  },

  completion: async (ctx) => {
    if (!ctx.periodId) {
      return {
        urgency: 3,
        count: null,
        summary: "No reporting period to measure.",
        href: "/admin/submissions",
      };
    }
    const list = await summaries(ctx);
    const step = (key: "submission" | "evidence" | "validation" | "approval") =>
      addFractions(list.map((s) => s.pipeline[key]));
    const steps = [
      ["Submission", step("submission")],
      ["Evidence", step("evidence")],
      ["Validation", step("validation")],
      ["Approval", step("approval")],
    ] as const;
    return {
      urgency: 3,
      count: null,
      summary: steps
        .map(([label, f]) => `${label} ${f.value === null ? "—" : `${pct(f)} %`}`)
        .join(" · "),
      href: `/admin/submissions?period=${ctx.periodId}`,
      figures: steps.map(([label, f]) => ({ label, value: pct(f), unit: "%" })),
      chart: { kind: "radials", items: steps.map(([label, f]) => ({ label, value: pct(f) })) },
    };
  },

  emissions: async (ctx) => {
    const rows = await emissionRows(ctx);
    const f = emissionFigures(rows, ctx.periodId);
    const q = linkQuery(
      ctx,
      (await roots(ctx)).map((r) => r.id),
    );
    return {
      urgency: 3,
      count: round1(f.total),
      summary:
        f.total > 0
          ? `tCO2e approved${f.periodLabel ? ` in ${f.periodLabel}` : ""}, Scope 1, 2 and 3 together.`
          : "No approved emissions yet in this period.",
      href: `/admin/data-explorer${q ? `?${q}` : ""}`,
    };
  },

  structure: async (ctx) => {
    const ids = (await roots(ctx)).map((r) => r.id);
    const rows = ids.length
      ? await ctx.sql<{ label: string; n: number }[]>`
          select l.label, count(distinct o.id)::int as n
          from public.org_unit_tree t
          join public.org_units o on o.id = t.descendant_id and o.deleted_at is null
          join public.org_levels l on l.code = o.unit_type
          where t.ancestor_id = any(${ids}::uuid[]) and t.descendant_id <> t.ancestor_id
          group by l.label, l.sort_order order by l.sort_order`
      : [];
    const total = rows.reduce((a, r) => a + r.n, 0);
    return {
      urgency: 3,
      count: total,
      summary: total > 0 ? "units beneath the top of your scope." : "No units beneath this one.",
      href: "/admin/data-explorer",
      chart: { kind: "stats", items: rows.map((r) => ({ label: r.label, value: r.n })) },
    };
  },

  "emissions-overview": (ctx) => emissionsOverview(ctx, true),

  "unit-emissions": (ctx) => emissionsOverview(ctx, false),

  "completion-by-level": async (ctx) => {
    if (!ctx.periodId) {
      return {
        urgency: 3,
        count: null,
        summary: "No reporting period to measure.",
        href: "/admin/submissions",
      };
    }
    const rings = levelRings(await unitRows(ctx));
    return {
      urgency: 3,
      count: null,
      summary:
        rings.length > 0
          ? `${rings.map((r) => `${r.label} ${r.done} of ${r.total}`).join(" · ")} finished.`
          : "No expected submissions are configured for these units.",
      href: `/admin/submissions?period=${ctx.periodId}`,
      chart: rings.length > 0 ? { kind: "levels", items: rings } : undefined,
    };
  },

  "hierarchy-status": async (ctx) => {
    if (!ctx.periodId) {
      return {
        urgency: 3,
        count: null,
        summary: "No reporting period to measure.",
        href: "/admin/submissions",
      };
    }
    const top = await roots(ctx);
    const { rows, more } = hierarchyRows(
      await unitRows(ctx),
      top.map((r) => r.id),
    );
    return {
      urgency: 3,
      count: null,
      summary:
        rows.length > 0
          ? `${rows.length} unit${rows.length === 1 ? "" : "s"} shown${more > 0 ? `, ${more} more not shown` : ""}.`
          : "Nothing to show for these units.",
      href: `/admin/submissions?period=${ctx.periodId}`,
      chart: {
        kind: "hierarchy",
        more,
        rows: rows.map((r) => ({
          ...r,
          href: `/admin/submissions?org=${r.id}&period=${ctx.periodId}`,
        })),
      },
    };
  },

  "unit-performance": async (ctx) => {
    if (!ctx.periodId) {
      return {
        urgency: 3,
        count: null,
        summary: "No reporting period to measure.",
        href: "/admin/submissions",
      };
    }
    const top = new Set((await roots(ctx)).map((r) => r.id));
    const children = (await unitRows(ctx))
      .filter((u) => u.parent_id !== null && top.has(u.parent_id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 10);
    const periodId = ctx.periodId;
    const emitted =
      children.length > 0
        ? await ctx.sql<{ org_unit_id: string; tonnes: number | null }[]>`
            select cr.org_unit_id::text, sum(case lower(btrim(cr.value_unit))
                     when 'kgco2e' then cr.value / 1000.0 when 'tco2e' then cr.value end)::float as tonnes
            from public.consolidation_records cr
            join public.esg_metrics m on m.id = cr.metric_id
            join public.scopes sc on sc.id = m.scope_id
            join public.scopes s on s.id = coalesce(sc.parent_scope_id, sc.id)
                 and s.code in ('SCOPE_1', 'SCOPE_2', 'SCOPE_3')
            where cr.org_unit_id = any(${children.map((c) => c.id)}::uuid[])
              and cr.reporting_period_id = ${periodId} and cr.approval_status = 'approved'
            group by cr.org_unit_id`
        : [];
    const tonnes = new Map(emitted.map((e) => [e.org_unit_id, e.tonnes ?? 0]));
    return {
      urgency: 3,
      count: null,
      summary:
        children.length > 0
          ? `${children.length} unit${children.length === 1 ? "" : "s"} directly beneath the top of your scope.`
          : "No units directly beneath the top of your scope.",
      href: `/admin/submissions?period=${periodId}`,
      chart: {
        kind: "units",
        unit: "tCO2e",
        rows: children.map((c) => ({
          id: c.id,
          name: c.name,
          level: c.level_label,
          pct: percent(c.approved, c.expected),
          done: c.approved,
          total: c.expected,
          emissions: round1(tonnes.get(c.id) ?? 0),
          href: `/admin/submissions?org=${c.id}&period=${periodId}`,
        })),
      },
    };
  },
  "expected-submissions": async (ctx) => {
    // Exactly what Upload offers this person: the units they upload for and, in each, the activities their role
    // may upload. Only the expected ones among them are shown; nobody expected to submit sees no tile.
    const options = await ctx.memo(`upload-options:${ctx.viewer.userId}`, () =>
      loadUploadOptions(ctx.sql, ctx.viewer.userId),
    );
    const period = options.periods.find((p) => p.id === ctx.periodId) ?? options.periods[0];
    const hidden = {
      urgency: 3 as const,
      count: null,
      summary: "",
      href: "/app/upload",
      hidden: true,
    };
    if (!period) return hidden;
    const units: Extract<TileChart, { kind: "expected" }>["units"] = [];
    let seen = 0;
    for (const target of options.targets) {
      const offered = new Set(target.categories.flatMap((c) => c.metrics.map((m) => m.id)));
      const progress = await expectedProgress(ctx.sql, target.orgUnitId, period.id);
      const items = progress.items.filter((i) => offered.has(i.metricId));
      if (items.length === 0) continue;
      seen += 1;
      if (units.length >= EXPECTED_UNITS) continue;
      const SCOPE: Record<string, string> = {
        SCOPE_1: "Scope 1",
        SCOPE_2: "Scope 2",
        SCOPE_3: "Scope 3",
      };
      units.push({
        id: target.orgUnitId,
        name: target.name,
        submitted: items.filter((i) => i.submitted).length,
        total: items.length,
        // Still to file first, then in the order Upload lists them.
        items: [...items.filter((i) => !i.submitted), ...items.filter((i) => i.submitted)]
          .slice(0, EXPECTED_ITEMS)
          .map((i) => ({
            id: i.metricId,
            name: i.metricName,
            detail: `${i.scopeCode ? `${SCOPE[i.scopeCode]} · ` : ""}${i.categoryName}${i.records > 1 ? ` · ${i.records} documents` : ""}`,
            submitted: i.submitted,
            stage: i.stage,
          })),
        notShown: Math.max(0, items.length - EXPECTED_ITEMS),
      });
    }
    if (units.length === 0) return hidden;
    const submitted = units.reduce((a, u) => a + u.submitted, 0);
    const total = units.reduce((a, u) => a + u.total, 0);
    return {
      urgency: 3,
      count: null,
      summary: `${submitted} of ${total} expected submissions are on file for ${period.label}${units.length > 1 ? ` across ${units.length} units` : ""}.`,
      href: "/app/upload",
      chart: {
        kind: "expected",
        periodLabel: period.label,
        units,
        moreUnits: Math.max(0, seen - units.length),
      },
    };
  },

  "my-area": async (ctx) => {
    const periodId = ctx.periodId;
    if (!periodId) {
      return {
        urgency: 3,
        count: null,
        summary: "No reporting period to measure.",
        href: "/app/submissions",
      };
    }
    const tabs: string[] = [];
    for (const g of areaGrants(ctx)) {
      // The same population and tab rule as My Submissions, for the categories this role owns.
      const rows = await ctx.sql<OwnRecord[]>`
        select r.verification_status, r.validation_status, r.approval_status, r.data_quality_state,
               j.status as job_status
        from public.esg_records r
        join public.esg_metrics m on m.id = r.metric_id
        join public.esg_categories c on c.id = m.category_id
        join public.roles ro on ro.id = c.owning_role_id and ro.code = ${g.role}
        left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
        left join public.documents d on d.id = erd.document_id and d.deleted_at is null
        left join public.ocr_jobs j on j.document_id = d.id
        where r.org_unit_id = any(${g.units}::uuid[]) and r.reporting_period_id = ${periodId}`;
      for (const r of rows) {
        tabs.push(
          submissionTab({
            verificationStatus: r.verification_status,
            validationStatus: r.validation_status,
            approvalStatus: r.approval_status,
            dataQualityState: r.data_quality_state,
            jobStatus: r.job_status,
          }),
        );
      }
    }
    const slices = areaCounts(tabs);
    const total = slices.reduce((a, x) => a + x.value, 0);
    return {
      urgency: 3,
      count: null,
      summary:
        total > 0
          ? `${plural(total, "record", "records")} this period: ${slices
              .filter((x) => x.value > 0)
              .map((x) => `${x.value} ${x.label.toLowerCase()}`)
              .join(", ")}.`
          : "No records in your area yet this period.",
      href: "/app/submissions",
      chart: { kind: "area", slices },
    };
  },

  "my-missing": async (ctx) => {
    if (!ctx.periodId) {
      return {
        urgency: 3,
        count: 0,
        summary: "No reporting period to measure.",
        href: "/app/upload",
      };
    }
    const rows = await missingInArea(ctx);
    const late = (await openPeriods(ctx)).some((p) => p.late);
    return {
      urgency: rows.length === 0 ? 3 : late ? 0 : 2,
      count: rows.length,
      summary:
        rows.length > 0
          ? `expected ${rows.length === 1 ? "submission is" : "submissions are"} still missing${late ? ", and the period is past due" : ""}.`
          : "Every expected submission in your area has been filed.",
      href: "/app/upload",
    };
  },

  "register-status": async (ctx) => {
    const fy = await fyOf(ctx);
    const rows = await ctx.sql<{ status: string; totals: RegisterTotals }[]>`
      select r.status, r.totals
      from public.employee_registers r
      join public.org_units o on o.id = r.org_unit_id and o.deleted_at is null
      where r.financial_year = ${fy} and r.status <> 'superseded' and ${inUnits(ctx.sql, ctx.scope)}`;
    const n = (status: string) => rows.filter((r) => r.status === status).length;
    const approved = rows.filter((r) => r.status === "approved");
    const waiting = n("pending_verification") + n("verified");
    const people =
      approved.length > 0
        ? sumTotals(
            approved.map((r) => r.totals),
            fy,
          ).people
        : 0;
    return {
      urgency: n("returned") > 0 ? 1 : waiting > 0 ? 2 : 3,
      count: n("returned") + waiting,
      summary:
        rows.length === 0
          ? `No employee register uploaded for FY ${fyLabel(fy)}.`
          : `FY ${fyLabel(fy)}: ${approved.length} approved${approved.length > 0 ? ` (${people} people)` : ""}; registers waiting or returned need action.`,
      href: "/app/employee-register",
      chart: {
        kind: "stats",
        items: [
          { label: "Approved", value: n("approved") },
          { label: "Verified, awaiting approval", value: n("verified") },
          { label: "Waiting for verification", value: n("pending_verification") },
          { label: "Returned", value: n("returned") },
        ],
      },
    };
  },

  certificates: async (ctx) => {
    const units = unitsOf(ctx.scope) ?? [];
    const rows = units.length
      ? await ctx.sql<
          { unit: string; number: string | null; valid_to: string | null; today: string }[]
        >`
          select o.name as unit, n.verified_value as number, f.verified_value as valid_to,
                 public.reporting_period_today()::text as today
          from public.esg_records r
          join public.esg_metrics m on m.id = r.metric_id and m.code = 'COMPLIANCE_CERTIFICATE'
          join public.org_units o on o.id = r.org_unit_id and o.deleted_at is null
          join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
          join lateral (select e.id from public.ocr_extractions e
                         where e.document_id = erd.document_id
                         order by e.extracted_at desc limit 1) ex on true
          join public.ocr_fields f on f.ocr_extraction_id = ex.id and f.field_key = 'valid_to'
          left join public.ocr_fields n on n.ocr_extraction_id = ex.id and n.field_key = 'certificate_number'
          where r.verification_status = 'user_verified' and r.data_quality_state <> 'rejected'
            and r.org_unit_id = any(${units}::uuid[])`
      : [];
    // ponytail: a renewal is a new certificate, so an old expired one is not matched to its successor; only
    // certificates that expired in the last 90 days are shown, older ones are treated as history.
    const states = rows
      .map((r) => ({ r, s: certificateState(r.valid_to, r.today) }))
      .filter(({ s }) => s.state === "expiring" || (s.state === "expired" && (s.days ?? 0) >= -90))
      .sort((a, b) => (a.s.days ?? 0) - (b.s.days ?? 0));
    const expired = states.filter(({ s }) => s.state === "expired").length;
    const expiring = states.length - expired;
    return {
      urgency: expired > 0 ? 1 : expiring > 0 ? 2 : 3,
      count: states.length,
      summary:
        rows.length === 0
          ? "No compliance certificates on record yet."
          : states.length === 0
            ? "No certificate expires within 60 days."
            : `${expired} expired in the last 90 days, ${expiring} expiring within 60 days.`,
      href: "/app/submissions",
      chart:
        states.length > 0
          ? {
              kind: "list",
              rows: states.slice(0, 5).map(({ r, s }) => ({
                label: `${r.unit}${r.number ? ` · ${r.number}` : ""}`,
                detail:
                  s.state === "expired"
                    ? `Expired ${Math.abs(s.days ?? 0)} days ago`
                    : s.days === 0
                      ? "Expires today"
                      : `Expires in ${s.days} days`,
                tone: s.state === "expired" ? "error" : "warning",
              })),
              more: Math.max(0, states.length - 5),
            }
          : undefined,
    };
  },

  "financial-inputs": async (ctx) => {
    const fy = await fyOf(ctx);
    const [row] = await ctx.sql<{ value: Record<string, FyInputs> | null }[]>`
      select value from public.org_settings where key = ${REPORT_INPUTS_KEY}`;
    const inputs = row?.value?.[String(fy)];
    const items = [
      ["Turnover", inputs?.turnoverCr],
      ["PPP conversion rate", inputs?.pppRate],
      ["Net worth", inputs?.netWorthCr],
      ["Physical output", inputs?.physicalOutput],
    ] as const;
    const missing = items.filter(([, v]) => v === null || v === undefined).length;
    return {
      urgency: missing > 0 ? 2 : 3,
      count: missing,
      summary:
        missing > 0
          ? `of the four yearly inputs are not provided for FY ${fyLabel(fy)}.`
          : `All four yearly inputs are provided for FY ${fyLabel(fy)}.`,
      href: "/admin/disclosures",
      chart: {
        kind: "list",
        rows: items.map(([label, v]) => ({
          label,
          detail: v === null || v === undefined ? "Not provided" : "Provided",
          tone: v === null || v === undefined ? "warning" : undefined,
        })),
        more: 0,
      },
    };
  },

  "evidence-coverage": async (ctx) => {
    if (!ctx.periodId) {
      return {
        urgency: 3,
        count: null,
        summary: "No reporting period to measure.",
        href: "/admin/submissions",
      };
    }
    const list = await summaries(ctx);
    const step = (key: "evidence" | "validation" | "approval") =>
      addFractions(list.map((s) => s.pipeline[key]));
    const steps = [
      ["Evidence coverage", step("evidence")],
      ["Validation completion", step("validation")],
      ["Approval completion", step("approval")],
    ] as const;
    return {
      urgency: 3,
      count: null,
      summary: `${steps.map(([label, f]) => `${label} ${f.value === null ? "—" : `${pct(f)} %`}`).join(" · ")}. Read-only view for assurance.`,
      href: `/admin/submissions?period=${ctx.periodId}`,
      chart: { kind: "radials", items: steps.map(([label, f]) => ({ label, value: pct(f) })) },
    };
  },

  "brsr-readiness": async (ctx) => {
    if (!ctx.periodId) {
      return {
        urgency: 3,
        count: null,
        summary: "No reporting period to measure.",
        href: "/admin/brsr-mapping",
      };
    }
    const [top, list] = await Promise.all([roots(ctx), summaries(ctx)]);
    const units = top.map((r, i) => ({
      id: r.id,
      name: r.name,
      value: list[i].readiness.value === null ? null : Math.round(list[i].readiness.value),
      parts: list[i].readiness.components.map((c) => ({
        label: c.label,
        value: c.value === null ? null : Math.round(c.value),
      })),
    }));
    return {
      urgency: 3,
      count: null,
      summary:
        units.length === 0
          ? "Nothing to measure yet."
          : `${units.map((u) => `${u.name} ${u.value === null ? "—" : `${u.value} %`}`).join(" · ")}. An internal indicator, not an official score.`,
      href: `/admin/brsr-mapping?tab=readiness&period=${ctx.periodId}`,
      chart: units.length > 0 ? { kind: "readiness", units } : undefined,
    };
  },

  factors: async (ctx) => {
    const [row] = await ctx.sql<{ covered: number; lapsed: number; drafts: number }[]>`
      with today as (select public.reporting_period_today() as d),
      covering as (
        select distinct v.conversion_factor_id as id
        from public.conversion_factor_versions v, today
        where v.status = 'active' and v.effective_from <= today.d
          and (v.effective_to is null or v.effective_to > today.d))
      select (select count(*) from covering)::int as covered,
             (select count(*) from public.conversion_factors f
               where exists (select 1 from public.conversion_factor_versions v
                              where v.conversion_factor_id = f.id and v.status in ('active', 'superseded'))
                 and f.id not in (select id from covering))::int as lapsed,
             (select count(*) from public.conversion_factor_versions where status = 'draft')::int as drafts`;
    const open = row.lapsed + row.drafts;
    return {
      urgency: row.lapsed > 0 ? 1 : row.drafts > 0 ? 2 : 3,
      count: open,
      summary:
        open > 0
          ? `${plural(row.lapsed, "factor has", "factors have")} no version covering today, ${plural(row.drafts, "draft waits", "drafts wait")} for approval.`
          : "Every factor has a version covering today and nothing waits for approval.",
      href: "/admin/conversion-factors",
      chart: {
        kind: "stats",
        items: [
          { label: "Covering today", value: row.covered },
          { label: "No version covering today", value: row.lapsed },
          { label: "Drafts awaiting approval", value: row.drafts },
        ],
      },
    };
  },

  "users-access": async (ctx) => {
    const [row] = await ctx.sql<{ active: number; waiting: number; expired: number }[]>`
      select (select count(*) from public.users where is_active and deleted_at is null)::int as active,
             (select count(*) from public.user_invitations
               where consumed_at is null and revoked_at is null and expires_at > now())::int as waiting,
             (select count(*) from public.user_invitations
               where consumed_at is null and revoked_at is null and expires_at <= now())::int as expired`;
    return {
      urgency: row.expired > 0 ? 2 : 3,
      count: row.expired,
      summary:
        row.expired > 0
          ? "invitation links expired without being used; resend them from Users."
          : "No invitation has expired unused.",
      href: "/admin/users",
      chart: {
        kind: "stats",
        items: [
          { label: "Active people", value: row.active },
          { label: "Invitations waiting", value: row.waiting },
          { label: "Invitations expired unused", value: row.expired },
        ],
      },
    };
  },

  activity: async (ctx) => {
    const [row] = await ctx.sql<{ ready: number; failed: number; events: number }[]>`
      select (select count(*) from public.report_runs
               where status = 'completed' and requested_at > now() - interval '30 days')::int as ready,
             (select count(*) from public.report_runs
               where status = 'failed' and requested_at > now() - interval '30 days')::int as failed,
             (select count(*) from public.audit_logs
               where created_at > now() - interval '7 days')::int as events`;
    return {
      urgency: row.failed > 0 ? 1 : 3,
      count: row.failed,
      summary:
        row.failed > 0
          ? "reports failed in the last 30 days; see Reports for the reason."
          : "No report failed in the last 30 days.",
      href: "/admin/reports",
      chart: {
        kind: "stats",
        items: [
          { label: "Reports generated (30 days)", value: row.ready },
          { label: "Reports failed (30 days)", value: row.failed },
          { label: "Audit events (7 days)", value: row.events },
        ],
      },
    };
  },
};

/** One tile's data. A tile that fails to load says so; it never takes the dashboard down with it. */
export async function loadTile(tile: ResolvedTile, ctx: LoaderContext): Promise<TileData> {
  const base = { id: tile.id, title: tile.title, size: tile.size };
  try {
    const loader = LOADERS[tile.id];
    if (!loader) throw new Error(`no loader for ${tile.id}`);
    const scoped = { ...ctx, scope: tile.scope };
    const result = await loader(scoped);
    return { ...base, scopeLabel: await scopeLabel(scoped), ...result };
  } catch (error) {
    console.error(`dashboard tile ${tile.id} failed`, error);
    return {
      ...base,
      urgency: 3,
      count: null,
      summary: "This tile could not be loaded. Try again in a moment.",
      href: "/app",
      scopeLabel: "",
    };
  }
}

/** A per-request cache so tiles that need the same data run its query once. */
export function createMemo() {
  const cache = new Map<string, Promise<unknown>>();
  return <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    if (!cache.has(key)) cache.set(key, fn());
    return cache.get(key) as Promise<T>;
  };
}
