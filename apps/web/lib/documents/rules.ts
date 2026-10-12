// Upload scope rules (.grill/phase-5-document-ingestion-decisions.md). Pure — unit-testable.

// Relative import with extension so Node's test runner can load it without the "@/" alias.
import { descendantIds, isFrozen, type OrgNode } from "../org/rules.ts";

export type UploadAssignment = { orgUnitId: string; roleId: string };
export type UploadCategory = { id: string; owningRoleId: string | null };

/**
 * Where a user may upload and which categories apply there. A node is a target if an assignment whose
 * role can upload sits on it or an ancestor, and it isn't frozen. Categories: owning role null (every
 * role) or one of the upload-capable roles held at that node. Nodes with no category are omitted.
 */
export function uploadTargets(
  nodes: readonly OrgNode[],
  assignments: readonly UploadAssignment[],
  uploadRoleIds: ReadonlySet<string>,
  categories: readonly UploadCategory[],
  /** Role → the role it uploads on behalf of (migration 0049): it is offered that role's categories too. */
  uploadsFor: ReadonlyMap<string, string> = new Map(),
): Map<string, string[]> {
  const rolesByNode = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    if (!uploadRoleIds.has(assignment.roleId)) continue;
    if (!nodes.some((n) => n.id === assignment.orgUnitId)) continue;
    for (const id of [
      assignment.orgUnitId,
      // "all": a unit that also sits under this one (migration 0044) takes this person's uploads too.
      ...descendantIds(assignment.orgUnitId, nodes, "all"),
    ]) {
      if (isFrozen(id, nodes)) continue;
      const roles = rolesByNode.get(id) ?? new Set<string>();
      roles.add(assignment.roleId);
      const behalf = uploadsFor.get(assignment.roleId);
      if (behalf) roles.add(behalf);
      rolesByNode.set(id, roles);
    }
  }

  const targets = new Map<string, string[]>();
  for (const [nodeId, roles] of rolesByNode) {
    const categoryIds = categories
      .filter((c) => c.owningRoleId === null || roles.has(c.owningRoleId))
      .map((c) => c.id);
    if (categoryIds.length > 0) targets.set(nodeId, categoryIds);
  }
  return targets;
}
