import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { buildBoard, type BoardRow, type BoardUnit } from "@/lib/deadlines/board";
import { getDeadlineData, sendManualTaskReminder } from "@/lib/deadlines/service";
import { writeAudit } from "@/lib/audit";
import { readSchedule, type Schedule } from "@/lib/reminders/plan";
import { runReminders } from "@/lib/reminders/run";
import { adminAreaProcedure, adminProcedure, router } from "@/lib/trpc/init";

/** The submission status board for one period (deadline escalation, phase 2). */
export type StatusBoard = {
  periods: { id: string; label: string; open: boolean; startDate: string }[];
  periodId: string | null;
  dueDate: string | null;
  rows: BoardRow[];
};

/** One reminder that went out (or failed), for the Deadlines page (Phase 5). */
export type ReminderSend = {
  id: string;
  periodLabel: string;
  kind: "owner" | "digest" | "escalation";
  recipient: string;
  daysBefore: number;
  channel: "in_app" | "email";
  status: "sending" | "sent" | "failed";
  error: string | null;
  attempts: number;
  missingCount: number;
  at: string;
};

const filterSchema = z
  .object({
    periodId: z.string().uuid().optional(),
    orgUnitId: z.string().uuid().optional(),
    status: z
      .enum(["completed", "escalated", "overdue", "due_today", "due_soon", "upcoming", "all"])
      .optional(),
    escalationLevel: z.string().optional(),
    search: z.string().optional(),
  })
  .optional();

