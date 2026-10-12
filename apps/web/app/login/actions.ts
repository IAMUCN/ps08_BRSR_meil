"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { mustChangePassword, ownPasswordMetadata } from "@/lib/auth/initial-password";
import { passwordMeetsPolicy, passwordPolicyMessage } from "@/lib/auth/password-policy";
import { postLoginPath, safeNextPath } from "@/lib/auth/redirects";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { resolveSession } from "@/lib/auth/session";
import {
  bucket,
  clear,
  clientAddress,
  count,
  exceeded,
  rateLimits,
} from "@/lib/security/rate-limit";
import { db } from "@/lib/db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = { error: string | null; email: string };

const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = signInSchema.safeParse({
    email,
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  // No account enumeration: malformed input gets the same message as wrong credentials.
  if (!parsed.success) return { error: AUTH_MESSAGES.invalidCredentials, email };

  // Supabase sees every sign-in as coming from this server, so its per-IP limit can't tell attackers
  // apart: failed attempts are limited here per account and per client address (SECURITY_REVIEW.md).
  const limits = await rateLimits();
  const account = bucket("login-account", parsed.data.email);
  const address = bucket("login-address", clientAddress(await headers()));
  if (
    (await exceeded(account, limits.login_failures_per_account, limits.login_window_minutes)) ||
    (await exceeded(address, limits.login_failures_per_address, limits.login_window_minutes))
  ) {
    return { error: AUTH_MESSAGES.tooManyAttempts, email };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error?.code === "invalid_credentials") {
    await count(account);
    await count(address);
  }
  if (error) {
    if (error.code === "user_banned") return { error: AUTH_MESSAGES.deactivated, email };
    if (error.code === "invalid_credentials")
      return { error: AUTH_MESSAGES.invalidCredentials, email };
    return { error: AUTH_MESSAGES.retry, email };
  }

  await clear(account);
  const result = await resolveSession(supabase);
  if (result.status === "password_change_required") {
    const next = safeNextPath(parsed.data.next);
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  if (result.status !== "active") {
    await supabase.auth.signOut();
    return {
      error:
        result.status === "deactivated" ? AUTH_MESSAGES.deactivated : AUTH_MESSAGES.unprovisioned,
      email,
    };
  }

  redirect(postLoginPath(parsed.data.next, result.session.roleCodes));
}

export type ChangeTemporaryPasswordState = { error: string | null };

/**
 * First sign-in with the emailed temporary password: the person chooses their own. Works only for a
 * signed-in account that still carries the flag, so it cannot be used to change a password without the
 * current one in any other situation (Profile asks for it).
 */
export async function changeTemporaryPassword(
  _previous: ChangeTemporaryPasswordState,
  formData: FormData,
): Promise<ChangeTemporaryPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? "") || null);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?reason=expired");
  if (!mustChangePassword(user)) redirect("/login");

  if (!passwordMeetsPolicy(password)) return { error: passwordPolicyMessage(password) };
  if (password !== confirmation) return { error: "Passwords do not match." };

  // As the person themselves, so Supabase Auth refuses the temporary password again (same_password).
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "weak_password") return { error: passwordPolicyMessage(password) };
    if (error.code === "same_password") {
      return { error: "Choose a password different from the temporary one." };
    }
    return { error: AUTH_MESSAGES.retry };
  }

  const { error: flagError } = await createSupabaseAdminClient().auth.admin.updateUserById(
    user.id,
    { app_metadata: ownPasswordMetadata },
  );
  if (flagError) return { error: AUTH_MESSAGES.retry };
  await db().begin((tx) =>
    writeAudit(tx, {
      eventType: "user.temporary_password_changed",
      entityType: "user",
      entityId: user.id,
      userId: user.id,
    }),
  );

  const result = await resolveSession(supabase);
  if (result.status !== "active") redirect("/login");
  redirect(postLoginPath(next, result.session.roleCodes));
}
