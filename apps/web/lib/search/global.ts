import "server-only";
import type postgres from "postgres";
import { workspaceNavFor } from "@/components/shell/admin-nav";
import { analyticsUnitIds } from "@/lib/analytics/service";
import type { db } from "@/lib/db";
import { isTemplate, TEMPLATE_INFO } from "@/lib/reports/templates";
import { coverageOf } from "@/lib/trpc/routers/reports";
import {
  likePattern,
  matchPages,
  orderFor,
  scopeWords,
  searchTerms,
  SECTION_LABELS,
  sectionsFor,
  type SearchHit,
  type SearchResult,
  type SectionKey,
} from "./rules";

// The top-bar search (feature_enhancement.md 8.3, requirement 19; A48). lib/db.ts bypasses RLS, so every
// section is limited here: records, people, org units and reports to the units the caller administers (a Super
// Admin: all); someone who is not an administrator sees only the records they submitted, their pages and their
// own activity. Nothing is searched that the caller could not open.

type Sql = ReturnType<typeof db>;
type Caller = {
  userId: string;
  isAdmin: boolean;
  isOrgAdmin: boolean;
  adminOrgUnitIds: string[];
  permissions: string[];
};

const PER_SECTION = 6;

/** Every word must match one of the columns. */
function allWords(sql: Sql, terms: string[], columns: postgres.Fragment[]) {
  return terms.reduce(
    (acc, term) => {
      const p = likePattern(term);
      const any = columns.reduce(
        (or, column, i) =>
          i === 0 ? sql`${column} ilike ${p}` : sql`${or} or ${column} ilike ${p}`,
        sql`false`,
      );
      return sql`${acc} and (${any})`;
    },
    sql`true` as postgres.Fragment,
  );
}

