import "server-only";
import { randomUUID } from "node:crypto";
import { appUrl } from "@/lib/app-url";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getDeadlineData } from "@/lib/deadlines/service";
import { deadlineReminderEmailHtml, sendEmail } from "@/lib/email/brevo";
import {
  planReminders,
  readSchedule,
  type Message,
  type Overseer,
  type Person,
  type PendingStatus,
  levelsOf,
} from "@/lib/reminders/plan";

// Sends today's deadline reminders (feature_enhancement.md Phase 5). Called once a day by Vercel Cron
// (/api/cron/reminders) and by a Super Admin's "Run now". Safe to run any number of times: each reminder is a
// `reminder_sends` row claimed before it is sent, unique per person, period, schedule day and channel, so a second
// run sends nothing again; a failed email is tried once more, never an accepted one.

export type RunSummary = {
  today: string;
  messages: number;
  sent: { inApp: number; email: number };
  failed: number;
  skipped: number;
};

const MAX_ATTEMPTS = 2;
const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * The Administrators above each unit, nearest first: one list per unit that has any (an `org_admin` assigned at the
 * unit or at a unit above it). Units with none are left out, so the climb skips them.
 */
async function loadAdminLevels(
  sql: ReturnType<typeof db>,
  unitIds: string[],
): Promise<Map<string, Person[][]>> {
  const levels = new Map<string, Person[][]>();
  if (unitIds.length === 0) return levels;
  const rows = await sql<
    { unit_id: string; depth: number; user_id: string; name: string; email: string }[]
  >`
    select t.descendant_id::text as unit_id, min(t.depth)::int as depth, u.id as user_id,
           u.display_name as name, u.email
    from public.user_org_assignments a
    join public.roles r on r.id = a.role_id and r.code in ('org_admin', 'bu_manager')
    join public.users u on u.id = a.user_id and u.is_active and u.deleted_at is null
    join public.org_unit_tree t on t.ancestor_id = a.org_unit_id
    where a.revoked_at is null and t.descendant_id = any(${unitIds}::uuid[])
    group by t.descendant_id, a.org_unit_id, u.id, u.display_name, u.email
    order by 2, 4`;
  // Rows arrive nearest first; people at the same distance are one level.
  const byUnit = new Map<string, { depth: number; person: Person }[]>();
  for (const row of rows) {
    const list = byUnit.get(row.unit_id) ?? [];
    list.push({
      depth: row.depth,
      person: { userId: row.user_id, name: row.name, email: row.email },
    });
    byUnit.set(row.unit_id, list);
  }
  for (const [unit, list] of byUnit) levels.set(unit, levelsOf(list));
  return levels;
}

/** Claims one send: a new row, or a failed one with attempts left. Null when it is not ours to send. */
async function claim(message: Message, channel: "in_app" | "email"): Promise<string | null> {
  const [row] = await db()<{ id: string }[]>`
    insert into public.reminder_sends
      (reporting_period_id, kind, recipient_id, days_before, channel, status, missing_count, org_unit_ids)
    values (${message.periodId}, ${message.kind}, ${message.recipient.userId}, ${message.daysBefore},
            ${channel}, 'sending', ${message.missingCount}, ${message.orgUnitIds}::uuid[])
    on conflict (reporting_period_id, kind, recipient_id, days_before, channel) do update
      set status = 'sending', attempts = public.reminder_sends.attempts + 1, error = null,
          missing_count = excluded.missing_count, org_unit_ids = excluded.org_unit_ids
      where public.reminder_sends.status = 'failed' and public.reminder_sends.attempts < ${MAX_ATTEMPTS}
    returning id`;
  return row?.id ?? null;
}

