// Organization tree rules (.grill/phase-4-admin-foundation-decisions.md). Pure — unit-testable.

// The levels themselves are configuration (migration 0037, `org_levels`): every rule takes the level list
// the server loaded, in order. Nothing here knows a level's name except the root.

/** One hierarchy level, as configured. A child's level must come after its parent's. */
export type OrgLevel = { code: string; label: string; order: number };

/** A level's code. Whatever is configured — not a fixed list. */
export type OrgUnitType = string;

/** The one level the app knows by name: the root, where the Admin role lives. */
export const ROOT_LEVEL = "group";

const orderOf = (levels: readonly OrgLevel[], code: string) =>
  levels.find((l) => l.code === code)?.order;

/** How a level reads on screen; its code if the level is unknown. */
export const levelLabel = (levels: readonly OrgLevel[], code: string) =>
  levels.find((l) => l.code === code)?.label ?? code;

/**
 * MEIL's structure (owner's request, 2026-11-12): business units sit directly under a subsidiary, one
 * subsidiary each, and projects sit under business units. Keyed on the level codes seeded in migration 0037
 * (a level's code never changes); a rule applies only while both of its levels exist.
 */
export const BUSINESS_UNIT_LEVEL = "business_unit";
export const SUBSIDIARY_LEVEL = "subsidiary";
export const PROJECT_LEVEL = "project";

/** Levels whose units belong to one parent only: no "also under" (owner's request, 2026-11-12). */
export const singleParent = (unitType: OrgUnitType) => unitType === BUSINESS_UNIT_LEVEL;

/** Why MEIL's structure refuses this placement, or null when it allows it. Level order is checked apart. */
export function structureProblem(
  levels: readonly OrgLevel[],
  parentType: OrgUnitType,
  childType: OrgUnitType,
): string | null {
  const has = (code: string) => levels.some((l) => l.code === code);
  if (
    childType === BUSINESS_UNIT_LEVEL &&
    has(SUBSIDIARY_LEVEL) &&
    parentType !== SUBSIDIARY_LEVEL
  ) {
    return `A ${levelLabel(levels, BUSINESS_UNIT_LEVEL)} sits directly under a ${levelLabel(levels, SUBSIDIARY_LEVEL)}.`;
  }
  const parent = orderOf(levels, parentType);
  const unit = orderOf(levels, BUSINESS_UNIT_LEVEL);
  if (childType === PROJECT_LEVEL && unit !== undefined && parent !== undefined && parent < unit) {
    return `A ${levelLabel(levels, PROJECT_LEVEL)} sits under a ${levelLabel(levels, BUSINESS_UNIT_LEVEL)}, not directly under a ${levelLabel(levels, parentType)}.`;
  }
  return null;
}

/** Skip levels, never invert: a child's level must come strictly later than its parent's; and MEIL's structure. */
export function canBeChildOf(
  levels: readonly OrgLevel[],
  parentType: OrgUnitType,
  childType: OrgUnitType,
): boolean {
  const parent = orderOf(levels, parentType);
  const child = orderOf(levels, childType);
  if (childType === ROOT_LEVEL || parent === undefined || child === undefined) return false;
  return child > parent && structureProblem(levels, parentType, childType) === null;
}

/** Why a parent can't take a child: the structure's own words, else the ordering rule. */
function placementReason(
  levels: readonly OrgLevel[],
  parentType: OrgUnitType,
  childType: OrgUnitType,
) {
  return (
    structureProblem(levels, parentType, childType) ??
    "That parent's level must come before this node's level."
  );
}

/**
 * A unit placed before the structure rules existed (a project straight under a subsidiary): its main parent
 * would be refused today. Shown on the Organization page so it can be put under a business unit.
 */
export function misplaced(node: OrgNode, nodes: readonly OrgNode[], levels: readonly OrgLevel[]) {
  const parent = node.parentId ? nodes.find((n) => n.id === node.parentId) : undefined;
  return parent ? structureProblem(levels, parent.unitType, node.unitType) : null;
}

/** Levels allowed under a parent, in hierarchy order. */
export function allowedChildTypes(
  levels: readonly OrgLevel[],
  parentType: OrgUnitType,
): OrgUnitType[] {
  return [...levels]
    .sort((x, y) => x.order - y.order)
    .filter((level) => canBeChildOf(levels, parentType, level.code))
    .map((level) => level.code);
}

export type OrgNode = {
  id: string;
  /** The main parent: where the unit is managed (moved, deactivated with). Null for a group. */
  parentId: string | null;
  /** Other units it also sits under (migration 0044): it counts in each, and their people see it. */
  alsoUnder?: readonly string[];
  unitType: OrgUnitType;
  status: "active" | "inactive";
};

/**
 * All descendant ids of a node (excluding the node itself). "main" follows main parents only — what is
 * managed with the node; "all" also follows the extra parents — what counts in it and is seen from it.
 */
