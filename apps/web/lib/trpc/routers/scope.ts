import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { loadCalculations } from "@/lib/calculation/lookup";
import type { CalculationState } from "@/lib/calculation/trace";
import { db } from "@/lib/db";
import { scopeBreakdown, type ScopeBreakdown } from "@/lib/scope/totals";
import { adminProcedure, protectedProcedure, router } from "@/lib/trpc/init";

// Scope dashboards (03_APP_FLOW.md §2.2; 06_IMPLEMENTATION_PLAN.md Phase 10). `getTotal` is parameterised
// by scope code so Scope 2 and Scope 3 reuse it unchanged. Admin-only for the organisation-wide view;
// everyone else gets `myTotal`, limited to the org units they are assigned to.

const input = z.object({
  scopeCode: z.string().trim().min(1).max(40),
  orgUnitId: z.uuid().optional(),
  periodId: z.uuid().optional(),
});

async function resolvePeriod(periodId: string | undefined): Promise<string | null> {
  if (periodId) return periodId;
  const sql = db();
  const [open] = await sql<{ id: string }[]>`
    select id from public.reporting_periods where status = 'open' order by start_date desc limit 1`;
  if (open) return open.id;
  // No period is open (all closed): fall back to the most recent one so the page still has something.
  const [latest] = await sql<{ id: string }[]>`
    select id from public.reporting_periods order by start_date desc limit 1`;
  return latest?.id ?? null;
}

export type ScopeView = ScopeBreakdown & {
  periodId: string;
  periodLabel: string;
  periods: { id: string; label: string }[];
};

async function view(scopeCode: string, orgUnitId: string, periodId: string): Promise<ScopeView> {
  const sql = db();
  const [breakdown, [period], periods] = await Promise.all([
    scopeBreakdown(sql, { scopeCode, orgUnitId, periodId }),
    sql<{ label: string }[]>`select label from public.reporting_periods where id = ${periodId}`,
    sql<{ id: string; label: string }[]>`
      select id, label from public.reporting_periods order by start_date desc limit 24`,
  ]);
  return { ...breakdown, periodId, periodLabel: period?.label ?? "", periods };
}

export const scopeRouter = router({
  /** One record's stored calculation, for the drill-down drawer. Scope-checked like every read. */
  recordTrace: protectedProcedure
    .input(z.object({ recordId: z.uuid() }))
    .query(async ({ ctx, input }): Promise<CalculationState> => {
      const sql = db();
      if (!ctx.session.isAdmin) {
        const [allowed] = await sql<{ ok: boolean }[]>`
          with recursive scope as (
            select uoa.org_unit_id as id from public.user_org_assignments uoa
            where uoa.user_id = ${ctx.session.userId} and uoa.revoked_at is null
            union
            select o.id from public.org_units o join scope s on o.parent_id = s.id
          )
          select exists (
            select 1 from public.esg_records r where r.id = ${input.recordId}
              and r.org_unit_id in (select id from scope)) as ok`;
        if (!allowed?.ok) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That record isn't available." });
        }
      }
      const state = await loadCalculations(sql, [input.recordId]);
      return state.get(input.recordId) ?? { trace: null, blockedReason: null };
    }),

  /** Organisation-wide totals for a scope, one org level at a time (Admin). */
  getTotal: adminProcedure.input(input).query(async ({ input }): Promise<ScopeView | null> => {
    const sql = db();
    const periodId = await resolvePeriod(input.periodId);
    if (!periodId) return null;
    let orgUnitId = input.orgUnitId;
    if (!orgUnitId) {
      const [root] = await sql<{ id: string }[]>`
        select id from public.org_units where parent_id is null and deleted_at is null limit 1`;
      orgUnitId = root?.id;
    }
    if (!orgUnitId) return null;
    return view(input.scopeCode, orgUnitId, periodId);
  }),

  /**
   * The same figures for one org unit the signed-in user is assigned to (their project's Scope 1 total on
   * their dashboard). Scope is checked here, not in the page.
   */
  myTotal: protectedProcedure
    .input(input)
    .query(async ({ ctx, input }): Promise<ScopeView | null> => {
      const sql = db();
      const periodId = await resolvePeriod(input.periodId);
      if (!periodId) return null;

      const assignments = await sql<{ id: string }[]>`
      select distinct uoa.org_unit_id as id
      from public.user_org_assignments uoa
      join public.org_units o on o.id = uoa.org_unit_id and o.deleted_at is null
      where uoa.user_id = ${ctx.session.userId} and uoa.revoked_at is null
      order by uoa.org_unit_id`;
      if (assignments.length === 0) return null;

      const orgUnitId = input.orgUnitId ?? assignments[0].id;
      if (input.orgUnitId) {
        // Only within an assigned subtree — a user never reads a branch they aren't responsible for.
        const [allowed] = await sql<{ ok: boolean }[]>`
        with recursive scope as (
          select uoa.org_unit_id as id from public.user_org_assignments uoa
          where uoa.user_id = ${ctx.session.userId} and uoa.revoked_at is null
          union
          select o.id from public.org_units o join scope s on o.parent_id = s.id
        )
        select exists (select 1 from scope where id = ${input.orgUnitId}) as ok`;
        if (!allowed?.ok) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That org unit isn't available." });
        }
      }
      return view(input.scopeCode, orgUnitId, periodId);
    }),
});
