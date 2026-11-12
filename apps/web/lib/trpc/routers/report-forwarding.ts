import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { inOrgScope } from "@/lib/auth/scope";
import type { ActiveSession } from "@/lib/auth/session";
import { db, pgErrorCode, type Tx } from "@/lib/db";
import { loadOrgNodes } from "@/lib/org/nodes";
import { recipientUnits } from "@/lib/reports/forwarding";
import { permissionProcedure, protectedProcedure, router } from "@/lib/trpc/init";

// Forwarding a report for verification up the organisation (feature_enhancement.md Phase 4, requirement 9;
// migration 0058; .grill/feature-enhancement-roadmap-decisions.md, "Phase 4 decisions"). A report goes to
// the Administrators of the next unit up (lib/reports/forwarding.ts), or to the Super Admins at the top; they
// verify it (and may forward it on) or return it with a reason. Every step is audited and notified.

const generate = permissionProcedure("report.generate");
export const RETURN_REASON_MIN = 10;

export type ForwardStep = {
  id: string;
  reportRunId: string;
  fromUnit: string;
  /** Null: the Super Admins. */
  toUnit: string | null;
  forwardedBy: string;
  forwardedAt: string;
  note: string | null;
  status: "pending" | "verified" | "returned";
  decidedBy: string | null;
  decidedAt: string | null;
  reason: string | null;
  /** The caller may verify or return this step now. */
  canDecide: boolean;
  /** The caller verified this step and may send the report on to the next level. */
  canForwardOn: boolean;
};

export type InboxItem = ForwardStep & {
  reportLabel: string;
};

type StepRow = {
  id: string;
  report_run_id: string;
  from_org_unit_id: string;
  to_org_unit_id: string | null;
  from_unit: string;
  to_unit: string | null;
  forwarded_by_id: string;
  forwarded_by: string;
  created_at: Date;
  note: string | null;
  status: ForwardStep["status"];
  decided_by_id: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  decision_reason: string | null;
  requested_by_id: string;
  report_label: string;
  onward: boolean;
};

const stepSelect = (sql: Tx | ReturnType<typeof db>) => sql`
  select f.id, f.report_run_id, f.from_org_unit_id, f.to_org_unit_id,
         fo.name as from_unit, tou.name as to_unit,
         f.forwarded_by as forwarded_by_id, fu.display_name as forwarded_by, f.created_at, f.note,
         f.status, f.decided_by as decided_by_id, du.display_name as decided_by, f.decided_at,
         f.decision_reason, rr.requested_by as requested_by_id,
         ro.name || ' · ' || coalesce(p.label, '') as report_label,
         exists (select 1 from public.report_forwards n where n.previous_forward_id = f.id) as onward
  from public.report_forwards f
  join public.report_runs rr on rr.id = f.report_run_id
  join public.org_units ro on ro.id = rr.org_unit_id
  left join public.reporting_periods p on p.id = rr.reporting_period_id
  join public.org_units fo on fo.id = f.from_org_unit_id
  left join public.org_units tou on tou.id = f.to_org_unit_id
  join public.users fu on fu.id = f.forwarded_by
  left join public.users du on du.id = f.decided_by`;

/** The units the caller administers, with everything beneath them (Super Admin: null = all). */
async function administeredUnits(
  sql: Tx | ReturnType<typeof db>,
  session: ActiveSession,
): Promise<Set<string> | null> {
  if (session.isAdmin) return null;
  if (!session.isOrgAdmin) return new Set();
  const rows = await sql<{ id: string }[]>`
    select distinct t.descendant_id as id from public.org_unit_tree t
    where t.ancestor_id = any(${session.adminOrgUnitIds}::uuid[])`;
  return new Set(rows.map((r) => r.id));
}

/** May the caller decide on a step addressed to `toUnit` (null = the Super Admins)? */
function receives(administered: Set<string> | null, toUnit: string | null): boolean {
  if (administered === null) return true; // a Super Admin may act at any level
  return toUnit !== null && administered.has(toUnit);
}

/** Nobody verifies a report they generated or forwarded at that step. */
function ownStep(row: StepRow, userId: string): boolean {
  return row.requested_by_id === userId || row.forwarded_by_id === userId;
}

function toStep(
  row: StepRow,
  session: ActiveSession,
  administered: Set<string> | null,
): ForwardStep {
  const mine = receives(administered, row.to_org_unit_id);
  return {
    id: row.id,
    reportRunId: row.report_run_id,
    fromUnit: row.from_unit,
    toUnit: row.to_unit,
    forwardedBy: row.forwarded_by,
    forwardedAt: row.created_at.toISOString(),
    note: row.note,
    status: row.status,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at?.toISOString() ?? null,
    reason: row.decision_reason,
    canDecide: row.status === "pending" && mine && !ownStep(row, session.userId),
    // Onward from a verified step to the level above, once, by whoever may act at that level.
    canForwardOn: row.status === "verified" && mine && row.to_org_unit_id !== null && !row.onward,
  };
}

