import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthNotice } from "@/components/auth/auth-card";
import { AuthSlider } from "@/components/auth/auth-slider";
import { isLoginReason, LOGIN_NOTICES } from "@/lib/auth/messages";
import { postLoginPath, safeNextPath } from "@/lib/auth/redirects";
import { getSessionContext } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · EmeilSG" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const reason = isLoginReason(params.reason) ? params.reason : null;

  const session = await getSessionContext();
  if (session.status === "active") redirect(postLoginPath(next, session.session.roleCodes));

  const notice = reason ? LOGIN_NOTICES[reason] : null;

  return (
    <AuthSlider
      notice={notice ? <AuthNotice tone={notice.tone}>{notice.message}</AuthNotice> : null}
      signIn={<LoginForm next={next} />}
    />
  );
}
