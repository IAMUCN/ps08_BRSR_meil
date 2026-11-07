import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { financialYearLabel } from "@/lib/consolidation/aggregate";
import type { ActiveSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { protectedProcedure, router } from "@/lib/trpc/init";

// Audit Trail (03_APP_FLOW.md §2.2, schema §12.1, .grill/phase-18-audit-security-decisions.md): the
// append-only log, filterable and paged, and one record's complete history from upload to the reports that
// included it. Read-only — the log cannot be changed from anywhere (migration 0027).

// Who sees which entries (feature_enhancement.md Phase 4, requirements 29 and 30; owner's decision of
// 2026-11-08): `audit.view` (the Super Admin) sees everything; everyone sees their own entries; an
// Administrator also sees every entry about something inside their units. Entries are scoped by what they are
// about, never by who did them, so a person working in two units shows only their work in yours.
const view = protectedProcedure;

type Sql = ReturnType<typeof db>;

/** The units an Administrator administers, with everything beneath them; empty for anyone else. */
async function administered(sql: Sql, session: ActiveSession): Promise<string[]> {
  if (!session.isOrgAdmin || session.adminOrgUnitIds.length === 0) return [];
  const rows = await sql<{ id: string }[]>`
    select distinct t.descendant_id as id from public.org_unit_tree t
    where t.ancestor_id = any(${session.adminOrgUnitIds}::uuid[])`;
  return rows.map((r) => r.id);
}

/** Is this entry (`a`) about something inside `units`? The entity types that belong to a unit. */
function aboutUnits(sql: Sql, units: string[]) {
  return sql`(
       (a.entity_type = 'esg_record' and exists (
          select 1 from public.esg_records x where x.id = a.entity_id and x.org_unit_id = any(${units}::uuid[])))
    or (a.entity_type = 'document' and exists (
          select 1 from public.documents x where x.id = a.entity_id and x.org_unit_id = any(${units}::uuid[])))
    or (a.entity_type = 'ocr_job' and exists (
          select 1 from public.ocr_jobs x join public.documents d on d.id = x.document_id
          where x.id = a.entity_id and d.org_unit_id = any(${units}::uuid[])))
    or (a.entity_type = 'report_run' and exists (
          select 1 from public.report_runs x where x.id = a.entity_id and x.org_unit_id = any(${units}::uuid[])))
    or (a.entity_type = 'org_unit' and a.entity_id = any(${units}::uuid[]))
    or (a.entity_type = 'user' and exists (
          select 1 from public.user_org_assignments x
          where x.user_id = a.entity_id and x.org_unit_id = any(${units}::uuid[]))))`;
}

/** The entries the caller may read, as SQL over `a` (audit_logs). */
async function visibleTo(sql: Sql, session: ActiveSession) {
  if (session.permissions.includes("audit.view")) return { all: true, condition: sql`true` };
  const units = await administered(sql, session);
  return {
    all: false,
    condition: units.length
      ? sql`(a.user_id = ${session.userId} or ${aboutUnits(sql, units)})`
      : sql`a.user_id = ${session.userId}`,
  };
}

/** The search bar (requirement 12): each word must appear in the action, the person, the reason or the
 * values. Words are bound, and their %, _ and \ taken literally. */
function searchCondition(sql: Sql, text: string) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((word) => {
      const like = `%${word.replace(/[\\%_]/g, "\\$&")}%`;
      return sql`and (a.event_type ilike ${like} or u.display_name ilike ${like} or a.reason ilike ${like}
        or a.new_value::text ilike ${like} or a.old_value::text ilike ${like}
        or a.entity_type ilike ${like})`;
    });
}

export type AuditEvent = {
  id: string;
  at: string;
  event: string;
  entityType: string;
  entityId: string;
  who: string | null;
  /** The person's roles today, where the caller may see them (Phase 4). */
  whoRoles: string | null;
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
  /** Only the caller's own entries ("My activity"). */
  mine: z.boolean().default(false),
  /** Entries by people who hold this role. */
  roleCode: z.string().trim().max(60).optional(),
  /** The search bar. */
  q: z.string().trim().max(100).optional(),
});

