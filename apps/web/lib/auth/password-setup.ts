// /reset-password sets a password without asking for the current one, so it is only for someone who has
// just followed an invite or recovery link. /auth/confirm leaves this short-lived cookie when the link was
// valid; the page and its action refuse a session that does not carry it, so an ordinary signed-in session
// must go through Profile, which asks for the current password (SECURITY_AUDIT_2026-10-12.md).

export const PASSWORD_SETUP_COOKIE = "traceesg-password-setup";

export const passwordSetupCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/reset-password",
  maxAge: 15 * 60,
} as const;
