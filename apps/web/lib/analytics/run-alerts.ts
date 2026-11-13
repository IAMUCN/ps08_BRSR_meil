import "server-only";
import { randomUUID } from "node:crypto";
import { appUrl } from "@/lib/app-url";
import { writeAudit } from "@/lib/audit";
import { db, type Tx } from "@/lib/db";
import { emissionAlertEmailHtml, sendEmail } from "@/lib/email/brevo";
import { baselinePeriods, findAlerts, readAlertSettings, type UnitPeriodScope } from "./alerts";
import { indiaToday, loadMissingExpected, loadPeriods, toTonnes } from "./service";
import type { ScopeCode } from "./trends";

// The daily emission threshold check (feature_enhancement.md 7.3, requirement 34; A47). Run by the same Vercel
// Cron call as the reminders (/api/cron/reminders) and by a Super Admin's "Check now". Safe to run any number
// of times: an alert is unique per unit, period and scope, and each delivery is an `emission_alert_sends` row
// claimed before it goes out, so nothing is sent twice; a failed email is tried once more.
// Each person gets one in-app notification and one email per run, listing their new alerts.

export type AlertRunSummary = {
  today: string;
  checked: number;
  found: number;
  newAlerts: number;
  sent: { inApp: number; email: number };
  failed: number;
};

const MAX_ATTEMPTS = 2;
/** Alerts older than this are not sent to people who become Administrators later. */
const DELIVERY_DAYS = 7;
const SCOPE_LABEL: Record<ScopeCode, string> = {
  SCOPE_1: "Scope 1",
  SCOPE_2: "Scope 2",
  SCOPE_3: "Scope 3",
};
const t = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: n < 10 ? 2 : 1 });

type Sql = Tx | ReturnType<typeof db>;

