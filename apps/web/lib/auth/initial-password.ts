// Before invitation links (migration 0051) a new account started with a temporary password that was emailed
// to the person. An account that still holds one carries this flag in its app metadata (which only the
// server's service key can write, never the person), and the session check refuses every page and
// procedure until they choose their own: the sign-in page shows the "choose a new password" form instead.
// No new account is given the flag any more.

export const MUST_CHANGE_PASSWORD = "must_change_password";

/** App metadata once the person has chosen their own password. */
export const ownPasswordMetadata = { [MUST_CHANGE_PASSWORD]: false } as const;

export function mustChangePassword(user: { app_metadata?: Record<string, unknown> }): boolean {
  return user.app_metadata?.[MUST_CHANGE_PASSWORD] === true;
}
