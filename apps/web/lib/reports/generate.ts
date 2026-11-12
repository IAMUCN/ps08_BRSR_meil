import "server-only";
import { writeAudit } from "@/lib/audit";
import {
  financialYearLabel,
  financialYearOf,
  financialYearRange,
  rangeLabel,
} from "@/lib/consolidation/aggregate";
import { db } from "@/lib/db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { templateExtras } from "./extras";
import { renderPdf } from "./pdf";
import { buildSnapshot, unmappedRequiredIndicators } from "./snapshot";
import { renderTemplateHtml } from "./template-html";
import { isTemplate, TEMPLATE_INFO, type ReportTemplate } from "./templates";
import { ghgWorkbook } from "./workbook";

// The report job (App Flow §4.10; .grill/phase-17-reporting-decisions.md). Runs after the request that
// queued it; every outcome is stored on the run, audited and notified, and a specific reason is recorded
// when it fails — never a silent or generic failure.

/** A failure whose message is meant for the Admin as is. */
class ReportFailure extends Error {}

export const STALE_MINUTES = 10;

export function reportsBucket(): string {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET_REPORTS;
  if (!bucket) throw new Error("SUPABASE_STORAGE_BUCKET_REPORTS is not set");
  return bucket;
}

async function notify(userId: string, runId: string, ok: boolean, message: string) {
  await db()`
    insert into public.notifications
      (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
    values (${userId}, ${ok ? "report_ready" : "report_failed"},
            ${ok ? "Report ready" : "Report generation failed"}, ${message},
            'report_run', ${runId}, ${`/admin/reports/${runId}`})`;
}

async function finish(
  runId: string,
  userId: string,
  outcome:
    | {
        ok: true;
        path: string;
        workbookPath: string | null;
        snapshot: unknown;
        template: ReportTemplate;
      }
    | { ok: false; error: string },
) {
  const sql = db();
  await sql.begin(async (tx) => {
    if (outcome.ok) {
      await tx`
        update public.report_runs
        set status = 'completed', storage_path = ${outcome.path}, workbook_path = ${outcome.workbookPath},
            snapshot_data = ${tx.json(outcome.snapshot as never)}, completed_at = now(), error_message = null
        where id = ${runId}`;
    } else {
      await tx`
        update public.report_runs
        set status = 'failed', error_message = ${outcome.error}, completed_at = now()
        where id = ${runId}`;
    }
    await writeAudit(tx, {
      eventType: outcome.ok ? "report.completed" : "report.failed",
      entityType: "report_run",
      entityId: runId,
      userId: null, // the job itself, after the request
      newValue: outcome.ok
        ? {
            storage_path: outcome.path,
            workbook_path: outcome.workbookPath,
            template: outcome.template,
          }
        : { error: outcome.error },
    });
  });
  await notify(
    userId,
    runId,
    outcome.ok,
    outcome.ok ? `Your ${TEMPLATE_INFO[outcome.template].title} is ready.` : outcome.error,
  );
}