export function descendantIds(
  nodeId: string,
  nodes: readonly OrgNode[],
  links: "main" | "all" = "main",
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    const parents = [node.parentId, ...(links === "all" ? (node.alsoUnder ?? []) : [])];
    for (const parentId of parents) {
      if (!parentId) continue;
      const siblings = childrenByParent.get(parentId) ?? [];
      siblings.push(node.id);
      childrenByParent.set(parentId, siblings);
    }
  }
  const result: string[] = [];
  const stack = [...(childrenByParent.get(nodeId) ?? [])];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    stack.push(...(childrenByParent.get(id) ?? []));
  }
  return result;
}

/**
 * Nodes in tree order — each parent before its children, siblings by name — with their depth. A node whose
 * parent is not in the list (a person's scope starts below the root) begins a branch at depth 0.
 */
export function treeOrder<T extends { id: string; parentId?: string | null; name: string }>(
  nodes: readonly T[],
): (T & { depth: number })[] {
  const ids = new Set(nodes.map((n) => n.id));
  const children = new Map<string | null, T[]>();
  for (const node of nodes) {
    const key = node.parentId && ids.has(node.parentId) ? node.parentId : null;
    children.set(key, [...(children.get(key) ?? []), node]);
  }
  const ordered: (T & { depth: number })[] = [];
  const visit = (key: string | null, depth: number) => {
    const level = [...(children.get(key) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    for (const node of level) {
      ordered.push({ ...node, depth });
      visit(node.id, depth + 1);
    }
  };
  visit(null, 0);
  return ordered;
}

/**
 * The order to create a sheet's rows in when a row may name another row as its parent: every row after the
 * row whose code it names, whatever order the sheet lists them in. A row with no parent code, or one that
 * names an existing code, can be created at once. `orphans` are the rows whose parent is neither — a code
 * that does not exist, a row naming itself, or rows naming each other in a circle.
 */
export function importOrder<
  T extends {
    code: string | null;
    parentCode?: string | null;
    /** Codes of other rows it also sits under; those rows must be created first as well. */
    alsoUnderCodes?: readonly string[];
  },
>(rows: readonly T[], existingCodes: ReadonlySet<string>): { ordered: T[]; orphans: T[] } {
  const available = new Set(existingCodes);
  const ordered: T[] = [];
  let waiting = [...rows];
  for (let progressed = true; progressed && waiting.length > 0;) {
    progressed = false;
    const later: T[] = [];
    for (const row of waiting) {
      if (
        (row.parentCode && !available.has(row.parentCode)) ||
        row.alsoUnderCodes?.some((code) => !available.has(code))
      ) {
        later.push(row);
        continue;
      }
      ordered.push(row);
      if (row.code) available.add(row.code);
      progressed = true;
    }
    waiting = later;
  }
  return { ordered, orphans: waiting };
}

/**
 * A name or code as a person typed it, for comparing: no spaces at either end, any run of spaces counted as
 * one, letter case ignored. "Olectra", "Olectra  " and " olectra" are the same unit.
 */
export const tidy = (value: string) => value.trim().replace(/\s+/g, " ");
export const sameName = (a: string, b: string) => tidy(a).toLowerCase() === tidy(b).toLowerCase();

/**
 * A shared unit may be listed once under each of its parents (how Export hierarchy writes it, so the sheet
 * reads like the tree). Rows with one code, the same name and the same level are therefore one unit, with
 * every parent any of them names — and so are rows with no code, the same name and level and the same list
 * of two or more parents; the first such row is kept and `sameAs` says which row each of the others
 * repeats. Rows that share a code but differ in name or level are left alone — that is a mistake in the
 * sheet, reported as one.
 */
export function mergeSharedRows<
  T extends {
    code: string | null;
    name: string;
    unitType: string;
    parentCode?: string | null;
    parentId?: string;
    alsoUnder?: string[];
  },
>(rows: readonly T[]): { rows: (T & { index: number })[]; sameAs: Map<number, number> } {
  // `listed`: the parents as the row itself named them, before any merge.
  const kept: (T & { index: number; listed: string })[] = [];
  const sameAs = new Map<number, number>();
  const same = sameName;
  // Without a code a unit is recognised by its name, level and whole list of parents — and only when that
  // list has more than one, so two same-named units under one parent stay two units.
  const parentsOf = (row: T) =>
    [...new Set([row.parentCode, ...(row.alsoUnder ?? [])].filter(Boolean))]
      .map((p) => tidy(p!).toLowerCase())
      .sort()
      .join("|");
  rows.forEach((row, index) => {
    const first = kept.find(
      (k) =>
        same(k.name, row.name) &&
        k.unitType === row.unitType &&
        !k.parentId &&
        !row.parentId &&
        (row.code
          ? k.code === row.code
          : !k.code && parentsOf(row).includes("|") && k.listed === parentsOf(row)),
    );
    if (!first) {
      kept.push({ ...row, index, listed: parentsOf(row) });
      return;
    }
    const parents = [...(first.alsoUnder ?? []), row.parentCode, ...(row.alsoUnder ?? [])];
    first.alsoUnder = [
      ...new Set(parents.filter((p): p is string => Boolean(p) && p !== first.parentCode)),
    ];
    sameAs.set(index, first.index);
  });
  return { rows: kept, sameAs };
}

/**
 * The org unit a sheet cell names: by its code, else by its name (how a unit with no code is listed). When
 * several units share that name the answer is "ambiguous" — the sheet must not guess which one was meant.
 */
export function unitByRef<T extends { code: string | null; name: string }>(
  units: readonly T[],
  ref: string,
): T | "ambiguous" | undefined {
  const byCode = units.find((u) => u.code && sameName(u.code, ref));
  if (byCode) return byCode;
  const named = units.filter((u) => sameName(u.name, ref));
  return named.length > 1 ? "ambiguous" : named[0];
}

export type MoveCheck = { ok: true } | { ok: false; reason: string };

/** Moving a node: no cycles, root cannot move, ordering must hold for the node and its whole subtree. */
export function checkMove(
  nodeId: string,
  newParentId: string,
  nodes: readonly OrgNode[],
  levels: readonly OrgLevel[],
): MoveCheck {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const node = byId.get(nodeId);
  const newParent = byId.get(newParentId);
  if (!node || !newParent) return { ok: false, reason: "Node not found." };
  if (node.parentId === null) return { ok: false, reason: "The root Group cannot be moved." };
  if (nodeId === newParentId) return { ok: false, reason: "A node cannot be its own parent." };
  if (descendantIds(nodeId, nodes, "all").includes(newParentId)) {
    return { ok: false, reason: "A node cannot be moved under its own descendant." };
  }
  if (node.alsoUnder?.includes(newParentId)) {
    return { ok: false, reason: "The node already sits under that parent as well." };
  }
  if (!canBeChildOf(levels, newParent.unitType, node.unitType)) {
    return { ok: false, reason: placementReason(levels, newParent.unitType, node.unitType) };
  }
  return { ok: true };
}

/** The group a node hangs from, by its main parents. */
export function rootOf(nodeId: string, nodes: readonly OrgNode[]): string | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  let current = byId.get(nodeId);
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(current.parentId);
  }
  return current?.id;
}

