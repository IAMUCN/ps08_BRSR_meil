// Organization tree rules (.grill/phase-4-admin-foundation-decisions.md). Pure — unit-testable.

export const ORG_UNIT_TYPES = [
  "group",
  "subsidiary",
  "business_unit",
  "region",
  "project",
  "site",
  "department",
] as const;

export type OrgUnitType = (typeof ORG_UNIT_TYPES)[number];

export const ORG_UNIT_TYPE_LABELS: Record<OrgUnitType, string> = {
  group: "Group",
  subsidiary: "Subsidiary / Entity",
  business_unit: "Business Unit / Division",
  region: "Region",
  project: "Project",
  site: "Site",
  department: "Department",
};

export function isOrgUnitType(value: unknown): value is OrgUnitType {
  return typeof value === "string" && (ORG_UNIT_TYPES as readonly string[]).includes(value);
}

/** Skip levels, never invert: a child's type must come strictly later than its parent's. */
export function canBeChildOf(parentType: OrgUnitType, childType: OrgUnitType): boolean {
  if (childType === "group") return false;
  return ORG_UNIT_TYPES.indexOf(childType) > ORG_UNIT_TYPES.indexOf(parentType);
}

/** Child types allowed under a parent, in reference order. */
export function allowedChildTypes(parentType: OrgUnitType): OrgUnitType[] {
  return ORG_UNIT_TYPES.filter((type) => canBeChildOf(parentType, type));
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

export type MoveCheck = { ok: true } | { ok: false; reason: string };

/** Moving a node: no cycles, root cannot move, ordering must hold for the node and its whole subtree. */
export function checkMove(
  nodeId: string,
  newParentId: string,
  nodes: readonly OrgNode[],
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
  if (!canBeChildOf(newParent.unitType, node.unitType)) {
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