export async function runReport(runId: string): Promise<void> {
  const sql = db();
  const [run] = await sql<
    {
      requested_by: string;
      org_unit_id: string;
      reporting_period_id: string | null;
      financial_year: number | null;
      period_from: string | null;
      period_to: string | null;
      template: string;
    }[]
  >`
    update public.report_runs set status = 'generating'
    where id = ${runId} and status = 'pending'
    returning requested_by, org_unit_id, reporting_period_id, financial_year,
              period_from::text, period_to::text, template`;
  if (!run) return; // already taken, finished or expired

  try {
    const missing = await unmappedRequiredIndicators(sql);
    if (missing.length) {
      throw new ReportFailure(
        `Report generation failed: ${missing.length} required BRSR indicator${
          missing.length === 1 ? " has" : "s have"
        } no metric mapping (${missing.join(", ")}). Map them on BRSR Mapping and generate again.`,
      );
    }

    const between = async (from: string, to: string) =>
      (
        await sql<{ id: string }[]>`
          select id from public.reporting_periods where start_date >= ${from} and end_date <= ${to}`
      ).map((p) => p.id);
    const periodsOf = (financialYear: number) => {
      const { from, to } = financialYearRange(financialYear);
      return between(from, to);
    };
    let periodIds: string[];
    let label: string;
    // SEBI's tables show the previous financial year beside the current one.
    let previous: { periodIds: string[]; label: string } | null = null;
    let disclosureYear = run.financial_year;
    if (run.financial_year !== null) {
      periodIds = await periodsOf(run.financial_year);
      label = financialYearLabel(run.financial_year);
      previous = {
        periodIds: await periodsOf(run.financial_year - 1),
        label: financialYearLabel(run.financial_year - 1),
      };
    } else if (run.period_from && run.period_to) {
      // A custom range (D35): like a single period, no previous-year column and no yearly inputs; the
      // written disclosures are those of the financial year the range starts in.
      periodIds = await between(run.period_from, run.period_to);
      label = rangeLabel(run.period_from, run.period_to);
      disclosureYear = financialYearOf(run.period_from);
    } else {
      const [period] = await sql<{ label: string; start_date: string }[]>`
        select label, start_date::text from public.reporting_periods
        where id = ${run.reporting_period_id}`;
      if (period) disclosureYear = financialYearOf(period.start_date);
      periodIds = [run.reporting_period_id!];
      label = period?.label ?? "";
    }
    if (periodIds.length === 0) {
      throw new ReportFailure(
        `Report generation failed: ${label} has no reporting periods to report on.`,
      );
    }

    const template: ReportTemplate = isTemplate(run.template) ? run.template : "brsr";
    const snapshot = await buildSnapshot(sql, {
      orgUnitId: run.org_unit_id,
      periodIds,
      label,
      financialYear: run.financial_year,
      disclosureYear,
      previous,
    });
    snapshot.template = template;
    snapshot.extras = await templateExtras(sql, template, {
      orgUnitId: run.org_unit_id,
      periodIds,
      previousPeriodIds: previous?.periodIds ?? [],
    });
    let pdf: Uint8Array;
    try {
      pdf = await renderPdf(renderTemplateHtml(snapshot, template));
    } catch (error) {
      console.error("report rendering failed", runId, error);
      throw new ReportFailure(
        "Report generation failed: the PDF could not be rendered. The report data is fine — try again, and check the server's browser setup if it keeps failing.",
      );
    }
    const path = `${runId}.pdf`;
    const { error } = await createSupabaseAdminClient()
      .storage.from(reportsBucket())
      .upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (error) {
      console.error("report upload failed", runId, error);
      throw new ReportFailure("Report generation failed: the PDF could not be stored. Try again.");
    }
    let workbookPath: string | null = null;
    if (TEMPLATE_INFO[template].workbook) {
      workbookPath = `${runId}.xlsx`;
      const { error: workbookError } = await createSupabaseAdminClient()
        .storage.from(reportsBucket())
        .upload(workbookPath, await ghgWorkbook(snapshot), {
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: true,
        });
      if (workbookError) {
        console.error("report workbook upload failed", runId, workbookError);
        throw new ReportFailure(
          "Report generation failed: the Excel workbook could not be stored. Try again.",
        );
      }
    }
    await finish(runId, run.requested_by, { ok: true, path, workbookPath, snapshot, template });
  } catch (error) {
    if (!(error instanceof ReportFailure)) console.error("report generation failed", runId, error);
    await finish(runId, run.requested_by, {
      ok: false,
      error:
        error instanceof ReportFailure
          ? error.message
          : "Report generation failed: an unexpected error occurred while building the report. Try again.",
    });
  }
}

/** Runs that never finished (the process stopped mid-job) are failed with a reason rather than left spinning. */
export async function expireStaleRuns(): Promise<void> {
  const stale = await db()<{ id: string; requested_by: string }[]>`
    select id, requested_by from public.report_runs
    where status in ('pending', 'generating')
      and requested_at < now() - make_interval(mins => ${STALE_MINUTES})`;
  for (const run of stale) {
    await finish(run.id, run.requested_by, {
      ok: false,
      error: `Report generation failed: it did not finish within ${STALE_MINUTES} minutes. Generate it again.`,
    });
  }
}
