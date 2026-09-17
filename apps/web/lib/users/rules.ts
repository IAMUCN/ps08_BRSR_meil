// User/assignment safety rules (.grill/phase-4-admin-foundation-decisions.md). Pure — unit-testable.

export type RuleCheck = { ok: true } | { ok: false; reason: string };

/** The admin role is global (is_admin()), so it may only be assigned at the root Group node. */
export function checkRoleAtNode(roleCode: string, orgUnitType: string): RuleCheck {
  if (roleCode === "admin" && orgUnitType !== "group") {
    return {
      ok: false,
      reason: "The Admin role can only be assigned at the root organization.",
    };
  }
  return { ok: true };
}

/**
 * Lockout guards for removing someone's Admin access (deactivation or revoking an admin assignment):
 * no self-removal, and at least one other active Admin must remain.
 */
export function checkAdminRemoval(input: {
  actorUserId: string;
  targetUserId: string;
  targetIsActiveAdmin: boolean;
  otherActiveAdminCount: number;
}): RuleCheck {
  if (input.actorUserId === input.targetUserId) {
    return { ok: false, reason: "You can't remove your own access. Ask another Admin." };
  }
  if (input.targetIsActiveAdmin && input.otherActiveAdminCount < 1) {
    return { ok: false, reason: "At least one active Admin is required." };
  }
  return { ok: true };
}
