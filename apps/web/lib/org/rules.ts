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

/** Skip levels, never invert: a child's level must come strictly later than its parent's. */
export function canBeChildOf(
  levels: readonly OrgLevel[],
  parentType: OrgUnitType,
  childType: OrgUnitType,
): boolean {
  const parent = orderOf(levels, parentType);
  const child = orderOf(levels, childType);
  if (childType === ROOT_LEVEL || parent === undefined || child === undefined) return false;
  return child > parent;
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
  parentId: string | null;
  unitType: OrgUnitType;
  status: "active" | "inactive";
};

/** All descendant ids of a node (excluding the node itself). */
export function descendantIds(nodeId: string, nodes: readonly OrgNode[]): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node.id);
    childrenByParent.set(node.parentId, siblings);
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
export function importOrder<T extends { code: string | null; parentCode?: string | null }>(
  rows: readonly T[],
  existingCodes: ReadonlySet<string>,
): { ordered: T[]; orphans: T[] } {
  const available = new Set(existingCodes);
  const ordered: T[] = [];
  let waiting = [...rows];
  for (let progressed = true; progressed && waiting.length > 0;) {
    progressed = false;
    const later: T[] = [];
    for (const row of waiting) {
      if (row.parentCode && !available.has(row.parentCode)) {
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
  if (descendantIds(nodeId, nodes).includes(newParentId)) {
    return { ok: false, reason: "A node cannot be moved under its own descendant." };
  }
  if (!canBeChildOf(levels, newParent.unitType, node.unitType)) {
    return { ok: false, reason: "That parent's level must come before this node's level." };
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
    for (const id of [nodeId, ...descendantIds(nodeId, nodes)]) {
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
