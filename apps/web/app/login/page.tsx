import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, AuthNotice } from "@/components/auth/auth-card";
import { isLoginReason, LOGIN_NOTICES } from "@/lib/auth/messages";
import { postLoginPath, safeNextPath } from "@/lib/auth/redirects";
import { getSessionContext } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · TraceESG" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const reason = isLoginReason(params.reason) ? params.reason : null;

  const session = await getSessionContext();
  if (session.status === "active") redirect(postLoginPath(next, session.session.roleCodes));

  const notice = reason ? LOGIN_NOTICES[reason] : null;

  return (
    <AuthCard title="Sign in">
      {notice ? <AuthNotice tone={notice.tone}>{notice.message}</AuthNotice> : null}
      <LoginForm next={next} />
      <p className="mt-4 text-sm leading-5">
        <Link
          href="/forgot-password"
          className="font-medium text-primary-text underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
      </p>
    </AuthCard>
  );
}
