"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { DemoRequest } from "@/lib/trpc/routers/demo-requests";
import { setContactedAction } from "./actions";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });

export function DemoRequestsTable({ rows }: { rows: DemoRequest[] }) {
  const [pending, start] = useTransition();
  const open = rows.filter((r) => !r.contactedAt).length;

  function mark(id: string, contacted: boolean) {
    start(async () => {
      const result = await setContactedAction({ id, contacted });
      if (!result.ok) toast.error(result.error);
    });
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-md border bg-card px-4 py-6 text-sm text-muted-foreground">
        No demo requests yet. They appear here when someone sends the form on the landing page.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {rows.length} request(s), {open} not contacted yet.
      </p>
      <div className="overflow-x-auto rounded-md border border-table-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-table-header text-table-header-foreground">
            <tr>
              {["Received", "Name", "Email", "Phone", "Status", ""].map((h) => (
                <th
                  key={h || "action"}
                  scope="col"
                  className="px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
                >
                  {h || <span className="sr-only">Action</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-table-border bg-table-row even:bg-table-row-alt"
              >
                <td className="px-3 py-2.5 whitespace-nowrap">{when(r.createdAt)}</td>
                <td className="px-3 py-2.5 font-medium">{r.name}</td>
                <td className="px-3 py-2.5">
                  <a href={`mailto:${r.email}`} className="underline-offset-2 hover:underline">
                    {r.email}
                  </a>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <a
                    href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {r.phone}
                  </a>
                </td>
                <td className="px-3 py-2.5">
                  {r.contactedAt ? (
                    <>
                      <StatusBadge tone="success">Contacted</StatusBadge>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {r.contactedBy ?? "Someone"}, {when(r.contactedAt)}
                      </span>
                    </>
                  ) : (
                    <StatusBadge tone="warning">New</StatusBadge>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => mark(r.id, !r.contactedAt)}
                  >
                    {r.contactedAt ? "Mark as new" : "Mark contacted"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
