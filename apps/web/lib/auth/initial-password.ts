// An account created by Invite user or bulk import starts with a temporary password that was emailed to
// the person. Until they choose their own, the sign-in account carries this flag in its app metadata
// (which only the server's service key can write, never the person), and the session check refuses every
// page and procedure: the sign-in page shows the "choose a new password" form instead.

export const MUST_CHANGE_PASSWORD = "must_change_password";

/** App metadata for a new account, or for one whose temporary password was just re-issued. */
export const temporaryPasswordMetadata = { [MUST_CHANGE_PASSWORD]: true } as const;

/** App metadata once the person has chosen their own password. */
export const ownPasswordMetadata = { [MUST_CHANGE_PASSWORD]: false } as const;

export function mustChangePassword(user: { app_metadata?: Record<string, unknown> }): boolean {
  return user.app_metadata?.[MUST_CHANGE_PASSWORD] === true;
}
