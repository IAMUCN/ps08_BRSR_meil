// The Supabase session lives in cookies that only the server reads: sign-in, refresh and every query run
// on the server, and no Supabase client exists in the browser. HttpOnly keeps the access and refresh tokens
// out of reach of any script on the page (SECURITY_AUDIT_2026-10-12.md). Secure is left off outside
// production so plain-http local development keeps working.
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;
