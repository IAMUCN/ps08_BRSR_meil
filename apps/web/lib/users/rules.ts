// User/assignment safety rules (.grill/phase-4-admin-foundation-decisions.md). Pure — unit-testable.

// Relative import with extension so Node's test runner can load it without the "@/" alias.
import { PASSWORD_MIN_LENGTH, PASSWORD_RULES } from "../auth/password-policy.ts";

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

/** First name, letters only, capitalized — for a memorable default password. */
function firstNameToken(displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0] ?? "";
  const letters = first.replace(/[^A-Za-z]/g, "") || "User";
  return letters[0]!.toUpperCase() + letters.slice(1).toLowerCase();
}

// A fixed, harmless filler for whichever policy rule the name/employee ID alone doesn't happen to cover
// (e.g. a one-letter name has no lowercase remainder; an all-letters employee ID has no digit).
const RULE_FILLER: Record<string, string> = {
  uppercase: "X",
  lowercase: "x",
  number: "7",
  special: "!",
};

/**
 * A default password for a bulk-created account (no invite email is sent — bulk-import-decisions.md):
 * "<FirstName>@<EmployeeId>", topped up to satisfy every rule in lib/auth/password-policy.ts (never just
 * the length minimum). `random` is injectable for deterministic tests; defaults to `Math.random`.
 */
export function generateDefaultPassword(
  displayName: string,
  employeeId: string,
  random: () => number = Math.random,
): string {
  let password = `${firstNameToken(displayName)}@${employeeId}`;
  for (const rule of PASSWORD_RULES) {
    if (rule.id !== "length" && !rule.test(password)) password += RULE_FILLER[rule.id];
  }
  while (password.length < PASSWORD_MIN_LENGTH) {
    password += Math.floor(random() * 10);
  }
  return password;
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