/** Writes the steps to the receivers of a report leaving `fromUnit`, with audit and notifications. */
async function forwardFrom(
  tx: Tx,
  session: ActiveSession,
  report: { id: string; label: string },
  fromUnit: string,
  note: string | null,
  previousId: string | null,
): Promise<number> {
  const nodes = await loadOrgNodes(tx);
  const admins = await tx<{ org_unit_id: string }[]>`
    select distinct uoa.org_unit_id
    from public.user_org_assignments uoa
    join public.roles r on r.id = uoa.role_id and r.code = 'org_admin'
    join public.users u on u.id = uoa.user_id and u.is_active and u.deleted_at is null
    where uoa.revoked_at is null`;
  const receivers = recipientUnits(nodes, fromUnit, new Set(admins.map((a) => a.org_unit_id)));
  if (receivers.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Nobody above this unit can verify it." });
  }
  for (const toUnit of receivers) {
    const [step] = await tx<{ id: string }[]>`
      insert into public.report_forwards
        (report_run_id, from_org_unit_id, to_org_unit_id, forwarded_by, note, previous_forward_id)
      values (${report.id}, ${fromUnit}, ${toUnit}, ${session.userId}, ${note}, ${previousId})
      returning id`;
    await writeAudit(tx, {
      eventType: "report.forwarded",
      entityType: "report_run",
      entityId: report.id,
      userId: session.userId,
      reason: note,
      newValue: { forward_id: step.id, from_org_unit_id: fromUnit, to_org_unit_id: toUnit },
    });
    // The receivers: the Administrators assigned at that unit, or the Super Admins.
    await tx`
      insert into public.notifications
        (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
      select distinct uoa.user_id, 'report_forwarded', 'A report to verify',
             ${`${report.label}, forwarded by ${session.displayName}.`},
             'report_run', ${report.id}::uuid, ${`/admin/reports/${report.id}`}
      from public.user_org_assignments uoa
      join public.roles r on r.id = uoa.role_id
      join public.users u on u.id = uoa.user_id and u.is_active and u.deleted_at is null
      where uoa.revoked_at is null
        and ${
          toUnit === null
            ? tx`r.code = 'admin'`
            : tx`r.code = 'org_admin' and uoa.org_unit_id = ${toUnit}`
        }
        and uoa.user_id <> ${session.userId}`;
  }
  return receivers.length;
}

async function reportLabel(tx: Tx, reportId: string) {
  const [report] = await tx<
    { id: string; org_unit_id: string; status: string; label: string; requested_by: string }[]
  >`
    select rr.id, rr.org_unit_id, rr.status::text as status, rr.requested_by,
           o.name || ' · ' || coalesce(p.label, 'custom period') as label
    from public.report_runs rr
    join public.org_units o on o.id = rr.org_unit_id
    left join public.reporting_periods p on p.id = rr.reporting_period_id
    where rr.id = ${reportId}
    for update of rr`;
  return report;
}

