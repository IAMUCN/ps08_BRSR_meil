import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { AuditFilters, AuditTable } from "./audit-view";

export const metadata: Metadata = { title: "Audit Trail · TraceESG" };

type Params = Record<string, string | string[] | undefined>;
const one = (p: Params, k: string) =>
  typeof p[k] === "string" && p[k] ? (p[k] as string) : undefined;
const uuid = (v: string | undefined) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
const date = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

// 03_APP_FLOW.md §2.2 Audit Trail (.grill/phase-18-audit-security-decisions.md): the append-only log, and a
// record's complete history from upload to the reports that included it (?record=).
export default async function AuditTrailPage({ searchParams }: PageProps<"/admin/audit-trail">) {
  const [, caller, params] = await Promise.all([requireAdminSession(), api(), searchParams]);
  const recordId = uuid(one(params, "record"));

  if (recordId) {
    const history = await caller.audit.record({ recordId });
    return (
      <div className="max-w-7xl space-y-4">
        <PageHeader
          title="Audit Trail"
          description={`Complete history of ${history.record.fileName ?? "a record"} — ${history.record.metricName}, ${history.record.orgUnitName}, ${history.record.periodLabel}: upload, OCR, every field edit, verification, validation, calculation, approval, and the reports that included it.`}
          action={
            <Link
              href="/admin/audit-trail"
              className="text-sm font-medium underline underline-offset-2"
            >
              All events
            </Link>
          }
        />
        <section aria-labelledby="included-heading" className="rounded-md border bg-card p-3">
          <h2 id="included-heading" className="text-sm font-semibold">
            Included in reports
          </h2>
          {history.reports.length ? (
            <ul className="mt-1 space-y-1 text-sm">
              {history.reports.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/reports/${r.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    BRSR · {r.coverage}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    generated {new Date(r.generatedAt).toLocaleString("en-IN")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Not included in any report yet.</p>
          )}
        </section>
        <AuditTable events={history.events} />
      </div>
    );
  }

  const values = {
    user: uuid(one(params, "user")),
    event: one(params, "event"),
    entity: one(params, "entity"),
    id: uuid(one(params, "id")),
    from: date(one(params, "from")),
    to: date(one(params, "to")),
  };
  const beforeAt = one(params, "before_at");
  const beforeId = uuid(one(params, "before_id"));
  const [options, page] = await Promise.all([
    caller.audit.options(),
    caller.audit.query({
      userId: values.user,
      eventType: values.event,
      entityType: values.entity,
      entityId: values.id,
      from: values.from,
      to: values.to,
      before: beforeAt && beforeId ? { at: beforeAt, id: beforeId } : undefined,
    }),
  ]);
  const olderHref = page.next
    ? `/admin/audit-trail?${new URLSearchParams({
        ...Object.fromEntries(Object.entries(values).filter(([, v]) => v) as [string, string][]),
        before_at: page.next.at,
        before_id: page.next.id,
      }).toString()}`
    : null;

  return (
    <div className="max-w-7xl space-y-4">
      <PageHeader
        title="Audit Trail"
        description="Every material action in TraceESG, newest first. The log is append-only: the database refuses any change or removal of an entry."
      />
      <AuditFilters options={options} values={values} />
      <AuditTable events={page.events} />
      <div className="flex gap-4 text-sm">
        {beforeAt ? (
          <Link href="/admin/audit-trail" className="font-medium underline underline-offset-2">
            Newest events
          </Link>
        ) : null}
        {olderHref ? (
          <Link href={olderHref} className="font-medium underline underline-offset-2">
            Older events →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
