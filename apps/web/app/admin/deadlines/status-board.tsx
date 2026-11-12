"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { BoardItem } from "@/lib/deadlines/board";
import { STATUS_TEXT } from "@/lib/reminders/plan";
import type { StatusBoard } from "@/lib/trpc/routers/deadlines";

// Who is behind, unit by unit, for one reporting period (deadline escalation, phase 2). Each unit shows its own
// figures and everything beneath it; its own expected submissions open underneath, with the owners' names.

const dueText = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function itemState(item: BoardItem): { label: string; tone: StatusTone } {
  if (item.status === "approved") return { label: "Approved", tone: "success" };
  const base = item.status === "missing" ? "Not started" : STATUS_TEXT[item.status];
  const label = item.daysLate > 0 ? `${base} · ${item.daysLate}d late` : base;
  return {
    label: label.charAt(0).toUpperCase() + label.slice(1),
    tone: item.daysLate > 0 ? "error" : item.status === "missing" ? "warning" : "neutral",
  };
}

export function StatusBoardView({ board }: { board: StatusBoard }) {
  const router = useRouter();
  const { rows, periods, periodId, dueDate } = board;

  return (
    <section className="space-y-4 rounded-md border bg-card p-4" aria-labelledby="board-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="board-heading" className="text-base font-semibold">
            Submission status by unit
          </h2>
          <p className="text-sm text-muted-foreground">
            What each unit under your care has submitted, and who is behind
            {dueDate ? `. Due ${dueText(dueDate)}.` : "."}
          </p>
        </div>
        {periods.length > 0 ? (
          <div className="flex items-center gap-2">
            <label htmlFor="board-period" className="text-sm text-muted-foreground">
              Period
            </label>
            <NativeSelect
              id="board-period"
              value={periodId ?? ""}
              onChange={(e) => router.push(`?period=${e.target.value}`, { scroll: false })}
              className="h-9 w-auto min-w-44"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.open ? "" : " (closed)"}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing is expected from the units under your care in this period.
        </p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => {
            const pct = Math.round((row.approved / row.total) * 100);
            const summary = (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="min-w-0 flex-1 basis-48 text-sm leading-5">
                  <span className={row.depth === 0 ? "font-semibold" : "font-medium"}>
                    {row.name}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">{row.level}</span>
                </span>
                <span className="w-40 shrink-0">
                  <span className="block font-mono text-xs tabular-nums text-muted-foreground">
                    {row.approved} of {row.total} approved
                  </span>
                  <span
                    className="mt-1 block h-1.5 overflow-hidden rounded-sm bg-muted"
                    aria-hidden
                  >
                    <span
                      className="block h-full rounded-sm bg-status-success"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {row.overdue > 0 ? (
                    <StatusBadge tone="error">{`${row.overdue} overdue`}</StatusBadge>
                  ) : null}
                  {row.missing > 0 ? (
                    <StatusBadge tone="warning">{`${row.missing} not started`}</StatusBadge>
                  ) : null}
                  {row.inProgress > 0 ? (
                    <StatusBadge tone="neutral">{`${row.inProgress} on file`}</StatusBadge>
                  ) : null}
                  {row.overdue === 0 && row.missing === 0 && row.inProgress === 0 ? (
                    <StatusBadge tone="success">All approved</StatusBadge>
                  ) : null}
                </span>
              </div>
            );
            return (
              <li key={row.id} className="py-2" style={{ paddingLeft: `${row.depth * 20}px` }}>
                {row.items.length > 0 ? (
                  <details>
                    <summary className="cursor-pointer rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      {summary}
                    </summary>
                    <ul className="mt-2 divide-y divide-border rounded-sm border bg-surface">
                      {row.items.map((item) => {
                        const state = itemState(item);
                        return (
                          <li
                            key={item.id}
                            className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 py-2"
                          >
                            <span className="min-w-0 flex-1 basis-48">
                              <span className="block text-sm leading-5">{item.metric}</span>
                              <span className="block text-xs leading-4 text-muted-foreground">
                                {item.category} ·{" "}
                                {item.owners.length ? item.owners.join(", ") : "no one assigned"}
                              </span>
                            </span>
                            <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                ) : (
                  summary
                )}
                {row.behind.length > 0 ? (
                  <p className="mt-1 text-xs leading-4 text-muted-foreground">
                    Behind: {row.behind.slice(0, 6).join(", ")}
                    {row.behind.length > 6 ? ` and ${row.behind.length - 6} more` : ""}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
