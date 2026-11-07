// Reads the sign-in's `session_id` out of a Supabase access token or the raw auth cookie, WITHOUT verifying
// anything. Use the result only as a lookup key where nothing is granted by it: telling a device that was
// signed out why it was (migration 0055). Everything that grants access verifies the token with Supabase
// Auth first (lib/auth/session.ts).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64_PREFIX = "base64-";

/** The `session_id` claim of an access token, or null if it has none or is not a token. */
export function sessionIdFromAccessToken(token: string | null | undefined): string | null {
  const claims = token?.split(".")[1];
  if (!claims) return null;
  try {
    const id: unknown = JSON.parse(Buffer.from(claims, "base64url").toString("utf8")).session_id;
    return typeof id === "string" && UUID.test(id) ? id : null;
  } catch {
    return null;
  }
}

type Cookie = { name: string; value: string };

/**
 * The session id from the Supabase auth cookie as @supabase/ssr writes it: `sb-<ref>-auth-token`, or split
 * into `….0`, `….1`, … when long; the value is JSON, optionally `base64-` + base64url of it.
 */
export function sessionIdFromAuthCookies(cookies: Cookie[]): string | null {
  const base = cookies
    .map(({ name }) => name.replace(/\.\d+$/, ""))
    .find((name) => /^sb-.+-auth-token$/.test(name));
  if (!base) return null;
  const byName = new Map(cookies.map((c) => [c.name, c.value]));
  let raw = byName.get(base) ?? null;
  if (!raw) {
    const parts: string[] = [];
    for (let i = 0; byName.has(`${base}.${i}`); i++) parts.push(byName.get(`${base}.${i}`)!);
    raw = parts.length > 0 ? parts.join("") : null;
  }
  if (!raw) return null;
  try {
    const json = raw.startsWith(BASE64_PREFIX)
      ? Buffer.from(raw.slice(BASE64_PREFIX.length), "base64url").toString("utf8")
      : raw;
    const token: unknown = JSON.parse(json).access_token;
    return typeof token === "string" ? sessionIdFromAccessToken(token) : null;
  } catch {
    return null;
  }
}

/** "3:45 pm on 7 Nov 2026" in India time, for the signed-out notice. Null for anything not a date. */
export function signedOutAt(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(iso)) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const time = date
    .toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })
    .toLowerCase();
  const day = date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${time} on ${day}`;
}

/**
 * The app's own note of which sign-in this browser last started (set by the sign-in form). Supabase clears
 * its auth cookie as soon as a revoked session is refused, which would leave nothing to look the ending up
 * by; this cookie stays. It holds only the session id, which grants nothing.
 */
export const SIGN_IN_MARKER = "emeilsg-sign-in";

/** The sign-in to explain an ending for: the auth cookie's while it is there, else the app's marker. */
export function sessionIdForNotice(cookies: Cookie[]): string | null {
  const marker = cookies.find((c) => c.name === SIGN_IN_MARKER)?.value;
  return sessionIdFromAuthCookies(cookies) ?? (marker && UUID.test(marker) ? marker : null);
}
