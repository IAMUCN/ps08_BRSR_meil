import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { assertOrgScope, scopedOrgUnitIds } from "@/lib/auth/scope";
import { financialYearOf } from "@/lib/consolidation/aggregate";
import { db } from "@/lib/db";
import type { RegisterTotals } from "@/lib/register/register";
import { registerPeople, type RegisterPeople } from "@/lib/register/service";
import { protectedProcedure, router } from "@/lib/trpc/init";

// The employee register (migration 0070). HR uploads, HR confirms the totals, an approver (not the uploader or
// the verifier) accepts them. Totals only are stored; the file is read again for the account-status view.
// Permissions: employee_register.manage (upload, confirm), employee_register.view (open the file, see who has
// an account), approval.decide (accept or return). Each applies inside the units where the caller's role holds it.

type Session = { userId: string; isAdmin: boolean; permissions: string[] };
const has = (s: Session, permission: string) => s.isAdmin || s.permissions.includes(permission);
const FORBIDDEN = new TRPCError({
  code: "FORBIDDEN",
  message: "You don't have permission to do that.",
});

export type RegisterRow = {
  id: string;
  orgUnitId: string;
  orgUnitName: string;
  financialYear: number;
  fileName: string;
  status: "pending_verification" | "verified" | "approved" | "returned";
  totals: RegisterTotals;
  uploadedBy: string;
  uploadedAt: string;
  verifiedBy: string | null;
  decisionNote: string | null;
  /** What the viewer may do with this one, decided here. */
  can: { confirm: boolean; decide: boolean; open: boolean };
};

export type RegisterOptions = {
  units: { id: string; name: string }[];
  years: number[];
  defaultYear: number | null;
  canManage: boolean;
  canView: boolean;
};

/** The org units where the caller holds any of the permissions; null = all of them. */
async function scopeOf(sql: ReturnType<typeof db>, session: Session, permissions: string[]) {
  const held = permissions.filter((p) => has(session, p));
  if (held.length === 0) throw FORBIDDEN;
  const lists = await Promise.all(held.map((p) => scopedOrgUnitIds(sql, session, p)));
  if (lists.some((l) => l === null)) return null;
  return [...new Set(lists.flatMap((l) => l ?? []))];
}

const ALL = ["employee_register.manage", "employee_register.view", "approval.decide"];

