"use server";

import { createHash, randomInt } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { passwordMeetsPolicy, passwordPolicyMessage } from "@/lib/auth/password-policy";
import { db } from "@/lib/db";
import { passwordResetOtpEmailHtml, sendEmail } from "@/lib/email/brevo";
import { bucket, clientAddress, count, exceeded, rateLimits } from "@/lib/security/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// OTP password reset (bulk-import-decisions.md), replacing Supabase Auth's own reset-link email for this
// flow only — invite / first-password-set (/reset-password via /auth/confirm) is untouched.
const OTP_EXPIRY_MINUTES = 10;

export type ResetRequestState =
  { status: "idle" } | { status: "sent"; email: string } | { status: "error"; message: string };

export async function requestPasswordReset(
  _previous: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const parsed = z.email().safeParse(
    String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
  );
  if (!parsed.success) return { status: "error", message: "Enter a valid email address." };
  const email = parsed.data;

  const limits = await rateLimits();
  const addressBucket = bucket("otp-request-address", clientAddress(await headers()));
  const accountBucket = bucket("otp-request-account", email);
  const limited =
    (await exceeded(addressBucket, limits.otp_requests_per_address, limits.otp_window_minutes)) ||
    (await exceeded(accountBucket, limits.otp_requests_per_account, limits.otp_window_minutes));
  if (limited) return { status: "error", message: AUTH_MESSAGES.otpRateLimited };
  await count(addressBucket);
  await count(accountBucket);

  // Never reveal whether the address exists — always report "sent" either way.
  const [user] = await db()<{ id: string; display_name: string }[]>`
    select id, display_name from public.users
    where lower(email) = ${email} and is_active and deleted_at is null`;
  if (user) {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const codeHash = createHash("sha256").update(code).digest("hex");
    await db().begin(async (tx) => {
      // A fresh request retires any code already outstanding for this account.
      await tx`delete from public.password_reset_otps where user_id = ${user.id} and consumed_at is null`;
      await tx`
        insert into public.password_reset_otps (user_id, code_hash, expires_at)
        values (${user.id}, ${codeHash}, now() + make_interval(mins => ${OTP_EXPIRY_MINUTES}))`;
    });
    await sendEmail({
      to: { email, name: user.display_name },
      subject: "Your TraceESG password reset code",
      html: passwordResetOtpEmailHtml({
        displayName: user.display_name,
        code,
        expiryMinutes: OTP_EXPIRY_MINUTES,
      }),
    });
  }

  return { status: "sent", email };
}

export type VerifyOtpState = { error: string | null };

export async function verifyOtpAndSetPassword(
  _previous: VerifyOtpState,
  formData: FormData,
): Promise<VerifyOtpState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const code = String(formData.get("code") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");

  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code." };
  if (!passwordMeetsPolicy(password)) return { error: passwordPolicyMessage(password) };
  if (password !== confirmation) return { error: "Passwords do not match." };

  // Address-level cap on guesses, distinct from the per-code attempt counter below (a bucket key of its
  // own, but the same request-limit numbers — no need for yet another config field).
  const limits = await rateLimits();
  const addressBucket = bucket("otp-verify-address", clientAddress(await headers()));
  if (await exceeded(addressBucket, limits.otp_requests_per_address, limits.otp_window_minutes)) {
    return { error: AUTH_MESSAGES.otpRateLimited };
  }
  await count(addressBucket);

  const [user] = await db()<{ id: string }[]>`
    select id from public.users where lower(email) = ${email} and is_active and deleted_at is null`;
  if (!user) return { error: AUTH_MESSAGES.otpInvalid };

  const [otp] = await db()<{ id: string; code_hash: string; expires_at: Date; attempts: number }[]>`
    select id, code_hash, expires_at, attempts from public.password_reset_otps
    where user_id = ${user.id} and consumed_at is null
    order by created_at desc limit 1`;
  if (!otp || otp.expires_at < new Date() || otp.attempts >= limits.otp_max_attempts) {
    return { error: AUTH_MESSAGES.otpInvalid };
  }
  if (createHash("sha256").update(code).digest("hex") !== otp.code_hash) {
    await db()`update public.password_reset_otps set attempts = attempts + 1 where id = ${otp.id}`;
    return { error: AUTH_MESSAGES.otpInvalid };
  }

  const auth = createSupabaseAdminClient().auth.admin;
  const { error: updateError } = await auth.updateUserById(user.id, { password });
  if (updateError) {
    return {
      error:
        updateError.code === "weak_password"
          ? passwordPolicyMessage(password)
          : AUTH_MESSAGES.retry,
    };
  }

  await db().begin(async (tx) => {
    await tx`update public.password_reset_otps set consumed_at = now() where id = ${otp.id}`;
    await writeAudit(tx, {
      eventType: "user.password_reset",
      entityType: "user",
      entityId: user.id,
      userId: null,
    });
  });

  redirect("/login?reason=password_set");
}
