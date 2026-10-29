"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { ownPasswordMetadata } from "@/lib/auth/initial-password";
import { hashInvitationToken, isInvitationToken } from "@/lib/auth/invitation-token";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { passwordMeetsPolicy, passwordPolicyMessage } from "@/lib/auth/password-policy";
import { db } from "@/lib/db";
import { bucket, clientAddress, count, exceeded, rateLimits } from "@/lib/security/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Accepting an invitation link (migration 0051, .grill/scoped-admin-onboarding-decisions.md).
//
// Opening the link changes nothing: the page asks `checkInvitation` whether the token is good, which only
// reads. The token is used up by `acceptInvitation`, in the same transaction that sets the password, and
// only by a form the person submits — a mail scanner or a link preview that fetches the address cannot
// do that. Nobody is signed in here: afterwards the person signs in on the ordinary page.
//
// A link that is unknown, used, revoked, expired, or belongs to a deactivated account gets one and the
// same answer, so the page tells a stranger nothing about which accounts exist.

export type InvitationCheck = { valid: true; email: string } | { valid: false; limited: boolean };

/** Only wrong tokens are counted: people behind one office address must not lock each other out. */
async function guessLimit() {
  const limits = await rateLimits();
  const name = bucket("invitation-failure-address", clientAddress(await headers()));
  return {
    name,
    limited: await exceeded(
      name,
      limits.invitation_failures_per_address,
      limits.invitation_failure_window_minutes,
    ),
  };
}

export async function checkInvitation(token: string): Promise<InvitationCheck> {
  const guard = await guessLimit();
  if (guard.limited) return { valid: false, limited: true };
  if (isInvitationToken(token)) {
    const [row] = await db()<{ email: string }[]>`
      select u.email
      from public.user_invitations i join public.users u on u.id = i.user_id
      where i.token_hash = ${hashInvitationToken(token)}
        and i.consumed_at is null and i.revoked_at is null and i.expires_at > now()
        and u.is_active and u.deleted_at is null`;
    if (row) return { valid: true, email: row.email };
  }
  await count(guard.name);
  return { valid: false, limited: false };
}

export type AcceptInvitationState = {
  error: string | null;
  /** The link itself is no good (any more): the form is replaced by the "ask for a new link" message. */
  linkInvalid?: boolean;
};

class LinkInvalid extends Error {}
class PasswordRefused extends Error {
  constructor(readonly code: string | undefined) {
    super("password refused");
  }
}

export async function acceptInvitation(
  _previous: AcceptInvitationState,
  formData: FormData,
): Promise<AcceptInvitationState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");

  const guard = await guessLimit();
  if (guard.limited) return { error: AUTH_MESSAGES.otpRateLimited };
  if (!isInvitationToken(token)) {
    await count(guard.name);
    return { error: AUTH_MESSAGES.invitationInvalid, linkInvalid: true };
  }
  // Checked here, on the server, whatever the page did; a refused password does not use the link up.
  if (!passwordMeetsPolicy(password)) return { error: passwordPolicyMessage(password) };
  if (password !== confirmation) return { error: "Passwords do not match." };

  try {
    await db().begin(async (tx) => {
      // One statement claims the link. A second request with the same token waits for this transaction
      // and then finds the link used; if anything below fails, the claim is rolled back with it.
      const [claimed] = await tx<{ user_id: string }[]>`
        update public.user_invitations i set consumed_at = now()
        from public.users u
        where i.token_hash = ${hashInvitationToken(token)}
          and i.consumed_at is null and i.revoked_at is null and i.expires_at > now()
          and u.id = i.user_id and u.is_active and u.deleted_at is null
        returning i.user_id`;
      if (!claimed) throw new LinkInvalid();

      // Supabase Auth hashes and stores the password, and applies its own strength rules as well.
      const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(
        claimed.user_id,
        { password, email_confirm: true, app_metadata: ownPasswordMetadata },
      );
      if (error) throw new PasswordRefused(error.code);

      await tx`delete from public.password_reset_otps where user_id = ${claimed.user_id}`;
      await writeAudit(tx, {
        eventType: "user.invitation_accepted",
        entityType: "user",
        entityId: claimed.user_id,
        userId: claimed.user_id,
      });
    });
  } catch (error) {
    if (error instanceof LinkInvalid) {
      await count(guard.name);
      return { error: AUTH_MESSAGES.invitationInvalid, linkInvalid: true };
    }
    if (error instanceof PasswordRefused) {
      return {
        error:
          error.code === "weak_password" ? passwordPolicyMessage(password) : AUTH_MESSAGES.retry,
      };
    }
    throw error;
  }

  redirect("/login?reason=password_set");
}
