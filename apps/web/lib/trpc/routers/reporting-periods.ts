import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { db, pgErrorCode } from "@/lib/db";
import {
  checkOpenDeadline,
  checkPeriodDates,
  checkTransition,
  defaultWindow,
  type PeriodStatus,
} from "@/lib/periods/rules";
import { permissionProcedure, router } from "@/lib/trpc/init";

const periodManage = permissionProcedure("period.manage");

function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

const isoDate = z.iso.date("Use a valid date.");
const optionalIsoDate = z
  .union([isoDate, z.literal("")])
  .nullish()
  .transform((value) => (value ? value : null));

export type PeriodRow = {
  /** Past its submissions close date (or end date), India time: an upload now is late. */
  deadlinePassed: boolean;
  /** Past its last upload day (late uploads until, else the due date): the job closes it. */
  locked: boolean;
  /** Today in India, for the date a reopened period must not be earlier than. */
  today: string;
  id: string;
  label: string;
  periodType: "monthly" | "annual";
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  submissionOpensOn: string | null;
  submissionClosesOn: string | null;
  /** Late uploads are accepted until this day (migration 0056); null = none after the due date. */
  lateUploadsUntil: string | null;
  openedAt: string | null;
  closedAt: string | null;
  unresolvedValidation: number;
  reportRuns: number;
};

