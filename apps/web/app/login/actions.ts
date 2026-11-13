"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { mustChangePassword, ownPasswordMetadata } from "@/lib/auth/initial-password";
import { passwordMeetsPolicy, passwordPolicyMessage } from "@/lib/auth/password-policy";
import { postLoginPath, safeNextPath } from "@/lib/auth/redirects";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { resolveSession } from "@/lib/auth/session";
import { deviceLabel } from "@/lib/auth/device-label";
import { SIGN_IN_MARKER, sessionIdFromAccessToken, signedOutAt } from "@/lib/auth/session-cookie";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { startSession } from "@/lib/auth/session-limits";
import {
  bucket,
  clear,
  clientAddress,
  count,
  exceeded,
  rateLimits,
} from "@/lib/security/rate-limit";
import { appUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Another device holds a sign-in of this account: what the question on screen names. */
export type TakeoverQuestion = { device: string; lastActive: string | null };

export type SignInState = {
  error: string | null;
  email: string;
  takeover?: TakeoverQuestion | null;
};

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
  const { data, error } = await supabase.auth.signInWithPassword({
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

  // One sign-in per account (migration 0055). Asked only of an account that may sign in at all, so a
  // deactivated or unknown account gets its own message below, not the question.
  const [profile] = await db()<{ is_active: boolean }[]>`
    select is_active from public.users where id = ${data.user.id} and deleted_at is null`;
  const sessionId = sessionIdFromAccessToken(data.session.access_token);
  if (profile?.is_active && sessionId) {
    const requestHeaders = await headers();
    const ip = clientAddress(requestHeaders);
    const userAgent = requestHeaders.get("user-agent")?.slice(0, 512) ?? null;
    const started = await startSession({
      sessionId,
      userId: data.user.id,
      replace: formData.get("takeover") === "confirm",
      userAgent,
      ipAddress: ip === "unknown" ? null : ip,
    });
    if (started.outcome !== "started") {
      // The database has already revoked this sign-in; this clears the cookies too.
      await supabase.auth.signOut({ scope: "local" });
      if (started.outcome === "refused") return { error: AUTH_MESSAGES.retry, email };
      const latest = started.others[0];
      return {
        error: null,
        email,
        takeover: {
          device: deviceLabel(latest?.user_agent),
          lastActive: latest ? signedOutAt(new Date(latest.last_activity_at).toISOString()) : null,
        },
      };
    }
    // So this browser can be told why, should another device take this sign-in over later.
    (await cookies()).set(SIGN_IN_MARKER, sessionId, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  const result = await resolveSession(supabase);
  if (
    result.status === "password_change_required" ||
    result.status === "mfa_required" ||
    result.status === "mfa_enrollment_required"
  ) {
    const next = safeNextPath(parsed.data.next);
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  if (result.status !== "active") {
    await supabase.auth.signOut();
    return {
      error:
        result.status === "deactivated"
          ? AUTH_MESSAGES.deactivated
          : result.status === "unprovisioned"
            ? AUTH_MESSAGES.unprovisioned
            : AUTH_MESSAGES.retry,
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

/**
 * "Continue with Google" (owner's request, 2026-11-12): only for people an admin registered. Supabase sends
 * the person to Google and back to /auth/callback, which decides. `takeover` answers "signed in on another
 * device" the same way the password form does.
 */
export async function signInWithGoogle(formData: FormData) {
  const next = safeNextPath(String(formData.get("next") ?? "") || null);
  const takeover = formData.get("takeover") === "confirm";
  const callback = new URL("/auth/callback", appUrl());
  if (next) callback.searchParams.set("next", next);
  if (takeover) callback.searchParams.set("takeover", "1");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      // Lets someone with several Google accounts pick the registered one.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/login?reason=google_failed");
  redirect(data.url);
}
