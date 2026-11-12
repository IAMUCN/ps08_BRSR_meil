// The role-wise dashboard's tile registry, visibility, multi-role merging and ordering
// (.grill/role-dashboard-decisions.md, Phase 2). Pure — no database, no server imports — so every rule is
// unit-tested. The server (lib/dashboard/loaders.ts, routers/dashboard.ts) supplies facts and data.
//
// Rules this file holds:
//   - A tile the person may not see is not returned at all (hide, never grey out).
//   - Visibility follows permissions and where the person holds them, never role names.
//   - A person with several roles gets the union of their tiles, each tile once, with the units where a role
//     that holds the tile's permission is assigned (not the union of every assignment).
//   - Order: overdue, then returned or rejected, then pending, then summaries.

/** 0 overdue, 1 returned or rejected, 2 pending, 3 information. */
export type Urgency = 0 | 1 | 2 | 3;

export const URGENCY_LABEL: Record<Urgency, string> = {
  0: "Overdue",
  1: "Returned or failed",
  2: "Pending",
  3: "Summary",
};

export type Requirement =
  /** Every signed-in person; the data is the person's own. */
  | { kind: "self" }
  | { kind: "super_admin" }
  /**
   * Held through an assignment. `adminArea` also asks for an administrator, for tiles that link to pages only
   * administrators may open.
   */
  | { kind: "permission"; permission: string; adminArea?: boolean };

export type TileDef = {
  id: string;
  title: string;
  requires: Requirement;
  /** Importance among tiles of the same urgency; lower first. */
  rank: number;
  /** "kpi" is a small figure card (the default); "wide" holds a chart or list and has its own heading. */
  size?: "kpi" | "wide";
};

/** The tiles built so far. Later phases add rows here and a loader in lib/dashboard/loaders.ts. */
export const TILES: TileDef[] = [
  { id: "period", title: "Reporting period", requires: { kind: "self" }, rank: 10 },
  { id: "system-health", title: "System health", requires: { kind: "super_admin" }, rank: 20 },
  {
    id: "approval-queue",
    title: "Pending approvals",
    requires: { kind: "permission", permission: "approval.decide" },
    rank: 30,
  },
  {
    id: "validation-review",
    title: "Flagged for review",
    requires: { kind: "permission", permission: "validation.review", adminArea: true },
    rank: 35,
  },
  {
    id: "missing-submissions",
    title: "Missing submissions",
    requires: { kind: "permission", permission: "monitoring.view" },
    rank: 40,
  },
  { id: "my-tasks", title: "Documents to verify", requires: { kind: "self" }, rank: 50 },
  { id: "returned", title: "Returned for correction", requires: { kind: "self" }, rank: 55 },
  { id: "notifications", title: "Unread notifications", requires: { kind: "self" }, rank: 90 },
  {
    id: "emissions",
    title: "Total emissions",
    requires: { kind: "permission", permission: "monitoring.view" },
    rank: 60,
  },
  {
    id: "structure",
    title: "Organisation",
    requires: { kind: "permission", permission: "monitoring.view" },
    rank: 65,
  },
  {
    id: "completion",
    title: "Reporting completion",
    requires: { kind: "permission", permission: "monitoring.view" },
    rank: 100,
    size: "wide",
  },
  {
    id: "emissions-overview",
    title: "Emissions overview",
    requires: { kind: "permission", permission: "monitoring.view" },
    rank: 110,
    size: "wide",
  },
  {
    id: "completion-by-level",
    title: "Reporting completion by level",
    requires: { kind: "permission", permission: "monitoring.view" },
    rank: 120,
    size: "wide",
  },
  {
    id: "hierarchy-status",
    title: "Organisational hierarchy and reporting status",
    requires: { kind: "permission", permission: "monitoring.view" },
    rank: 130,
    size: "wide",
  },
  {
    id: "unit-performance",
    title: "Performance by unit",
    requires: { kind: "permission", permission: "monitoring.view" },
    rank: 140,
    size: "wide",
  },
];

/** Every permission a tile names, for one lookup of where the person holds each. */
export const TILE_PERMISSIONS = [
  ...new Set(
    TILES.flatMap((t) => (t.requires.kind === "permission" ? [t.requires.permission] : [])),
  ),
];

// --- Who holds what, where ---------------------------------------------------------------------------------

/** One assignment whose role holds a permission. */
export type Grant = { permission: string; orgUnitId: string; atGroup: boolean };

export type Facts = {
  isAdmin: boolean;
  isOrgAdmin: boolean;
  /** Non-admins only: per permission, the units it covers (assigned units and everything beneath). */
  held: Record<string, { units: string[]; atGroup: boolean }>;
};

