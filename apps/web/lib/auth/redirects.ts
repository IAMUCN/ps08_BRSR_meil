// Pure routing rules for auth redirects (03_APP_FLOW.md §1, §4.1, §4.3, §4.4). No framework imports,
// so this module is unit-testable with Node's built-in test runner.

export type Landing = "/admin" | "/app";

/** The Super Admin: group-wide configuration and every org unit (migration 0050). */
export const ADMIN_ROLE = "admin";
/** An Administrator of one org unit and everything beneath it (migration 0050). */
export const ORG_ADMIN_ROLE = "org_admin";

const isAdminRole = (code: string) => code === ADMIN_ROLE || code === ORG_ADMIN_ROLE;

/** Whether these roles open the /admin area at all; what each page shows there is decided per page. */
export function usesAdminArea(roleCodes: readonly string[]): boolean {
  return roleCodes.some(isAdminRole);
}

/** §4.1: an administrator lands on /admin; everyone else (including users with no assignment) on /app. */
export function landingPathFor(roleCodes: readonly string[]): Landing {
  return usesAdminArea(roleCodes) ? "/admin" : "/app";
}

function isUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);
}

/**
 * §1: /admin/* is for administrators. /app/* is for everyone: an administrator uploads and verifies
 * there like anyone else (its dashboard sends them back to /admin). A user with no assignment still
 * reaches /app, which shows the "no projects assigned" state.
 */
export function canAccessPath(path: string, roleCodes: readonly string[]): boolean {
  if (isUnder(path, "/admin")) return usesAdminArea(roleCodes);
  return isUnder(path, "/app");
}

/** Whether the person holds a role other than the two administrator roles. */
export function hasOperationalRole(roleCodes: readonly string[]): boolean {
  return roleCodes.some((code) => !isAdminRole(code));
}

/**
 * Validates a user-supplied return-to path. Only same-origin paths inside the protected namespaces
 * are accepted, so `next` can never become an open redirect (e.g. `//evil.test`, `/\evil.test`).
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if ([...value].some((char) => char.charCodeAt(0) < 0x20)) return null;
  // "/app/../auth/signout" starts with /app but is another page once the browser resolves it.
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (/(^|[\\/])\.{1,2}([\\/?#]|$)/.test(decoded) || decoded.includes("\\")) return null;
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