/** Runs `fn` atomically: a transaction, or a savepoint when already inside one (the tests' rolled-back runs). */
const atomically = <T>(sql: Sql, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  "savepoint" in sql
    ? ((sql as Tx).savepoint(fn) as Promise<T>)
    : ((sql as ReturnType<typeof db>).begin(fn) as Promise<T>);

export async function runEmissionAlerts(
  by: { userId: string | null },
  deps: { sql?: Sql; send?: typeof sendEmail } = {},
): Promise<AlertRunSummary> {
  const sql = deps.sql ?? db();
  const send = deps.send ?? sendEmail;
  const [today, periods, [setting]] = await Promise.all([
    indiaToday(sql),
    loadPeriods(sql),
    sql<
      { value: unknown }[]
    >`select value from public.org_settings where key = 'emission_alert_settings'`,
  ]);
  const settings = readAlertSettings(setting?.value);
  const summary: AlertRunSummary = {
    today,
    checked: 0,
    found: 0,
    newAlerts: 0,
    sent: { inApp: 0, email: 0 },
    failed: 0,
  };

  if (settings.enabled) {
    // Only the periods that can be alerted on and the earlier periods they are compared with.
    const eligible = periods.filter(
      (p) =>
        p.status === "closed" &&
        p.endDate < today &&
        (Date.parse(today) - Date.parse(p.endDate)) / 86_400_000 <= settings.lookbackDays,
    );
    const needed = [
      ...new Set(eligible.flatMap((p) => [p.id, ...baselinePeriods(p, periods).map((b) => b.id)])),
    ];
    if (needed.length) {
      const [rows, missing] = await Promise.all([
        sql<
          {
            org_unit_id: string;
            period_id: string;
            scope_code: ScopeCode;
            approved_t: number | null;
            approved_count: number;
            pending_count: number;
            not_calculated_count: number;
          }[]
        >`
          select cr.org_unit_id, cr.reporting_period_id as period_id, coalesce(ps.code, s.code) as scope_code,
                 sum(${toTonnes(sql)}) filter (where cr.approval_status = 'approved' and not cr.not_calculated)::float
                   as approved_t,
                 count(*) filter (where cr.approval_status = 'approved' and not cr.not_calculated
                                    and ${toTonnes(sql)} is not null)::int as approved_count,
                 count(*) filter (where cr.approval_status <> 'approved' and not cr.not_calculated)::int
                   as pending_count,
                 count(*) filter (where cr.not_calculated)::int as not_calculated_count
          from public.consolidation_records cr
          join public.org_units o on o.id = cr.org_unit_id and o.deleted_at is null
          join public.esg_metrics m on m.id = cr.metric_id
          join public.scopes s on s.id = m.scope_id
          left join public.scopes ps on ps.id = s.parent_scope_id
          where cr.reporting_period_id = any(${needed}::uuid[])
            and coalesce(ps.code, s.code) in ('SCOPE_1', 'SCOPE_2', 'SCOPE_3')
          group by 1, 2, 3`,
        loadMissingExpected(sql, null),
      ]);
      const gap = new Map(
        missing.map((m) => [`${m.orgUnitId}|${m.periodId}|${m.scopeCode}`, m.missing]),
      );
      const figures: UnitPeriodScope[] = rows.map((r) => ({
        orgUnitId: r.org_unit_id,
        periodId: r.period_id,
        scopeCode: r.scope_code,
        approvedT: r.approved_t ?? 0,
        approvedCount: r.approved_count,
        pendingCount: r.pending_count,
        notCalculatedCount: r.not_calculated_count,
        missingExpected: gap.get(`${r.org_unit_id}|${r.period_id}|${r.scope_code}`) ?? 0,
      }));
      summary.checked = figures.filter((f) => eligible.some((p) => p.id === f.periodId)).length;
      const found = findAlerts({ periods, figures, settings, today });
      summary.found = found.length;
      for (const a of found) {
        const inserted = await sql`
          insert into public.emission_alerts
            (org_unit_id, reporting_period_id, scope_code, measured_tco2e, baseline_tco2e, threshold_pct,
             baseline_periods)
          values (${a.orgUnitId}, ${a.periodId}, ${a.scopeCode}, ${a.measuredT}, ${a.baselineT}, ${a.thresholdPct},
                  ${sql.json(a.baselinePeriods)})
          on conflict (org_unit_id, reporting_period_id, scope_code) do nothing
          returning id`;
        summary.newAlerts += inserted.length;
      }
    }
  }

  // Deliver recent open alerts: to the Super Admins and to the Administrators of the unit or a unit above it.
  const deliveries = await sql<
    {
      alert_id: string;
      recipient_id: string;
      name: string;
      email: string;
      unit_name: string;
      period_label: string;
      scope_code: ScopeCode;
      measured: number;
      baseline: number;
      threshold: number;
    }[]
  >`
    select distinct a.id as alert_id, u.id as recipient_id, u.display_name as name, u.email,
           o.name as unit_name, p.label as period_label, a.scope_code,
           a.measured_tco2e::float as measured, a.baseline_tco2e::float as baseline,
           a.threshold_pct::float as threshold
    from public.emission_alerts a
    join public.org_units o on o.id = a.org_unit_id
    join public.reporting_periods p on p.id = a.reporting_period_id
    join public.user_org_assignments uoa on uoa.revoked_at is null
    join public.roles r on r.id = uoa.role_id and r.code in ('admin', 'org_admin', 'bu_manager')
    join public.users u on u.id = uoa.user_id and u.is_active and u.deleted_at is null
    where a.status = 'open' and a.created_at > now() - make_interval(days => ${DELIVERY_DAYS})
      and (r.code = 'admin'
           or exists (select 1 from public.org_unit_tree t
                      where t.ancestor_id = uoa.org_unit_id and t.descendant_id = a.org_unit_id))
    order by u.id, o.name, p.label`;

  type Delivery = (typeof deliveries)[number];
  const byRecipient = new Map<string, Delivery[]>();
  for (const d of deliveries)
    byRecipient.set(d.recipient_id, [...(byRecipient.get(d.recipient_id) ?? []), d]);
  const link = "/admin/carbon-analytics#alerts";
  for (const [recipientId, items] of byRecipient) {
    for (const channel of ["in_app", "email"] as const) {
      const claimed: Delivery[] = [];
      for (const item of items) {
        const [row] = await sql<{ id: string }[]>`
          insert into public.emission_alert_sends (alert_id, recipient_id, channel, status)
          values (${item.alert_id}, ${recipientId}, ${channel}, 'sending')
          on conflict (alert_id, recipient_id, channel) do update
            set status = 'sending', attempts = public.emission_alert_sends.attempts + 1, error = null
            where public.emission_alert_sends.status = 'failed'
              and public.emission_alert_sends.attempts < ${MAX_ATTEMPTS}
          returning id`;
        if (row) claimed.push(item);
      }
      if (claimed.length === 0) continue;
      const ids = claimed.map((c) => c.alert_id);
      const lines = claimed.map(
        (c) =>
          `${c.unit_name}, ${c.period_label}, ${SCOPE_LABEL[c.scope_code]}: ${t(c.measured)} tCO2e against an ` +
          `expected ${t(c.baseline)} (+${Math.round(((c.measured - c.baseline) / c.baseline) * 100)}%, threshold ${t(c.threshold)}%)`,
      );
      if (channel === "in_app") {
        await atomically(sql, async (tx) => {
          await tx`
            insert into public.notifications
              (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
            values (${recipientId}, 'emission_alert',
                    ${claimed.length === 1 ? "Emissions above the expected average" : `${claimed.length} emission alerts`},
                    ${lines.slice(0, 5).join("; ") + (lines.length > 5 ? `; and ${lines.length - 5} more` : "")},
                    'emission_alert', ${ids[0]}, ${link})`;
          await tx`
            update public.emission_alert_sends set status = 'sent', sent_at = now()
            where recipient_id = ${recipientId} and channel = 'in_app' and alert_id = any(${ids}::uuid[])`;
        });
        summary.sent.inApp += 1;
        continue;
      }
      const result = await send({
        to: { email: claimed[0].email, name: claimed[0].name },
        subject: `EmeilSG: ${claimed.length === 1 ? "an emission alert" : `${claimed.length} emission alerts`}`,
        html: emissionAlertEmailHtml({
          displayName: claimed[0].name,
          lines,
          link: `${appUrl()}${link}`,
        }),
      });
      if (result.sent) {
        await sql`
          update public.emission_alert_sends set status = 'sent', sent_at = now()
          where recipient_id = ${recipientId} and channel = 'email' and alert_id = any(${ids}::uuid[])`;
        summary.sent.email += 1;
      } else {
        await sql`
          update public.emission_alert_sends set status = 'failed', error = ${result.reason.slice(0, 500)}
          where recipient_id = ${recipientId} and channel = 'email' and alert_id = any(${ids}::uuid[])`;
        summary.failed += 1;
      }
    }
  }

  await atomically(sql, (tx) =>
    writeAudit(tx, {
      eventType: "emission_alerts.run",
      entityType: "emission_alert_run",
      entityId: randomUUID(),
      userId: by.userId,
      newValue: summary,
    }),
  );
  return summary;
}
