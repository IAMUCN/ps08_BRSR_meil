// User/assignment safety rules (.grill/phase-4-admin-foundation-decisions.md). Pure — unit-testable.

// Relative import with extension so Node's test runner can load it without the "@/" alias.
import { PASSWORD_MIN_LENGTH, PASSWORD_RULES } from "../auth/password-policy.ts";
import { descendantIds, type OrgNode } from "../org/rules.ts";

export type RuleCheck = { ok: true } | { ok: false; reason: string };

/** The admin role is global (is_admin()), so it may only be assigned at the root Group node. */
export function checkRoleAtNode(roleCode: string, orgUnitType: string): RuleCheck {
  if (roleCode === "admin" && orgUnitType !== "group") {
    return {
      ok: false,
      reason: "The Admin role can only be assigned at the root organization.",
    };
  }
  if (roleCode === "bu_manager" && orgUnitType !== "business_unit") {
    return {
      ok: false,
      reason: "The BU Manager role can only be assigned at a business unit.",
    };
  }
  return { ok: true };
}

// No look-alikes (0/O, 1/l/I), so a password read off an email or a results sheet is typed correctly.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SPECIAL = "!@#$%*?";
const INITIAL_PASSWORD_LENGTH = 16;

/** An unbiased integer in [0, max) from the platform's cryptographic generator. */
function secureRandomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(buffer);
  } while (buffer[0]! >= limit);
  return buffer[0]! % max;
}

/**
 * A random password that satisfies every rule in lib/auth/password-policy.ts, from a cryptographic source.
 * No new account gets one any more (the person chooses their own through an invitation link); it is used
 * to overwrite the emailed temporary password of an older account when that account is sent a link, and
 * nobody is ever told it.
 * `randomInt` is injectable for deterministic tests only.
 */
export function generateInitialPassword(
  randomInt: (max: number) => number = secureRandomInt,
): string {
  const pick = (set: string) => set[randomInt(set.length)]!;
  const all = UPPER + LOWER + DIGITS + SPECIAL;
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIAL)];
  while (chars.length < Math.max(INITIAL_PASSWORD_LENGTH, PASSWORD_MIN_LENGTH))
    chars.push(pick(all));
  // Fisher–Yates, so the four guaranteed characters are not always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  const password = chars.join("");
  if (!PASSWORD_RULES.every((rule) => rule.test(password))) {
    throw new Error("generated password does not meet the policy");
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

/** Who is acting: a Super Admin, or an Administrator of some org units, or neither. */
export type Grantor = { isAdmin: boolean; adminOrgUnitIds: readonly string[] };

/**
 * The org units an Administrator administers: where they hold the role and everything beneath, shared
 * units included (they are seen from every parent). `null` means every unit (Super Admin).
 */
export function administeredIds(grantor: Grantor, nodes: readonly OrgNode[]): Set<string> | null {
  if (grantor.isAdmin) return null;
  const ids = new Set<string>();
  for (const unitId of grantor.adminOrgUnitIds) {
    if (!nodes.some((n) => n.id === unitId)) continue;
    ids.add(unitId);
    for (const id of descendantIds(unitId, nodes, "all")) ids.add(id);
  }
  return ids;
}

/**
 * Whether the grantor may give (or take away) this role at this org unit
 * (.grill/scoped-admin-onboarding-decisions.md). A Super Admin: any role anywhere. An Administrator:
 * operational roles at their own units and beneath; the Administrator role only beneath, never at their
 * own level — every administrator is appointed from above; never Super Admin. Anyone else: nothing.
 */
export function checkGrant(
  grantor: Grantor,
  roleCode: string,
  orgUnitId: string,
  nodes: readonly OrgNode[],
): RuleCheck {
  if (grantor.isAdmin) return { ok: true };
  if (grantor.adminOrgUnitIds.length === 0) {
    return { ok: false, reason: "Only an administrator can assign or remove roles." };
  }
  if (roleCode === "admin") {
    return { ok: false, reason: "Only a Super Admin can assign or remove the Super Admin role." };
  }
  const scope = administeredIds(grantor, nodes)!;
  if (!scope.has(orgUnitId)) {
    return { ok: false, reason: "That part of the organisation isn't in your scope." };
  }
  if (
    (roleCode === "org_admin" || roleCode === "bu_manager") &&
    grantor.adminOrgUnitIds.includes(orgUnitId)
  ) {
    return {
      ok: false,
      reason:
        "An Administrator at your own level is appointed by the administrator above you. You can appoint Administrators for the units beneath yours.",
    };
  }
  return { ok: true };
}

/**
 * Whether the grantor may act on a whole account (deactivate, reactivate, delete, resend its invitation):
 * only when every role the person holds is one the grantor could take away. Someone who also works in
 * another branch, or who administers at the grantor's own level or above, is out of reach.
 */
export function checkAccountReach(
  grantor: Grantor,
  assignments: readonly { roleCode: string; orgUnitId: string }[],
  nodes: readonly OrgNode[],
): RuleCheck {
  if (grantor.isAdmin) return { ok: true };
  if (assignments.length === 0) {
    return { ok: false, reason: "Only a Super Admin can manage an account with no role." };
  }
  for (const a of assignments) {
    if (!checkGrant(grantor, a.roleCode, a.orgUnitId, nodes).ok) {
      return {
        ok: false,
        reason:
          "This person also holds a role outside what you administer, so the account itself isn't yours to change. You can still remove the roles inside your own scope.",
      };
    }
  }
  return { ok: true };
}
