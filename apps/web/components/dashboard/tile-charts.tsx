import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { DonutChart } from "@/components/charts/donut";
import { seriesColor } from "@/components/charts/frame";
import { LineChart } from "@/components/charts/line";
import { RadialChart } from "@/components/charts/radial";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatNumber } from "@/lib/charts/geometry";
import type { TileChart } from "@/lib/dashboard/tiles";
import { cn } from "cn";

// What a tile draws beside its words (role-wise dashboard, Phase 4). Every picture here has its figures in
// text next to it: a ring carries its percentage and "x of y", a bar its number, a donut its legend and table.

const doneText = (done: number, total: number, pct: number | null) =>
  pct === null ? "Nothing expected" : `${pct} % · ${done} of ${total}`;

function Bar({ pct, index = 0 }: { pct: number | null; index?: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-sm bg-muted" aria-hidden>
      <div
        className="h-full rounded-sm"
        style={{ width: `${pct ?? 0}%`, background: seriesColor(index) }}
      />
    </div>
  );
}

export function TileChartView({ chart }: { chart: TileChart }) {
  switch (chart.kind) {
    case "radials":
      return (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {chart.items.map((item, i) => (
            <li key={item.label} className="flex flex-col items-center gap-1">
              <RadialChart value={item.value} label={item.label} index={i} />
              <span className="text-xs leading-4 text-muted-foreground">{item.label}</span>
            </li>
          ))}
        </ul>
      );

    case "levels":
      return (
        <ul className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {chart.items.map((item, i) => (
            <li key={item.key} className="flex flex-col items-center gap-1 text-center">
              <RadialChart value={item.pct} label={item.label} index={i} />
              <span className="text-sm leading-5 font-medium">{item.label}</span>
              <span className="font-mono text-xs leading-4 text-muted-foreground">
                {item.done} / {item.total}
              </span>
            </li>
          ))}
        </ul>
      );

    case "emissions":
      return (
        <div className="mt-3 grid gap-6 md:grid-cols-2">
          <DonutChart
            title="Share by scope"
            description={chart.periodLabel || undefined}
            slices={chart.slices}
            unit={chart.unit}
            centreLabel={chart.unit}
            empty="No approved emissions yet."
          />
          <LineChart
            title="Emissions trend"
            description="Approved, all three scopes, latest periods"
            categories={chart.trend.categories}
            series={[{ key: "total", label: "Total", values: chart.trend.values }]}
            unit={chart.unit}
            empty="Needs approved emissions in at least one period."
          />
        </div>
      );

    case "hierarchy":
      return (
        <div className="mt-3">
          <ul className="divide-y">
            {chart.rows.map((row) => (
              <li key={row.id} className={cn("py-2", row.depth === 1 && "pl-6")}>
                <Link
                  href={row.href}
                  className="block rounded-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm leading-5">
                    <span className={cn("min-w-0 truncate", row.depth === 0 && "font-semibold")}>
                      {row.name}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {row.level}
                      </span>
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {doneText(row.done, row.total, row.pct)}
                    </span>
                  </div>
                  <div className="mt-1">
                    <Bar pct={row.pct} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {chart.more > 0 ? (
            <p className="mt-2 text-xs leading-4 text-muted-foreground">
              {chart.more} more not shown. Open the monitoring page for the full list.
            </p>
          ) : null}
        </div>
      );

    case "units":
      return chart.rows.length === 0 ? null : (
        <ul className="mt-3 space-y-3">
          {chart.rows.map((row) => (
            <li key={row.id}>
              <Link
                href={row.href}
                className="block rounded-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm leading-5">
                  <span className="min-w-0 truncate">
                    {row.name}
                    <span className="ml-2 text-xs text-muted-foreground">{row.level}</span>
                  </span>
                  <span className="font-mono text-xs tabular-nums">
                    {formatNumber(row.emissions)} {chart.unit}
                  </span>
                </div>
                <div className="mt-1">
                  <Bar pct={row.pct} index={1} />
                </div>
                <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                  Completion: {doneText(row.done, row.total, row.pct)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      );

    case "expected":
      return (
        <div className="mt-3 grid gap-6 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {chart.units.map((unit) => {
            const percentDone =
              unit.total > 0 ? Math.round((unit.submitted / unit.total) * 100) : 0;
            return (
              <section key={unit.id} aria-label={`Expected submissions, ${unit.name}`}>
                <h4 className="text-sm leading-5 font-semibold">{unit.name}</h4>
                <p className="text-xs leading-4 text-muted-foreground">{chart.periodLabel}</p>
                <p className="mt-2 text-sm leading-5">
                  <span className="font-semibold">
                    {unit.submitted} of {unit.total}
                  </span>{" "}
                  submitted
                </p>
                <div
                  role="progressbar"
                  aria-label={`Expected submissions submitted, ${unit.name}`}
                  aria-valuemin={0}
                  aria-valuemax={unit.total}
                  aria-valuenow={unit.submitted}
                  className="mt-1 h-2 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-status-success"
                    style={{ width: `${percentDone}%` }}
                  />
                </div>
                <ul className="mt-2 divide-y divide-border">
                  {unit.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 py-2">
                      <span className="flex min-w-0 items-start gap-2">
                        {item.submitted ? (
                          <CheckCircle2
                            className="mt-0.5 size-4 shrink-0 text-status-success"
                            aria-label="Submitted"
                          />
                        ) : (
                          <Circle
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                            aria-label="Not submitted"
                          />
                        )}
                        <span className="min-w-0">
                          <span className="block text-sm leading-5">{item.name}</span>
                          <span className="block text-xs leading-4 text-muted-foreground">
                            {item.detail}
                          </span>
                        </span>
                      </span>
                      {item.stage ? (
                        <StatusBadge tone={item.stage.tone}>{item.stage.label}</StatusBadge>
                      ) : (
                        <span className="shrink-0 text-xs leading-6 text-muted-foreground">
                          Not submitted
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {unit.notShown > 0 ? (
                  <p className="mt-1 text-xs leading-4 text-muted-foreground">
                    {unit.notShown} more on the Upload page.
                  </p>
                ) : null}
              </section>
            );
          })}
          {chart.moreUnits > 0 ? (
            <p className="text-xs leading-4 text-muted-foreground">
              {chart.moreUnits} more unit{chart.moreUnits === 1 ? "" : "s"} on the Upload page.
            </p>
          ) : null}
        </div>
      );

    case "area":
      return (
        <div className="mx-auto mt-3 max-w-xs">
          <DonutChart
            title="Records by state"
            slices={chart.slices}
            centreLabel="records"
            empty="No records in your area yet."
          />
        </div>
      );

    case "list":
      return (
        <div className="mt-2">
          <ul className="divide-y text-sm leading-5">
            {chart.rows.map((row, i) => (
              <li
                key={`${row.label}-${i}`}
                className="flex items-baseline justify-between gap-3 py-1.5"
              >
                <span className="min-w-0 truncate">{row.label}</span>
                {row.detail ? (
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      row.tone === "error" && "text-status-error",
                      row.tone === "warning" && "text-status-warning",
                      !row.tone && "text-muted-foreground",
                    )}
                  >
                    {row.detail}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {chart.more > 0 ? (
            <p className="mt-1 text-xs leading-4 text-muted-foreground">
              {chart.more} more not shown.
            </p>
          ) : null}
        </div>
      );

    case "readiness":
      return (
        <ul className="mt-3 space-y-4">
          {chart.units.map((u, i) => (
            <li key={u.id} className="flex flex-wrap items-center gap-4">
              <div className="w-24 shrink-0">
                <RadialChart value={u.value} label={`${u.name} readiness`} index={i} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-5 font-medium">{u.name}</p>
                <dl className="mt-1 space-y-0.5 text-xs leading-4">
                  {u.parts.map((part) => (
                    <div key={part.label} className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{part.label}</dt>
                      <dd className="font-mono tabular-nums">
                        {part.value === null ? "—" : `${part.value} %`}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </li>
          ))}
        </ul>
      );

    case "stats":
      return chart.items.length === 0 ? null : (
        <dl className="mt-2 space-y-0.5 text-xs leading-4">
          {chart.items.map((item) => (
            <div key={item.label} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="font-mono tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
      );
  }
}
