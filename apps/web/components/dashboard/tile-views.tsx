import Link from "next/link";
import { cn } from "cn";
import { formatNumber } from "@/lib/charts/geometry";
import { URGENCY_LABEL, type TileData } from "@/lib/dashboard/tiles";
import { TileChartView } from "./tile-charts";

// The role-wise dashboard's tiles. Small figure cards ("kpi") are one link to the page they count; "wide"
// tiles hold a chart or a list, have their own heading and a "View all" link, and always say in words what the
// picture shows. Layout follows the reference the owner gave: a row of figures, then analysis cards.

const TONE: Record<TileData["urgency"], string> = {
  0: "text-status-error",
  1: "text-status-error",
  2: "text-status-warning",
  3: "text-muted-foreground",
};

const FOCUS = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function Tile({ tile, showUrgency }: { tile: TileData; showUrgency: boolean }) {
  return (
    <li>
      <Link
        href={tile.href}
        className={cn(
          "block h-full rounded-md border bg-card p-4 transition-colors hover:bg-muted",
          FOCUS,
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm leading-5 font-semibold">{tile.title}</h3>
          {showUrgency ? (
            <span className={cn("text-xs font-medium", TONE[tile.urgency])}>
              {URGENCY_LABEL[tile.urgency]}
            </span>
          ) : null}
        </div>
        {tile.count !== null ? (
          <p className="mt-2 font-mono text-2xl leading-8 font-semibold tabular-nums">
            {formatNumber(tile.count)}
          </p>
        ) : null}
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{tile.summary}</p>
        {tile.chart ? <TileChartView chart={tile.chart} /> : null}
        {tile.scopeLabel ? (
          <p className="mt-2 text-xs leading-4 text-muted-foreground">Scope: {tile.scopeLabel}</p>
        ) : null}
      </Link>
    </li>
  );
}

function WideTile({ tile }: { tile: TileData }) {
  return (
    <li>
      <article className="h-full rounded-md border bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-base leading-6 font-semibold">{tile.title}</h3>
          <Link
            href={tile.href}
            className={cn(
              "shrink-0 rounded-sm text-sm text-primary-text underline-offset-2 hover:underline",
              FOCUS,
            )}
          >
            View all<span className="sr-only"> for {tile.title}</span> →
          </Link>
        </div>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{tile.summary}</p>
        {tile.chart ? <TileChartView chart={tile.chart} /> : null}
        {tile.scopeLabel ? (
          <p className="mt-3 text-xs leading-4 text-muted-foreground">Scope: {tile.scopeLabel}</p>
        ) : null}
      </article>
    </li>
  );
}

/** Overdue, then returned, then pending; collapses to one line when nothing needs action. */
export function NeedsActionBand({ tiles }: { tiles: TileData[] }) {
  if (tiles.length === 0) {
    return (
      <p
        role="status"
        className="rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground"
      >
        Nothing needs your attention.
      </p>
    );
  }
  return (
    <section aria-labelledby="needs-action-heading" className="space-y-2">
      <h2 id="needs-action-heading" className="text-base leading-6 font-semibold">
        Needs your attention
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => (
          <Tile key={tile.id} tile={tile} showUrgency />
        ))}
      </ul>
    </section>
  );
}

export function TileGrid({ tiles }: { tiles: TileData[] }) {
  if (tiles.length === 0) return null;
  const figures = tiles.filter((t) => t.size !== "wide");
  const analysis = tiles.filter((t) => t.size === "wide");
  return (
    <>
      {figures.length > 0 ? (
        <section aria-labelledby="overview-heading" className="space-y-2">
          <h2 id="overview-heading" className="text-base leading-6 font-semibold">
            Overview
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {figures.map((tile) => (
              <Tile key={tile.id} tile={tile} showUrgency={false} />
            ))}
          </ul>
        </section>
      ) : null}
      {analysis.length > 0 ? (
        <section aria-labelledby="analysis-heading" className="space-y-2">
          <h2 id="analysis-heading" className="text-base leading-6 font-semibold">
            Analysis
          </h2>
          <ul className="grid gap-3 xl:grid-cols-2">
            {analysis.map((tile) => (
              <WideTile key={tile.id} tile={tile} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
