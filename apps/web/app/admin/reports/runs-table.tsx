import Link from "next/link";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { TEMPLATE_INFO } from "@/lib/reports/templates";
import type { ReportRunRow } from "@/lib/trpc/routers/reports";

const STATUS: Record<string, { tone: StatusTone; label: string }> = {
  pending: { tone: "neutral", label: "Queued" },
  generating: { tone: "warning", label: "Generating" },
  completed: { tone: "success", label: "Ready" },
  failed: { tone: "error", label: "Failed" },
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

/** Report runs, newest first: every run is kept, successful or failed (03_APP_FLOW.md §4.10). */
export function RunsTable({ runs }: { runs: ReportRunRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-table-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-table-header text-table-header-foreground">
          <tr>
            {["Report", "Scope", "Requested", "Status", ""].map((h, i) => (
              <th
                key={i}
                scope="col"
                className="px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
              >
                {h || <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-t border-table-border bg-table-row align-top">
              <td className="px-3 py-2.5 font-medium">
                {TEMPLATE_INFO[r.template].label}
                <span className="block text-xs font-normal text-muted-foreground">
                  {r.coverage}
                </span>
              </td>
              <td className="px-3 py-2.5">{r.orgUnitName}</td>
              <td className="px-3 py-2.5">
                {when(r.requestedAt)}
                <span className="block text-xs text-muted-foreground">{r.requestedBy}</span>
              </td>
              <td className="max-w-md px-3 py-2.5">
                <StatusBadge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusBadge>
                {r.error ? <p className="mt-1 text-xs text-status-error">{r.error}</p> : null}
              </td>
              <td className="space-x-3 px-3 py-2.5 text-right whitespace-nowrap">
                {r.status === "completed" ? (
                  <>
                    <Link
                      href={`/admin/reports/${r.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      Open
                    </Link>
                    <a
                      href={`/api/reports/${r.id}/file`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      Download PDF
                    </a>
                    {r.hasWorkbook ? (
                      <a
                        href={`/api/reports/${r.id}/file?format=xlsx`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        Excel
                      </a>
                    ) : null}
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
