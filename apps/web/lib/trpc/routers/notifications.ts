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
  submission_reminder: "Submission reminder",
  period_closed: "Period closed",
  demo_request: "Demo request",
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

function toItem(r: Row): NotificationItem {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    message: r.message,
    deepLinkPath: r.deep_link_path,
    isRead: r.is_read,
    createdAt: r.created_at.toISOString(),
  };
}

// PRD §32 "approaching deadline": written by the reminder schedule (lib/reminders, Phase 5), once a day by
// Vercel Cron. The bell only reads.

/**
 * Unread notifications that have not popped up yet, claimed for this account in one step: another tab or
 * device asking at the same moment waits on the row and then finds nothing (migration 0053).
 */
async function claimFresh(userId: string): Promise<{ total: number; items: NotificationItem[] }> {
  const sql = db();
  // Most checks find nothing: answer those without taking a lock or writing.
  const [{ any }] = await sql<{ any: boolean }[]>`
    select exists (
      select 1 from public.notifications n join public.users u on u.id = n.user_id
      where n.user_id = ${userId} and not n.is_read and n.created_at > u.notifications_seen_at
    ) as any`;
  if (!any) return { total: 0, items: [] };
  return sql.begin(async (tx) => {
    await tx`select 1 from public.users where id = ${userId} for update`;
    const rows = await tx<Row[]>`
      select n.id, n.type, n.title, n.message, n.deep_link_path, n.is_read, n.created_at
      from public.notifications n join public.users u on u.id = n.user_id
      where n.user_id = ${userId} and not n.is_read and n.created_at > u.notifications_seen_at
      order by n.created_at desc`;
    await tx`
      update public.users
      set notifications_seen_at = greatest(notifications_seen_at, (
        select max(created_at) from public.notifications where user_id = ${userId}))
      where id = ${userId}`;
    return { total: rows.length, items: rows.slice(0, 3).map(toItem) };
  });
}

export const notificationsRouter = router({
  /**
   * The bell's check: what `list` gives for its dropdown, plus what should pop up. `sweep` is still accepted
   * from older pages but does nothing: deadline reminders come from the schedule (Phase 5).
   */
  poll: protectedProcedure
    .input(z.object({ sweep: z.boolean().default(false) }))
    .mutation(async ({ ctx }) => {
      const sql = db();
      const userId = ctx.session.userId;
      const [rows, [unread], fresh] = await Promise.all([
        sql<Row[]>`
          select id, type, title, message, deep_link_path, is_read, created_at
          from public.notifications where user_id = ${userId}
          order by created_at desc limit 5`,
        sql<{ has_unread: boolean }[]>`
          select exists (
            select 1 from public.notifications where user_id = ${userId} and not is_read
          ) as has_unread`,
        claimFresh(userId),
      ]);
      return { hasUnread: unread.has_unread, items: rows.map(toItem), fresh };
    }),

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
