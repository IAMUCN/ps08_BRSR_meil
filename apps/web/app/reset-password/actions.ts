"use server";

import { redirect } from "next/navigation";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { passwordMeetsPolicy, passwordPolicyMessage } from "@/lib/auth/password-policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SetPasswordState = { error: string | null };

export async function setPassword(
  _previous: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");

  if (!passwordMeetsPolicy(password)) return { error: passwordPolicyMessage(password) };
  if (password !== confirmation) return { error: "Passwords do not match." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?reason=link_invalid");

  // Supabase Auth enforces the same length/complexity rules server-side (supabase/config.toml).
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "weak_password") return { error: passwordPolicyMessage(password) };
    if (error.code === "same_password") {
      return { error: "Choose a password different from your current one." };
    }
    return { error: AUTH_MESSAGES.retry };
  }

  await supabase.auth.signOut();
  redirect("/login?reason=password_set");
}
