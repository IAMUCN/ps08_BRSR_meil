import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { runCalculation } from "@/lib/calculation/engine";
import { sameQuantity } from "@/lib/calculation/units";
import { db } from "@/lib/db";
import { fetchSource } from "@/lib/factors/source";
import {
  checkLink,
  fyLabel,
  fyOf,
  fyRange,
  OUTPUT_UNITS,
  reliability,
  type Reliability,
  type SourceHost,
} from "@/lib/factors/source-text";
import { bucket, count, exceeded } from "@/lib/security/rate-limit";
import { adminProcedure, permissionProcedure, router } from "@/lib/trpc/init";

// Conversion Factor Management (03_APP_FLOW.md §2.2 "Conversion Factors", TRD §25, schema §10.1/§10.2).
// Factor *values* are regulatory data entered here with a source reference, never seeded or hard-coded
// (.grill/phase-9-calculation-engine-decisions.md). A version that a calculation already used is never
// edited — a correction is a new version, and the database trigger (§19.3) is the backstop.
//
// Phase 6 of feature_enhancement.md (D50, A46): every new or corrected version is a draft until a Super Admin
// other than the one who entered it approves it (the only Super Admin may approve their own, marked as such;
// migration 0060 holds the rule in the database too). A version records its source link, publisher, financial
// year and retrieval date; a link on an official site can be fetched and its likely values offered for review.

const manage = permissionProcedure("factor.manage");

export type FactorVersionRow = {
  id: string;
  versionNumber: number;
  value: number;
  inputUnit: string;
  outputUnit: string;
  sourceReference: string;
  geography: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "draft" | "active" | "superseded" | "retired";
  notes: string | null;
  /** The greenhouse gases the value covers, as its source states ("CO2", "HFCs"); null when not stated. */
  gases: string | null;
  sourceUrl: string | null;
  sourcePublisher: string | null;
  financialYear: string | null;
  sourceRetrievedOn: string | null;
  valueOrigin: "manual" | "fetched";
  reliability: Reliability;
  createdById: string;
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  selfApproved: boolean;
  reviewNote: string | null;
  /** Referenced by a stored calculation, so its value and units can never change. */
  used: boolean;
};

export type FactorRow = {
  id: string;
  activityType: string;
  metricName: string | null;
  metricUnit: string | null;
  name: string;
  versions: FactorVersionRow[];
};

const versionInput = {
  // Zero is a real factor value (market-based renewable electricity); negative is not
  // (.grill/phase-11-scope-2-decisions.md).
  value: z.number().min(0),
  inputUnit: z.string().trim().min(1).max(40),
  outputUnit: z.string().trim().min(1).max(40),
  sourceReference: z.string().trim().min(3).max(500),
  geography: z.string().trim().max(120).optional(),
  /**
   * The financial years the version is for (owner's decision, 2026-11-11; migration 0064): From and To as
   * "2027-28"; To defaults to From (one year). After its To year a version is inherited until a newer one starts.
   */
  fromYear: z.string().trim().max(7).optional(),
  toYear: z.string().trim().max(7).optional(),
  /** Older callers: dates, read as the financial years they fall in. */
  effectiveFrom: z.iso.date().optional(),
  effectiveTo: z.iso.date().nullish(),
  notes: z.string().trim().max(1000).optional(),
  gases: z.string().trim().max(60).optional(),
  sourceUrl: z.string().trim().max(500).optional(),
  sourcePublisher: z.string().trim().max(160).optional(),
  financialYear: z.string().trim().max(7).optional(),
  sourceRetrievedOn: z.iso.date().optional(),
  // 'fetched' when the value was picked from the fetched page; the hash says which copy of the page it was.
  valueOrigin: z.enum(["manual", "fetched"]).optional(),
  sourceContentSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
};

type VersionValues = z.infer<z.ZodObject<typeof versionInput>>;
type Tx = Parameters<typeof writeAudit>[0];

const bad = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });

async function sourceHosts(sql: Tx | ReturnType<typeof db> = db()): Promise<SourceHost[]> {
  const [row] = await sql<{ value: { hosts?: SourceHost[] } | null }[]>`
    select value from public.org_settings where key = 'factor_source_hosts'`;
  return row?.value?.hosts ?? [];
}

/**
 * The checks every version passes before it is stored (feature_enhancement.md 6.1: units, geography, financial
 * year, source). Returns the values to store, with the output unit spelt the standard way.
 */
async function checkVersion(
  tx: Tx,
  factorId: string | null,
  activityType: string,
  v: VersionValues,
) {
  const [metric] = await tx<{ unit: string; name: string }[]>`
    select unit, name from public.esg_metrics
    where code = ${activityType} and deleted_at is null and requires_conversion_factor`;
  if (!metric) throw bad("That activity does not take a conversion factor.");
  if (!sameQuantity(v.inputUnit, metric.unit)) {
    throw bad(
      `The factor must be per a unit of the same kind as the activity's unit (${metric.unit}); "${v.inputUnit}" is not.`,
    );
  }
  const outputUnit = OUTPUT_UNITS.find((u) => u.toLowerCase() === v.outputUnit.toLowerCase());
  if (!outputUnit) throw bad(`The result unit must be one of ${OUTPUT_UNITS.join(", ")}.`);
  if (factorId) {
    const [existing] = await tx<{ output_unit: string }[]>`
      select output_unit from public.conversion_factor_versions
      where conversion_factor_id = ${factorId} and status <> 'retired'
      order by version_number limit 1`;
    if (existing && existing.output_unit !== outputUnit) {
      throw bad(
        `This factor's results are in ${existing.output_unit}; a new version must use the same unit so totals stay comparable.`,
      );
    }
  }
  // Financial years, not dates (owner's decision, 2026-11-11; .grill/factor-financial-years-decisions.md).
  const fromLabel =
    v.fromYear ?? v.financialYear ?? (v.effectiveFrom ? fyLabel(fyOf(v.effectiveFrom)) : "");
  const from = fyRange(fromLabel);
  if (!from) throw bad('Choose the first financial year, written like "2027-28".');
  const toLabel = v.toYear ?? (v.effectiveTo ? fyLabel(fyOf(v.effectiveTo)) : fromLabel);
  const to = fyRange(toLabel);
  if (!to) throw bad('The last financial year is written like "2027-28".');
  if (to.start < from.start) throw bad("The last financial year cannot be before the first.");
  // Changes take effect from the next financial year. An earlier year is allowed only where no value exists
  // yet for any year of the range (a first entry, or history before the first value).
  const [{ today }] = await tx<{ today: string }[]>`
    select public.reporting_period_today()::text as today`;
  const next = fyOf(today) + 1;
  if (from.start < next) {
    const [taken] = factorId
      ? await tx<{ fy: string }[]>`
          select financial_year as fy from public.conversion_factor_versions
          where conversion_factor_id = ${factorId} and status in ('active', 'superseded', 'draft')
            and effective_from <= ${to.to}::date
          order by effective_from limit 1`
      : [];
    if (taken) {
      throw bad(
        `This factor already has a value for FY ${fromLabel}${toLabel !== fromLabel ? ` to FY ${toLabel}` : ""} (entered or inherited), so a change takes effect from FY ${fyLabel(next)}.`,
      );
    }
  }
  const effectiveFrom = from.from;
  const effectiveTo = to.to;
  const financialYear = fromLabel;
  let sourceUrl: string | null = null;
  if (v.sourceUrl) {
    const link = checkLink(v.sourceUrl);
    if (!link.ok) throw bad(link.reason);
    sourceUrl = link.url.toString();
  }
  if (v.valueOrigin === "fetched" && (!sourceUrl || !v.sourceContentSha256)) {
    throw bad("A value taken from a fetched page needs the page's link and its fingerprint.");
  }
  return {
    ...v,
    effectiveFrom,
    effectiveTo,
    toYear: toLabel,
    outputUnit,
    financialYear,
    sourceUrl,
    valueOrigin: v.valueOrigin ?? "manual",
  };
}

