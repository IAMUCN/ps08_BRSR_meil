import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { financialYearLabel } from "@/lib/consolidation/aggregate";
import { db } from "@/lib/db";
import { permissionProcedure, router } from "@/lib/trpc/init";

// Audit Trail (03_APP_FLOW.md §2.2, schema §12.1, .grill/phase-18-audit-security-decisions.md): the
// append-only log, filterable and paged, and one record's complete history from upload to the reports that
// included it. Read-only — the log cannot be changed from anywhere (migration 0027).

const view = permissionProcedure("audit.view");

export type AuditEvent = {
  id: string;
  at: string;
  event: string;
  entityType: string;
  entityId: string;
  who: string | null;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  /** Where the action came from (migration 0036); null for system events and older entries. */
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
};

export type RecordHistory = {
  record: {
    id: string;
    metricName: string;
    orgUnitName: string;
    periodLabel: string;
    fileName: string | null;
  };
  events: AuditEvent[];
  reports: { id: string; coverage: string; generatedAt: string }[];
};

const PAGE = 100;

const filters = z.object({
  userId: z.uuid().optional(),
  eventType: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Keyset paging: events strictly older than this one. */
  before: z.object({ at: z.iso.datetime(), id: z.uuid() }).optional(),
});

type Row = {
  id: string;
  created_at: Date;
  event_type: string;
  entity_type: string;
  entity_id: string;
  who: string | null;
  old_value: unknown;
  new_value: unknown;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  session_id: string | null;
};

const toEvent = (r: Row): AuditEvent => ({
  id: r.id,
  at: r.created_at.toISOString(),
  event: r.event_type,
  entityType: r.entity_type,
  entityId: r.entity_id,
  who: r.who,
  oldValue: r.old_value,
  newValue: r.new_value,
  reason: r.reason,
  ipAddress: r.ip_address,
  userAgent: r.user_agent,
  sessionId: r.session_id,
});

export const auditRouter = router({
  /** The filters' choices: who has acted, and which event and entity types exist. */
  options: view.query(async () => {
    const sql = db();
    const [users, events, entities] = await Promise.all([
      sql<{ id: string; name: string }[]>`
        select u.id, u.display_name as name from public.users u
        where exists (select 1 from public.audit_logs a where a.user_id = u.id)
        order by u.display_name`,
      sql<{ event_type: string }[]>`select distinct event_type from public.audit_logs order by 1`,
      sql<{ entity_type: string }[]>`select distinct entity_type from public.audit_logs order by 1`,
    ]);
    return {
      users,
      eventTypes: events.map((e) => e.event_type),
      entityTypes: entities.map((e) => e.entity_type),
    };
  }),

  query: view.input(filters).query(async ({ input }) => {
    const sql = db();
    const rows = await sql<(Row & { cursor_at: string })[]>`
      select a.id, a.created_at, a.event_type, a.entity_type, a.entity_id, u.display_name as who,
             a.old_value, a.new_value, a.reason, a.ip_address, a.user_agent, a.session_id,
             -- the cursor keeps microseconds: a JS Date would drop them and skip events written in one
             -- transaction, which share a timestamp (hence ::text below — postgres.js sends a timestamptz
             -- parameter through a Date too)
             to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_at
      from public.audit_logs a left join public.users u on u.id = a.user_id
      where true
        ${input.userId ? sql`and a.user_id = ${input.userId}` : sql``}
        ${input.eventType ? sql`and a.event_type = ${input.eventType}` : sql``}
        ${input.entityType ? sql`and a.entity_type = ${input.entityType}` : sql``}
        ${input.entityId ? sql`and a.entity_id = ${input.entityId}` : sql``}
        ${input.from ? sql`and a.created_at >= ${input.from}::date` : sql``}
        ${input.to ? sql`and a.created_at < ${input.to}::date + 1` : sql``}
        ${input.before ? sql`and (a.created_at, a.id) < (${input.before.at}::text::timestamptz, ${input.before.id}::uuid)` : sql``}
      order by a.created_at desc, a.id desc
      limit ${PAGE + 1}`;
    const events = rows.slice(0, PAGE).map(toEvent);
    return {
      events,
      next: rows.length > PAGE ? { at: rows[PAGE - 1].cursor_at, id: rows[PAGE - 1].id } : null,
    };
  }),

  /**
   * Everything that happened to one ESG record: its own events, its document's (upload, OCR), its fields'
   * extraction and edits, and the report runs whose snapshot included it (schema §13.1).
   */
  record: view
    .input(z.object({ recordId: z.uuid() }))
    .query(async ({ input }): Promise<RecordHistory> => {
      const sql = db();
      const [record] = await sql<
        {
          id: string;
          metric_name: string;
          org_unit_name: string;
          period_label: string;
          file_name: string | null;
          document_id: string | null;
        }[]
      >`
      select r.id, m.name as metric_name, o.name as org_unit_name, p.label as period_label,
             d.file_name, d.id as document_id
      from public.esg_records r
      join public.esg_metrics m on m.id = r.metric_id
      join public.org_units o on o.id = r.org_unit_id
      join public.reporting_periods p on p.id = r.reporting_period_id
      left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
      left join public.documents d on d.id = erd.document_id
      where r.id = ${input.recordId}`;
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Record not found." });

      const [events, reports] = await Promise.all([
        sql<Row[]>`
        select a.id, a.created_at, a.event_type, a.entity_type, a.entity_id, u.display_name as who,
               a.old_value, a.new_value, a.reason, a.ip_address, a.user_agent, a.session_id
        from public.audit_logs a left join public.users u on u.id = a.user_id
        where a.entity_id = ${record.id}
           or a.entity_id = ${record.document_id}
           or a.entity_id in (select j.id from public.ocr_jobs j where j.document_id = ${record.document_id})
           or a.entity_id in (select f.id from public.ocr_fields f
                              join public.ocr_extractions e on e.id = f.ocr_extraction_id
                              where e.document_id = ${record.document_id})
        order by a.created_at, a.id`,
        sql<
          { id: string; label: string | null; financial_year: number | null; completed_at: Date }[]
        >`
        select rr.id, p.label, rr.financial_year, rr.completed_at
        from public.report_runs rr left join public.reporting_periods p on p.id = rr.reporting_period_id
        where rr.status = 'completed'
          and exists (select 1 from jsonb_array_elements(rr.snapshot_data->'indicators') i
                      where i->'esg_record_ids' ? ${record.id})
        order by rr.completed_at`,
      ]);
      return {
        record: {
          id: record.id,
          metricName: record.metric_name,
          orgUnitName: record.org_unit_name,
          periodLabel: record.period_label,
          fileName: record.file_name,
        },
        events: events.map(toEvent),
        reports: reports.map((r) => ({
          id: r.id,
          coverage:
            r.financial_year !== null ? financialYearLabel(r.financial_year) : (r.label ?? "—"),
          generatedAt: r.completed_at.toISOString(),
        })),
      };
    }),
});