export const registerRouter = router({
  options: protectedProcedure.query(async ({ ctx }): Promise<RegisterOptions> => {
    const sql = db();
    if (
      !has(ctx.session, "employee_register.manage") &&
      !has(ctx.session, "employee_register.view")
    ) {
      throw FORBIDDEN;
    }
    const ids = has(ctx.session, "employee_register.manage")
      ? await scopedOrgUnitIds(sql, ctx.session, "employee_register.manage")
      : [];
    const units = await sql<{ id: string; name: string }[]>`
      select id, name from public.org_units
      where deleted_at is null and ${ids === null ? sql`true` : sql`id = any(${ids}::uuid[])`}
      order by name`;
    const periods = await sql<{ start_date: string; status: string }[]>`
      select start_date::text, status::text from public.reporting_periods order by start_date desc`;
    const years = [...new Set(periods.map((p) => financialYearOf(p.start_date)))];
    const open = periods.find((p) => p.status === "open") ?? periods[0];
    return {
      units,
      years,
      defaultYear: open ? financialYearOf(open.start_date) : null,
      canManage: has(ctx.session, "employee_register.manage"),
      canView: has(ctx.session, "employee_register.view"),
    };
  }),

  /** Registers the caller may see, newest year first; superseded ones are left out. */
  list: protectedProcedure.query(async ({ ctx }): Promise<RegisterRow[]> => {
    const sql = db();
    const scope = await scopeOf(sql, ctx.session, ALL);
    const viewScope = has(ctx.session, "employee_register.view")
      ? await scopedOrgUnitIds(sql, ctx.session, "employee_register.view")
      : [];
    const rows = await sql<
      {
        id: string;
        org_unit_id: string;
        org_unit_name: string;
        financial_year: number;
        file_name: string;
        status: RegisterRow["status"];
        totals: RegisterTotals;
        uploaded_by_id: string;
        uploaded_by: string;
        uploaded_at: string;
        verified_by_id: string | null;
        verified_by: string | null;
        decision_note: string | null;
      }[]
    >`
      select r.id, r.org_unit_id, o.name as org_unit_name, r.financial_year, r.file_name, r.status, r.totals,
             r.uploaded_by as uploaded_by_id, u.display_name as uploaded_by, r.uploaded_at::text,
             r.verified_by as verified_by_id, v.display_name as verified_by, r.decision_note
      from public.employee_registers r
      join public.org_units o on o.id = r.org_unit_id
      join public.users u on u.id = r.uploaded_by
      left join public.users v on v.id = r.verified_by
      where r.status <> 'superseded'
        and ${scope === null ? sql`true` : sql`r.org_unit_id = any(${scope}::uuid[])`}
      order by r.financial_year desc, o.name, r.uploaded_at desc
      limit 200`;
    return rows.map((r) => ({
      id: r.id,
      orgUnitId: r.org_unit_id,
      orgUnitName: r.org_unit_name,
      financialYear: r.financial_year,
      fileName: r.file_name,
      status: r.status,
      totals: r.totals,
      uploadedBy: r.uploaded_by,
      uploadedAt: r.uploaded_at,
      verifiedBy: r.verified_by,
      decisionNote: r.decision_note,
      can: {
        confirm:
          r.status === "pending_verification" && has(ctx.session, "employee_register.manage"),
        decide:
          r.status === "verified" &&
          has(ctx.session, "approval.decide") &&
          r.uploaded_by_id !== ctx.session.userId &&
          r.verified_by_id !== ctx.session.userId,
        open: viewScope === null || viewScope.includes(r.org_unit_id),
      },
    }));
  }),

  /** HR confirms the totals the server computed from the file. */
  confirm: protectedProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    if (!has(ctx.session, "employee_register.manage")) throw FORBIDDEN;
    await db().begin(async (tx) => {
      const [r] = await tx<{ org_unit_id: string; status: string }[]>`
          select org_unit_id, status from public.employee_registers where id = ${input.id} for update`;
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "That register isn't available." });
      await assertOrgScope(tx, ctx.session, r.org_unit_id, "employee_register.manage");
      if (r.status !== "pending_verification") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This register is not waiting for confirmation.",
        });
      }
      await tx`
          update public.employee_registers
          set status = 'verified', verified_by = ${ctx.session.userId}, verified_at = now()
          where id = ${input.id}`;
      await writeAudit(tx, {
        eventType: "employee_register.verified",
        entityType: "employee_register",
        entityId: input.id,
        userId: ctx.session.userId,
        newValue: { status: "verified" },
      });
    });
  }),

  /** An approver accepts or returns a confirmed register; never the person who uploaded or confirmed it. */
  decide: protectedProcedure
    .input(
      z.object({
        id: z.uuid(),
        decision: z.enum(["approve", "return"]),
        note: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!has(ctx.session, "approval.decide")) throw FORBIDDEN;
      if (input.decision === "return" && (input.note ?? "").length < 10) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Give a reason of at least 10 characters.",
        });
      }
      await db().begin(async (tx) => {
        const [r] = await tx<
          { org_unit_id: string; status: string; uploaded_by: string; verified_by: string | null }[]
        >`
          select org_unit_id, status, uploaded_by, verified_by
          from public.employee_registers where id = ${input.id} for update`;
        if (!r)
          throw new TRPCError({ code: "NOT_FOUND", message: "That register isn't available." });
        await assertOrgScope(tx, ctx.session, r.org_unit_id, "approval.decide");
        if (r.status !== "verified") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This register is not waiting for a decision.",
          });
        }
        if (r.uploaded_by === ctx.session.userId || r.verified_by === ctx.session.userId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You uploaded or confirmed this register, so someone else must decide on it.",
          });
        }
        const status = input.decision === "approve" ? "approved" : "returned";
        await tx`
          update public.employee_registers
          set status = ${status}, decided_by = ${ctx.session.userId}, decided_at = now(),
              decision_note = ${input.note || null}
          where id = ${input.id}`;
        await writeAudit(tx, {
          eventType: `employee_register.${status}`,
          entityType: "employee_register",
          entityId: input.id,
          userId: ctx.session.userId,
          newValue: { status },
          reason: input.note || undefined,
        });
      });
    }),

  /** Who in the register has an account. Read from the file each time; the opening is audited. */
  people: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }): Promise<RegisterPeople> => {
      if (!has(ctx.session, "employee_register.view")) throw FORBIDDEN;
      const sql = db();
      const [r] = await sql<
        { org_unit_id: string; storage_path: string; file_name: string; financial_year: number }[]
      >`select org_unit_id, storage_path, file_name, financial_year
        from public.employee_registers where id = ${input.id}`;
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "That register isn't available." });
      await assertOrgScope(sql, ctx.session, r.org_unit_id, "employee_register.view");
      const people = await registerPeople(r);
      if (!people)
        throw new TRPCError({ code: "NOT_FOUND", message: "The file is no longer stored." });
      await sql.begin(async (tx) => {
        await writeAudit(tx, {
          eventType: "employee_register.opened",
          entityType: "employee_register",
          entityId: input.id,
          userId: ctx.session.userId,
          newValue: { view: "account_status", people: people.counts.total },
        });
      });
      return people;
    }),
});
