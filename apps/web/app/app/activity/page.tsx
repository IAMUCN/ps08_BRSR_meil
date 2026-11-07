import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { AuditFilters, AuditTable } from "@/app/admin/audit-trail/audit-view";
import { requireAppSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "My Activity · EmeilSG" };

type Params = Record<string, string | string[] | undefined>;
const one = (p: Params, k: string) =>
  typeof p[k] === "string" && p[k] ? (p[k] as string) : undefined;
const date = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const uuid = (v: string | undefined) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

// "My logs" (feature_enhancement.md Phase 4, requirement 29): everyone's own entries in the audit log, with
// the search bar and date and action filters. The procedure limits it to the caller's own entries.
export default async function MyActivityPage({ searchParams }: PageProps<"/app/activity">) {
  const [, caller, params] = await Promise.all([requireAppSession(), api(), searchParams]);
  const values = {
    event: one(params, "event"),
    from: date(one(params, "from")),
    to: date(one(params, "to")),
    q: one(params, "q")?.slice(0, 100),
  };
  const beforeAt = one(params, "before_at");
  const beforeId = uuid(one(params, "before_id"));
  const [options, page] = await Promise.all([
    caller.audit.options(),
    caller.audit.query({
      mine: true,
      eventType: values.event,
      from: values.from,
      to: values.to,
      q: values.q,
      before: beforeAt && beforeId ? { at: beforeAt, id: beforeId } : undefined,
    }),
  ]);
  const olderHref = page.next
    ? `/app/activity?${new URLSearchParams({
        ...Object.fromEntries(Object.entries(values).filter(([, v]) => v) as [string, string][]),
        before_at: page.next.at,
        before_id: page.next.id,
      }).toString()}`
    : null;

  return (
    <div className="max-w-7xl space-y-4">
      <PageHeader
        title="My Activity"
        description="Everything you have done in EmeilSG, newest first: uploads, edits, confirmations, approvals, sign-ins and settings. Kept for audit; nobody can change or remove an entry."
      />
      <AuditFilters
        options={{ ...options, users: [], entityTypes: [], reach: "own" }}
        values={values}
        compact
      />
      <AuditTable events={page.events} />
      <div className="flex gap-4 text-sm">
        {beforeAt ? (
          <Link href="/app/activity" className="font-medium underline underline-offset-2">
            Newest
          </Link>
        ) : null}
        {olderHref ? (
          <Link href={olderHref} className="font-medium underline underline-offset-2">
            Older →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
