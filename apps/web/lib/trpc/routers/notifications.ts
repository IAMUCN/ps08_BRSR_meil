import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { protectedProcedure, router } from "@/lib/trpc/init";

// In-app notifications (02_TRD.md §28; SCHEMA_DEVIATIONS D4). Rows are written by the server/worker;
// a user only ever reads and marks read their own. Marking read is not an audited business event.

export const NOTIFICATION_TYPES = {
  verification_needed: "Verification needed",
  low_confidence: "Low confidence",
  ocr_failed: "Extraction failed",
  returned: "Returned",
  validation_review: "Validation review",
  approval_needed: "Approval needed",
  approved: "Approved",
  calculation_blocked: "Calculation blocked",
  report_ready: "Report ready",
  report_failed: "Report failed",
  deadline_approaching: "Deadline approaching",
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  deepLinkPath: string;
  isRead: boolean;
  createdAt: string;
};

type Row = {
  id: string;
  type: string;
  title: string;
  message: string;
  deep_link_path: string;
  is_read: boolean;
  created_at: Date;
};

export const notificationsRouter = router({
  /** Newest first; `hasUnread` drives the bell's red dot (UI brief §14). */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(5),
        type: z.string().max(64).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sql = db();
      const userId = ctx.session.userId;
      // PRD §32 "approaching deadline": there is no scheduler, so the reminder is written the first time
      // the user's bell loads within three days of an open period's closing date — once per period.
      await sql`
        insert into public.notifications
          (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
        select ${userId}, 'deadline_approaching', 'Submission deadline approaching',
               p.label || ' closes for submissions on ' || to_char(p.submission_closes_on, 'DD Mon YYYY') || '.',
               'reporting_period', p.id, ${ctx.session.isAdmin ? "/admin/submissions" : "/app/upload"}
        from public.reporting_periods p
        where p.status = 'open'
          and p.submission_closes_on between current_date and current_date + 3
          and not exists (
            select 1 from public.notifications n
            where n.user_id = ${userId} and n.type = 'deadline_approaching'
              and n.related_entity_id = p.id)`;
      const [rows, [unread]] = await Promise.all([
        sql<Row[]>`
          select id, type, title, message, deep_link_path, is_read, created_at
          from public.notifications
          where user_id = ${userId} ${input.type ? sql`and type = ${input.type}` : sql``}
          order by created_at desc
          limit ${input.limit}`,
        sql<{ has_unread: boolean }[]>`
          select exists (
            select 1 from public.notifications where user_id = ${userId} and not is_read
          ) as has_unread`,
      ]);
      return {
        hasUnread: unread.has_unread,
        items: rows.map((r): NotificationItem => ({
          id: r.id,
          type: r.type,
          title: r.title,
          message: r.message,
          deepLinkPath: r.deep_link_path,
          isRead: r.is_read,
          createdAt: r.created_at.toISOString(),
        })),
      };
    }),

  markRead: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db()`
        update public.notifications set is_read = true
        where id = ${input.id} and user_id = ${ctx.session.userId}`;
      return null;
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await db()`
      update public.notifications set is_read = true
      where user_id = ${ctx.session.userId} and not is_read`;
    return null;
  }),
});
