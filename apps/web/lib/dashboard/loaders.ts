import "server-only";
import { fraction, type Fraction } from "@/lib/dashboard/kpis";
import { summary } from "@/lib/dashboard/summary";
import {
  emissionFigures,
  hierarchyRows,
  levelRings,
  percent,
  type EmissionRow,
  type UnitRow,
} from "./overview";
import type { db } from "@/lib/db";
import { submissionTab, type RecordStatus } from "@/lib/ocr/rules";
import {
  buildFacts,
  TILE_PERMISSIONS,
  type Facts,
  type ResolvedTile,
  type TileData,
  type TileScope,
  type Urgency,
} from "./tiles";

// The data behind each tile (.grill/role-dashboard-decisions.md, Phase 2). Written without a database to run
// it on: the queries use columns other code in this repository already reads, and are checked only by the
// type checker so far (ROLE_DASHBOARD_VERIFY.md). Every query is limited to the tile's scope here, on the
// server; nothing is filtered in the browser.

type Sql = ReturnType<typeof db>;

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
  const assigned = [...new Set(grants.map((g) => g.org_unit_id))];
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
const scopeKey = (scope: TileScope) =>
  scope.kind === "units" ? `units:${[...scope.units].sort().join(",")}` : scope.kind;

/** `r.org_unit_id` limited to the tile's units; everything for the whole group. */
const inUnits = (sql: Sql, scope: TileScope) =>
  scope.kind === "units" ? sql`r.org_unit_id = any(${scope.units}::uuid[])` : sql`true`;

/** The top units of a scope (units with no other unit of the scope above them), with their names. */
async function roots(ctx: LoaderContext): Promise<{ id: string; name: string }[]> {
  const { sql, scope } = ctx;
  return ctx.memo(`roots:${scopeKey(scope)}`, async () =>
    scope.kind === "units"
      ? sql<{ id: string; name: string }[]>`
          select o.id, o.name from public.org_units o
          where o.id = any(${scope.units}::uuid[]) and o.deleted_at is null
            and not exists (
              select 1 from public.org_unit_tree t
              where t.descendant_id = o.id and t.ancestor_id <> o.id
                and t.ancestor_id = any(${scope.units}::uuid[]))
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
        and ${scope.kind === "units" ? sql`u.id = any(${scope.units}::uuid[])` : sql`true`}
      group by u.id, u.name, u.parent_id, u.unit_type, l.label, l.sort_order`;
  });

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Where a tile link goes: the chosen period, and the one top unit when there is just one. */
const linkQuery = (ctx: LoaderContext, rootIds: string[]) =>
  [ctx.periodId ? `period=${ctx.periodId}` : "", rootIds.length === 1 ? `org=${rootIds[0]}` : ""]
    .filter(Boolean)
    .join("&");

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

  "emissions-overview": async (ctx) => {
    const rows = await emissionRows(ctx);
    const f = emissionFigures(rows, ctx.periodId);
    const ids = (await roots(ctx)).map((r) => r.id);
    const q = linkQuery(ctx, ids);
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
      href: `/admin/scope-1${q ? `?${q}` : ""}`,
      chart: {
        kind: "emissions",
        unit: "tCO2e",
        total: round1(f.total),
        periodLabel: f.periodLabel ?? "",
        slices: f.slices.map((s, i) => ({ ...s, value: round1(s.value), href: scopeHref(i + 1) })),
        trend: f.trend,
      },
    };
  },

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
