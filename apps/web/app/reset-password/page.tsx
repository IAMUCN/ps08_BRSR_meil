import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Set password · TraceESG" };

// Reached only via /auth/confirm after a valid invite or recovery link established a session.
export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?reason=link_invalid");

  return (
    <AuthCard title="Set your password" description={`For ${user.email ?? "your account"}`}>
      <SetPasswordForm />
    </AuthCard>
  );
}