export const reportForwardingRouter = router({
  /**
   * Forward a ready report to the next level: from the report's own unit (anyone who may generate reports
   * there), or onward from a step the caller verified.
   */
  forward: generate
    .input(
      z.object({
        reportRunId: z.uuid(),
        /** Onward from this verified step; omitted = the first forward from the report's own unit. */
        fromForwardId: z.uuid().optional(),
        note: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await db().begin(async (tx) => {
          const report = await reportLabel(tx, input.reportRunId);
          // Out of scope and missing read the same (§4.4).
          if (
            !report ||
            !(await inOrgScope(tx, ctx.session, report.org_unit_id, "report.generate"))
          ) {
            throw new TRPCError({ code: "NOT_FOUND", message: "That report isn't available." });
          }
          if (report.status !== "completed") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Only a ready report can be forwarded.",
            });
          }
          let fromUnit = report.org_unit_id;
          let previousId: string | null = null;
          if (input.fromForwardId) {
            const administered = await administeredUnits(tx, ctx.session);
            const [step] = await tx<StepRow[]>`
              ${stepSelect(tx)} where f.id = ${input.fromForwardId} for update of f`;
            if (!step || step.report_run_id !== report.id) {
              throw new TRPCError({ code: "NOT_FOUND", message: "That step isn't available." });
            }
            const view = toStep(step, ctx.session, administered);
            if (!view.canForwardOn) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: "Only who verified this step can send the report on, once.",
              });
            }
            fromUnit = step.to_org_unit_id!;
            previousId = step.id;
          } else {
            const [open] = await tx`
              select 1 from public.report_forwards
              where report_run_id = ${report.id} and status = 'pending' and previous_forward_id is null`;
            if (open) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "This report is already waiting for verification.",
              });
            }
          }
          const sent = await forwardFrom(
            tx,
            ctx.session,
            report,
            fromUnit,
            input.note || null,
            previousId,
          );
          return { sent };
        });
      } catch (error) {
        if (pgErrorCode(error) === "23505") {
          throw new TRPCError({ code: "CONFLICT", message: "It is already waiting there." });
        }
        throw error;
      }
    }),

  /** Verify or return one step. Returning needs a reason, which the sender sees. */
  decide: protectedProcedure
    .input(
      z.object({
        forwardId: z.uuid(),
        decision: z.enum(["verify", "return"]),
        reason: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.decision === "return" && (input.reason?.length ?? 0) < RETURN_REASON_MIN) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Give a reason of at least ${RETURN_REASON_MIN} characters.`,
        });
      }
      await db().begin(async (tx) => {
        const administered = await administeredUnits(tx, ctx.session);
        const [step] = await tx<StepRow[]>`
          ${stepSelect(tx)} where f.id = ${input.forwardId} for update of f`;
        if (!step || !receives(administered, step.to_org_unit_id)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That report isn't waiting for you." });
        }
        if (step.status !== "pending") {
          throw new TRPCError({ code: "CONFLICT", message: "This step was already decided." });
        }
        if (ownStep(step, ctx.session.userId)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You generated or forwarded this report, so someone else must verify it.",
          });
        }
        const status = input.decision === "verify" ? "verified" : "returned";
        await tx`
          update public.report_forwards
          set status = ${status}, decided_by = ${ctx.session.userId}, decided_at = now(),
              decision_reason = ${input.reason || null}
          where id = ${step.id}`;
        await writeAudit(tx, {
          eventType: status === "verified" ? "report.verified" : "report.returned",
          entityType: "report_run",
          entityId: step.report_run_id,
          userId: ctx.session.userId,
          reason: input.reason || null,
          oldValue: { forward_id: step.id, status: "pending" },
          newValue: { forward_id: step.id, status },
        });
        await tx`
          insert into public.notifications
            (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
          values (${step.forwarded_by_id}, ${status === "verified" ? "report_verified" : "report_returned"},
                  ${status === "verified" ? "Report verified" : "Report returned for correction"},
                  ${`${step.report_label}: ${status === "verified" ? `verified by ${ctx.session.displayName}` : input.reason}`},
                  'report_run', ${step.report_run_id}, ${`/admin/reports/${step.report_run_id}`})`;
      });
      return null;
    }),

  /** Reports waiting for the caller's verification, oldest first. */
  inbox: protectedProcedure.query(async ({ ctx }): Promise<InboxItem[]> => {
    const sql = db();
    const administered = await administeredUnits(sql, ctx.session);
    if (administered !== null && administered.size === 0) return [];
    const rows = await sql<StepRow[]>`
      ${stepSelect(sql)}
      where f.status = 'pending'
        ${
          administered === null
            ? sql``
            : sql`and f.to_org_unit_id = any(${[...administered]}::uuid[])`
        }
      order by f.created_at`;
    return rows.map((row) => ({
      ...toStep(row, ctx.session, administered),
      reportLabel: row.report_label,
    }));
  }),

  /** A report's forwarding trail: for whoever may see the report, or was asked to verify it. */
  trail: protectedProcedure
    .input(z.object({ reportRunId: z.uuid() }))
    .query(async ({ ctx, input }): Promise<ForwardStep[]> => {
      const sql = db();
      const administered = await administeredUnits(sql, ctx.session);
      const rows = await sql<StepRow[]>`
        ${stepSelect(sql)} where f.report_run_id = ${input.reportRunId} order by f.created_at`;
      const [report] = await sql<{ org_unit_id: string }[]>`
        select org_unit_id from public.report_runs where id = ${input.reportRunId}`;
      const visible =
        report &&
        ((ctx.session.permissions.includes("report.generate") &&
          (await inOrgScope(sql, ctx.session, report.org_unit_id, "report.generate"))) ||
          rows.some((r) => receives(administered, r.to_org_unit_id)));
      if (!visible)
        throw new TRPCError({ code: "NOT_FOUND", message: "That report isn't available." });
      return rows.map((row) => toStep(row, ctx.session, administered));
    }),
});
