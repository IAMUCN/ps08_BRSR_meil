"use client";

import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { csvSafeText } from "@/lib/csv";
import type { AuditEvent } from "@/lib/trpc/routers/audit";

// Audit Trail (03_APP_FLOW.md §2.2): filter by user, record, action and date range; each event expands in
// place to its before/after values. Filters live in the URL.

export type AuditFilterValues = Record<string, string | undefined>;

export function AuditFilters({
  options,
  values,
  compact = false,
}: {
  options: {
    users: { id: string; name: string }[];
    eventTypes: string[];
    entityTypes: string[];
    roles?: { code: string; name: string }[];
    reach?: "all" | "units" | "own";
  };
  values: AuditFilterValues;
  /** My Activity: search, action and dates only (the entries are all the caller's own). */
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [form, setForm] = useState(values);
  const field = (key: string) => ({
    value: form[key] ?? "",
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(form))
      if (v && k !== "before_at" && k !== "before_id") next.set(k, v);
    router.push(`${pathname}?${next.toString()}`);
  }

  const label = "flex flex-col gap-1 text-xs text-muted-foreground";
  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3"
    >
      {/* The search bar (Phase 4, requirement 12): action, person, reason and values. */}
      <label className={`${label} min-w-56 flex-1`}>
        Search
        <Input type="search" placeholder="e.g. approved diesel, a name" {...field("q")} />
      </label>
      {options.reach !== "own" ? (
        <label className={label}>
          Show
          <NativeSelect {...field("mine")}>
            <option value="">
              {options.reach === "units" ? "Everything I may see" : "Everyone"}
            </option>
            <option value="1">Only my activity</option>
          </NativeSelect>
        </label>
      ) : null}
      {options.roles?.length && options.reach !== "own" ? (
        <label className={label}>
          Role
          <NativeSelect {...field("role")}>
            <option value="">Any role</option>
            {options.roles.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
        </label>
      ) : null}
      {compact ? null : (
        <label className={label}>
          User
          <NativeSelect {...field("user")}>
            <option value="">Anyone (incl. system)</option>
            {options.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      <label className={label}>
        Action
        <NativeSelect {...field("event")}>
          <option value="">Any action</option>
          {options.eventTypes.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </NativeSelect>
      </label>
      {compact ? null : (
        <>
          <label className={label}>
            Record type
            <NativeSelect {...field("entity")}>
              <option value="">Any</option>
              {options.entityTypes.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className={label}>
            Record id
            <Input
              placeholder="uuid"
              className="w-72 max-w-[calc(100vw-7rem)] font-mono text-xs"
              {...field("id")}
            />
          </label>
        </>
      )}
      <label className={label}>
        From
        <Input type="date" {...field("from")} />
      </label>
      <label className={label}>
        To
        <Input type="date" {...field("to")} />
      </label>
      <Button type="submit">Apply</Button>
    </form>
  );
}

const csvCell = (v: unknown) => {
  const text = csvSafeText(
    v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v),
  );
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function exportCsv(events: AuditEvent[]) {
  const header = [
    "When",
    "Action",
    "Record type",
    "Record id",
    "By",
    "Before",
    "After",
    "Reason",
    "Address",
    "Browser",
    "Session",
  ];
  const lines = events.map((e) =>
    [
      e.at,
      e.event,
      e.entityType,
      e.entityId,
      e.who ? `${e.who}${e.whoRoles ? ` (${e.whoRoles})` : ""}` : "system",
      e.oldValue,
      e.newValue,
      e.reason,
      e.ipAddress,
      e.userAgent,
      e.sessionId,
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "audit-log.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

const pretty = (v: unknown) => (v === null || v === undefined ? "—" : JSON.stringify(v, null, 2));

export function AuditTable({ events }: { events: AuditEvent[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{events.length} event(s) shown</p>
        <Button
          variant="outline"
          size="sm"
          disabled={events.length === 0}
          onClick={() => exportCsv(events)}
        >
          <Download aria-hidden />
          Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-table-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-table-header text-table-header-foreground">
            <tr>
              {["When", "Action", "Record", "By", "Reason"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-muted-foreground">
                  No events match these filters.
                </td>
              </tr>
            ) : null}
            {events.map((e) => {
              const expanded = open === e.id;
              return (
                <Fragment key={e.id}>
                  <tr className="border-t border-table-border bg-table-row align-top">
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                      {new Date(e.at).toLocaleString("en-IN")}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        className="flex min-h-6 items-center gap-1 font-medium"
                        onClick={() => setOpen(expanded ? null : e.id)}
                      >
                        {expanded ? (
                          <ChevronDown className="size-4" aria-hidden />
                        ) : (
                          <ChevronRight className="size-4" aria-hidden />
                        )}
                        {e.event}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {e.entityType}
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {e.entityId}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {e.who ?? "System"}
                      {e.whoRoles ? (
                        <span className="block text-xs text-muted-foreground">{e.whoRoles}</span>
                      ) : null}
                    </td>
                    <td className="max-w-xs px-3 py-2 text-xs">{e.reason ?? "—"}</td>
                  </tr>
                  {expanded ? (
                    <tr className="border-t border-table-border bg-muted/30">
                      <td colSpan={5} className="px-3 py-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          {(
                            [
                              ["Before", e.oldValue],
                              ["After", e.newValue],
                            ] as const
                          ).map(([title, value]) => (
                            <div key={title}>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">
                                {title}
                              </p>
                              <pre className="max-h-64 overflow-auto rounded-sm border bg-card p-2 font-mono text-[11px] whitespace-pre-wrap">
                                {pretty(value)}
                              </pre>
                            </div>
                          ))}
                        </div>
                        {e.ipAddress || e.userAgent || e.sessionId ? (
                          <p className="mt-2 text-xs break-all text-muted-foreground">
                            From {e.ipAddress ?? "an unknown address"}
                            {e.sessionId ? ` · session ${e.sessionId}` : ""}
                            {e.userAgent ? ` · ${e.userAgent}` : ""}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
