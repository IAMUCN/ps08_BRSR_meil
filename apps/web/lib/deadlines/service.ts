import "server-only";
import type postgres from "postgres";
import { appUrl } from "@/lib/app-url";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/brevo";
import { readSchedule } from "@/lib/reminders/plan";
import { escapeHtml } from "@/lib/reports/html";

export type Sql = postgres.Sql;
import { calculateDeadlineKPIs, evaluateDeadlineStatus } from "./engine";
import type {
  DeadlineFilter,
  DeadlineKPIs,
  DeadlineTask,
  EscalationLevel,
  TaskOwner,
} from "./types";

/**
 * Builds standard HTML email template for deadline reminders and escalations.
 */
function buildDeadlineEmailHtml(params: {
  recipientName: string;
  isEscalation: boolean;
  escalationLevel: EscalationLevel;
  taskTitle: string;
  categoryName: string;
  orgUnitName: string;
  periodName: string;
  dueDateFormatted: string;
  urgencyText: string;
  deepLinkUrl: string;
}): string {
  const accentColor = params.isEscalation
    ? params.escalationLevel === 2
      ? "#e11d48" // rose-600
      : "#f97316" // orange-500
    : "#0284c7"; // sky-600

  const headerBadge = params.isEscalation
    ? `ESCALATION LEVEL ${params.escalationLevel}`
    : "REPORTING DEADLINE REMINDER";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>EmeilSG Notification</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <div style="background-color: ${accentColor}; padding: 18px 24px; color: #ffffff;">
      <span style="display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 4px; margin-bottom: 8px;">
        ${headerBadge}
      </span>
      <h2 style="margin: 0; font-size: 20px; font-weight: 600; line-height: 1.3;">
        ${escapeHtml(params.taskTitle)}
      </h2>
    </div>
    <div style="padding: 24px;">
      <p style="margin-top: 0; font-size: 15px; line-height: 1.5;">
        Dear <strong>${escapeHtml(params.recipientName)}</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        ${
          params.isEscalation
            ? `This is an automated governance escalation. An expected ESG compliance submission for <strong>${escapeHtml(params.orgUnitName)}</strong> is past due and requires immediate resolution.`
            : `This is a scheduled reminder for an upcoming ESG compliance submission due for <strong>${escapeHtml(params.orgUnitName)}</strong>.`
        }
      </p>

      <div style="margin: 20px 0; padding: 16px; background-color: #f1f5f9; border-radius: 6px; border-left: 4px solid ${accentColor}; font-size: 13px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 4px 0; color: #64748b; width: 140px;"><strong>Reporting Entity:</strong></td>
            <td style="padding: 4px 0; color: #0f172a;">${escapeHtml(params.orgUnitName)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;"><strong>Reporting Period:</strong></td>
            <td style="padding: 4px 0; color: #0f172a;">${escapeHtml(params.periodName)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;"><strong>Category:</strong></td>
            <td style="padding: 4px 0; color: #0f172a;">${escapeHtml(params.categoryName)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;"><strong>Due Date (set by your Admin):</strong></td>
            <td style="padding: 4px 0; color: #0f172a;"><strong>${escapeHtml(params.dueDateFormatted)}</strong></td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;"><strong>Status Urgency:</strong></td>
            <td style="padding: 4px 0; color: ${accentColor}; font-weight: 600;">${escapeHtml(params.urgencyText)}</td>
          </tr>
        </table>
      </div>

      <div style="margin: 28px 0; text-align: center;">
        <a href="${escapeHtml(params.deepLinkUrl)}" style="display: inline-block; background-color: ${accentColor}; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: 600; font-size: 14px; border-radius: 6px;">
          Go to Submission Portal &rarr;
        </a>
      </div>

      <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin-bottom: 0; border-top: 1px solid #e2e8f0; padding-top: 16px;">
        This notification was generated deterministically by the EmeilSG BRSR Reporting Engine based on MEIL organizational compliance schedules. Please do not reply directly to this automated email.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Loads all reporting deadlines, evaluates statuses, applies filters, and calculates summary KPIs.
 */
export async function getDeadlineData(
  sql: Sql,
  filters?: DeadlineFilter,
  referenceDate?: Date,
): Promise<{
  tasks: DeadlineTask[];
  kpis: DeadlineKPIs;
  periods: { id: string; name: string }[];
  orgUnits: { id: string; name: string }[];
}> {
  const refDate = referenceDate ?? new Date();

  // 1. Fetch available reporting periods
  const periodRows = await sql<{ id: string; name: string; is_open: boolean }[]>`
    select id, label as name, (status = 'open') as is_open
    from public.reporting_periods
    where start_date <= (now() at time zone 'Asia/Kolkata')::date
    order by start_date desc`;

  // 2. Fetch available org units (subsidiaries, projects)
  const orgUnitRows = await sql<{ id: string; name: string }[]>`
    select id, name
    from public.org_units
    where deleted_at is null
    order by name asc`;

  // 3. Query all submission expectations across reporting periods
  // Filter by periodId if provided, else query open periods (or most recent if no open)
  const targetPeriodId = filters?.periodId;
  const targetOrgUnitId = filters?.orgUnitId;

  const expectationsQuery = await sql<
    {
      expectation_id: string;
      org_unit_id: string;
      org_unit_name: string;
      org_unit_type: string;
      period_id: string;
      period_name: string;
      submission_closes_on: string | null;
      end_date: string;
      metric_id: string;
      metric_name: string;
      metric_code: string | null;
      frequency: string;
      category_name: string;
      owning_role_id: string;
      scope_code: string | null;
    }[]
  >`
    select
      e.id as expectation_id,
      e.org_unit_id,
      o.name as org_unit_name,
      o.unit_type as org_unit_type,
      p.id as period_id,
      p.label as period_name,
      to_char(p.submission_closes_on, 'YYYY-MM-DD') as submission_closes_on,
      to_char(p.end_date, 'YYYY-MM-DD') as end_date,
      m.id as metric_id,
      m.name as metric_name,
      m.code as metric_code,
      m.frequency::text as frequency,
      cat.name as category_name,
      cat.owning_role_id,
      (select code from public.scopes s
        where s.id = coalesce((select parent_scope_id from public.scopes where id = m.scope_id),
                              m.scope_id)) as scope_code
    from public.submission_expectations e
    join public.org_units o on o.id = e.org_unit_id and o.deleted_at is null
    join public.esg_metrics m on m.id = e.metric_id and m.deleted_at is null
    join public.esg_categories cat on cat.id = m.category_id
    join public.reporting_periods p on (
      ${targetPeriodId ? sql`p.id = ${targetPeriodId}` : sql`p.status in ('open', 'closed')`}
      and p.period_type::text = m.frequency::text
    )
    ${targetOrgUnitId ? sql`where e.org_unit_id = ${targetOrgUnitId}` : sql``}
    order by p.end_date desc, o.name asc, m.name asc`;

  if (expectationsQuery.length === 0) {
    return {
      tasks: [],
      kpis: {
        totalTasks: 0,
        upcoming: 0,
        dueSoon: 0,
        dueToday: 0,
        overdue: 0,
        escalated: 0,
        completed: 0,
        completionRate: 0,
      },
      periods: periodRows.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
      orgUnits: orgUnitRows.map((o: { id: string; name: string }) => ({ id: o.id, name: o.name })),
    };
  }

  // 4. Batch query existing records for completion status
  const existingRecords = await sql<
    {
      org_unit_id: string;
      metric_id: string;
      reporting_period_id: string;
      verification_status: string;
      validation_status: string;
      approval_status: string;
      data_quality_state: string;
    }[]
  >`
    select distinct on (r.org_unit_id, r.metric_id, r.reporting_period_id)
      r.org_unit_id,
      r.metric_id,
      r.reporting_period_id,
      r.verification_status,
      r.validation_status,
      r.approval_status,
      r.data_quality_state
    from public.esg_records r
    where r.data_quality_state <> 'rejected'
    order by r.org_unit_id, r.metric_id, r.reporting_period_id, r.created_at desc`;

  const recordMap = new Map<string, (typeof existingRecords)[0]>();
  for (const r of existingRecords) {
    recordMap.set(`${r.org_unit_id}:${r.metric_id}:${r.reporting_period_id}`, r);
  }

  // 5. Batch query who can submit, by the Upload page's rule (owner's page feedback, 2026-11-11): holders of
  //    the category's owning role at or above the unit, and holders of a role that uploads on its behalf
  //    (migration 0049). Administrators can upload anything but are not counted here: they get summaries.
  const ownerRows = await sql<
    {
      org_unit_id: string;
      role_id: string;
      user_id: string;
      display_name: string;
      email: string;
      role_name: string;
      on_behalf: boolean;
    }[]
  >`
    select distinct
      e.org_unit_id,
      cat.owning_role_id as role_id,
      u.id as user_id,
      u.display_name,
      u.email,
      r.name as role_name,
      (r.id <> cat.owning_role_id) as on_behalf
    from public.submission_expectations e
    join public.esg_metrics m on m.id = e.metric_id
    join public.esg_categories cat on cat.id = m.category_id
    join public.roles r on r.id = cat.owning_role_id or r.uploads_for_role_id = cat.owning_role_id
    join public.user_org_assignments a on a.role_id = r.id and a.revoked_at is null
    join public.org_unit_tree up on up.descendant_id = e.org_unit_id and up.ancestor_id = a.org_unit_id
    join public.users u on u.id = a.user_id and u.is_active and u.deleted_at is null`;

  const ownerMap = new Map<string, { responsible: TaskOwner[]; behalf: TaskOwner[] }>();
  for (const o of ownerRows) {
    const key = `${o.org_unit_id}:${o.role_id}`;
    const entry = ownerMap.get(key) ?? { responsible: [], behalf: [] };
    const list = o.on_behalf ? entry.behalf : entry.responsible;
    // One person holding both roles counts once, as responsible.
    if (!list.some((p) => p.userId === o.user_id)) {
      list.push({
        userId: o.user_id,
        displayName: o.display_name,
        email: o.email,
        roleName: o.role_name,
        ...(o.on_behalf ? { onBehalf: true } : {}),
      });
    }
    ownerMap.set(key, entry);
  }
  const roleNames = new Map(
    (await sql<{ id: string; name: string }[]>`select id, name from public.roles`).map((r) => [
      r.id,
      r.name,
    ]),
  );
  for (const entry of ownerMap.values()) {
    entry.behalf = entry.behalf.filter(
      (b) => !entry.responsible.some((r) => r.userId === b.userId),
    );
  }

  // 6. Batch query last reminded timestamp
  const reminderNoticeRows = await sql<
    {
      related_entity_id: string;
      last_reminded: string;
    }[]
  >`
    select related_entity_id, max(created_at) as last_reminded
    from public.notifications
    where type in ('deadline_reminder', 'deadline_escalated', 'submission_reminder')
      and related_entity_id is not null
    group by related_entity_id`;

  const lastRemindedMap = new Map<string, string>();
  for (const r of reminderNoticeRows) {
    lastRemindedMap.set(r.related_entity_id, r.last_reminded);
  }

  // 7. Evaluate each task. "Escalated" follows the climb of lib/reminders: level 1 once the unit's Administrator
  //    is told, level 2 once the Super Admins are.
  const [scheduleRow] = await sql<{ value: unknown }[]>`
    select value from public.org_settings where key = 'reminder_schedule'`;
  const { escalation } = readSchedule(scheduleRow?.value);
  const allTasks: DeadlineTask[] = [];

  for (const exp of expectationsQuery) {
    const rec = recordMap.get(`${exp.org_unit_id}:${exp.metric_id}:${exp.period_id}`);
    const isCompleted = Boolean(rec && rec.approval_status !== "rejected");
    let submissionStatus: DeadlineTask["submissionStatus"] = "missing";

    if (rec) {
      if (rec.approval_status === "approved") {
        submissionStatus = "approved";
      } else if (rec.validation_status === "validated") {
        submissionStatus = "validated";
      } else if (rec.verification_status === "user_verified") {
        submissionStatus = "user_verified";
      } else {
        submissionStatus = "draft";
      }
    }

    const dueDate = exp.submission_closes_on || exp.end_date;
    const evalResult = evaluateDeadlineStatus({
      dueDate,
      isCompleted,
      referenceDate: refDate,
      config: {
        escalationL1ThresholdDays: escalation.unitAdminAfter,
        escalationL2ThresholdDays: escalation.superAdminAfter,
      },
    });

    const who = ownerMap.get(`${exp.org_unit_id}:${exp.owning_role_id}`);
    // Reminders go to the responsible people, or to the on-behalf uploaders when there are none.
    const owners = who?.responsible.length ? who.responsible : (who?.behalf ?? []);
    const alsoUpload = who?.responsible.length ? who.behalf : [];
    allTasks.push({
      expectationId: exp.expectation_id,
      orgUnitId: exp.org_unit_id,
      orgUnitName: exp.org_unit_name,
      orgUnitType: exp.org_unit_type,
      reportingPeriodId: exp.period_id,
      periodName: exp.period_name,
      metricId: exp.metric_id,
      metricName: exp.metric_name,
      metricCode: exp.metric_code,
      frequency: exp.frequency,
      categoryName: exp.category_name,
      scopeCode: exp.scope_code,
      dueDate,
      daysRemaining: evalResult.daysRemaining,
      daysOverdue: evalResult.daysOverdue,
      status: evalResult.status,
      escalationLevel: evalResult.escalationLevel,
      submissionStatus,
      isCompleted,
      assignedOwners: owners,
      alsoUpload,
      owningRoleName: roleNames.get(exp.owning_role_id) ?? null,
      lastRemindedAt: lastRemindedMap.get(exp.expectation_id) ?? null,
      deepLinkPath: `/app/upload?metricId=${exp.metric_id}&periodId=${exp.period_id}`,
    });
  }

  // Compute aggregate KPIs across all tasks
  const kpis = calculateDeadlineKPIs(allTasks);

  // Apply filters
  let filteredTasks = allTasks;

  if (filters?.status && filters.status !== "all") {
    filteredTasks = filteredTasks.filter((t) => t.status === filters.status);
  }

  if (filters?.escalationLevel && filters.escalationLevel !== "all") {
    const lvl = Number(filters.escalationLevel);
    filteredTasks = filteredTasks.filter((t) => t.escalationLevel === lvl);
  }

  if (filters?.search && filters.search.trim().length > 0) {
    const q = filters.search.toLowerCase().trim();
    filteredTasks = filteredTasks.filter(
      (t) =>
        t.metricName.toLowerCase().includes(q) ||
        t.orgUnitName.toLowerCase().includes(q) ||
        t.categoryName.toLowerCase().includes(q) ||
        t.assignedOwners.some(
          (o) => o.displayName.toLowerCase().includes(q) || o.email.toLowerCase().includes(q),
        ),
    );
  }

  return {
    tasks: filteredTasks,
    kpis,
    periods: periodRows.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
    orgUnits: orgUnitRows.map((o: { id: string; name: string }) => ({ id: o.id, name: o.name })),
  };
}

/**
 * Manually sends an immediate reminder for a specific reporting deadline task.
 */
export async function sendManualTaskReminder(input: {
  expectationId: string;
  periodId: string;
  actorUserId: string;
  referenceDate?: Date;
}): Promise<{ success: boolean; reminded: number; emailed: number; message: string }> {
  const sql = db();
  const { tasks } = await getDeadlineData(sql, { periodId: input.periodId }, input.referenceDate);

  const task = tasks.find((t) => t.expectationId === input.expectationId);
  if (!task) {
    return { success: false, reminded: 0, emailed: 0, message: "Task not found." };
  }

  if (task.isCompleted) {
    return { success: false, reminded: 0, emailed: 0, message: "Task has already been completed." };
  }

  if (task.assignedOwners.length === 0) {
    return {
      success: false,
      reminded: 0,
      emailed: 0,
      message:
        "No assigned owners found for this task. Please assign users in the Organization or Users page.",
    };
  }

  let reminded = 0;
  let emailed = 0;

  const title = `[Manual Reminder] Submission due for ${task.metricName}`;
  const message = `Please submit evidence for ${task.metricName} (${task.orgUnitName}) for ${task.periodName}. Due date: ${task.dueDate}.`;

  await sql.begin(async (tx) => {
    for (const owner of task.assignedOwners) {
      await tx`
        insert into public.notifications
          (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
        values
          (${owner.userId}, 'deadline_reminder', ${title}, ${message}, 'submission_expectation', ${task.expectationId}, ${task.deepLinkPath})`;
      reminded++;
    }

    await writeAudit(tx, {
      eventType: "deadline.manual_reminder_sent",
      entityType: "submission_expectation",
      entityId: task.expectationId,
      userId: input.actorUserId,
      newValue: {
        periodId: task.reportingPeriodId,
        metricId: task.metricId,
        recipients: task.assignedOwners.map((o) => o.userId),
      },
    });
  });

  for (const owner of task.assignedOwners) {
    try {
      const res = await sendEmail({
        to: { email: owner.email, name: owner.displayName },
        subject: `EmeilSG Reminder: ${task.metricName} (${task.orgUnitName})`,
        html: buildDeadlineEmailHtml({
          recipientName: owner.displayName,
          isEscalation: task.escalationLevel > 0,
          escalationLevel: task.escalationLevel,
          taskTitle: task.metricName,
          categoryName: task.categoryName,
          orgUnitName: task.orgUnitName,
          periodName: task.periodName,
          dueDateFormatted: task.dueDate,
          urgencyText:
            task.daysRemaining < 0
              ? `${task.daysOverdue} days overdue`
              : `${task.daysRemaining} days remaining`,
          deepLinkUrl: `${appUrl()}${task.deepLinkPath}`,
        }),
      });
      if (res.sent) emailed++;
    } catch {
      // ignore email failure
    }
  }

  return {
    success: true,
    reminded,
    emailed,
    message: `Notified ${reminded} assigned owner(s) in-app and sent ${emailed} email(s).`,
  };
}
