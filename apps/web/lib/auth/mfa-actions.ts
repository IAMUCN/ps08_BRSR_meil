"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { mfaEnforced } from "@/lib/auth/mfa";
import {
  COOKIE_MAX_AGE_SECONDS,
  MFA_EMAIL_COOKIE,
  MFA_EMAIL_WINDOW_MINUTES,
  currentEmailCode,
  emailCodeMatches,
  emailPassToken,
} from "@/lib/auth/mfa-email";
import { sessionIdFromAccessToken } from "@/lib/auth/session-cookie";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { mfaEmailCodeHtml, sendEmail } from "@/lib/email/brevo";
import { postLoginPath, safeNextPath } from "@/lib/auth/redirects";
import { requireAdminSession, resolveSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { bucket, clear, count, exceeded, rateLimits } from "@/lib/security/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const WRONG_CODE = "That code is not right. Check the app and try the newest code.";
const TRY_AGAIN = "Something went wrong. Please try again.";
const codeSchema = z.string().regex(/^\d{6}$/);

export type MfaState = { error: string | null };
export type Enrollment = { factorId: string; qrCode: string; secret: string };
export type EnrollResult = { ok: true; data: Enrollment } | { ok: false; error: string };

async function signedInUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Checks a six-digit code against the person's authenticator app; counts wrong ones per account. */
async function verifyCode(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  factorId: string,
  rawCode: string,
): Promise<string | null> {
  const code = codeSchema.safeParse(rawCode.replace(/\s+/g, ""));
  if (!code.success) return "Enter the 6-digit code from your authenticator app.";
  const limits = await rateLimits();
  const attempts = bucket("mfa-account", userId);
  if (await exceeded(attempts, limits.login_failures_per_account, limits.login_window_minutes)) {
    return "Too many wrong codes. Wait a few minutes and try again.";
  }
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.data });
  if (error) {
    await count(attempts);
    return WRONG_CODE;
  }
  await clear(attempts);
  return null;
}

/** Sign-in, step two: the code from the authenticator app. */
export async function verifyMfaCode(_previous: MfaState, formData: FormData): Promise<MfaState> {
  const next = safeNextPath(String(formData.get("next") ?? "") || null);
  const { supabase, user } = await signedInUser();
  if (!user) redirect("/login?reason=expired");
  const factor = (user.factors ?? []).find(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  if (!factor) redirect("/login");
  const error = await verifyCode(supabase, user.id, factor.id, String(formData.get("code") ?? ""));
  if (error) return { error };
  const result = await resolveSession(supabase);
  if (result.status !== "active") redirect("/login");
  redirect(postLoginPath(next, result.session.roleCodes));
}

/** Starts setting up an authenticator app: a QR code and the same secret as text. */
export async function startMfaEnrollment(): Promise<EnrollResult> {
  const { supabase, user } = await signedInUser();
  if (!user) return { ok: false, error: "Your sign-in has ended. Sign in again." };
  if ((user.factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified")) {
    return { ok: false, error: "An authenticator app is already set up for this account." };
  }
  // A setup that was started and never finished would otherwise pile up.
  for (const f of user.factors ?? []) {
    if (f.factor_type === "totp" && f.status !== "verified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "EmeilSG",
    friendlyName: `EmeilSG ${Date.now()}`,
  });
  if (error || !data) {
    return {
      ok: false,
      error:
        error?.code === "mfa_totp_enroll_not_enabled"
          ? "Authenticator apps are not switched on for this project yet. Ask the administrator."
          : TRY_AGAIN,
    };
  }
  return {
    ok: true,
    data: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret },
  };
}

/** Finishes setup with the first code from the app. On the sign-in page it then continues into the app. */
export async function confirmMfaEnrollment(
  _previous: MfaState,
  formData: FormData,
): Promise<MfaState> {
  const next = safeNextPath(String(formData.get("next") ?? "") || null);
  const factorId = String(formData.get("factorId") ?? "");
  const { supabase, user } = await signedInUser();
  if (!user) redirect("/login?reason=expired");
  if (!factorId) return { error: TRY_AGAIN };
  const error = await verifyCode(supabase, user.id, factorId, String(formData.get("code") ?? ""));
  if (error) return { error };
  await db().begin((tx) =>
    writeAudit(tx, {
      eventType: "auth.mfa_enrolled",
      entityType: "user",
      entityId: user.id,
      userId: user.id,
    }),
  );
  const result = await resolveSession(supabase);
  if (result.status !== "active") redirect("/login");
  redirect(postLoginPath(next, result.session.roleCodes));
}

/** Profile: finishes setup without leaving the page. */
export async function confirmMfaFromProfile(
  factorId: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await signedInUser();
  if (!user) return { ok: false, error: "Your sign-in has ended. Sign in again." };
  const error = await verifyCode(supabase, user.id, factorId, code);
  if (error) return { ok: false, error };
  await db().begin((tx) =>
    writeAudit(tx, {
      eventType: "auth.mfa_enrolled",
      entityType: "user",
      entityId: user.id,
      userId: user.id,
    }),
  );
  return { ok: true };
}

/** Profile: turns the authenticator app off. Needs a current code, and is refused where it is required. */
export async function disableMfa(
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (mfaEnforced()) {
    return {
      ok: false,
      error: "Your organization requires an authenticator app, so it cannot be turned off.",
    };
  }
  const { supabase, user } = await signedInUser();
  if (!user) return { ok: false, error: "Your sign-in has ended. Sign in again." };
  const factor = (user.factors ?? []).find(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  if (!factor) return { ok: true };
  const error = await verifyCode(supabase, user.id, factor.id, code);
  if (error) return { ok: false, error };
  const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  if (unenrollError) return { ok: false, error: TRY_AGAIN };
  await db().begin((tx) =>
    writeAudit(tx, {
      eventType: "auth.mfa_disabled",
      entityType: "user",
      entityId: user.id,
      userId: user.id,
    }),
  );
  return { ok: true };
}

/** Super Admin: removes a person's authenticator app (lost phone). They set up a new one at next sign-in. */
export async function resetUserMfa(
  userId: string,
): Promise<{ ok: true; removed: number } | { ok: false; error: string }> {
  const session = await requireAdminSession();
  if (!z.uuid().safeParse(userId).success) return { ok: false, error: TRY_AGAIN };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) return { ok: false, error: TRY_AGAIN };
  let removed = 0;
  for (const factor of data.factors) {
    const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId,
    });
    if (deleteError) return { ok: false, error: TRY_AGAIN };
    removed++;
  }
  await db().begin((tx) =>
    writeAudit(tx, {
      eventType: "auth.mfa_reset",
      entityType: "user",
      entityId: userId,
      userId: session.userId,
      newValue: { removed },
    }),
  );
  return { ok: true, removed };
}

