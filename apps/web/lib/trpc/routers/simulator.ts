import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  buildMultiVectorPathwayComparison,
  simulateMultiVectorScenario,
} from "@/lib/simulator/engine";
import {
  getMultiVectorBaseline,
  getSimulatorBaseline,
  listSavedScenarios,
  saveScenarioSimulation,
} from "@/lib/simulator/service";
import { protectedProcedure, router } from "@/lib/trpc/init";

export const simulatorRouter = router({
  /**
   * Retrieves accessible organization units and reporting periods for the simulator selectors.
   */
  options: protectedProcedure.query(async ({ ctx }) => {
    const sql = db();

    let orgUnits: Array<{ id: string; name: string; code: string; depth: number }> = [];

    if (ctx.session.isAdmin) {
      orgUnits = await sql<{ id: string; name: string; code: string; depth: number }[]>`
        with recursive tree as (
          select id, name, code, 0 as depth, array[name::text] as path
          from public.org_units where parent_id is null and deleted_at is null
          union all
          select o.id, o.name, o.code, t.depth + 1, t.path || o.name::text
          from public.org_units o join tree t on o.parent_id = t.id where o.deleted_at is null
        )
        select id, name, code, depth from tree order by path`;
    } else {
      orgUnits = await sql<{ id: string; name: string; code: string; depth: number }[]>`
        with recursive assigned as (
          select o.id, o.name, o.code, 0 as depth, array[o.name::text] as path
          from public.org_units o
          join public.user_org_assignments a on a.org_unit_id = o.id
          where a.user_id = ${ctx.session.userId} and a.revoked_at is null and o.deleted_at is null
          union all
          select child.id, child.name, child.code, parent.depth + 1, parent.path || child.name::text
          from public.org_unit_links l
          join assigned parent on l.parent_id = parent.id
          join public.org_units child on child.id = l.child_id
          where child.deleted_at is null
        )
        select distinct id, name, code, depth from assigned order by depth, name`;
    }

    const periods = await sql<
      { id: string; label: string; start_date: string; end_date: string; status: string }[]
    >`
      select id, label, start_date::text, end_date::text, status::text
      from public.reporting_periods
      order by start_date desc`;

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const open =
      periods.find((p) => p.status === "open" && p.start_date <= today) ??
      periods.find((p) => p.start_date <= today) ??
      periods[0];

    return {
      orgUnits: orgUnits.map((u) => ({ id: u.id, name: u.name, code: u.code, depth: u.depth })),
      periods: periods.map((p) => ({
        id: p.id,
        label: p.label,
        startDate: p.start_date,
        endDate: p.end_date,
        status: p.status,
      })),
      defaultOrgUnitId: orgUnits[0]?.id ?? null,
      defaultPeriodId: open?.id ?? null,
    };
  }),

  /**
   * Loads category-level emissions baseline for backwards compatibility.
   */
  baseline: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        periodId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sql = db();

      if (!ctx.session.isAdmin) {
        const [allowed] = await sql<{ ok: boolean }[]>`
          select exists (
            select 1 from public.org_unit_tree t
            join public.user_org_assignments a on a.org_unit_id = t.ancestor_id
            where a.user_id = ${ctx.session.userId}
              and a.revoked_at is null
              and t.descendant_id = ${input.orgUnitId}
          ) as ok`;

        if (!allowed?.ok) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not authorized to view simulation data for this organization unit.",
          });
        }
      }

      return getSimulatorBaseline(sql, input);
    }),

  /**
   * Loads comprehensive multi-vector baseline (Electricity, Renewables, Fuel, Water, Waste, GHG Scopes, ICP).
   */
  multiVectorBaseline: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        periodId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sql = db();

      if (!ctx.session.isAdmin) {
        const [allowed] = await sql<{ ok: boolean }[]>`
          select exists (
            select 1 from public.org_unit_tree t
            join public.user_org_assignments a on a.org_unit_id = t.ancestor_id
            where a.user_id = ${ctx.session.userId}
              and a.revoked_at is null
              and t.descendant_id = ${input.orgUnitId}
          ) as ok`;

        if (!allowed?.ok) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not authorized to view simulation data for this organization unit.",
          });
        }
      }

      return getMultiVectorBaseline(sql, input);
    }),

  /**
   * Runs multi-vector simulation (renewables, fuel switch, water, waste, and financial ICP).
   */
  simulate: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        periodId: z.string().uuid(),
        scenarioName: z.string().optional(),
        targetRenewableSharePct: z.number().min(0).max(100).optional(),
        fuelSwitchPct: z.number().min(0).max(100).optional(),
        targetCleanFuel: z.enum(["GRID_ELECTRICITY", "EV", "BIOMASS", "SOLAR_BATTERY"]).optional(),
        waterRecycledPct: z.number().min(0).max(100).optional(),
        wasteDivertedPct: z.number().min(0).max(100).optional(),
        capexAmount: z.number().min(0).optional(),
        discountRatePercent: z.number().min(0).max(30).optional(),
        shadowPriceOverride: z.number().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();

      if (!ctx.session.isAdmin) {
        const [allowed] = await sql<{ ok: boolean }[]>`
          select exists (
            select 1 from public.org_unit_tree t
            join public.user_org_assignments a on a.org_unit_id = t.ancestor_id
            where a.user_id = ${ctx.session.userId}
              and a.revoked_at is null
              and t.descendant_id = ${input.orgUnitId}
          ) as ok`;

        if (!allowed?.ok) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not authorized to run simulations for this organization unit.",
          });
        }
      }

      const baseline = await getMultiVectorBaseline(sql, {
        orgUnitId: input.orgUnitId,
        periodId: input.periodId,
      });

      return simulateMultiVectorScenario(baseline, input);
    }),

  /**
   * Compares 4 standard decarbonization pathways: Baseline, Conservative, Moderate,
   * Ambitious, and optional custom parameters.
   */
  comparePathways: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        periodId: z.string().uuid(),
        customInput: z
          .object({
            scenarioName: z.string().optional(),
            targetRenewableSharePct: z.number().min(0).max(100).optional(),
            fuelSwitchPct: z.number().min(0).max(100).optional(),
            waterRecycledPct: z.number().min(0).max(100).optional(),
            wasteDivertedPct: z.number().min(0).max(100).optional(),
            capexAmount: z.number().min(0).optional(),
          })
          .optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sql = db();

      if (!ctx.session.isAdmin) {
        const [allowed] = await sql<{ ok: boolean }[]>`
          select exists (
            select 1 from public.org_unit_tree t
            join public.user_org_assignments a on a.org_unit_id = t.ancestor_id
            where a.user_id = ${ctx.session.userId}
              and a.revoked_at is null
              and t.descendant_id = ${input.orgUnitId}
          ) as ok`;

        if (!allowed?.ok) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not authorized to view simulation data for this organization unit.",
          });
        }
      }

      const baseline = await getMultiVectorBaseline(sql, {
        orgUnitId: input.orgUnitId,
        periodId: input.periodId,
      });

      return buildMultiVectorPathwayComparison(baseline, input.customInput);
    }),

  /**
   * Saves a simulated scenario snapshot to the database.
   */
  saveScenario: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        reportingPeriodId: z.string().uuid(),
        scenarioName: z.string().min(1),
        scenarioType: z.enum([
          "RENEWABLE_ENERGY",
          "EMISSIONS_REDUCTION",
          "WATER_CONSERVATION",
          "WASTE_CIRCULARITY",
          "BLENDED_PATHWAY",
          "CUSTOM_CATEGORY",
        ]),
        parameters: z.record(z.string(), z.unknown()),
        simulationResult: z.any(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();

      const scenarioId = await saveScenarioSimulation(sql, {
        orgUnitId: input.orgUnitId,
        reportingPeriodId: input.reportingPeriodId,
        scenarioName: input.scenarioName,
        scenarioType: input.scenarioType,
        parameters: input.parameters,
        simulationResult: input.simulationResult,
        userId: ctx.session.userId,
      });

      return { id: scenarioId, success: true };
    }),

  /**
   * Retrieves saved scenario simulations for an organization unit and reporting period.
   */
  listSavedScenarios: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        reportingPeriodId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sql = db();

      if (!ctx.session.isAdmin) {
        const [allowed] = await sql<{ ok: boolean }[]>`
          select exists (
            select 1 from public.org_unit_tree t
            join public.user_org_assignments a on a.org_unit_id = t.ancestor_id
            where a.user_id = ${ctx.session.userId}
              and a.revoked_at is null
              and t.descendant_id = ${input.orgUnitId}
          ) as ok`;

        if (!allowed?.ok) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not authorized to view saved scenarios for this organization unit.",
          });
        }
      }

      return listSavedScenarios(sql, input);
    }),
});
