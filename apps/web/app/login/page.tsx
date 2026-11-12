import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionIdForNotice } from "@/lib/auth/session-cookie";
import { replacedAt, replacedNotice } from "@/lib/auth/session-limits";
import { AuthNotice } from "@/components/auth/auth-card";
import { AuthSlider } from "@/components/auth/auth-slider";
import { isLoginReason, LOGIN_NOTICES } from "@/lib/auth/messages";
import { postLoginPath, safeNextPath } from "@/lib/auth/redirects";
import { getSessionContext } from "@/lib/auth/session";
import { AUTH_MESSAGES, SIGNUP_CONTACT_EMAIL } from "@/lib/auth/messages";
import { ChangePasswordForm } from "./change-password-form";
import { GoogleSignIn } from "./google-sign-in";
import { googleSignInEnabled } from "@/lib/auth/google";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · EmeilSG" };

function param(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const reason = isLoginReason(params.reason) ? params.reason : null;

  const session = await getSessionContext();
  if (session.status === "active") redirect(postLoginPath(next, session.session.roleCodes));

  // Signed in with the emailed temporary password: this page asks for a new one before anything else.
  if (session.status === "password_change_required") {
    return (
      <AuthSlider
        heading="Choose a new password"
        notice={<AuthNotice tone="info">{AUTH_MESSAGES.temporaryPassword}</AuthNotice>}
        signIn={<ChangePasswordForm next={next} email={session.email} />}
        footer={
          <a
            href="/auth/signout"
            className="mt-4 inline-flex min-h-6 items-center self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign out
          </a>
        }
      />
    );
  }

  // A sign-in taken over by another device (migration 0055). The time comes from the database: either the
  // `at` the sign-out route or proxy looked up, or this browser's leftover cookie, looked up here.
  let replaced: string | null = null;
  if (reason === "replaced" || reason === "expired" || reason === null) {
    const stale = sessionIdForNotice((await cookies()).getAll());
    const at = (await replacedAt(stale)) ?? (reason === "replaced" ? param(params.at) : null);
    if (at || reason === "replaced") replaced = replacedNotice(at);
  }

  const notice = replaced
    ? { tone: "info" as const, message: replaced }
    : reason
      ? LOGIN_NOTICES[reason]
      : null;

  // Signed in elsewhere: name the device the callback found, as the password form does.
  const device = reason === "google_elsewhere" ? param(params.device)?.slice(0, 80) : null;
  const message =
    reason === "not_registered" ? (
      <>
        No sign-ups are allowed: that Google account isn&apos;t registered in EmeilSG. Kindly
        contact the admin at{" "}
        <a href={`mailto:${SIGNUP_CONTACT_EMAIL}`} className="font-medium underline">
          {SIGNUP_CONTACT_EMAIL}
        </a>
        .
      </>
    ) : device ? (
      `This account is signed in on ${device}. Continue with Google again to sign out there and sign in here.`
    ) : (
      notice?.message
    );

  return (
    <AuthSlider
      notice={notice ? <AuthNotice tone={notice.tone}>{message}</AuthNotice> : null}
      signIn={
        <>
          <LoginForm next={next} />
          {(await googleSignInEnabled()) ? (
            <GoogleSignIn next={next} takeover={reason === "google_elsewhere"} />
          ) : null}
        </>
      }
    />
  );
}
