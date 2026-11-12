// Who a report goes to for verification (feature_enhancement.md Phase 4, requirement 9; owner's decision of
// 2026-11-08): the Administrators of the next unit up. Pure, so the rule is unit-tested.

export type ForwardNode = { id: string; parentId: string | null; alsoUnder: string[] };

/**
 * The units whose Administrators receive a report leaving `fromUnitId`: for each of its parents (a unit under
 * several parents goes to each), the nearest unit at or above that parent with an Administrator. `null` means
 * the Super Admins: nobody above holds the Administrator role. Never the unit itself, never twice.
 */
export function recipientUnits(
  nodes: readonly ForwardNode[],
  fromUnitId: string,
  unitsWithAdministrators: ReadonlySet<string>,
): (string | null)[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const from = byId.get(fromUnitId);
  if (!from) return [];
  const parents = [from.parentId, ...from.alsoUnder].filter((p): p is string => Boolean(p));
  if (parents.length === 0) return [null]; // a group: only the Super Admins are above it
  const found = new Set<string | null>();
  for (const parent of parents) {
    let unit: ForwardNode | undefined = byId.get(parent);
    const seen = new Set<string>(); // a cycle cannot exist (migration 0034), but never loop for ever
    while (unit && !seen.has(unit.id) && !unitsWithAdministrators.has(unit.id)) {
      seen.add(unit.id);
      unit = unit.parentId ? byId.get(unit.parentId) : undefined;
    }
    found.add(unit && unitsWithAdministrators.has(unit.id) ? unit.id : null);
  }
  return [...found];
}
