import "server-only";
import { appUrl } from "@/lib/app-url";
import {
  hashInvitationToken,
  invitationLink,
  invitationValidHours,
  newInvitationToken,
  validityLabel,
} from "@/lib/auth/invitation-token";
import { db, type Tx } from "@/lib/db";
import { invitationEmailHtml, sendEmail, type SendEmailResult } from "@/lib/email/brevo";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Issuing and cancelling invitation links (migration 0051). The token exists in two places only: this
// request's memory and the email. It is never returned to a screen, logged or written to the audit trail.

export type IssuedInvitation = { token: string; validHours: number };

/** Cancels every link of this account that is neither used nor revoked. Returns how many there were. */
export async function revokeInvitations(tx: Tx, userId: string): Promise<number> {
  const revoked = await tx`
    update public.user_invitations set revoked_at = now()
    where user_id = ${userId} and consumed_at is null and revoked_at is null
    returning id`;
  return revoked.length;
}

/** A new link for this account; any earlier one stops working in the same transaction. */
export async function issueInvitation(
  tx: Tx,
  userId: string,
  createdBy: string,
): Promise<IssuedInvitation> {
  const [setting] = await tx<{ value: unknown }[]>`
    select value from public.org_settings where key = 'invitation_valid_hours'`;
  const validHours = invitationValidHours(setting?.value);
  await revokeInvitations(tx, userId);
  const token = newInvitationToken();
  await tx`
    insert into public.user_invitations (user_id, token_hash, created_by, expires_at)
    values (${userId}, ${hashInvitationToken(token)}, ${createdBy},
            now() + make_interval(hours => ${validHours}))`;
  return { token, validHours };
}

export function sendInvitationEmail(input: {
  email: string;
  displayName: string;
  invitation: IssuedInvitation;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: { email: input.email, name: input.displayName },
    subject: "Set up your EmeilSG account",
    html: invitationEmailHtml({
      displayName: input.displayName,
      email: input.email,
      link: invitationLink(appUrl(), input.invitation.token),
      validFor: validityLabel(input.invitation.validHours),
    }),
  });
}

/**
 * Whether the person has ever taken the account into use: chosen a password through a link, or signed in.
 * Until then the only way in is a link an administrator sent, which the administrator can also revoke, so
 * nothing else (the reset-by-code form included) may set a password for it.
 */
export async function accountActivated(userId: string): Promise<boolean> {
  const [used] = await db()`
    select 1 from public.user_invitations where user_id = ${userId} and consumed_at is not null limit 1`;
  if (used) return true;
  const { data, error } = await createSupabaseAdminClient().auth.admin.getUserById(userId);
  if (error || !data.user) return false;
  return Boolean(data.user.last_sign_in_at);
}
