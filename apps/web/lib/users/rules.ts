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
 * The initial password of a bulk-created account (no invite email is sent — bulk-import-decisions.md).
 * Random, from a cryptographic source: it used to be "<FirstName>@<EmployeeId>", which a colleague could
 * guess (SECURITY_AUDIT_2026-10-12.md). Always satisfies every rule in lib/auth/password-policy.ts.
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
