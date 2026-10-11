import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  getDeadlineData,
  executeEscalationSweep,
  sendManualTaskReminder,
} from "@/lib/deadlines/service";
import { adminProcedure, router } from "@/lib/trpc/init";

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
   * Triggers an automated deadline reminder and escalation sweep across open tasks.
   * Admin-only procedure.
   */
  runSweep: adminProcedure
    .input(
      z
        .object({
          periodId: z.string().uuid().optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      return executeEscalationSweep({
        triggeredByUserId: ctx.session.userId,
        periodId: input?.periodId,
      });
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