export const deadlinesRouter = router({
  /**
   * Retrieves evaluated reporting deadlines, tasks, and summary KPIs. Admin only: the tasks name the owners
   * and escalation recipients of every org unit, with their email addresses.
   */
  list: adminProcedure.input(filterSchema).query(async ({ input }) => {
    const sql = db();
    return getDeadlineData(sql, input);
  }),

  /**
   * Retrieves summary KPIs for reporting deadlines.
   */
  kpis: adminProcedure
    .input(
      z
        .object({
          periodId: z.string().uuid().optional(),
          orgUnitId: z.string().uuid().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const sql = db();
      const res = await getDeadlineData(sql, input);
      return res.kpis;
    }),

  /**
   * Who is behind, unit by unit, for one period (the open one with the latest due date unless asked): every unit
   * the caller administers and beneath it, with what is approved, on file, not started and overdue, and the owners
   * who are behind. A Super Admin sees the whole tree, an Administrator their units and below.
   */
  board: adminAreaProcedure
    .input(z.object({ periodId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }): Promise<StatusBoard> => {
      const sql = db();
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      const periods = await sql<
        { id: string; label: string; open: boolean; due: string; startDate: string }[]
      >`
        select id, label, (status = 'open') as open, start_date::text as "startDate",
               to_char(coalesce(submission_closes_on, end_date), 'YYYY-MM-DD') as due
        from public.reporting_periods order by start_date desc`;
      const chosen =
        periods.find((p) => p.id === input?.periodId) ??
        // The current period: the newest one that has begun, open ones first.
        periods.find((p) => p.open && p.startDate <= today) ??
        periods.find((p) => p.startDate <= today) ??
        periods[0];
      const list = periods.map((p) => ({
        id: p.id,
        label: p.label,
        open: p.open,
        startDate: p.startDate,
      }));
      if (!chosen) return { periods: list, periodId: null, dueDate: null, rows: [] };

      const scope = ctx.session.isAdmin
        ? null
        : new Set(
            (
              await sql<{ id: string }[]>`
                select distinct descendant_id::text as id from public.org_unit_tree
                where ancestor_id = any(${ctx.session.adminOrgUnitIds}::uuid[])`
            ).map((r) => r.id),
          );
      const unitRows = await sql<
        { id: string; name: string; parent_id: string | null; label: string; sort_order: number }[]
      >`
        select o.id::text, o.name, o.parent_id::text, l.label, l.sort_order
        from public.org_units o
        join public.org_levels l on l.code = o.unit_type
        where o.deleted_at is null`;
      const units: BoardUnit[] = unitRows
        .filter((u) => !scope || scope.has(u.id))
        .map((u) => ({
          id: u.id,
          name: u.name,
          parentId: u.parent_id,
          levelLabel: u.label,
          levelOrder: u.sort_order,
        }));
      const { tasks } = await getDeadlineData(sql, { periodId: chosen.id });
      return {
        periods: list,
        periodId: chosen.id,
        dueDate: chosen.due,
        rows: buildBoard(
          units,
          tasks.filter((t) => !scope || scope.has(t.orgUnitId)),
        ),
      };
    }),

  /** The reminder schedule (Phase 5): days before the due date, and which of them by email too. */
  schedule: adminAreaProcedure.query(async (): Promise<Schedule> => {
    const [row] = await db()<{ value: unknown }[]>`
      select value from public.org_settings where key = 'reminder_schedule'`;
    return readSchedule(row?.value);
  }),

  /** A Super Admin changes the schedule. Audited. */
  setSchedule: adminProcedure
    .input(
      z.object({
        days: z
          .array(z.object({ before: z.number().int().min(0).max(60), email: z.boolean() }))
          .min(1, "Keep at least one reminder day.")
          .max(30),
        /** Days after the due date on which each step of the climb is told; left out, the saved ones stay. */
        escalation: z
          .object({
            unitAdminAfter: z.number().int().min(1).max(60),
            parentAdminAfter: z.number().int().min(1).max(60),
            superAdminAfter: z.number().int().min(1).max(60),
          })
          .refine(
            (e) =>
              e.unitAdminAfter <= e.parentAdminAfter && e.parentAdminAfter <= e.superAdminAfter,
            {
              message:
                "The steps must climb: unit Administrator first, then the next one up, then the Super Admins.",
            },
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return db().begin(async (tx) => {
        const [old] = await tx<{ value: unknown }[]>`
          select value from public.org_settings where key = 'reminder_schedule' for update`;
        const schedule = readSchedule({
          days: input.days,
          timezone: "Asia/Kolkata",
          escalation: input.escalation ?? readSchedule(old?.value).escalation,
        });
        const [saved] = await tx<{ id: string }[]>`
          insert into public.org_settings (key, value, updated_by)
          values ('reminder_schedule', ${tx.json(schedule)}, ${ctx.session.userId})
          on conflict (key) do update
            set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()
          returning id`;
        await writeAudit(tx, {
          eventType: "settings.reminder_schedule_changed",
          entityType: "org_setting",
          entityId: saved.id,
          userId: ctx.session.userId,
          oldValue: old?.value ?? null,
          newValue: schedule,
        });
        return schedule;
      });
    }),

  /** Send today's reminders now (the daily Vercel Cron run does the same; nothing goes out twice). */
  runReminders: adminProcedure.mutation(({ ctx }) => runReminders({ userId: ctx.session.userId })),

  /**
   * The reminders that went out, newest first: everything for a Super Admin; for an Administrator, their own and the
   * owners' reminders about their units (never another Administrator's summary, which counts other units).
   */
  reminderLog: adminAreaProcedure.query(async ({ ctx }): Promise<ReminderSend[]> => {
    const sql = db();
    let scope = sql`true`;
    if (!ctx.session.isAdmin) {
      const units = await sql<{ id: string }[]>`
        select distinct descendant_id as id from public.org_unit_tree
        where ancestor_id = any(${ctx.session.adminOrgUnitIds}::uuid[])`;
      scope = sql`(s.recipient_id = ${ctx.session.userId}
                   or (s.kind = 'owner' and s.org_unit_ids && ${units.map((u) => u.id)}::uuid[]))`;
    }
    const rows = await sql<
      {
        id: string;
        period_label: string;
        kind: ReminderSend["kind"];
        recipient: string;
        days_before: number;
        channel: ReminderSend["channel"];
        status: ReminderSend["status"];
        error: string | null;
        attempts: number;
        missing_count: number;
        at: Date;
      }[]
    >`
      select s.id, p.label as period_label, s.kind, u.display_name as recipient, s.days_before,
             s.channel, s.status, s.error, s.attempts, s.missing_count,
             coalesce(s.sent_at, s.created_at) as at
      from public.reminder_sends s
      join public.reporting_periods p on p.id = s.reporting_period_id
      join public.users u on u.id = s.recipient_id
      where ${scope}
      order by coalesce(s.sent_at, s.created_at) desc
      limit 200`;
    return rows.map((r) => ({
      id: r.id,
      periodLabel: r.period_label,
      kind: r.kind,
      recipient: r.recipient,
      daysBefore: r.days_before,
      channel: r.channel,
      status: r.status,
      error: r.error,
      attempts: r.attempts,
      missingCount: r.missing_count,
      at: r.at.toISOString(),
    }));
  }),

  /**
   * Manually dispatches an immediate reminder for a specific deadline task.
   */
  remindTask: adminProcedure
    .input(
      z.object({
        expectationId: z.string().uuid(),
        periodId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return sendManualTaskReminder({
        expectationId: input.expectationId,
        periodId: input.periodId,
        actorUserId: ctx.session.userId,
      });
    }),
});