type Row = {
  id: string;
  created_at: Date;
  event_type: string;
  entity_type: string;
  entity_id: string;
  who: string | null;
  who_roles?: string | null;
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
  whoRoles: r.who_roles ?? null,
  oldValue: r.old_value,
  newValue: r.new_value,
  reason: r.reason,
  ipAddress: r.ip_address,
  userAgent: r.user_agent,
  sessionId: r.session_id,
});

export const auditRouter = router({
  /** The filters' choices: who has acted, and which event and entity types exist. */
  options: view.query(async ({ ctx }) => {
    const sql = db();
    const { all, condition } = await visibleTo(sql, ctx.session);
    const units = all ? [] : await administered(sql, ctx.session);
    const [users, events, entities, roles] = await Promise.all([
      // The people the caller may pick: everyone for the Super Admin; for an Administrator, the people who
      // hold a role inside their units (and themselves); for anyone else, only themselves.
      all
        ? sql<{ id: string; name: string }[]>`
            select u.id, u.display_name as name from public.users u
            where exists (select 1 from public.audit_logs a where a.user_id = u.id)
            order by u.display_name`
        : sql<{ id: string; name: string }[]>`
            select u.id, u.display_name as name from public.users u
            where u.id = ${ctx.session.userId}
               or exists (select 1 from public.user_org_assignments x
                          where x.user_id = u.id and x.revoked_at is null
                            and x.org_unit_id = any(${units}::uuid[]))
            order by u.display_name`,
      sql<{ event_type: string }[]>`
        select distinct a.event_type from public.audit_logs a where ${condition} order by 1`,
      sql<{ entity_type: string }[]>`
        select distinct a.entity_type from public.audit_logs a where ${condition} order by 1`,
      sql<{ code: string; name: string }[]>`select code, name from public.roles order by name`,
    ]);
    return {
      users,
      eventTypes: events.map((e) => e.event_type),
      entityTypes: entities.map((e) => e.entity_type),
      roles,
      /** The caller sees everyone's entries (Super Admin), only their own, or their units' too. */
      reach: all ? ("all" as const) : units.length ? ("units" as const) : ("own" as const),
    };
  }),

  query: view.input(filters).query(async ({ ctx, input }) => {
    const sql = db();
    const { condition } = await visibleTo(sql, ctx.session);
    const rows = await sql<(Row & { cursor_at: string })[]>`
      select a.id, a.created_at, a.event_type, a.entity_type, a.entity_id, u.display_name as who,
             (select string_agg(distinct ro.name, ', ' order by ro.name)
                from public.user_org_assignments x join public.roles ro on ro.id = x.role_id
                where x.user_id = a.user_id and x.revoked_at is null) as who_roles,
             a.old_value, a.new_value, a.reason, a.ip_address, a.user_agent, a.session_id,
             -- the cursor keeps microseconds: a JS Date would drop them and skip events written in one
             -- transaction, which share a timestamp (hence ::text below — postgres.js sends a timestamptz
             -- parameter through a Date too)
             to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_at
      from public.audit_logs a left join public.users u on u.id = a.user_id
      where ${condition}
        ${input.mine ? sql`and a.user_id = ${ctx.session.userId}` : sql``}
        ${
          input.roleCode
            ? sql`and exists (select 1 from public.user_org_assignments x
                              join public.roles ro on ro.id = x.role_id
                              where x.user_id = a.user_id and x.revoked_at is null
                                and ro.code = ${input.roleCode})`
            : sql``
        }
        ${input.q ? searchCondition(sql, input.q) : sql``}
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
    .query(async ({ ctx, input }): Promise<RecordHistory> => {
      const sql = db();
      // A record's whole history: the Super Admin, or an Administrator of the record's unit (Phase 4).
      if (!ctx.session.permissions.includes("audit.view")) {
        const units = await administered(sql, ctx.session);
        const [own] = await sql`
          select 1 from public.esg_records
          where id = ${input.recordId} and org_unit_id = any(${units}::uuid[])`;
        if (!own) throw new TRPCError({ code: "NOT_FOUND", message: "Record not found." });
      }
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
