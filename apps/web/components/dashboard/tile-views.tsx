import Link from "next/link";
import { cn } from "cn";
import { URGENCY_LABEL, type TileData } from "@/lib/dashboard/tiles";

// The role-wise dashboard's tiles (Phase 2). Plain cards for now: the chart kit and role-specific layouts come
// in the next phases, and the existing dashboard content stays below until they replace it.

const TONE: Record<TileData["urgency"], string> = {
  0: "text-status-error",
  1: "text-status-error",
  2: "text-status-warning",
  3: "text-muted-foreground",
};

function Tile({ tile, showUrgency }: { tile: TileData; showUrgency: boolean }) {
  return (
    <li>
      <Link
        href={tile.href}
        className="block h-full rounded-md border bg-card p-4 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
            {tile.count}
          </p>
        ) : null}
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{tile.summary}</p>
        {tile.scopeLabel ? (
          <p className="mt-2 text-xs leading-4 text-muted-foreground">Scope: {tile.scopeLabel}</p>
        ) : null}
      </Link>
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
  return (
    <section aria-labelledby="overview-heading" className="space-y-2">
      <h2 id="overview-heading" className="text-base leading-6 font-semibold">
        Overview
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => (
          <Tile key={tile.id} tile={tile} showUrgency={false} />
        ))}
      </ul>
    </section>
  );
}
