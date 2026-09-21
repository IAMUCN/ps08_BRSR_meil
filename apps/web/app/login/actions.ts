"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { postLoginPath } from "@/lib/auth/redirects";
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