export async function globalSearch(
  sql: Sql,
  caller: Caller,
  input: { q: string; pathname: string },
): Promise<SearchResult> {
  const adminArea = caller.isAdmin || caller.isOrgAdmin;
  const keys = orderFor(input.pathname, sectionsFor(caller));
  const searched = keys.map((k) => scopeWords(k, adminArea, caller.isAdmin));
  const terms = searchTerms(input.q);
  if (!terms) return { query: input.q, sections: [], searched };
  const units = adminArea ? await analyticsUnitIds(sql, caller) : [];
  const inUnits = (column: postgres.Fragment) =>
    units === null ? sql`true` : sql`${column} = any(${units}::uuid[])`;

  const run: Record<SectionKey, () => Promise<SearchHit[]>> = {
    pages: async () => matchPages(workspaceNavFor(caller), terms),

    records: async () => {
      const rows = await sql<
        {
          id: string;
          document_id: string | null;
          file_name: string | null;
          metric_name: string;
          org_unit_name: string;
          period_label: string;
          bill_number: string | null;
          approval_status: string;
        }[]
      >`
        select r.id, d.id as document_id, d.file_name, m.name as metric_name, o.name as org_unit_name,
               p.label as period_label, r.bill_number, r.approval_status::text
        from public.esg_records r
        join public.esg_metrics m on m.id = r.metric_id
        join public.org_units o on o.id = r.org_unit_id
        join public.reporting_periods p on p.id = r.reporting_period_id
        left join public.users u on u.id = r.submitted_by
        left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
        left join public.documents d on d.id = erd.document_id
        where ${adminArea ? inUnits(sql`r.org_unit_id`) : sql`r.submitted_by = ${caller.userId}`}
          and ${allWords(sql, terms, [
            sql`coalesce(d.file_name, '')`,
            sql`m.name`,
            sql`o.name`,
            sql`p.label`,
            sql`coalesce(r.bill_number, '')`,
            sql`coalesce(u.display_name, '')`,
          ])}
        order by r.created_at desc
        limit ${PER_SECTION}`;
      return rows.map((r) => ({
        title: r.file_name ?? r.metric_name,
        detail: [
          r.metric_name,
          r.org_unit_name,
          r.period_label,
          r.bill_number ? `bill ${r.bill_number}` : null,
          r.approval_status.replace(/_/g, " "),
        ]
          .filter(Boolean)
          .join(" · "),
        href: adminArea
          ? `/admin/audit-trail?record=${r.id}`
          : r.document_id
            ? `/app/verify/${r.document_id}`
            : "/app/submissions",
      }));
    },

    people: async () => {
      const rows = await sql<
        { email: string; display_name: string; employee_id: string | null; roles: string | null }[]
      >`
        select u.email, u.display_name, u.employee_id,
               (select string_agg(distinct rl.name || ' at ' || ou.name, ', ')
                from public.user_org_assignments a
                join public.roles rl on rl.id = a.role_id
                join public.org_units ou on ou.id = a.org_unit_id
                where a.user_id = u.id and a.revoked_at is null) as roles
        from public.users u
        where u.deleted_at is null
          and ${
            units === null
              ? sql`true`
              : sql`exists (select 1 from public.user_org_assignments a
                            where a.user_id = u.id and a.revoked_at is null
                              and a.org_unit_id = any(${units}::uuid[]))`
          }
          and ${allWords(sql, terms, [sql`u.display_name`, sql`u.email`, sql`coalesce(u.employee_id, '')`])}
        order by u.display_name
        limit ${PER_SECTION}`;
      return rows.map((r) => ({
        title: r.display_name,
        detail: [r.email, r.employee_id, r.roles].filter(Boolean).join(" · "),
        href: `/admin/users?q=${encodeURIComponent(r.email)}`,
      }));
    },

    units: async () => {
      const rows = await sql<
        {
          id: string;
          name: string;
          code: string | null;
          unit_type: string;
          parent: string | null;
          status: string;
        }[]
      >`
        select o.id, o.name, o.code, o.unit_type::text, parent.name as parent, o.status::text
        from public.org_units o
        left join public.org_units parent on parent.id = o.parent_id
        where o.deleted_at is null and ${inUnits(sql`o.id`)}
          and ${allWords(sql, terms, [sql`o.name`, sql`coalesce(o.code, '')`])}
        order by o.name
        limit ${PER_SECTION}`;
      return rows.map((r) => ({
        title: r.name,
        detail: [
          r.code,
          r.unit_type.replace(/_/g, " "),
          r.parent ? `under ${r.parent}` : null,
          r.status === "active" ? null : "inactive",
        ]
          .filter(Boolean)
          .join(" · "),
        href: `/admin/organization?node=${r.id}`,
      }));
    },

    reports: async () => {
      // A report's name is its template, its org unit and what it covers; matched on all three.
      const rows = await sql<
        {
          id: string;
          template: string;
          status: string;
          org_unit_name: string;
          period_label: string | null;
          financial_year: number | null;
          period_from: string | null;
          period_to: string | null;
        }[]
      >`
        select rr.id, rr.template, rr.status::text, o.name as org_unit_name, p.label as period_label,
               rr.financial_year, rr.period_from::text, rr.period_to::text
        from public.report_runs rr
        join public.org_units o on o.id = rr.org_unit_id
        left join public.reporting_periods p on p.id = rr.reporting_period_id
        where ${inUnits(sql`rr.org_unit_id`)}
        order by rr.requested_at desc
        limit 300`;
      return rows
        .map((r) => {
          const label = TEMPLATE_INFO[isTemplate(r.template) ? r.template : "brsr"].label;
          const coverage = coverageOf(r);
          return {
            r,
            label,
            coverage,
            text: `${label} ${r.org_unit_name} ${coverage}`.toLowerCase(),
          };
        })
        .filter((x) => terms.every((t) => x.text.includes(t)))
        .slice(0, PER_SECTION)
        .map(({ r, label, coverage }) => ({
          title: `${label} · ${coverage}`,
          detail: `${r.org_unit_name} · ${r.status}`,
          href: `/admin/reports/${r.id}`,
        }));
    },

    audit: async () => [
      {
        title: adminArea
          ? `Search the audit trail for “${input.q.trim()}”`
          : `Search your activity for “${input.q.trim()}”`,
        detail: adminArea ? "Audit Trail" : "My Activity",
        href: `${adminArea ? "/admin/audit-trail" : "/app/activity"}?q=${encodeURIComponent(input.q.trim())}`,
      },
    ],
  };

  const sections = await Promise.all(
    keys.map(async (key) => ({ key, label: SECTION_LABELS[key], hits: await run[key]() })),
  );
  return { query: input.q, sections: sections.filter((s) => s.hits.length > 0), searched };
}