/**
 * Facts from the person's grants. `subtree` gives each assigned unit and everything beneath it (the server
 * reads it from org_unit_tree, so a unit shared under two parents is covered under both).
 */
export function buildFacts(input: {
  isAdmin: boolean;
  isOrgAdmin: boolean;
  grants: Grant[];
  subtree: Record<string, string[]>;
}): Facts {
  const held: Facts["held"] = {};
  for (const g of input.grants) {
    const entry = (held[g.permission] ??= { units: [], atGroup: false });
    entry.atGroup ||= g.atGroup;
    const covered = input.subtree[g.orgUnitId] ?? [g.orgUnitId];
    entry.units = [...new Set([...entry.units, ...covered])];
  }
  return { isAdmin: input.isAdmin, isOrgAdmin: input.isOrgAdmin, held };
}

/** What a tile's data covers. */
export type TileScope = { kind: "self" } | { kind: "all" } | { kind: "units"; units: string[] };

export type ResolvedTile = TileDef & { scope: TileScope };

/** The tiles this person sees, each once, with the scope its data may cover. */
export function visibleTiles(tiles: TileDef[], facts: Facts): ResolvedTile[] {
  const out: ResolvedTile[] = [];
  const seen = new Set<string>();
  for (const tile of tiles) {
    if (seen.has(tile.id)) continue;
    const scope = scopeFor(tile.requires, facts);
    if (!scope) continue;
    seen.add(tile.id);
    out.push({ ...tile, scope });
  }
  return out;
}

function scopeFor(requires: Requirement, facts: Facts): TileScope | null {
  switch (requires.kind) {
    case "self":
      return { kind: "self" };
    case "super_admin":
      return facts.isAdmin ? { kind: "all" } : null;
    case "permission": {
      if (requires.adminArea && !facts.isAdmin && !facts.isOrgAdmin) return null;
      if (facts.isAdmin) return { kind: "all" };
      const held = facts.held[requires.permission];
      return held && held.units.length > 0 ? { kind: "units", units: held.units } : null;
    }
  }
}

// --- Data and ordering -------------------------------------------------------------------------------------

export type TileData = {
  id: string;
  title: string;
  urgency: Urgency;
  /** The number the tile is about, when it has one; 0 means nothing to do. */
  count: number | null;
  summary: string;
  href: string;
  /** Said on the tile so nobody wonders why two tiles show different units. */
  scopeLabel: string;
  figures?: { label: string; value: number | null; unit?: string }[];
  size?: "kpi" | "wide";
  /** A picture or list of the figures, drawn by components/dashboard/tile-charts. The summary says the same in words. */
  chart?: TileChart;
};

export type TileChart =
  | { kind: "radials"; items: { label: string; value: number | null }[] }
  | {
      kind: "emissions";
      unit: string;
      total: number;
      periodLabel: string;
      slices: { key: string; label: string; value: number; href?: string }[];
      trend: { categories: string[]; values: number[] };
    }
  | {
      kind: "levels";
      items: { key: string; label: string; done: number; total: number; pct: number | null }[];
    }
  | {
      kind: "hierarchy";
      rows: {
        id: string;
        name: string;
        level: string;
        depth: 0 | 1;
        done: number;
        total: number;
        pct: number | null;
        href: string;
      }[];
      more: number;
    }
  | {
      kind: "units";
      unit: string;
      rows: {
        id: string;
        name: string;
        level: string;
        pct: number | null;
        done: number;
        total: number;
        emissions: number;
        href: string;
      }[];
    }
  /** A short list of label and number pairs (units by level). */
  | { kind: "stats"; items: { label: string; value: number }[] };

/**
 * Splits the data into the "Needs action" band (something overdue, returned or pending, with a count above
 * zero) and the rest, each ordered by urgency, then the tile's rank, then its id. The grid does not reorder
 * with counts: its tiles keep the registry's order.
 */
export function arrange(data: TileData[], tiles: TileDef[]) {
  const rank = new Map(tiles.map((t) => [t.id, t.rank]));
  const byRank = (a: TileData, b: TileData) =>
    (rank.get(a.id) ?? 1000) - (rank.get(b.id) ?? 1000) || a.id.localeCompare(b.id);
  const needsAction = (d: TileData) => d.urgency < 3 && (d.count ?? 0) > 0;
  const band = data.filter(needsAction).sort((a, b) => a.urgency - b.urgency || byRank(a, b));
  const grid = data.filter((d) => !needsAction(d)).sort(byRank);
  return { band, grid };
}

/** Runs `fn` over `items` with at most `limit` in flight (the host's connection pool is small). */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