export const reportingPeriodsRouter = router({
  list: periodManage.query(async (): Promise<PeriodRow[]> => {
    const rows = await db()<
      {
        id: string;
        label: string;
        period_type: "monthly" | "annual";
        start_date: string;
        end_date: string;
        status: PeriodStatus;
        submission_opens_on: string | null;
        submission_closes_on: string | null;
        late_uploads_until: string | null;
        opened_at: Date | null;
        closed_at: Date | null;
        unresolved_validation: number;
        report_runs: number;
        deadline_passed: boolean;
        locked: boolean;
        today: string;
      }[]
    >`
      select rp.id, rp.label, rp.period_type, rp.start_date::text, rp.end_date::text, rp.status,
             rp.submission_opens_on::text, rp.submission_closes_on::text, rp.late_uploads_until::text,
             rp.opened_at, rp.closed_at,
             (select count(*)::int from public.esg_records er
              where er.reporting_period_id = rp.id and er.validation_status in ('failed', 'flagged'))
               as unresolved_validation,
             (select count(*)::int from public.report_runs rr where rr.reporting_period_id = rp.id)
               as report_runs,
             public.reporting_period_past_deadline(rp) as deadline_passed,
             public.reporting_period_locked(rp) as locked,
             (now() at time zone 'Asia/Kolkata')::date::text as today
      from public.reporting_periods rp
      order by rp.start_date desc`;
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      periodType: r.period_type,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
      submissionOpensOn: r.submission_opens_on,
      submissionClosesOn: r.submission_closes_on,
      lateUploadsUntil: r.late_uploads_until,
      openedAt: r.opened_at?.toISOString() ?? null,
      closedAt: r.closed_at?.toISOString() ?? null,
      unresolvedValidation: r.unresolved_validation,
      reportRuns: r.report_runs,
      deadlinePassed: r.deadline_passed,
      locked: r.locked,
      today: r.today,
    }));
  }),

  create: periodManage
    .input(
      z.object({
        label: z.string().trim().min(1, "Label is required.").max(100),
        periodType: z.enum(["monthly", "annual"]),
        startDate: isoDate,
        endDate: isoDate,
        submissionOpensOn: optionalIsoDate,
        submissionClosesOn: optionalIsoDate,
        lateUploadsUntil: optionalIsoDate,
      }),
    )
    .mutation(async ({ ctx, input: given }) => {
      // Dates left empty take the defaults (due 15 days after the end, late uploads until 45 days after).
      const defaults = defaultWindow(given.endDate);
      const input = {
        ...given,
        submissionClosesOn: given.submissionClosesOn ?? defaults.closesOn,
        lateUploadsUntil:
          given.lateUploadsUntil ??
          (given.submissionClosesOn && given.submissionClosesOn > defaults.lateUntil
            ? given.submissionClosesOn
            : defaults.lateUntil),
      };
      const check = checkPeriodDates(input);
      if (!check.ok) badRequest(check.reason);
      try {
        return await db().begin(async (tx) => {
          const [created] = await tx<{ id: string }[]>`
            insert into public.reporting_periods
              (label, period_type, start_date, end_date, submission_opens_on, submission_closes_on,
               late_uploads_until)
            values (${input.label}, ${input.periodType}, ${input.startDate}, ${input.endDate},
                    ${input.submissionOpensOn}, ${input.submissionClosesOn}, ${input.lateUploadsUntil})
            returning id`;
          await writeAudit(tx, {
            eventType: "reporting_period.created",
            entityType: "reporting_period",
            entityId: created.id,
            userId: ctx.session.userId,
            newValue: input,
          });
          return { id: created.id };
        });
      } catch (error) {
        if (pgErrorCode(error) === "23505") badRequest("A period with that label already exists.");
        throw error;
      }
    }),

  updateWindow: periodManage
    .input(
      z.object({
        id: z.uuid(),
        submissionOpensOn: optionalIsoDate,
        submissionClosesOn: optionalIsoDate,
        lateUploadsUntil: optionalIsoDate,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        const [period] = await tx<
          {
            start_date: string;
            end_date: string;
            submission_opens_on: string | null;
            submission_closes_on: string | null;
            late_uploads_until: string | null;
          }[]
        >`
          select start_date::text, end_date::text, submission_opens_on::text, submission_closes_on::text,
                 late_uploads_until::text
          from public.reporting_periods where id = ${input.id} for update`;
        if (!period) badRequest("Reporting period not found.");
        const check = checkPeriodDates({
          startDate: period.start_date,
          endDate: period.end_date,
          submissionOpensOn: input.submissionOpensOn,
          submissionClosesOn: input.submissionClosesOn,
          lateUploadsUntil: input.lateUploadsUntil,
        });
        if (!check.ok) badRequest(check.reason);
        await tx`
          update public.reporting_periods
          set submission_opens_on = ${input.submissionOpensOn}, submission_closes_on = ${input.submissionClosesOn},
              late_uploads_until = ${input.lateUploadsUntil}
          where id = ${input.id}`;
        await writeAudit(tx, {
          eventType: "reporting_period.window_changed",
          entityType: "reporting_period",
          entityId: input.id,
          userId: ctx.session.userId,
          oldValue: {
            submission_opens_on: period.submission_opens_on,
            submission_closes_on: period.submission_closes_on,
            late_uploads_until: period.late_uploads_until,
          },
          newValue: {
            submission_opens_on: input.submissionOpensOn,
            submission_closes_on: input.submissionClosesOn,
            late_uploads_until: input.lateUploadsUntil,
          },
        });
      });
      return null;
    }),

  transition: periodManage
    .input(
      z.object({
        id: z.uuid(),
        to: z.enum(["open", "closed"]),
        reason: z.string().trim().max(1000).nullish(),
        /** App Flow §2.2: closing with unresolved validation failures needs explicit confirmation. */
        acknowledgeUnresolved: z.boolean().default(false),
        /** Replaces the submissions close date when opening a period whose deadline has passed. */
        newClosesOn: optionalIsoDate,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await db().begin(async (tx) => {
          await tx`select pg_advisory_xact_lock(hashtext('reporting_period_status'))`;
          const [period] = await tx<
            {
              status: PeriodStatus;
              label: string;
              end_date: string;
              submission_opens_on: string | null;
              submission_closes_on: string | null;
              late_uploads_until: string | null;
              today: string;
            }[]
          >`
            select status, label, end_date::text, submission_opens_on::text, submission_closes_on::text,
                   late_uploads_until::text,
                   (now() at time zone 'Asia/Kolkata')::date::text as today
            from public.reporting_periods where id = ${input.id} for update`;
          if (!period) badRequest("Reporting period not found.");
          const check = checkTransition({
            from: period.status,
            to: input.to,
            reason: input.reason,
          });
          if (!check.ok) badRequest(check.reason);

          if (input.to === "closed") {
            const [{ unresolved }] = await tx<{ unresolved: number }[]>`
              select count(*)::int as unresolved from public.esg_records
              where reporting_period_id = ${input.id} and validation_status in ('failed', 'flagged')`;
            if (unresolved > 0 && !input.acknowledgeUnresolved) {
              throw new TRPCError({
                code: "CONFLICT",
                message: `${unresolved} record(s) in this period still have unresolved validation issues. Confirm to close anyway.`,
              });
            }
          }

          const reopening = period.status === "closed" && input.to === "open";
          if (input.to === "open") {
            const deadline = checkOpenDeadline({
              closesOn: period.submission_closes_on,
              lateUntil: period.late_uploads_until,
              endDate: period.end_date,
              opensOn: period.submission_opens_on,
              today: period.today,
              newClosesOn: input.newClosesOn,
            });
            if (!deadline.ok) badRequest(deadline.reason);
            await tx`
              update public.reporting_periods
              set status = 'open', opened_at = now(),
                  submission_closes_on = coalesce(${input.newClosesOn}, submission_closes_on),
                  -- A new due date later than the late-upload window ends that window: no late uploads after it.
                  late_uploads_until = case
                    when ${input.newClosesOn}::date is not null
                         and late_uploads_until < ${input.newClosesOn}::date then null
                    else late_uploads_until end
              where id = ${input.id}`;
          } else {
            await tx`update public.reporting_periods set status = 'closed', closed_at = now() where id = ${input.id}`;
          }
          await writeAudit(tx, {
            eventType: reopening
              ? "reporting_period.reopened"
              : input.to === "open"
                ? "reporting_period.opened"
                : "reporting_period.closed",
            entityType: "reporting_period",
            entityId: input.id,
            userId: ctx.session.userId,
            oldValue: {
              status: period.status,
              submission_closes_on: input.newClosesOn ? period.submission_closes_on : undefined,
            },
            newValue: {
              status: input.to,
              submission_closes_on: input.newClosesOn ?? undefined,
              acknowledged_unresolved: input.acknowledgeUnresolved || undefined,
            },
            reason: input.reason ?? null,
          });
        });
        return null;
      } catch (error) {
        if (pgErrorCode(error) === "23505") {
          badRequest("Another reporting period is already open. Close it first.");
        }
        throw error;
      }
    }),
});