export async function runReminders(by: { userId: string | null }): Promise<RunSummary> {
  const sql = db();
  const [{ today }] = await sql<{ today: string }[]>`
    select public.reporting_period_today()::text as today`;
  const [setting] = await sql<{ value: unknown }[]>`
    select value from public.org_settings where key = 'reminder_schedule'`;
  const schedule = readSchedule(setting?.value);

  // What is not approved yet, in periods that take uploads now: missing, or on file and stuck (phase 2).
  const open = await sql<{ id: string }[]>`
    select rp.id from public.reporting_periods rp
    where rp.status = 'open' and not public.reporting_period_locked(rp)`;
  const openIds = new Set(open.map((p) => p.id));
  const { tasks } = await getDeadlineData(sql);
  const notApproved = tasks.filter(
    (t) => openIds.has(t.reportingPeriodId) && t.submissionStatus !== "approved",
  );
  const adminLevels = await loadAdminLevels(sql, [...new Set(notApproved.map((t) => t.orgUnitId))]);
  const pending = notApproved.map((t) => ({
    status: t.submissionStatus as PendingStatus,
    periodId: t.reportingPeriodId,
    periodName: t.periodName,
    dueDate: t.dueDate,
    orgUnitId: t.orgUnitId,
    orgUnitName: t.orgUnitName,
    metricName: t.metricName,
    owners: t.assignedOwners.map((o) => ({
      userId: o.userId,
      name: o.displayName,
      email: o.email,
    })),
    adminLevels: adminLevels.get(t.orgUnitId) ?? [],
  }));

  // Who oversees what: each Administrator their units and below; the Super Admins everything.
  const overseerRows = await sql<
    { user_id: string; name: string; email: string; code: string; units: string[] }[]
  >`
    select u.id as user_id, u.display_name as name, u.email, r.code,
           array_agg(distinct t.descendant_id::text) as units
    from public.user_org_assignments a
    join public.roles r on r.id = a.role_id and r.code in ('org_admin', 'bu_manager', 'admin')
    join public.users u on u.id = a.user_id and u.is_active and u.deleted_at is null
    join public.org_unit_tree t on t.ancestor_id = a.org_unit_id
    where a.revoked_at is null
    group by u.id, u.display_name, u.email, r.code`;
  const superAdminIds = new Set(
    overseerRows.filter((o) => o.code === "admin").map((o) => o.user_id),
  );
  const overseers = new Map<string, Overseer>();
  for (const row of overseerRows) {
    const current = overseers.get(row.user_id);
    if (row.code === "admin") {
      overseers.set(row.user_id, {
        userId: row.user_id,
        name: row.name,
        email: row.email,
        unitIds: "all",
      });
    } else if (!current || current.unitIds !== "all") {
      const units = new Set([
        ...(current?.unitIds === "all" ? [] : (current?.unitIds ?? [])),
        ...row.units,
      ]);
      overseers.set(row.user_id, {
        userId: row.user_id,
        name: row.name,
        email: row.email,
        unitIds: units,
      });
    }
  }

  const messages = planReminders({
    today,
    schedule,
    pending,
    overseers: [...overseers.values()],
    superAdminIds,
  });

  const summary: RunSummary = {
    today,
    messages: messages.length,
    sent: { inApp: 0, email: 0 },
    failed: 0,
    skipped: 0,
  };
  for (const message of messages) {
    const link =
      message.kind === "owner" ? "/app/upload" : "/admin/submissions?issue=missing_submissions";
    const overdue = message.daysBefore < 0;
    for (const channel of message.channels) {
      const id = await claim(message, channel);
      if (!id) {
        summary.skipped += 1;
        continue;
      }
      if (channel === "in_app") {
        await sql.begin(async (tx) => {
          await tx`
            insert into public.notifications
              (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
            values (${message.recipient.userId},
                    ${overdue ? "deadline_escalated" : "deadline_approaching"}, ${message.title},
                    ${message.lines.slice(0, 5).join("; ") + (message.lines.length > 5 ? `; and ${message.lines.length - 5} more` : "")},
                    'reporting_period', ${message.periodId}, ${link})`;
          await tx`update public.reminder_sends set status = 'sent', sent_at = now() where id = ${id}`;
        });
        summary.sent.inApp += 1;
        continue;
      }
      const result = await sendEmail({
        to: { email: message.recipient.email, name: message.recipient.name },
        subject: `EmeilSG: ${message.title}`,
        html: deadlineReminderEmailHtml({
          displayName: message.recipient.name,
          title: message.title,
          dueOn: shortDate(message.dueDate),
          lines: message.lines,
          link: `${appUrl()}${link}`,
          digest: message.kind !== "owner",
          overdue,
        }),
      });
      if (result.sent) {
        await sql`update public.reminder_sends set status = 'sent', sent_at = now() where id = ${id}`;
        summary.sent.email += 1;
      } else {
        await sql`
          update public.reminder_sends set status = 'failed', error = ${result.reason.slice(0, 500)}
          where id = ${id}`;
        summary.failed += 1;
      }
    }
  }

  await sql.begin((tx) =>
    writeAudit(tx, {
      eventType: "reminders.run",
      entityType: "reminder_run",
      entityId: randomUUID(),
      userId: by.userId,
      newValue: summary,
    }),
  );
  return summary;
}
