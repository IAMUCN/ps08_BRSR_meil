import "server-only";

// Two-step sign-in with an authenticator app (TOTP) on Supabase Auth's own multi-factor support.
// A session is "aal1" after the password and "aal2" after the six-digit code.

/**
 * Every account needs an authenticator app, and every sign-in (password or Google) asks for its code.
 * Only an explicit AUTH_MFA_REQUIRED=false switches this off, for the automated test stack.
 */
export function mfaEnforced(): boolean {
  return process.env.AUTH_MFA_REQUIRED !== "false";
}

/** The assurance level claim (`aal1` / `aal2`) of an access token already verified elsewhere. */
export function aalFromAccessToken(token: string | null | undefined): "aal1" | "aal2" | null {
  const claims = token?.split(".")[1];
  if (!claims) return null;
  try {
    const aal: unknown = JSON.parse(Buffer.from(claims, "base64url").toString("utf8")).aal;
    return aal === "aal2" ? "aal2" : aal === "aal1" ? "aal1" : null;
  } catch {
    return null;
  }
}

type FactorLike = { factor_type?: string; status?: string };

export function hasVerifiedTotp(factors: FactorLike[] | null | undefined): boolean {
  return (factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified");
}
