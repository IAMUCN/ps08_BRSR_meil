import "server-only";
import { db } from "@/lib/db";
import { protectedProcedure, router } from "@/lib/trpc/init";

/** A period taking uploads now, with its dates (migration 0056: several may be open at once). */
export type OpenPeriod = {
  id: string;
  label: string;
  /** Due date; uploads after it are late. */
  dueOn: string;
  /** Last day any upload is taken. */
  lastUploadDay: string;
  /** Past the due date: uploads now are late. */
  late: boolean;
};

export const dashboardRouter = router({
  /** The periods that take uploads now, newest first (readable by every signed-in user). */
  openPeriods: protectedProcedure.query(async (): Promise<OpenPeriod[]> => {
    const rows = await db()<
      { id: string; label: string; due_on: string; last_upload_day: string; late: boolean }[]
    >`
      select rp.id, rp.label,
             coalesce(rp.submission_closes_on, rp.end_date)::text as due_on,
             coalesce(rp.late_uploads_until, rp.submission_closes_on, rp.end_date)::text as last_upload_day,
             public.reporting_period_late(rp) as late
      from public.reporting_periods rp
      where rp.status = 'open' and not public.reporting_period_locked(rp)
      order by rp.start_date desc`;
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      dueOn: r.due_on,
      lastUploadDay: r.last_upload_day,
      late: r.late,
    }));
  }),
});
