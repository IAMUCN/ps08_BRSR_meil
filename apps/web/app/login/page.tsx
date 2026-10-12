import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthNotice } from "@/components/auth/auth-card";
import { AuthSlider } from "@/components/auth/auth-slider";
import { isLoginReason, LOGIN_NOTICES } from "@/lib/auth/messages";
import { postLoginPath, safeNextPath } from "@/lib/auth/redirects";
import { getSessionContext } from "@/lib/auth/session";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { ChangePasswordForm } from "./change-password-form";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · EmeilSG" };

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

  const notice = reason ? LOGIN_NOTICES[reason] : null;

  return (
    <AuthSlider
      notice={notice ? <AuthNotice tone={notice.tone}>{notice.message}</AuthNotice> : null}
      signIn={<LoginForm next={next} />}
    />
  );
}
