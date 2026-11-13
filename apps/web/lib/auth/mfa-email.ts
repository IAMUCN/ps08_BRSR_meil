import { createHmac, timingSafeEqual } from "node:crypto";

// The "try another way" step of two-step sign-in: a 6-digit code emailed to the account's own address.
// Nothing is stored. The code is derived from a server secret, the account, this sign-in's session id and a
// ten-minute window, so it only works for that sign-in and expires by itself. Passing it sets a signed cookie
// tied to the same session id, which `resolveSession` accepts in place of the authenticator app's code.

export const MFA_EMAIL_COOKIE = "emeilsg-mfa-email";
export const MFA_EMAIL_WINDOW_MINUTES = 10;
const WINDOW_MS = MFA_EMAIL_WINDOW_MINUTES * 60 * 1000;

function secret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("The server secret for email codes is not configured.");
  return key;
}

function hmac(parts: string[]): Buffer {
  return createHmac("sha256", secret()).update(parts.join("|")).digest();
}

function codeFor(userId: string, sessionId: string, window: number): string {
  const digest = hmac(["mfa-email-code", userId, sessionId, String(window)]);
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

/** The code to email now. */
export function currentEmailCode(userId: string, sessionId: string, now = Date.now()): string {
  return codeFor(userId, sessionId, Math.floor(now / WINDOW_MS));
}

/** True for this window's code and the previous window's, so a code sent just before the edge still works. */
export function emailCodeMatches(
  userId: string,
  sessionId: string,
  code: string,
  now = Date.now(),
): boolean {
  const window = Math.floor(now / WINDOW_MS);
  const given = Buffer.from(code);
  return [window, window - 1].some((w) => {
    const expected = Buffer.from(codeFor(userId, sessionId, w));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

const COOKIE_LIFETIME_MS = 3 * 24 * 60 * 60 * 1000;

/** The cookie value that says this session passed the email step. */
export function emailPassToken(userId: string, sessionId: string, now = Date.now()): string {
  const expires = now + COOKIE_LIFETIME_MS;
  return `${expires}.${hmac(["mfa-email-pass", userId, sessionId, String(expires)]).toString("hex")}`;
}

export function emailPassValid(
  token: string | null | undefined,
  userId: string,
  sessionId: string,
  now = Date.now(),
): boolean {
  const [expires, mac] = (token ?? "").split(".");
  if (!expires || !mac || !/^\d+$/.test(expires) || Number(expires) < now) return false;
  const expected = hmac(["mfa-email-pass", userId, sessionId, expires]).toString("hex");
  return expected.length === mac.length && timingSafeEqual(Buffer.from(expected), Buffer.from(mac));
}

export const COOKIE_MAX_AGE_SECONDS = COOKIE_LIFETIME_MS / 1000;