/**
 * Putting a node under one more parent (migration 0044): not a group, not a parent it has already, the
 * parent's level before the node's — which also rules out a circle — and both in the same group.
 */
export function checkAlsoUnder(
  nodeId: string,
  parentId: string,
  nodes: readonly OrgNode[],
  levels: readonly OrgLevel[],
): MoveCheck {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const node = byId.get(nodeId);
  const parent = byId.get(parentId);
  if (!node || !parent) return { ok: false, reason: "Node not found." };
  if (node.parentId === null) {
    return { ok: false, reason: "A group is the top of its organization; it has no parent." };
  }
  if (nodeId === parentId) return { ok: false, reason: "A node cannot be its own parent." };
  if (node.parentId === parentId || node.alsoUnder?.includes(parentId)) {
    return { ok: false, reason: "The node already sits under that parent." };
  }
  if (singleParent(node.unitType)) {
    return {
      ok: false,
      reason: `A ${levelLabel(levels, node.unitType)} belongs to one ${levelLabel(levels, SUBSIDIARY_LEVEL)} only.`,
    };
  }
  if (!canBeChildOf(levels, parent.unitType, node.unitType)) {
    return { ok: false, reason: placementReason(levels, parent.unitType, node.unitType) };
  }
  if (rootOf(nodeId, nodes) !== rootOf(parentId, nodes)) {
    return { ok: false, reason: "Both must belong to the same group." };
  }
  return { ok: true };
}

/**
 * Non-frozen nodes reachable for a bulk action: each of the given nodes plus its descendants.
 * Used to scope a permission holder's bulk-import target to their own assignments (or, for an Admin,
 * called with every active node id).
 */
export function reachableNodeIds(
  nodes: readonly OrgNode[],
  fromNodeIds: readonly string[],
): string[] {
  const ids = new Set<string>();
  for (const nodeId of fromNodeIds) {
    if (!nodes.some((n) => n.id === nodeId)) continue;
    for (const id of [nodeId, ...descendantIds(nodeId, nodes, "all")]) {
      if (!isFrozen(id, nodes)) ids.add(id);
    }
  }
  return [...ids];
}

/** Frozen-but-readable: a node is frozen if it or any ancestor is inactive. */
export function isFrozen(nodeId: string, nodes: readonly OrgNode[]): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  let current = byId.get(nodeId);
  while (current && !seen.has(current.id)) {
    if (current.status === "inactive") return true;
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return false;
}