async function signInIdentity() {
  const { supabase, user } = await signedInUser();
  if (!user) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const sessionId = sessionIdFromAccessToken(session?.access_token);
  return sessionId ? { supabase, user, sessionId } : null;
}

function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 2)}${"*".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

/** "Try another way": emails a 6-digit code to the account's own address. */
export async function sendMfaEmailCode(): Promise<
  { ok: true; sentTo: string } | { ok: false; error: string }
> {
  const who = await signInIdentity();
  if (!who?.user.email) return { ok: false, error: "Your sign-in has ended. Sign in again." };
  // Only for someone already asked for a code; a session with no authenticator app has nothing to replace.
  const asked = (who.user.factors ?? []).some(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  if (!asked) return { ok: false, error: TRY_AGAIN };
  const sends = bucket("mfa-email-send", who.user.id);
  if (await exceeded(sends, 5, 15)) {
    return { ok: false, error: "Too many codes were sent. Wait a few minutes and try again." };
  }
  await count(sends);
  const [profile] = await db()<{ display_name: string }[]>`
    select display_name from public.users where id = ${who.user.id}`;
  const sent = await sendEmail({
    to: { email: who.user.email, name: profile?.display_name ?? who.user.email },
    subject: "Your EmeilSG sign-in code",
    html: mfaEmailCodeHtml({
      displayName: profile?.display_name ?? "there",
      code: currentEmailCode(who.user.id, who.sessionId),
      expiryMinutes: MFA_EMAIL_WINDOW_MINUTES,
    }),
  });
  if (!sent.sent) return { ok: false, error: "The email could not be sent. Please try again." };
  return { ok: true, sentTo: maskEmail(who.user.email) };
}

/** "Try another way", step two: the code from the email. */
export async function verifyMfaEmailCode(
  _previous: MfaState,
  formData: FormData,
): Promise<MfaState> {
  const next = safeNextPath(String(formData.get("next") ?? "") || null);
  const who = await signInIdentity();
  if (!who) redirect("/login?reason=expired");
  const code = codeSchema.safeParse(String(formData.get("code") ?? "").replace(/\s+/g, ""));
  if (!code.success) return { error: "Enter the 6-digit code from the email." };
  const limits = await rateLimits();
  const attempts = bucket("mfa-account", who.user.id);
  if (await exceeded(attempts, limits.login_failures_per_account, limits.login_window_minutes)) {
    return { error: "Too many wrong codes. Wait a few minutes and try again." };
  }
  if (!emailCodeMatches(who.user.id, who.sessionId, code.data)) {
    await count(attempts);
    return { error: "That code is not right or has expired. Send a new one and try again." };
  }
  await clear(attempts);
  (await cookies()).set(MFA_EMAIL_COOKIE, emailPassToken(who.user.id, who.sessionId), {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  await db().begin((tx) =>
    writeAudit(tx, {
      eventType: "auth.mfa_email_code_used",
      entityType: "user",
      entityId: who.user.id,
      userId: who.user.id,
    }),
  );
  const result = await resolveSession(who.supabase);
  if (result.status !== "active") redirect("/login");
  redirect(postLoginPath(next, result.session.roleCodes));
}
