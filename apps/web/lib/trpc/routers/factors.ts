import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { runCalculation } from "@/lib/calculation/engine";
import { db } from "@/lib/db";
import { permissionProcedure, router } from "@/lib/trpc/init";

// Conversion Factor Management (03_APP_FLOW.md §2.2 "Conversion Factors", TRD §25, schema §10.1/§10.2).
// Factor *values* are regulatory data entered here with a source reference, never seeded or hard-coded
// (.grill/phase-9-calculation-engine-decisions.md). A version that a calculation already used is never
// edited — a correction is a new version, and the database trigger (§19.3) is the backstop.

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
  createdBy: string;
  createdAt: string;
  /** Referenced by a stored calculation, so its value and units can never change. */
  used: boolean;
};

export type FactorRow = {
  id: string;
  activityType: string;
  metricName: string | null;
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
  effectiveFrom: z.iso.date(),
  effectiveTo: z.iso.date().nullish(),
  notes: z.string().trim().max(1000).optional(),
  gases: z.string().trim().max(60).optional(),
};

export const factorsRouter = router({
  /** Every factor with its full version history (the UI shows history inline, UI brief §14). */
  list: manage.query(async (): Promise<FactorRow[]> => {
    const sql = db();
    const rows = await sql<
      {
        id: string;
        activity_type: string;
        metric_name: string | null;
        name: string;
        versions: FactorVersionRow[] | null;
      }[]
    >`
      select f.id, f.activity_type, m.name as metric_name, f.name,
             (select json_agg(json_build_object(
                       'id', v.id, 'versionNumber', v.version_number, 'value', v.value::float,
                       'inputUnit', v.input_unit, 'outputUnit', v.output_unit,
                       'sourceReference', v.source_reference, 'geography', v.geography,
                       'effectiveFrom', v.effective_from::text, 'effectiveTo', v.effective_to::text,
                       'status', v.status, 'notes', v.notes, 'gases', v.gases,
                       'createdBy', u.display_name,
                       'createdAt', v.created_at,
                       'used', exists (select 1 from public.calculations c
                                        where c.conversion_factor_version_id = v.id))
                       order by v.version_number desc)
                from public.conversion_factor_versions v
                join public.users u on u.id = v.created_by
               where v.conversion_factor_id = f.id) as versions
      from public.conversion_factors f
      left join public.esg_metrics m on m.code = f.activity_type and m.deleted_at is null
      order by f.activity_type`;
    return rows.map((r) => ({
      id: r.id,
      activityType: r.activity_type,
      metricName: r.metric_name,
      name: r.name,
      versions: r.versions ?? [],
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

  /** A new factor plus its first version, active from the given date. */
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
        const [factor] = await tx<{ id: string }[]>`
          insert into public.conversion_factors (activity_type, name)
          values (${input.activityType}, ${input.name}) returning id`;
        const versionId = await insertVersion(tx, factor.id, 1, input, ctx.session.userId);
        await writeAudit(tx, {
          eventType: "factor.created",
          entityType: "conversion_factor",
          entityId: factor.id,
          userId: ctx.session.userId,
          newValue: { ...input, version_number: 1, version_id: versionId },
        });
        return { factorId: factor.id };
      });
    }),

  /**
   * A correction or an update: a new version row. The version it replaces is superseded and closed the day
   * before the new one starts, so exactly one version is effective on any date.
   */
  addVersion: manage
    .input(z.object({ factorId: z.uuid(), ...versionInput }))
    .mutation(async ({ ctx, input }) => {
      return db().begin(async (tx) => {
        const [factor] = await tx<{ id: string; activity_type: string; next: number }[]>`
          select f.id, f.activity_type,
                 coalesce(max(v.version_number), 0) + 1 as next
          from public.conversion_factors f
          left join public.conversion_factor_versions v on v.conversion_factor_id = f.id
          where f.id = ${input.factorId}
          group by f.id, f.activity_type`;
        if (!factor) throw new TRPCError({ code: "NOT_FOUND", message: "Factor not found." });

        const superseded = await tx<{ id: string }[]>`
          update public.conversion_factor_versions
          set status = 'superseded',
              effective_to = least(coalesce(effective_to, 'infinity'::date),
                                   ${input.effectiveFrom}::date - 1)
          where conversion_factor_id = ${factor.id} and status = 'active'
            and effective_from < ${input.effectiveFrom}::date
          returning id`;
        const versionId = await insertVersion(
          tx,
          factor.id,
          factor.next,
          input,
          ctx.session.userId,
        );
        await writeAudit(tx, {
          eventType: "factor.version_added",
          entityType: "conversion_factor",
          entityId: factor.id,
          userId: ctx.session.userId,
          oldValue: { superseded_version_ids: superseded.map((s) => s.id) },
          newValue: { ...input, version_number: factor.next, version_id: versionId },
        });
        return { versionId };
      });
    }),

  /**
   * Retire a version (stops it being selected for new calculations) or activate a draft. Values and units
   * are never touched here — that is what versioning is for.
   */
  setStatus: manage
    .input(z.object({ versionId: z.uuid(), status: z.enum(["active", "retired"]) }))
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        const [version] = await tx<{ id: string; factor_id: string; status: string }[]>`
          select id, conversion_factor_id as factor_id, status::text from public.conversion_factor_versions
          where id = ${input.versionId} for update`;
        if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found." });
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

type VersionValues = z.infer<z.ZodObject<typeof versionInput>>;

async function insertVersion(
  tx: Parameters<typeof writeAudit>[0],
  factorId: string,
  versionNumber: number,
  input: VersionValues,
  userId: string,
) {
  const [row] = await tx<{ id: string }[]>`
    insert into public.conversion_factor_versions
      (conversion_factor_id, version_number, value, input_unit, output_unit, source_reference,
       geography, effective_from, effective_to, status, notes, gases, created_by)
    values (${factorId}, ${versionNumber}, ${input.value}, ${input.inputUnit}, ${input.outputUnit},
            ${input.sourceReference}, ${input.geography ?? null}, ${input.effectiveFrom},
            ${input.effectiveTo ?? null}, 'active', ${input.notes ?? null}, ${input.gases || null},
            ${userId})
    returning id`;
  return row.id;
}