type CheckedVersion = Awaited<ReturnType<typeof checkVersion>>;

/** The other Super Admins who could approve: active, not deleted, holding the role now. */
async function otherSuperAdmins(tx: Tx, userId: string) {
  return tx<{ id: string }[]>`
    select distinct u.id from public.users u
    join public.user_org_assignments a on a.user_id = u.id and a.revoked_at is null
    join public.roles r on r.id = a.role_id and r.code = 'admin'
    where u.is_active and u.deleted_at is null and u.id <> ${userId}`;
}

/** Tell the Super Admins who may approve it that a draft is waiting. */
async function notifyReviewers(tx: Tx, userId: string, title: string) {
  const reviewers = await otherSuperAdmins(tx, userId);
  for (const r of reviewers) {
    await tx`
      insert into public.notifications
        (user_id, type, title, message, related_entity_type, deep_link_path)
      values (${r.id}, 'factor_review', 'A conversion factor waits for approval', ${title},
              'conversion_factor', '/admin/conversion-factors')`;
  }
}

export const factorsRouter = router({
  /** Every factor with its full version history (the UI shows history inline, UI brief §14). */
  list: manage.query(async (): Promise<FactorRow[]> => {
    const sql = db();
    const hosts = await sourceHosts(sql);
    const rows = await sql<
      {
        id: string;
        activity_type: string;
        metric_name: string | null;
        metric_unit: string | null;
        name: string;
        versions: Omit<FactorVersionRow, "reliability">[] | null;
      }[]
    >`
      select f.id, f.activity_type, m.name as metric_name, m.unit as metric_unit, f.name,
             (select json_agg(json_build_object(
                       'id', v.id, 'versionNumber', v.version_number, 'value', v.value::float,
                       'inputUnit', v.input_unit, 'outputUnit', v.output_unit,
                       'sourceReference', v.source_reference, 'geography', v.geography,
                       'effectiveFrom', v.effective_from::text, 'effectiveTo', v.effective_to::text,
                       'status', v.status, 'notes', v.notes, 'gases', v.gases,
                       'sourceUrl', v.source_url, 'sourcePublisher', v.source_publisher,
                       'financialYear', v.financial_year,
                       'sourceRetrievedOn', v.source_retrieved_on::text,
                       'valueOrigin', v.value_origin,
                       'createdById', v.created_by,
                       'createdBy', u.display_name,
                       'createdAt', v.created_at,
                       'approvedBy', ap.display_name,
                       'approvedAt', v.approved_at,
                       'selfApproved', v.self_approved,
                       'reviewNote', v.review_note,
                       'used', exists (select 1 from public.calculations c
                                        where c.conversion_factor_version_id = v.id))
                       order by v.version_number desc)
                from public.conversion_factor_versions v
                join public.users u on u.id = v.created_by
                left join public.users ap on ap.id = v.approved_by
               where v.conversion_factor_id = f.id) as versions
      from public.conversion_factors f
      left join public.esg_metrics m on m.code = f.activity_type and m.deleted_at is null
      order by f.activity_type`;
    return rows.map((r) => ({
      id: r.id,
      activityType: r.activity_type,
      metricName: r.metric_name,
      metricUnit: r.metric_unit,
      name: r.name,
      versions: (r.versions ?? []).map((v) => ({
        ...v,
        reliability: reliability(v.sourceUrl, hosts),
      })),
    }));
  }),

  /** Activity types a factor can be created for — the configured metrics, so no free-text typos. */
  activityTypes: manage.query(async () => {
    const sql = db();
    return sql<{ code: string; name: string; unit: string }[]>`
      select code, name, unit from public.esg_metrics
      where deleted_at is null and requires_conversion_factor
      order by name`;
  }),

  /** The official sites a link may be fetched from (org_settings.factor_source_hosts). */
  sourceHosts: manage.query(async () => sourceHosts()),

  /**
   * The yearly review list (feature_enhancement.md 6.2; no SEBI or other official API publishes factors): every
   * activity that takes a factor with what covers 1 April of the financial year, so a Super Admin sees what
   * still needs a value for that year. A draft waiting for approval is shown as such.
   */
  review: manage
    .input(z.object({ financialYear: z.string().max(7).optional() }).optional())
    .query(async ({ input }) => {
      const sql = db();
      // The years offered run from the current financial year back to the earliest one with a factor version
      // or a reporting period, never ahead (owner's page feedback, 2026-11-11: the list walked on to 2029-30).
      const [{ today, earliest }] = await sql<{ today: string; earliest: string | null }[]>`
        select public.reporting_period_today()::text as today,
               least((select min(effective_from) from public.conversion_factor_versions),
                     (select min(start_date) from public.reporting_periods))::text as earliest`;
      const current = fyOf(today);
      const first = Math.min(current, earliest ? fyOf(earliest) : current);
      const years = Array.from({ length: current - first + 1 }, (_, i) => fyLabel(current - i));
      const asked = input?.financialYear ? fyRange(input.financialYear) : null;
      if (input?.financialYear && !asked) throw bad('A financial year is written like "2025-26".');
      const label = asked && asked.start <= current ? input!.financialYear! : fyLabel(current);
      const range = fyRange(label)!;
      const rows = await sql<
        {
          code: string;
          name: string;
          factor_id: string | null;
          covering: string | null;
          covering_to: string | null;
          covering_fy: string | null;
          drafts: number;
        }[]
      >`
        -- The version used for the year: the latest one starting on or before it, its own years or
        -- inherited after its last year (owner's decision, 2026-11-11; the calculation engine's rule).
        select m.code, m.name, f.id as factor_id, cv.status as covering, cv.effective_to::text as covering_to,
               cv.financial_year as covering_fy,
               (select count(*)::int from public.conversion_factor_versions v
                 where v.conversion_factor_id = f.id and v.status = 'draft') as drafts
        from public.esg_metrics m
        left join public.conversion_factors f on f.activity_type = m.code
        left join lateral (
          select v.status::text as status, v.effective_to, v.financial_year
          from public.conversion_factor_versions v
          where v.conversion_factor_id = f.id and v.status in ('active', 'superseded')
            and v.effective_from <= ${range.from}::date
          order by v.effective_from desc, v.version_number desc limit 1
        ) cv on true
        where m.deleted_at is null and m.requires_conversion_factor
        order by m.name`;
      return {
        financialYear: label,
        from: range.from,
        years,
        items: rows.map((r) => ({
          activityType: r.code,
          activityName: r.name,
          factorId: r.factor_id,
          state: !r.covering
            ? ("missing" as const)
            : !r.covering_to || r.covering_to >= range.from
              ? ("for_this_year" as const)
              : ("carried_over" as const),
          /** The year the value was entered for, when it is inherited. */
          inheritedFrom: r.covering_to && r.covering_to < range.from ? r.covering_fy : null,
          drafts: r.drafts,
        })),
      };
    }),

  /**
   * Read a source page on an official site and offer the numbers on it that look like factors. Nothing is
   * stored; the person picks a value (or types one) and saves a draft. Audited, 20 per person per 10 minutes.
   */
  fetchSource: manage
    .input(z.object({ url: z.string().trim().min(8).max(500), activityType: z.string().max(60) }))
    .mutation(async ({ ctx, input }) => {
      const limit = bucket("factor_fetch", ctx.session.userId);
      if (await exceeded(limit, 20, 10)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many pages fetched. Wait a few minutes and try again.",
        });
      }
      await count(limit);
      const sql = db();
      const [metric] = await sql<{ id: string; name: string; unit: string }[]>`
        select id, name, unit from public.esg_metrics
        where code = ${input.activityType} and deleted_at is null and requires_conversion_factor`;
      if (!metric) throw bad("That activity does not take a conversion factor.");
      const outcome = await fetchSource(input.url, await sourceHosts(sql), {
        metricUnit: metric.unit,
        keywords: [metric.name, input.activityType.replace(/_/g, " ")],
      });
      await sql.begin((tx) =>
        writeAudit(tx, {
          eventType: "factor.source_fetched",
          entityType: "esg_metric",
          entityId: metric.id,
          userId: ctx.session.userId,
          newValue: outcome.ok
            ? {
                url: outcome.source.finalUrl,
                activity_type: input.activityType,
                sha256: outcome.source.sha256,
                content_type: outcome.source.contentType,
                bytes: outcome.source.bytes,
                candidates: outcome.source.candidates.length,
              }
            : { url: input.url, activity_type: input.activityType, refused: outcome.reason },
        }),
      );
      return outcome;
    }),

  /** A new factor plus its first version, as a draft for approval. */
  create: manage
    .input(
      z.object({
        activityType: z.string().trim().min(1).max(60),
        name: z.string().trim().min(2).max(160),
        ...versionInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return db().begin(async (tx) => {
        const [exists] = await tx<{ id: string }[]>`
          select id from public.conversion_factors where activity_type = ${input.activityType}`;
        if (exists) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "A factor already exists for this activity type — add a version to it instead.",
          });
        }
        const checked = await checkVersion(tx, null, input.activityType, input);
        const [factor] = await tx<{ id: string }[]>`
          insert into public.conversion_factors (activity_type, name)
          values (${input.activityType}, ${input.name}) returning id`;
        const versionId = await insertVersion(tx, factor.id, 1, checked, ctx.session.userId);
        await writeAudit(tx, {
          eventType: "factor.created",
          entityType: "conversion_factor",
          entityId: factor.id,
          userId: ctx.session.userId,
          newValue: { ...checked, version_number: 1, version_id: versionId, status: "draft" },
        });
        await notifyReviewers(
          tx,
          ctx.session.userId,
          `${input.name}: version 1, ${checked.value} ${checked.outputUnit} per ${checked.inputUnit}.`,
        );
        return { factorId: factor.id, versionId };
      });
    }),

  /** A correction or an update: a new version, as a draft. Nothing changes until it is approved. */
  addVersion: manage
    .input(z.object({ factorId: z.uuid(), ...versionInput }))
    .mutation(async ({ ctx, input }) => {
      return db().begin(async (tx) => {
        // The factor row is locked first, so two versions added at once get different numbers.
        const [factor] = await tx<
          { id: string; activity_type: string; name: string; next: number }[]
        >`
          select f.id, f.activity_type, f.name,
                 (select coalesce(max(v.version_number), 0) + 1 from public.conversion_factor_versions v
                   where v.conversion_factor_id = f.id) as next
          from public.conversion_factors f
          where f.id = ${input.factorId}
          for update`;
        if (!factor) throw new TRPCError({ code: "NOT_FOUND", message: "Factor not found." });
        const checked = await checkVersion(tx, factor.id, factor.activity_type, input);
        const versionId = await insertVersion(
          tx,
          factor.id,
          factor.next,
          checked,
          ctx.session.userId,
        );
        await writeAudit(tx, {
          eventType: "factor.version_added",
          entityType: "conversion_factor",
          entityId: factor.id,
          userId: ctx.session.userId,
          newValue: {
            ...checked,
            version_number: factor.next,
            version_id: versionId,
            status: "draft",
          },
        });
        await notifyReviewers(
          tx,
          ctx.session.userId,
          `${factor.name}: version ${factor.next}, ${checked.value} ${checked.outputUnit} per ${checked.inputUnit}.`,
        );
        return { versionId };
      });
    }),

  /**
   * Approve a draft (Super Admin only). The approver must be another Super Admin than the one who entered it,
   * unless no other Super Admin exists. The version it replaces is superseded and closed the day before the new
   * one starts, so exactly one version is effective on any date.
   */
  approve: adminProcedure
    .input(z.object({ versionId: z.uuid(), note: z.string().trim().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      return db().begin(async (tx) => {
        const [version] = await tx<
          {
            id: string;
            factor_id: string;
            status: string;
            created_by: string;
            effective_from: string;
          }[]
        >`
          select id, conversion_factor_id as factor_id, status::text, created_by,
                 effective_from::text
          from public.conversion_factor_versions where id = ${input.versionId} for update`;
        if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found." });
        if (version.status !== "draft") {
          throw new TRPCError({ code: "CONFLICT", message: "Only a draft waits for approval." });
        }
        const self = version.created_by === ctx.session.userId;
        if (self && (await otherSuperAdmins(tx, ctx.session.userId)).length > 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You entered this version, so another Super Admin must approve it.",
          });
        }
        const superseded = await tx<{ id: string }[]>`
          update public.conversion_factor_versions
          set status = 'superseded',
              effective_to = least(coalesce(effective_to, 'infinity'::date),
                                   ${version.effective_from}::date - 1)
          where conversion_factor_id = ${version.factor_id} and status = 'active'
            and effective_from < ${version.effective_from}::date
          returning id`;
        await tx`
          update public.conversion_factor_versions
          set status = 'active', approved_by = ${ctx.session.userId}, approved_at = now(),
              self_approved = ${self}, review_note = ${input.note || null}
          where id = ${version.id}`;
        await writeAudit(tx, {
          eventType: "factor.version_approved",
          entityType: "conversion_factor_version",
          entityId: version.id,
          userId: ctx.session.userId,
          oldValue: { status: "draft", superseded_version_ids: superseded.map((s) => s.id) },
          newValue: { status: "active", self_approved: self, note: input.note || null },
        });
        if (!self) {
          await tx`
            insert into public.notifications
              (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
            values (${version.created_by}, 'factor_review', 'Conversion factor approved',
                    'A conversion factor version you entered was approved and is now in use.',
                    'conversion_factor_version', ${version.id}::uuid, '/admin/conversion-factors')`;
        }
        return { selfApproved: self };
      });
    }),

  /** Turn a draft down (or withdraw your own) with a reason. It is kept, retired, and never used. */
  reject: adminProcedure
    .input(z.object({ versionId: z.uuid(), reason: z.string().trim().min(10).max(500) }))
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        const [version] = await tx<{ id: string; status: string; created_by: string }[]>`
          select id, status::text, created_by from public.conversion_factor_versions
          where id = ${input.versionId} for update`;
        if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found." });
        if (version.status !== "draft") {
          throw new TRPCError({ code: "CONFLICT", message: "Only a draft can be turned down." });
        }
        await tx`
          update public.conversion_factor_versions set status = 'retired', review_note = ${input.reason}
          where id = ${version.id}`;
        await writeAudit(tx, {
          eventType: "factor.version_rejected",
          entityType: "conversion_factor_version",
          entityId: version.id,
          userId: ctx.session.userId,
          oldValue: { status: "draft" },
          newValue: { status: "retired", reason: input.reason },
        });
        if (version.created_by !== ctx.session.userId) {
          await tx`
            insert into public.notifications
              (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
            values (${version.created_by}, 'factor_review', 'Conversion factor turned down',
                    ${input.reason}, 'conversion_factor_version', ${version.id}::uuid,
                    '/admin/conversion-factors')`;
        }
      });
      return null;
    }),

  /**
   * Retire a version (stops it being selected for new calculations), or put back one that was retired after
   * being in use. A draft is approved or turned down instead. Values and units are never touched here.
   */
  setStatus: manage
    .input(z.object({ versionId: z.uuid(), status: z.enum(["active", "retired"]) }))
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        // A draft that was turned down has a reason and no approver; it never comes back.
        const [version] = await tx<{ id: string; status: string; turned_down: boolean }[]>`
          select id, status::text, (approved_by is null and review_note is not null) as turned_down
          from public.conversion_factor_versions
          where id = ${input.versionId} for update`;
        if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found." });
        if (version.status === "draft") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A draft is approved or turned down, not switched on or off.",
          });
        }
        if (input.status === "active" && version.turned_down) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This version was turned down and cannot be put back. Add a new version instead.",
          });
        }
        await tx`
          update public.conversion_factor_versions set status = ${input.status}
          where id = ${version.id}`;
        await writeAudit(tx, {
          eventType: "factor.status_changed",
          entityType: "conversion_factor_version",
          entityId: version.id,
          userId: ctx.session.userId,
          oldValue: { status: version.status },
          newValue: { status: input.status },
        });
      });
      return null;
    }),

  /** A factor's display name. The values, units and sources of its versions are untouched. */
  rename: manage
    .input(z.object({ factorId: z.uuid(), name: z.string().trim().min(2).max(160) }))
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        const [factor] = await tx<{ name: string }[]>`
          select name from public.conversion_factors where id = ${input.factorId} for update`;
        if (!factor) throw new TRPCError({ code: "NOT_FOUND", message: "Factor not found." });
        await tx`update public.conversion_factors set name = ${input.name} where id = ${input.factorId}`;
        await writeAudit(tx, {
          eventType: "factor.renamed",
          entityType: "conversion_factor",
          entityId: input.factorId,
          userId: ctx.session.userId,
          oldValue: { name: factor.name },
          newValue: { name: input.name },
        });
      });
      return null;
    }),

  /**
   * Which gases a version's value covers — a disclosure the report groups on, not part of the number, so
   * it can be stated for a version calculations already used.
   */
  setGases: manage
    .input(z.object({ versionId: z.uuid(), gases: z.string().trim().max(60).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        const [version] = await tx<{ gases: string | null }[]>`
          select gases from public.conversion_factor_versions where id = ${input.versionId} for update`;
        if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found." });
        await tx`
          update public.conversion_factor_versions set gases = ${input.gases || null}
          where id = ${input.versionId}`;
        await writeAudit(tx, {
          eventType: "factor.gases_changed",
          entityType: "conversion_factor_version",
          entityId: input.versionId,
          userId: ctx.session.userId,
          oldValue: { gases: version.gases },
          newValue: { gases: input.gases || null },
        });
      });
      return null;
    }),

  /**
   * Run the engine again for one record — used after the missing factor is added. Never for an approved
   * record: its number has already been decided on (grill log, Phase 9).
   */
  recalculate: manage.input(z.object({ recordId: z.uuid() })).mutation(async ({ ctx, input }) => {
    return db().begin(async (tx) => {
      const [record] = await tx<{ id: string; approval_status: string }[]>`
        select id, approval_status::text from public.esg_records
        where id = ${input.recordId} for update`;
      if (!record)
        throw new TRPCError({ code: "NOT_FOUND", message: "That record isn't available." });
      if (record.approval_status === "approved") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This record is already approved, so its calculation is closed.",
        });
      }
      const outcome = await runCalculation(tx, record.id, ctx.session.userId);
      if (outcome.status === "blocked") {
        throw new TRPCError({ code: "CONFLICT", message: outcome.reason });
      }
      return outcome;
    });
  }),
});

async function insertVersion(
  tx: Tx,
  factorId: string,
  versionNumber: number,
  input: CheckedVersion,
  userId: string,
) {
  const [row] = await tx<{ id: string }[]>`
    insert into public.conversion_factor_versions
      (conversion_factor_id, version_number, value, input_unit, output_unit, source_reference,
       geography, effective_from, effective_to, status, notes, gases, created_by,
       source_url, source_publisher, financial_year, source_retrieved_on, value_origin, source_content_sha256)
    values (${factorId}, ${versionNumber}, ${input.value}, ${input.inputUnit}, ${input.outputUnit},
            ${input.sourceReference}, ${input.geography || null}, ${input.effectiveFrom},
            ${input.effectiveTo ?? null}, 'draft', ${input.notes || null}, ${input.gases || null},
            ${userId}, ${input.sourceUrl}, ${input.sourcePublisher || null}, ${input.financialYear},
            ${input.sourceRetrievedOn ?? null}, ${input.valueOrigin}, ${input.sourceContentSha256 ?? null})
    returning id`;
  return row.id;
}
