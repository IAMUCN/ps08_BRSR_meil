// Pure routing rules for auth redirects (03_APP_FLOW.md §1, §4.1, §4.3, §4.4). No framework imports,
// so this module is unit-testable with Node's built-in test runner.

export type Landing = "/admin" | "/app";

export const ADMIN_ROLE = "admin";

/** §4.1: Admin lands on /admin; everyone else (including users with no assignment) on /app. */
export function landingPathFor(roleCodes: readonly string[]): Landing {
  return roleCodes.includes(ADMIN_ROLE) ? "/admin" : "/app";
}

function isUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);
}

/**
 * §1: /admin/* is Admin only. /app/* is for non-admin roles; a user holding both an admin and a
 * non-admin assignment may use both. A user with no assignment still reaches /app, which shows the
 * "no projects assigned" state.
 */
export function canAccessPath(path: string, roleCodes: readonly string[]): boolean {
  const isAdmin = roleCodes.includes(ADMIN_ROLE);
  if (isUnder(path, "/admin")) return isAdmin;
  if (isUnder(path, "/app")) {
    const hasNonAdminRole = roleCodes.some((code) => code !== ADMIN_ROLE);
    return hasNonAdminRole || !isAdmin;
  }
  return false;
}

/**
 * Validates a user-supplied return-to path. Only same-origin paths inside the protected namespaces
 * are accepted, so `next` can never become an open redirect (e.g. `//evil.test`, `/\evil.test`).
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if ([...value].some((char) => char.charCodeAt(0) < 0x20)) return null;
  if (!isUnder(value, "/admin") && !isUnder(value, "/app")) return null;
  return value;
}

/** Where to send a user right after signing in. */
export function postLoginPath(
  next: string | null | undefined,
  roleCodes: readonly string[],
): string {
  const safe = safeNextPath(next);
  if (safe && canAccessPath(safe, roleCodes)) return safe;
  return landingPathFor(roleCodes);
}
